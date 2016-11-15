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
    if (arg>= sbegintime && arg<= sendtime) {
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
    if(quotation["vehicle"]){
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
      if (result != null) {
        let json1 = JSON.parse(result);
        ctx.cache.hget("wechat_code1", json1.ticket, (err2, result2) => {
          if (err2) {
            rep({ code: 500, msg: err2.message });
          } else {
            rep({ code: 200, data: JSON.parse(result2) });
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
  // ctx.msgqueue.send(msgpack.encode({ cmd: "refresh", args: [ctx.domain] }));
  rep({
    code: 200,
    msg: "Okay"
  });
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
  let quotation = new Promise<Object[]>((resolve, reject) => {
    ctx.cache.zrange(unquotated_key, 0, -1, function (err, quotationkeys) {
      if (quotationkeys) {
        log.info(quotationkeys + "------------------}");
        let len = quotationkeys.length;
        resolve(len);
      } else if (err) {
        log.info("quotation err " + err);
        reject(err);
      } else {
        reject({});
      }
    });
  });
  let order = new Promise<Object[]>((resolve, reject) => {
    ctx.cache.zrange("new-orders-id", 0, -1, function (err, orderkeys) {
      if (orderkeys) {
        log.info(orderkeys + "------------------}");
        resolve(orderkeys.length);
      } else if (err) {
        log.info("order err " + err);
        reject(err);
      } else {
        reject({});
      }
    });
  });
  let pay = new Promise<Object[]>((resolve, reject) => {
    ctx.cache.zrange("new-pays-id", 0, -1, function (err, paykeys) {
      if (paykeys) {
        log.info(paykeys + "------------------}");
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

log.info("Start server at %s and connect to %s", config.svraddr, config.msgaddr);

svc.run();

