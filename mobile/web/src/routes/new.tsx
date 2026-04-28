import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { rpc } from "../api/rpc";
import {
  APPROVAL_POLICIES,
  SANDBOX_MODES,
  type AskForApproval,
  type SandboxMode,
  type Thread,
  type ThreadListResponse,
  type ThreadStartResponse,
} from "../api/types";

export function NewRoute() {
  const nav = useNavigate();
  const [cwd, setCwd] = useState("");
  const [model, setModel] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState<AskForApproval>("on_request");
  const [sandbox, setSandbox] = useState<SandboxMode>("workspace_write");
  const [recentCwds, setRecentCwds] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rpc.start();
    void loadRecent();

    async function loadRecent() {
      try {
        await waitForOpen();
        const res = await rpc.call<ThreadListResponse>("thread/list", { limit: 25 });
        const seen = new Set<string>();
        const ordered: string[] = [];
        for (const t of res.data as Thread[]) {
          if (!seen.has(t.cwd)) {
            seen.add(t.cwd);
            ordered.push(t.cwd);
          }
        }
        setRecentCwds(ordered);
        if (!cwd && ordered[0]) setCwd(ordered[0]);
      } catch {
        // non-fatal
      }
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      const res = await rpc.call<ThreadStartResponse>("thread/start", {
        cwd: cwd.trim() || null,
        approvalPolicy,
        sandbox,
        model: model.trim() || null,
      });
      nav(`/sessions/${res.thread.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="appbar">
        <button type="button" onClick={() => nav("/sessions")}>
          ‹ Back
        </button>
        <h1>New session</h1>
      </div>
      <form onSubmit={submit} className="content stack">
        <div className="field">
          <label htmlFor="cwd">Working directory</label>
          <input
            id="cwd"
            list="recent-cwds"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="/Users/you/code/project"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <datalist id="recent-cwds">
            {recentCwds.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="model">Model (optional)</label>
          <input
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="leave blank for default"
          />
        </div>
        <div className="field">
          <label htmlFor="approvalPolicy">Approval policy</label>
          <select
            id="approvalPolicy"
            value={approvalPolicy}
            onChange={(e) => setApprovalPolicy(e.target.value as AskForApproval)}
            style={{
              width: "100%",
              minHeight: "var(--tap)",
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
            }}
          >
            {APPROVAL_POLICIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sandbox">Sandbox</label>
          <select
            id="sandbox"
            value={sandbox}
            onChange={(e) => setSandbox(e.target.value as SandboxMode)}
            style={{
              width: "100%",
              minHeight: "var(--tap)",
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
            }}
          >
            {SANDBOX_MODES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Starting…" : "Start session"}
        </button>
      </form>
    </div>
  );
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
