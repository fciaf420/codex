import { randomUUID } from "node:crypto";

import type { WebSocket } from "ws";

import type { CodexChild, RpcFrame } from "./child.js";
import type { Logger } from "./logger.js";

interface PhoneConnection {
  id: string;
  ws: WebSocket;
  threadIds: Set<string>;
}

const REQ_SEPARATOR = ":";
const PHONE_REQ_PREFIX = "p"; // phone-originated requests forwarded to child
const SERVER_REQ_PREFIX = "s"; // server-originated requests forwarded to a phone

// Routes JSON-RPC frames between many phone WebSockets and a single child
// codex app-server stdio. The codex-app-server v2 protocol uses both
// directions: clients call methods (turn/start, thread/list, ...) and the
// server calls methods on the client (item/commandExecution/requestApproval,
// item/fileChange/requestApproval, ...).
//
// Strategy:
//
// phone -> child REQUEST:
//     phone sends `{ id: <X>, method, params }`
//     bridge forwards `{ id: "p:<connectionId>:<X>", method, params }`
//
// child -> phone RESPONSE (to a phone request):
//     child returns `{ id: "p:<connectionId>:<X>", result|error }`
//     bridge splits the id, forwards `{ id: <X>, result|error }` to that phone
//
// child -> phone REQUEST (server-initiated, e.g. an approval):
//     child sends `{ id: <C>, method, params: { threadId, ... } }`
//     bridge allocates a fresh `phoneId = "s:<uuid>"`, remembers
//     (phoneId -> { connId, childId }), and forwards
//     `{ id: phoneId, method, params }` to the phone owning `threadId`.
//
// phone -> child RESPONSE (to a server request):
//     phone returns `{ id: phoneId, result|error }`
//     bridge looks up `phoneId`, forwards `{ id: childId, result|error }`
//     to the child.
//
// Notifications (no id) are forwarded by `params.threadId` if present, else
// broadcast to all phones for v1.
export class RpcRouter {
  private connections = new Map<string, PhoneConnection>();
  private threadOwner = new Map<string, string>(); // threadId -> connectionId
  // server-initiated requests waiting for a phone response.
  private inflightServerRequests = new Map<string, { connId: string; childId: string | number }>();

  constructor(private readonly child: CodexChild, private readonly log: Logger) {
    child.on("frame", (f: RpcFrame) => this.onChildFrame(f));
    child.on("exit", () => this.onChildExit());
  }

  attach(ws: WebSocket): string {
    const conn: PhoneConnection = { id: randomUUID(), ws, threadIds: new Set() };
    this.connections.set(conn.id, conn);
    this.log.info({ connId: conn.id, total: this.connections.size }, "phone connected");

    ws.on("message", (data) => this.onPhoneMessage(conn, data.toString("utf8")));
    ws.on("close", () => this.detach(conn.id));
    ws.on("error", (err) => this.log.warn({ err, connId: conn.id }, "phone ws error"));
    return conn.id;
  }

  detach(connId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    this.connections.delete(connId);
    for (const tid of conn.threadIds) {
      if (this.threadOwner.get(tid) === connId) {
        this.threadOwner.delete(tid);
        this.child.send({
          jsonrpc: "2.0",
          id: `unsub-${randomUUID()}`,
          method: "thread/unsubscribe",
          params: { threadId: tid },
        });
      }
    }
    // Fail any pending server-requests routed to this phone.
    for (const [phoneId, entry] of this.inflightServerRequests) {
      if (entry.connId !== connId) continue;
      this.inflightServerRequests.delete(phoneId);
      this.child.send({
        jsonrpc: "2.0",
        id: entry.childId,
        error: { code: -32002, message: "phone disconnected before responding" },
      });
    }
    this.log.info({ connId, total: this.connections.size }, "phone disconnected");
  }

  closeAll(reason = "shutdown"): void {
    for (const conn of this.connections.values()) {
      try {
        conn.ws.close(1001, reason);
      } catch {
        /* noop */
      }
    }
    this.connections.clear();
    this.threadOwner.clear();
    this.inflightServerRequests.clear();
  }

  // -- inbound from phone ---------------------------------------------------

  private onPhoneMessage(conn: PhoneConnection, raw: string): void {
    let frame: RpcFrame;
    try {
      frame = JSON.parse(raw) as RpcFrame;
    } catch {
      this.sendErr(conn, null, -32700, "parse error");
      return;
    }
    if (frame.jsonrpc !== "2.0") {
      this.sendErr(conn, frame.id ?? null, -32600, "invalid request");
      return;
    }

    const isResponse = frame.id !== undefined && frame.method === undefined;
    const isRequest = frame.id !== undefined && frame.method !== undefined;
    const isNotification = frame.id === undefined && frame.method !== undefined;

    if (isResponse) {
      // phone responding to a server request.
      const phoneId = String(frame.id);
      const entry = this.inflightServerRequests.get(phoneId);
      if (!entry) {
        this.log.warn({ phoneId }, "unknown server-request response from phone, dropping");
        return;
      }
      this.inflightServerRequests.delete(phoneId);
      const out: RpcFrame = { jsonrpc: "2.0", id: entry.childId };
      if ("error" in frame) out.error = frame.error;
      else out.result = frame.result;
      this.child.send(out);
      return;
    }

    if (isRequest) {
      // phone-originated request: namespace the id.
      const namespaced: RpcFrame = {
        ...frame,
        id: `${PHONE_REQ_PREFIX}${REQ_SEPARATOR}${conn.id}${REQ_SEPARATOR}${String(frame.id)}`,
      };
      this.child.send(namespaced);
      return;
    }

    if (isNotification) {
      this.child.send(frame);
      return;
    }
  }

  // -- inbound from child ---------------------------------------------------

  private onChildFrame(frame: RpcFrame): void {
    // bridge-issued initialize is silently consumed.
    if (typeof frame.id === "string" && frame.id === "bridge-init") return;

    const isResponse = frame.id !== undefined && frame.method === undefined;
    const isRequest = frame.id !== undefined && frame.method !== undefined;
    const isNotification = frame.id === undefined && frame.method !== undefined;

    if (isResponse) {
      // Response to a phone-originated request.
      if (typeof frame.id === "string" && frame.id.startsWith(`${PHONE_REQ_PREFIX}${REQ_SEPARATOR}`)) {
        const parts = frame.id.split(REQ_SEPARATOR);
        // ["p", connId, ...origId]
        const connId = parts[1];
        if (!connId) return;
        const origId = parts.slice(2).join(REQ_SEPARATOR);
        const conn = this.connections.get(connId);
        if (!conn) return;
        const threadId = extractThreadId(frame.result);
        if (threadId) {
          conn.threadIds.add(threadId);
          this.threadOwner.set(threadId, connId);
        }
        const out: RpcFrame = { jsonrpc: "2.0", id: coerceId(origId) };
        if ("error" in frame) out.error = frame.error;
        else out.result = frame.result;
        this.sendJson(conn.ws, out);
        return;
      }
      // Other responses (e.g. to the bridge's own initialize) — ignore.
      return;
    }

    if (isRequest) {
      // Server-initiated request (approval, elicitation, etc.).
      const childId = frame.id!;
      const threadId = extractThreadId(frame.params);
      const target = threadId ? this.threadOwner.get(threadId) : undefined;
      const conn = target ? this.connections.get(target) : firstConn(this.connections);
      if (!conn) {
        // No phones connected. Reject so the agent doesn't hang.
        this.child.send({
          jsonrpc: "2.0",
          id: childId,
          error: { code: -32000, message: "no phone connected" },
        });
        return;
      }
      const phoneId = `${SERVER_REQ_PREFIX}${REQ_SEPARATOR}${randomUUID()}`;
      this.inflightServerRequests.set(phoneId, { connId: conn.id, childId });
      const out: RpcFrame = { ...frame, id: phoneId };
      this.sendJson(conn.ws, out);
      return;
    }

    if (isNotification) {
      const threadId = extractThreadId(frame.params);
      if (threadId) {
        const owner = this.threadOwner.get(threadId);
        if (owner) {
          const conn = this.connections.get(owner);
          if (conn) this.sendJson(conn.ws, frame);
          return;
        }
      }
      // Account-level notifications: broadcast.
      for (const conn of this.connections.values()) {
        this.sendJson(conn.ws, frame);
      }
      return;
    }
  }

  private onChildExit(): void {
    for (const conn of this.connections.values()) {
      this.sendJson(conn.ws, {
        jsonrpc: "2.0",
        method: "$bridge/childExited",
        params: { reason: "codex app-server restarted" },
      });
    }
    this.inflightServerRequests.clear();
  }

  private sendJson(ws: WebSocket, frame: RpcFrame): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(frame));
    } catch (err) {
      this.log.warn({ err }, "send to phone failed");
    }
  }

  private sendErr(conn: PhoneConnection, id: RpcFrame["id"] | null, code: number, message: string): void {
    this.sendJson(conn.ws, {
      jsonrpc: "2.0",
      id: id === null ? "null" : id,
      error: { code, message },
    } as RpcFrame);
  }
}

function coerceId(raw: string): string | number {
  const n = Number(raw);
  return Number.isFinite(n) && String(n) === raw ? n : raw;
}

function firstConn<T>(map: Map<string, T>): T | undefined {
  const it = map.values().next();
  return it.done ? undefined : it.value;
}

function extractThreadId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  const direct = obj["threadId"] ?? obj["thread_id"];
  if (typeof direct === "string") return direct;
  const nested = obj["thread"];
  if (nested && typeof nested === "object") {
    const id = (nested as Record<string, unknown>)["id"];
    if (typeof id === "string") return id;
  }
  return undefined;
}
