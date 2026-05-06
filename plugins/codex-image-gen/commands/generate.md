---
description: Generate or edit an image with Codex image gen 2.0 (gpt-image-2) via your local Codex CLI (uses your existing Codex auth — no OpenAI API key needed)
argument-hint: '"<image request>" [--quality low|medium|high] [--size 1024x1024|1536x1024|1024x1536|2560x1440] [--out <path>] [--edit <input-image>] [-n <count>]'
allowed-tools: Read, Bash(codex:*), Bash(mkdir:*), Bash(ls:*), Bash(file:*), Bash(cp:*), Bash(mv:*), AskUserQuestion
---

You are running the `/codex-image-gen:generate` slash command. The user's raw arguments:

`$ARGUMENTS`

This command delegates the actual image generation to the local Codex CLI via `codex exec`, which uses the user's existing Codex (OAuth) session. **Do not call the OpenAI API directly. Do not require `OPENAI_API_KEY`.** Codex's built-in `image_gen` tool runs through the user's Codex sub.

## Mandatory prompting guide (always loaded)

The OpenAI Cookbook prompting guide for gpt-image-2 is included verbatim below. **Every prompt you build must follow it.** Do not skip it. Do not paraphrase its rules. The §2 Prompting Fundamentals are non-negotiable.

@plugins/codex-image-gen/references/openai-cookbook-prompting-guide.md

## Workflow

1. **Parse arguments.** Extract the user's image request (the unquoted/quoted free-text part of `$ARGUMENTS`). Read optional flags: `--quality` (default `high`), `--size` (default `1024x1024`), `--out` (default `output_images/<slug>-<timestamp>.png`), `--edit <path>` (switches to edit mode), `-n <count>` (number of variants, default 1, max 4 — issue separate codex calls for distinct assets, only use `n` for variants of the same prompt).
2. **Verify the Codex CLI is installed.** Run `codex --version`. If the binary is missing, stop and tell the user to install it (`npm install -g @openai/codex` or follow the repo's install docs) and to make sure they are logged in (`codex login`). Do not attempt an API fallback.
3. **Classify the use case** using §4 (generate) or §5/§6 (edit) of the included guide. Pick the matching pattern (infographic, photorealism, logo, ads, comic, UI mock, scientific, slides, style transfer, virtual try-on, sketch→render, product mockup, marketing creative, lighting/weather, object removal, person insert, multi-image composite, interior swap, holiday card, merch, character-consistent storybook).
4. **Build the refined prompt** by applying §2 Prompting Fundamentals to the user's request:
   - Order: scene/background → subject → key details → constraints.
   - State intended use, materials, lighting, composition, framing.
   - For people: scale, body framing, gaze, action.
   - For text in images: quote literal copy or use ALL CAPS, specify typography, spell tricky words letter-by-letter.
   - State invariants ("preserve identity/geometry/layout/brand") and exclusions ("no watermark, no extra text, no logos/trademarks").
   - For edits: "change only X" + "keep everything else the same"; repeat the preserve-list every iteration.
   - Add "photorealistic" / "real photograph" cues only when photorealism is the goal.
5. **Pick `quality`/`size` deliberately** using §1.1:
   - `quality=low` for drafts, high-volume, fast iteration.
   - `quality=medium` or `high` for small/dense text, infographics, close-up portraits, identity-sensitive edits, high-resolution output.
   - `size` must satisfy gpt-image-2 constraints: max edge `< 3840px`, both edges multiples of `16`, ratio `<= 3:1`, total px between `655,360` and `8,294,400`.
6. **Show the user the refined prompt and chosen parameters before generating.** If the user did not pass `--quality`/`--size` explicitly, use `AskUserQuestion` once to confirm:
   - Recommended `quality` (with reason).
   - Recommended `size` (with reason).
   - Output path.
7. **Delegate to Codex.** Run the appropriate `codex exec` invocation below. Codex will use its built-in `image_gen` tool against `gpt-image-2`, authenticated via the user's Codex session.
8. **Capture and report**: Codex prints the saved path(s). Pass them through verbatim, then summarize: final saved path(s), the refined prompt, the chosen `quality`/`size`/`model`, and any deviations from the user's original request.

## Generate (text → image) via `codex exec`

Substitute `<REFINED_PROMPT>`, `<QUALITY>`, `<SIZE>`, `<OUT_PATH>`, and `<N>` (number of variants) before running. Run from the repo root so relative output paths resolve there.

```bash
mkdir -p "$(dirname '<OUT_PATH>')"
codex exec --sandbox workspace-write --skip-git-repo-check - <<'EOF'
Use your built-in image_gen tool to generate <N> image(s) for the prompt below. Use model gpt-image-2 with quality=<QUALITY> and size=<SIZE>. After generation, copy the selected output(s) from the default $CODEX_HOME/generated_images/... save location to <OUT_PATH> (for n=1) or to sibling versioned filenames based on <OUT_PATH> (for n>1). When done, print one absolute saved path per line and nothing else.

Prompt:
<REFINED_PROMPT>
EOF
```

> **Cross-platform note:** the prompt is passed via stdin (`- <<'EOF'`) rather than as a positional argument. On Windows (Git Bash / Cygwin) the Bash tool's stdin handle isn't a closed TTY, so `codex exec "<prompt>"` triggers codex's "stdin is piped, append to prompt" branch and hangs forever waiting for EOF. Heredoc-on-stdin gives a real EOF on every platform.

## Edit (text + image → image) via `codex exec`

Substitute `<REFINED_PROMPT_WITH_INVARIANTS>`, `<EDIT_INPUT_PATH>`, `<QUALITY>`, `<SIZE>`, and `<OUT_PATH>` before running.

```bash
mkdir -p "$(dirname '<OUT_PATH>')"
codex exec --sandbox workspace-write --skip-git-repo-check - <<'EOF'
Edit the image at <EDIT_INPUT_PATH> using your built-in image_gen tool's edit mode. Load it into context first with view_image if needed. Use model gpt-image-2 with quality=<QUALITY> and size=<SIZE>. After generation, copy the selected output from the default $CODEX_HOME/generated_images/... save location to <OUT_PATH>. When done, print the absolute saved path and nothing else.

Edit instruction (state invariants explicitly):
<REFINED_PROMPT_WITH_INVARIANTS>
EOF
```

## Constraints on this command

- This command runs the user's local `codex` CLI. It uses the user's existing Codex auth (OAuth / Codex sub). Never tell the user they need an `OPENAI_API_KEY` for this path — they don't. If `codex` is missing or unauthenticated, stop and ask them to install/login.
- Never silently fall back to `gpt-image-1.5` or `gpt-image-1`. If a transparent-background result requires native transparency, stop and ask the user to confirm before switching models.
- For transparent-background requests on `gpt-image-2`, prompt for a flat solid `#00ff00` (or `#ff00ff` for green subjects) chroma-key background and tell the user to chroma-key it locally rather than switching models.
- Never overwrite an existing file at `--out` without explicit user confirmation; pick a sibling versioned filename (e.g. `hero-v2.png`) instead.
- Always report the final saved path and the refined prompt, even on failure.
