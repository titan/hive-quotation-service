import { Server, ServerContext, ServerFunction, CmdPacket, Permission, msgpack_decode_async as msgpack_decode, msgpack_encode_async as msgpack_encode, rpc, waitingAsync } from "hive-service";
import * as bunyan from "bunyan";
import * as uuid from "uuid";
import * as bluebird from "bluebird";
import { RedisClient, Multi } from "redis";
import { verify, uuidVerifier, stringVerifier, numberVerifier } from "hive-verify";
import { getReferencePrice, getAccuratePrice, QuotePrice, Coverage, Option } from "ztyq-library";

const log = bunyan.createLogger({
  name: "quotation-server",
  streams: [
    {
      level: "info",
      path: "/var/log/quotation-server-info.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1d",   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: "error",
      path: "/var/log/quotation-server-error.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1w",   // daily rotation
      count: 3        // keep 7 back copies
    }
  ]
});

const allowAll: Permission[] = [["mobile", true], ["admin", true]];
const mobileOnly: Permission[] = [["mobile", true], ["admin", false]];
const adminOnly: Permission[] = [["mobile", false], ["admin", true]];

export const server = new Server();

// qid 手动报价不传
server.callAsync("createQuotation", allowAll, "创建报价", "创建报价", async (ctx: ServerContext,
  vid: string,
  qid?: string) => {
  log.info(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}`);
  try {
    await verify([uuidVerifier("vid", vid)]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }
  qid = qid ? qid : uuid.v1();
  const state: number = 1;
  const pkt: CmdPacket = { cmd: "createQuotation", args: [qid, vid, state, qid] };
  ctx.publish(pkt);
  return await waitingAsync(ctx);
});

server.callAsync("getQuotation", allowAll, "获取一个报价", "获取一个报价", async (ctx: ServerContext,
  qid: string) => {
  log.info(`getQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}`);
  try {
    await verify([
      uuidVerifier("qid", qid)
    ]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }
  try {
    const qpkt = await ctx.cache.hgetAsync("quotation-entities", qid);
    if (qpkt) {
      const quotation = await msgpack_decode(qpkt);
      return { code: 200, data: quotation };
    } else {
      log.error(`getQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, msg: 报价未找到`);
      return { code: 404, msg: "报价未找到" };
    }
  } catch (err) {
    ctx.report(3, err);
    log.error(`getQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}`, err);
    return { code: 500, msg: err.message };
  }
});

function quotation_cmp(a: {}, b: {}): number {
  if (a["created_at"] < b["created_at"]) {
    return 1;
  } else if (a["created_at"] > b["created_at"]) {
    return -1;
  } else {
    return 0;
  }
}

server.callAsync("getLastQuotationByVid", allowAll, "根据vid获取最后一次报价", "根据vid获取最后一次报价", async (ctx: ServerContext,
  vid: string) => {
  log.info(`getLastQuotationByVid, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}`);
  try {
    await verify([uuidVerifier("vid", vid)]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }
  try {
    const pkt = await ctx.cache.hgetAsync("vid-qids", vid);
    if (pkt) {
      const qids: string[] = await msgpack_decode(pkt) as string[];
      if (qids.length > 0) {
        const multi = bluebird.promisifyAll(ctx.cache.multi()) as Multi;
        for (const qid of qids) {
          multi.hget("quotation-entities", qid);
        }
        const qpkts = await multi.execAsync();
        const quotations = await Promise.all(qpkts.filter(x => x && x.length > 0).map(x => msgpack_decode(x)));
        const sorted = quotations.sort(quotation_cmp);
        return { code: 200, data: sorted[0] };
      } else {
        log.error(`getLastQuotationByVid, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}`);
        return { code: 404, msg: "报价未找到" };
      }
    } else {
      log.error(`getLastQuotationByVid, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}`);
      return { code: 404, msg: "报价未找到" };
    }
  } catch (e) {
    log.error(e);
    return { code: 500, msg: "获取最后一次报价失败" };
  }
});

server.callAsync("refresh", adminOnly, "refresh", "refresh", async (ctx: ServerContext,
  qid?: string) => {
  log.info(`refresh, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}`);
  try {
    await verify([
      uuidVerifier("qid", qid)
    ]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }
  const pkt: CmdPacket = { cmd: "refresh", args: qid ? [qid] : [] };
  ctx.publish(pkt);
  return await waitingAsync(ctx);
});

server.callAsync("getReferenceQuotation", allowAll, "获得参考报价", "获得参考报价", async (ctx: ServerContext,
  vid: string,
  cityCode: string,
  insurerCode: string) => {
  log.info(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid},  insurerCode: ${insurerCode}, cityCode: ${cityCode}`);
  try {
    await verify([
      stringVerifier("vid", vid),
      stringVerifier("insurerCode", insurerCode),
      stringVerifier("cityCode", cityCode)
    ]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }

  try {
    const vehicle_result = await rpc<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "getVehicle", vid);
    if (vehicle_result["code"] === 200) {
      const vehicle_and_models = vehicle_result["data"];
      const license_no: string = vehicle_and_models["license_no"];
      const two_dates_buff: Buffer = await ctx.cache.hgetAsync("license-two-dates", license_no);
      if (two_dates_buff) {
        const two_dates = await msgpack_decode(two_dates_buff);
        const begindate = new Date(two_dates["ciBeginDate"]);
        if (begindate.getTime() > new Date().getTime()) {
          return {
            code: 200,
            data: two_dates
          };
        }
      }
      let responseNo: string = null;
      const response_no_result = await rpc<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "fetchVehicleAndModelsByLicense", license_no);
      if (response_no_result["code"] === 200) {
        responseNo = response_no_result["data"]["response_no"];
      } else {
        log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid},  insurerCode: ${insurerCode}, cityCode: ${cityCode}, msg: 获取响应码失败`);
        return {
          code: 500,
          msg: "获取响应码失败"
        };
      }
      const frameNo: string = vehicle_and_models["vin"];
      const modelCode: string = vehicle_code2uuid(vehicle_and_models["model"]["vehicle_code"]);
      const engineNo: string = vehicle_and_models["engine_no"];
      const isTrans: string = "0";
      const transDate: string = null;
      const registerDate: string = vehicle_and_models["register_date"];
      const ownerName: string = vehicle_and_models["owner"]["name"];
      const ownerID: string = vehicle_and_models["owner"]["identity_no"];
      const ownerMobile: string = vehicle_and_models["insured"]["phone"];
      const ref_coverageList = [
        {
          "coverageCode": "A",
          "coverageName": "机动车损失保险",
          "insuredAmount": "Y",
          "insuredPremium": null, // "1323.7600",
          "flag": null
        }];
      const options: Option = {
        log: log
      };
      try {
        const ztyq_result = await getReferencePrice(cityCode, responseNo, license_no, frameNo, modelCode, engineNo, isTrans, transDate, registerDate, ownerName, ownerID, ownerMobile, insurerCode, ref_coverageList, options);
        const ref_biBeginDate = new Date(ztyq_result["data"]["biBeginDate"]);
        const two_dates: Object = {
          "biBeginDate": ztyq_result["data"]["biBeginDate"],
          "ciBeginDate": ztyq_result["data"]["ciBeginDate"]
        };
        const two_dates_buff = await msgpack_encode(two_dates);
        await ctx.cache.hsetAsync("license-two-dates", license_no, two_dates_buff);
        const today = new Date();
        const diff_ms: number = ref_biBeginDate.valueOf() - today.valueOf();
        if (Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) > 90 || Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) < 2) {
          log.error(`getReferenceQuotation, vid: ${vid},  insurerCode: ${insurerCode}, cityCode: ${cityCode}, msg: 商业险起保日期距今超过90天`);
          return {
            code: 500,
            msg: "商业险起保日期距今超过90天"
          };
        } else {
          log.info(ztyq_result["data"]["biBeginDate"]);
          return {
            code: 200,
            data: two_dates
          };
        }
      } catch (err) {
        const ref_requestData = JSON.stringify({
          vid: vid,
          insurerCode: insurerCode,
          cityCode: cityCode
        });
        ctx.report(3, err);
        if (err.code === 408) {
          log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid},  insurerCode: ${insurerCode}, cityCode: ${cityCode}, error: 智通接口超时`);
          await ctx.cache.lpushAsync("external-module-exceptions", JSON.stringify({ "occurred-at": new Date(), "source": "ztwhtech.com", "request": ref_requestData, "response": "Timeout" }));
          return {
            code: 504,
            msg: "智通接口超时"
          };
        } else {
          log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid},  insurerCode: ${insurerCode}, cityCode: ${cityCode}`, err);
          await ctx.cache.lpushAsync("external-module-exceptions", JSON.stringify({ "occurred-at": new Date(), "source": "ztwhtech.com", "request": ref_requestData, "response": err.message }));
          return {
            code: 500,
            msg: "获取参考报价失败"
          };
        }
      }
    } else {
      log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid},  insurerCode: ${insurerCode}, cityCode: ${cityCode}, msg: 获取车辆信息失败`);
      return {
        code: 500,
        msg: "获取车辆信息失败"
      };
    }
  } catch (err) {
    ctx.report(3, err);
    log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid:${ctx.uid} , vid: ${vid},  insurerCode: ${insurerCode}, cityCode: ${cityCode}`, err);
    return {
      code: 500,
      msg: "获取参考报价失败"
    };
  }
});

async function requestAccurateQuotation(ctx: ServerContext,
  thpBizID: string,
  cityCode: string,
  responseNo: string,
  biBeginDate: string,
  ciBeginDate: string,
  licenseNo: string,
  frameNo: string,
  modelCode: string,
  engineNo: string,
  isTrans: string,
  transDate: string,
  registerDate: string,
  ownerName: string,
  ownerID: string,
  ownerMobile: string,
  insuredName: string,
  insuredID: string,
  insuredMobile: string,
  insurerCode: string,
  vid: string): Promise<any> {
  const coverages = [
    {
      "coverageCode": "A",
      "coverageName": "机动车损失保险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    },
    {
      "coverageCode": "B",
      "coverageName": "商业第三者责任险",
      "insuredAmount": "300000",
      "insuredPremium": null,
      "flag": null
    },
    {
      "coverageCode": "F",
      "coverageName": "玻璃单独破碎险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    },
    {
      "coverageCode": "FORCEPREMIUM",
      "coverageName": "交强险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    },
    {
      "coverageCode": "G1",
      "coverageName": "全车盗抢险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    },
    {
      "coverageCode": "X1",
      "coverageName": "发动机涉水损失险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    },
    {
      "coverageCode": "Z",
      "coverageName": "自燃损失险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    },
    {
      "coverageCode": "Z3",
      "coverageName": "机动车损失保险无法找到第三方特约险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    }];
  try {
    const options: Option = { log: log };
    const ztyq_result = await getAccuratePrice(thpBizID, cityCode, responseNo, biBeginDate, ciBeginDate, licenseNo, frameNo, modelCode, engineNo, isTrans, transDate, registerDate, ownerName, ownerID, ownerMobile, insuredName, insuredID, insuredMobile, insurerCode, coverages, options);
    if (ztyq_result["data"] && ztyq_result["data"]["coverageList"]) {
      const insurance_due_date = ztyq_result["data"]["ciBeginDate"];
      const due_date_resutl = await rpc<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "setInsuranceDueDate", vid, insurance_due_date);
      if (due_date_resutl["code"] === 200) {
        await ctx.cache.setexAsync(`zt-quotation:${vid}`, 2592000, JSON.stringify(ztyq_result["data"])); // 自动报价有效期一个月
        return {
          err: null,
          data: ztyq_result["data"]
        };
      } else {
        const e: Error = new Error();
        e.name = due_date_resutl["code"];
        e.message = "设置保险到期日期失败";
        return {
          err: e,
          data: null
        };
      }
    }
  } catch (err) {
    if (err.code === 408) {
      const e: Error = new Error();
      e.name = "504";
      e.message = "智通接口超时";
      return {
        err: e,
        data: null
      };
    } else {
      const e: Error = new Error();
      e.name = "500";
      e.message = err["message"];
      return {
        err: e,
        data: null
      };
    }
  }
}

function calculate_premium(vehicle_and_models,
  data) {
  const origin_coverages = data["coverageList"];
  const modified_coverages = origin_coverages.reduce((acc, coverage) => {
    acc[coverage["coverageCode"]] = coverage;
    return acc;
  }, {});

  const A_fee: number = Number(modified_coverages["A"]["insuredPremium"]) * 1.15 * 0.65;
  const B_fee: number = Number(modified_coverages["B"]["insuredPremium"]);
  const F_fee: number = Number(modified_coverages["F"]["insuredPremium"]) * 0.65;
  const FORCEPREMIUM_fee: number = Number(modified_coverages["FORCEPREMIUM"]["insuredPremium"]);
  const G1_fee: number = Number(modified_coverages["G1"]["insuredPremium"]) * 1.2 * 0.65;
  const X1_fee: number = Number(modified_coverages["X1"]["insuredPremium"]) * 1.15 * 0.65;
  const Z_fee: number = Number(modified_coverages["Z"]["insuredPremium"]) * 1.2 * 0.65;
  const Z3_fee: number = Number(modified_coverages["Z3"]["insuredPremium"]) * 0.65;

  const B_insured_amount_list: string[] = ["5万", "10万", "15万", "20万", "30万", "50万", "100万"]; // , "150万", "200万", "300万", "500万"];

  const D_of_Amount_seat: number[][] = [
    [394.55, 570.05, 649.35, 706.55, 796.90, 956.80, 1246.05], // 1430.37, 1589.19, 1897.30, 2494.46],
    [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96],
    [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96]
  ];

  const B: number = B_fee / 796.9;

  let seat = Number(vehicle_and_models["model"]["seat"]);
  if (seat < 6) {
    seat = 0;
  } else if (seat >= 6 && seat <= 10) {
    seat = 1;
  } else {
    seat = 2;
  }

  const E_list = [];

  const B_fee_list = {};
  for (let i = 0; i < D_of_Amount_seat[seat].length; i++) {
    E_list[i] = D_of_Amount_seat[seat][i] * B;
    B_fee_list[B_insured_amount_list[i]] = E_list[i].toFixed(2);
  }

  modified_coverages["A"]["modifiedPremium"] = A_fee.toFixed(2);
  modified_coverages["A"]["insuredPremium"] = (Number(modified_coverages["A"]["insuredPremium"]) * 1.15).toFixed(2);
  modified_coverages["B"]["insuredPremium"] = B_fee_list;
  modified_coverages["B"]["modifiedPremium"] = B_fee_list;
  modified_coverages["F"]["modifiedPremium"] = F_fee.toFixed(2);
  modified_coverages["FORCEPREMIUM"]["modifiedPremium"] = FORCEPREMIUM_fee.toFixed(2);
  modified_coverages["G1"]["modifiedPremium"] = G1_fee.toFixed(2);
  modified_coverages["G1"]["insuredPremium"] = (Number(modified_coverages["G1"]["insuredPremium"]) * 1.2).toFixed(2);
  modified_coverages["X1"]["modifiedPremium"] = X1_fee.toFixed(2);
  modified_coverages["X1"]["insuredPremium"] = (Number(modified_coverages["X1"]["insuredPremium"]) * 1.15).toFixed(2);
  modified_coverages["Z"]["modifiedPremium"] = Z_fee.toFixed(2);
  modified_coverages["Z"]["insuredPremium"] = (Number(modified_coverages["Z"]["insuredPremium"]) * 1.2).toFixed(2);
  modified_coverages["Z3"]["modifiedPremium"] = Z3_fee.toFixed(2);
  const registerDate = vehicle_and_models["register_date"];
  const today = new Date();

  const diff_ms: number = today.valueOf() - registerDate.valueOf();
  const past_two_years: number = (Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) > 365 * 2) ? 1 : 0;

  const newCarPrice = Number(vehicle_and_models["model"]["purchase_price"]);
  let index_of_newCarPrice: number;
  if (newCarPrice < 100000) {
    index_of_newCarPrice = 0;
  } else if (newCarPrice >= 100000 && newCarPrice <= 200000) {
    index_of_newCarPrice = 1;
  } else if (newCarPrice > 200000 && newCarPrice <= 300000) {
    index_of_newCarPrice = 2;
  } else if (newCarPrice > 300000 && newCarPrice <= 500000) {
    index_of_newCarPrice = 3;
  } else {
    index_of_newCarPrice = 4;
  }
  // 10万以下	10（含）-20万（含）	20-30万（含）	30-50万（含）	50万以上

  const three_parts_price_table = [
    [202, 214, 249, 451, 742],
    [308, 326, 380, 694, 960]
  ];

  const six_parts_price_table = [
    [303, 320, 374, 632, 1186],
    [446, 472, 551, 972, 1535]
  ];

  modified_coverages["Scratch"] = {
    "coverageCode": "Scratch",
    "coverageName": "车身划痕损失",
    "insuredAmount": "",
    "insuredPremium": {
      "3块漆": three_parts_price_table[past_two_years][index_of_newCarPrice].toString(),
      "6块漆": six_parts_price_table[past_two_years][index_of_newCarPrice].toString()
    },
    "flag": null,
    "modifiedPremium": {
      "3块漆": three_parts_price_table[past_two_years][index_of_newCarPrice].toString(),
      "6块漆": six_parts_price_table[past_two_years][index_of_newCarPrice].toString()
    }
  };

  data["coverageList"] = modified_coverages;
  data["purchase_price"] = vehicle_and_models["model"]["purchase_price"];
  return { data, diff_ms };
}

async function handleAccurateQuotation(ctx,
  vehicle_and_models,
  _data,
  qid,
  created_qid) {
  const { data, diff_ms } = calculate_premium(vehicle_and_models, _data);

  const age_price = (1 - (Math.ceil(diff_ms / (1000 * 60 * 60 * 24 * 30)) * 0.006)) * Number(data["purchase_price"]);
  const age_price_limit = Number(data["purchase_price"]) * 0.2;

  try {
    if (created_qid) {
      if (age_price < age_price_limit) {
        data["real_value"] = age_price_limit.toFixed(2);
      } else {
        data["real_value"] = age_price.toFixed(2);
      }
      const cbflag = uuid.v1();
      const pkt: CmdPacket = { cmd: "saveQuotation", args: [data, 3, cbflag] };
      ctx.publish(pkt);
      return await waitingAsync(ctx);
    } else {
      const vid: string = vehicle_and_models["id"];
      const qrep = await rpc<Object>(ctx.domain, process.env["QUOTATION"], ctx.uid, "createQuotation", vid, qid);
      if (qrep["code"] === 200) {
        // log.info("!!! Got qid: " + qrep["data"]["qid"]);
        // data["thpBizID"] = qrep["data"]["qid"];
        if (age_price < age_price_limit) {
          data["real_value"] = age_price_limit.toFixed(2);
        } else {
          data["real_value"] = age_price.toFixed(2);
        }
        const pkt: CmdPacket = { cmd: "saveQuotation", args: [data, 3] };
        ctx.publish(pkt);
        return await waitingAsync(ctx);
      } else {
        log.error(`handleAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, msg: 创建报价失败`);
        return {
          code: 500,
          msg: "创建报价失败"
        };
      }
    }
  } catch (err) {
    log.error(`handleAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}`, err);
    ctx.report(3, err);
    return {
      code: 500,
      msg: "处理报价信息失败"
    };
  }
}

server.callAsync("getAccurateQuotation", allowAll, "获得精准报价", "获得精准报价", async (ctx: ServerContext,
  vid: string,
  cityCode: string,
  insurerCode: string) => {
  log.info(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}`);
  try {
    await verify([
      stringVerifier("vid", vid)
    ]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }
  try {
    const vehicle_result = await rpc<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "getVehicle", vid);
    if (vehicle_result["code"] === 200) {
      const vehicle_and_models = vehicle_result["data"];
      // TODO 一个月内已经报过价
      const exist_quotation_buff: Buffer = await ctx.cache.getAsync(`zt-quotation:${vid}`);
      if (exist_quotation_buff) {
        // 一个月内已经报过价
        const quotation = msgpack_decode(exist_quotation_buff);
        const thpBizID: string = quotation["thpBizID"]; // 此处生成自动报价的　quotation id, 即 qid
        return await handleAccurateQuotation(ctx, vehicle_and_models, quotation, thpBizID, true);
      } else {
        // 一个月内未报过价
        const license_no: string = vehicle_and_models["license_no"];
        const two_dates_buff = await ctx.cache.hgetAsync("license-two-dates", license_no);
        if (two_dates_buff) {
          const two_dates = await msgpack_decode(two_dates_buff);
          const thpBizID: string = uuid.v1(); // 此处生成自动报价的　quotation id, 即 qid
          let responseNo: string = null;
          const response_no_result = await rpc<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "fetchVehicleAndModelsByLicense", license_no);
          if (response_no_result["code"] === 200) {
            responseNo = response_no_result["data"]["response_no"];
          } else {
            log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}, msg: 获取响应码失败`);
            return {
              code: 500,
              msg: "获取响应码失败"
            };
          }
          const biBeginDate: string = two_dates["biBeginDate"];
          const ciBeginDate: string = two_dates["ciBeginDate"];
          const licenseNo: string = vehicle_and_models["license_no"];
          const frameNo: string = vehicle_and_models["vin"];
          const modelCode: string = vehicle_code2uuid(vehicle_and_models["model"]["vehicle_code"]);
          const engineNo: string = vehicle_and_models["engine_no"];
          const isTrans: string = "0"; // 0 否,1 是, 过户车不走自动报价
          const transDate: string = null;
          const registerDate: string = vehicle_and_models["register_date"];

          const ownerName: string = vehicle_and_models["owner"]["name"];
          const ownerID: string = vehicle_and_models["owner"]["identity_no"];
          const ownerMobile: string = vehicle_and_models["insured"]["phone"]; // 这是业务约定
          const insuredName: string = vehicle_and_models["insured"]["name"];
          const insuredID: string = vehicle_and_models["insured"]["identity_no"];
          const insuredMobile: string = vehicle_and_models["insured"]["phone"];

          const raqr = await requestAccurateQuotation(ctx, thpBizID, cityCode, responseNo, biBeginDate, ciBeginDate, licenseNo, frameNo, modelCode, engineNo, isTrans, transDate, registerDate, ownerName, ownerID, ownerMobile, insuredName, insuredID, insuredMobile, insurerCode, vid);
          if (raqr.err) {

            // TODEL
            //            log.error(raqr.err);
            //
            //            const regex = /^.*\[\d{0,8}-(\d{0,8})\].*$/g;
            //            const regarr = regex.exec(raqr.err.message);
            //            if (regarr && regarr.length === 2) {
            //              const datestr = regarr[1];
            //              const year = datestr.substring(0, 4);
            //              const month = datestr.substring(4, 6);
            //              const day = datestr.substring(6, 8);
            //              const newdate = new Date(new Date(`${year}-${month}-${day}`).getTime() + 86400000);
            //              const newdatestr = newdate.toISOString().substring(0, 10);
            //              const raqr2 = await requestAccurateQuotation(ctx, thpBizID, cityCode, responseNo, newdatestr, newdatestr, licenseNo, frameNo, modelCode, engineNo, isTrans, transDate, registerDate, ownerName, ownerID, ownerMobile, insuredName, insuredID, insuredMobile, insurerCode, vid);
            //              if (raqr2.err) {
            //                const data = {
            //                  vid: vid,
            //                  insurerCode: insurerCode,
            //                  cityCode: cityCode
            //                };
            //                log.error(raqr2.err);
            //                if (raqr2.err.name === "504") {
            //                  log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}, msg: 访问智通超时`);
            //                  await ctx.cache.lpushAsync("external-module-exceptions", JSON.stringify({ "occurred-at": new Date(), "source": "ztwhtech.com", "request": data, "response": "Timeout" }));
            //                  return {
            //                    code: 504,
            //                    msg: "访问智通超时"
            //                  };
            //                } else {
            //                  log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}`, raqr2.err);
            //                  await ctx.cache.lpushAsync("external-module-exceptions", JSON.stringify({ "occurred-at": new Date(), "source": "ztwhtech.com", "request": data, "response": raqr2.err.message }));
            //                  return {
            //                    code: 500,
            //                    msg: "获取精准报价失败"
            //                  };
            //                }
            //              } else {
            //                return await handleAccurateQuotation(ctx, vehicle_and_models, raqr2.data, thpBizID, false);
            //              }
            //            } else {
            //              log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}`, raqr.err);
            //              return {
            //                code: 500,
            //                msg: "获取精准报价失败"
            //              };
            //            }


            return {
              code: 500,
              msg: "获取精准报价失败"
            };
          } else {
            return await handleAccurateQuotation(ctx, vehicle_and_models, raqr.datas, thpBizID, false);
          }
        } else {
          log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}, msg: "Not found biBeginDate & ciBeginDate in redis!"`);
          return {
            code: 404,
            msg: "Not found biBeginDate & ciBeginDate in redis!"
          };
        }
      }
    } else {
      log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}, msg: 获取车辆和车型信息失败`);
      return {
        code: 400,
        msg: "获取车辆和车型信息失败"
      };
    }
  } catch (err) {
    ctx.report(3, err);
    log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, cityCode: ${cityCode}, insurerCode: ${insurerCode}`, err);
    return {
      code: 500,
      msg: "获取精准报价失败"
    };
  }
});

function vehicle_code2uuid(vehicle_code: string) {
  if (vehicle_code) {
    return vehicle_code.substring(0, 8) + "-" + vehicle_code.substring(8, 12) + "-" + vehicle_code.substring(12, 16) + "-" + vehicle_code.substring(16, 20) + "-" + vehicle_code.substring(20, 32);
  } else {
    return "";
  }
}

log.info("Start quotation server");

