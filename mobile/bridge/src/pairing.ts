import { randomBytes } from "node:crypto";

export interface PairCode {
  code: string;
  expiresAt: number;
  consumed: boolean;
}

export class PairingStore {
  private map = new Map<string, PairCode>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly ttlMs: number) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.gc(), 30_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  issue(): PairCode {
    const code = base32(randomBytes(10));
    const entry: PairCode = {
      code,
      expiresAt: Date.now() + this.ttlMs,
      consumed: false,
    };
    this.map.set(code, entry);
    return entry;
  }

  // One-shot consume; returns true if the code was previously valid and is now spent.
  consume(code: string): boolean {
    const entry = this.map.get(code);
    if (!entry) return false;
    if (entry.consumed) return false;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(code);
      return false;
    }
    entry.consumed = true;
    // delete shortly after so we don't keep spent codes around forever
    setTimeout(() => this.map.delete(code), 5_000).unref?.();
    return true;
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, v] of this.map) {
      if (v.expiresAt < now) this.map.delete(k);
    }
  }
}

// Crockford-style base32 (uppercase, no padding) — matches what users would expect to type.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}
