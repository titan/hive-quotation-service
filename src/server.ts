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
  ownerId: string,
  ownerName: string,
  ownerCellPhone: string,

  vehicleInfo: Object,
  modelsInfo: Object,

  isTrans: string,
  transDate: string,
  // insuredAmountForRiskB: string,
  cityCode: string,
  insurerCode: string
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
  // log.info("fuck!");

  let sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

  // let cityCode = "441900"; // Beijing

  let carInfo = {
    "licenseNo": vehicleInfo["licenseNo"],
    "frameNo": vehicleInfo["frameNo"],
    "modelCode": modelsInfo["modelCode"],
    "engineNo": vehicleInfo["engineNo"],
    "isTrans": isTrans,
    "transDate": null,
    "registerDate": vehicleInfo["firstRegisterDate"]
  };

  if (isTrans === "1") {
    carInfo["transDate"] = transDate;
  }

  let persionInfo: Object = {
    "ownerName": ownerName,         // N
    "ownerID": ownerId,             // N
    "ownerMobile": ownerCellPhone,  // N
  };

  // "50000,100000,150000,200000,300000,500000,1000000,1500000,2000000,3000000,5000000"
  let coverageList = [
    {
      "coverageCode": "A",
      "coverageName": "机动车损失保险",
      "insuredAmount": "Y",
      "insuredPremium": null
    },
    {
      "coverageCode": "B",
      "coverageName": "商业第三者责任险",
      "insuredAmount": "50000",
      "insuredPremium": null
    },
    {
      "coverageCode": "B",
      "coverageName": "商业第三者责任险",
      "insuredAmount": "100000",
      "insuredPremium": null
    },
    {
      "coverageCode": "G1",
      "coverageName": "全车盗抢险",
      "insuredAmount": "Y",
      "insuredPremium": null
    },
    {
      "coverageCode": "Z",
      "coverageName": "自燃损失险",
      "insuredAmount": "Y",
      "insuredPremium": null
    },
    {
      "coverageCode": "F",
      "coverageName": "玻璃单独破碎险",
      "insuredAmount": "Y",
      "insuredPremium": null
    },
    {
      "coverageCode": "FORCEPREMIUM",
      "coverageName": "交强险",
      "insuredAmount": "Y",
      "insuredPremium": null
    },
    {
      "coverageCode": "X1",
      "coverageName": "发动机涉水损失险",
      "insuredAmount": "Y",
      "insuredPremium": null
    }];


  let data = {
    applicationID: "ZKYQ", // "QUNAR_SERVICE",// "FENGCHAOHUZHU_SERVICE",
    cityCode: cityCode,
    responseNo: vehicleInfo["responseNo"],
    carInfo: carInfo,
    personInfo: persionInfo,
    insurerCode: insurerCode,            // APIC 永诚 该载体暂不支持此保险公司报价 没有给你们配永城，现在测试环境值给你们配置太保人保和阳光
    coverageList: coverageList
  };

  let requestData = {
    operType: "REF",
    msg: "参考报价",
    sendTime: sendTimeString,
    sign: null,// "23ff92kas820ss92k9s933jf209daqc13fsd", 
    data: data
  };

  let postData: string = JSON.stringify(requestData);
  log.info("Here:");
  log.info(postData);

  let options = {
    hostname: "139.198.1.73",
    port: 8081,
    method: "POST",
    path: "/zkyq-web/calculate/entrance",
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  let req = http.request(options, function (res) {
    log.info("Status: " + res.statusCode);
    res.setEncoding("utf8");

    let result: string = "";

    res.on("data", function (body) {
      result += body;
      // log.info(body);
    });

    res.on("end", function () {
      // log.info(result);

      let retData: Object = JSON.parse(result);
      log.info(retData);
      if (retData["state"] === "1") {
        rep({
          code: 200,
          data: {
            biBeginDate: retData["data"][0]["biBeginDate"],
            ciBeginDate: retData["data"][0]["ciBeginDate"]
          }
        });
      } else {
        rep({
          code: 400,
          msg: retData["msg"]
        });
      }
    });


    req.on('error', (e) => {
      log.info(`problem with request: ${e.message}`);
      rep({
        code: 500,
        msg: e.message
      });
    });
  });

  req.end(postData);
});

svc.call("getAccurateQuotationForTest", permissions, (ctx: Context, rep: ResponseFunction,
  // cityCode: string,
  // responseNumber: string, 
  // insurerCode: string,
  ownerId: string,
  ownerName: string,
  ownerCellPhone: string,

  vehicleInfo: Object,
  modelsInfo: Object,
  // carInfo: Object,


  isTrans: string,
  transDate: string,
  // insuredAmountForRiskB: string,
  cityCode: string,
  insurerCode: string,

  twoDates: Object
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
  // log.info("fuck!");

  let sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

  // let cityCode = "371200"; // Beijing

  let carInfo = {
    "licenseNo": vehicleInfo["licenseNo"],
    "frameNo": vehicleInfo["frameNo"],
    "modelCode": modelsInfo["modelCode"],
    "engineNo": vehicleInfo["engineNo"],
    "isTrans": isTrans,
    "transDate": null,
    "registerDate": vehicleInfo["firstRegisterDate"]
  };

  if (isTrans === "1") {
    carInfo["transDate"] = transDate;
  }


  let persionInfo: Object = {
    "insuredID": ownerId,
    "ownerName": ownerName,
    "ownerID": ownerId,
    "ownerMobile": ownerCellPhone,
    "insuredName": ownerName,
    "insuredMobile": ownerCellPhone
  };

  let coverageList = [
    {
      "insuredPremium": "",
      "flag": "",
      "insuredAmount": "Y",
      "coverageName": "机动车损失险",
      "coverageCode": "A"
    },
    {
      "insuredPremium": "",
      "flag": "",
      "insuredAmount": "50000.00",
      "coverageName": "机动车第三者责任险",
      "coverageCode": "B"
    },
    {
      "insuredPremium": "",
      "flag": "",
      "insuredAmount": "Y",
      "coverageName": "机动车盗抢保险",
      "coverageCode": "G1"
    },
    {
      "insuredPremium": "",
      "flag": "",
      "insuredAmount": "10000.00",
      "coverageName": "司机责任险",
      "coverageCode": "D3"
    }
  ];

  // let cityCode = "441900";

  let data = {
    applicationID: "QUNAR_SERVICE",// "ZKYQ",  //"FENGCHAOHUZHU_SERVICE",
    insurerCode: insurerCode,// "PICC", // "ASTP", // "ASTP",            // ?
    biBeginDate: twoDates["biBeginDate"],
    ciBeginDate: twoDates["ciBeginDate"],
    cityCode: cityCode,
    responseNo: vehicleInfo["responseNo"],
    channelCode: null,
    carInfo: carInfo,
    thpBizID: "20161207fuyuhintest",
    personInfo: persionInfo,
    coverageList: coverageList
  };

  let requestData = {
    operType: "ACCPRICE",
    msg: "精准报价",
    sendTime: sendTimeString,
    sign: "23ff92kas820ss92k9s933jf209daqc13fsd",// null, 
    data: data
  };

  let postData: string = JSON.stringify(requestData);
  log.info(postData);
  let options = {
    hostname: "139.198.1.73",
    port: 8081,
    method: "POST",
    path: "/zkyq-web/preRelcalculate/CalculateApi",
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  let req = http.request(options, function (res) {
    log.info("Status: " + res.statusCode);
    res.setEncoding("utf8");

    let result: string = "";

    res.on("data", function (body) {
      result += body;
      // log.info(body);
    });

    res.on("end", function () {
      // log.info(result);
      let retData: Object = JSON.parse(result);
      log.info(retData);
      if (retData["state"] === "1") {
        rep({
          code: 200,
          data: retData["data"]
        });
      } else {
        rep({
          code: 400,
          msg: "Not Found!"
        });
      }
    });


    req.on('error', (e) => {
      log.info(`problem with request: ${e.message}`);
      rep({
        code: 500,
        msg: e.message
      });
    });
  });

  req.end(postData);
});


svc.call("getAccurateQuotation", permissions, (ctx: Context, rep: ResponseFunction,
  ownerId: string,
  ownerName: string,
  ownerCellPhone: string,

  vehicleInfo: Object,
  modelListOrder: number,
  // modelsInfo: Object,
  // carInfo: Object,

  isTrans: string,
  transDate: string,
  // insuredAmountForRiskB: string,

  cityCode: string,
  insurerCodeForRef: string,
  insurerCodeForAcc: string

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
  // log.info("fuck!");

  let sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

  // let cityCode = "110100"; // Beijing

  let carInfo = {
    "licenseNo": vehicleInfo["licenseNo"],
    "frameNo": vehicleInfo["frameNo"],
    "modelCode": vehicleInfo["modelList"]["data"][modelListOrder]["brandCode"],
    "engineNo": vehicleInfo["engineNo"],
    "isTrans": isTrans,
    "transDate": null,
    "registerDate": vehicleInfo["firstRegisterDate"]
  };

  if (isTrans === "1") {
    carInfo["transDate"] = transDate;
  }

  let persionInfo: Object = {
    "ownerName": ownerName,         // N
    "ownerID": ownerId,             // N
    "ownerMobile": ownerCellPhone,  // N
  };

  // "50000,100000,150000,200000,300000,500000,1000000,1500000,2000000,3000000,5000000"
  let coverageList = [
    {
      "coverageCode": "A",
      "coverageName": "机动车损失保险",
      // "insuredAmount": "Y",
      // "insuredPremium": "1323.7600",
      // "insuredAmount": "75680.00",
      // "flag": null
      // }];
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
      "coverageCode": "G1",
      "coverageName": "全车盗抢险",
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
      "coverageCode": "X1",
      "coverageName": "发动机涉水损失险",
      "insuredAmount": "Y",
      "insuredPremium": null,
      "flag": null
    }];

  let data = {
    applicationID: "FENGCHAOHUZHU_SERVICE", // "ZKYQ"
    cityCode: cityCode,
    responseNo: vehicleInfo["responseNo"],
    carInfo: carInfo,
    personInfo: persionInfo,
    insurerCode: "APIC",            // APIC 永诚 该载体暂不支持此保险公司报价 没有给你们配永城，现在测试环境值给你们配置太保人保和阳光
    coverageList: coverageList
  };

  let requestData = {
    operType: "REF",
    msg: "参考报价",
    sendTime: sendTimeString,
    sign: null,
    data: data
  };

  let postData: string = JSON.stringify(requestData);
  log.info("ref postData:");
  log.info(postData);

  let options = {
    hostname: "api.ztwltech.com",
    // port: 8081,
    method: "POST",
    path: "/zkyq-web/calculate/entrance",
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  let req = http.request(options, function (res) {
    log.info("Status: " + res.statusCode);
    res.setEncoding("utf8");

    let result: string = "";

    res.on("data", function (body) {
      result += body;
      // log.info(body);
    });

    res.on("end", function () {
      // log.info(result);

      let retData: Object = JSON.parse(result);
      log.info("Here is REF retData:");
      log.info(result);
      if (retData["state"] === "1") {
        // rep({
        //   code: 200,
        //   data: {
        //     biBeginDate: retData["data"][0]["biBeginDate"],
        //     ciBeginDate: retData["data"][0]["ciBeginDate"]
        //   }
        // });
        // let modelList

        let sendTimeString: string = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

        let carInfo = {
          "licenseNo": vehicleInfo["licenseNo"],
          "frameNo": vehicleInfo["frameNo"],
          "modelCode": vehicleInfo["modelList"]["data"][modelListOrder]["brandCode"],
          "engineNo": vehicleInfo["engineNo"],
          "isTrans": isTrans,
          "transDate": null,
          "registerDate": vehicleInfo["firstRegisterDate"]
        };

        if (isTrans === "1") {
          carInfo["transDate"] = transDate;
        }

        let persionInfo: Object = {
          "insuredID": ownerId,
          "ownerName": ownerName,
          "ownerID": ownerId,
          "ownerMobile": ownerCellPhone,
          "insuredName": ownerName,
          "insuredMobile": ownerCellPhone
        };



        let data = {
          applicationID: "FENGCHAOHUZHU_SERVICE",
          insurerCode: "APIC",
          biBeginDate: retData["data"][0]["biBeginDate"],
          ciBeginDate: retData["data"][0]["ciBeginDate"],
          cityCode: cityCode,
          responseNo: vehicleInfo["responseNo"],
          channelCode: null,
          carInfo: carInfo,
          thpBizID: "20161207fuyuhintest",
          personInfo: persionInfo,
          coverageList: coverageList
        };

        let requestData = {
          operType: "ACCPRICE",
          msg: "精准报价",
          sendTime: sendTimeString,
          sign: "23ff92kas820ss92k9s933jf209daqc13fsd",
          data: data
        };

        let postData: string = JSON.stringify(requestData);
        log.info("acc postData:");
        log.info(postData);
        let options = {
          hostname: "api.ztwltech.com",
          // port: 8081,
          method: "POST",
          path: "/zkyq-web/pottingApi/CalculateApi",
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        let req = http.request(options, function (res) {
          log.info("Status: " + res.statusCode);
          res.setEncoding("utf8");

          let result: string = "";

          res.on("data", function (body) {
            result += body;
            // log.info(body);
          });

          res.on("end", function () {
            // log.info(result);
            let retData: Object = JSON.parse(result);
            log.info(retData);
            if (retData["state"] === "1") {
              rep({
                code: 200,
                data: retData["data"]
              });
            } else {
              rep({
                code: 400,
                msg: retData["msg"]
              });
            }
          });


          req.on('error', (e) => {
            log.info(`problem with request: ${e.message}`);
            rep({
              code: 500,
              msg: e.message
            });
          });
        });

        req.end(postData);

      } else {
        rep({
          code: 400,
          msg: retData["msg"]
        });
      }
    });


    req.on('error', (e) => {
      log.info(`problem with request: ${e.message}`);
      rep({
        code: 500,
        msg: e.message
      });
    });
  });

  req.end(postData);
});


log.info("Start server at %s and connect to %s", config.svraddr, config.msgaddr);

svc.run();

