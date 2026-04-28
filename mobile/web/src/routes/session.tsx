import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { rpc } from "../api/rpc";
import type { Thread, ThreadResumeResponse } from "../api/types";
import type {
  AgentMessageDeltaParams,
  CommandExecOutputDeltaParams,
  CommandExecutionRequestApprovalParams,
  FileChangeRequestApprovalParams,
  ItemNotificationParams,
  UserInputItem,
} from "@codex/mobile-shared";
import {
  ClientMethods,
  NotifyMethods,
  ServerMethods,
  type CommandExecutionDecisionT,
  type FileChangeDecisionT,
} from "@codex/mobile-shared";
import { useSession, type Approval } from "../state/sessionStore";
import { MessageList } from "../components/MessageList";
import { Composer } from "../components/Composer";
import { ApprovalModal } from "../components/ApprovalModal";
import { Spinner } from "../components/Spinner";
import { loadAuth } from "../auth/token";

export function SessionRoute() {
  const nav = useNavigate();
  const params = useParams<{ id: string }>();
  const threadId = params.id ?? "";

  const session = useSession();

  useEffect(() => {
    if (!loadAuth()) {
      nav("/pair", { replace: true });
      return;
    }
    if (!threadId) return;
    rpc.start();
    let alive = true;
    session.reset();
    session.setThread(threadId);

    const offNotif = rpc.onNotification((n) => {
      const params = (n.params ?? {}) as Record<string, unknown>;
      switch (n.method) {
        case NotifyMethods.itemStarted: {
          const p = params as unknown as ItemNotificationParams;
          if (p.threadId !== threadId) return;
          if (p.item) session.onItemStarted(p.item);
          break;
        }
        case NotifyMethods.itemCompleted: {
          const p = params as unknown as ItemNotificationParams;
          if (p.threadId !== threadId) return;
          if (p.item) session.onItemCompleted(p.item);
          break;
        }
        case NotifyMethods.agentMessageDelta: {
          const p = params as unknown as AgentMessageDeltaParams;
          if (p.threadId !== threadId) return;
          session.onAgentMessageDelta(p.itemId, p.delta);
          break;
        }
        case NotifyMethods.commandExecOutputDelta: {
          const p = params as unknown as CommandExecOutputDeltaParams;
          if (p.threadId !== threadId) return;
          session.onCommandExecOutputDelta(p.itemId, p.chunk);
          break;
        }
        case NotifyMethods.fileChangePatchUpdated:
        case NotifyMethods.fileChangeOutputDelta:
        case NotifyMethods.turnPlanUpdated:
          // no special UI in v1
          break;
      }
    });

    const offExecApproval = rpc.onRequest(ServerMethods.commandExecutionRequestApproval, async (req) => {
      const p = req.params as CommandExecutionRequestApprovalParams;
      if (p.threadId !== threadId) {
        // Not for us; reject so the agent can route differently. v1 keeps
        // routing strict — if you see this, it's a bridge bug.
        throw new Error("approval routed to wrong thread");
      }
      const decision = await new Promise<CommandExecutionDecisionT>((resolve) => {
        const approval: Approval = {
          kind: "exec",
          phoneRequestId: req.id,
          params: p,
        };
        approvalResolvers.set(req.id, resolve as (d: string) => void);
        session.enqueueApproval(approval);
      });
      return { decision };
    });

    const offPatchApproval = rpc.onRequest(ServerMethods.fileChangeRequestApproval, async (req) => {
      const p = req.params as FileChangeRequestApprovalParams;
      if (p.threadId !== threadId) throw new Error("approval routed to wrong thread");
      const decision = await new Promise<FileChangeDecisionT>((resolve) => {
        const approval: Approval = {
          kind: "patch",
          phoneRequestId: req.id,
          params: p,
        };
        approvalResolvers.set(req.id, resolve as (d: string) => void);
        session.enqueueApproval(approval);
      });
      return { decision };
    });

    void resume();

    return () => {
      alive = false;
      offNotif();
      offExecApproval();
      offPatchApproval();
    };

    async function resume() {
      try {
        await waitForOpen();
        const res = await rpc.call<ThreadResumeResponse>(ClientMethods.threadResume, { threadId });
        if (!alive) return;
        seedFromResume(res.thread);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("resume failed", err);
      }
    }
  }, [threadId, nav]);

  function seedFromResume(_t: Thread) {
    if (session.bubbles.length === 0) {
      session.pushSystem("Resumed.");
    }
  }

  function send(text: string, atts: { path: string }[]) {
    const items: UserInputItem[] = [];
    if (text) items.push({ type: "text", text });
    for (const a of atts) items.push({ type: "local_image", path: a.path });
    if (items.length === 0) return;
    session.pushUser(text || "(image)");
    rpc
      .call(ClientMethods.turnStart, { threadId, input: items })
      .catch((err) => {
        session.pushError(`turn/start failed: ${(err as Error).message}`);
      });
  }

  function decide(approval: Approval, decision: CommandExecutionDecisionT | FileChangeDecisionT) {
    const resolver = approvalResolvers.get(approval.phoneRequestId);
    if (resolver) {
      resolver(decision);
      approvalResolvers.delete(approval.phoneRequestId);
    }
    session.resolveApproval(approval.phoneRequestId);
  }

  if (!threadId) {
    return (
      <div className="app">
        <div className="content center">
          <div className="error">No session id.</div>
        </div>
      </div>
    );
  }

  const pending = session.pendingApprovals[0];

  return (
    <div className="app">
      <div className="appbar">
        <button type="button" onClick={() => nav("/sessions")}>
          ‹ Back
        </button>
        <h1>{shortId(threadId)}</h1>
      </div>
      {session.bubbles.length === 0 && session.threadId !== threadId ? (
        <div className="content center">
          <Spinner />
        </div>
      ) : (
        <MessageList bubbles={session.bubbles} />
      )}
      <Composer disabled={session.composerLocked} onSend={send} />
      {pending ? <ApprovalModal approval={pending} onDecide={(d) => decide(pending, d)} /> : null}
    </div>
  );
}

// pendingResolver map shared across the route's renders.
const approvalResolvers = new Map<string | number, (decision: string) => void>();

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function waitForOpen(): Promise<void> {
  return new Promise((resolve) => {
    const off = rpc.onState((s) => {
      if (s === "open") {
        off();
        resolve();
      }
    });
  });
}
