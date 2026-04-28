// Outbound relay dialer (v2 stub).
//
// When MOBILE_BRIDGE_RELAY=wss://relay.example.com is set, the bridge dials
// the relay and registers itself. The relay is expected to forward incoming
// phone WebSocket frames as `{ type: "frame", phoneId, payload }` and accept
// our outgoing `{ type: "frame", phoneId, payload }` frames in return.
//
// v1 ships ONLY the dialer skeleton with reconnect; the relay server itself
// and the phoneId<->RpcRouter integration are TODO(v2).

import WebSocket from "ws";

import type { Logger } from "./logger.js";
import type { TlsMaterial } from "./tls.js";

export interface RelayOptions {
  url: string;
  bridgeId: string;
  tls: TlsMaterial;
  log: Logger;
}

export class RelayClient {
  private ws: WebSocket | undefined;
  private stopping = false;
  private backoffMs = 500;

  constructor(private readonly opts: RelayOptions) {}

  start(): void {
    this.dial();
  }

  stop(): void {
    this.stopping = true;
    this.ws?.close();
    this.ws = undefined;
  }

  private dial(): void {
    if (this.stopping) return;
    const { url, log } = this.opts;
    log.info({ url }, "relay: dialing");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.on("open", () => {
      this.backoffMs = 500;
      log.info("relay: connected, registering");
      ws.send(
        JSON.stringify({
          type: "register",
          bridgeId: this.opts.bridgeId,
          fingerprint: this.opts.tls.fingerprintSha256Hex,
        }),
      );
    });
    ws.on("close", () => {
      this.ws = undefined;
      if (this.stopping) return;
      const delay = Math.min(30_000, this.backoffMs);
      this.backoffMs = Math.min(30_000, this.backoffMs * 2);
      log.warn({ delay }, "relay: disconnected, reconnecting");
      setTimeout(() => this.dial(), delay).unref?.();
    });
    ws.on("error", (err) => log.warn({ err: err.message }, "relay: error"));
    // TODO(v2): on 'message' route phone frames into RpcRouter via a
    // synthetic phone connection keyed by params.phoneId.
  }
}
