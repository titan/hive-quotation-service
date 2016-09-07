import { Processor, Config, ModuleFunction, DoneFunction, rpc } from 'hive-processor';
import { Client as PGClient, ResultSet } from 'pg';
import { createClient, RedisClient} from 'redis';
import * as bunyan from 'bunyan';
import * as hostmap from './hostmap';


let log = bunyan.createLogger({
  name: 'quotation-processor',
  streams: [
    {
      level: 'info',
      path: '/var/log/quotation-processor-info.log',  // log ERROR and above to a file
      type: 'rotating-file',
      period: '1d',   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: 'error',
      path: '/var/log/quotation-processor-error.log',  // log ERROR and above to a file
      type: 'rotating-file',
      period: '1w',   // daily rotation
      count: 3        // keep 7 back copies
    }
  ]
});

let config: Config = {
  dbhost: process.env['DB_HOST'],
  dbuser: process.env['DB_USER'],
  dbport: process.env['DB_PORT'],
  database: process.env['DB_NAME'],
  dbpasswd: process.env['DB_PASSWORD'],
  cachehost: process.env['CACHE_HOST'],
  addr: "ipc:///tmp/quotation.ipc"
};

let processor = new Processor(config);

processor.call('insertData', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('insertData');
  db.query('INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)',[args.qid, args.vid, args.state], (err: Error) => {
    if (err) {
      log.error(err, 'query error');
     } else {
       db.query('INSERT INTO quotation_groups (id, qid, pid) VALUES ($1, $2, $3)',[args.gid, args.qid, args.pid], (err: Error) => {
        if (err) {
          log.error(err, 'query error');
        } else {
          db.query('INSERT INTO quotation_items (id, qgid, piid) VALUES ($1, $2, $3)', [args.qiid, args.gid, args.piid], (err: Error) => {
            if (err) {
              log.error(err, 'query error');
            } else {
              db.query('INSERT INTO quotation_item_quotas (id, qiid, num, unit) VALUES ($1, $2, $3, $4)',[args.qqid, args.qiid, args.num, args.unit], (err: Error) => {
                if (err) {
                  log.error(err, 'query error');
                }else{
                  db.query('INSERT INTO quotation_item_prices (id, qiid, price, real_price) VALUES ($1, $2, $3, $4)',[args.qpid, args.qiid, args.price, args.real_price], (err: Error) => {
                    if (err) {
                      log.error(err, 'query error');
                    }else{
                      let quotations_entities = { id: args.qid, state: args.state, quotation_groups: [{id:args.gid, plan:[], items:[{ id: args.qiid, item: [], 
                        quotas: [{id:args.qqid, num:args.num, unit:args.unit}], prices: [{id:args.qpid, price:args.price, real_price:args.real_price}] }]}], vehicle: [] };
                      let multi = cache.multi();
                      multi.hset("quotations-entities", args.qid, JSON.stringify(quotations_entities));
                      multi.sadd("quotations", args.qid);
                      multi.exec((err, replies) => {
                        if (err) {
                          log.error(err);
                        }else{
                          done();
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
       });
        // let vehicle = "";
        // let v = rpc(args.domain, hostmap.default["vehicle"], args.uid, 'getVehicleInfo', args.vid);
        // v.then((vehicle) => {
        //   let quotations_entities = { id: args.qid, state: args.state, quotation_groups: [], vehicle: vehicle };
        //   let multi = cache.multi();
        //   multi.hset("quotations-entities", args.qid, JSON.stringify(quotations_entities));
        //   multi.sadd("quotations", args.qid);
        //   multi.exec((err, replies) => {
        //     if (err) {
        //       log.error(err);
        //     }else{
        //       done();
        //     }
        //   });
        // });
     }
  });
});

processor.call('addQuotationGroup', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('addQuotationGroup');
  db.query('INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)',[args.qid, args.vid, args.state], (err: Error) => {
    if (err) {
      log.error(err, 'query error');
     } else {
        let vehicle = "";
        let v = rpc(args.domain, hostmap.default["vehicle"], args.uid, 'getVehicleInfo', args.vid);
        v.then((vehicle) => {
          let quotations_entities = { id: args.qid, state: args.state, quotation_groups: [], vehicle: vehicle };
          let multi = cache.multi();
          multi.hset("quotations-entities", args.qid, JSON.stringify(quotations_entities));
          multi.sadd("quotations", args.qid);
          multi.exec((err, replies) => {
            if (err) {
              log.error(err);
            }else{
              done();
            }
          });
        });
     }
  });
});

processor.call('completeQuotation', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('completeQuotation');
  db.query('DELETE FROM quotations WHERE id=$1',[args.qid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        multi.hdel("quotations-entities", args.qid);
        multi.exec(function(err, replies) {
          if (err) {
            log.error(err);
          }else{
            multi.set(args.linvoke_id, "success");
            multi.exec((err, replies) => {
              if (err) {
                log.error(err);
              }else{
                done();
              }
            });
          } 
        });
      }
  });
});

processor.call('addQuotationGroup', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('addQuotationGroup');
    db.query('INSERT INTO quotation_groups (id, qid, pid, is_must_have) VALUES ($1, $2, $3, $4)',[args.gid, args.qid, args.pid, args.is_must_have], (err: Error) => {
    if (err) {
      log.error(err, 'query error');
    } else {
        let plan = "";
        let multi = cache.multi();
        let quotations_entities = multi.hget("quotations-entities", args.qid);
        let p = rpc(args.domain,  hostmap.default["plan"], args.uid, 'getPlans', args.pid, 0, -1);
        p.then((plan) => {
          quotations_entities["quotation_groups"].push({id:args.gid, plan:plan, is_must_have:args.is_must_have, items:[]})
          multi.exec((err, replies) => {
            if (err) {
              log.error(err);
            }else{
              db.query('UPDATE quotations SET state = 2',[], (err: Error) => {
                if (err) {
                  log.error(err);
                }
              });
            }
            done();
          });
        });
        
     }
  });
});

processor.call('deleteQuotationGroup', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('deleteQuotationGroup');
  db.query('DELETE FROM quotation_groups WHERE id=$1',[args.gid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", args.qid)
        let groups = quotation["quotation_groups"];
        for(let group of groups){
          if(group.id == args.gid){
            groups.pop(group);
          }
        }
        multi.exec(function(err, replies) {
          if (err) {
            log.error(err);
          }else{
            multi.set(args.linvoke_id, "success");
            multi.exec((err, replies) => {
              if (err) {
                log.error(err);
              }else{
                done();
              }
            });
          } 
        });
      }
  });
});

processor.call('addQuotationItem', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('addQuotationItem');
  db.query('INSERT INTO quotation_items (id, qgid, piid, is_must_have) VALUES ($1, $2, $3, $4)', [args.qiid, args.qgid, args.piid, args.is_must_have], (err: Error) => {
     if (err) {
      log.error(err, 'query error');
     } else {
        let multi = cache.multi();
        let quotations_entities = multi.hget("quotations-entities", args.qid);
        multi.exec((err, replies) => {
          if (err) {
            log.error(err);
          }else{
            let quotation_groups = quotations_entities["quotation_groups"];
            for (let group of quotation_groups) {
              if (group.id == args.qgid) {
                let items = [];
                group["items"].push({ id: args.qiid, item: [], is_must_have: args.is_must_have, quotas: [], prices: [] });
                done();
                break;
              }
            }
          }
        });
      }
   });
});

processor.call('deleteQuotationItem', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('deleteQuotationItem');
  db.query('DELETE FROM quotation_items WHERE id=$1',[args.qiid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", args.qid)
        let groups = quotation["groups"];
        for(let group of groups){
          if(group.id == args.gid){
            let items = group.items;
            for(let item of items){
              if(item.id == args.qiid){
                items.pop(item);
                break;
              }
            }
          }
        }
        multi.exec(function(err, replies) {
          if (err) {
            log.error(err);
          }else{
            multi.set(args.invoke_id, "success");
            multi.exec((err, replies) => {
              if (err) {
                log.error(err);
              }else{
                done();
              }
            });
          } 
        });
      }
  });
});

processor.call('addQuotationQuota', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('addQuotationQuota');
  db.query('INSERT INTO quotation_item_quotas (id, qiid, num, unit, sorted) VALUES ($1, $2, $3, $4)',[args.qqid, args.qiid, args.num, args.unit, args.sorted], (err: Error) => {
     if (err) {
      log.error(err, 'query error');
     }else{
        let multi = cache.multi();
        let quotations_entities = multi.hget("quotations-entities", args.qid);
        multi.exec((err, replies) => {
          if (err) {
            log.error(err);
          }else{
            let quotation_groups = quotations_entities["quotation_groups"];
            for (let group of quotation_groups) {
              if (group.id == args.gid) {
                for(let item of group.items){
                  if(item.id == args.qiid){
                    let quotas = [];
                    quotas.push({id:args.qqid, num:args.num, unit:args.unit, sorted:args.sorted});
                    item["quotas"] = quotas;
                    done();
                    break;
                  }
                }
              }
            }
          }
        });
      }
   });
});

processor.call('deleteQuotationQuota', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('deleteQuotationQuota');
  db.query('DELETE FROM quotation_item_quotas WHERE id=$1',[args.qqid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", args.qid)
        let groups = quotation["groups"];
        for(let group of groups){
          if(group.id == args.gid){
            let items = group.items;
            for(let item of items){
              if(item.id == args.qiid){
                let quotas = item.quotas;
                for(let quota of quotas){
                  if(quota.id = args.qqid){
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
            multi.set(args.invoke_id, "success");
            multi.exec((err, replies) => {
              if (err) {
                log.error(err);
              }else{
                done();
              }
            });
          } 
        });
      }
  });
});

processor.call('addQuotationPrice', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('addQuotationPrice');
  db.query('INSERT INTO quotation_item_prices (id, qiid, price, real_price, sorted) VALUES ($1, $2, $3, $4)',[args.qpid, args.qiid, args.price, args.real_price, args.sorted], (err: Error) => {
     if (err) {
      log.error(err, 'query error');
     }else{
        let multi = cache.multi();
        let quotations_entities = multi.hget("quotations-entities", args.qid);
        multi.exec((err, replies) => {
          if (err) {
            log.error(err);
          }else{
            let quotation_groups = quotations_entities["quotation_groups"];
            for (let group of quotation_groups) {
              if (group.id == args.gid) {
                for(let item of group.items){
                  if(item.id == args.qiid){
                    let prices = [];
                    prices.push({id:args.qpid, price:args.price, real_price:args.real_price, sorted:args.sorted});
                    item["prices"] = prices;
                    db.query('UPDATE quotations SET state = 3',[], (err: Error) => {
                      if (err) {
                        log.error(err);
                      }
                    });
                    break;
                  }
                }
              }
            }
          }
        });
      }
   });
});

processor.call('deleteQuotationPrice', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('deleteQuotationPrice');
  db.query('DELETE FROM quotation_item_prices WHERE id=$1',[args.qpid],(err: Error) => {
      if (err) {
        log.error(err);
      } else {
        let multi = cache.multi();
        let quotation = multi.hget("quotations-entities", args.qid)
        let groups = quotation["groups"];
        for(let group of groups){
          if(group.id == args.gid){
            let items = group.items;
            for(let item of items){
              if(item.id == args.qiid){
                let prices = item.prices;
                for(let price of prices){
                  if(price.id = args.qpid){
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
            multi.set(args.invoke_id, "success");
            multi.exec((err, replies) => {
              if (err) {
                log.error(err);
              }else{
                done();
              }
            });
          } 
        });
      }
  });
});

log.info('Start processor at %s', config.addr);

processor.run();

