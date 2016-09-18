import { Processor, Config, ModuleFunction, DoneFunction, rpc } from 'hive-processor';
import { Client as PGClient, ResultSet } from 'pg';
import { createClient, RedisClient} from 'redis';
import { Quota, Price, Item, Group } from './quotation-definations';
import * as bunyan from 'bunyan';
import * as hostmap from './hostmap';
import * as uuid from 'node-uuid';

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

interface InsertCtx {
  cache: RedisClient;
  db: PGClient;
  done: DoneFunction;
};

processor.call('changeQuotationState', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('changeQuotationState');
  db.query('UPDATE quotations SET state = $1 WHERE id = $2 ',[args.state, args.qid], (err: Error) => {
    if (err) {
      log.error(err, 'changeQuotationState query error');
      done();
    }else{
      rpc(args.domain, hostmap.default["quotation"], null, "refresh", null).then(() =>{
        done();
      });
    }
  });
});

function insert_quotas_and_prices (ctx: InsertCtx, qiid: string, pairs: Object[], acc: Object[], cb) {
  if (pairs.length == 0) {
    cb(acc);
  } else {
    let pair = pairs.shift();
    let quota = pair[0];
    let price = pair[1];
    let qqid = uuid.v1();
    ctx.db.query('INSERT INTO quotation_item_quotas (id, qiid, num, unit) VALUES ($1, $2, $3, $4)', [qqid, qiid, quota.num, quota.unit], (err: Error) => {
      if (err) {
        log.error(err, 'query error');
        ctx.db.query('ROLLBACK', [], (err: Error) => {
          ctx.done();
        });
      } else {
        let qpid = uuid.v1();
        ctx.db.query('INSERT INTO quotation_item_prices (id, qiid, price, real_price) VALUES ($1, $2, $3, $4)', [qpid, qiid, price.price, price.real_price], (err: Error) => {
          if (err) {
            log.error(err, 'query error');
            ctx.db.query('ROLLBACK', [], (err: Error) => {
              ctx.done();
            });
          } else {
            quota["id"] = qqid;
            price["id"] = qpid;
            acc.push([quota, price]);
            insert_quotas_and_prices (ctx, qiid, pairs, acc, cb);
          }
        });
      }
    });
  }
}

function insert_items_recur (ctx: InsertCtx, qgid: string, items: Item[], acc: Object, cb) {
  if (items.length == 0) {
    cb(acc);
  } else {
    let item = items.shift();
    let piid = item["piid"];
    let quotas = item["quotas"];
    let prices = item["prices"];
    let qiid = uuid.v1();
    ctx.db.query('INSERT INTO quotation_items (id, qgid, piid) VALUES ($1, $2, $3)', [qiid, qgid, piid], (err: Error) => {
      if (err) {
        log.error(err, 'query error quotation_items');
        ctx.db.query('ROLLBACK', [], (err: Error) => {
          ctx.done();
        });
      } else {
        let pairs = [];
        for (let i = 0; i < Math.min(quotas.length, prices.length); i ++) {
          pairs.push([quotas[i], prices[i]]);
        }
        insert_quotas_and_prices (ctx, qiid, pairs, [], (qps) => {
          let qs = [];
          let ps = [];
          for (let [ q, p ] of qps) {
            qs.push(q);
            ps.push(p);
          }

          let item = {
            qiid,
            piid,
            quotas: qs,
            prices: ps
          }
          acc["items"].push(item);

          insert_items_recur(ctx, qgid, items, acc, cb);
        });
      }
    });
  }
}

function insert_groups_recur(ctx: InsertCtx, qid: string, groups: Group[], acc: Object[], cb) {
  if (groups.length == 0) {
    ctx.db.query('COMMIT', [], (err: Error) => {
      if (err) {
        log.error(err, 'query error COMMIT');
        ctx.db.query('ROLLBACK', [], (err: Error) => {
          ctx.done();
        });
      } else {
        cb(acc);
      }
    });
  } else {
    let group = groups.shift();
    let pid = group["pid"];
    let items = group["items"];
    let qgid = uuid.v1();
    ctx.db.query('INSERT INTO quotation_groups (id, qid, pid) VALUES ($1, $2, $3)', [qgid, qid, pid], (err: Error) => {
        if (err) {
          ctx.db.query('ROLLBACK', [], (err: Error) => {
            ctx.done();
          });
          log.error(err, 'query error quotation_groups');
        } else {
          insert_items_recur(ctx, qgid, items, { qgid, pid, items: [] }, (group) => {
            acc.push(group);
            insert_groups_recur(ctx, qid, groups, acc, cb);
          });
        }
    });
  }
}

processor.call('addQuotationGroups', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info({args: args}, 'addQuotationGroups');
  db.query('BEGIN', [], (err: Error) => {
    if (err) {
      done();
      log.error(err, 'query error begin');
    } else {
      db.query('UPDATE quotations SET promotion = $1, state = $2 WHERE id = $3 ',[args.promotion, args.state, args.qid], (err:Error) =>{
        if (err) {
          done();
          log.error(err, 'query error quotations');
        } else {
          let ctx = {
            db,
            cache,
            done
          };
          insert_groups_recur(ctx, args.qid, args.groups, [], (groups) => {
            let date = new Date();
            let quotation = {
              id: args.qid,
              state: args.state,
              quotation_groups: groups,
              vid: args.vid,
              promotion:args.promotion,
              created_at: date,
            };
            let multi = cache.multi();
            multi.hset("quotations-entities", args.qid, JSON.stringify(quotation));
            multi.sadd("quotations", args.qid);
            multi.zrem("unquotated-quotations", args.qid); 
            multi.zadd("quotated-quotations", date.getTime(), args.qid )
            multi.exec((err, replies) => {
              if (err) {
                log.error(err);
              } else {
                done();
              }
            });
          });
        }
      });
    }
  });
});

function recur(prices) {
  if (prices.length == 0) {
  } else {
    let price = prices.shift();
    // price sql
    recur(prices);
  }
}

processor.call('createQuotation', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('createQuotation');
  db.query('INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)',[args.qid, args.vid, args.state], (err: Error) => {
    if (err) {
      log.error(err, ' createQuotation query error');
      done();
    }else{
      let now = new Date();
      let quotation = {id:args.qid, vehicle:args.vid, state:args.state, created_at:now};
      let multi = cache.multi();
      multi.hset("quotations-entities", args.qid, JSON.stringify(quotation));
      multi.sadd("quotations", args.qid);
      multi.exec((err, replies) => {
        if (err) {
          log.error('createQuotation err' +err);
        }
          done();       
      });
    }
  });
});


interface QuotationCtx {
  db: PGClient;
  cache: RedisClient;
  domain: string;
}

function fetch_quotation_items_recur(ctx: QuotationCtx, rows: Object[], acc: Object[], cb: ((items: Object[]) => void)): void {
  if (rows.length == 0) {
    cb(acc);
  } else {
    let row = rows.shift();
    ctx.db.query('SELECT id, number, unit, created_at, updated_at FROM quotation_item_quotas WHERE qiid = $1 ORDER BY sorted', [row["id"]], (err: Error, result: ResultSet) => {
      if (err) {
        fetch_quotation_items_recur(ctx, rows, acc, cb);
      } else {
        let quotas = [];
        for (let r of result.rows) {
          quotas.push({
            id: r.id,
            number: r.number,
            unit: r.unit? r.unit.trim(): null,
            created_at: r.created_at,
            updated_at: r.updated_at
          });
        }
        ctx.db.query('SELECT id, price, real_price, created_at, updated_at FROM quotation_item_prices WHERE qiid = $1 ORDER BY sorted', [row["id"]], (err1: Error, result1: ResultSet) => {
          if (err1) {
            let item = {
              id: row["id"],
              is_must_have: row["is_must_have"],
              created_at: row["created_at"],
              updated_at: row["updated_at"],
              quotas: quotas
            };
            acc.push(item);
            fetch_quotation_items_recur(ctx, rows, acc, cb);
          } else {
            let prices = [];
            for (let r1 of result1.rows) {
              prices.push({
                id: r1.id,
                price: r1.price,
                real_price: r1.real_price,
                created_at: r1.created_at,
                updated_at: r1.updated_at
              });
            }
            let item = {
              id: row["id"],
              is_must_have: row["is_must_have"],
              created_at: row["created_at"],
              updated_at: row["updated_at"],
              quotas: quotas,
              prices: prices
            };
            acc.push(item);
            fetch_quotation_items_recur(ctx, rows, acc, cb);
          }
        });
      }
    });
  }
}

function fetch_quotation_groups_recur(ctx: QuotationCtx, rows: Object[], acc: Object[], cb: ((groups: Object[]) => void)): void {
  if (rows.length == 0) {
    cb(acc);
  } else {
    let row = rows.shift();
      log.info("plan id is ---------" + row["pid"]);
    let p = rpc(ctx.domain, hostmap.default["plan"], null, "getPlan", row["pid"]);
    p.then((plan) => {
      ctx.db.query('SELECT id, piid, is_must_have, created_at, updated_at FROM quotation_items WHERE qgid = $1', [row["id"]], (err: Error, result: ResultSet) => {
        if (err) {
          fetch_quotation_groups_recur(ctx, rows, acc, cb);
        } else {
          fetch_quotation_items_recur(ctx, result.rows, [], (items) => {
            let group = {
              id: row["id"],
              is_must_have: row["is_must_have"],
              created_at: row["created_at"],
              updated_at: row["updated_at"],
              plan: plan,
              items: items
            };
            acc.push(group);
            fetch_quotation_groups_recur(ctx, rows, acc, cb);
          });
        }
      });
    });
  }
}

function fetch_quotations_recur(ctx: QuotationCtx, rows: Object[], acc: Object[], cb: ((quotations: Object[]) => void)): void {
  if (rows.length == 0) {
    cb(acc);
  } else {
    let db = ctx.db;
    let row = rows.shift();
    let quotation = {
      id: row["id"],
      state: row["state"],
      vid: row["vid"],
      created_at: row["created_at"],
      updated_at: row["updated_at"]
    };
    db.query('SELECT id, pid, is_must_have, created_at, updated_at FROM quotation_groups WHERE qid = $1', [row["id"]], (err: Error, result: ResultSet) => {
      if (err) {
        fetch_quotations_recur(ctx, rows, acc, cb);
      } else {
        fetch_quotation_groups_recur(ctx, result.rows, [], (groups) => {
          quotation["quotation_groups"] = groups;
          acc.push(quotation);
          fetch_quotations_recur(ctx, rows, acc, cb);
        });
      }
    }); 
  }
}

processor.call('refresh', (db: PGClient, cache: RedisClient, done: DoneFunction, domain: string) => {
  log.info('refresh');

  db.query('SELECT id, state, vid, created_at, updated_at FROM quotations', [], (err: Error, result: ResultSet) => {
    if (err) {
      log.error(err, 'query error');
      done();
      return;
    } else {
      let ctx: QuotationCtx = { db, cache, domain };
      fetch_quotations_recur(ctx, result.rows, [], (quotations) => {
        let multi = cache.multi();
        for(let quotation of quotations) {
           multi.hset("quotations-entities", quotation["id"], JSON.stringify(quotation));
           let date = new Date(quotation["created_at"]);
           if (quotation["state"] <3 ) {
             multi.zadd("unquotated-quotations", date.getTime(), quotation["id"]);
           } else {
             multi.zadd("quotated-quotations", date.getTime(), quotation["id"]);
           }
        }
        multi.exec((err, replies) => {
          if (err) {
            log.error(err);
          } else {
            log.info("replies" + replies);
          }
          done();
          
        });
      });
    }
  });
});

//以下接口好像没有用到
processor.call('addQuotationGroup', (db: PGClient, cache: RedisClient, done: DoneFunction, args) => {
  log.info('addQuotationGroup');
  db.query('INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)',[args.qid, args.vid, args.state], (err: Error) => {
    if (err) {
      log.error(err, 'query error');
      done();
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
      done();
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
      done();
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
            log.info("addQuotationGroup  state is " );
            db.query('UPDATE quotations SET state = 3',[], (err: Error) => {
              if (err) {
                log.error(err);
              }
              log.info("addQuotationGroup state end")
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
      done();
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
      done();
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
      done();
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
      done();
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
      done();
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
      done();
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
      done();
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

