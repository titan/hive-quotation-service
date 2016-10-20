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

processor.call("addQuotationGroups", (db: PGClient, cache: RedisClient, done: DoneFunction, qid: string, vid: string, state: number, groups: any, promotion: number, callback: string) => {
  log.info("addQuotationGroups");
  let pbegin = new Promise<void>((resolve, reject) => {
    db.query("BEGIN", [], (err: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
  let pcommit = new Promise<void>((resolve, reject) => {
    db.query("COMMIT", [], (err: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
  let pquotation = new Promise<void>((resolve, reject) => {
    db.query("UPDATE quotations SET promotion = $1, state = $2 WHERE id = $3 ", [promotion, state, qid], (err: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  let ps = [pbegin, pquotation];
  let gs = [];

  for (const group of groups) {
    const qgid = uuid.v1();
    const pid = group["pid"];
    const g = { qgid, pid, items: [] };

    let pgroup = new Promise<void>((resolve, reject) => {
      db.query("INSERT INTO quotation_groups (id, qid, pid) VALUES ($1, $2, $3)", [qgid, qid, pid], (err: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    ps.push(pgroup);

    for (const item of group["items"]) {
      const piid = item["piid"];
      const qiid = uuid.v1();

      let pitem = new Promise<void>((resolve, reject) => {
        db.query("INSERT INTO quotation_items (id, qgid, piid) VALUES ($1, $2, $3)", [qiid, qgid, piid], (err: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      ps.push(pitem);

      let quotas = [];
      let prices = [];

      for (let i = 0; i < Math.min(item["quotas"].length, item["prices"].length); i++) {
        const quota = item["quotas"][i];
        const price = item["prices"][i];
        const qqid = uuid.v1();
        const qpid = uuid.v1();

        quota["id"] = qqid;
        price["id"] = qpid;

        quotas.push(quota);
        prices.push(price);

        let pquota = new Promise<void>((resolve, reject) => {
          db.query("INSERT INTO quotation_item_quotas (id, qiid, num, unit) VALUES ($1, $2, $3, $4)", [qqid, qiid, quota.num, quota.unit], (err: Error) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        ps.push(pquota);

        let pprice = new Promise<void>((resolve, reject) => {
          db.query("INSERT INTO quotation_item_prices (id, qiid, price, real_price) VALUES ($1, $2, $3, $4)", [qpid, qiid, price.price, price.real_price], (err: Error) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        ps.push(pprice);

      }

      g["items"].push({
        qiid,
        piid,
        quotas,
        prices
      });
    }
    gs.push(g);
  }
  ps.push(pcommit);

  async_serial<void>(ps, [], () => {
    let date = new Date();
    let quotation = {
      id: qid,
      state: state,
      quotation_groups: gs,
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
        cache.setex(callback, 30, JSON.stringify({
          code: 500,
          msg: err.message
        }));
      } else {
        cache.setex(callback, 30, JSON.stringify({
          code: 200,
          data: qid
        }));
      }
      done();
    });
  }, (e: Error) => {
    log.error(e, e.message);
    db.query("ROLLBACK", [], (err: Error) => {
      cache.setex(callback, 30, JSON.stringify({
        code: 500,
        msg: e.message
      }));
    });
  });
});

processor.call("createQuotation", (db: PGClient, cache: RedisClient, done: DoneFunction, qid: string, vid: string, state: number, callback: string) => {
  log.info("createQuotation");
  db.query("INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)", [qid, vid, state], (err: Error) => {
    if (err) {
      log.error(err, "createQuotation query error");
      cache.setex(callback, 30, JSON.stringify({
        code: 500,
        msg: err.message
      }));
      done();
    } else {
      let now = new Date();
      let quotation = { id: qid, vid: vid, state: state, created_at: now };
      let multi = cache.multi();
      multi.hset("quotations-entities", qid, JSON.stringify(quotation));
      multi.zadd("unquotated-quotations", now.getTime(), qid);
      multi.exec((err, replies) => {
        if (err) {
          log.error(err, "createQuotation error");
          cache.setex(callback, 30, JSON.stringify({
            code: 500,
            msg: err.message
          }));
        } else {
          cache.setex(callback, 30, JSON.stringify({
            code: 200,
            data: qid
          }));
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
quotation_groups id, qid, pid, is_must_have, created_at, updated_at as g
quotation_items id, piid, qgid, is_must_have, created_at, updated_at as qi
quotation_item_quotas id, qiid, num, unit, sorted, created_at, updated_at as quotas
quotation_item_prices id, qiid, price, real_price, sorted, created_at, updated_at as prices
select q.id, q.vid, q.state, q.promotion, q.created_at, q.updated_at, from quotations as q

processor.call("refresh", (db: PGClient, cache: RedisClient, done: DoneFunction, domain: string) => {
  log.info("quotation refresh begin");
  new Promise<void>((resolve, reject) => {
    db.query("SELECT q.id AS qid, q.vid AS vid, q.state AS q_state, q.promotion AS q_promotion, q.created_at AS q_created_at, q.updated_at AS q_updated_at, g.id AS gid, g.pid AS pid, g.is_must_have AS g_is_must_have, g.created_at AS g_created_at, g.updated_at AS g_updated_at, qi.id AS qiid, qi.piid AS piid, qi.is_must_have AS qi_is_must_have, quotas.id AS quota_id, quotas.num AS quota_num, quotas.unit AS quota_unit, quotas.sorted AS quota_sorted, prices.id AS price_id, prices.price AS price_price, prices. real_price AS price_real_price, prices.sorted AS price_sorted FROM quotations AS q LEFT JOIN quotation_groups AS g ON g.id = g.qid LEFT JOIN quotation_items AS qi ON g.id = qi.qgid LEFT JOIN quotation_item_quotas AS quotas ON qi.id = quotas.qiid LEFT JOIN quotation_item_prices AS prices ON qi.id = prices.qiid WHERE q.deleted = FALSE AND g.deleted = FALSE AND qi.deleted = FALSE AND quotas.deleted = FALSE AND prices.deleted = FALSE", [], (err: Error, result: ResultSet) => {
      if (err) {
        reject(err);
      } else {
        const quotations = {};
        for (const row of result.rows) {
          if (quotations.hasOwnProperty(row.qid)) {
            quotations[row.qid]["quotation_groups"].push({
              id: row.gid,
              pid: row.pid,
              is_must_have: row.g_is_must_have,
              created_at: row.g_created_at,
              updated_at: row.g_updated_at,
              items: null,
            })
          } else {
            const quotation = {
              id: row.qid,
              vid: row.vid,
              state: row.q_state,
              promotion: row.q_promotion,
              quotation_groups: [{
                id: row.gid,
                pid: row.pid,
                is_must_have: row.g_is_must_have,
                items: [{
                  id: row.qiid,
                  piid: row.piid,
                  is_must_have: row.qi_is_must_have,
                  quotas: [{
                    id: row.quota_id,
                    num: row.quota_num,
                    unit: row.quota_unit
                  }],
                  prices: [{
                    id: row.price_id,
                    price: row.price_id,
                    real_price: row.real_price
                  }]
                }],
                created_at: row.g_created_at,
                updated_at: row.g_updated_at
              }],
              created_at: row.p_created_at,
              updated_at: row.p_updated_at
            }
            quotations[row.qid] = quotation;
          }
        }

        const qids = Object.keys(quotations);
        const vidstmp = [];
        const pidstmp = [];
        const piidstmp = [];
        for (const qid of qids) {
          vidstmp.push(quotations[qid]["vid"]);
          for (const quotation_group of quotations[qid]["quotation_groups"]) {
            pidstmp.push(quotation_group["pid"]);
            for (const item of quotation_group["items"]) {
              piidstmp.push(item["piid"]);
            }
          }
        }
        const vids = [... new Set(vidstmp)];
        const pids = [... new Set(pidstmp)];
        const piids = [... new Set(piidstmp)];

        let pvs = vids.map(vid => rpc<Object>(domain, servermap["vehicle"], null, "getVehicleModelsByMake", vid));
        async_serial_ignore<Object>(pvs, [], (vreps) => {
          const vehicles = vreps.filter(v => v["code"] === 200).map(v => v["data"]);
          for (const vehicle of vehicles) {
            for (const qid of qids) {
              const quotation = quotations[qid];
              if (vehicle["id"] === quotation["vid"]) {
                quotation["vehicle"] = vehicle;
                break;
              }
            }
          }
          let pps = pids.map(pid => rpc<Object>(domain, servermap["plan"], null, "getPlan", pid));
          async_serial_ignore<Object>(pps, [], (preps) => {
            const plans = preps.filter(p => p["code"] === 200).map(q => q["data"]);
            for (const qid of qids) {
              const quotation = quotations[qid];
              for (const quotation_group of quotation["quotation_groups"]) {
                for (const plan of plans) {
                  if (plan["id"] === quotation_group.pid) {
                    quotation_group["plan"] = plan;
                    break;
                  }
                }
              }
            }
            const multi  = cache.multi();
            for(const qid of qids){
              const quotation = quotations[qid];
              const updated_at = quotation.updated_at.getTime();
              multi.zadd("quotations", updated_at, qid);
              if (quotation["state"] === 1 ){
                multi.hset("unquotated-quotations", qid, quotation);
              } else if(quotation["state"] === 3) {
                multi.hset("quotated_quotations", qid, quotation);
              }
              multi.exec((err: Error, _: any[]) => {
                if (err){
                  reject(err);
                } else {
                  resolve();
                }
              });
            }
          });
        });
      }
    });
  });
});

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


