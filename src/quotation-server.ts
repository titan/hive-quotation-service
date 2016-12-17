import { Server, ServerContext, ServerFunction, CmdPacket, Permission, wait_for_response, msgpack_decode } from "hive-service";
import * as bunyan from "bunyan";
import * as http from "http";
import * as msgpack from "msgpack-lite";
import * as uuid from "uuid";
import { verify, uuidVerifier, stringVerifier, numberVerifier } from "hive-verify";
import { servermap } from "hive-hostmap";
import { rpc } from "hive-processor";


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

server.call("createQuotation", allowAll, "创建报价", "创建报价", (ctx: ServerContext, rep: ((result: any) => void), vid: string) => {
  log.info(`createQuotation, ${vid}`);
  if (!verify([uuidVerifier("vid", vid)], (errors: string[]) => {
    log.info("arg not match " + errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  const qid = uuid.v1();
  const state: number = 1;
  const domain = ctx.domain;
  const pkt: CmdPacket = { cmd: "createQuotation", args: [qid, vid, state, qid, domain] };
  ctx.publish(pkt);
  wait_for_response(ctx.cache, qid, rep);
});

server.call("getQuotation", allowAll, "获取一个报价", "获取一个报价", (ctx: ServerContext, rep: ((result: any) => void), qid: string) => {
  log.info(`getQuotation, qid: ${qid}`);
  if (!verify([uuidVerifier("qid", qid)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.hget("quotation-entities", qid, (err, qpkt) => {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else if (qpkt) {
      msgpack_decode(qpkt).then(quotation => {
        rep({ code: 200, data: quotation });
      }).catch(e => {
        rep({ code: 500, msg: err.message });
      });
    } else {
      rep({ code: 404, msg: "Quotation not found" });
    }
  });
});

server.call("refresh", adminOnly, "refresh", "refresh", (ctx: ServerContext, rep: ((result: any) => void), qid?: string) => {
  log.info(qid ? `refresh, qid: ${qid}` : "refresh");
  const cbflag = uuid.v1();
  const pkt: CmdPacket = { cmd: "refresh", args: qid ? ["admin", cbflag, qid] : ["admin", cbflag] };
  ctx.publish(pkt);
  wait_for_response(ctx.cache, cbflag, rep)
});

server.call("getReferenceQuotation", allowAll, "获得参考报价", "获得参考报价", (ctx: ServerContext, rep: ((result: any) => void), licenseNumber: string, modelListOrder: number) => {
  log.info(`getReferenceQuotation, licenseNumber: ${licenseNumber}, modelListOrder: ${modelListOrder} `);
  if (!verify([stringVerifier("licenseNumber", licenseNumber)], (errors: string[]) => {
    log.info(errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  if (modelListOrder === NaN) {
    rep({
      code: 400,
      msg: "ModelListOrder is NOT a number!"
    });
    return;
  }

  if (modelListOrder < 0) {
    rep({
      code: 400,
      msg: "ModelListOrder is a Negative number!"
    });
    return;
  }

  log.info("Try to get two_dates_str from redis:");
  ctx.cache.hget("license-two-dates", licenseNumber, function (err, two_dates_str) {
    if (err) {
      rep({
        code: 400,
        msg: "Error on getting two_dates_str from redis!"
      });
    } else if (!two_dates_str) {
      log.info("Try to get carInfo from redis:");
      ctx.cache.hget("vehicle-info", licenseNumber, function (err, vehicleInfo_str) {
        log.info(vehicleInfo_str);

        if (err) {
          rep({
            code: 400,
            msg: "Error on getting carInfo from redis!"
          });
        } else if (vehicleInfo_str) {

          const vehicleInfo = JSON.parse(vehicleInfo_str);
          const ref_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

          const ref_cityCode = "110100"; // Beijing

          const ref_carInfo = {
            "licenseNo": vehicleInfo["licenseNo"],
            "frameNo": null, // vehicleInfo["frameNo"],
            "modelCode": vehicleInfo["model"][modelListOrder]["brandCode"],
            "engineNo": null,// vehicleInfo["engineNo"],
            "isTrans": "0",
            "transDate": null,
            "registerDate": vehicleInfo["firstRegisterDate"]
          };

          const ref_persionInfo: Object = {
            "ownerName": null,         // N
            "ownerID": null,             // N
            "ownerMobile": null,  // N
          };

          const ref_coverageList = [
            {
              "coverageCode": "A",
              "coverageName": "机动车损失保险",
              "insuredAmount": "Y",
              "insuredPremium": null, // "1323.7600",
              "flag": null
            }];


          const ref_data = {
            applicationID: "FENGCHAOHUZHU_SERVICE",
            cityCode: ref_cityCode,
            responseNo: vehicleInfo["responseNo"],
            carInfo: ref_carInfo,
            personInfo: ref_persionInfo,
            insurerCode: "APIC",
            coverageList: ref_coverageList
          };

          const ref_requestData = {
            operType: "REF",
            msg: "参考报价",
            sendTime: ref_sendTimeString,
            sign: null,
            data: ref_data
          };

          const ref_postData: string = JSON.stringify(ref_requestData);
          log.info("ref_postData:");
          log.info(ref_postData);

          const ref_options = {
            hostname: "api.ztwltech.com",
            method: "POST",
            path: "/zkyq-web/calculate/entrance",
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(ref_postData)
            }
          };

          const ref_req = http.request(ref_options, function (res) {
            log.info("Status: " + res.statusCode);
            res.setEncoding("utf8");

            let ref_result: string = "";

            res.on("data", function (body) {
              ref_result += body;
            });

            res.on("end", function () {
              const ref_retData: Object = JSON.parse(ref_result);
              log.info("Here is REF retData:");
              log.info(ref_result);

              if (ref_retData["state"] === "1") {
                const ref_biBeginDate = new Date(ref_retData["data"][0]["biBeginDate"]);
                const two_dates: Object = {
                  "biBeginDate": ref_retData["data"][0]["biBeginDate"],
                  "ciBeginDate": ref_retData["data"][0]["ciBeginDate"]
                }

                log.info(JSON.stringify(two_dates));
                ctx.cache.hset("license-two-dates", licenseNumber, JSON.stringify(two_dates));
                const today = new Date();
                const diff_ms: number = ref_biBeginDate.valueOf() - today.valueOf();
                if (Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) > 90 || Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) < 2) {
                  rep({
                    code: 400,
                    msg: "商业险起保日期距今超过90天"
                  });
                } else {
                  log.info(ref_retData["data"][0]["biBeginDate"]);
                  rep({
                    code: 200,
                    data: two_dates
                  });

                }
              } else {
                rep({
                  code: 400,
                  msg: ref_retData["msg"]
                });
              }
            });

            ref_req.on('error', (e) => {
              log.info(`problem with request: ${e.message}`);
              rep({
                code: 500,
                msg: e.message
              });
            });

          });

          ref_req.end(ref_postData);

        } else {
          rep({
            code: 500,
            msg: "Not found carInfo from redis!"
          });
        }
      });
    } else {
      const two_dates = JSON.parse(two_dates_str);
      log.info(JSON.stringify(two_dates));
      rep({
        code: 200,
        data: two_dates
      });
    }
  });
});

server.call("getAccurateQuotation", allowAll, "获得精准报价", "获得精准报价", (ctx: ServerContext, rep: ((result: any) => void), ownerId: string, ownerName: string, ownerCellPhone: string, licenseNumber: string, modelListOrder: number) => {
  log.info(`getAccurateQuotation, ownerId: ${ownerId}, ownerName: ${ownerName}, ownerCellPhone: ${ownerCellPhone}, licenseNumber: ${licenseNumber}, modelListOrder: ${modelListOrder}`);
  if (!verify([stringVerifier("licenseNumber", licenseNumber),
  stringVerifier("ownerId", ownerId),
  stringVerifier("ownerName", ownerName),
  stringVerifier("ownerCellPhone", ownerCellPhone)], (errors: string[]) => {
    log.info(errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }

  if (modelListOrder === NaN) {
    rep({
      code: 400,
      msg: "ModelListOrder is NOT a number!"
    });
    return;
  }

  if (modelListOrder < 0) {
    rep({
      code: 400,
      msg: "ModelListOrder is a Negative number!"
    });
    return;
  }

  ctx.cache.hget("vehicle-info", licenseNumber, function (err, vehicleInfo_pkt) {
    log.info("Try to get vehicle-info from redis");
    if (err) {
      log.info(`problem with request: ${err.message}`);
      rep({
        code: 500,
        msg: err.message
      });
    } else if (vehicleInfo_pkt) {
      log.info("Try to get two dates from redis");
      ctx.cache.hget("license-two-dates", licenseNumber, function (err, two_dates_str) {
        // const sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        if (err) {
          log.info(`problem with request: ${err.message}`);
          rep({
            code: 500,
            msg: err.message
          });
        } else if (two_dates_str) {

          const two_dates = JSON.parse(two_dates_str);
          msgpack_decode(vehicleInfo_pkt).then(vehicleInfo => {

            const acc_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

            const acc_cityCode = "110100"; // Beijing

            const acc_carInfo = {
              "licenseNo": vehicleInfo["licenseNo"],
              "frameNo": vehicleInfo["frameNo"], // 如果有修改车架号,就一定要传,没有修改的话,就不传.为 null
              "modelCode": vehicleInfo["models"][modelListOrder]["brandCode"],
              "engineNo": vehicleInfo["engineNo"],
              "isTrans": "0",
              "transDate": null,
              "registerDate": vehicleInfo["firstRegisterDate"]
            };

            const acc_persionInfo: Object = {
              "insuredID": ownerId,
              "ownerName": ownerName,
              "ownerID": ownerId,
              "ownerMobile": ownerCellPhone,
              "insuredName": ownerName,
              "insuredMobile": ownerCellPhone
            };

            const acc_coverageList = [
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

              const acc_data = {
                applicationID: "FENGCHAOHUZHU_SERVICE",
                insurerCode: "APIC",
                biBeginDate: two_dates["biBeginDate"],
                ciBeginDate: two_dates["ciBeginDate"],
                cityCode: acc_cityCode,
                responseNo: vehicleInfo["responseNo"],
                channelCode: null,
                carInfo: acc_carInfo,
                thpBizID: "20161213fuyuhintest",
                personInfo: acc_persionInfo,
                coverageList: acc_coverageList
              };

              const acc_requestData = {
                operType: "ACCPRICE",
                msg: "精准报价",
                sendTime: acc_sendTimeString,
                sign: null,
                data: acc_data
              };

              const acc_postData: string = JSON.stringify(acc_requestData);
              log.info(`api.ztwltech.com ACCPRICE request: ${acc_postData}`);

              const acc_options = {
                hostname: "api.ztwltech.com",
                method: "POST",
                path: "/zkyq-web/pottingApi/CalculateApi",
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(acc_postData)
                }
              };

              const acc_req = http.request(acc_options, function (res) {
                res.setEncoding("utf8");

                let acc_result: string = "";

                res.on("data", function (body) {
                  acc_result += body;
                });

                res.on("end", function () {
                  console.log(acc_result);
                  log.info(`api.ztwltech.com ACCPRICE response: ${acc_result}`);
                  const acc_retData: Object = JSON.parse(acc_result);
                  if (acc_retData["state"] === "1") {
                    const coverageList = acc_retData["data"][0]["coverageList"];
                    const modified_coverageList = {};
                    // log.info(coverageList.toString());
                    for (let i = 0; i < coverageList.length; i++) {
                      modified_coverageList[(coverageList[i]["coverageCode"]).toString()] = coverageList[i];
                    }

                    // const modified_List

                    // for (const i = 0; i < modified_coverageList.length; i++) {
                    //   modified_coverageList[i]["modifiedPremium"] = null;
                    // }

                    const A_free: number = Number(modified_coverageList["A"]["insuredPremium"]) * 1.15 * 0.65;
                    const B_free: number = Number(modified_coverageList["B"]["insuredPremium"]);
                    const F_free: number = Number(modified_coverageList["F"]["insuredPremium"]) * 0.65;
                    const FORCEPREMIUM_free: number = Number(modified_coverageList["FORCEPREMIUM"]["insuredPremium"]);
                    const G1_free: number = Number(modified_coverageList["G1"]["insuredPremium"]) * 1.2 * 0.66;
                    const X1_free: number = Number(modified_coverageList["X1"]["insuredPremium"]) * 1.15 * 0.65;
                    const Z_free: number = Number(modified_coverageList["Z"]["insuredPremium"]) * 1.2 * 0.65;
                    const Z3_free: number = Number(modified_coverageList["Z3"]["insuredPremium"]) * 0.65;

                    const B_insured_amount_list: string[] = ["5万", "10万", "15万", "20万", "30万", "50万", "100万"];// , "150万", "200万", "300万", "500万"];

                    const D_of_Amount_seat: number[][] = [
                      [394.55, 570.05, 649.35, 706.55, 796.90, 956.80, 1246.05], // 1430.37, 1589.19, 1897.30, 2494.46],
                      [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96],
                      [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96]
                    ];

                    const B: number = B_free / 796.9;

                    let seat = Number(vehicleInfo["models"][modelListOrder]["seat"]);

                    if (seat < 6) {
                      seat = 0;
                    } else if (seat >= 6 && seat <= 10) {
                      seat = 1;
                    } else {
                      seat = 2;
                    }

                    const E_list = [];

                    const B_free_list = {};
                    for (let i = 0; i < D_of_Amount_seat[seat].length; i++) {
                      E_list[i] = D_of_Amount_seat[seat][i] * B;
                      B_free_list[B_insured_amount_list[i]] = E_list[i].toFixed(2);
                    }

                    modified_coverageList["A"]["modifiedPremium"] = A_free.toFixed(2);
                    modified_coverageList["B"]["insuredPremium"] = B_free_list;
                    modified_coverageList["B"]["modifiedPremium"] = B_free_list;
                    modified_coverageList["F"]["modifiedPremium"] = F_free.toFixed(2);
                    modified_coverageList["FORCEPREMIUM"]["modifiedPremium"] = FORCEPREMIUM_free.toFixed(2);
                    modified_coverageList["G1"]["modifiedPremium"] = G1_free.toFixed(2);
                    modified_coverageList["X1"]["modifiedPremium"] = X1_free.toFixed(2);
                    modified_coverageList["Z"]["modifiedPremium"] = Z_free.toFixed(2);
                    modified_coverageList["Z3"]["modifiedPremium"] = Z3_free.toFixed(2);

                    const registerDate = new Date(vehicleInfo["firstRegisterDate"]);
                    const acc_today = new Date();

                    const acc_diff_ms: number = acc_today.valueOf() - registerDate.valueOf();
                    const past_two_years: number = (Math.ceil(acc_diff_ms / (1000 * 60 * 60 * 24)) > 365 * 2) ? 1 : 0;

                    const newCarPrice = Number(vehicleInfo["models"][modelListOrder]["newCarPrice"]);
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

                    modified_coverageList["Scratch"] = {
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


                    acc_retData["data"][0]["coverageList"] = modified_coverageList;
                    acc_retData["data"][0]["purchasePrice"] = vehicleInfo["models"][modelListOrder]["purchasePrice"];

                    const age_price = (1 - (Math.ceil(acc_diff_ms / (1000 * 60 * 60 * 24 * 30)) * 0.006)) * Number(acc_retData["data"][0]["purchasePrice"]);
                    const age_price_limit = Number(acc_retData["data"][0]["purchasePrice"]) * 0.2;

                    log.info("Ready to get vid");
                    (async () => {
                      const vrep = await rpc<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "setVehicleOnCard", ownerName, ownerId, ownerCellPhone, "", acc_carInfo["modelCode"].split("-").join(""), acc_carInfo["licenseNo"], acc_carInfo["engineNo"], acc_carInfo["registerDate"], "", false, "", acc_retData["data"][0]["biBeginDate"], "", acc_carInfo["frameNo"]);
                      if (vrep["code"] === 200) {
                        log.info("!!! Got vid: " + vrep["data"]);
                        acc_retData["data"][0]["vid"] = vrep["data"];
                        const qrep = await rpc<Object>("mobile", process.env["QUOTATION"], ctx.uid, "createQuotation", vrep["data"]);
                        if (qrep["code"] === 200) {
                          log.info("!!! Got qid: " + qrep["data"]["qid"]);
                          acc_retData["data"][0]["thpBizID"] = qrep["data"]["qid"];
                          if (age_price < age_price_limit) {
                            acc_retData["data"][0]["realPrice"] = age_price_limit.toFixed(2);
                          } else {
                            acc_retData["data"][0]["realPrice"] = age_price.toFixed(2);
                          }
                          const domain = ctx.domain;
                          const cbflag = uuid.v1();
                          const pkt: CmdPacket = { cmd: "saveQuotation", args: [acc_retData["data"][0], 3, cbflag, domain] };
                          ctx.publish(pkt);
                          wait_for_response(ctx.cache, cbflag, rep);
                        } else {
                          rep({
                            code: 400,
                            msg: "Can't get qid from createQuotation by vid: " + vrep["data"]
                          });
                        }
                      } else {
                        rep({
                          code: vrep["code"],
                          msg: vrep["msg"]
                        });
                      }
                    })();
                  } else {
                    rep({
                      code: 400,
                      msg: acc_retData["msg"] + ": " + acc_retData["data"][0]["msg"]
                    });
                  }
                });


                res.on('error', (e) => {
                  log.info(`problem with request: ${e.message}`);
                  rep({
                    code: 500,
                    msg: e.message
                  });
                });
              });

              acc_req.end(acc_postData);

          });
        } else {
          rep({
            code: 404,
            msg: "Not found biBeginDate & ciBeginDate in redis!"
          });
        }
      });
    } else {
      rep({
        code: 404,
        msg: "Not found vehicle info in redis!"
      });
    }
  });
});


server.call("getAccurateQuotationForTest", allowAll, "获得精准报价", "同时获得参考报价和精准报价", (ctx: ServerContext, rep: ((result: any) => void), ownerId: string, ownerName: string, ownerCellPhone: string, licenseNumber: string, modelListOrder: number) => {
  // log.info("licenseNumber " + licenseNumber);
  // if (!verify([stringVerifier("licenseNumber", licenseNumber), stringVerifier("responseNumber", responseNumber)], (errors: string[]) => {
  //   log.info(errors);
  //   rep({
  //     code: 400,
  //     msg: errors.join("\n")
  //   });
  // })) {
  //   return;
  // }
  ctx.cache.hget("vehicle-info", licenseNumber, function (err, vehicleInfo_str) {
    log.info("Try to get carInfo from redis:");

    log.info(vehicleInfo_str);

    if (err) {
      rep({
        code: 400,
        msg: "Error on getting carInfo from redis!"
      });
    } else if (vehicleInfo_str) {

      const vehicleInfo = JSON.parse(vehicleInfo_str);
      const ref_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

      const ref_cityCode = "110100"; // Beijing

      const ref_carInfo = {
        "licenseNo": vehicleInfo["licenseNo"],
        "frameNo": null, // vehicleInfo["frameNo"],
        "modelCode": vehicleInfo["model"][modelListOrder]["brandCode"],
        "engineNo": null,// vehicleInfo["engineNo"],
        "isTrans": "0",
        "transDate": null,
        "registerDate": vehicleInfo["firstRegisterDate"]
      };

      const ref_persionInfo: Object = {
        "ownerName": null,         // N
        "ownerID": null,             // N
        "ownerMobile": null,  // N
      };

      const ref_coverageList = [
        {
          "coverageCode": "A",
          "coverageName": "机动车损失保险",
          "insuredAmount": "Y",
          "insuredPremium": null, // "1323.7600",
          "flag": null
        }];


        const ref_data = {
          applicationID: "FENGCHAOHUZHU_SERVICE", // "ZKYQ"
          cityCode: ref_cityCode,
          responseNo: vehicleInfo["responseNo"],
          carInfo: ref_carInfo,
          personInfo: ref_persionInfo,
          insurerCode: "APIC",            // APIC 永诚 该载体暂不支持此保险公司报价 没有给你们配永城，现在测试环境值给你们配置太保人保和阳光
          coverageList: ref_coverageList
        };

        const ref_requestData = {
          operType: "REF",
          msg: "参考报价",
          sendTime: ref_sendTimeString,
          sign: null,
          data: ref_data
        };

        const ref_postData: string = JSON.stringify(ref_requestData);
        log.info("ref_postData:");
        log.info(ref_postData);

        const ref_options = {
          hostname: "api.ztwltech.com",
          // port: 8081,
          method: "POST",
          path: "/zkyq-web/calculate/entrance",
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(ref_postData)
          }
        };

        const ref_req = http.request(ref_options, function (res) {
          log.info("Status: " + res.statusCode);
          res.setEncoding("utf8");

          let ref_result: string = "";

          res.on("data", function (body) {
            ref_result += body;
          });

          res.on("end", function () {

            const ref_retData: Object = JSON.parse(ref_result);
            log.info("Here is REF retData:");
            log.info(ref_result);
            if (ref_retData["state"] === "1") {
              const biBeginDate_str: string = ref_retData["data"][0]["biBeginDate"];
              const biBeginDate = new Date(biBeginDate_str);
              const today = new Date();
              const diff_ms: number = biBeginDate.valueOf() - today.valueOf();
              // if (Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) > 90) {
              //   rep({
              //     code: 400,
              //     msg: "商业险起保日期距今超过90天"
              //   });
              //   return;
              // }

              const acc_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

              const acc_cityCode = "110100"; // Beijing

              const acc_carInfo = {
                "licenseNo": vehicleInfo["licenseNo"],
                "frameNo": vehicleInfo["frameNo"], // 如果有修改车架号,就一定要传,没有修改的话,就不传.为 null
                "modelCode": vehicleInfo["model"][modelListOrder]["brandCode"], // ?
                "engineNo": vehicleInfo["engineNo"],
                "isTrans": "0", // isTrans,
                "transDate": null,
                "registerDate": vehicleInfo["firstRegisterDate"]
              };

              const acc_persionInfo: Object = {
                "insuredID": ownerId,
                "ownerName": ownerName,
                "ownerID": ownerId,
                "ownerMobile": ownerCellPhone,
                "insuredName": ownerName,
                "insuredMobile": ownerCellPhone
              };

              const acc_coverageList = [
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

                const acc_data = {
                  applicationID: "FENGCHAOHUZHU_SERVICE",
                  insurerCode: "APIC",
                  biBeginDate: ref_retData["data"][0]["biBeginDate"],
                  ciBeginDate: ref_retData["data"][0]["ciBeginDate"],
                  cityCode: acc_cityCode,
                  responseNo: vehicleInfo["responseNo"],
                  channelCode: null,
                  carInfo: acc_carInfo,
                  thpBizID: "20161213fuyuhintest",
                  personInfo: acc_persionInfo,
                  coverageList: acc_coverageList
                };

                const acc_requestData = {
                  operType: "ACCPRICE",
                  msg: "精准报价",
                  sendTime: acc_sendTimeString,
                  sign: null,
                  data: acc_data
                };

                const acc_postData: string = JSON.stringify(acc_requestData);
                log.info("acc_postData:");
                log.info(acc_postData);

                const acc_options = {
                  hostname: "api.ztwltech.com",
                  method: "POST",
                  path: "/zkyq-web/pottingApi/CalculateApi",
                  headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(acc_postData)
                  }
                };

                const acc_req = http.request(acc_options, function (res) {
                  log.info("Status: " + res.statusCode);
                  res.setEncoding("utf8");

                  let acc_result: string = "";

                  res.on("data", function (body) {
                    acc_result += body;
                  });

                  res.on("end", function () {
                    log.info("Here is acc_result");
                    const acc_retData: Object = JSON.parse(acc_result);
                    log.info(acc_result);
                    if (acc_retData["state"] === "1") {
                      const coverageList = acc_retData["data"][0]["coverageList"];
                      const modified_coverageList = {};
                      log.info(coverageList.toString());
                      for (let i = 0; i < coverageList.length; i++) {
                        modified_coverageList[(coverageList[i]["coverageCode"]).toString()] = coverageList[i];
                      }

                      const A_free: number = Number(modified_coverageList["A"]["insuredPremium"]) * 1.15 * 0.65;
                      const B_free: number = Number(modified_coverageList["B"]["insuredPremium"]);
                      const F_free: number = Number(modified_coverageList["F"]["insuredPremium"]) * 0.65;
                      const FORCEPREMIUM_free: number = Number(modified_coverageList["FORCEPREMIUM"]["insuredPremium"]);
                      const G1_free: number = Number(modified_coverageList["G1"]["insuredPremium"]) * 1.2 * 0.66;
                      const X1_free: number = Number(modified_coverageList["X1"]["insuredPremium"]) * 1.15 * 0.65;
                      const Z_free: number = Number(modified_coverageList["Z"]["insuredPremium"]) * 1.2 * 0.65;
                      const Z3_free: number = Number(modified_coverageList["Z3"]["insuredPremium"]) * 0.65;

                      const B_insured_amount_list: string[] = ["5万", "10万", "15万", "20万", "30万", "50万", "100万"];// , "150万", "200万", "300万", "500万"];

                      const D_of_Amount_seat: number[][] = [
                        [394.55, 570.05, 649.35, 706.55, 796.90, 956.80, 1246.05], // 1430.37, 1589.19, 1897.30, 2494.46],
                        [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96],
                        [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96]
                      ];

                      const B: number = B_free / 796.9;

                      let seat = Number(vehicleInfo["model"][modelListOrder]["seat"]);

                      if (seat < 6) {
                        seat = 0;
                      } else if (seat >= 6 && seat <= 10) {
                        seat = 1;
                      } else {
                        seat = 2;
                      }

                      const E_list = [];

                      const B_free_list = {};
                      for (let i = 0; i < D_of_Amount_seat[seat].length; i++) {
                        E_list[i] = D_of_Amount_seat[seat][i] * B;
                        B_free_list[B_insured_amount_list[i]] = E_list[i].toFixed(2);
                      }

                      modified_coverageList["A"]["modifiedPremium"] = A_free.toFixed(2);
                      modified_coverageList["B"]["modifiedPremium"] = B_free_list;
                      modified_coverageList["F"]["modifiedPremium"] = F_free.toFixed(2);
                      modified_coverageList["FORCEPREMIUM"]["modifiedPremium"] = FORCEPREMIUM_free.toFixed(2);
                      modified_coverageList["G1"]["modifiedPremium"] = G1_free.toFixed(2);
                      modified_coverageList["X1"]["modifiedPremium"] = X1_free.toFixed(2);
                      modified_coverageList["Z"]["modifiedPremium"] = Z_free.toFixed(2);
                      modified_coverageList["Z3"]["modifiedPremium"] = Z3_free.toFixed(2);

                      const registerDate = new Date(vehicleInfo["firstRegisterDate"]);
                      const acc_today = new Date();

                      const acc_diff_ms: number = acc_today.valueOf() - registerDate.valueOf();
                      const past_two_years: number = (Math.ceil(acc_diff_ms / (1000 * 60 * 60 * 24)) > 365 * 2) ? 1 : 0;

                      const newCarPrice = Number(vehicleInfo["model"][modelListOrder]["newCarPrice"]);
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

                      modified_coverageList["Scratch"] = {
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

                      acc_retData["data"][0]["coverageList"] = modified_coverageList;
                      acc_retData["data"][0]["purchasePrice"] = vehicleInfo["model"][modelListOrder]["purchasePrice"];

                      rep({
                        code: 200,
                        data: acc_retData["data"][0]
                      });

                    } else {
                      rep({
                        code: 400,
                        msg: acc_retData["msg"] + ": " + acc_retData["data"][0]["msg"]
                      });
                    }
                  });


                  res.on('error', (e) => {
                    log.info(`problem with request: ${e.message}`);
                    rep({
                      code: 500,
                      msg: e.message
                    });
                  });
                });

                acc_req.end(acc_postData);

            } else {
              rep({
                code: 400,
                msg: ref_retData["msg"]
              });
            }
          });

          ref_req.on('error', (e) => {
            log.info(`problem with request: ${e.message}`);
            rep({
              code: 500,
              msg: e.message
            });
          });
        });

        ref_req.end(ref_postData);
    } else {
      rep({
        code: 500,
        msg: "Not found carInfo from redis!"
      });
    }

  });
});

log.info("Start quotation server");

