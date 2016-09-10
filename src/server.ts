import { Server, Config, Context, ResponseFunction, Permission } from 'hive-server';
import { Quota, Price, Item, Group } from './quotation-definations';
import * as Redis from "redis";
import * as nanomsg from 'nanomsg';
import * as msgpack from 'msgpack-lite';
import * as http from 'http';
import * as bunyan from 'bunyan';
import * as uuid from 'node-uuid';
import * as hostmap from './hostmap';

let log = bunyan.createLogger({
  name: 'quotation-server',
  streams: [
    {
      level: 'info',
      path: '/var/log/quotation-server-info.log',  // log ERROR and above to a file
      type: 'rotating-file',
      period: '1d',   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: 'error',
      path: '/var/log/quotation-server-error.log',  // log ERROR and above to a file
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
  svraddr: hostmap.default["quotation"],
  msgaddr: 'ipc:///tmp/quotation.ipc'
};

let svc = new Server(config);

let permissions: Permission[] = [['mobile', true], ['admin', true]];

//暂存数据库
svc.call('addQuotationGroups', permissions, (ctx: Context, rep: ResponseFunction, qid: string, vid: string, groups: Group[], promotion:number) => {
  
  let state = 3;
  let args = {qid, vid, state, groups, promotion};
  log.info({ args: args }, 'addQuotationGroups');
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationGroups", args:args}));
  rep("quotation:" + qid);
});

//创建报价
svc.call('createQuotation', permissions, (ctx: Context, rep: ResponseFunction, vid:string) => {
  let qid = uuid.v1();
  let state = 1;
  let args = {qid, vid, state};
  log.info('createQuotation '+JSON.stringify(args));
  ctx.msgqueue.send(msgpack.encode({cmd: "createQuotation", args:args}));
  rep(qid);
});

//结束报价
svc.call('completeQuotation', permissions, (ctx: Context, rep: ResponseFunction, qid:string) => {
  log.info('completeQuotation %j', ctx);
  let invoke_id: string = uuid.v1();
  let args = {qid, invoke_id};
  ctx.msgqueue.send(msgpack.encode({cmd: "completeQuotation", args:args}));
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

//增加报价组
svc.call('addQuotationGroup', permissions, (ctx: Context, rep: ResponseFunction, qid:string, pid:string, is_must_have:boolean) => {
  log.info('addQuotationGroup %j', ctx);
  let gid = uuid.v1();
  let args = {qid, gid, pid, is_must_have};
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationGroup", args:args}));
});
//删除报价组
svc.call('deleteQuotationGroup', permissions, (ctx: Context, rep: ResponseFunction, qid:string, gid:string) => {
  log.info('deleteQuotationGroup %j', ctx);
  let invoke_id: string = uuid.v1();
  let args = {qid, gid, invoke_id};
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationGroup", args:args}));
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
  let args = {qiid, qgid, piid, is_must_have, qid};
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationItem", args:args}));
});
//删除报价条目
svc.call('deleteQuotationItem', permissions, (ctx: Context, rep: ResponseFunction, qid:string, gid:string, qiid:string) => {
  log.info('deleteQuotationItem %j', ctx);
  let invoke_id: string = uuid.v1();
  let args = {qid, gid, qiid, invoke_id};
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationItem", args}));
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
  let args = {qqid, qiid, num, unit, sorted, qid, gid};
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationQuota", args:args}));
});
//删除报价限额
svc.call('deleteQuotationQuota', permissions, (ctx: Context, rep: ResponseFunction, qid:string, gid:string, qiid:string, qqid:string) => {
  log.info('deleteQuotationQuota %j', ctx);
  let invoke_id: string = uuid.v1();
  let args = {qid, gid, qiid, qqid, invoke_id}
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationQuota", args:args}));
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
  let args = {qpid, qiid, price, real_price, sorted, qid, gid};
  ctx.msgqueue.send(msgpack.encode({cmd: "addQuotationPrice", args:args}));
});
//删除报价价格
svc.call('deleteQuotationPrice', permissions, (ctx: Context, rep: ResponseFunction, qid:string,  gid:string, qiid:string, qpid:string) => {
  log.info('deleteQuotationPrice %j', ctx);
  let invoke_id: string = uuid.v1();
  let args = {qid, gid, qiid, qpid, invoke_id};
  ctx.msgqueue.send(msgpack.encode({cmd: "deleteQuotationPrice", args:args}));
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

svc.call('getAllQuotations', permissions, (ctx: Context, rep: ResponseFunction) => {
  log.info('getAllQuotations' );
  redis.smembers(list_key, function (err, result) {
    if (err) {
      rep([]);
    } else {
      let multi = redis.multi();
      for (let id of result) {
        multi.hget(entity_key, id);
      }
      multi.exec((err,result2) => {
        if(err){
          rep([]);
        }else{
          rep(result2.map(e=>JSON.parse(e)));
        }
      });
    }
  });
});

svc.call('getQuotations', permissions, (ctx: Context, rep: ResponseFunction, vid:string) => {
  log.info('getQuotations' + vid);
  redis.smembers(list_key, function (err, result) {
    if (err) {
      rep([]);
    } else {
      let quotations = [];
      let multi = redis.multi();
      for (let id of result) {
        multi.hget(entity_key, id);
      }
      multi.exec((err,result) => {
        if(err){
          rep([]);
        }else{
          let quotations = result.map(e => JSON.parse(e)).filter(q => q.vid == vid);
          rep(quotations);
        }
      });
    }
  });
});

svc.call('getQuotation', permissions, (ctx: Context, rep: ResponseFunction, qid:string) => {
  log.info('getQuotation, qid: %s', qid);
  redis.hget(entity_key, qid, (err, quotation) => {
    rep(JSON.parse(quotation));
  });
});


svc.call('refresh', permissions, (ctx: Context, rep: ResponseFunction) => {
  log.info('refresh uid: %s', ctx.uid);
  ctx.msgqueue.send(msgpack.encode({cmd: "refresh", args: null}));
  rep({status: 'okay'});
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
