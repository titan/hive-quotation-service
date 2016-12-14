import { Server, Config, Context, ResponseFunction, Permission, rpc, wait_for_response } from "hive-server";
import { Quota, Price, Item, Group } from "./quotation-definations";
import { RedisClient } from "redis";
import * as nanomsg from "nanomsg";
import * as msgpack from "msgpack-lite";
import * as http from "http";
import * as bunyan from "bunyan";
import * as uuid from "node-uuid";
import { servermap, triggermap } from "hive-hostmap";
import { verify, uuidVerifier, stringVerifier, numberVerifier } from "hive-verify";

let log = bunyan.createLogger({
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

let list_key = "quotations";
let entity_key = "quotation-entities";
let quotated_key = "quotated-quotations";
let unquotated_key = "unquotated-quotations";

let config: Config = {
  svraddr: servermap["quotation"],
  msgaddr: "ipc:///tmp/quotation.ipc",
  cacheaddr: process.env["CACHE_HOST"]
};

let svc = new Server(config);

let permissions: Permission[] = [["mobile", true], ["admin", true]];

// 创建报价
// svc.call("createQuotation", permissions, (ctx: Context, rep: ResponseFunction, vid: string, VIN: string) => {
//   if (!verify([uuidVerifier("vid", vid), stringVerifier("VIN", VIN)], (errors: string[]) => {
//     log.info("arg not match");
//     rep({
//       code: 400,
//       msg: errors.join("\n")
//     });
//   })) {
//     return;
//   }
//   let qid = uuid.v1();
//   let state: number = 1;
//   let domain = ctx.domain;
//   let args = [qid, vid, state, qid, VIN, domain];
//   log.info("createQuotation " + JSON.stringify(args));
//   ctx.msgqueue.send(msgpack.encode({ cmd: "createQuotation", args: args }));
//   wait_for_response(ctx.cache, qid, rep);
// });
svc.call("createQuotation", permissions, (ctx: Context, rep: ResponseFunction, vid: string, VIN: string) => {
  if (!verify([uuidVerifier("vid", vid), stringVerifier("VIN", VIN)], (errors: string[]) => {
    log.info("arg not match " + errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  let qid = uuid.v1();
  let state: number = 1;
  let domain = ctx.domain;
  let args = [qid, vid, state, qid, domain, VIN];
  log.info("createQuotation " + JSON.stringify(args));
  ctx.msgqueue.send(msgpack.encode({ cmd: "createQuotation", args: args }));
  wait_for_response(ctx.cache, qid, rep);
});

// 增加报价组
svc.call("addQuotationGroups", permissions, (ctx: Context, rep: ResponseFunction, qid: string, vid: string, groups: Group[], promotion: number) => {
  log.info("addQuotationGroups qid: %s, vid: %s, promotion: %d, %s", qid, vid, promotion, typeof (promotion));
  if (!verify([uuidVerifier("qid", qid), uuidVerifier("vid", vid), numberVerifier("promotion", promotion)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  let state: number = 3;
  const callback = uuid.v1();
  let domain = ctx.domain;
  let args = [qid, vid, state, groups, promotion, callback, domain];
  ctx.msgqueue.send(msgpack.encode({ cmd: "addQuotationGroups", args: args }));
  wait_for_response(ctx.cache, callback, rep);
});


function checkArgs(arg, sarg) {
  if (sarg === null || sarg === undefined || sarg === '') {
    return true;
  } else {
    if (arg === sarg) {
      return true;
    } else {
      return false;
    }
  }
}

function checkDate(datetime) {
  if (datetime === null || datetime == undefined || datetime === '') {
    return false;
  } else {
    return true;
  }
}

function filterDate(created_at, begintime, endtime) {
  let arg = (new Date(created_at)).getTime();
  if (checkDate(begintime) && checkDate(endtime)) {
    let sbegintime = begintime.getTime();
    let sendtime = endtime.getTime();
    if (arg >= sbegintime && arg <= sendtime) {
      return true;
    } else {
      return false;
    }
  } else if (checkDate(begintime)) {
    let sbegintime = begintime.getTime();
    if (arg >= sbegintime) {
      return true;
    } else {
      return false;
    }
  } else if (checkDate(endtime)) {
    let sendtime = endtime.getTime();
    if (arg <= sendtime) {
      return true;
    } else {
      return false;
    }
  } else {
    return true;
  }
}
function quotation_filter_recursive(cache, entity_key, key, keys, cursor, len, svehicleid, sownername, sphone, slicense_no, sbegintime, sendtime, sstate, acc, cb) {
  cache.hget(entity_key, key, function (err, result) {
    let quotation = JSON.parse(result);
    if (quotation && quotation["vehicle"] && quotation["vehicle"]["owner"]) {
      if (checkArgs(quotation["vehicle"]["owner"]["name"], sownername) && checkArgs(quotation["vehicle"]["owner"]["phone"], sphone) && checkArgs(quotation["vehicle"]["license_no"], slicense_no) && checkArgs(quotation["state"], sstate)) {
        if (checkArgs(quotation["vehicle"]["vin_code"], svehicleid) && filterDate(quotation["created_at"], sbegintime, sendtime)) {
          acc.push(quotation);
        }
      }
    }
    if (acc.length === len || cursor === keys.length - 1) {
      cb(acc, cursor);
    } else {
      cursor++;
      key = keys[cursor];
      quotation_filter_recursive(cache, entity_key, key, keys, cursor, len, svehicleid, sownername, sphone, slicense_no, sbegintime, sendtime, sstate, acc, cb);
    }
  });
}

// 获取已报价
svc.call("getQuotatedQuotations", permissions, (ctx: Context, rep: ResponseFunction, start: number, limit: number, maxScore: number, nowScore: number, svehicleid: string, sownername: string, sphone: string, slicense_no: string, sbegintime: string, sendtime: string, sstate: string) => {
  log.info("getQuotatedQuotations");
  if (!verify([numberVerifier("start", start), numberVerifier("limit", limit), numberVerifier("maxScore", maxScore), numberVerifier("nowScore", nowScore)], (errors: string[]) => {
    log.error(errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.zrevrangebyscore(quotated_key, maxScore, 0, function (err, result) {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else if (result) {
      let cursor = start;
      let len = limit - start + 1;
      if (result.length - 1 < limit) {
        len = result.length;
      }
      quotation_filter_recursive(ctx.cache, entity_key, result[cursor], result, cursor, len, svehicleid, sownername, sphone, slicense_no, sbegintime, sendtime, sstate, [], (quotations, cursor) => {
        ctx.cache.zrevrangebyscore(quotated_key, nowScore, maxScore, function (err2, result3) {
          if (err2) {
            rep({ code: 500, msg: err2.message });
          } else if (result3) {
            rep({ code: 200, data: quotations, len: result.length, newQuotated: result3.length, cursor: cursor });
          } else {
            rep({ code: 200, data: quotations, len: result.length, newQuotated: 0 });
          }
        });
      });
    } else {
      rep({ code: 404, msg: "Not found quotated quotation" });
    }
  });
});
// 获取未报价
svc.call("getUnquotatedQuotations", permissions, (ctx: Context, rep: ResponseFunction, start: number, limit: number, maxScore: number, nowScore: number, svehicleid: string, sownername: string, sphone: string, slicense_no: string, sbegintime: string, sendtime: string, sstate: string) => {
  log.info("getUnquotatedQuotations");
  if (!verify([numberVerifier("start", start), numberVerifier("limit", limit), numberVerifier("maxScore", maxScore), numberVerifier("nowScore", nowScore)], (errors: string[]) => {
    log.error(errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.zrevrangebyscore(unquotated_key, maxScore, 0, function (err, result) {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else if (result) {
      let cursor = start;
      let len = limit - start + 1;
      if (result.length - 1 < limit) {
        len = result.length;
      }
      quotation_filter_recursive(ctx.cache, entity_key, result[cursor], result, cursor, len, svehicleid, sownername, sphone, slicense_no, sbegintime, sendtime, sstate, [], (quotations, cursor) => {
        ctx.cache.zrevrangebyscore(unquotated_key, nowScore, maxScore, function (err2, result3) {
          if (err2) {
            rep({ code: 500, msg: err2.message });
          } else if (result3) {
            rep({ code: 200, data: quotations, len: result.length, newQuotated: result3.length, cursor: cursor });
          } else {
            rep({ code: 200, data: quotations, len: result.length, newQuotated: 0 });
          }
        });
      });
    } else {
      rep({ code: 404, msg: "Not found quotated quotation" });
    }
  });
});

// 获取所有报价
svc.call("getQuotations", permissions, (ctx: Context, rep: ResponseFunction) => {
  log.info("getQuotations");
  ctx.cache.smembers(list_key, function (err, result) {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else {
      let multi = ctx.cache.multi();
      for (let id of result) {
        multi.hget(entity_key, id);
      }
      multi.exec((err1, result2) => {
        if (err1) {
          rep({ code: 500, msg: err1.message });
        } else {
          rep({ code: 200, data: result2.map(e => JSON.parse(e)) });
        }
      });
    }
  });
});

// 获取一个报价
svc.call("getQuotation", permissions, (ctx: Context, rep: ResponseFunction, qid: string) => {
  log.info("getQuotation, qid: %s", qid);
  if (!verify([uuidVerifier("qid", qid)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.hget(entity_key, qid, (err, quotation) => {
    if (err) {
      log.info("getQuotation" + err);
      rep({ code: 500, msg: err.message });
    } else if (quotation) {
      rep({ code: 200, data: JSON.parse(quotation) });
    } else {
      rep({ code: 404, msg: "Quotation not found" });
    }
  });
});

// 获取二维码
svc.call("getTicket", permissions, (ctx: Context, rep: ResponseFunction, oid: string) => {
  log.info("getTicket, openid %s", oid);
  if (!verify([stringVerifier("oid", oid)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.hget("openid_ticket", oid, (err, result) => {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else {
      if (result) {
        let json1 = JSON.parse(result);
        ctx.cache.hget("wechat_code1", json1.ticket, (err2, result2) => {
          if (err2) {
            rep({ code: 500, msg: err2.message });
          } else if (result2 !== null && result2 != '' && result2 != undefined) {
            rep({ code: 200, data: JSON.parse(result2) });
          } else {
            rep({ code: 404, msg: "Ticket not found" })
          }
        });
      } else {
        rep({ code: 404, msg: "Ticket not found" });
      }
    }
  });
});

// refresh
svc.call("refresh", permissions, (ctx: Context, rep: ResponseFunction) => {
  log.info("refresh");
  let cbflag = uuid.v1();
  ctx.msgqueue.send(msgpack.encode({ cmd: "refresh", args: [ctx.domain, cbflag] }));
  wait_for_response(ctx.cache, cbflag, rep)
});

// 新消息提醒 
svc.call("newMessageNotify", permissions, (ctx: Context, rep: ResponseFunction) => {
  log.info("newMessageNotify");

  let newQuotations = 0;
  let newOrders = 0;
  let newPays = 0;
  function async_serial_ignore<T>(ps: Promise<T>[], acc: T[], errs: any, cb: (vals: T[], errs: any) => void) {
    if (ps.length === 0) {
      cb(acc, errs);
    } else {
      let p = ps.shift();
      p.then(val => {
        acc.push(val);
        async_serial_ignore(ps, acc, errs, cb);
      }).catch((e: Error) => {
        errs.push(e);
        async_serial_ignore(ps, acc, errs, cb);
      });
    }
  }
  let quotation = new Promise<number>((resolve, reject) => {
    ctx.cache.zrange(unquotated_key, 0, -1, function (err, quotationkeys) {
      if (quotationkeys) {
        let multi = ctx.cache.multi();
        for (let key of quotationkeys) {
          multi.hget(entity_key, key);
        }
        multi.exec((err2, result2) => {
          if (result2) {
            let quotations = result2.filter(e => JSON.parse(e)["state"] !== 4).map(e => JSON.parse(e)["id"]);
            let len = quotations.length;
            resolve(len);
          } else if (err2) {
            reject(err2);
          } else {
            reject("quotation is null");
          }
        });
      } else if (err) {
        log.info("quotation err " + err);
        reject(err);
      } else {
        reject({});
      }
    });
  });
  let order = new Promise<number>((resolve, reject) => {
    ctx.cache.zrange("new-orders-id", 0, -1, function (err, orderkeys) {
      if (orderkeys) {
        resolve(orderkeys.length);
      } else if (err) {
        log.info("order err " + err);
        reject(err);
      } else {
        reject({});
      }
    });
  });
  let pay = new Promise<number>((resolve, reject) => {
    ctx.cache.zrange("new-pays-id", 0, -1, function (err, paykeys) {
      if (paykeys) {
        resolve(paykeys.length);
      } else if (err) {
        log.info("pay err " + err);
        reject(err);
      } else {
        reject({});
      }
    });
  });
  let promises = [quotation, order, pay];
  async_serial_ignore<Object[]>(promises, [], [], (vreps, errs) => {
    if (errs.length != 0) {
      rep({ code: 500, msg: errs });
    } else {
      rep({ code: 200, data: { "quotations": vreps[0], "orders": vreps[1], "pays": vreps[2] } });
    }
  });
});




/****************************************/




svc.call("getReferenceQuotation", permissions, (ctx: Context, rep: ResponseFunction,
  licenseNumber: string,
  modelListOrder: number,
) => {
  log.info("licenseNumber " + licenseNumber);
  if (!verify([stringVerifier("licenseNumber", licenseNumber)], (errors: string[]) => {
    log.info(errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.hget("vehicle-info", licenseNumber, function (err, vehicleInfo_str) {
    log.info("Try to get carInfo from redis:");
    log.info(vehicleInfo_str);

    if (err) {
      rep({
        code: 400,
        msg: "Error on getting carInfo from redis!"
      });
    } else if (vehicleInfo_str) {

      let vehicleInfo = JSON.parse(vehicleInfo_str);
      let ref_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

      let ref_cityCode = "110100"; // Beijing

      let ref_carInfo = {
        "licenseNo": vehicleInfo["licenseNo"],
        "frameNo": null, // vehicleInfo["frameNo"],
        "modelCode": vehicleInfo["modelList"]["data"][modelListOrder]["brandCode"],
        "engineNo": null,// vehicleInfo["engineNo"],
        "isTrans": "0",
        "transDate": null,
        "registerDate": vehicleInfo["firstRegisterDate"]
      };

      let ref_persionInfo: Object = {
        "ownerName": null,         // N
        "ownerID": null,             // N
        "ownerMobile": null,  // N
      };

      let ref_coverageList = [
        {
          "coverageCode": "A",
          "coverageName": "机动车损失保险",
          "insuredAmount": "Y",
          "insuredPremium": null, // "1323.7600",
          "flag": null
        }];


      let ref_data = {
        applicationID: "FENGCHAOHUZHU_SERVICE",
        cityCode: ref_cityCode,
        responseNo: vehicleInfo["responseNo"],
        carInfo: ref_carInfo,
        personInfo: ref_persionInfo,
        insurerCode: "APIC",
        coverageList: ref_coverageList
      };

      let ref_requestData = {
        operType: "REF",
        msg: "参考报价",
        sendTime: ref_sendTimeString,
        sign: null,
        data: ref_data
      };

      let ref_postData: string = JSON.stringify(ref_requestData);
      log.info("ref_postData:");
      log.info(ref_postData);

      let ref_options = {
        hostname: "api.ztwltech.com",
        method: "POST",
        path: "/zkyq-web/calculate/entrance",
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(ref_postData)
        }
      };

      let ref_req = http.request(ref_options, function (res) {
        log.info("Status: " + res.statusCode);
        res.setEncoding("utf8");

        let ref_result: string = "";

        res.on("data", function (body) {
          ref_result += body;
        });

        res.on("end", function () {
          let ref_retData: Object = JSON.parse(ref_result);
          log.info("Here is REF retData:");
          log.info(ref_result);

          if (ref_retData["state"] === "1") {
            let ref_biBeginDate = new Date(ref_retData["data"][0]["biBeginDate"]);
            let today = new Date();
            let diff_ms: number = ref_biBeginDate.valueOf() - today.valueOf();
            if (Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) > 90 || Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) < 2) {
              rep({
                code: 400,
                msg: "商业险起保日期(" + ref_retData["data"][0]["biBeginDate"] + ")距今超过90天"
              });
            } else {
              log.info("state===1" + ref_retData["data"][0]["biBeginDate"]);
              
              let two_dates: Object = {
                "biBeginDate": ref_retData["data"][0]["biBeginDate"],
                "ciBeginDate": ref_retData["data"][0]["ciBeginDate"]
              }

              log.info(JSON.stringify(two_dates));
              rep({
                code: 200,
                data: two_dates
              });
              ctx.cache.hset("license-two-dates", licenseNumber, JSON.stringify(two_dates));
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
});

svc.call("getAccurateQuotation", permissions, (ctx: Context, rep: ResponseFunction,
  ownerId: string,
  ownerName: string,
  ownerCellPhone: string,

  licenseNumber: string,
  modelListOrder: number,

  // isTrans: string,
  // transDate: string,
  // cityCode: string,

) => {
  // log.info("licenseNumber " + licenseNumber);
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
  // log.info("fuck!");

  ctx.cache.hget("vehicle-info", licenseNumber, function (err, vehicleInfo_str) {
    log.info("Try to get carInfo from redis:");
    log.info(vehicleInfo_str);
    if (err) {
      log.info(`problem with request: ${err.message}`);
      rep({
        code: 500,
        msg: err.message
      });
    } else if (vehicleInfo_str) {
      ctx.cache.hget("license-two-dates", licenseNumber, function (err, two_dates_str) {
        // let sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        if (err) {
          log.info(`problem with request: ${err.message}`);
          rep({
            code: 500,
            msg: err.message
          });
        } else if (two_dates_str) {

          let two_dates = JSON.parse(two_dates_str);
          let vehicleInfo = JSON.parse(vehicleInfo_str);

          let acc_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

          let acc_cityCode = "110100"; // Beijing

          let acc_carInfo = {
            "licenseNo": vehicleInfo["licenseNo"],
            "frameNo": vehicleInfo["frameNo"], // 如果有修改车架号,就一定要传,没有修改的话,就不传.为 null
            "modelCode": vehicleInfo["modelList"]["data"][modelListOrder]["brandCode"],
            "engineNo": vehicleInfo["engineNo"],
            "isTrans": "0",
            "transDate": null,
            "registerDate": vehicleInfo["firstRegisterDate"]
          };

          let acc_persionInfo: Object = {
            "insuredID": ownerId,
            "ownerName": ownerName,
            "ownerID": ownerId,
            "ownerMobile": ownerCellPhone,
            "insuredName": ownerName,
            "insuredMobile": ownerCellPhone
          };

          let acc_coverageList = [
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

          let acc_data = {
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

          let acc_requestData = {
            operType: "ACCPRICE",
            msg: "精准报价",
            sendTime: acc_sendTimeString,
            sign: null,
            data: acc_data
          };

          let acc_postData: string = JSON.stringify(acc_requestData);
          log.info("acc_postData:");
          log.info(acc_postData);

          let acc_options = {
            hostname: "api.ztwltech.com",
            method: "POST",
            path: "/zkyq-web/pottingApi/CalculateApi",
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(acc_postData)
            }
          };

          let acc_req = http.request(acc_options, function (res) {
            log.info("Status: " + res.statusCode);
            res.setEncoding("utf8");

            let acc_result: string = "";

            res.on("data", function (body) {
              acc_result += body;
            });

            res.on("end", function () {
              log.info("Here is acc_result");
              let acc_retData: Object = JSON.parse(acc_result);
              log.info(acc_result);
              log.info("Bitch!");
              if (acc_retData["state"] === "1") {
                let coverageList = acc_retData["data"][0]["coverageList"];
                let modified_coverageList = {};
                log.info("Fuck!");
                log.info(coverageList.toString());
                for (let i = 0; i < coverageList.length; i++) {
                  modified_coverageList[(coverageList[i]["coverageCode"]).toString()] = coverageList[i];
                }

                // let modified_List

                // for (let i = 0; i < modified_coverageList.length; i++) {
                //   modified_coverageList[i]["modifiedPremium"] = null;
                // }

                let A_free: number = Number(modified_coverageList["A"]["insuredPremium"]) * 1.15 * 0.65;
                let B_free: number = Number(modified_coverageList["B"]["insuredPremium"]);
                let F_free: number = Number(modified_coverageList["F"]["insuredPremium"]) * 0.65;
                let FORCEPREMIUM_free: number = Number(modified_coverageList["FORCEPREMIUM"]["insuredPremium"]);
                let G1_free: number = Number(modified_coverageList["G1"]["insuredPremium"]) * 1.2 * 0.66;
                let X1_free: number = Number(modified_coverageList["X1"]["insuredPremium"]) * 1.15 * 0.65;
                let Z_free: number = Number(modified_coverageList["Z"]["insuredPremium"]) * 1.2 * 0.65;
                let Z3_free: number = Number(modified_coverageList["Z3"]["insuredPremium"]) * 0.65;

                let B_insured_amount_list: string[] = ["5万", "10万", "15万", "20万", "30万", "50万", "100万"];// , "150万", "200万", "300万", "500万"];

                let D_of_Amount_seat: number[][] = [
                  [394.55, 570.05, 649.35, 706.55, 796.90, 956.80, 1246.05], // 1430.37, 1589.19, 1897.30, 2494.46],
                  [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96],
                  [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96]
                ];

                let B: number = B_free / 796.9;

                let seat = Number(vehicleInfo["modelList"]["data"][modelListOrder]["seat"]);

                if (seat < 6) {
                  seat = 0;
                } else if (seat >= 6 && seat <= 10) {
                  seat = 1;
                } else {
                  seat = 2;
                }

                let E_list = [];

                let B_free_list = {};
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

                let registerDate = new Date(vehicleInfo["firstRegisterDate"]);
                let acc_today = new Date();

                let acc_diff_ms: number = acc_today.valueOf() - registerDate.valueOf();
                let past_two_years: number;

                if (Math.ceil(acc_diff_ms / (1000 * 60 * 60 * 24)) > 365 * 2) {
                  past_two_years = 1;
                } else {
                  past_two_years = 0;
                }

                let newCarPrice = Number(vehicleInfo["modelList"]["data"][modelListOrder]["newCarPrice"]);
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

                let three_parts_price_table = [
                  [202, 214, 249, 451, 742],
                  [308, 326, 380, 694, 960]
                ];

                let six_parts_price_table = [
                  [303, 320, 374, 632, 1186],
                  [446, 472, 551, 972, 1535]
                ];

                modified_coverageList["Scratch3"] = {
                  "coverageCode": "Scratch3",
                  "coverageName": "车身划痕损失（3块漆)",
                  "insuredAmount": "",
                  "insuredPremium": three_parts_price_table[past_two_years][index_of_newCarPrice].toString(),
                  "flag": null,
                  "modifiedPremium": three_parts_price_table[past_two_years][index_of_newCarPrice].toString()
                };

                modified_coverageList["Scratch6"] = {
                  "coverageCode": "Scratch6",
                  "coverageName": "车身划痕损失（6块漆)",
                  "insuredAmount": "",
                  "insuredPremium": six_parts_price_table[past_two_years][index_of_newCarPrice].toString(),
                  "flag": null,
                  "modifiedPremium": six_parts_price_table[past_two_years][index_of_newCarPrice].toString()
                };

                acc_retData["data"][0]["coverageList"] = modified_coverageList;
                acc_retData["data"][0]["purchasePrice"] = vehicleInfo["modelList"]["data"][modelListOrder]["purchasePrice"];

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
            msg: "Not found biBeginDate & ciBeginDate in redis!"
          });
        }
        // req.end(postData);
      });
    } else {
      rep({
        code: 400,
        msg: "Not found vehicleInfo_str in redis!"
      });
    }
  });
});


svc.call("getAccurateQuotationForTest", permissions, (ctx: Context, rep: ResponseFunction,
  ownerId: string,
  ownerName: string,
  ownerCellPhone: string,

  licenseNumber: string,
  modelListOrder: number,
) => {
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

      let vehicleInfo = JSON.parse(vehicleInfo_str);
      let ref_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

      let ref_cityCode = "110100"; // Beijing

      let ref_carInfo = {
        "licenseNo": vehicleInfo["licenseNo"],
        "frameNo": null, // vehicleInfo["frameNo"],
        "modelCode": vehicleInfo["modelList"]["data"][modelListOrder]["brandCode"],
        "engineNo": null,// vehicleInfo["engineNo"],
        "isTrans": "0",
        "transDate": null,
        "registerDate": vehicleInfo["firstRegisterDate"]
      };

      let ref_persionInfo: Object = {
        "ownerName": null,         // N
        "ownerID": null,             // N
        "ownerMobile": null,  // N
      };

      let ref_coverageList = [
        {
          "coverageCode": "A",
          "coverageName": "机动车损失保险",
          "insuredAmount": "Y",
          "insuredPremium": null, // "1323.7600",
          "flag": null
        }];


      let ref_data = {
        applicationID: "FENGCHAOHUZHU_SERVICE", // "ZKYQ"
        cityCode: ref_cityCode,
        responseNo: vehicleInfo["responseNo"],
        carInfo: ref_carInfo,
        personInfo: ref_persionInfo,
        insurerCode: "APIC",            // APIC 永诚 该载体暂不支持此保险公司报价 没有给你们配永城，现在测试环境值给你们配置太保人保和阳光
        coverageList: ref_coverageList
      };

      let ref_requestData = {
        operType: "REF",
        msg: "参考报价",
        sendTime: ref_sendTimeString,
        sign: null,
        data: ref_data
      };

      let ref_postData: string = JSON.stringify(ref_requestData);
      log.info("ref_postData:");
      log.info(ref_postData);

      let ref_options = {
        hostname: "api.ztwltech.com",
        // port: 8081,
        method: "POST",
        path: "/zkyq-web/calculate/entrance",
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(ref_postData)
        }
      };

      let ref_req = http.request(ref_options, function (res) {
        log.info("Status: " + res.statusCode);
        res.setEncoding("utf8");

        let ref_result: string = "";

        res.on("data", function (body) {
          ref_result += body;
        });

        res.on("end", function () {

          let ref_retData: Object = JSON.parse(ref_result);
          log.info("Here is REF retData:");
          log.info(ref_result);
          if (ref_retData["state"] === "1") {
            let biBeginDate_str: string = ref_retData["data"][0]["biBeginDate"];
            let biBeginDate = new Date(biBeginDate_str);
            let today = new Date();
            let diff_ms: number = biBeginDate.valueOf() - today.valueOf();
            // if (Math.ceil(diff_ms / (1000 * 60 * 60 * 24)) > 90) {
            //   rep({
            //     code: 400,
            //     msg: "商业险起保日期距今超过90天"
            //   });
            //   return;
            // }

            let acc_sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

            let acc_cityCode = "110100"; // Beijing

            let acc_carInfo = {
              "licenseNo": vehicleInfo["licenseNo"],
              "frameNo": vehicleInfo["frameNo"], // 如果有修改车架号,就一定要传,没有修改的话,就不传.为 null
              "modelCode": vehicleInfo["modelList"]["data"][modelListOrder]["brandCode"], // ?
              "engineNo": vehicleInfo["engineNo"],
              "isTrans": "0", // isTrans,
              "transDate": null,
              "registerDate": vehicleInfo["firstRegisterDate"]
            };

            let acc_persionInfo: Object = {
              "insuredID": ownerId,
              "ownerName": ownerName,
              "ownerID": ownerId,
              "ownerMobile": ownerCellPhone,
              "insuredName": ownerName,
              "insuredMobile": ownerCellPhone
            };

            let acc_coverageList = [
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

            let acc_data = {
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

            let acc_requestData = {
              operType: "ACCPRICE",
              msg: "精准报价",
              sendTime: acc_sendTimeString,
              sign: null,
              data: acc_data
            };

            let acc_postData: string = JSON.stringify(acc_requestData);
            log.info("acc_postData:");
            log.info(acc_postData);

            let acc_options = {
              hostname: "api.ztwltech.com",
              method: "POST",
              path: "/zkyq-web/pottingApi/CalculateApi",
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(acc_postData)
              }
            };

            let acc_req = http.request(acc_options, function (res) {
              log.info("Status: " + res.statusCode);
              res.setEncoding("utf8");

              let acc_result: string = "";

              res.on("data", function (body) {
                acc_result += body;
              });

              res.on("end", function () {
                log.info("Here is acc_result");
                let acc_retData: Object = JSON.parse(acc_result);
                log.info(acc_result);
                log.info("Bitch!");
                if (acc_retData["state"] === "1") {
                  let coverageList = acc_retData["data"][0]["coverageList"];
                  let modified_coverageList = {};
                  log.info("Fuck!");
                  log.info(coverageList.toString());
                  for (let i = 0; i < coverageList.length; i++) {
                    modified_coverageList[(coverageList[i]["coverageCode"]).toString()] = coverageList[i];
                  }

                  // let modified_List

                  // for (let i = 0; i < modified_coverageList.length; i++) {
                  //   modified_coverageList[i]["modifiedPremium"] = null;
                  // }

                  let A_free: number = Number(modified_coverageList["A"]["insuredPremium"]) * 1.15 * 0.65;
                  let B_free: number = Number(modified_coverageList["B"]["insuredPremium"]);
                  let F_free: number = Number(modified_coverageList["F"]["insuredPremium"]) * 0.65;
                  let FORCEPREMIUM_free: number = Number(modified_coverageList["FORCEPREMIUM"]["insuredPremium"]);
                  let G1_free: number = Number(modified_coverageList["G1"]["insuredPremium"]) * 1.2 * 0.66;
                  let X1_free: number = Number(modified_coverageList["X1"]["insuredPremium"]) * 1.15 * 0.65;
                  let Z_free: number = Number(modified_coverageList["Z"]["insuredPremium"]) * 1.2 * 0.65;
                  let Z3_free: number = Number(modified_coverageList["Z3"]["insuredPremium"]) * 0.65;

                  let B_insured_amount_list: string[] = ["5万", "10万", "15万", "20万", "30万", "50万", "100万"];// , "150万", "200万", "300万", "500万"];

                  let D_of_Amount_seat: number[][] = [
                    [394.55, 570.05, 649.35, 706.55, 796.90, 956.80, 1246.05], // 1430.37, 1589.19, 1897.30, 2494.46],
                    [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96],
                    [365.30, 514.80, 581.75, 627.25, 702.65, 836.55, 1089.40], // 1250.60, 1389.46, 1658.85, 2180.96]
                  ];

                  let B: number = B_free / 796.9;

                  let seat = Number(vehicleInfo["modelList"]["data"][modelListOrder]["seat"]);

                  if (seat < 6) {
                    seat = 0;
                  } else if (seat >= 6 && seat <= 10) {
                    seat = 1;
                  } else {
                    seat = 2;
                  }

                  let E_list = [];

                  let B_free_list = {};
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

                  let registerDate = new Date(vehicleInfo["firstRegisterDate"]);
                  let acc_today = new Date();

                  let acc_diff_ms: number = acc_today.valueOf() - registerDate.valueOf();
                  let past_two_years: number;

                  if (Math.ceil(acc_diff_ms / (1000 * 60 * 60 * 24)) > 365 * 2) {
                    past_two_years = 1;
                  } else {
                    past_two_years = 0;
                  }

                  let newCarPrice = Number(vehicleInfo["modelList"]["data"][modelListOrder]["newCarPrice"]);
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

                  let three_parts_price_table = [
                    [202, 214, 249, 451, 742],
                    [308, 326, 380, 694, 960]
                  ];

                  let six_parts_price_table = [
                    [303, 320, 374, 632, 1186],
                    [446, 472, 551, 972, 1535]
                  ];

                  modified_coverageList["Scratch3"] = {
                    "coverageCode": "Scratch3",
                    "coverageName": "车身划痕损失（3块漆)",
                    "insuredAmount": "",
                    "insuredPremium": three_parts_price_table[past_two_years][index_of_newCarPrice].toString(),
                    "flag": null,
                    "modifiedPremium": three_parts_price_table[past_two_years][index_of_newCarPrice].toString()
                  };

                  modified_coverageList["Scratch6"] = {
                    "coverageCode": "Scratch6",
                    "coverageName": "车身划痕损失（6块漆)",
                    "insuredAmount": "",
                    "insuredPremium": six_parts_price_table[past_two_years][index_of_newCarPrice].toString(),
                    "flag": null,
                    "modifiedPremium": six_parts_price_table[past_two_years][index_of_newCarPrice].toString()
                  };

                  acc_retData["data"][0]["coverageList"] = modified_coverageList;
                  acc_retData["data"][0]["purchasePrice"] = vehicleInfo["modelList"]["data"][modelListOrder]["purchasePrice"];

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

log.info("Start server at %s and connect to %s", config.svraddr, config.msgaddr);

svc.run();