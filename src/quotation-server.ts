import { Server, ServerContext, ServerFunction, CmdPacket, Permission, wait_for_response, decode } from "hive-service";
import * as msgpack from "msgpack-lite";
import * as bunyan from "bunyan";
import * as uuid from "node-uuid";
import { verify, uuidVerifier, stringVerifier, numberVerifier } from "hive-verify";

const log = bunyan.createLogger({
  name: "quotation-server",
  streams: [
    {
      level: "info",
      path: "/var/log/quotation-server-info.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1d",   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: "error",
      path: "/var/log/quotation-server-error.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1w",   // daily rotation
      count: 3        // keep 7 back copies
    }
  ]
});

const allowAll: Permission[] = [["mobile", true], ["admin", true]];
const mobileOnly: Permission[] = [["mobile", true], ["admin", false]];
const adminOnly: Permission[] = [["mobile", false], ["admin", true]];

export const server = new Server();

server.call("createQuotation", allowAll, "创建报价", "创建报价", (ctx: ServerContext, rep: ((result: any) => void), vid: string, vin: string) => {
  log.info(`createQuotation, ${vid}, ${vin}`);
  if (!verify([uuidVerifier("vid", vid), stringVerifier("vin", vin)], (errors: string[]) => {
    log.info("arg not match " + errors);
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  const qid = uuid.v1();
  const state: number = 1;
  const domain = ctx.domain;
  const pkt: CmdPacket = { cmd: "createQuotation", args: [qid, vid, state, qid, domain, vin] };
  ctx.publish(pkt);
  wait_for_response(ctx.cache, qid, rep);
});

server.call("getQuotation", allowAll, "获取一个报价", "获取一个报价", (ctx: ServerContext, rep: ((result: any) => void), qid: string) => {
  log.info(`getQuotation, qid: ${qid}`);
  if (!verify([uuidVerifier("qid", qid)], (errors: string[]) => {
    rep({
      code: 400,
      msg: errors.join("\n")
    });
  })) {
    return;
  }
  ctx.cache.hget("quotation-entities", qid, (err, qpkt) => {
    if (err) {
      rep({ code: 500, msg: err.message });
    } else if (qpkt) {
      const quotation = decode(qpkt);
      rep({ code: 200, data: quotation });
    } else {
      rep({ code: 404, msg: "Quotation not found" });
    }
  });
});

server.call("refresh", adminOnly, "refresh", "refresh", (ctx: ServerContext, rep: ((result: any) => void), qid?: string) => {
  log.info(qid ? `refresh, qid: ${qid}` : "refresh");
  const cbflag = uuid.v1();
  const pkt: CmdPacket = { cmd: "refresh", args: qid ? [qid] : [] };
  ctx.publish(pkt);
  wait_for_response(ctx.cache, cbflag, rep)
});

log.info("Start quotation server");

