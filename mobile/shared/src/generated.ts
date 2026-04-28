// Re-exports the codex-app-server-protocol generated TS bindings copied into
// dist-types/ by scripts/copy-schema-types.mjs. Consumers should import via
// `@codex/mobile-shared/generated/<TypeName>`; this index exists only to
// surface the most commonly used names with a single import.
//
// NOTE: types are referenced by file path because the generated bindings emit
// one file per type. We re-export only what the PWA needs in v1.
//
// If you add a new type here, it is your responsibility to ensure
// scripts/copy-schema-types.mjs has run (pnpm run sync-types).

// These imports are commented out by default because they are resolved at
// build-time via package `exports` and may not exist at type-check time in a
// fresh checkout (run `pnpm --filter @codex/mobile-shared sync-types` first).
//
// Once dist-types/ is populated, uncomment the re-exports you need:
//
// export type { Thread } from "../dist-types/v2/Thread.js";
// export type { ThreadListParams } from "../dist-types/v2/ThreadListParams.js";
// export type { ThreadListResponse } from "../dist-types/v2/ThreadListResponse.js";
// export type { ThreadStartParams } from "../dist-types/v2/ThreadStartParams.js";
// export type { ThreadStartResponse } from "../dist-types/v2/ThreadStartResponse.js";
// export type { ThreadResumeParams } from "../dist-types/v2/ThreadResumeParams.js";
// export type { ThreadResumeResponse } from "../dist-types/v2/ThreadResumeResponse.js";
// export type { ApplyPatchApprovalParams } from "../dist-types/ApplyPatchApprovalParams.js";
// export type { ExecCommandApprovalParams } from "../dist-types/ExecCommandApprovalParams.js";
// export type { ReviewDecision } from "../dist-types/ReviewDecision.js";
// export type { SandboxMode } from "../dist-types/v2/SandboxMode.js";
// export type { AskForApproval } from "../dist-types/v2/AskForApproval.js";

export {}; // keep this file a module
