# GPT Image Generation Models Prompting Guide

Mirrored from the OpenAI Cookbook: <https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb>

This file is the authoritative prompting playbook for the `/image-gen` skill. Read it before crafting any prompt for the built-in `image_gen` tool (gpt-image-2, "image gen 2.0").

## 1. Introduction

OpenAI's gpt-image generation models are designed for production-quality visuals and highly controllable creative workflows. They are well-suited for both professional design tasks and iterative content creation, and support both high-quality rendering and lower-latency use cases.

Key capabilities:

- High-fidelity photorealism with natural lighting, accurate materials, rich color rendering.
- Flexible quality–latency tradeoffs (faster generation at lower settings while still exceeding prior-generation quality).
- Robust facial and identity preservation for edits, character consistency, and multi-step workflows.
- Reliable text rendering with crisp lettering, consistent layout, strong contrast.
- Complex structured visuals: infographics, diagrams, multi-panel compositions.
- Precise style control and style transfer with minimal prompting.
- Strong real-world knowledge and reasoning for accurate depictions of objects, environments, scenarios.

`gpt-image-2` is OpenAI's most capable image model. The `low` quality setting is especially strong for latency-sensitive use cases; `medium` and `high` are the right fit when maximum fidelity matters.

## 1.1 Model parameters

| Model | `outputQuality` | `input_fidelity` | Resolutions | Recommended use |
| --- | --- | --- | --- | --- |
| `gpt-image-2` | `low`, `medium`, `high` | Disabled (already high fidelity by default) | Any size meeting constraints below | Default for new builds. Highest-quality generation/editing, text-heavy images, photorealism, compositing, identity-sensitive edits. |
| `gpt-image-1.5` | `low`, `medium`, `high` | `low`, `high` | `1024x1024`, `1024x1536`, `1536x1024`, `auto` | Backward compatibility during migration. |
| `gpt-image-1` | `low`, `medium`, `high` | `low`, `high` | `1024x1024`, `1024x1536`, `1536x1024`, `auto` | Legacy compatibility only. |
| `gpt-image-1-mini` | `low`, `medium`, `high` | `low`, `high` | `1024x1024`, `1024x1536`, `1536x1024`, `auto` | Cost/throughput-optimized: large batches, ideation, previews, drafts. |

### `gpt-image-2` size constraints

`gpt-image-2` accepts any `size` that satisfies all of:

- Max edge length `< 3840px`
- Both edges multiples of `16`
- Long-to-short ratio `<= 3:1`
- Total pixels `<= 8,294,400`
- Total pixels `>= 655,360`

Anything above `2560x1440` (~3.7M px, "2K") is experimental — results vary more.

### Popular `gpt-image-2` sizes

| Label | Resolution | Notes |
| --- | --- | --- |
| HD portrait | `1024x1536` | Standard portrait |
| HD landscape | `1536x1024` | Standard landscape |
| Square | `1024x1024` | Good general-purpose default |
| 2K / QHD | `2560x1440` | Recommended upper reliability boundary |
| 4K / UHD | `3840x2160` | Experimental upper end. If max-edge is enforced strictly as `< 3840`, round down (e.g. `3824x2144`). |

### When to use which model

- Choose `gpt-image-2` as the default for production. Strongest model overall and the right upgrade target.
- Choose `gpt-image-2` with `quality=low` when speed and unit economics dominate. Often as good as `gpt-image-1-mini` on the same workload.
- Keep `gpt-image-1.5` / `gpt-image-1` only for backward compatibility while validating prompt migrations.

### Upgrade path from `gpt-image-1.5` / `gpt-image-1`

- Upgrade to `gpt-image-2` for customer-facing assets, photorealism, edit-heavy flows, brand-sensitive creative, in-image text, or any workflow where better first-pass quality reduces manual review.
- Consider `gpt-image-1-mini` over legacy models only when minimizing cost on large batches of low-stakes images.
- Keep prompts mostly the same at first, retune after comparing quality/latency/retries on real workload.

## 2. Prompting Fundamentals

These fundamentals apply to every GPT image generation call. Follow them before considering any use-case-specific pattern below.

- **Structure + goal:** Write prompts in a consistent order (background/scene → subject → key details → constraints) and include the intended use (ad, UI mock, infographic) to set the "mode" and level of polish. For complex requests, use short labeled segments or line breaks rather than one long paragraph.
- **Prompt format:** Use whatever is easiest to maintain — minimal prompts, descriptive paragraphs, JSON-like structures, instruction-style, or tag-based — as long as intent and constraints are clear. Prioritize a skimmable template over clever prompt syntax.
- **Specificity + quality cues:** Be concrete about materials, shapes, textures, and the visual medium (photo, watercolor, 3D render). Add targeted "quality levers" only when needed (*film grain*, *textured brushstrokes*, *macro detail*). For photorealism, include the word "photorealistic" directly. Phrases like "real photograph," "taken on a real camera," "professional photography," or "iPhone photo" help. Camera specs are interpreted loosely — use them for high-level look, not exact physical simulation.
- **Latency vs fidelity:** For latency-sensitive or high-volume work, start with `quality="low"`. For small/dense text, detailed infographics, close-up portraits, identity-sensitive edits, and high-resolution outputs, compare `medium` or `high` before shipping.
- **Composition:** Specify framing/viewpoint (close-up, wide, top-down), perspective/angle (eye-level, low-angle), and lighting/mood (soft diffuse, golden hour, high-contrast). If layout matters, call out placement ("logo top-right," "subject centered with negative space on left"). For wide, cinematic, low-light, rain, or neon scenes, add extra detail about scale, atmosphere, and color so the model does not trade mood for surface realism.
- **People, pose, action:** Describe scale, body framing, gaze, and object interactions. Examples: "full body visible, feet included," "child-sized relative to the table," "looking down at the open book, not at the camera," "hands naturally gripping the handlebars." This helps body proportion, action geometry, and gaze alignment.
- **Constraints (change vs preserve):** State exclusions and invariants explicitly ("no watermark," "no extra text," "no logos/trademarks," "preserve identity/geometry/layout/brand elements"). For edits, use "change only X" + "keep everything else the same," and repeat the preserve list on each iteration to reduce drift. For surgical edits, also forbid changes to saturation, contrast, layout, arrows, labels, camera angle, or surrounding objects.
- **Text in images:** Put literal text in **quotes** or **ALL CAPS** and specify typography (font style, size, color, placement) as constraints. For tricky words, spell letter-by-letter to improve character accuracy. Use `medium` or `high` quality for small text, dense info panels, and multi-font layouts.
- **Multi-image inputs:** Reference each input by **index and description** ("Image 1: product photo… Image 2: style reference…") and describe how they interact ("apply Image 2's style to Image 1"). When compositing, be explicit about which elements move where.
- **Iterate, don't overload:** Long prompts can work, but debugging is easier when starting with a clean base prompt and refining with small, single-change follow-ups ("make lighting warmer," "remove the extra tree"). Use references like "same style as before" to leverage context, but re-specify critical details if they drift.

## 4. Use cases — Generate (text → image)

### 4.1 Infographics

Use for explainers, posters, labeled diagrams, timelines, "visual wiki" assets. For dense layouts or heavy in-image text, use `quality="high"`.

### 4.2 Translation in images

For localizing existing designs (ads, UI screenshots, packaging, infographics) into another language without rebuilding the layout. Preserve everything except the text — keep typography, placement, spacing, hierarchy consistent. Translate verbatim and accurately, no extra words, no reflow unless necessary, no edits to logos/icons/imagery.

### 4.3 Photorealistic images that feel "natural"

Prompt as if a real photo is being captured in the moment. Use photography language (lens, lighting, framing) and explicitly ask for real texture (pores, wrinkles, fabric wear, imperfections). Avoid words that imply studio polish or staging. Set `quality="high"` when detail matters.

### 4.4 World knowledge

Models pair strong reasoning with world knowledge. Asking for a scene set in "Bethel, New York in August 1969" can correctly infer Woodstock and produce an accurate image without being told. Use this — give a specific place/time and let the model fill the cultural detail.

### 4.5 Logo generation

Strong logo generation comes from clear brand constraints and simplicity. Describe the brand's personality and use case, then ask for a clean, original mark with strong shape, balanced negative space, and scalability across sizes. Use the `n` parameter to request multiple variations.

### 4.6 Ads generation

Write prompts like a creative brief, not a technical image spec. Describe brand, audience, culture, concept, composition, and exact copy. Include brand positioning, desired vibe, target audience, scene, and tagline together. If text must appear, quote it exactly and ask for clean, legible typography.

### 4.7 Story → comic strip

Define the narrative as a sequence of clear visual beats, one per panel. Keep descriptions concrete and action-focused so the model can translate the story into readable, well-paced panels.

### 4.8 UI mockups

Describe the product as if it already exists. Focus on layout, hierarchy, spacing, and real interface elements. Avoid concept-art language so the result looks like a usable, shipped interface rather than a design sketch.

### 4.9 Scientific / educational visuals

Prompt like an instructional design brief: define audience, lesson objective, visual format, required labels, and scientific constraints. Ask for a clean, flat visual system with consistent icons, clear arrows, readable labels, and white space. List required components explicitly and say what should not be included. Use `quality="high"` for dense labels or assets going into slides/courses.

### 4.10 Slides, diagrams, charts, productivity images

Write the prompt like an artifact spec, not an illustration request. Name the exact deliverable (slide, workflow diagram, chart, page image), define the canvas and hierarchy, provide the real text or data, and describe the visual language. Include practical constraints: readable typography, polished spacing, no decorative clutter, no generic stock-photo treatment. Include numbers and labels directly. Use a landscape size for deck-style outputs and `quality="high"` for small text, legends, axes, footnotes.

## 5. Use cases — Edit (text + image → image)

### 5.1 Style transfer

Keep the *visual language* of a reference (palette, texture, brushwork, film grain) while changing the subject or scene. Describe what must stay consistent (style cues) and what must change (new content). Add hard constraints like background, framing, and "no extra elements" to prevent drift.

### 5.2 Virtual clothing try-on

Lock the person (face, body shape, pose, hair, expression) and allow changes only to garments. Require realistic fit (draping, folds, occlusion) and consistent lighting/shadows so the outfit looks naturally worn, not pasted on.

### 5.3 Drawing → image (rendering)

Treat the prompt like a spec: preserve layout and perspective, then add realism by specifying plausible materials, lighting, and environment. Include "do not add new elements/text" to avoid creative reinterpretations.

### 5.4 Product mockups (clean background + label integrity)

Edge quality (clean silhouette, no fringing/halos) and label integrity (text stays sharp and unchanged) drive success. With `gpt-image-2`, keep the output background opaque and use a downstream background-removal step for a final transparent asset. For realism without re-styling, ask for light polishing and optionally a subtle contact shadow on a plain background.

### 5.5 Marketing creatives with real in-image text

Put exact copy in quotes, demand verbatim rendering (no extra characters), describe placement and font style. If text fidelity is imperfect, keep the prompt strict and iterate — small wording/layout tweaks usually improve legibility.

### 5.6 Lighting and weather transformation

Change only environmental conditions — lighting direction/quality, shadows, atmosphere, precipitation, ground wetness — while preserving identity, geometry, camera angle, and object placement so it still reads as the same original photo.

### 5.7 Object removal

Anchor realism by specifying a grounded photographic look (natural lighting, believable detail, no cinematic grading), and lock what must not change about the subject. Higher input fidelity helps maintain likeness during larger scene edits.

### 5.8 Insert person into a scene

Same principles as object removal: grounded photographic look, lock identity. Be explicit about placement, lighting match, scale, and shadow direction.

### 5.9 Multi-image referencing and compositing

Clearly specify what to transplant ("the dog from Image 2"), where it goes ("right next to the woman in Image 1"), and what must remain unchanged (scene, background, framing). Match lighting, perspective, scale, and shadows so the composite looks naturally captured.

## 6. Additional high-value use cases

### 6.1 Interior design "swap" (precision edits)

Surgical realism: swap a single object while preserving camera angle, lighting, shadows, and surrounding context so the edit looks like a real photograph, not a redesign.

### 6.2 3D pop-up holiday card (product-style mock)

Emphasize tactile realism — paper layers, fibers, folds, soft studio lighting — so the result reads as a photographed physical product rather than a flat illustration.

### 6.3 Collectible action figure / plush keychain (merch concept)

Premium product photography cues (materials, packaging, print clarity) while keeping designs original and non-infringing. Useful for testing multiple character or packaging variants quickly.

### 6.4 Children's book art with character consistency (multi-image workflow)

Two-step pattern:

1. **Character anchor** — establish a reusable main character. Lock appearance, proportions, outfit, tone.
2. **Story continuation** — reuse character, advance the narrative. Same character, new scene + action; appearance must remain unchanged.

## Summary checklist

Before every `image_gen` call:

1. Write the prompt in order: scene → subject → details → constraints, with intended use stated.
2. State invariants (what must not change) and exclusions ("no watermark", "no extra text", etc.).
3. Pick `quality`: `low` for drafts/high-volume, `medium`/`high` for text-heavy, photorealistic, identity-sensitive, or final assets.
4. Pick a `size` from the popular gpt-image-2 sizes that fits the asset's intended use.
5. For edits, repeat the preserve-list on every iteration; for variants, issue one call per asset.
6. For in-image text, quote it exactly and specify typography.
7. For multi-image inputs, label each by index and describe how they interact.
8. Iterate with single-change follow-ups; do not overload prompts.
