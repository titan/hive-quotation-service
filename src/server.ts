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
let entity_key = "quotations-entities";
let quotated_key = "quotated-quotations";
let unquotated_key = "unquotated-quotations";

let config: Config = {
  svraddr: servermap["quotation"],
  msgaddr: "ipc:///tmp/quotation.ipc",
  cacheaddr: process.env["CACHE_HOST"]
};

let svc = new Server(config);

let permissions: Permission[] = [["mobile", true], ["admin", true]];

// 增加报价组
svc.call("addQuotationGroups", permissions, (ctx: Context, rep: ResponseFunction, qid: string, vid: string, groups: Group[], promotion: number) => {
  log.info("addQuotationGroups qid: %s, vid: %s, promotion: %d, %s", qid, vid, promotion, typeof(promotion));
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
  let args = [qid, vid, state, groups, promotion, callback];
  ctx.msgqueue.send(msgpack.encode({ cmd: "addQuotationGroups", args: args }));
  wait_for_response(ctx.cache, callback, rep);
});

// 创建报价
svc.call("createQuotation", permissions, (ctx: Context, rep: ResponseFunction, vid: string) => {
  if (!verify([uuidVerifier("vid", vid)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  let qid = uuid.v1();
  let state: number = 1;
  let args = [qid, vid, state, qid];
  log.info("createQuotation " + JSON.stringify(args));
  ctx.msgqueue.send(msgpack.encode({ cmd: "createQuotation", args: args }));
  wait_for_response(ctx.cache, qid, rep);
});

// 获取已报价
svc.call("getQuotatedQuotations", permissions, (ctx: Context, rep: ResponseFunction, start: number, limit: number) => {
  log.info("getQuotatedQuotations");
  if (!verify([numberVerifier("start", start), numberVerifier("limit", limit)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.zrevrange(quotated_key, start, limit, function (err, result) {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else {
      let multi = ctx.cache.multi();
      for (let id of result) {
        multi.hget(entity_key, id);
      }
      multi.exec((err1, result2) => {
        if (err) {
          rep({ code: 500, msg: err1.message });
        } else {
          rep({ code: 200, data: result2.map(e => JSON.parse(e)) });
        }
      });
    }
  });
});
// 获取未报价
svc.call("getUnquotatedQuotations", permissions, (ctx: Context, rep: ResponseFunction, start: number, limit: number) => {
  log.info("getUnquotatedQuotations");
  if (!verify([numberVerifier("start", start), numberVerifier("limit", limit)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.zrevrange(unquotated_key, start, limit, function (err, result) {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else {
      let multi = ctx.cache.multi();
      for (let id of result) {
        multi.hget(entity_key, id);
      }
      multi.exec((err, result2) => {
        if (err) {
          rep({ code: 500, msg: err.message });
        } else {
          rep({ code: 200, data: result2.map(e => JSON.parse(e)) });
        }
      });
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

svc.call("refresh", permissions, (ctx: Context, rep: ResponseFunction) => {
  log.info("refresh");
  ctx.msgqueue.send(msgpack.encode({ cmd: "refresh", args: [ctx.domain] }));
  rep({
    code: 200,
    msg: "Okay"
  });
});

// refresh
svc.call("refresh", permissions, (ctx: Context, rep: ResponseFunction) => {
  log.info("refresh uid: %s", ctx.uid);
  let pid = "00000000-0000-0000-0000-000000000001";
  let domain = ctx.domain;
  let uid = ctx.uid;
  let args = {pid, domain, uid}
  ctx.msgqueue.send(msgpack.encode({cmd: "refresh", args: args}));
  rep({status: "refresh okay"});
});

// 搜索报价
// svc.call("searchQuotation", permissions, (ctx: Context, rep: ResponseFunction, svehicleid:string, sownername:string, phone:string, slicense_no:string, sbegintime:any, sendtime:any, sstate:number) => {
//   let args = {svehicleid, sownername, phone, slicense_no, sbegintime, sendtime, sstate}
//   log.info("searchQuotation" + args );
//   ctx.cache.smembers(list_key, function (err, result) {
//     if (err) {
//       rep([]);
//     } else {
//       let multi = ctx.cache.multi();
//       for (let id of result) {
//         multi.hget(entity_key, id);
//       }
//       multi.exec((err,result2) => {
//         if(err){
//           rep([]);
//         }else{

//           rep(result2.map(e=>JSON.parse(e)));
//         }
//       });
//     }
//   });
// });

log.info("Start server at %s and connect to %s", config.svraddr, config.msgaddr);

svc.run();

