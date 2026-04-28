import { pino } from "pino";

import type { Config } from "./config.js";

export function createLogger(config: Pick<Config, "logLevel">) {
  return pino({
    level: config.logLevel,
    transport: process.stdout.isTTY
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        }
      : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
