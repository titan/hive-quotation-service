import { Processor, Config, ModuleFunction, DoneFunction, rpc } from 'hive-processor';
import { Client as PGClient, ResultSet } from 'pg';
import { createClient, RedisClient} from 'redis';
import * as bunyan from 'bunyan';


let log = bunyan.createLogger({
  name: 'quotation-processor',
  streams: [
    {
      level: 'info',
      path: '/var/log/processor-info.log',  // log ERROR and above to a file
      type: 'rotating-file',
      period: '1d',   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: 'error',
      path: '/var/log/processor-error.log',  // log ERROR and above to a file
      type: 'rotating-file',
      period: '1w',   // daily rotation
      count: 3        // keep 7 back copies
    }
  ]
});

let config: Config = {
  dbhost: process.env['DB_HOST'],
  dbuser: process.env['DB_USER'],
  database: process.env['DB_NAME'],
  dbpasswd: process.env['DB_PASSWORD'],
  cachehost: process.env['CACHE_HOST'],
  addr: "ipc:///tmp/queue.ipc"
};

let processor = new Processor(config);

processor.call('addQuotationGroup', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('addQuotationGroup');
  db.query('INSERT INTO quotation_groups (id, vid, pid, is_must_have) VALUES ($1, $2, $3, $4)',[args.gid, args.vid, args.pid, args.is_must_have], (err: Error) => {
     if (err) {
      log.error(err, 'query error');
     } else {
        let plan = "";
        let vehicle = "";
        let v = rpc(args.domain, 'tcp://vehicle:4040', args.uid, 'getVehicleInfo', args.vid);
        v.then((vehicle) => {});
        let p = rpc(args.domain, 'tcp://vehicle:4040', args.uid, 'getPlans', args.pid, 0, -1);
        p.then((plan) => {});
        let quotations_entities = {id:args.qid, groups:[{id:args.gid, plan:plan, is_must_have:args.is_must_have, items:[]}], vehicle:vehicle};
        let multi = cache.multi();
        multi.hset("quotations-entities", args.qid, JSON.stringify(quotations_entities));
        multi.sadd("quotations", args.qid);
        multi.exec((err, replies) => {
          if (err) {
            log.error(err);
          }
          done();
        });
      }
   });
});

processor.call('deleteQuotationGroup', (db: PGClient, cache: RedisClient, done: DoneFunction, qid, gid, invoke_id) => {
  log.info('deleteQuotationGroup');
  db.query('DELETE FROM quotation_groups WHERE id=$1',[gid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", qid)
        let groups = quotation["groups"];
        for(let group of groups){
          if(group.id == gid){
            groups.pop(group);
          }
        }
        multi.exec(function(err, replies) {
          if (err) {
            log.error(err);
          }else{
            multi.set(invoke_id, "success");
            multi.exec();
          } 
        });
      }
  });
});

processor.call('addQuotationItem', (db: PGClient, cache: RedisClient, done: DoneFunction, qiid, qgid, piid, is_must_have, qid) => {
  log.info('addQuotationItem');
  db.query('INSERT INTO quotation_items (id, qgid, piid, is_must_have) VALUES ($1, $2, $3, $4)', [qiid, qgid, piid, is_must_have], (err: Error) => {
     if (err) {
      log.error(err, 'query error');
     } else {
        let multi = cache.multi();
        let quotations_entities = multi.hget("quotations-entities", qid);
        let quotation_groups = quotations_entities["groups"];
        for (let group of quotation_groups) {
          if (group.id == qgid) {
            let items = [];
            items.push({ id: qiid, item: [], quotas: [], prices: [] });
            group["items"] = items;
            done();
            break;
          }
        }
      }
   });
});

processor.call('deleteQuotationItem', (db: PGClient, cache: RedisClient, done: DoneFunction, qid, gid, qiid, invoke_id) => {
  log.info('deleteQuotationItem');
  db.query('DELETE FROM quotation_items WHERE id=$1',[qiid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", qid)
        let groups = quotation["groups"];
        for(let group of groups){
          if(group.id == gid){
            let items = group.items;
            for(let item of items){
              if(item.id == qiid){
                items.pop(item);
              }
            }
          }
        }
        multi.exec(function(err, replies) {
          if (err) {
            log.error(err);
          }else{
            multi.set(invoke_id, "success");
            multi.exec();
          } 
        });
      }
  });
});

processor.call('addQuotationQuota', (db: PGClient, cache: RedisClient, done: DoneFunction, qqid, qiid, num, unit, sorted, qid, gid) => {
  log.info('addQuotationQuota');
  db.query('INSERT INTO quotation_item_quotas (id, qiid, num, unit, sorted) VALUES ($1, $2, $3, $4)',[qqid, qiid, num, unit, sorted], (err: Error) => {
     if (err) {
      log.error(err, 'query error');
     }else{
        let multi = cache.multi();
        let quotations_entities = multi.hget("quotations-entities", qid);
        let quotation_groups = quotations_entities["groups"];
        for (let group of quotation_groups) {
          if (group.id == gid) {
            for(let item of group.items){
              if(item.id == qiid){
                let quotas = [];
                quotas.push({id:qqid, num:num, unit:unit, sorted:sorted});
                item["quotas"] = quotas;
                done();
                break;
              }
            }
          }
        }
      }
   });
});

processor.call('deleteQuotationQuota', (db: PGClient, cache: RedisClient, done: DoneFunction, qid, gid, qiid, qqid, invoke_id) => {
  log.info('deleteQuotationQuota');
  db.query('DELETE FROM quotation_item_quotas WHERE id=$1',[qqid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", qid)
        let groups = quotation["groups"];
        for(let group of groups){
          if(group.id == gid){
            let items = group.items;
            for(let item of items){
              if(item.id == qiid){
                let quotas = item.quotas;
                for(let quota of quotas){
                  if(quota.id = qqid){
                    quotas.pop(quota);
                  }
                }
              }
            }
          }
        }
        multi.exec(function(err, replies) {
          if (err) {
            log.error(err);
          }else{
            multi.set(invoke_id, "success");
            multi.exec();
          } 
        });
      }
  });
});

processor.call('addQuotationPrice', (db: PGClient, cache: RedisClient, done: DoneFunction,qpid, qiid, price, real_price, sorted, qid, gid) => {
  log.info('addQuotationPrice');
  db.query('INSERT INTO quotation_item_prices (id, qiid, price, real_price, sorted) VALUES ($1, $2, $3, $4)',[qpid, qiid, price, real_price, sorted], (err: Error) => {
     if (err) {
      log.error(err, 'query error');
     }else{
        let multi = cache.multi();
        let quotations_entities = multi.hget("quotations-entities", qid);
        let quotation_groups = quotations_entities["groups"];
        for (let group of quotation_groups) {
          if (group.id == gid) {
            for(let item of group.items){
              if(item.id == qiid){
                let prices = [];
                prices.push({id:qpid, price:price, real_price:real_price, sorted:sorted});
                item["prices"] = prices;
                done();
                break;
              }
            }
          }
        }
      }
   });
});

processor.call('deleteQuotationPrice', (db: PGClient, cache: RedisClient, done: DoneFunction, qid, gid, qiid, qpid, invoke_id) => {
  log.info('deleteQuotationPrice');
  db.query('DELETE FROM quotation_item_prices WHERE id=$1',[qpid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", qid)
        let groups = quotation["groups"];
        for(let group of groups){
          if(group.id == gid){
            let items = group.items;
            for(let item of items){
              if(item.id == qiid){
                let prices = item.prices;
                for(let price of prices){
                  if(price.id = qpid){
                    prices.pop(price);
                  }
                }
              }
            }
          }
        }
        multi.exec(function(err, replies) {
          if (err) {
            log.error(err);
          }else{
            multi.set(invoke_id, "success");
            multi.exec();
          } 
        });
      }
  });
});

log.info('Start processor at %s', config.addr);

processor.run();

