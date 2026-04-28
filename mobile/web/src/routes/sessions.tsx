import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { rpc } from "../api/rpc";
import type { Thread, ThreadListResponse } from "../api/types";
import { Spinner } from "../components/Spinner";
import { clearAuth, loadAuth } from "../auth/token";

export function SessionsRoute() {
  const nav = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!loadAuth()) {
      nav("/pair", { replace: true });
      return;
    }
    rpc.start();
    let active = true;
    void loadFirstPage();

    return () => {
      active = false;
    };

    async function loadFirstPage() {
      try {
        await waitForOpen();
        const res = await rpc.call<ThreadListResponse>("thread/list", { limit: 30 });
        if (!active) return;
        setThreads(res.data);
        setCursor(res.nextCursor);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
  }, [nav]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await rpc.call<ThreadListResponse>("thread/list", { limit: 30, cursor });
      setThreads((prev) => [...prev, ...res.data]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function logout() {
    rpc.stop();
    clearAuth();
    nav("/pair", { replace: true });
  }

  return (
    <div className="app">
      <div className="appbar">
        <h1>Sessions</h1>
        <Link to="/new">New</Link>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </div>
      <div className="content">
        {loading ? (
          <div className="center">
            <Spinner />
          </div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : threads.length === 0 ? (
          <div className="muted">
            No sessions yet. <Link to="/new">Start one</Link>.
          </div>
        ) : (
          <div className="list">
            {threads.map((t) => (
              <Link key={t.id} to={`/sessions/${t.id}`} className="row" style={{ display: "block", color: "inherit" }}>
                <div style={{ fontWeight: 600 }}>{t.name?.trim() || t.preview.trim() || "(untitled)"}</div>
                <div className="cwd">{t.cwd}</div>
                <div className="meta">{formatTime(t.updatedAt)} · {t.modelProvider}</div>
              </Link>
            ))}
            {cursor ? (
              <button type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
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
