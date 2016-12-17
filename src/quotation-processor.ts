import { Processor, ProcessorFunction, ProcessorContext, rpc, msgpack_encode, msgpack_decode, set_for_response } from "hive-service";
import { Client as PGClient, QueryResult } from "pg";
import { createClient, RedisClient, Multi } from "redis";
import * as bluebird from "bluebird";
import * as bunyan from "bunyan";
import * as msgpack from "msgpack-lite";
import * as nanomsg from "nanomsg";
import * as uuid from "uuid";
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

const quotation_trigger = nanomsg.socket("pub");
quotation_trigger.bind(process.env["QUOTATION-TRIGGER"]);

export const processor = new Processor();

processor.call("createQuotation", (ctx: ProcessorContext, qid: string, vid: string, state: number, cbflag: string, domain: string) => {
  log.info(`createQuotation, qid: ${qid}, vid: ${vid}, state: ${state}, cbflag: ${cbflag}, domain: ${domain}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;
  const done = ctx.done;

  const now = new Date();

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
              occurredAt: now
            };
            const pkt = await msgpack_encode(cm);
            multi.lpush("agent-customer-msg-queue", pkt);
          }
        }
      }
      await multi.execAsync();
      await set_for_response(cache, cbflag, {
        code: 200,
        data: { qid, created_at: now }
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
    if (quotation) {
      if (group) {
        if (item) {
          group.items.push(item);
        }
        quotation.group = group;
      }
      quotations.push(quotation);
    }
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
      await set_for_response(cache, cbflag, {
        code: 200,
        msg: "success"
      });
      done();
    } catch (e) {
      log.error(e);
      try {
      await set_for_response(cache, cbflag, {
        code: 200,
        msg: "success"
      });
        done();
      } catch (e) {
        done();
      }
    }
  })();
});

processor.call("saveQuotation", (ctx: ProcessorContext, acc_data: Object, state: number, cbflag: string, domain: string) => {
  log.info(`saveQuotation, acc_data: ${JSON.stringify(acc_data)}, state: ${state}, cbflag: ${cbflag}, domain: ${domain}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;
  const done = ctx.done;
  let qid = acc_data["thpBizID"];
  let c_list = acc_data["coverageList"];
  let id = null;
  const piid = {
    "A": "00000000-0000-0000-0000-000000000005",
    "B": "00000000-0000-0000-0000-000000000009",
    "F": "00000000-0000-0000-0000-000000000004",
    "FORCEPREMIUM": "00000000-0000-0000-0000-000000000008",
    "G1": "00000000-0000-0000-0000-000000000006",
    "X1": "00000000-0000-0000-0000-000000000002",
    "Z": "00000000-0000-0000-0000-000000000001",
    "Z3": "00000000-0000-0000-0000-000000000007",
    "Scratch": "00000000-0000-0000-0000-000000000003"
  };
  const levelb = ["5万", "10万", "15万", "20万", "30万", "50万", "100万"];
  const levels = ["3块漆", "6块漆"];
  (async () => {
    try {
      await db.query("BEGIN");
      await db.query("UPDATE quotations SET state = 3, insure = 3, auto = 1 WHERE id = $1", [qid]);
      id = uuid.v1();
      await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["A"], c_list["A"]["insuredPremium"], 0, "元", c_list["A"]["modifiedPremium"], 0, qid]);
      for (let i = 0; i < levelb.length; i ++) {
        id = uuid.v1();
        await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["B"], c_list["B"]["insuredPremium"][levelb[i]], 0, "元", c_list["B"]["modifiedPremium"][levelb[i]], i, qid]);
      }
      id = uuid.v1();
      await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["F"], c_list["F"]["insuredPremium"], 0, "元", c_list["F"]["modifiedPremium"], 0, qid]);
      id = uuid.v1();
      await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["FORCEPREMIUM"], c_list["FORCEPREMIUM"]["insuredPremium"], 0, "元", c_list["FORCEPREMIUM"]["modifiedPremium"], 0, qid]);
      id = uuid.v1();
      await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["G1"], c_list["G1"]["insuredPremium"], 0, "元", c_list["G1"]["modifiedPremium"], 0, qid]);
      id = uuid.v1();
      await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["X1"], c_list["X1"]["insuredPremium"], 0, "元", c_list["X1"]["modifiedPremium"], 0, qid]);
      id = uuid.v1();
      await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["Z"], c_list["Z"]["insuredPremium"], 0, "元", c_list["Z"]["modifiedPremium"], 0, qid]);
      id = uuid.v1();
      await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["Z3"], c_list["Z3"]["insuredPremium"], 0, "元", c_list["Z3"]["modifiedPremium"], 0, qid]);
      for (let i = 0; i < levels.length; i ++) {
        id = uuid.v1();
        await db.query("INSERT INTO quotation_item_list (id, piid, price, num, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, piid["Scratch"], c_list["Scratch"]["insuredPremium"][levels[i]], 0, "元", c_list["Scratch"]["modifiedPremium"][levels[i]], i, qid]);
      }
      await db.query("COMMIT");
      await sync_quotation(db, cache, domain, qid);
      await set_for_response(cache, cbflag, { code: 200, data: acc_data });
      done();
    } catch (err) {
      try {
        await db.query("ROLLBACK");
        await set_for_response(cache, cbflag, { code: 500, msg: err.message });
      } catch (e) {
        log.error(e);
      }
      done();
    }
  })();
});

log.info("Start quotation processor");
