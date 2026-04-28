import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname } from "node:path";

import selfsigned from "selfsigned";

import type { Config } from "./config.js";
import type { Logger } from "./logger.js";

export interface TlsMaterial {
  cert: string;
  key: string;
  fingerprintSha256Hex: string;
  fingerprintBase64Url: string;
  lanIp: string;
}

export async function loadOrCreateTls(config: Config, log: Logger): Promise<TlsMaterial> {
  await mkdir(dirname(config.certPath), { recursive: true });
  const lanIp = pickLanIp() ?? "127.0.0.1";

  let cert: string;
  let key: string;
  if (existsSync(config.certPath) && existsSync(config.keyPath)) {
    cert = await readFile(config.certPath, "utf8");
    key = await readFile(config.keyPath, "utf8");
    log.info({ certPath: config.certPath }, "loaded existing self-signed cert");
  } else {
    log.info("generating self-signed cert (first run)");
    const attrs = [{ name: "commonName", value: lanIp }];
    const extensions = [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" }, // DNS
          { type: 7, ip: lanIp }, // IP
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ];
    const pem = selfsigned.generate(attrs, {
      keySize: 2048,
      days: 825,
      algorithm: "sha256",
      extensions,
      serialNumber: randomBytes(16).toString("hex"),
    });
    cert = pem.cert;
    key = pem.private;
    await writeFile(config.certPath, cert, { mode: 0o600 });
    await writeFile(config.keyPath, key, { mode: 0o600 });
    await chmod(config.certPath, 0o600);
    await chmod(config.keyPath, 0o600);
  }

  const fingerprintSha256Hex = certFingerprintHex(cert);
  return {
    cert,
    key,
    fingerprintSha256Hex,
    fingerprintBase64Url: hexToBase64Url(fingerprintSha256Hex),
    lanIp,
  };
}

function certFingerprintHex(certPem: string): string {
  const der = pemToDer(certPem);
  const hash = createHash("sha256").update(der).digest("hex");
  return hash
    .match(/.{1,2}/g)!
    .join(":")
    .toLowerCase();
}

function pemToDer(pem: string): Buffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

function hexToBase64Url(hex: string): string {
  const clean = hex.replace(/:/g, "");
  return Buffer.from(clean, "hex")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pickLanIp(): string | undefined {
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const i of list) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return undefined;
}
