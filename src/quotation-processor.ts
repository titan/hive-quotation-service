import { Processor, ProcessorFunction, ProcessorContext, rpc, msgpack_encode, msgpack_decode, set_for_response } from "hive-service";
import { Client as PGClient, QueryResult } from "pg";
import { createClient, RedisClient, Multi } from "redis";
import * as bluebird from "bluebird";
import * as bunyan from "bunyan";
import * as msgpack from "msgpack-lite";
import * as nanomsg from "nanomsg";
import * as zlib from "zlib";
import { CustomerMessage } from "recommend-library";

const log = bunyan.createLogger({
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

declare module "redis" {
  export interface RedisClient extends NodeJS.EventEmitter {
    incrAsync(key: string): Promise<any>;
    hgetAsync(key: string, field: string): Promise<any>;
    hsetAsync(key: string, field: string, value: string | Buffer): Promise<any>;
    hincrbyAsync(key: string, field: string, value: number): Promise<any>;
    lpushAsync(key: string, value: string | number): Promise<any>;
    setexAsync(key: string, ttl: number, value: string): Promise<any>;
    zrevrangebyscoreAsync(key: string, start: number, stop: number): Promise<any>;
  }
  export interface Multi extends NodeJS.EventEmitter {
    execAsync(): Promise<any>;
  }
}

const quotation_trigger = nanomsg.socket("pub");
quotation_trigger.bind(process.env["QUOTATION-TRIGGER"]);

export const processor = new Processor();

processor.call("createQuotation", (ctx: ProcessorContext, qid: string, vid: string, state: number, cbflag: string, domain: string) => {
  log.info(`createQuotation, qid: ${qid}, vid: ${vid}, state: ${state}, cbflag: ${cbflag}, domain: ${domain}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;
  const done = ctx.done;
  (async () => {
    try {
      await db.query("INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)", [qid, vid, state]);
      await sync_quotation(db, cache, domain, qid);

      const multi = bluebird.promisifyAll(cache.multi()) as Multi;
      const vrep = await rpc<Object>(domain, process.env["VEHICLE"], null, "getVehicle", vid);
      if (vrep["code"] === 200) {
        const vehicle = vrep["data"];
        const prep = await rpc<Object>(domain, process.env["PROFILE"], null, "getUserByUserId", vehicle["uid"]);
        if (prep["code"] === 200) {
          const profile = prep["data"];
          if (profile["ticket"]) {
            const cm: CustomerMessage = {
              type: 1,
              ticket: profile["ticket"],
              cid: vehicle["uid"],
              name: profile["nickname"],
              qid: qid,
              occurredAt: new Date()
            };
            const pkt = await msgpack_encode(cm);
            multi.lpush("agent-customer-msg-queue", pkt);
          }
        }
      }
      await multi.execAsync();
      await set_for_response(cache, cbflag, {
        code: 200,
        data: qid
      });
      done();
    } catch (err) {
      set_for_response(cache, cbflag, {
        code: 500,
        msg: err.message
      }).then(_ => {
        done();
      }).catch(e => {
        log.error(e);
        done();
      });
    }
  })();
});

function rows_to_quotations(rows, domain, quotations = [], quotation = null, group = null, item = null) {
  if (rows.length === 0) {
    return quotations;
  } else {
    const row = rows.shift();
    let q = quotation;
    let g = group;
    let i = item;
    if (quotation && quotation.id !== row.id || !quotation) {
      if (quotation) {
        quotations.push(quotation);
      }
      q = {
        id: row.id,
        vid: row.vid,
        state: row.state,
        promotion: row.promotion,
        groups: []
      };
      g = null;
      i = null;
    }
    if (g && g.id !== row.pid || !g) {
      if (g) {
        q.groups.push(g);
      }
      g = {
        id: row.pid,
        pid: row.pid,
        items: []
      };
      i = null;
    }
    if (i && i.id !== row.piid || !i) {
      if (i) {
        g.items.push(i);
      }
      i = {
        id: row.piid,
        piid: row.piid,
        quotas: [],
        prices: []
      };
    }
    const quota = {
      id: row.iid,
      num: row.num,
      unit: row.unit
    };
    const price = {
      id: row.iid,
      price: row.price,
      real_price: row.real_price
    };
    i.quotas.push(quota);
    i.prices.push(price);
    return rows_to_quotations(rows, domain, quotations, q, g, i);
  }
}

async function sync_quotation(db: PGClient, cache: RedisClient, domain: string, qid?: string): Promise<any> {
  const result = await db.query("SELECT q.id, q.vid, q.state, q.promotion, q.pid, q.total_price, q.fu_total_price, q.insure AS qinsure, pi.id AS piid, trim(pi.title) AS title, i.id AS iid, i.price, i.num, trim(i.unit) AS unit, i.real_price, i.type, i.insure AS iinsure FROM quotations AS q INNER JOIN quotation_item_list i ON q.id = i.qid AND q.insure = i.insure INNER JOIN plan_items AS pi ON pi.id = i.piid WHERE q.deleted = false " + (qid ? "AND qid=$1 ORDER BY q.id, iinsure" : "ORDER BY q.id, pid, iinsure"), qid ? [ qid ] : []);
  const quotations = rows_to_quotations(result.rows, domain);
  const multi = bluebird.promisifyAll(cache.multi()) as Multi;
  for (const quotation of quotations) {
    const vrep = await rpc<Object>(domain, process.env["VEHICLE"], null, "getVehicle", quotation.vid);
    if (vrep["code"] === 200) {
      quotation["vehicle"] = vrep["data"];
    }
    const buf = await msgpack_encode(quotation);
    multi.hset("quotation-entities", quotation.id, buf);
  }
  return multi.execAsync();
}

processor.call("refresh", (ctx: ProcessorContext, domain: string, cbflag: string, qid?: string) => {
  log.info(`refresh, domain: ${domain}, cbflag: ${cbflag}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;
  const done = ctx.done;
  (async () => {
    try {
      await sync_quotation(db, cache, domain, qid);
      cache.setex(cbflag, 30, JSON.stringify({
        code: 200,
        msg: "success"
      }), (err, result) => {
        done();
      });
    } catch (e) {
      log.error(e);
      cache.setex(cbflag, 30, JSON.stringify({
        code: 500,
        msg: e.message
      }), (err, result) => {
        done();
      });
    }
  })();
});

// processor.call("saveQuotation", (ctx: ProcessorContext, acc_data: Object, state: number, cbflag: string, domain: string) => {
//   // log.info(`createQuotation, qid: ${qid}, vid: ${vid}, state: ${state}, cbflag: ${cbflag}, domain: ${domain}`);
//   const db: PGClient = ctx.db;
//   const cache: RedisClient = ctx.cache;
//   const done = ctx.done;
//   (async () => {
//     try {
      // let










//       await db.query("INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)", [qid, vid, state]);
//       await sync_quotation(db, cache, domain, qid);

//       const multi = bluebird.promisifyAll(cache.multi()) as Multi;
//       const vrep = await rpc<Object>(domain, process.env["VEHICLE"], null, "getVehicle", vid);
//       if (vrep["code"] === 200) {
//         const vehicle = vrep["data"];
//         const prep = await rpc<Object>(domain, process.env["PROFILE"], null, "getUserByUserId", vehicle["uid"]);
//         if (prep["code"] === 200) {
//           const profile = prep["data"];
//           if (profile["ticket"]) {
//             const cm: CustomerMessage = {
//               type: 1,
//               ticket: profile["ticket"],
//               cid: vehicle["uid"],
//               name: profile["nickname"],
//               qid: qid,
//               occurredAt: new Date()
//             };
//             multi.lpush("agent-customer-msg-queue", JSON.stringify(cm));
//           }
//         }
//       }
//       multi.setex(cbflag, 30, JSON.stringify({
//         code: 200,
//         data: qid
//       }));
//       await multi.execAsync();
//       done();
//     } catch (err) {
//       cache.setex(cbflag, 30, JSON.stringify({
//         code: 500,
//         msg: err.message
//       }), (err, result) => {
//         done();
//       });
//     }
//   })();
// });

log.info("Start quotation processor");
