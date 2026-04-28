# Codex Mobile

A mobile-optimized **web** client for accessing your Codex CLI sessions from a
phone. Works in any modern mobile browser; installs as a PWA. No app store.

## Architecture

```
+------------------------+     HTTPS / WSS    +------------------------------------+
| Phone (mobile browser) | <----------------> | Node bridge on your laptop         |
| Vite + React PWA       |  bearer.<token>    |  - HTTPS, self-signed cert         |
|                        |                    |  - WS /rpc proxies JSON-RPC        |
|                        |                    |  - serves built PWA static         |
+------------------------+                    |  - QR pairing, /api/upload         |
                                              |          |                         |
                                              |          v stdin/stdout JSON-RPC   |
                                              |  child:  codex app-server          |
                                              |          --listen stdio://         |
                                              +------------------------------------+
```

Sessions remain stored in `~/.codex/sessions/*.jsonl`, so they're shared with
the desktop Codex CLI / TUI.

## Layout

```
mobile/
  bridge/    # Node 22 + Fastify + ws. Wraps `codex app-server`.
  web/       # Vite + React + TypeScript PWA, built into bridge/dist static.
  shared/    # JSON-RPC envelope + a minimal hand-written Op/EventMsg subset.
```

## Prerequisites

- Node ≥ 22, pnpm ≥ 10.33 (already required by the monorepo).
- A working `codex` binary on `PATH` (or set `CODEX_BIN=/path/to/codex`). Run
  `cargo build -p codex-app-server` from the repo root once if you don't have
  a published binary installed.
- Phone and laptop on the same Wi-Fi for LAN-only mode.

## Quickstart

```bash
# from repo root
pnpm install

# pull the protocol TS bindings the shared package re-exports
pnpm --filter @codex/mobile-shared sync-types

# build everything
pnpm --filter @codex/mobile-shared build
pnpm --filter @codex/mobile-web build
pnpm --filter @codex/mobile-bridge build

# run the bridge (also serves the built PWA)
node mobile/bridge/dist/index.js
# or, with hot-reload during development:
pnpm --filter @codex/mobile-bridge dev
```

The bridge prints the LAN URL, the cert SHA-256 fingerprint, and a QR encoding
the pair URL with the one-shot pair code. Scan it with your phone.

### Pairing

1. Phone opens `https://<lan-ip>:8787/pair#c=<code>&fp=<base64-fp>` (the QR).
2. Mobile browser warns about the self-signed cert. Verify the printed
   fingerprint matches the one on the laptop terminal, then accept.
3. The PWA POSTs `/api/pair/exchange`. Bridge issues a per-device bearer
   token, persisted in `~/.codex/mobile-bridge/devices.json` (mode 0600).
4. Future visits skip pairing: the token is in `localStorage`.

### Smoke checks

```bash
curl -k https://localhost:8787/api/health
# => { "ok": true, "childAlive": true, "version": "..." }

# After scanning the QR from a desktop browser to grab a token:
TOKEN=...
wscat -k -c "wss://localhost:8787/rpc" --subprotocol "bearer.$TOKEN"
> {"jsonrpc":"2.0","id":1,"method":"thread/list","params":{"limit":5}}
```

### Click-path on the phone

1. `https://<lan-ip>:8787/pair`, accept warning, verify fingerprint.
2. `/sessions` lists existing rollouts under `~/.codex/sessions/`.
3. Tap one to resume; type a message, see streamed output.
4. `/new` lets you set cwd, model, approval policy, sandbox, and start a new
   session.
5. When Codex asks to run a command or apply a patch, an approval modal
   appears with Approve / Approve for session / Deny / Abort.
6. Tap the camera or library button to attach an image; it uploads and is
   passed as a `LocalImage { path }` to the next turn.

## Configuration

Env vars (or `--flag value` on the bridge CLI):

| Var                        | Flag             | Default                     | Notes                                  |
| -------------------------- | ---------------- | --------------------------- | -------------------------------------- |
| `MOBILE_BRIDGE_PORT`       | `--port`         | `8787`                      |                                        |
| `MOBILE_BRIDGE_HOST`       | `--host`         | `0.0.0.0`                   |                                        |
| `CODEX_BIN`                | `--codex-bin`    | `codex`                     | path to the Codex binary               |
| `CODEX_HOME`               | -                | `~/.codex`                  | inherited                              |
| `MOBILE_BRIDGE_STATIC`     | `--static-dir`   | `mobile/web/dist`           | override PWA static dir                |
| `MOBILE_BRIDGE_RELAY`      | -                | unset                       | when set (`wss://...`) bridge dials it |
| `MOBILE_BRIDGE_LOG_LEVEL`  | -                | `info`                      | `debug` for verbose                    |

## Device management

```bash
# list all paired devices
node mobile/bridge/dist/index.js list-devices

# revoke one
node mobile/bridge/dist/index.js revoke <deviceId>
```

## TLS notes

The bridge generates a self-signed cert under `~/.codex/mobile-bridge/`. Mobile
browsers can't pin certs programmatically, so the pair flow asks the user to
verify the fingerprint visually. To regenerate (e.g. after moving subnets),
delete `cert.pem` + `key.pem` in that directory and restart.

## Relay (optional WAN)

Set `MOBILE_BRIDGE_RELAY=wss://your-relay.example.com`. The bridge dials
outbound and registers `{ bridgeId, fingerprint }`. The relay is expected to
forward incoming phone frames as `{ type:"frame", phoneId, payload }`. **The
relay server itself is not shipped in v1** — only the dialer hook. See
`bridge/src/relay.ts` for the protocol skeleton.

## Add to Home Screen (iOS)

The PWA is already wired for installation. After pairing, in **Safari** (not
Chrome — iOS only creates true PWAs from Safari):

1. Tap **Share** → **Add to Home Screen** → name it "Codex" → **Add**.
2. Launch from the new icon. It opens fullscreen, no Safari chrome, custom
   dark status bar, lives in the app switcher.

Icons live in `mobile/web/public/icons/` and are generated by
`mobile/web/scripts/generate-icons.mjs` (no image deps; pure Node + zlib).
To regenerate after design tweaks: `node mobile/web/scripts/generate-icons.mjs`.

### Web Share Target

Once installed, "Codex" appears in the iOS share sheet. Long-press a
screenshot or photo, tap **Share**, pick **Codex**. The PWA opens at `/share`
with the file staged; you pick a session (or start a new one) and the file
is uploaded + sent as the next turn.

Implementation: the manifest declares `share_target` pointing at
`/share-target`; the custom service worker (`mobile/web/src/sw.ts`)
intercepts the POST, stages the file in a private Cache, and 303-redirects
to the `/share` SPA route.

## Out of scope for v1

Push notifications, voice / realtime conversation, git ops UI, multi-user
auth, native App Store wrappers, full filesystem browser for cwd, granular
sandbox profile editor, token rotation. Ship the relay server itself in v2.
