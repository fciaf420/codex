import { useEffect, useRef } from "react";

import type { Bubble } from "../state/sessionStore";

interface Props {
  bubbles: Bubble[];
}

export function MessageList({ bubbles }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const length = bubbles.length;
  const lastTextLen = (() => {
    const last = bubbles[length - 1];
    if (!last) return 0;
    if ("text" in last) return last.text.length;
    if (last.kind === "command") return last.output.length;
    return 0;
  })();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [length, lastTextLen]);

  return (
    <div ref={ref} className="content" style={{ display: "flex", flexDirection: "column" }}>
      {bubbles.map((b) => renderBubble(b))}
    </div>
  );
}

function renderBubble(b: Bubble) {
  switch (b.kind) {
    case "user":
      return (
        <div key={b.id} className="message user">
          {b.text}
        </div>
      );
    case "assistant":
      return (
        <div key={b.id} className="message assistant">
          {b.text}
          {b.inProgress ? <span className="muted"> ▍</span> : null}
        </div>
      );
    case "command":
      return (
        <div key={b.id} className="message command">
          <div className="muted" style={{ fontSize: 11 }}>
            $ {b.cmd}
            {b.cwd ? ` (in ${b.cwd})` : ""}
            {b.exitCode !== undefined ? ` — exit ${b.exitCode}` : b.running ? " — running…" : ""}
          </div>
          <pre>{b.output}</pre>
        </div>
      );
    case "fileChange":
      return (
        <div key={b.id} className="message system">
          file change: {b.summary}
        </div>
      );
    case "error":
      return (
        <div key={b.id} className="message error">
          {b.text}
        </div>
      );
    case "system":
      return (
        <div key={b.id} className="message system">
          {b.text}
        </div>
      );
  }
}
