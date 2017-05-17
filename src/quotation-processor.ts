import { Processor, ProcessorFunction, ProcessorContext, rpcAsync, msgpack_encode_async, msgpack_decode_async, set_for_response, Result } from "hive-service";
import { Client as PGClient, QueryResult } from "pg";
import { createClient, RedisClient, Multi } from "redis";
import { Quotation, QuotationItem, QuotationItemPair } from "quotation-library";
import { Plan } from "plan-library";
import { Vehicle } from "vehicle-library";
import * as bluebird from "bluebird";
import * as bunyan from "bunyan";
import * as nanomsg from "nanomsg";
import * as uuid from "uuid";

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

processor.callAsync("createQuotation", async (ctx: ProcessorContext, qid: string, vid: string, owner: string, insured: string, discount: number, recommend: string, inviter: string, driving_view: string) => {
  log.info(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, vid: ${vid}, owner: ${owner}, insured: ${insured}, discount: ${discount}, recommend: ${recommend}, inviter: ${inviter}, driving_view: ${driving_view}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;

  const now = new Date();
  try {
    const qresult = await db.query("SELECT id FROM quotations WHERE id = $1", [qid]);
    if (qresult.rowCount > 0) {
      log.error(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, vid: ${vid}, owner: ${owner}, insured: ${insured}, discount: ${discount}, recommend: ${recommend}, inviter: ${inviter}, driving: ${driving_view}, msg: 该报价已经存在`);
      return {
        code: 404,
        msg: `该报价已经存在(QCQP404), qid: ${qid}`,
      };
    }
    if (driving_view) {
      await db.query("INSERT INTO quotations (id, uid, vid, owner, insured, discount, recommend, inviter, driving_view, driving_view_verify_state, state, insure, auto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 3, 1, 0, 1)", [qid, ctx.uid, vid, owner, insured, discount, recommend, inviter, driving_view]);
    } else {
      await db.query("INSERT INTO quotations (id, uid, vid, owner, insured, discount, recommend, inviter, state, insure, auto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 0, 1)", [qid, ctx.uid, vid, owner, insured, discount, recommend, inviter]);
    }
    return {
      code: 200,
      data: { qid, created_at: now }
    };
  } catch (err) {
    ctx.report(1, err);
    log.info(`createQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${qid}, vid: ${vid}, owner: ${owner}, insured: ${insured}, discount: ${discount}, recommend: ${recommend}, inviter: ${inviter}, driving_view: ${driving_view}`, err);
    return {
      code: 500,
      msg: `创建报价失败(QCQP500: ${err.message})`,
    };
  }
});

processor.callAsync("createAgentQuotation", async (ctx: ProcessorContext, vid: string, owner: string, insured: string, recommend: string, inviter: string, items: any[], real_value: number, price: number, qid: string) => {
  log.info(`createAgentQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, owner: ${owner}, insured: ${insured}, recommend: ${recommend}, inviter: ${inviter}, items: ${JSON.stringify(items)}, real_value: ${real_value}, price: ${price} qid: ${qid}`);
  const db: PGClient = ctx.db;
  await db.query("BEGIN");
  await db.query("INSERT INTO quotations (id, uid, vid, owner, insured, recommend, inviter, state, insure, auto, real_value, price) VALUES ($1, $2, $3, $4, $5, $6, $7, 3, $8, 0, $9, $10)", [qid, ctx.uid, vid, owner, insured, recommend, inviter, items[0]["insure"], real_value, price]);
  const ivalue = [];

  for (const item of items) {
    const id = uuid.v4();
    const pid = item["pid"];
    const price = item["price"];
    const amount = item["amount"];
    const unit = item["unit"];
    const real_price = item["real_price"];
    const type = item["type"];
    const insure = item["insure"];
    ivalue.push(` ('${id}', ${price}, ${amount}, '${unit}', ${real_price}, ${type}, ${insure}, '${qid}', '${pid}')`);
  }
  await db.query("INSERT INTO quotation_items (id, price, amount, unit, real_price, type, insure, qid, pid) VALUES" + ivalue.join(','));
  await db.query("COMMIT");
  await sync_quotation(ctx, qid);
  return {
    code: 200,
    data: { qid, created_at: new Date() },
  };
});

async function sync_quotation(ctx: ProcessorContext, qid?: string): Promise<any> {
  const dbresult = await ctx.db.query("SELECT q.id, q.uid, q.owner, q.insured, q.recommend, q.vid, q.state, q.outside_quotation1, q.outside_quotation2, q.screenshot1, q.screenshot2, q.price AS qprice, q.real_value, q.promotion, q.insure AS qinsure, q.auto, q.created_at, q.updated_at, q.inviter, q.discount, q.driving_view, q.driving_view_verify_state, q.driving_view_refused_reason, i.id AS iid, i.pid, i.price, i.amount, trim(i.unit) AS unit, i.real_price, i.type, i.insure AS iinsure FROM quotations AS q INNER JOIN quotation_items i ON q.id = i.qid AND q.insure = i.insure AND q.deleted = false " + (qid ? " AND qid=$1 ORDER BY q.uid, q.vid, q.created_at DESC, q.id, i.pid, iinsure" : " ORDER BY q.uid, q.vid, q.created_at DESC, q.id, i.pid, iinsure"), qid ? [qid] : []);
  const quotations: Quotation[] = [];
  const quotation_slims: Quotation[] = [];
  let quotation: Quotation = null;
  let quotation_slim = null;
  let item: QuotationItem = null;
  const planDict: Map<string, Plan> = new Map<string, Plan>();
  const planr: Result<Plan[]> = await rpcAsync<Plan[]>(ctx.domain, process.env["PLAN"], dbresult.rows[0]["uid"], "getPlans");
  try {
    if (planr.code === 200) {
      const plans = planr.data;
      if (plans.length > 0) {
        for (const p of plans) {
          const pid = p.id;
          planDict[pid] = p;
        }
      }
    } else {
      return;
    }
    const vid_qid = {};
    if (dbresult.rowCount > 0) {
      for (const row of dbresult.rows) {
        if (quotation && quotation.id !== row.id || !quotation) {
          if (quotation) {
            if (item) {
              quotation.items.push(item);
            }
            quotations.push(quotation);
            quotation_slims.push(quotation_slim);
          }
          let vhcl = null;
          await ctx.cache.sadd(`vids:${row.uid}`, row.vid);
          const vrep: Result<Vehicle> = await rpcAsync<Vehicle>(ctx.domain, process.env["VEHICLE"], row.uid, "getVehicle", row.vid);
          if (vrep.code === 200) {
            vhcl = vrep["data"];
            if (!vid_qid[row.vid]) {
              vid_qid[`${row.vid}:${row.uid}`] = row.id;
            }
          } else {
            log.error(`sync_quotation, sn: ${ctx.sn}, uid: ${row.uid}, qid: ${row.id}, vid: ${row.vid}, msg: 获取车辆信息失败, ${vrep["msg"]}`);
            return;
          }
          const owner_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], row.uid, "getPerson", row.owner);
          let owner_person = null;
          if (owner_result["code"] === 200) {
            owner_person = owner_result["data"];
          } else {
            log.error(`sync_quotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${row.id}, vid: ${row.vid}, owner: ${row.owner}, msg: 获取车主信息失败, ${owner_result["msg"]}`);
            return;
          }
          const insured_result = await rpcAsync<Object>(ctx.domain, process.env["PERSON"], row.uid, "getPerson", row.insured);
          let insured_person = null;
          if (insured_result["code"] === 200) {
            insured_person = insured_result["data"];
          } else {
            log.error(`sync_quotation, sn: ${ctx.sn}, uid: ${ctx.uid}, qid: ${row.id}, vid: ${row.vid}, insured: ${row.insured}, msg: 获取投保人信息失败, ${insured_result["msg"]}`);
            return;
          }
          quotation = {
            id: row.id,
            uid: row.uid,
            state: row.state,
            items: [],
            vehicle: vhcl,
            owner: owner_person,
            insured: insured_person,
            recommend: row.recommend,
            outside_quotation1: row.outside_quotation1,
            outside_quotation2: row.outside_quotation2,
            screenshot1: row.screenshot1,
            screenshot2: row.screenshot2,
            price: parseFloat(row.qprice),
            real_value: parseFloat(row.real_value),
            promotion: parseFloat(row.promotion),
            insure: row.insure,
            auto: row.auto,
            created_at: row.created_at,
            updated_at: row.updated_at,
            inviter: row.inviter,
            discount: row.discount,
            driving_view: row.driving_view,
            driving_view_verify_state: row.driving_view_verify_state,
            driving_view_refused_reason: row.driving_view_refused_reason,
          };
          if (!owner_person) {
            log.info(`sync_quotation, owner: ${row.owner}`);
          }
          quotation_slim = {
            id: row.id,
            uid: row.uid,
            created_at: row.created_at, // 报价的创建时间
            owner: {
              id: owner_person["id"],
              name: owner_person["name"],
            },
            insured: {
              id: insured_person["id"],
              identity_no: insured_person["indentity_no"],
            },
            vehicle: {
              id: vhcl["id"],
              license_no: vhcl["license_no"],
              model: {
                family_name: vhcl["model"]["family_name"],
              }
            }
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
            pairs: [],
          };
        }
        const qipair: QuotationItemPair = {
          type: row.type,
          price: parseFloat(row.price),
          real_price: parseFloat(row.real_price),
          amount: parseFloat(row.amount),
          unit: row.unit,
        };
        item.pairs.push(qipair);
      }
      if (quotation) {
        if (item) {
          quotation.items.push(item);
        }
        quotations.push(quotation);
        quotation_slims.push(quotation_slim);
      }
    }
    const multi = bluebird.promisifyAll(ctx.cache.multi()) as Multi;
    for (const quotation of quotations) {
      const buf = await msgpack_encode_async(quotation);
      multi.hset("quotation-entities", quotation["id"], buf);
    }
    for (const quotation_slim of quotation_slims) {
      const buf = await msgpack_encode_async(quotation_slim);
      multi.hset("quotation-slim-entities", quotation_slim["id"], buf);
    }
    for (const key of Object.keys(vid_qid)) {
      multi.hset("vid-uid:qid", key, vid_qid[key]);
    }
    return await multi.execAsync();
  } catch (err) {
    ctx.report(1, err);
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
      await cache.delAsync("quotation-slim-entities");
      await cache.delAsync("vid-uid:qid");
      const keys_vids_buff: Buffer[] = await cache.keysAsync("vids:*");
      for (const key_buff of keys_vids_buff) {
        const key: string = key_buff.toString();
        await cache.delAsync(key);
      }
    }
    await sync_quotation(ctx, qid);
    return {
      code: 200,
      msg: "Refresh is done"
    };
  } catch (err) {
    ctx.report(3, err);
    log.error(`refresh, sn: ${ctx.sn}, uid: ${ctx.uid}, msg: error on remove old data`, err);
    return {
      code: 500,
      msg: "Error on refresh"
    };
  }
});

processor.callAsync("saveQuotation", async (ctx: ProcessorContext, acc_data: any, vid: string, qid: string, state: number, owner: string, insured: string, insurer_code: string) => {
  log.info(`saveQuotation, sn: ${ctx.sn}, uid: ${ctx.uid}, vid: ${vid}, qid: ${qid}, acc_data: ${JSON.stringify(acc_data)}, state: ${state}, owner: ${owner}, insured: ${insured}, insurer_code: ${insurer_code}`);
  const db: PGClient = ctx.db;
  const cache: RedisClient = ctx.cache;
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
  const insure_num = {
    "ASTP": 1, // 安盛天平
    "PICC": 2, // 人保
    "APIC": 3, // 永诚
    "CLPC": 4, // 国寿财
    "LIHI": 5 // 利宝
  };
  try {
    await db.query("BEGIN");
    await db.query("UPDATE quotations SET uid = $1, vid = $2, owner = $3, insured = $4, state = 3, insure = $5, auto = 2, real_value = $6, updated_at = $7 WHERE id = $8",
      [ctx.uid, vid, owner, insured, insure_num[insurer_code], acc_data["real_value"], new Date(), qid]);

    // 车损 -> A
    let quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["A"], 0]);
    if (quotation_item_db.rowCount > 0) {
      await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
        [c_list["A"]["insuredPremium"], acc_data["amount"], c_list["A"]["modifiedPremium"], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
    } else {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, pid["A"], c_list["A"]["insuredPremium"], acc_data["amount"], "元", c_list["A"]["modifiedPremium"], 0, insure_num[insurer_code], qid]);
    }
    // 商业第三方责任险 -> B
    for (let i = 0; i < levelb.length; i++) {
      quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["B"], (i + 1)]);
      if (quotation_item_db.rowCount > 0) {
        await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
          [c_list["B"]["insuredPremium"][levelb[i]], numb[i], c_list["B"]["modifiedPremium"][levelb[i]], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
      } else {
        id = uuid.v1();
        await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [id, pid["B"], c_list["B"]["insuredPremium"][levelb[i]], numb[i], "万", c_list["B"]["modifiedPremium"][levelb[i]], (i + 1), insure_num[insurer_code], qid]);
      }
    }
    // 玻璃单独破碎 -> F
    quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["F"], 0]);
    if (quotation_item_db.rowCount > 0) {
      await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
        [c_list["F"]["insuredPremium"], acc_data["amount"], c_list["F"]["modifiedPremium"], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
    } else {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, pid["F"], c_list["F"]["insuredPremium"], acc_data["amount"], "元", c_list["F"]["modifiedPremium"], 0, insure_num[insurer_code], qid]);
    }
    // 交强险+车船税 -> FORCEPREMIUM
    quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["FORCEPREMIUM"], 0]);
    if (quotation_item_db.rowCount > 0) {
      await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
        [c_list["FORCEPREMIUM"]["insuredPremium"], acc_data["amount"], c_list["FORCEPREMIUM"]["modifiedPremium"], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
    } else {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, pid["FORCEPREMIUM"], c_list["FORCEPREMIUM"]["insuredPremium"], 0, "元", c_list["FORCEPREMIUM"]["modifiedPremium"], 0, insure_num[insurer_code], qid]);
    }
    // 机动车全车盗抢 -> G1
    quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["G1"], 0]);
    if (quotation_item_db.rowCount > 0) {
      await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
        [c_list["G1"]["insuredPremium"], acc_data["amount"], c_list["G1"]["modifiedPremium"], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
    } else {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, pid["G1"], c_list["G1"]["insuredPremium"], acc_data["amount"], "元", c_list["G1"]["modifiedPremium"], 0, insure_num[insurer_code], qid]);
    }
    // 机动车发动机涉水损失 -> X1
    quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["X1"], 0]);
    if (quotation_item_db.rowCount > 0) {
      await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
        [c_list["X1"]["insuredPremium"], acc_data["amount"], c_list["X1"]["modifiedPremium"], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
    } else {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, pid["X1"], c_list["X1"]["insuredPremium"], acc_data["amount"], "元", c_list["X1"]["modifiedPremium"], 0, insure_num[insurer_code], qid]);
    }
    // 机动车自燃损失 -> Z
    quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["Z"], 0]);
    if (quotation_item_db.rowCount > 0) {
      await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
        [c_list["Z"]["insuredPremium"], acc_data["amount"], c_list["Z"]["modifiedPremium"], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
    } else {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, pid["Z"], c_list["Z"]["insuredPremium"], acc_data["amount"], "元", c_list["Z"]["modifiedPremium"], 0, insure_num[insurer_code], qid]);
    }
    // 无法找到第三方特约责任 -> Z3
    quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["Z3"], 0]);
    if (quotation_item_db.rowCount > 0) {
      await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
        [c_list["Z3"]["insuredPremium"], acc_data["amount"], c_list["Z3"]["modifiedPremium"], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
    } else {
      id = uuid.v1();
      await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, pid["Z3"], c_list["Z3"]["insuredPremium"], acc_data["amount"], "元", c_list["Z3"]["modifiedPremium"], 0, insure_num[insurer_code], qid]);
    }
    // 机动车车身划痕损失 -> Scratch
    for (let i = 0; i < levels.length; i++) {
      quotation_item_db = await db.query("SELECT id FROM quotation_items WHERE qid = $1 AND pid = $2 AND type = $3", [qid, pid["Scratch"], (i + 1)]);
      if (quotation_item_db.rowCount > 0) {
        await db.query("UPDATE quotation_items SET price = $1, amount = $2, real_price = $3, insure = $4, updated_at = $5 WHERE id = $6",
          [c_list["Scratch"]["insuredPremium"][levels[i]], nums[i], c_list["Scratch"]["modifiedPremium"][levels[i]], insure_num[insurer_code], new Date(), quotation_item_db.rows[0].id]);
      } else {
        id = uuid.v1();
        await db.query("INSERT INTO quotation_items (id, pid, price, amount, unit, real_price, type, insure, qid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [id, pid["Scratch"], c_list["Scratch"]["insuredPremium"][levels[i]], nums[i], "块漆", c_list["Scratch"]["modifiedPremium"][levels[i]], (i + 1), insure_num[insurer_code], qid]);
      }
    }
    await db.query("COMMIT");
    await sync_quotation(ctx, qid);
    const rep_acc_buff: Buffer = await cache.hgetAsync("quotation-entities", qid);
    const rep_acc_data = await msgpack_decode_async(rep_acc_buff);
    // // 通滚vid获取车辆信息
    // //　通过vehicle code　获取车辆信号信息
    // 推送不要
    // if (result.rowCount === 0) {
    // rpcAsync<Object>(ctx.domain, process.env["VEHICLE"], null, "getVehicle", vid);
    //   const row = result.rows[0];
    //   await push_quotation_to_wechat(row.openid, row.name, row.model, row.license, qid, row.vid);
    // }
    return { code: 200, data: rep_acc_data };
  } catch (err) {
    ctx.report(3, err);
    log.error(`saveQuotation, acc_data: ${JSON.stringify(acc_data)}, vid: ${vid}, qid: ${qid}, state: ${state}, owner: ${owner}, insured: ${insured}, insurer_code: ${insurer_code}`, err);
    try {
      await db.query("ROLLBACK");
      return {
        code: 500,
        msg: "保存报价失败(QSQP500)",
      };
    } catch (e) {
      ctx.report(1, err);
      log.error(`saveQuotation, acc_data: ${JSON.stringify(acc_data)}, vid: ${vid}, qid: ${qid}, state: ${state}, owner: ${owner}, insured: ${insured}, insurer_code: ${insurer_code}, msg: 数据库回滚失败`, e);
      return { code: 500, msg: err.message };
    }
  }
});

processor.callAsync("cancelQuotations", async (ctx: ProcessorContext, qids: string[]) => {
  const list = qids.map(x => `'${x}'`).join(",");
  const result = await ctx.db.query(`UPDATE quotations SET deleted = true WHERE id IN (${list})`, []);
  for (const qid of qids) {
    await sync_quotation(ctx, qid);
  }
  return { code: 200, data: "Okay" };
});

processor.callAsync("updateDrivingView", async (ctx: ProcessorContext, qid: string, driving_view: string) => {
  const result = await ctx.db.query(`UPDATE quotations SET driving_view = $1, driving_view_verify_state = $2 WHERE id = $3`, [driving_view, 2, qid]);
  if (result.rowCount > 0) {
    await sync_quotation(ctx, qid);
  }
  return { code: 200, data: "Okay" };
});

log.info("Start quotation processor");
