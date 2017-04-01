
import { Server, ServerContext, ServerFunction, CmdPacket, Permission, msgpack_decode_async, msgpack_encode_async, rpcAsync, waitingAsync } from "hive-service";
import * as bluebird from "bluebird";
import * as msgpack from "msgpack-lite";
import * as bunyan from "bunyan";
import { createClient, RedisClient} from "redis";
import { Socket, socket } from "nanomsg";

declare module "redis" {
  export interface RedisClient extends NodeJS.EventEmitter {
    hgetAsync(key: string, field: string): Promise<any>;
    hgetallAsync(key: string): Promise<any>;
  }
  export interface Multi extends NodeJS.EventEmitter {
    execAsync(): Promise<any>;
  }
}

const log = bunyan.createLogger({
  name: "quotation-trigger",
  streams: [
    {
      level: "info",
      path: "/var/log/quotation-trigger-info.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1d",   // daily rotation
      count: 7        // keep 7 back copies
    },
    {
      level: "error",
      path: "/var/log/quotation-trigger-error.log",  // log ERROR and above to a file
      type: "rotating-file",
      period: "1w",   // daily rotation
      count: 3        // keep 7 back copies
    }
  ]
});

export function run () {

  const cache: RedisClient = bluebird.promisifyAll(createClient(process.env["CACHE_PORT"], process.env["CACHE_HOST"])) as RedisClient;

  const quotation_socket: Socket = socket("sub");
  quotation_socket.connect(process.env["PERSON-TRIGGER"]);
  quotation_socket.on("data", function (buf) {
    const obj = msgpack.decode(buf);
    const pid = obj["pid"];
    const person = obj["person"];
    log.info(`Got person ${pid} from trigger`);
    (async () => {
      try {
        const quotation_buffs: Buffer[] = await cache.hgetallAsync("quotation-entities");
        const multi = cache.multi();
        for (const quotation_buff of quotation_buffs) {
          const quotation = await msgpack_decode_async(quotation_buff);
          const qid = quotation["id"];
          if (quotation["insured"]["id"] === pid) {
            quotation["insured"] = person;
          }
          if (quotation["owner"]["id"] === pid) {
            quotation["owner"] = person;
          }
          const quotation_set_buff: Buffer = await msgpack_encode_async(quotation);
          multi.hset("quotation -entities", qid, quotation_set_buff);
        }
        await multi.execAsync();
        log.info(`update person ${pid} of quotation done`);
      } catch (err) {
        log.error(`update person ${pid} of quotation`, err);
      }
    })();
    log.info(`quotation-trigger is running on ${process.env["QUOTATION-TRIGGER"]}`);
  });
}
