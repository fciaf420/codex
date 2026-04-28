import type { CommandExecutionDecisionT, FileChangeDecisionT } from "@codex/mobile-shared";

import type { Approval } from "../state/sessionStore";

interface Props {
  approval: Approval;
  onDecide: (decision: CommandExecutionDecisionT | FileChangeDecisionT) => void;
}

const COMMON_DECISIONS = ["accept", "acceptForSession", "decline", "cancel"] as const;

export function ApprovalModal({ approval, onDecide }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        {approval.kind === "exec" ? <ExecBody approval={approval} /> : <PatchBody approval={approval} />}
        <div className="modal-actions">
          {COMMON_DECISIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={d === "accept" || d === "acceptForSession" ? "primary" : d === "cancel" ? "danger" : ""}
              onClick={() => onDecide(d)}
            >
              {labelFor(d)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExecBody({ approval }: { approval: Extract<Approval, { kind: "exec" }> }) {
  const cmd = formatCommand(approval.params.command);
  return (
    <>
      <h2>Run command?</h2>
      {approval.params.reason ? <p className="muted">{approval.params.reason}</p> : null}
      {approval.params.cwd ? <div className="cwd" style={{ marginBottom: 8 }}>{approval.params.cwd}</div> : null}
      <pre className="diff">{cmd}</pre>
    </>
  );
}

function PatchBody({ approval }: { approval: Extract<Approval, { kind: "patch" }> }) {
  return (
    <>
      <h2>Apply patch?</h2>
      {approval.params.reason ? <p className="muted">{approval.params.reason}</p> : null}
      {approval.params.grantRoot ? (
        <div className="cwd" style={{ marginBottom: 8 }}>
          grant write under: {approval.params.grantRoot}
        </div>
      ) : null}
      <p className="muted" style={{ fontSize: 12 }}>
        Diff details stream as <code>item/fileChange/*</code> notifications. v1 doesn't render them inline yet —
        approve only if you trust the agent in this turn.
      </p>
    </>
  );
}

function formatCommand(c: string | string[] | undefined): string {
  if (!c) return "";
  if (typeof c === "string") return c;
  return c.join(" ");
}

function labelFor(d: typeof COMMON_DECISIONS[number]): string {
  switch (d) {
    case "accept":
      return "Approve";
    case "acceptForSession":
      return "Approve for session";
    case "decline":
      return "Decline";
    case "cancel":
      return "Cancel turn";
  }
}
