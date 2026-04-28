// Minimal JSON-RPC 2.0 envelope types shared between the bridge and the PWA.
// Mirrors codex-rs/app-server-protocol/src/jsonrpc_lite.rs.

export type JSONRPCId = string | number;

export interface JSONRPCRequest<P = unknown> {
  jsonrpc: "2.0";
  id: JSONRPCId;
  method: string;
  params?: P;
}

export interface JSONRPCNotification<P = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: P;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JSONRPCSuccess<R = unknown> {
  jsonrpc: "2.0";
  id: JSONRPCId;
  result: R;
}

export interface JSONRPCFailure {
  jsonrpc: "2.0";
  id: JSONRPCId;
  error: JSONRPCError;
}

export type JSONRPCResponse<R = unknown> = JSONRPCSuccess<R> | JSONRPCFailure;

export type JSONRPCMessage =
  | JSONRPCRequest
  | JSONRPCNotification
  | JSONRPCResponse;

export function isResponse(m: JSONRPCMessage): m is JSONRPCResponse {
  return "id" in m && (("result" in m) || ("error" in m));
}

export function isRequest(m: JSONRPCMessage): m is JSONRPCRequest {
  return "id" in m && "method" in m;
}

export function isNotification(m: JSONRPCMessage): m is JSONRPCNotification {
  return !("id" in m) && "method" in m;
}
