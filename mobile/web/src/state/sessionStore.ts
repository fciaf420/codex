import { create } from "zustand";

import type {
  CommandExecutionRequestApprovalParams,
  FileChangeRequestApprovalParams,
} from "@codex/mobile-shared";

export type Bubble =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; itemId: string; text: string; inProgress: boolean }
  | { kind: "command"; id: string; itemId: string; cmd: string; cwd?: string; output: string; running: boolean; exitCode?: number }
  | { kind: "fileChange"; id: string; itemId: string; summary: string }
  | { kind: "system"; id: string; text: string }
  | { kind: "error"; id: string; text: string };

export type Approval =
  | { kind: "exec"; phoneRequestId: string | number; params: CommandExecutionRequestApprovalParams }
  | { kind: "patch"; phoneRequestId: string | number; params: FileChangeRequestApprovalParams };

interface SessionState {
  threadId: string | undefined;
  turnId: string | undefined;
  bubbles: Bubble[];
  pendingApprovals: Approval[];
  composerLocked: boolean;
  setThread: (id: string | undefined) => void;
  reset: () => void;
  pushUser: (text: string) => void;
  pushSystem: (text: string) => void;
  pushError: (text: string) => void;
  enqueueApproval: (a: Approval) => void;
  resolveApproval: (phoneRequestId: string | number) => void;
  setComposerLocked: (v: boolean) => void;
  // notification handlers
  onItemStarted: (item: ThreadItemAny) => void;
  onItemCompleted: (item: ThreadItemAny) => void;
  onAgentMessageDelta: (itemId: string, delta: string) => void;
  onCommandExecOutputDelta: (itemId: string, chunkBase64: string) => void;
}

type ThreadItemAny = Record<string, unknown> & { id?: string; itemType?: string };

export const useSession = create<SessionState>((set, get) => ({
  threadId: undefined,
  turnId: undefined,
  bubbles: [],
  pendingApprovals: [],
  composerLocked: false,

  setThread: (id) => set({ threadId: id }),
  reset: () =>
    set({
      threadId: undefined,
      turnId: undefined,
      bubbles: [],
      pendingApprovals: [],
      composerLocked: false,
    }),

  pushUser: (text) =>
    set((s) => ({
      bubbles: [...s.bubbles, { kind: "user", id: makeId(), text }],
      composerLocked: true,
    })),

  pushSystem: (text) =>
    set((s) => ({ bubbles: [...s.bubbles, { kind: "system", id: makeId(), text }] })),

  pushError: (text) =>
    set((s) => ({
      bubbles: [...s.bubbles, { kind: "error", id: makeId(), text }],
      composerLocked: false,
    })),

  enqueueApproval: (a) => set((s) => ({ pendingApprovals: [...s.pendingApprovals, a] })),

  resolveApproval: (phoneRequestId) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((a) => a.phoneRequestId !== phoneRequestId),
    })),

  setComposerLocked: (v) => set({ composerLocked: v }),

  onItemStarted: (item) => {
    const id = String(item["id"] ?? makeId());
    const type = String(item["itemType"] ?? "").toLowerCase();
    if (type === "agentmessage" || type === "agent_message") {
      // assistant bubble will accumulate via AgentMessageDelta
      set((s) => ({
        bubbles: [
          ...s.bubbles,
          { kind: "assistant", id: makeId(), itemId: id, text: "", inProgress: true },
        ],
      }));
    } else if (type === "commandexecution" || type === "command_execution") {
      const cmd = stringify(item["command"]);
      const cwd = typeof item["cwd"] === "string" ? (item["cwd"] as string) : undefined;
      set((s) => ({
        bubbles: [
          ...s.bubbles,
          { kind: "command", id: makeId(), itemId: id, cmd, cwd, output: "", running: true },
        ],
      }));
    } else if (type === "filechange" || type === "file_change") {
      set((s) => ({
        bubbles: [
          ...s.bubbles,
          { kind: "fileChange", id: makeId(), itemId: id, summary: stringify(item["paths"]) },
        ],
      }));
    }
  },

  onItemCompleted: (item) => {
    const id = String(item["id"] ?? "");
    set((s) => ({
      bubbles: s.bubbles.map((b) => {
        if (b.kind === "assistant" && b.itemId === id) return { ...b, inProgress: false };
        if (b.kind === "command" && b.itemId === id) {
          const exit = item["exitCode"];
          return {
            ...b,
            running: false,
            exitCode: typeof exit === "number" ? exit : b.exitCode,
          };
        }
        return b;
      }),
    }));
  },

  onAgentMessageDelta: (itemId, delta) => {
    set((s) => {
      // find or create the assistant bubble for this itemId.
      const idx = s.bubbles.findIndex((b) => b.kind === "assistant" && b.itemId === itemId);
      if (idx === -1) {
        return {
          bubbles: [
            ...s.bubbles,
            { kind: "assistant", id: makeId(), itemId, text: delta, inProgress: true },
          ],
        };
      }
      const next = s.bubbles.slice();
      const cur = next[idx];
      if (cur && cur.kind === "assistant") {
        next[idx] = { ...cur, text: cur.text + delta };
      }
      return { bubbles: next };
    });
  },

  onCommandExecOutputDelta: (itemId, chunkBase64) => {
    let chunk = "";
    try {
      chunk = atob(chunkBase64);
    } catch {
      chunk = chunkBase64;
    }
    set((s) => ({
      bubbles: s.bubbles.map((b) =>
        b.kind === "command" && b.itemId === itemId ? { ...b, output: b.output + chunk } : b,
      ),
    }));
  },
}));

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(stringify).join(" ");
  return JSON.stringify(v);
}
