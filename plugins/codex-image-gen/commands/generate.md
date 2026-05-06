---
description: Generate or edit an image with Codex image gen 2.0 (gpt-image-2), enforcing the OpenAI Cookbook prompting guide
argument-hint: '"<image request>" [--quality low|medium|high] [--size 1024x1024|1536x1024|1024x1536|2560x1440] [--out <path>] [--edit <input-image>] [-n <count>]'
allowed-tools: Read, Write, Bash(python3:*), Bash(uv:*), Bash(mkdir:*), Bash(ls:*), Bash(file:*), AskUserQuestion
---

You are running the `/codex-image-gen:generate` slash command. The user's raw arguments:

`$ARGUMENTS`

## Mandatory prompting guide (always loaded)

The OpenAI Cookbook prompting guide for gpt-image-2 is included verbatim below. **Every prompt you build must follow it.** Do not skip it. Do not paraphrase its rules. The §2 Prompting Fundamentals are non-negotiable.

@plugins/codex-image-gen/references/openai-cookbook-prompting-guide.md

## Workflow

1. **Parse arguments.** Extract the user's image request (the unquoted/quoted free-text part of `$ARGUMENTS`). Read optional flags: `--quality` (default `high`), `--size` (default `1024x1024`), `--out` (default `output_images/<slug>-<timestamp>.png`), `--edit <path>` (switches to edit mode), `-n <count>` (number of variants, default 1, max 4 — issue separate calls for distinct assets, only use `n` for variants of the same prompt).
2. **Confirm `OPENAI_API_KEY` is set.** Run `python3 -c "import os, sys; sys.exit(0 if os.environ.get('OPENAI_API_KEY') else 1)"`. If it returns non-zero, stop and tell the user to export `OPENAI_API_KEY` (point them to <https://platform.openai.com/api-keys>). Do not ask them to paste the key in chat.
3. **Confirm `openai` Python package is installed.** Run `python3 -c "import openai" 2>/dev/null || python3 -c "import openai"` — if the import fails, tell the user to install with `uv pip install openai` (or `pip install openai`) and stop.
4. **Classify the use case** using §4 (generate) or §5/§6 (edit) of the included guide. Pick the matching pattern (infographic, photorealism, logo, ads, comic, UI mock, scientific, slides, style transfer, virtual try-on, sketch→render, product mockup, marketing creative, lighting/weather, object removal, person insert, multi-image composite, interior swap, holiday card, merch, character-consistent storybook).
5. **Build the prompt** by applying §2 Prompting Fundamentals to the user's request:
   - Order: scene/background → subject → key details → constraints.
   - State intended use, materials, lighting, composition, framing.
   - For people: scale, body framing, gaze, action.
   - For text in images: quote literal copy or use ALL CAPS, specify typography, spell tricky words letter-by-letter.
   - State invariants ("preserve identity/geometry/layout/brand") and exclusions ("no watermark, no extra text, no logos/trademarks").
   - For edits: "change only X" + "keep everything else the same"; repeat the preserve-list every iteration.
   - Add "photorealistic" / "real photograph" cues only when photorealism is the goal.
6. **Pick `quality`/`size` deliberately** using §1.1:
   - `quality=low` for drafts, high-volume, fast iteration.
   - `quality=medium` or `high` for small/dense text, infographics, close-up portraits, identity-sensitive edits, high-resolution output.
   - `size` must satisfy gpt-image-2 constraints: max edge `< 3840px`, both edges multiples of `16`, ratio `<= 3:1`, total px between `655,360` and `8,294,400`.
7. **Show the user the refined prompt and chosen parameters before generating.** If the user did not pass `--quality`/`--size` explicitly, use `AskUserQuestion` once to confirm:
   - Recommended `quality` (with reason).
   - Recommended `size` (with reason).
   - Output path.
8. **Generate.** Use the inline Python invocation below. Substitute the values you built. For multiple variants pass `n=<count>` (max 4); for distinct assets re-invoke the command per asset.
9. **Inspect the output** by running `file <path>` and `ls -la <path>` to confirm it saved. Validate against the user's invariants/avoid list.
10. **Report**: final saved path(s), the refined prompt, the chosen `quality`/`size`/`model`, and any deviations from the user's original request.

## Generate (text → image)

```bash
mkdir -p "$(dirname '<OUT_PATH>')"
python3 - <<'PY'
import base64, os, sys
from openai import OpenAI

client = OpenAI()
prompt = """<REFINED_PROMPT>"""
out_path = "<OUT_PATH>"
size = "<SIZE>"
quality = "<QUALITY>"
n = <N>

resp = client.images.generate(
    model="gpt-image-2",
    prompt=prompt,
    size=size,
    quality=quality,
    n=n,
)

base, ext = os.path.splitext(out_path)
saved = []
for i, item in enumerate(resp.data):
    target = out_path if n == 1 else f"{base}-{i+1}{ext or '.png'}"
    with open(target, "wb") as f:
        f.write(base64.b64decode(item.b64_json))
    saved.append(target)
print("\n".join(saved))
PY
```

## Edit (text + image → image)

```bash
mkdir -p "$(dirname '<OUT_PATH>')"
python3 - <<'PY'
import base64, os, sys
from openai import OpenAI

client = OpenAI()
prompt = """<REFINED_PROMPT_WITH_INVARIANTS>"""
input_path = "<EDIT_INPUT_PATH>"
out_path = "<OUT_PATH>"
size = "<SIZE>"
quality = "<QUALITY>"

with open(input_path, "rb") as image_file:
    resp = client.images.edit(
        model="gpt-image-2",
        image=image_file,
        prompt=prompt,
        size=size,
        quality=quality,
    )

with open(out_path, "wb") as f:
    f.write(base64.b64decode(resp.data[0].b64_json))
print(out_path)
PY
```

## Constraints on this command

- Never silently fall back to `gpt-image-1.5` or `gpt-image-1`. If a transparent-background result requires native transparency, stop and ask the user to confirm before switching models.
- For transparent-background requests on `gpt-image-2`, prompt for a flat solid `#00ff00` (or `#ff00ff` for green subjects) chroma-key background and tell the user to chroma-key it locally rather than switching models.
- Never overwrite an existing file at `--out` without explicit user confirmation; pick a sibling versioned filename (e.g. `hero-v2.png`) instead.
- Always report the final saved path and the refined prompt, even on failure.
