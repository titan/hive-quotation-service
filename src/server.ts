import { Server, Config, Context, ResponseFunction, Permission } from 'hive-server';
import * as Redis from "redis";
import * as nanomsg from 'nanomsg';
import * as msgpack from 'msgpack-lite';
import * as http from 'http';
import * as bunyan from 'bunyan';
import * as uuid from 'node-uuid';

let log = bunyan.createLogger({
  name: 'quotation-server',
  streams: [
    {
      level: 'info',
      path: '/var/log/server-info.log',  // log ERROR and above to a file
      type: 'rotating-file',
      period: '1d',   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: 'error',
      path: '/var/log/server-error.log',  // log ERROR and above to a file
      type: 'rotating-file',
      period: '1w',   // daily rotation
      count: 3        // keep 7 back copies
    }
  ]
});

let redis = Redis.createClient(6379, "redis"); // port, host
let list_key = "quotations";
let entity_key = "quotations-entities";

let config: Config = {
  svraddr: 'tcp://0.0.0.0:4040',
  msgaddr: 'ipc:///tmp/queue.ipc'
};

let svc = new Server(config);

let permissions: Permission[] = [['mobile', true], ['admin', true]];

//增加报价组
svc.call('addQuotationGroup', permissions, (ctx: Context, rep: ResponseFunction, vid:string, pid:string, is_must_have:boolean) => {
  log.info('addQuotationGroup %j', ctx);
  let qid = uuid.v1();
  let gid = uuid.v1();
  let args = [qid, gid, vid, pid, is_must_have, ctx.uid];
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationGroup", args:args}));
});
//删除报价组
svc.call('deleteQuotationGroup', permissions, (ctx: Context, rep: ResponseFunction, qid:string, gid:string) => {
  log.info('deleteQuotationGroup %j', ctx);
  let invoke_id: string = uuid.v1();
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationGroup", qid:qid, gid: gid, invoke_id: invoke_id}));
  let countdown = 10;
  let timer = setInterval(() => {
    if (countdown == 0) {
      rep({code: 500, status: "Timeout!"});
      clearInterval(timer);
    } else {
      countdown --;
      redis.get(invoke_id, (err, replies) => {
        if (!err) {
          if (replies == "success") {
            rep({ code: 200, status: null });
          } else {
            rep({ code: 500, status: replies});
          }
          clearInterval(timer);
        }
      });
    }
  }, 3000);
});

//增加报价条目
svc.call('addQuotationItem', permissions, (ctx: Context, rep: ResponseFunction, qgid:string, piid:string, is_must_have:boolean, qid:string) => {
  log.info('addQuotationItem %j', ctx);
  let qiid = uuid.v1();
  let args = [qiid, qgid, piid, is_must_have, qid];
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationItem", args:args}));
});
//删除报价条目
svc.call('deleteQuotationItem', permissions, (ctx: Context, rep: ResponseFunction, qid:string, gid:string, qiid:string) => {
  log.info('deleteQuotationItem %j', ctx);
  let invoke_id: string = uuid.v1();
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationItem", qid:qid, gid: gid, qiid:qiid, invoke_id: invoke_id}));
  let countdown = 10;
  let timer = setInterval(() => {
    if (countdown == 0) {
      rep({code: 500, status: "Timeout!"});
      clearInterval(timer);
    } else {
      countdown --;
      redis.get(invoke_id, (err, replies) => {
        if (!err) {
          if (replies == "success") {
            rep({ code: 200, status: null });
          } else {
            rep({ code: 500, status: replies});
          }
          clearInterval(timer);
        }
      });
    }
  }, 3000);
});
//增加报价限额
svc.call('addQuotationQuota', permissions, (ctx: Context, rep: ResponseFunction, qiid:string, num:number, unit:string, sorted:number, qid:string, gid:string) => {
  log.info('addQuotationQuota %j', ctx);
  let qqid = uuid.v1();
  let args = [qqid, qiid, num, unit, sorted, qid, gid];
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationQuota", args:args}));
});
//删除报价限额
svc.call('deleteQuotationQuota', permissions, (ctx: Context, rep: ResponseFunction, qid:string, gid:string, qiid:string, qqid:string) => {
  log.info('deleteQuotationQuota %j', ctx);
  let invoke_id: string = uuid.v1();
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationQuota", qid:qid, gid: gid, qiid:qiid, qqid:qqid, invoke_id: invoke_id}));
  let countdown = 10;
  let timer = setInterval(() => {
    if (countdown == 0) {
      rep({code: 500, status: "Timeout!"});
      clearInterval(timer);
    } else {
      countdown --;
      redis.get(invoke_id, (err, replies) => {
        if (!err) {
          if (replies == "success") {
            rep({ code: 200, status: null });
          } else {
            rep({ code: 500, status: replies});
          }
          clearInterval(timer);
        }
      });
    }
  }, 3000);
});
//增加报价价格
svc.call('addQuotationPrice', permissions, (ctx: Context, rep: ResponseFunction, qiid:string, price:number, real_price:number, sorted:number, qid:string, gid:string) => {
  log.info('addQuotationPrice %j', ctx);
  let qpid = uuid.v1();
  let args = [qpid, qiid, price, real_price, sorted, qid, gid];
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationPrice", args:args}));
});
//删除报价价格
svc.call('deleteQuotationPrice', permissions, (ctx: Context, rep: ResponseFunction, qid:string,  gid:string, qiid:string, qpid:string) => {
  log.info('deleteQuotationPrice %j', ctx);
  let invoke_id: string = uuid.v1();
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationPrice", qid:qid, gid: gid, qiid:qiid, qpid:qpid, invoke_id: invoke_id}));
  let countdown = 10;
  let timer = setInterval(() => {
    if (countdown == 0) {
      rep({code: 500, status: "Timeout!"});
      clearInterval(timer);
    } else {
      countdown --;
      redis.get(invoke_id, (err, replies) => {
        if (!err) {
          if (replies == "success") {
            rep({ code: 200, status: null });
          } else {
            rep({ code: 500, status: replies});
          }
          clearInterval(timer);
        }
      });
    }
  }, 3000);
});

svc.call('getQuotationGroups', permissions, (ctx: Context, rep: ResponseFunction, vid:string) => {
  log.info('getQuotationGroups %j', ctx);
  redis.smembers(list_key, function (err, result) {
    if (err) {
      rep([]);
    } else {
      let quotation_group = [];
      for (let id of result) {
        quotation_group.push(redis.hget(entity_key, id));
      }
      let quotation_info ="";
      for (let quotation of quotation_group){
        if(quotation.vehicle.id==vid){
         quotation_info = quotation;
        }
      }
      rep(quotation_info);
    }
  });
});



function ids2objects(key: string, ids: string[], rep: ResponseFunction) {
  let multi = redis.multi();
  for (let id of ids) {
    multi.hget(key, id);
  }
  multi.exec(function(err, replies) {
    rep(replies);
  });
}

log.info('Start server at %s and connect to %s', config.svraddr, config.msgaddr);

svc.run();
