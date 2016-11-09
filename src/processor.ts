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

processor.call("addQuotationGroups", (db: PGClient, cache: RedisClient, done: DoneFunction, qid: string, vid: string, state: number, groups: any, promotion: number, callback: string, domain: any) => {
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
    let v = rpc<Object>(domain, servermap["vehicle"], null, "getVehicle", vid);
    v.then(vehicle => {
      quotation["vehicle"] = vehicle["data"];
      let multi = cache.multi();
      multi.hset("quotation-entities", qid, JSON.stringify(quotation));
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

processor.call("createQuotation", (db: PGClient, cache: RedisClient, done: DoneFunction, qid: string, vid: string, state: number, callback: string, domain: any, VIN: string) => {
  log.info("createQuotation");
  cache.hget("VIN-quotationID", VIN, function (err, result) {
    if (err) {
      log.info(err);
      cache.setex(callback, 30, JSON.stringify({
        code: 500,
        msg: err
      }));
    } else if (result) {
      cache.hget("quotation-entities", result, function (err2, result2) {
        if (err2) {
          log.info(err2);
          cache.setex(callback, 30, JSON.stringify({
            code: 500,
            msg: err2
          }));
        } else if (result2) {
          let quotation = JSON.parse(result2);
          quotation["state"] = 4;
          log.info(JSON.stringify(quotation) + "===========" + quotation["id"]);
          cache.hset("quotation-entities", quotation["id"], JSON.stringify(quotation), function (err3, result3) {
            if (err3) {
              log.info(err3);
              cache.setex(callback, 30, JSON.stringify({
                code: 500,
                msg: err3
              }));
            } else {
              log.info("hset quotation " + result3);
              dbquery();
            }
          });
        } else {
          log.info("not found quotation");
          cache.setex(callback, 30, JSON.stringify({
            code: 404,
            msg: "not found quotation"
          }));
        }
      });
    } else {
      dbquery();
    }
    function dbquery() {
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
          let v = rpc<Object>(domain, servermap["vehicle"], null, "getVehicle", vid);
          v.then(vehicle => {
            quotation["vehicle"] = vehicle["data"];
            let multi = cache.multi();
            multi.hset("VIN-quotationID", VIN, qid);
            multi.hset("quotation-entities", qid, JSON.stringify(quotation));
            multi.zadd("unquotated-quotations", now.getTime(), qid);
            multi.exec((err2, replies) => {
              if (err2) {
                log.error(err2, "createQuotation error");
                cache.setex(callback, 30, JSON.stringify({
                  code: 500,
                  msg: err2.message
                }));
              } else {
                cache.setex(callback, 30, JSON.stringify({
                  code: 200,
                  data: qid
                }));
              }
              done();
            });
          });
        }
      });
    }
  })
});


interface QuotationCtx {
  db: PGClient;
  cache: RedisClient;
  domain: string;
  uid: string;
}

processor.call("refresh", (db: PGClient, cache: RedisClient, done: DoneFunction, domain: string) => {
  log.info("quotation refresh begin");
  // (ps: Promise<T>[], acc: T[], errs: any, cb: (vals: T[], errs: any) => void)
  function datas(rows) {
    log.info("data begin");
    const quotations = {};
    const quotation_groups = [];
    const quotation_items = [];
    const quotation_quotas = [];
    const quotation_prices = [];
    for (const row of rows) {
      if (quotations.hasOwnProperty(row.qid)) {
        // log.info("row.qid" + row.qid);
        // for (let group of quotations[row.qid]["quotation_groups"]) {
        //   if (group["id"] === row.gid) {
        //     // log.info("groupitme=======" + group["items"]);
        //     for (let item of group["items"]) {
        //       // log.info("item" + item["id"] + "===========" + row.qiid);
        //       if (item["id"] === row.qiid) {
        //         let foundPrice: boolean = false;
        //         for (let price of item["prices"]) {
        //           if (price["id"] === row.price_id) {
        //             foundPrice = true;
        //             break;
        //           }
        //         }
        //         if (!foundPrice) {
        //           item["prices"].push({
        //             id: row.quota_id,
        //             num: row.quota_num,
        //             unit: row.quota_unit
        //           });
        //           item["quotas"].push({
        //             id: row.quota_id,
        //             num: row.quota_num,
        //             unit: row.quota_unit
        //           });
        //         }
        //         break;
        //       } else {
        //         //log.info("items========" + group["items"]);
        //         group["items"].push({
        //           id: row.qiid,
        //           piid: row.piid,
        //           is_must_have: row.qi_is_must_have,
        //           quotas: [{
        //             id: row.quota_id,
        //             num: row.quota_num,
        //             unit: row.quota_unit
        //           }],
        //           prices: [{
        //             id: row.price_id,
        //             price: row.price_id,
        //             real_price: row.real_price
        //           }]
        //         });
        //         break;
        //       }
        //     }
        //   } else {
        //     quotations[row.qid]["quotation_groups"].push({
        //       id: row.gid,
        //       pid: row.pid,
        //       is_must_have: row.g_is_must_have,
        //       items: [{
        //         id: row.qiid,
        //         piid: row.piid,
        //         is_must_have: row.qi_is_must_have,
        //         quotas: [{
        //           id: row.quota_id,
        //           num: row.quota_num,
        //           unit: row.quota_unit
        //         }],
        //         prices: [{
        //           id: row.price_id,
        //           price: row.price_id,
        //           real_price: row.real_price
        //         }]
        //       }],
        //       created_at: row.g_created_at,
        //       updated_at: row.g_updated_at
        //     });
        //   }
        // }
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
            created_at: row.q_created_at,
            updated_at: row.q_updated_at
          }
          quotations[row.qid] = quotation;
      }
    }
    log.info("data end");
    return quotations;
  }

  new Promise<Object>((resolve, reject) => {
    db.query("SELECT DISTINCT ON (prices.id) prices.id AS price_id, q.id AS qid, q.vid AS vid, q.state AS q_state, q.promotion AS q_promotion, q.created_at AS q_created_at, q.updated_at AS q_updated_at, g.id AS gid, g.pid AS pid, g.is_must_have AS g_is_must_have, g.created_at AS g_created_at, g.updated_at AS g_updated_at, qi.id AS qiid, qi.piid AS piid, qi.is_must_have AS qi_is_must_have, quotas.id AS quota_id, quotas.num AS quota_num, quotas.unit AS quota_unit, quotas.sorted AS quota_sorted, prices.price AS price_price, prices. real_price AS price_real_price, prices.sorted AS price_sorted FROM quotation_item_quotas AS quotas LEFT JOIN quotation_item_prices AS prices ON quotas.qiid = prices.qiid LEFT JOIN quotation_items AS qi ON qi.id = prices.qiid LEFT JOIN quotation_groups AS g ON g.id = qi.qgid LEFT JOIN quotations AS q ON q.id = g.qid WHERE q.deleted = FALSE AND g.deleted = FALSE AND qi.deleted = FALSE AND quotas.deleted = FALSE AND prices.deleted = FALSE", [], (err: Error, result: ResultSet) => {
      if (err) {
        log.info(err);
        reject(err);
      } else {
        log.info("dbquery exec");
        let quotations = datas(result.rows);
        resolve(quotations);
      }
    });
  })
    .then(quotations => {
      log.info("enter quotation");
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
      let pvs = vids.map(vid => rpc<Object>(domain, servermap["vehicle"], null, "getVehicle", vid));
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
        // async_serial_ignore<Object>(pps, [], (preps) => {
        //   const plans = preps.filter(p => p["code"] === 200).map(q => q["data"]);
        //   for (const qid of qids) {
        //     const quotation = quotations[qid];
        //     for (const quotation_group of quotation["quotation_groups"]) {
        //       for (const plan of plans) {
        //         if (plan["id"] === quotation_group.pid) {
        //           quotation_group["plan"] = plan;
        //           break;
        //         }
        //       }
        //     }
        //   }
        const multi = cache.multi();
        for (const qid of qids) {
          const quotation = quotations[qid];
          // log.info("quotatin==========" + quotation);
          log.info("update_at-----------" + quotation["updated_at"]);
          const updated_at = new Date(quotation["updated_at"]);
          log.info("updated_at" + updated_at);
          const date = updated_at.getTime();
          log.info("date" + date);
          multi.hset("quotation-entities", qid, JSON.stringify(quotation));
          if (quotation["state"] === 1) {
            multi.zadd("unquotated-quotations", date, qid);
          } else if (quotation["state"] === 3) {
            multi.zadd("quotated-quotations", date, qid);
          }
        }
        multi.exec((err, replies) => {
          if (err) {
            log.info(err);
          } else {
            log.info("refresh end[" + replies + "]");
          }
          done();
        });
        log.info("the end");
      });
    });
  // });
});

log.info("Start processor at %s", config.addr);

processor.run();


