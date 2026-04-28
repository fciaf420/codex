import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  port: number;
  host: string;
  tls: boolean;
  codexBin: string;
  codexHome: string;
  bridgeHome: string;
  certPath: string;
  keyPath: string;
  devicesPath: string;
  uploadsDir: string;
  staticDir: string;
  pairCodeTtlMs: number;
  uploadMaxBytes: number;
  relayUrl: string | undefined;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadConfig(argv: string[] = process.argv.slice(2)): Config {
  const args = parseArgs(argv);
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const bridgeHome = join(codexHome, "mobile-bridge");
  const port = Number(args.port ?? process.env.MOBILE_BRIDGE_PORT ?? 8787);
  return {
    port,
    host: args.host ?? process.env.MOBILE_BRIDGE_HOST ?? "0.0.0.0",
    tls: args["no-tls"] !== true,
    codexBin: args["codex-bin"] ?? process.env.CODEX_BIN ?? "codex",
    codexHome,
    bridgeHome,
    certPath: join(bridgeHome, "cert.pem"),
    keyPath: join(bridgeHome, "key.pem"),
    devicesPath: join(bridgeHome, "devices.json"),
    uploadsDir: join(bridgeHome, "uploads"),
    staticDir: args["static-dir"] ?? process.env.MOBILE_BRIDGE_STATIC ?? defaultStaticDir(),
    pairCodeTtlMs: 10 * 60 * 1000,
    uploadMaxBytes: 25 * 1024 * 1024,
    relayUrl: process.env.MOBILE_BRIDGE_RELAY,
    logLevel: (process.env.MOBILE_BRIDGE_LOG_LEVEL as Config["logLevel"]) ?? "info",
  };
}

function defaultStaticDir(): string {
  // mobile/bridge/dist/index.js -> mobile/web/dist
  // Fallback: mobile/bridge/src/index.ts (during `tsx watch`) -> mobile/web/dist
  return new URL("../../web/dist", import.meta.url).pathname;
}

function parseArgs(argv: string[]): Record<string, string | true | undefined> {
  const out: Record<string, string | true | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else {
        out[a.slice(2)] = true;
      }
    }
  }
  return out;
}
