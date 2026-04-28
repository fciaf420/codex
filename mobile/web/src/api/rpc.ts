import type {
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
} from "@codex/mobile-shared";
import { isNotification, isRequest, isResponse } from "@codex/mobile-shared";

import { effectiveBaseUrl, loadAuth } from "../auth/token";

type NotifyHandler = (notif: JSONRPCNotification) => void;
type RequestHandler = (req: JSONRPCRequest) => Promise<unknown>;
type StateHandler = (state: ConnectionState) => void;

export type ConnectionState = "idle" | "connecting" | "open" | "closed";

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  method: string;
}

export class RpcClient {
  private ws: WebSocket | undefined;
  private state: ConnectionState = "idle";
  private nextId = 1;
  private pending = new Map<string | number, Pending>();
  private notifyHandlers = new Set<NotifyHandler>();
  private requestHandlers = new Map<string, RequestHandler>();
  private stateHandlers = new Set<StateHandler>();
  private retry = 0;
  private stopped = false;
  private reconnectTimer: number | undefined;

  start(): void {
    this.stopped = false;
    this.dial();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.ws?.close();
    this.setState("closed");
  }

  onNotification(h: NotifyHandler): () => void {
    this.notifyHandlers.add(h);
    return () => this.notifyHandlers.delete(h);
  }

  // Register a handler for a server-initiated request method. The handler's
  // resolved value is sent back as the JSON-RPC response. Throws are wrapped
  // into JSON-RPC errors with code -32000.
  onRequest(method: string, h: RequestHandler): () => void {
    this.requestHandlers.set(method, h);
    return () => {
      if (this.requestHandlers.get(method) === h) this.requestHandlers.delete(method);
    };
  }

  onState(h: StateHandler): () => void {
    this.stateHandlers.add(h);
    h(this.state);
    return () => this.stateHandlers.delete(h);
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.state !== "open") {
        reject(new Error(`rpc not connected (state=${this.state})`));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: resolve as (r: unknown) => void,
        reject,
        method,
      });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  notify(method: string, params?: unknown): void {
    if (!this.ws || this.state !== "open") return;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  private dial(): void {
    if (this.stopped) return;
    const auth = loadAuth();
    if (!auth?.token) {
      this.setState("closed");
      return;
    }
    this.setState("connecting");
    const baseUrl = effectiveBaseUrl(auth);
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/rpc";
    const ws = new WebSocket(wsUrl, [`bearer.${auth.token}`]);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setState("open");
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onclose = () => this.onClose();
    ws.onerror = () => {
      // close handler will fire next.
    };
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let msg: JSONRPCMessage;
    try {
      msg = JSON.parse(data) as JSONRPCMessage;
    } catch {
      return;
    }
    if (isResponse(msg)) {
      this.handleResponse(msg);
    } else if (isRequest(msg)) {
      void this.handleRequest(msg);
    } else if (isNotification(msg)) {
      for (const h of this.notifyHandlers) h(msg);
    }
  }

  private handleResponse(res: JSONRPCResponse): void {
    if (res.id === undefined) return;
    const pending = this.pending.get(res.id as number | string);
    if (!pending) return;
    this.pending.delete(res.id as number | string);
    if ("error" in res) {
      pending.reject(new Error(`${pending.method}: ${res.error.message}`));
    } else {
      pending.resolve(res.result);
    }
  }

  private async handleRequest(req: JSONRPCRequest): Promise<void> {
    const handler = this.requestHandlers.get(req.method);
    if (!handler) {
      this.send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `no handler for ${req.method}` },
      });
      return;
    }
    try {
      const result = await handler(req);
      this.send({ jsonrpc: "2.0", id: req.id, result });
    } catch (err) {
      this.send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: (err as Error).message ?? "handler error" },
      });
    }
  }

  private send(frame: unknown): void {
    if (!this.ws || this.state !== "open") return;
    this.ws.send(JSON.stringify(frame));
  }

  private onClose(): void {
    this.ws = undefined;
    for (const p of this.pending.values()) p.reject(new Error("ws closed"));
    this.pending.clear();
    if (this.stopped) return;
    this.setState("connecting");
    const delay = Math.min(30_000, 500 * 2 ** this.retry) + Math.floor(Math.random() * 250);
    this.retry++;
    this.reconnectTimer = window.setTimeout(() => this.dial(), delay);
  }

  private setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    for (const h of this.stateHandlers) h(s);
  }
}

export const rpc = new RpcClient();
