import { Service, Server, Processor, Config } from "hive-service";
import { server } from "./quotation-server";
import { processor } from "./quotation-processor";

const config: Config = {
  serveraddr: process.env["QUOTATION"],
  queueaddr: "ipc:///tmp/quotation.ipc",
  cachehost: process.env["CACHE_HOST"],
  dbhost: process.env["DB_HOST"],
  dbuser: process.env["DB_USER"],
  dbport: process.env["DB_PORT"],
  database: process.env["DB_NAME"],
  dbpasswd: process.env["DB_PASSWORD"],
};

const svc: Service = new Service(config);

svc.registerServer(server);
svc.registerProcessor(processor);

svc.run();
