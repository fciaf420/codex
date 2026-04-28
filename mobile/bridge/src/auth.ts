import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

import type { Config } from "./config.js";

export interface DeviceRecord {
  id: string;
  name: string;
  tokenSha256: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface DevicesFile {
  version: 1;
  devices: DeviceRecord[];
}

export class TokenStore {
  private cache: DevicesFile | undefined;

  constructor(private readonly path: string) {}

  async load(): Promise<DevicesFile> {
    if (this.cache) return this.cache;
    if (!existsSync(this.path)) {
      this.cache = { version: 1, devices: [] };
      return this.cache;
    }
    const raw = await readFile(this.path, "utf8");
    this.cache = JSON.parse(raw) as DevicesFile;
    return this.cache;
  }

  private async save(): Promise<void> {
    if (!this.cache) return;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.cache, null, 2), { mode: 0o600 });
    await chmod(this.path, 0o600);
  }

  async issue(name: string): Promise<{ device: DeviceRecord; token: string }> {
    const file = await this.load();
    const tokenBytes = randomBytes(32);
    const token = base64url(tokenBytes);
    const tokenSha256 = sha256Hex(tokenBytes);
    const device: DeviceRecord = {
      id: base64url(randomBytes(8)),
      name,
      tokenSha256,
      createdAt: new Date().toISOString(),
    };
    file.devices.push(device);
    await this.save();
    return { device, token };
  }

  async findActiveByToken(token: string): Promise<DeviceRecord | undefined> {
    const file = await this.load();
    const presented = sha256Buf(Buffer.from(token, "utf8"));
    for (const d of file.devices) {
      if (d.revokedAt) continue;
      const stored = Buffer.from(d.tokenSha256, "hex");
      if (stored.length === presented.length && timingSafeEqual(stored, presented)) {
        d.lastUsedAt = new Date().toISOString();
        await this.save();
        return d;
      }
    }
    return undefined;
  }

  async revoke(id: string): Promise<boolean> {
    const file = await this.load();
    const d = file.devices.find((x) => x.id === id);
    if (!d || d.revokedAt) return false;
    d.revokedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  async list(): Promise<DeviceRecord[]> {
    const file = await this.load();
    return file.devices.slice();
  }
}

export function tokenStoreFromConfig(c: Config): TokenStore {
  return new TokenStore(c.devicesPath);
}

function sha256Buf(b: Buffer): Buffer {
  return createHash("sha256").update(b).digest();
}

function sha256Hex(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

function base64url(b: Buffer): string {
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Bearer extraction from `Authorization: Bearer <token>` or the
// `bearer.<token>` WS subprotocol.
export function extractBearerFromHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : undefined;
}

export function extractBearerFromSubprotocols(value: string | undefined): string | undefined {
  if (!value) return undefined;
  for (const part of value.split(",").map((s) => s.trim())) {
    if (part.startsWith("bearer.")) return part.slice("bearer.".length);
  }
  return undefined;
}
