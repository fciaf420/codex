import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";

import type { Config } from "./config.js";
import type { Logger } from "./logger.js";

type ChildHandle = ChildProcessByStdio<Writable, Readable, Readable>;

export type RpcFrame = {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

const RESTART_BASE_MS = 250;
const RESTART_CAP_MS = 5000;

export class CodexChild extends EventEmitter {
  private child: ChildHandle | undefined;
  private buf = "";
  private restartAttempt = 0;
  private stopping = false;

  constructor(private readonly config: Config, private readonly log: Logger) {
    super();
  }

  start(): void {
    this.spawnOnce();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const c = this.child;
    if (!c) return;
    c.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          c.kill("SIGKILL");
        } catch {
          /* noop */
        }
        resolve();
      }, 3000);
      c.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  send(frame: RpcFrame): void {
    if (!this.child || !this.child.stdin.writable) {
      this.log.warn("dropping frame: child not ready");
      return;
    }
    this.child.stdin.write(JSON.stringify(frame) + "\n");
  }

  isAlive(): boolean {
    return Boolean(this.child && !this.child.killed);
  }

  private spawnOnce(): void {
    const args = ["app-server", "--listen", "stdio://"];
    this.log.info({ bin: this.config.codexBin, args }, "spawning codex app-server");
    const child = spawn(this.config.codexBin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? "warn" },
    }) as ChildHandle;
    this.child = child;
    this.restartAttempt = 0;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) this.log.debug({ src: "child" }, line);
      }
    });
    child.on("exit", (code, signal) => this.onExit(code, signal));
    child.on("error", (err) => this.log.error({ err }, "child spawn error"));

    // initialize handshake — we don't await; the bridge proxies replies via
    // its normal frame routing so phones can also see the response if they
    // ever issue their own initialize call (they shouldn't — bridge owns it).
    this.send({
      jsonrpc: "2.0",
      id: "bridge-init",
      method: "initialize",
      params: {
        clientInfo: { name: "codex-mobile-bridge", version: "0.0.0" },
      },
    });

    this.emit("started");
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.log.warn({ code, signal }, "codex app-server exited");
    this.child = undefined;
    this.emit("exit", { code, signal });
    if (this.stopping) return;
    const delay = Math.min(RESTART_CAP_MS, RESTART_BASE_MS * 2 ** this.restartAttempt);
    this.restartAttempt++;
    setTimeout(() => this.spawnOnce(), delay).unref?.();
  }

  private onStdout(chunk: string): void {
    this.buf += chunk;
    let nl = this.buf.indexOf("\n");
    while (nl !== -1) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) {
        try {
          const frame = JSON.parse(line) as RpcFrame;
          this.emit("frame", frame);
        } catch (err) {
          this.log.warn({ err, line: line.slice(0, 200) }, "could not parse child stdout line");
        }
      }
      nl = this.buf.indexOf("\n");
    }
  }
}
