# codex-image-gen

Claude Code plugin that exposes Codex's image gen 2.0 (gpt-image-2) as a slash command, with the OpenAI Cookbook prompting guide injected into context on every invocation.

Modeled after [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc).

## Install

From inside Claude Code:

```
/plugin marketplace add fciaf420/codex
/plugin install codex-image-gen@fciaf420-codex
```

## Use

```
/codex-image-gen:generate "<image request>" [--quality low|medium|high] [--size 1024x1024|1536x1024|1024x1536|2560x1440] [--out <path>] [--edit <input-image>] [-n <count>]
```

Examples:

```
/codex-image-gen:generate "minimal hero image of a ceramic coffee mug, soft studio lighting, negative space on the right" --quality high --size 1536x1024 --out output_images/hero.png
/codex-image-gen:generate "infographic explaining cellular respiration for high-school biology" --quality high
/codex-image-gen:generate "replace the background with a warm sunset gradient, keep product and edges unchanged" --edit input_images/shampoo.png --out output_images/shampoo-sunset.png
```

## Requirements

- The Codex CLI installed and on `PATH` (`npm install -g @openai/codex`).
- You logged into Codex (`codex login`). The plugin uses your existing Codex auth — **no `OPENAI_API_KEY` needed**, no API billing.

## How it works

The slash command body inlines the OpenAI Cookbook *GPT Image Generation Models Prompting Guide* via an `@` include. Claude Code resolves the include at invocation time, so the full guide lands in the model's context every time. Claude then refines the user's request to follow the guide's structure, picks `quality` and `size` per §1.1, and shells out to your local `codex exec` to run Codex's built-in `image_gen` tool against `gpt-image-2` — authenticated through your Codex session.

The prompting guide lives at `references/openai-cookbook-prompting-guide.md` (mirrored from the [OpenAI Cookbook](https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb)).
