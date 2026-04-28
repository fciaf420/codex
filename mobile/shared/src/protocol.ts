// Wire shapes for the codex-app-server v2 JSON-RPC surface that the bridge
// proxies to the phone. Keep narrow — these are just the methods and
// notification names the v1 PWA actually uses. For full schemas, run
// `pnpm --filter @codex/mobile-shared sync-types` and import from
// `@codex/mobile-shared/generated/...`.

// ---------------------------------------------------------------------------
// User input items (codex-rs/protocol/src/user_input.rs)
// ---------------------------------------------------------------------------

export type UserInputItem =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string };

// ---------------------------------------------------------------------------
// Approval decisions (codex-rs/app-server-protocol/src/protocol/v2.rs)
// ---------------------------------------------------------------------------

// CommandExecutionApprovalDecision (subset, ts-rs renames "camelCase").
export type CommandExecutionDecisionT =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

// FileChangeApprovalDecision
export type FileChangeDecisionT =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

// ---------------------------------------------------------------------------
// JSON-RPC method names — request methods the PWA calls on the bridge.
// ---------------------------------------------------------------------------

export const ClientMethods = {
  initialize: "initialize",
  threadList: "thread/list",
  threadResume: "thread/resume",
  threadStart: "thread/start",
  threadUnsubscribe: "thread/unsubscribe",
  // Send a turn (user input) into the active thread.
  turnStart: "turn/start",
  turnInterrupt: "turn/interrupt",
} as const;
export type ClientMethod = (typeof ClientMethods)[keyof typeof ClientMethods];

// Server-initiated requests the PWA must respond to.
export const ServerMethods = {
  commandExecutionRequestApproval: "item/commandExecution/requestApproval",
  fileChangeRequestApproval: "item/fileChange/requestApproval",
} as const;
export type ServerMethod = (typeof ServerMethods)[keyof typeof ServerMethods];

// Notification methods the server streams to the client.
export const NotifyMethods = {
  itemStarted: "item/started",
  itemCompleted: "item/completed",
  agentMessageDelta: "item/agentMessage/delta",
  commandExecOutputDelta: "item/commandExecution/outputDelta",
  fileChangeOutputDelta: "item/fileChange/outputDelta",
  fileChangePatchUpdated: "item/fileChange/patchUpdated",
  turnPlanUpdated: "turn/plan/updated",
} as const;
export type NotifyMethod = (typeof NotifyMethods)[keyof typeof NotifyMethods];

// ---------------------------------------------------------------------------
// Minimal payload shapes. Open-ended on purpose — the PWA only reads a few
// fields and we don't want to drift from the source of truth in v2.rs.
// ---------------------------------------------------------------------------

export interface ItemNotificationParams {
  threadId: string;
  turnId: string;
  item: ThreadItemLite;
}

export interface AgentMessageDeltaParams {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
}

export interface CommandExecOutputDeltaParams {
  threadId: string;
  turnId: string;
  itemId: string;
  // base64-encoded chunk per v2.rs
  chunk: string;
  stream?: "stdout" | "stderr";
}

export interface CommandExecutionRequestApprovalParams {
  threadId: string;
  turnId: string;
  itemId: string;
  approvalId?: string | null;
  command?: string | string[];
  cwd?: string;
  reason?: string | null;
}

export interface FileChangeRequestApprovalParams {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  grantRoot?: string | null;
}

export interface ThreadItemLite {
  id?: string;
  itemType?: string;
  // free-form by design; renderer keys off `itemType` and a few common fields.
  [k: string]: unknown;
}

export interface TurnStartParams {
  threadId: string;
  input: UserInputItem[];
}
