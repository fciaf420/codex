---
name: image-gen
description: Generate or edit raster images for the codex repo using Codex's built-in image_gen tool (gpt-image-2, also known as "image gen 2.0"). Use when the user asks for a bitmap asset such as a hero image, mockup, screenshot backdrop, illustration, sprite, marketing visual, or photorealistic render, and wants Codex to create a new image or edit an existing one in the workspace. Do not use for SVG/vector icons, code-native diagrams, or extending an existing vector asset system.
---

# /image-gen

Slash-command entry point for image generation in this repo. Wraps Codex's built-in `image_gen` tool (gpt-image-2, "image gen 2.0") and enforces the OpenAI Cookbook prompting guide on every call.

## Mandatory pre-flight (do this every time before calling `image_gen`)

1. **Load the prompting guide.** Read `references/openai-cookbook-prompting-guide.md` (mirrored from the [OpenAI Cookbook image gen prompting guide](https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb)). It is the authoritative playbook for this skill — every prompt you build must follow it.
2. **Identify the use case** from §4 (generate) or §5 (edit) of that guide — infographics, photorealism, logo, ads, comic strip, UI mockup, scientific/educational, slides/charts, style transfer, virtual try-on, sketch→render, product mockup, marketing creative, lighting/weather, object removal, person insertion, multi-image compositing, interior swap, holiday card mock, merch concept, or character-consistent storybook art.
3. **Apply the §2 Prompting Fundamentals** (also inlined below) to structure the prompt before calling the tool.
4. **Pick `quality` and `size` deliberately** using the §1.1 model parameters table.
5. **Restate invariants on every iteration of an edit** to prevent drift.

If you skip the pre-flight, you are not using this skill correctly — stop and re-read the guide.

## Prompting Fundamentals (always-loaded summary from §2 of the cookbook)

These are inlined here so they are guaranteed to be in context the moment `/image-gen` engages. The full guide in `references/openai-cookbook-prompting-guide.md` is the source of truth.

- **Structure + goal:** Order is scene/background → subject → key details → constraints. Always state the intended use (ad, UI mock, infographic) so the model picks the right "mode" and polish level. Use short labeled segments or line breaks for complex requests, not one long paragraph.
- **Prompt format:** Minimal prompts, descriptive paragraphs, JSON-like structures, instruction-style, or tag-based — pick the form that is easiest to maintain. Skimmable beats clever.
- **Specificity + quality cues:** Be concrete about materials, shapes, textures, and the visual medium (photo, watercolor, 3D render). Add "quality levers" (*film grain*, *textured brushstrokes*, *macro detail*) only when needed. For photorealism, include the literal word "photorealistic"; "real photograph", "taken on a real camera", "professional photography", or "iPhone photo" also help. Camera specs influence look but are interpreted loosely — do not rely on them for exact physical simulation.
- **Latency vs fidelity:** Start with `quality="low"` for latency-sensitive or high-volume work. Use `medium` or `high` for small/dense text, infographics, close-up portraits, identity-sensitive edits, and high-resolution outputs.
- **Composition:** Specify framing/viewpoint (close-up/wide/top-down), perspective (eye-level/low-angle), and lighting/mood (soft diffuse, golden hour, high-contrast). Call out placement when it matters ("logo top-right," "subject centered, negative space left"). For wide cinematic, low-light, rain, or neon scenes, add scale, atmosphere, and color so the model does not trade mood for surface realism.
- **People, pose, action:** Describe scale, body framing, gaze, and object interactions. Examples: "full body visible, feet included," "child-sized relative to the table," "looking down at the open book, not at the camera," "hands naturally gripping the handlebars."
- **Constraints (change vs preserve):** State exclusions ("no watermark", "no extra text", "no logos/trademarks") and invariants ("preserve identity / geometry / layout / brand elements"). For edits use "change only X" + "keep everything else the same," and **repeat the preserve-list on every iteration**. For surgical edits also forbid changes to saturation, contrast, layout, arrows, labels, camera angle, or surrounding objects.
- **Text in images:** Put literal text in **quotes** or **ALL CAPS**. Specify typography (font style, size, color, placement) as constraints. For tricky words, spell them letter-by-letter. Use `medium` or `high` quality for small text, dense info panels, and multi-font layouts.
- **Multi-image inputs:** Reference each by **index and description** ("Image 1: product photo… Image 2: style reference…") and describe how they interact ("apply Image 2's style to Image 1"). For compositing, be explicit about which elements move where.
- **Iterate, don't overload:** Start clean and refine with single-change follow-ups ("make lighting warmer," "remove the extra tree"). Use "same style as before" / "the subject" to leverage context, but re-specify critical details if they drift.

## Defaults for this repo

- Tool: built-in `image_gen` (backed by `gpt-image-2`). No `OPENAI_API_KEY` required.
- Drafts: `quality="low"`, `1024x1024`.
- Final assets: `quality="high"`, pick a size from the popular gpt-image-2 list — `1024x1024`, `1024x1536`, `1536x1024`, `2560x1440` (2K), `3840x2160` (4K, experimental — round down to `3824x2144` if max-edge is enforced strictly).
- One built-in `image_gen` call per requested asset or variant. Do not use `n` as a substitute for separate prompts.
- Square images render fastest; pick non-square only when the asset's intended use needs it.
- Never silently fall back to `gpt-image-1.5` or the CLI path. Ask first.

## Workflow

1. Confirm the request is for a raster asset (photo, illustration, mockup, sprite, hero, etc.) rather than something better produced as SVG/HTML/CSS/canvas. If it should match an existing repo-native vector system, stop and recommend editing those assets directly.
2. Run the **mandatory pre-flight** above.
3. Decide intent: `generate` (new image, possibly with reference images) or `edit` (transform an existing image while preserving parts of it).
4. For edits of a local file, load it with the built-in `view_image` tool first so it is visible in conversation context.
5. Build a structured prompt that follows §2 fundamentals and the relevant §4/§5/§6 use-case pattern from the cookbook guide.
6. Call the built-in `image_gen` tool. Issue one call per requested asset or variant.
7. Inspect each output and validate subject, style, composition, text accuracy, and any invariants/avoid items. Iterate with single-change follow-ups.
8. For project-bound assets, move or copy the final image into the workspace; never leave a project-referenced asset only at the default `$CODEX_HOME/generated_images/...` path. Do not overwrite existing assets unless the user asked for replacement.
9. Report the final saved path(s), the prompt(s) used, and the `quality`/`size` chosen.

## Transparent backgrounds

Stay on the built-in `image_gen` tool first: prompt for a flat solid chroma-key background and remove it locally with `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`. Only switch to the CLI fallback (`gpt-image-1.5 --background transparent --output-format png`) after the user explicitly confirms — `gpt-image-2` does not support `background=transparent`.

## References

- `references/openai-cookbook-prompting-guide.md` — full OpenAI Cookbook prompting guide (mirrored). **Read before every call.**
- Bundled system skill `imagegen` at `$CODEX_HOME/skills/.system/imagegen/SKILL.md` — full transparency workflow, CLI fallback, network setup. Consult for anything not covered above.
