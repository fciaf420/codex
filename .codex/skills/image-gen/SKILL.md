---
name: image-gen
description: Generate or edit raster images for the codex repo using Codex's built-in image_gen tool (gpt-image-2, also known as "image gen 2.0"). Use when the user asks for a bitmap asset such as a hero image, mockup, screenshot backdrop, illustration, sprite, marketing visual, or photorealistic render, and wants Codex to create a new image or edit an existing one in the workspace. Do not use for SVG/vector icons, code-native diagrams, or extending an existing vector asset system.
---

# /image-gen

Slash-command entry point for image generation in this repo. Defers to the bundled `imagegen` system skill for the full workflow, prompt schema, transparency handling, and CLI fallback rules.

## Defaults

- Use the built-in `image_gen` tool (backed by `gpt-image-2`, "image gen 2.0"). No `OPENAI_API_KEY` required.
- Drafts: `quality=low` at `1024x1024`.
- Final assets: `quality=high` and pick a size from gpt-image-2's popular sizes: `1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`, `3840x2160`, `2160x3840`.
- Square images render fastest; pick a non-square size only when the asset's intended use needs it.
- One built-in `image_gen` call per requested asset or variant. Do not use `n` as a substitute for separate prompts.
- Never silently fall back to `gpt-image-1.5` or the CLI path. Ask first.

## Workflow

1. Confirm the request is for a raster asset rather than something better produced as SVG, HTML/CSS, or canvas. If it's an icon/logo that should match an existing repo-native vector system, stop and recommend editing those assets directly.
2. Decide intent: `generate` (new image, possibly with reference images) or `edit` (transform an existing image while preserving parts of it).
3. Build a structured prompt using the shared schema in the bundled `imagegen` skill (`use case`, `subject`, `style/medium`, `composition`, `lighting/mood`, `constraints`, verbatim text). Keep augmentation minimal when the user's prompt is already specific.
4. For edits of a local file, load it with the built-in `view_image` tool first so it's visible in conversation context, then edit.
5. Call the built-in `image_gen` tool. Issue one call per requested asset or variant.
6. Inspect each output and validate subject, style, composition, text accuracy, and any invariants/avoid items. Iterate with single-change follow-ups.
7. For project-bound assets, move or copy the final image into the workspace; never leave a project-referenced asset only at the default `$CODEX_HOME/generated_images/...` path. Do not overwrite existing assets unless the user asked for replacement.
8. Report the final saved path(s) and the prompt(s) used.

## Transparent backgrounds

Stay on the built-in `image_gen` tool first: prompt for a flat solid chroma-key background and remove it locally with `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`. Only switch to the CLI fallback (`gpt-image-1.5 --background transparent --output-format png`) after the user explicitly confirms — `gpt-image-2` does not support `background=transparent`.

## Reference

Full prompting guidance, decision tree, transparent-image workflow, and CLI fallback live in the bundled system skill: `imagegen` (installed at `$CODEX_HOME/skills/.system/imagegen/SKILL.md`). Follow it for anything not covered above.
