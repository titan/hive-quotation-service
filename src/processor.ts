import { Processor, Config, ModuleFunction, DoneFunction, rpc, async_serial, async_serial_ignore } from "hive-processor";
import { Client as PGClient, QueryResult } from "pg";
import { createClient, RedisClient } from "redis";
import { Quota, Price, Item, Group } from "./quotation-definations";
import * as bunyan from "bunyan";
import { servermap, triggermap } from "hive-hostmap";
import * as uuid from "node-uuid";
import * as msgpack from "msgpack-lite";
import * as nanomsg from "nanomsg";
import * as http from "http";
import { CustomerMessage } from "recommend-library";

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
      let p = rpc<Object>(domain, servermap["profile"], null, "getUserByUserId", vehicle["data"]["user_id"]);
      p.then(profile => {
        let multi = cache.multi();
        if (profile["code"] === 200 && profile["data"]["ticket"]) {
          let cm: CustomerMessage = {
            type: 2,
            ticket: profile["data"]["ticket"],
            cid: vehicle["data"]["user_id"],
            name: profile["data"]["nickname"],
            qid: qid,
            occurredAt: date
          };
          multi.lpush("agent-customer-msg-queue", JSON.stringify(cm));
        }
        quotation["vehicle"] = vehicle["data"];
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
            }), (err, result) => {
              done();
            });
          } else {
            cache.setex(callback, 30, JSON.stringify({
              code: 200,
              data: qid
            }), (err, result) => {
              done();
            });
          }
        });
      });
    });
  }, (e: Error) => {
    log.error(e, e.message);
    db.query("ROLLBACK", [], (err: Error) => {
      cache.setex(callback, 30, JSON.stringify({
        code: 500,
        msg: e.message
      }), (err, result) => {
        done();
      });
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
      }), (err, result) => {
        done();
      });
    } else if (result) {
      cache.hget("quotation-entities", result, function (err2, result2) {
        if (err2) {
          log.info(err2);
          cache.setex(callback, 30, JSON.stringify({
            code: 500,
            msg: err2
          }), (err, result) => {
            done();
          });
        } else if (result2) {
          let quotation = JSON.parse(result2);
          quotation["state"] = 4;
          cache.hset("quotation-entities", quotation["id"], JSON.stringify(quotation), function (err3, result3) {
            if (err3) {
              log.info(err3);
              cache.setex(callback, 30, JSON.stringify({
                code: 500,
                msg: err3
              }), (err, result) => {
                done();
              });
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
          }), (err, result) => {
            done();
          });
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
          }), (err, result) => {
            done();
          });
        } else {
          let now = new Date();
          let quotation = { id: qid, vid: vid, state: state, created_at: now };
          let v = rpc<Object>(domain, servermap["vehicle"], null, "getVehicle", vid);
          v.then(vehicle => {
            let p = rpc<Object>(domain, servermap["profile"], null, "getUserByUserId", vehicle["data"]["user_id"]);
            p.then(profile => {
              let multi = cache.multi();
              if (profile["code"] === 200 && profile["data"]["ticket"]) {
                let cm: CustomerMessage = {
                  type: 1,
                  ticket: profile["data"]["ticket"],
                  cid: vehicle["data"]["user_id"],
                  name: profile["data"]["nickname"],
                  qid: qid,
                  occurredAt: now
                };
                multi.lpush("agent-customer-msg-queue", JSON.stringify(cm));
              }
              quotation["vehicle"] = vehicle["data"];
              multi.hset("VIN-quotationID", VIN, qid);
              multi.hset("quotation-entities", qid, JSON.stringify(quotation));
              multi.zadd("unquotated-quotations", now.getTime(), qid);
              multi.exec((err2, replies) => {
                if (err2) {
                  log.error(err2, "createQuotation error");
                  cache.setex(callback, 30, JSON.stringify({
                    code: 500,
                    msg: err2.message
                  }), (err, result) => {
                    done();
                  });
                } else {
                  cache.setex(callback, 30, JSON.stringify({
                    code: 200,
                    data: qid
                  }), (err, result) => {
                    done();
                  });
                }
              });
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

processor.call("refresh", (db: PGClient, cache: RedisClient, done: DoneFunction, domain: string, cbflag) => {
  log.info("quotation refresh begin");
  function unquotation_recursive(rows, acc, cb) {
    if (rows.length === 0) {
      cb(acc);
    } else {
      let row = rows.shift();
      let v = rpc<Object>(domain, servermap["vehicle"], null, "getVehicle", row.vid);
      v.then(vehicle => {
        let quotation = {
          id: row.id,
          vid: row.vid,
          state: row.state,
          promotion: row.promotion,
          created_at: row.created_at,
          updated_at: row.updated_at,
          vehicle: vehicle["data"],
        }
        acc.push(quotation);
        unquotation_recursive(rows, acc, cb);
      }).catch(err => {
        log.info(err);
        unquotation_recursive(rows, acc, cb);
      });
    }
  }
  let unquota = new Promise<void>((resolve, reject) => {
    db.query("SELECT id, vid, state, promotion, created_at, updated_at FROM quotations WHERE state = 1 AND deleted = false", [], (err: Error, result: QueryResult) => {
      if (err) {
        log.info("Select unquota error " + err);
        reject(err);
      } else {
        unquotation_recursive(result.rows, [], (quotations) => {
          if (quotations) {
            let multi = cache.multi();
            for (let quotation of quotations) {
              let date = new Date(quotation["updated_at"]).getTime();
              multi.hset("quotation-entities", quotation["id"], JSON.stringify(quotation));
              multi.zadd("unquotated-quotations", date, quotation["id"]);
            }
            multi.exec((err2, result2) => {
              if (err2) {
                log.info("Unquota multi exec error " + err2);
                reject(err2);
              } else {
                log.info("Unquota refresh end " + result2);
                resolve();
              }
            })
          } else {
            log.info("quotation is null");
            reject("quotation is null");
          }
        });
      }
    });
  });
  function quotated_prices(rows, acc, cb) {
    if (rows.length === 0) {
      cb(acc);
    } else {
      let row = rows.shift();
      let price = {
        id: row.id,
        price: row.price,
        real_price: row.real_price,
        sorted: row.sorted
      }
      acc.push(price);
      quotated_prices(rows, acc, cb);
    }
  }
  function quotated_quotas(rows, qiid, acc, cb) {
    if (rows.length === 0) {
      db.query("SELECT id, price, real_price, sorted FROM quotation_item_prices where qiid = $1 AND deleted = false", [qiid], (err: Error, result: QueryResult) => {
        if (err) {
          log.info("Select quotation_item_prices error " + err);
        } else {
          quotated_prices(result.rows, [], (prices) => {
            cb(acc, prices);
          });
        }
      });
    } else {
      let row = rows.shift();
      let quota = {
        id: row.id,
        num: row.num,
        unit: row.unit,
        sorted: row.sorted
      }
      acc.push(quota);
      quotated_quotas(rows, qiid, acc, cb);
    }
  }
  function quotated_items_recursive(rows, acc, cb) {
    if (rows.length === 0) {
      cb(acc);
    } else {
      let row = rows.shift();
      db.query("SELECT id, num, unit, sorted, qiid FROM quotation_item_quotas where qiid = $1 AND deleted = false", [row.id], (err: Error, result: QueryResult) => {
        if (err) {
          log.info("Select quotation_item_quotas error " + err);
          quotated_items_recursive(rows, acc, cb);
        } else {
          quotated_quotas(result.rows, result.rows[0].qiid, [], (quotas, prices) => {
            let item = {
              id: row.id,
              piid: row.piid,
              is_must_have: row.is_must_have,
              quotas: quotas,
              prices: prices
            }
            acc.push(item);
            quotated_items_recursive(rows, acc, cb);
          });
        }
      });
    }
  }
  function quotated_groups_recursive(rows, acc, cb) {
    if (rows.length === 0) {
      cb(acc);
    } else {
      let row = rows.shift();
      db.query("SELECT id, piid, is_must_have FROM quotation_items where qgid = $1 AND deleted = false", [row.id], (err: Error, result: QueryResult) => {
        if (err) {
          log.info("Select quotation_items error " + err);
          quotated_groups_recursive(rows, acc, cb);
        } else {
          quotated_items_recursive(result.rows, [], (items) => {
            let group = {
              id: row.id,
              pid: row.pid,
              is_must_have: row.is_must_have,
              created_at: row.created_at,
              updated_at: row.updated_at,
              items: items
            }
            acc.push(group);
            quotated_groups_recursive(rows, acc, cb);
          });
        }
      });
    }
  }
  function quotated_recursive(rows, acc, cb) {
    if (rows.length === 0) {
      cb(acc);
    } else {
      let row = rows.shift();
      db.query("SELECT id, pid, is_must_have, created_at, updated_at FROM quotation_groups where qid = $1  AND deleted = false", [row.id], (err: Error, result: QueryResult) => {
        if (err) {
          log.info("Select quotation_groups error " + err);
          quotated_recursive(rows, acc, cb);
        } else {
          quotated_groups_recursive(result.rows, [], (groups) => {
            let v = rpc<Object>(domain, servermap["vehicle"], null, "getVehicle", row.vid);
            v.then(vehicle => {
              let quotation = {
                id: row.id,
                vid: row.vid,
                state: row.state,
                promotion: row.promotion,
                created_at: row.created_at,
                updated_at: row.updated_at,
                vehicle: vehicle["data"],
                quotation_groups: groups
              }
              acc.push(quotation);
              quotated_recursive(rows, acc, cb);
            }).catch(err => {
              log.info(err);
              quotated_recursive(rows, acc, cb);
            });
          });
        }
      });
    }
  }
  let quotated = new Promise<void>((resolve, reject) => {
    db.query("SELECT id, vid, state, promotion, created_at, updated_at FROM quotations WHERE state = 3 AND deleted = false", [], (err: Error, result: QueryResult) => {
      if (err) {
        log.info("Select quotated error " + err);
        reject(err);
      } else {
        quotated_recursive(result.rows, [], (quotations) => {
          // log.info("quotations" + JSON.stringify(quotations));
          if (quotations) {
            let multi = cache.multi();
            for (let quotation of quotations) {
              let date = new Date(quotation["updated_at"]).getTime();
              multi.hset("quotation-entities", quotation["id"], JSON.stringify(quotation));
              multi.zadd("quotated-quotations", date, quotation["id"]);
            }
            multi.exec((err2, result2) => {
              if (err2) {
                log.info("quotated multi exec error " + err2);
                reject(err2)
              } else {
                log.info("quotated refresh end " + result2);
                resolve();
              }
            })
          } else {
            log.info("quotated quotation is null");
            reject("quotated quotation is null");
          }
        });
      }
    });
  });
  async_serial<void>([unquota, quotated], [], () => {
    cache.setex(cbflag, 30, JSON.stringify({
      code: 200,
      msg: "success"
    }), (err, result) => {
      done();
    });
  }, (e: Error) => {
    cache.setex(cbflag, 30, JSON.stringify({
      code: 500,
      msg: e.message
    }), (err, result) => {
      done();
    });
  });
});

log.info("Start processor at %s", config.addr);

processor.run();


