import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { rest } from "../api/rest";
import { saveAuth, loadAuth } from "../auth/token";

interface PairHash {
  code: string | undefined;
  fp: string | undefined;
}

function readHash(): PairHash {
  const h = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(h);
  return { code: params.get("c") ?? undefined, fp: params.get("fp") ?? undefined };
}

export function PairRoute() {
  const nav = useNavigate();
  const [code, setCode] = useState<string>("");
  const [fp, setFp] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loadAuth()) {
      nav("/sessions", { replace: true });
      return;
    }
    const h = readHash();
    if (h.code) setCode(h.code);
    if (h.fp) setFp(h.fp);
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      const res = await rest.pairExchange(code.trim().toUpperCase(), navigator.userAgent);
      saveAuth({
        token: res.token,
        baseUrl: res.baseUrl ?? location.origin,
        fingerprint: res.fingerprint,
        deviceId: res.deviceId,
      });
      nav("/sessions", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="appbar">
        <h1>Pair this device</h1>
      </div>
      <div className="content">
        {fp ? (
          <div className="banner">
            <div className="muted" style={{ fontSize: 12 }}>
              Verify this fingerprint matches the one printed in your Codex bridge terminal:
            </div>
            <div className="fingerprint">{fp}</div>
          </div>
        ) : null}
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label htmlFor="code">Pair code</label>
            <input
              id="code"
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. K3J4HZ7T..."
            />
          </div>
          {error ? <div className="error">{error}</div> : null}
          <button type="submit" className="primary" disabled={busy || !code.trim()}>
            {busy ? "Pairing…" : "Pair"}
          </button>
        </form>
      </div>
    </div>
  );
}
