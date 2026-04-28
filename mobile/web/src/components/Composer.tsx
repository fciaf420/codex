import { useRef, useState } from "react";

import { rest } from "../api/rest";

export interface ComposerAttachment {
  path: string;
  mime: string;
  size: number;
  previewUrl: string;
}

interface Props {
  disabled: boolean;
  onSend: (text: string, attachments: ComposerAttachment[]) => void;
}

export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<ComposerAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const next: ComposerAttachment[] = [];
      for (const f of Array.from(files)) {
        const res = await rest.upload(f);
        next.push({ ...res, previewUrl: URL.createObjectURL(f) });
      }
      setAtts((a) => [...a, ...next]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("upload failed", err);
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function send() {
    const trimmed = text.trim();
    if (!trimmed && atts.length === 0) return;
    if (disabled) return;
    onSend(trimmed, atts);
    setText("");
    setAtts([]);
  }

  function removeAt(i: number) {
    setAtts((a) => a.filter((_, j) => j !== i));
  }

  return (
    <div className="composer">
      {atts.length > 0 ? (
        <div className="attachments">
          {atts.map((a, i) => (
            <span key={a.path} className="chip">
              <img
                src={a.previewUrl}
                alt=""
                style={{ width: 18, height: 18, objectFit: "cover", borderRadius: 3 }}
              />
              image
              <button
                type="button"
                aria-label="remove"
                style={{ minHeight: 18, padding: "0 4px", background: "transparent", border: "none" }}
                onClick={() => removeAt(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="composer-row">
        <button
          type="button"
          aria-label="attach from camera"
          disabled={disabled || busy}
          onClick={() => cameraRef.current?.click()}
        >
          📷
        </button>
        <button
          type="button"
          aria-label="attach from library"
          disabled={disabled || busy}
          onClick={() => libraryRef.current?.click()}
        >
          🖼
        </button>
        <textarea
          rows={1}
          placeholder={disabled ? "Working…" : "Message Codex"}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          autoCapitalize="sentences"
          enterKeyHint="send"
          inputMode="text"
        />
        <button type="button" className="primary" onClick={send} disabled={disabled || busy}>
          Send
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void pickFiles(e.target.files).then(() => (e.target.value = ""))}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void pickFiles(e.target.files).then(() => (e.target.value = ""))}
      />
    </div>
  );
}
