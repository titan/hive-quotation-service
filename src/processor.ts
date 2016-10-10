import { Processor, Config, ModuleFunction, DoneFunction, rpc, async_serial, async_serial_ignore } from "hive-processor";
import { Client as PGClient, ResultSet } from "pg";
import { createClient, RedisClient} from "redis";
import { Quota, Price, Item, Group } from "./quotation-definations";
import * as bunyan from "bunyan";
import { servermap, triggermap } from "hive-hostmap";
import * as uuid from "node-uuid";
import * as msgpack from "msgpack-lite";
import * as nanomsg from "nanomsg";
import * as http from "http";

let log = bunyan.createLogger({
  name: "quotation-processor",
  streams: [
    {
      level: "info",
      path: "/var/log/quotation-processor-info.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1d",   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: "error",
      path: "/var/log/quotation-processor-error.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1w",   // daily rotation
      count: 3        // keep 7 back copies
    }
  ]
});

let config: Config = {
  dbhost: process.env["DB_HOST"],
  dbuser: process.env["DB_USER"],
  dbport: process.env["DB_PORT"],
  database: process.env["DB_NAME"],
  dbpasswd: process.env["DB_PASSWORD"],
  cachehost: process.env["CACHE_HOST"],
  addr: "ipc:///tmp/quotation.ipc"
};

let quotation_trigger = nanomsg.socket("pub");
quotation_trigger.bind(triggermap.quotation);
let processor = new Processor(config);

interface InsertCtx {
  cache: RedisClient;
  db: PGClient;
  done: DoneFunction;
};

function insert_quotas_and_prices(ctx: InsertCtx, qiid: string, pairs: Object[], acc: Object[], cb) {
  if (pairs.length === 0) {
    cb(acc);
  } else {
    let pair = pairs.shift();
    let quota = pair[0];
    let price = pair[1];
    let qqid = uuid.v1();
    ctx.db.query("INSERT INTO quotation_item_quotas (id, qiid, num, unit) VALUES ($1, $2, $3, $4)", [qqid, qiid, quota.num, quota.unit], (err: Error) => {
      if (err) {
        log.error(err, "query error");
        ctx.db.query("ROLLBACK", [], (err: Error) => {
          ctx.done();
        });
      } else {
        let qpid = uuid.v1();
        ctx.db.query("INSERT INTO quotation_item_prices (id, qiid, price, real_price) VALUES ($1, $2, $3, $4)", [qpid, qiid, price.price, price.real_price], (err: Error) => {
          if (err) {
            log.error(err, "query error");
            ctx.db.query("ROLLBACK", [], (err: Error) => {
              ctx.done();
            });
          } else {
            quota["id"] = qqid;
            price["id"] = qpid;
            acc.push([quota, price]);
            insert_quotas_and_prices(ctx, qiid, pairs, acc, cb);
          }
        });
      }
    });
  }
}

function insert_items_recur(ctx: InsertCtx, qgid: string, items: Item[], acc: Object, cb) {
  if (items.length === 0) {
    cb(acc);
  } else {
    let item = items.shift();
    let piid = item["piid"];
    let quotas = item["quotas"];
    let prices = item["prices"];
    let qiid = uuid.v1();
    ctx.db.query("INSERT INTO quotation_items (id, qgid, piid) VALUES ($1, $2, $3)", [qiid, qgid, piid], (err: Error) => {
      if (err) {
        log.error(err, "query error quotation_items");
        ctx.db.query("ROLLBACK", [], (err: Error) => {
          ctx.done();
        });
      } else {
        let pairs = [];
        for (let i = 0; i < Math.min(quotas.length, prices.length); i++) {
          pairs.push([quotas[i], prices[i]]);
        }
        insert_quotas_and_prices(ctx, qiid, pairs, [], (qps) => {
          let qs = [];
          let ps = [];
          for (let [q, p] of qps) {
            qs.push(q);
            ps.push(p);
          }

          let item = {
            qiid,
            piid,
            quotas: qs,
            prices: ps
          };
          acc["items"].push(item);

          insert_items_recur(ctx, qgid, items, acc, cb);
        });
      }
    });
  }
}

function insert_groups_recur(ctx: InsertCtx, qid: string, groups: Group[], acc: Object[], cb) {
  if (groups.length === 0) {
    ctx.db.query("COMMIT", [], (err: Error) => {
      if (err) {
        log.error(err, "query error COMMIT");
        ctx.db.query("ROLLBACK", [], (err: Error) => {
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
    ctx.db.query("INSERT INTO quotation_groups (id, qid, pid) VALUES ($1, $2, $3)", [qgid, qid, pid], (err: Error) => {
      if (err) {
        ctx.db.query("ROLLBACK", [], (err: Error) => {
          ctx.done();
        });
        log.error(err, "query error quotation_groups");
      } else {
        insert_items_recur(ctx, qgid, items, { qgid, pid, items: [] }, (group) => {
          acc.push(group);
          insert_groups_recur(ctx, qid, groups, acc, cb);
        });
      }
    });
  }
}

processor.call("addQuotationGroups", (db: PGClient, cache: RedisClient, done: DoneFunction, qid: string, vid: string, state: number, groups: any, promotion: number) => {
  log.info("addQuotationGroups");
  db.query("BEGIN", [], (err: Error) => {
    if (err) {
      done();
      log.error(err, "query error begin");
    } else {
      db.query("UPDATE quotations SET promotion = $1, state = $2 WHERE id = $3 ", [promotion, state, qid], (err: Error) => {
        if (err) {
          done();
          log.error(err, "query error quotations");
        } else {
          let ctx = {
            db,
            cache,
            done
          };
          insert_groups_recur(ctx, qid, groups, [], (groups) => {
            let date = new Date();
            let quotation = {
              id: qid,
              state: state,
              quotation_groups: groups,
              vid: vid,
              promotion: promotion,
              created_at: date,
            };
            let multi = cache.multi();
            multi.hset("quotations-entities", qid, JSON.stringify(quotation));
            multi.sadd("quotations", qid);
            multi.zrem("unquotated-quotations", qid);
            multi.zadd("quotated-quotations", date.getTime(), qid);
            multi.exec((err, replies) => {
              if (err) {
                log.error(err);
              }
              done();
            });
          });
        }
      });
    }
  });
});

function recur(prices) {
  if (prices.length === 0) {
  } else {
    let price = prices.shift();
    // price sql
    recur(prices);
  }
}

processor.call("createQuotation", (db: PGClient, cache: RedisClient, done: DoneFunction, qid: string, vid: string, state: number) => {
  log.info("createQuotation");
  db.query("INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)", [qid, vid, state], (err: Error) => {
    if (err) {
      log.error(err, " createQuotation query error");
      done();
    } else {
      let now = new Date();
      let quotation = { id: qid, vid: vid, state: state, created_at: now };
      let multi = cache.multi();
      multi.hset("quotations-entities", qid, JSON.stringify(quotation));
      multi.zadd("unquotated-quotations", now.getTime(), qid);
      multi.exec((err, replies) => {
        if (err) {
          log.error("createQuotation err" + err);
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
  uid: string;
}

// function fetch_quotation_items_recur(ctx: QuotationCtx, rows: Object[], acc: Object[], cb: ((items: Object[]) => void)): void {
//   if (rows.length == 0) {
//     log.info("1111111111111111111111111111111111111")
//     cb(acc);
//   } else {
//     let row = rows.shift();
//     log.info("222222222222222222222222")
//     ctx.db.query("SELECT id, number, unit, created_at, updated_at FROM quotation_item_quotas WHERE qiid = $1 ORDER BY sorted", [row["id"]], (err: Error, result: ResultSet) => {
//       log.info("33333333333333333333")
//       if (err) {
//         log.info("444444444444444444444444444444")
//         fetch_quotation_items_recur(ctx, rows, acc, cb);
//       } else {
//         log.info("55555555555555555555555555555555555555555")
//         let quotas = [];
//         for (let r of result.rows) {
//           quotas.push({
//             id: r.id,
//             number: r.number,
//             unit: r.unit? r.unit.trim(): null,
//             created_at: r.created_at,
//             updated_at: r.updated_at
//           });
//         }
//         log.info("66666666666666666666666666666666666666666666")
//         ctx.db.query("SELECT id, price, real_price, created_at, updated_at FROM quotation_item_prices WHERE qiid = $1 ORDER BY sorted", [row["id"]], (err1: Error, result1: ResultSet) => {
//           if (err1) {
//             log.info("7777777777777777777777777777777777777777")
//             let item = {
//               id: row["id"],
//               is_must_have: row["is_must_have"],
//               created_at: row["created_at"],
//               updated_at: row["updated_at"],
//               quotas: quotas
//             };
//             acc.push(item);
//             fetch_quotation_items_recur(ctx, rows, acc, cb);
//           } else {
//             log.info("88888888888888888888888888888")
//             let prices = [];
//             for (let r1 of result1.rows) {
//               prices.push({
//                 id: r1.id,
//                 price: r1.price,
//                 real_price: r1.real_price,
//                 created_at: r1.created_at,
//                 updated_at: r1.updated_at
//               });
//             }
//             log.info("item------------------" + row["id"]);
//             let item = {
//               id: row["id"],
//               is_must_have: row["is_must_have"],
//               created_at: row["created_at"],
//               updated_at: row["updated_at"],
//               quotas: quotas,
//               prices: prices
//             };
//             acc.push(item);
//             fetch_quotation_items_recur(ctx, rows, acc, cb);
//           }
//         });
//       }
//     });
//   }
// }

// function fetch_quotation_groups_recur(ctx: QuotationCtx, rows: Object[], acc: Object[], cb: ((groups: Object[]) => void)): void {
//   if (rows.length == 0) {
//     cb(acc);
//   } else {
//     let row = rows.shift();
//       log.info("plan id is ---------" + row["pid"]);
//       log.info("ctx.domain" + ctx.domain);
//     let p = rpc(ctx.domain, hostmap.default["plan"], ctx.uid, "getPlan", row["pid"]);
//     p.then((plan) => {
//       ctx.db.query("SELECT id, piid, is_must_have, created_at, updated_at FROM quotation_items WHERE qgid = $1", [row["id"]], (err: Error, result: ResultSet) => {
//         if (err) {
//           fetch_quotation_groups_recur(ctx, rows, acc, cb);
//         } else {
//           fetch_quotation_items_recur(ctx, result.rows, [], (items) => {
//             let group = {
//               id: row["id"],
//               is_must_have: row["is_must_have"],
//               created_at: row["created_at"],
//               updated_at: row["updated_at"],
//               pid: row["pid"],
//               items: items
//             };
//             acc.push(group);
//             fetch_quotation_groups_recur(ctx, rows, acc, cb);
//           });
//         }
//       });
//     });
//   }
// }

// function fetch_quotations_recur(ctx: QuotationCtx, rows: Object[], acc: Object[], cb: ((quotations: Object[]) => void)): void {
//   if (rows.length == 0) {
//     cb(acc);
//   } else {
//     let db = ctx.db;
//     let row = rows.shift();
//     let quotation = {
//       id: row["id"],
//       state: row["state"],
//       vid: row["vid"],
//       created_at: row["created_at"],
//       updated_at: row["updated_at"]
//     };
//     db.query("SELECT id, pid, is_must_have, created_at, updated_at FROM quotation_groups WHERE qid = $1", [row["id"]], (err: Error, result: ResultSet) => {
//       if (err) {
//         fetch_quotations_recur(ctx, rows, acc, cb);
//       } else {
//         fetch_quotation_groups_recur(ctx, result.rows, [], (groups) => {
//           quotation["quotation_groups"] = groups;
//           acc.push(quotation);
//           fetch_quotations_recur(ctx, rows, acc, cb);
//         });
//       }
//     });
//   }
// }



// processor.call("refresh", (db: PGClient, cache: RedisClient, done: DoneFunction, domain: string, uid: string) => {
//   log.info("refresh");

//   db.query("SELECT id, state, vid, created_at, updated_at FROM quotations", [], (err: Error, result: ResultSet) => {
//     if (err) {
//       log.error(err, "query error");
//       done();
//       return;
//     } else {
//       let ctx: QuotationCtx = {db, cache, domain, uid};
//       fetch_quotations_recur(ctx, result.rows, [], (quotations) => {
//         let multi = cache.multi();
//         for(let quotation of quotations) {
//            multi.hset("quotations-entities", quotation["id"], JSON.stringify(quotation));
//            let date = new Date(quotation["created_at"]);
//            if (quotation["state"] <3 ) {
//              multi.zadd("unquotated-quotations", date.getTime(), quotation["id"]);
//            } else {
//              multi.zadd("quotated-quotations", date.getTime(), quotation["id"]);
//            }
//         }
//         multi.exec((err, replies) => {
//           if (err) {
//             log.error(err);
//           } else {
//             log.info("replies" + replies);
//           }
//           done();

//         });
//       });
//     }
//   });
// });

log.info("Start processor at %s", config.addr);

processor.run();


