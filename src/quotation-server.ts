import { Server, ServerContext, ServerFunction, CmdPacket, Permission, msgpack_decode_async, msgpack_encode_async, rpcAsync, waitingAsync } from "hive-service";
import * as bunyan from "bunyan";
import * as uuid from "uuid";
import * as bluebird from "bluebird";
import { RedisClient, Multi } from "redis";
import { verify, booleanVerifier, uuidVerifier, stringVerifier, numberVerifier, dateVerifier } from "hive-verify";
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
  owner: string,
  insured: string,
  recommend: string,
  qid?: string) => {
  log.info(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured}, recommend: ${recommend}, qid: ${qid}`);
  try {
    await verify([
      uuidVerifier("vid", vid),
      uuidVerifier("owner", owner),
      uuidVerifier("insured", insured),
      qid ? uuidVerifier("qid", qid) : null,
    ].filter(x => x));
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }
  const set_insured_result = await rpcAsync<Object>(ctx.domain, process.env["PROFILE"], ctx.uid, "setInsured", insured);
  if (set_insured_result["code"] !== 200) {
    log.error(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured}, recommend: ${recommend}, qid: ${qid}, msg: ${set_insured_result["msg"]}`);
    return {
      code: set_insured_result["code"],
      msg: `设置投保人信息失败(QCQ${set_insured_result["code"]})`
    };
  } else {
    insured = set_insured_result["data"];
  }
  qid = qid ? qid : uuid.v1();
  const pkt: CmdPacket = { cmd: "createQuotation", args: [qid, vid, owner, insured, recommend] };
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
      const quotation = await msgpack_decode_async(qpkt);
      return { code: 200, data: quotation };
    } else {
      log.error(`getQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, msg: 报价未找到`);
      return { code: 404, msg: `未查询到报价，请确认qid输入正确, qid: ${qid}` };
    }
  } catch (err) {
    ctx.report(1, err);
    log.error(`getQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}`, err);
    return { code: 500, msg: "获取报价失败(QGQ500)" };
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
  vid: string,
  full?: boolean) => {
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
    const src = full ? "quotation-entities" : "quotation-slim-entities";
    const qid_buff: Buffer = await ctx.cache.hgetAsync("vid-qid", vid);
    if (qid_buff) {
      const qid: string = qid_buff.toString();
      const quotation_buff: Buffer = await ctx.cache.hgetAsync(src, qid);
      const quotation = await msgpack_decode_async(quotation_buff);
      return { code: 200, data: quotation };
    } else {
      log.error(`getLastQuotationByVid, sn: ${ctx.sn}, uid: ${ctx.uid}, full: ${full}`);
      return { code: 404, msg: `未查询到报价，请确认vid输入正确, vid: ${vid}` };
    }
  } catch (err) {
    ctx.report(1, err);
    log.error(`getLastQuotationByVid, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}`, err);
    return { code: 500, msg: "获取最后一次报价失败(QLQ500)" };
  }
});

server.callAsync("refresh", adminOnly, "refresh", "refresh", async (ctx: ServerContext,
  qid?: string) => {
  log.info(`refresh, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}`);
  try {
    await verify([
      qid ? uuidVerifier("qid", qid) : null,
    ].filter(x => x));
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
  owner: string,
  insured: string,
  city_code: string,
  insurer_code: string) => {
  log.info(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured}, insurerCode: ${insurer_code}, cityCode: ${city_code}`);
  try {
    await verify([
      stringVerifier("vid", vid),
      uuidVerifier("owner", owner),
      uuidVerifier("insured", insured),
      stringVerifier("insurer_code", insurer_code),
      stringVerifier("city_code", city_code)
    ]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }

  try {
    const vehicle_result = await rpcAsync<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "getVehicle", vid);
    if (vehicle_result["code"] === 200) {
      const vehicle_and_models = vehicle_result["data"];
      const license_no: string = vehicle_and_models["license_no"];
      const two_dates_buff: Buffer = await ctx.cache.hgetAsync("license-two-dates", license_no);
      if (two_dates_buff) {
        const two_dates = await msgpack_decode_async(two_dates_buff);
        const begindate = new Date(two_dates["ci_begin_date"]);
        return {
          code: 200,
          data: two_dates
        };
      }
      let responseNo: string = null;
      const response_no_result = await rpcAsync<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "fetchVehicleAndModelsByLicense", license_no);
      if (response_no_result["code"] === 200) {
        responseNo = response_no_result["data"]["response_no"];
      } else {
        log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured},  insurer_code: ${insurer_code}, city_code: ${city_code}, msg: 获取响应码失败`);
        return {
          code: response_no_result["code"],
          msg: `获取响应码失败(QRQ$}${response_no_result["code"]})`
        };
      }
      const frameNo: string = vehicle_and_models["vin"];
      const modelCode: string = vehicle_code2uuid(vehicle_and_models["model"]["vehicle_code"]);
      const engineNo: string = vehicle_and_models["engine_no"];
      const isTrans: string = "0";
      const transDate: string = null;
      const registerDate: string = fmtDateString(vehicle_and_models["register_date"]);

      let ownerName: string = null;
      let ownerID: string = null;
      let ownerMobile: string = null;

      const owner_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], ctx.uid, "getPerson", owner);
      if (owner_result["code"] === 200) {
        ownerName = owner_result["data"]["name"];
        ownerID = owner_result["data"]["identity_no"];
      } else {
        return {
          code: owner_result["code"],
          msg: `获取车主信息失败(QRQ${owner_result["code"]})`
        };
      }
      const insured_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], ctx.uid, "getPerson", insured);
      if (insured_result["code"] === 200) {
        ownerMobile = insured_result["data"]["phone"];
      } else {
        return {
          code: insured_result["code"],
          msg: `获取投保人信息失败(QRQ${insured_result["code"]})`
        };
      }
      const ref_coverageList = [
        {
          "coverageCode": "A",
          "coverageName": "机动车损失保险",
          "insuredAmount": "Y",
          "insuredPremium": null, // "1323.7600",
          "flag": null
        }];
      const options: Option = {
        log: log,
        sn: ctx.sn
      };
      try {
        const ztyq_result = await getReferencePrice(city_code, responseNo, license_no, frameNo, modelCode, engineNo, isTrans, transDate, registerDate, ownerName, ownerID, ownerMobile, insurer_code, ref_coverageList, options);
        const ref_biBeginDate = new Date(ztyq_result["data"]["biBeginDate"]);
        const two_dates: Object = {
          "bi_begin_date": ztyq_result["data"]["biBeginDate"],
          "ci_begin_date": ztyq_result["data"]["ciBeginDate"]
        };
        const two_dates_buff = await msgpack_encode_async(two_dates);
        await ctx.cache.hsetAsync("license-two-dates", license_no, two_dates_buff);
        return {
          code: 200,
          data: two_dates
        };
      } catch (err) {
        const ref_requestData = JSON.stringify({
          vid: vid,
          owner: owner,
          insured: insured,
          insurer_code: insurer_code,
          city_code: city_code
        });
        if (err.code === 408) {
          log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured},  insurer_code: ${insurer_code}, city_code: ${city_code}, error: 智通接口超时`);
          return {
            code: 408,
            msg: "网络连接超时（QRQ408），请稍后重试"
          };
        } else if (err.code) {
          log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured},  insurer_code: ${insurer_code}, city_code: ${city_code}`, err);
          return {
            code: err.code,
            msg: err.message
          };
        } else {
          ctx.report(3, err);
          log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured},  insurer_code: ${insurer_code}, city_code: ${city_code}`, err);
          return {
            code: 500,
            msg: "获取参考报价失败(QRQ500)"
          };
        }
      }
    } else {
      log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured},  insurer_code: ${insurer_code}, city_code: ${city_code}, msg: 获取车辆信息失败`);
      return {
        code: 500,
        msg: "获取车辆信息失败(QRQ500)"
      };
    }
  } catch (err) {
    ctx.report(1, err);
    log.error(`getReferenceQuotation, sn: ${ctx.sn}, uid:${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured},  insurer_code: ${insurer_code}, city_code: ${city_code}`, err);
    return {
      code: 500,
      msg: "获取参考报价失败(QRQ500)"
    };
  }
});

async function requestAccurateQuotation(ctx: ServerContext,
  thpBizID: string,
  cityCode: string,
  responseNo: string,
  bi_begin_date: Date,
  ci_begin_date: Date,
  licenseNo: string,
  frameNo: string,
  modelCode: string,
  engineNo: string,
  isTrans: string,
  transDate: string,
  register_date: Date,
  ownerName: string,
  ownerID: string,
  ownerMobile: string,
  insuredName: string,
  insuredID: string,
  insuredMobile: string,
  insurerCode: string,
  vid: string,
): Promise<any> {
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
    const options: Option = {
      log: log,
      sn: ctx.sn
    };
    const biBeginDate: string = fmtDateString(bi_begin_date);
    const ciBeginDate: string = fmtDateString(ci_begin_date);
    const registerDate: string = fmtDateString(register_date);
    const ztyq_result = await getAccuratePrice(thpBizID, cityCode, responseNo, biBeginDate, ciBeginDate, licenseNo, frameNo, modelCode, engineNo, isTrans, transDate, registerDate, ownerName, ownerID, ownerMobile, insuredName, insuredID, insuredMobile, insurerCode, coverages, options);
    if (ztyq_result["data"] && ztyq_result["data"]["coverageList"]) {
      const insurance_due_date = new Date(ciBeginDate);
      const due_date_result = await rpcAsync<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "setInsuranceDueDate", vid, insurance_due_date);
      if (due_date_result["code"] === 200) {
        const zt_quotation_buff = await msgpack_encode_async(ztyq_result["data"]);
        await ctx.cache.setexAsync(`zt-quotation:${vid}:${insurerCode}`, 60 * 60 * 24 * 30, zt_quotation_buff); // 自动报价有效期一个月
        return {
          err: null,
          data: ztyq_result["data"]
        };
      } else {
        const e: Error = new Error();
        e.name = due_date_result["code"];
        e.message = due_date_result["msg"];
        return {
          err: e,
          data: null
        };
      }
    } else {
      const e: Error = new Error();
      e.name = ztyq_result["code"];
      e.message = ztyq_result["msg"];
      return {
        err: e,
        data: null
      };
    }
  } catch (err) {
    if (err.code === 408) {
      const e: Error = new Error();
      e.name = "408";
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
  // TODEL
  log.info(`calculate_premium, data: ${JSON.stringify(data)}`);
  log.info(`calculate_premium, origin_coverages: ${JSON.stringify(origin_coverages)}`);
  log.info(`calculate_premium, modified_coverages: ${JSON.stringify(modified_coverages)}`);

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
  vid,
  qid,
  owner,
  insured,
  insurer_code,
  save) {
  const { data, diff_ms } = calculate_premium(vehicle_and_models, _data);

  // NEW 可能用待涛哥确认, 此次不用
  // TODO 怎么判断是否是续保
  // 计算车龄
  const vehicle_age = Math.floor(diff_ms / (1000 * 60 * 60 * 24 * 30 * 12));
  let age_facor = 1;
  if (vehicle_age < 11) {
    age_facor = 0.9;
  } else if (vehicle_age >= 11 && vehicle_age < 12) {
    age_facor = 0.85;
  } else {
    // 只有续保用户会到这里, 续保用户不受12年车龄限制
    age_facor = 0.85;
  }

  const age_price = (1 - (Math.floor(diff_ms / (1000 * 60 * 60 * 24 * 30)) * 0.006)) * Number(data["purchase_price"]);
  const age_price_limit = Number(data["purchase_price"]) * 0.2;
  try {
    if (age_price < age_price_limit) {
      data["real_value"] = age_price_limit.toFixed(2);
    } else {
      data["real_value"] = age_price.toFixed(2);
    }
    data["amount"] = age_facor * data["real_value"];
    if (save) {
      const pkt: CmdPacket = { cmd: "saveQuotation", args: [data, vid, qid, 3, owner, insured, insurer_code] };
      ctx.publish(pkt);
      return await waitingAsync(ctx);
    } else {
      return {
        code: 200,
        data: "success"
      };
    }
  } catch (err) {
    ctx.report(3, err);
    log.error(`handleAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}`, err);
    return {
      code: 500,
      msg: "处理报价信息失败(QAQ500)"
    };
  }
}

server.callAsync("getAccurateQuotation", allowAll, "获得精准报价", "获得精准报价", async (ctx: ServerContext,
  vid: string,
  qid: string,
  owner: string,
  insured: string,
  city_code: string,
  insurer_code: string,
  bi_begin_date: Date,
  ci_begin_date: Date,
  cache_first: boolean,
  save: boolean) => {
  log.info(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, owner: ${owner}, insured: ${insured}, city_code: ${city_code}, insurer_code: ${insurer_code}, bi_begin_date: ${bi_begin_date}, ci_begin_date: ${ci_begin_date}, cache_first: ${cache_first}, save: ${save}`);
  try {
    await verify([
      uuidVerifier("vid", vid),
      uuidVerifier("qid", qid),
      uuidVerifier("owner", owner),
      uuidVerifier("insured", insured),
      stringVerifier("city_code", city_code),
      stringVerifier("insurer_code", insurer_code),
      dateVerifier("bi_begin_date", bi_begin_date),
      dateVerifier("ci_begin_date", ci_begin_date),
      booleanVerifier("cache_first", cache_first),
    ]);
  } catch (err) {
    ctx.report(3, err);
    return {
      code: 400,
      msg: err.message
    };
  }
  try {
    const vehicle_result = await rpcAsync<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "getVehicle", vid);
    if (vehicle_result["code"] === 200) {
      const vehicle_and_models = vehicle_result["data"];
      if (cache_first) {
        // 缓存优先获取
        // TODO 一个月内已经报过价
        const exist_quotation_buff: Buffer = await ctx.cache.getAsync(`zt-quotation:${vid}:${insurer_code}`);
        if (exist_quotation_buff) {
          // 一个月内已经报过价
          const quotation = await msgpack_decode_async(exist_quotation_buff);
          const thpBizID: string = qid; // 此处生成自动报价的　quotation id, 即 qid
          return await handleAccurateQuotation(ctx, vehicle_and_models, quotation, vid, qid, owner, insured, insurer_code, save);
        } else {
          // 一个月内未报过价
          const license_no: string = vehicle_and_models["license_no"];
          const two_dates_buff = await ctx.cache.hgetAsync("license-two-dates", license_no);
          if (two_dates_buff) {
            const two_dates = await msgpack_decode_async(two_dates_buff);
            const thpBizID: string = qid; // 此处生成自动报价的　quotation id, 即 qid
            let responseNo: string = null;
            const response_no_result = await rpcAsync<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "fetchVehicleAndModelsByLicense", license_no);
            if (response_no_result["code"] === 200) {
              responseNo = response_no_result["data"]["response_no"];
            } else {
              log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, owner: ${owner}, insured: ${insured}, city_code: ${city_code}, insurer_code: ${insurer_code}, bi_begin_date: ${bi_begin_date}, ci_begin_date: ${ci_begin_date}, cache_first: ${cache_first}, save: ${save}, msg: 获取响应码失败, ${response_no_result["msg"]}`);
              return {
                code: response_no_result["code"],
                msg: `获取响应码失败(QAQ${response_no_result["code"]})`
              };
            }
            const licenseNo: string = vehicle_and_models["license_no"];
            const frameNo: string = vehicle_and_models["vin"];
            const modelCode: string = vehicle_code2uuid(vehicle_and_models["model"]["vehicle_code"]);
            const engineNo: string = vehicle_and_models["engine_no"];
            const isTrans: string = "0"; // 0 否,1 是, 过户车不走自动报价
            const transDate: string = null;
            const register_date: Date = vehicle_and_models["register_date"];

            let ownerName: string = null;
            let ownerID: string = null;
            let ownerMobile: string = null;
            let insuredName: string = null;
            let insuredID: string = null;
            let insuredMobile: string = null;
            const owner_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], ctx.uid, "getPerson", owner);
            if (owner_result["code"] === 200) {
              ownerName = owner_result["data"]["name"];
              ownerID = owner_result["data"]["identity_no"];
            } else {
              return {
                code: owner_result["code"],
                msg: `获取车主信息失败(QAQ${owner_result["code"]})`
              };
            }
            const insured_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], ctx.uid, "getPerson", insured);
            if (insured_result["code"] === 200) {
              insuredName = insured_result["data"]["name"];
              insuredID = insured_result["data"]["identity_no"];
              insuredMobile = insured_result["data"]["phone"];
              ownerMobile = insured_result["data"]["phone"]; // 这是业务约定
            } else {
              return {
                code: insured_result["code"],
                msg: `获取投保人信息失败(QAQ${insured_result["code"]})`
              };
            }
            const accurate_quotation_result = await requestAccurateQuotation(ctx, thpBizID, city_code, responseNo, bi_begin_date, ci_begin_date, licenseNo, frameNo, modelCode, engineNo, isTrans, transDate, register_date, ownerName, ownerID, ownerMobile, insuredName, insuredID, insuredMobile, insurer_code, vid);
            if (accurate_quotation_result.err) {
              return {
                code: 500,
                msg: accurate_quotation_result.err.message
              };
            } else {
              return await handleAccurateQuotation(ctx, vehicle_and_models, accurate_quotation_result.data, vid, qid, owner, insured, insurer_code, save);
            }
          } else {
            log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, owner: ${owner}, insured: ${insured}, city_code: ${city_code}, insurer_code: ${insurer_code}, bi_begin_date: ${bi_begin_date}, ci_begin_date: ${ci_begin_date}, cache_first: ${cache_first}, save: ${save}, msg: "Not found biBeginDate & ciBeginDate in redis!"`);
            return {
              code: 404,
              msg: "Not found biBeginDate & ciBeginDate in redis!"
            };
          }
        }
      } else {
        // 不从缓存获取
        const license_no: string = vehicle_and_models["license_no"];
        const two_dates_buff = await ctx.cache.hgetAsync("license-two-dates", license_no);
        if (two_dates_buff) {
          const two_dates = await msgpack_decode_async(two_dates_buff);
          const thpBizID: string = qid; // 此处生成自动报价的　quotation id, 即 qid
          let responseNo: string = null;
          const response_no_result = await rpcAsync<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "fetchVehicleAndModelsByLicense", license_no);
          if (response_no_result["code"] === 200) {
            responseNo = response_no_result["data"]["response_no"];
          } else {
            log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, owner: ${owner}, insured: ${insured}, city_code: ${city_code}, insurer_code: ${insurer_code}, bi_begin_date: ${bi_begin_date}, ci_begin_date: ${ci_begin_date}, cache_first: ${cache_first}, save: ${save}, msg: 获取响应码失败`);
            return {
              code: response_no_result["code"],
              msg: `获取响应码失败(QAQ${response_no_result["code"]})`
            };
          }
          const licenseNo: string = vehicle_and_models["license_no"];
          const frameNo: string = vehicle_and_models["vin"];
          const modelCode: string = vehicle_code2uuid(vehicle_and_models["model"]["vehicle_code"]);
          const engineNo: string = vehicle_and_models["engine_no"];
          const isTrans: string = "0"; // 0 否,1 是, 过户车不走自动报价
          const transDate: string = null;
          const register_date: Date = vehicle_and_models["register_date"];

          let ownerName: string = null;
          let ownerID: string = null;
          let ownerMobile: string = null;
          let insuredName: string = null;
          let insuredID: string = null;
          let insuredMobile: string = null;
          const owner_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], ctx.uid, "getPerson", owner);
          if (owner_result["code"] === 200) {
            ownerName = owner_result["data"]["name"];
            ownerID = owner_result["data"]["identity_no"];
          } else {
            return {
              code: owner_result["code"],
              msg: `获取车主信息失败(QAQ${owner_result["code"]})`
            };
          }
          const insured_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], ctx.uid, "getPerson", insured);
          if (insured_result["code"] === 200) {
            insuredName = insured_result["data"]["name"];
            insuredID = insured_result["data"]["identity_no"];
            insuredMobile = insured_result["data"]["phone"];
            ownerMobile = insured_result["data"]["phone"]; // 这是业务约定
          } else {
            return {
              code: insured_result["code"],
              msg: `获取投保人信息失败(QAQ${insured_result["code"]})`
            };
          }
          const accurate_quotation_result = await requestAccurateQuotation(ctx, thpBizID, city_code, responseNo, bi_begin_date, ci_begin_date, licenseNo, frameNo, modelCode, engineNo, isTrans, transDate, register_date, ownerName, ownerID, ownerMobile, insuredName, insuredID, insuredMobile, insurer_code, vid);
          if (accurate_quotation_result.err) {
            return {
              code: 500,
              msg: accurate_quotation_result.err.message
            };
          } else {
            return await handleAccurateQuotation(ctx, vehicle_and_models, accurate_quotation_result.data, vid, qid, owner, insured, insurer_code, save);
          }
        } else {
          log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, owner: ${owner}, insured: ${insured}, city_code: ${city_code}, insurer_code: ${insurer_code}, bi_begin_date: ${bi_begin_date}, ci_begin_date: ${ci_begin_date}, cache_first: ${cache_first}, save: ${save}, msg: "Not found biBeginDate & ciBeginDate in redis!"`);
          return {
            code: 404,
            msg: "Not found biBeginDate & ciBeginDate in redis!"
          };
        }
      }
    } else {
      log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, owner: ${owner}, insured: ${insured}, city_code: ${city_code}, insurer_code: ${insurer_code}, bi_begin_date: ${bi_begin_date}, ci_begin_date: ${ci_begin_date}, cache_first: ${cache_first}, save: ${save}, msg: 获取车辆和车型信息失败`);
      return {
        code: vehicle_result["code"],
        msg: `获取车辆和车型信息失败(QAQ${vehicle_result["code"]})`
      };
    }
  } catch (err) {
    ctx.report(3, err);
    log.error(`getAccurateQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, owner: ${owner}, insured: ${insured}, city_code: ${city_code}, insurer_code: ${insurer_code}, bi_begin_date: ${bi_begin_date}, ci_begin_date: ${ci_begin_date}, cache_first: ${cache_first}, save: ${save}`, err);
    return {
      code: 500,
      msg: "获取精准报价失败(QAQ500)"
    };
  }
});

server.callAsync("getLastQuotations", allowAll, "得到用户最后一次的报价", "得到用户所有车最后一次的报价", async (ctx: ServerContext,
  full?: boolean) => {
  log.info(`getLastQuotations, sn: ${ctx.sn}, uid: ${ctx.uid}, full: ${full}`);
  try {
    const src = full ? "quotation-entities" : "quotation-slim-entities";
    const vids_set_buff: Buffer[] = await ctx.cache.smembersAsync(`vids:${ctx.uid}`);
    if (vids_set_buff.length > 0) {
      const quotations_return = [];
      for (const vid_buff of vids_set_buff) {
        const vid: string = vid_buff.toString();
        const pkt = await ctx.cache.hgetAsync("vid-qids", vid);
        const qid_buff: Buffer = await ctx.cache.hgetAsync("vid:uid-qid", `${vid}:${ctx.uid}`);
        if (qid_buff) {
          const qid: string = qid_buff.toString();
          const quotation_buff: Buffer = await ctx.cache.hgetAsync(src, qid);
          const quotation = await msgpack_decode_async(quotation_buff);
          quotations_return.push(quotation);
        } else {
          log.error(`getLastQuotations, sn: ${ctx.sn}, uid: ${ctx.uid}, full: ${full}`);
          return { code: 404, msg: `未查询到报价，请确认vid输入正确` };
        }
      }
      return { code: 200, data: quotations_return };
    } else {
      log.error(`getLastQuotations, sn: ${ctx.sn}, uid: ${ctx.uid}, full: ${full}`);
      return { code: 404, msg: `未查询到报价，请确认用户已经创建报价` };
    }
  } catch (err) {
    ctx.report(1, err);
    log.error(`getLastQuotations, sn: ${ctx.sn}, uid: ${ctx.uid}, full: ${full}`, err);
    return { code: 500, msg: "获取用户最后一次的报价失败(QLS500)" };
  }
});

function vehicle_code2uuid(vehicle_code: string) {
  if (vehicle_code) {
    return vehicle_code.substring(0, 8) + "-" + vehicle_code.substring(8, 12) + "-" + vehicle_code.substring(12, 16) + "-" + vehicle_code.substring(16, 20) + "-" + vehicle_code.substring(20, 32);
  } else {
    return "";
  }
}

function fmtDateString(date: Date) {
  if (date) {
    return date.toISOString().substring(0, 10);
  } else {
    return "";
  }
}

log.info("Start quotation server");

