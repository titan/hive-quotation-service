import { Processor, ProcessorFunction, ProcessorContext, rpc, msgpack_encode_async as msgpack_encode, msgpack_decode_async as msgpack_decode, set_for_response } from "hive-service";
import { Client as PGClient, QueryResult } from "pg";
import { createClient, RedisClient, Multi } from "redis";
import * as bluebird from "bluebird";
import * as bunyan from "bunyan";
import * as msgpack from "msgpack-lite";
import * as nanomsg from "nanomsg";
import * as uuid from "uuid";
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

processor.callAsync("createQuotation", async (ctx: ProcessorContext,
  qid: string,
  vid: string,
  state: number) => {
  log.info(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, vid: ${vid}, state: ${state}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;

  const now = new Date();
  try {
    const qresult = await db.query("SELECT id FROM quotations WHERE id = $1", [qid]);
    if (qresult.rowCount > 0) {
      log.error(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, vid: ${vid}, state: ${state}, msg: 该报价已经存在`);
      return {
        code: 404,
        msg: "该报价已经存在"
      };
    }
    await db.query("INSERT INTO quotations (id, vid, state) VALUES ($1, $2, $3)", [qid, vid, state]);
    await sync_quotation(ctx, qid);

    // 现在的方案没有代理商模块
    // const multi = bluebird.promisifyAll(cache.multi()) as Multi;
    // const vrep = await rpc<Object>(ctx.domain, process.env["VEHICLE"], null, "getVehicle", vid);
    // if (vrep["code"] === 200) {
    //   const vehicle = vrep["data"];
    //   const prep = await rpc<Object>(ctx.domain, process.env["PROFILE"], null, "getUserByUserId", vehicle["uid"]);
    //   if (prep["code"] === 200) {
    //     const profile = prep["data"];
    //     if (profile["ticket"]) {
    //       const cm: CustomerMessage = {
    //         type: 1,
    //         ticket: profile["ticket"],
    //         cid: vehicle["uid"],
    //         name: profile["nickname"],
    //         qid: qid,
    //         occurredAt: now
    //       };
    //       const pkt = await msgpack_encode(cm);
    //       multi.lpush("agent-customer-msg-queue", pkt);
    //     }
    //   }
    // }
    // await multi.execAsync();

    return {
      code: 200,
      data: { qid, created_at: now }
    };
  } catch (err) {
    log.info(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, vid: ${vid}, state: ${state}`, err);
    ctx.report(3, err);
    return {
      code: 500,
      msg: "创建报价失败"
    };
  }
});

async function sync_quotation(ctx: ProcessorContext,
  qid?: string): Promise<any> {
  const dbresult = await ctx.db.query("SELECT q.id, q.vid, q.state, q.outside_quotation1, q.outside_quotation2, q.screenshot1, q.screenshot2, q.price AS qprice, q.real_value, q.promotion, q.insure AS qinsure, q.auto, i.id AS iid, i.pid, i.price, i.amount, trim(i.unit) AS unit, i.real_price, i.type, i.insure AS iinsure FROM quotations AS q INNER JOIN quotation_items i ON q.id = i.qid AND q.insure = i.insure " + (qid ? "AND qid=$1 ORDER BY q.id, i.pid, iinsure" : " ORDER BY q.id, i.pid, iinsure"), qid ? [qid] : []);
  const quotations = [];
  let quotation = null;
  let item = null;
  let planDict = {};
  const planr = await rpc(ctx.domain, process.env["PLAN"], ctx.uid, "getPlans");
  try {
    if (planr["code"] === 200) {
      let plans = planr["data"];
      if (plans.length > 0) {
        for (let p of plans) {
          let planid = p["id"];
          planDict[planid] = p;
        }
      }
    } else {
      return;
    }
    const vidqids = {};
    if (dbresult.rowCount > 0) {
      for (const row of dbresult.rows) {
        if (quotation && quotation.id !== row.id || !quotation) {
          if (quotation) {
            if (item) {
              quotation.items.push(item);
            }
            quotations.push(quotation);
          }
          let vhcl = null;
          const vrep = await rpc<Object>(ctx.domain, process.env["VEHICLE"], ctx.uid, "getVehicle", row.vid);
          if (vrep["code"] === 200) {
            vhcl = vrep["data"];
            if (vidqids[vhcl["id"]]) {
              vidqids[vhcl["id"]].push(row.id);
            } else {
              vidqids[vhcl["id"]] = [row.id];
            }
          }
          quotation = {
            id: row.id,
            state: row.state,
            items: [],
            vehicle: vhcl,
            outside_quotation1: row.outside_quotation1,
            outside_quotation2: row.outside_quotation2,
            screenshot1: row.screenshot1,
            screenshot2: row.screenshot2,
            price: row.qprice,
            real_value: row.real_value,
            promotion: row.promotion,
            insure: row.insure,
            auto: row.auto
          };
          item = null;
        }
        if (item && item.id !== row.pid || !item) {
          if (item) {
            quotation.items.push(item);
          }
          item = {
            id: row.pid,
            plan: planDict[row.pid],
            pairs: []
          };
        }
        const qipair = {
          type: row.type,
          price: row.price,
          real_price: row.real_price,
          amount: row.amount,
          unit: row.unit
        };
        item.pairs.push(qipair);
      }
      if (quotation) {
        if (item) {
          quotation.items.push(item);
        }
        quotations.push(quotation);
      }
    }
    const multi = bluebird.promisifyAll(ctx.cache.multi()) as Multi;
    for (const quotation of quotations) {
      const buf = await msgpack_encode(quotation);
      multi.hset("quotation-entities", quotation["id"], buf);
    }
    for (const key of Object.keys(vidqids)) {
      const pkt = await msgpack_encode(vidqids[key]);
      multi.hset("vid-qids", key, pkt);
    }
    return await multi.execAsync();
  } catch (err) {
    log.error(`sync_quotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}`, err);
  }
}

processor.callAsync("refresh", async (ctx: ProcessorContext,
  qid?: string) => {
  log.info(`refresh uid: ${ctx.uid}, qid: ${qid}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;
  try {
    if (!qid) {
      // 全刷时除旧
      await cache.delAsync("quotation-entities");
      await cache.delAsync("vid-qid");
    }
    await sync_quotation(ctx, qid);
    return {
      code: 200,
      msg: "Refresh is done"
    };
  } catch (err) {
    log.error(`refresh, sn: ${ctx.sn}, uid: ${ctx.uid}, msg: error on remove old data`, err);
    ctx.report(3, err);
    return {
      code: 500,
      msg: "Error on refresh"
    };
  }
});

processor.callAsync("saveQuotation", async (ctx: ProcessorContext,
  acc_data: Object,
  state: number) => {
  log.info(`saveQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, acc_data: ${JSON.stringify(acc_data)}, state: ${state}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;
  let qid = acc_data["thpBizID"];
  let c_list = acc_data["coverageList"];
  let id = null;
  const pid = {
    "A": 1, // 车损
    "G1": 2, // 机动车全车盗抢
    "Z3": 4, // 无法找到第三方特约责任
    "Z": 512, // 机动车自燃损失
    "X1": 1024, // 机动车发动机涉水损失
    "Scratch": 2048, // 机动车车身划痕损失
    "F": 4096, // 玻璃单独破碎
    "FORCEPREMIUM": 33554432, // 交强险+车船税
    "B": 67108864, // 商业第三方责任险
  };
  const levelb = ["5万", "10万", "15万", "20万", "30万", "50万", "100万"];
  const numb = [5, 10, 15, 20, 30, 50, 100];
  const levels = ["3块漆", "6块漆"];
  const nums = [3, 6];
  try {
    await db.query("BEGIN");
    await db.query("UPDATE quotations SET state = 3, insure = 3, auto = 2, real_value = $1 WHERE id = $2", [acc_data["real_value"], qid]);
    id = uuid.v1();
    await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["A"], c_list["A"]["insuredPremium"], 0, "元", c_list["A"]["modifiedPremium"], 0, qid]);
    for (let i = 0; i < levelb.length; i++) {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["B"], c_list["B"]["insuredPremium"][levelb[i]], numb[i], "万", c_list["B"]["modifiedPremium"][levelb[i]], (i + 1), qid]);
    }
    id = uuid.v1();
    await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["F"], c_list["F"]["insuredPremium"], 0, "元", c_list["F"]["modifiedPremium"], 0, qid]);
    id = uuid.v1();
    await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["FORCEPREMIUM"], c_list["FORCEPREMIUM"]["insuredPremium"], 0, "元", c_list["FORCEPREMIUM"]["modifiedPremium"], 0, qid]);
    id = uuid.v1();
    await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["G1"], c_list["G1"]["insuredPremium"], 0, "元", c_list["G1"]["modifiedPremium"], 0, qid]);
    id = uuid.v1();
    await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["X1"], c_list["X1"]["insuredPremium"], 0, "元", c_list["X1"]["modifiedPremium"], 0, qid]);
    id = uuid.v1();
    await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["Z"], c_list["Z"]["insuredPremium"], 0, "元", c_list["Z"]["modifiedPremium"], 0, qid]);
    id = uuid.v1();
    await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["Z3"], c_list["Z3"]["insuredPremium"], 0, "元", c_list["Z3"]["modifiedPremium"], 0, qid]);
    for (let i = 0; i < levels.length; i++) {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8)", [id, pid["Scratch"], c_list["Scratch"]["insuredPremium"][levels[i]], nums[i], "块漆", c_list["Scratch"]["modifiedPremium"][levels[i]], i, qid]);
    }
    await db.query("COMMIT");
    await sync_quotation(ctx, qid);
    const rep_acc_buff: Buffer = await cache.hgetAsync("quotation-entities", qid);
    const rep_acc_data = await msgpack_decode(rep_acc_buff);
    // const result = await db.query("SELECT q.id AS qid, trim(p.name) AS name, trim(vm.family_name) AS model, trim(v.license_no) AS license, v.id AS vid, u.openid from quotations AS q INNER JOIN vehicles AS v ON q.vid = v.id INNER JOIN person AS p ON v.owner = p.id INNER JOIN users AS u ON v.uid = u.id INNER JOIN vehicle_models AS vm ON v.vehicle_code = vm.vehicle_code WHERE q.id = $1", [qid]);
    // const dbresult = await db.query("SELECT q.id AS qid, trim(p.name) AS name, trim(vm.family_name) AS model, trim(v.license_no) AS license, v.id AS vid, u.openid from quotations AS q");
    // // 通滚vid获取车辆信息
    // //　通过vehicle code　获取车辆信号信息
    // 推送不要
    // if (result.rowCount === 0) {
    // rpc<Object>(ctx.domain, process.env["VEHICLE"], null, "getVehicle", vid);
    //   const row = result.rows[0];
    //   await push_quotation_to_wechat(row.openid, row.name, row.model, row.license, qid, row.vid);
    // }
    return { code: 200, data: rep_acc_data };
  } catch (err) {
    ctx.report(3, err);
    log.error(`saveQuotation, acc_data: ${JSON.stringify(acc_data)}, state: ${state}`, err);
    try {
      await db.query("ROLLBACK");
      return { code: 500, msg: err.message };
    } catch (e) {
      ctx.report(3, err);
      log.error(e);
    }
  }
});

// 不需要推送到微信
// async function push_quotation_to_wechat(openid: string, name: string, model: string, license: string, qid: string, vid: string): Promise<any> {
//   const path = `/wx/${process.env["WX_ENV"] === "test" ? "" : "wxpay/"}tmsgQuotedPrice1?user=${openid}&CarNo=${model}&No=${license}&Name=${name}&qid=${qid}&vid=${vid}`;
//   const options = {
//     hostname: process.env["WX_ENV"] === "test" ? "dev.fengchaohuzhu.com" : "m.fengchaohuzhu.com",
//     method: "GET",
//     path: path,
//   };

//   const req = http.request(options, function (res) {
//     res.setEncoding("utf8");

//     let body: string = "";
//     res.on("data", function (buf) {
//       body += buf;
//     });

//     res.on("end", function () {
//       log.info(`push quotation to wechat response: ${body}`);
//     });
//   });

//   req.setTimeout(60000, () => {
//     const e: Error = new Error();
//     e.name = "504";
//     e.message = "自动报价推送到微信超时";
//     log.error(e);
//   });

//   req.end();
// }

log.info("Start quotation processor");
