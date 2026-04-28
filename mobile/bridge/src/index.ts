import { mkdir } from "node:fs/promises";

import qrcode from "qrcode";

import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { tokenStoreFromConfig } from "./auth.js";
import { PairingStore } from "./pairing.js";
import { CodexChild } from "./child.js";
import { buildServer } from "./server.js";
import { loadOrCreateTls } from "./tls.js";
import { RelayClient } from "./relay.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // Subcommands handled before booting the server.
  if (argv[0] === "revoke") {
    const id = argv[1];
    if (!id) {
      console.error("usage: codex-mobile-bridge revoke <deviceId>");
      process.exit(2);
    }
    const config = loadConfig([]);
    const tokens = tokenStoreFromConfig(config);
    const ok = await tokens.revoke(id);
    console.log(ok ? `revoked ${id}` : `no such device ${id}`);
    process.exit(ok ? 0 : 1);
  }
  if (argv[0] === "list-devices") {
    const config = loadConfig([]);
    const tokens = tokenStoreFromConfig(config);
    const list = await tokens.list();
    for (const d of list) {
      console.log(
        `${d.id}  ${d.revokedAt ? "(revoked)" : "active   "}  ${d.createdAt}  ${d.name}`,
      );
    }
    process.exit(0);
  }

  await runServer(argv);
}

async function runServer(argv: string[]): Promise<void> {
  const config = loadConfig(argv);
  await mkdir(config.bridgeHome, { recursive: true });
  const log = createLogger(config);

  const tls = await loadOrCreateTls(config, log);
  const tokens = tokenStoreFromConfig(config);
  const pairings = new PairingStore(config.pairCodeTtlMs);
  pairings.start();

  const child = new CodexChild(config, log);
  child.start();

  const app = await buildServer({ config, log, tokens, pairings, child, tls });
  await app.listen({ host: config.host, port: config.port });

  // Issue an initial pair code so the user can pair on first boot without
  // needing to make a separate POST. Loopback-only API call to ourselves
  // would be cleaner, but we already own the PairingStore here.
  const initialCode = pairings.issue();
  const baseUrl = `https://${tls.lanIp}:${config.port}`;
  const pairUrl = `${baseUrl}/pair#c=${initialCode.code}&fp=${tls.fingerprintBase64Url}`;

  printBanner({ baseUrl, pairUrl, fingerprint: tls.fingerprintSha256Hex });
  const qr = await qrcode.toString(pairUrl, { type: "terminal", small: true });
  process.stdout.write(qr + "\n");

  // Optional outbound relay
  let relay: RelayClient | undefined;
  if (config.relayUrl) {
    relay = new RelayClient({
      url: config.relayUrl,
      bridgeId: tls.fingerprintBase64Url,
      tls,
      log,
    });
    relay.start();
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");
    relay?.stop();
    pairings.stop();
    app.rpcRouter.closeAll("shutdown");
    try {
      await app.close();
    } catch (err) {
      log.warn({ err }, "fastify close errored");
    }
    await child.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

function printBanner(args: { baseUrl: string; pairUrl: string; fingerprint: string }): void {
  const lines = [
    "",
    `codex-mobile-bridge listening on ${args.baseUrl}`,
    `cert SHA-256: ${args.fingerprint}`,
    "",
    "Pair URL (also encoded in the QR below):",
    `  ${args.pairUrl}`,
    "",
    "Pair code expires in 10 minutes. POST /api/pair to mint another.",
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
