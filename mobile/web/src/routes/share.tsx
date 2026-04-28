import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { rpc } from "../api/rpc";
import { rest } from "../api/rest";
import type { Thread, ThreadListResponse, ThreadStartResponse } from "../api/types";
import type { UserInputItem } from "@codex/mobile-shared";
import { ClientMethods } from "@codex/mobile-shared";
import { loadAuth } from "../auth/token";
import { Spinner } from "../components/Spinner";

interface Staged {
  files: File[];
  text?: string;
}

export function ShareRoute() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const key = params.get("key");

  const [staged, setStaged] = useState<Staged | undefined>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!loadAuth()) {
      nav("/pair", { replace: true });
      return;
    }
    if (!key) {
      nav("/sessions", { replace: true });
      return;
    }
    let cancelled = false;
    void load();
    return () => {
      cancelled = true;
    };

    async function load() {
      try {
        const s = await readStaged(key);
        if (cancelled) return;
        if (!s.files.length && !s.text) {
          nav("/sessions", { replace: true });
          return;
        }
        setStaged(s);
        rpc.start();
        await waitForOpen();
        const res = await rpc.call<ThreadListResponse>(ClientMethods.threadList, { limit: 25 });
        if (!cancelled) setThreads(res.data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
  }, [key, nav]);

  async function sendTo(threadId: string) {
    if (!staged) return;
    setBusy(true);
    setError(undefined);
    try {
      const items: UserInputItem[] = [];
      if (staged.text) items.push({ type: "text", text: staged.text });
      for (const f of staged.files) {
        const res = await rest.upload(f);
        items.push({ type: "local_image", path: res.path });
      }
      await rpc.call(ClientMethods.turnStart, { threadId, input: items });
      await clearStaged(key!);
      nav(`/sessions/${threadId}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function startNew() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await rpc.call<ThreadStartResponse>(ClientMethods.threadStart, {});
      await sendTo(res.thread.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function discard() {
    if (key) await clearStaged(key);
    nav("/sessions", { replace: true });
  }

  return (
    <div className="app">
      <div className="appbar">
        <h1>Share to Codex</h1>
        <button type="button" onClick={discard}>
          Cancel
        </button>
      </div>
      <div className="content stack">
        {loading ? (
          <div className="center">
            <Spinner />
          </div>
        ) : (
          <>
            {staged ? <SharedPreview staged={staged} /> : null}
            {error ? <div className="error">{error}</div> : null}
            <button type="button" className="primary" onClick={startNew} disabled={busy}>
              {busy ? "Working…" : "Send to new session"}
            </button>
            {threads.length > 0 ? (
              <>
                <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  Or attach to an existing session:
                </div>
                <div className="list">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="row"
                      style={{ display: "block", textAlign: "left" }}
                      onClick={() => sendTo(t.id)}
                      disabled={busy}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {t.name?.trim() || t.preview.trim() || "(untitled)"}
                      </div>
                      <div className="cwd">{t.cwd}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SharedPreview({ staged }: { staged: Staged }) {
  return (
    <div className="row">
      {staged.text ? (
        <div style={{ marginBottom: staged.files.length > 0 ? 8 : 0, whiteSpace: "pre-wrap" }}>
          {staged.text}
        </div>
      ) : null}
      {staged.files.map((f) =>
        f.type.startsWith("image/") ? (
          <ImagePreview key={f.name + f.size} file={f} />
        ) : (
          <div key={f.name + f.size} className="muted" style={{ fontSize: 13 }}>
            {f.name} · {Math.round(f.size / 1024)} KB
          </div>
        ),
      )}
    </div>
  );
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      style={{ maxWidth: "100%", borderRadius: 8, display: "block", marginTop: 4 }}
    />
  );
}

async function readStaged(key: string): Promise<Staged> {
  const cache = await caches.open("codex-mobile-share-v1");
  const files: File[] = [];
  for (let i = 0; i < 16; i++) {
    const res = await cache.match(`/__share/${key}/file/${i}`);
    if (!res) break;
    const blob = await res.blob();
    const filename = res.headers.get("x-filename") || `shared-${i}`;
    const type = res.headers.get("content-type") || blob.type || "application/octet-stream";
    files.push(new File([blob], filename, { type }));
  }
  const textRes = await cache.match(`/__share/${key}/text`);
  const text = textRes ? await textRes.text() : undefined;
  return { files, text };
}

async function clearStaged(key: string): Promise<void> {
  const cache = await caches.open("codex-mobile-share-v1");
  for (let i = 0; i < 16; i++) await cache.delete(`/__share/${key}/file/${i}`);
  await cache.delete(`/__share/${key}/text`);
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
