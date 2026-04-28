// Minimal local mirror of codex-app-server-protocol v2 types we use.
// Keep narrow — switch to imports from `@codex/mobile-shared/generated/...`
// once you've run `pnpm --filter @codex/mobile-shared sync-types`.

export interface Thread {
  id: string;
  forkedFromId: string | null;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  createdAt: number; // unix seconds
  updatedAt: number;
  status: string;
  path: string | null;
  cwd: string;
  cliVersion: string;
  source: unknown;
  agentNickname: string | null;
  agentRole: string | null;
  gitInfo: unknown | null;
  name: string | null;
  turns: Turn[];
}

export interface Turn {
  id: string;
  items: ThreadItem[];
}

export interface ThreadItem {
  id?: string;
  // Open-ended; renderer treats `kind` and rolls up by the `payload`.
  // Concrete shapes live in v2/Item.ts and friends; v1 only renders user/assistant.
  [k: string]: unknown;
}

export interface ThreadListParams {
  cursor?: string | null;
  limit?: number | null;
}

export interface ThreadListResponse {
  data: Thread[];
  nextCursor: string | null;
  backwardsCursor: string | null;
}

export interface ThreadStartParams {
  cwd?: string | null;
  approvalPolicy?: AskForApproval | null;
  sandbox?: SandboxMode | null;
  model?: string | null;
}

export interface ThreadStartResponse {
  thread: Thread;
  model: string;
  modelProvider: string;
}

export interface ThreadResumeParams {
  threadId: string;
}

export interface ThreadResumeResponse {
  thread: Thread;
  model: string;
  modelProvider: string;
}

export type AskForApproval =
  | "untrusted"
  | "on_failure"
  | "on_request"
  | "never";

export type SandboxMode =
  | "danger_full_access"
  | "read_only"
  | "workspace_write";

export const APPROVAL_POLICIES: AskForApproval[] = ["on_request", "untrusted", "on_failure", "never"];
export const SANDBOX_MODES: SandboxMode[] = ["workspace_write", "read_only", "danger_full_access"];
