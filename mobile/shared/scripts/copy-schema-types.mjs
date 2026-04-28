#!/usr/bin/env node
// Copies the codex-app-server-protocol generated TS bindings into this package's
// dist-types/ directory so they can be imported via `@codex/mobile-shared/generated/*`.
// Regenerate the source via:
//   cargo run -p codex-app-server-protocol --bin export -- \
//     --out codex-rs/app-server-protocol/schema/typescript
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const src = resolve(repoRoot, "codex-rs/app-server-protocol/schema/typescript");
const dst = resolve(here, "..", "dist-types");

await rm(dst, { recursive: true, force: true });
await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`[mobile-shared] copied ${src} -> ${dst}`);
