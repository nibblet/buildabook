# Partner Draft Context Design

## Goal

Improve the Partner AI drafting flow so prose generation is guided by the scene-level plan and enough manuscript context to continue coherently.

The Partner should know what the scene is meant to accomplish, what has already been drafted, and when an empty or early scene should pick up from the previous scene. The feature should not make authors manage prompt engineering while drafting.

## Current Behavior

The Partner side panel sends the author's typed prompt to `askPersona()` with the current `sceneId` and `chapterId`.

Server-side context currently includes:

- Project title, writing profile mission line, voice notes, tropes, and style samples.
- Compiled wiki docs for storyline, characters, world, relationships, and open threads.
- Current beat and chapter title.
- Current scene card fields: goal, conflict, outcome.
- Continuity facts when continuity extraction is enabled.

The Partner does not currently receive:

- Full current scene prose.
- A summary of the current scene prose.
- Previous-scene context.
- Scene blueprint fields.

## Design Principles

Partner drafting should be plan-first. The scene card is the primary source of intent, while prose-so-far is supporting context.

The current scene blueprint remains an author scratchpad. It should not be included in Partner context for this iteration because it is not currently used elsewhere in generation and may duplicate or conflict with scene card data.

The prompt should avoid full-scene context by default for medium or long scenes. Long raw prose can be expensive, distract the model from the scene plan, and over-anchor the response to local wording.

Previous-scene context should be lightweight and mostly automatic. Authors should not need to decide on every draft whether continuity context is needed.

## Recommended Context Shape

When Partner drafts prose for a scene, the system context should add a `DRAFT CONTEXT` section after the current scene card.

For the current scene:

- Include a compact prose-so-far block when the scene has meaningful content.
- Include a short trailing excerpt from the current scene so Partner can maintain tone, location, and immediate continuity.
- For very short scenes, the full current prose can be used as the prose-so-far block.
- The author prompt remains the explicit user instruction for what should happen next.

For the previous scene:

- If the current scene is empty or near-empty, include a compact `PREVIOUS SCENE CONTEXT` block by default.
- The block should include previous scene title, goal, conflict, outcome, and a trailing excerpt.
- If no previous scene exists, omit the block.
- A later UI control can expose this as "Use previous scene context", defaulting on only for empty or near-empty scenes. The first implementation can make this automatic without adding UI.

Scene blueprint:

- Do not include blueprint intent, reader takeaway, character shift, or research notes.
- Keep blueprint as a private planning scratchpad unless a future feature explicitly promotes it into generation context.

## Data Flow

`TeamPanel` continues to send `personaKey`, `userPrompt`, `sceneId`, and `chapterId` to `askPersona()`.

`askPersona()` loads the current scene as it does today, then builds Partner-specific draft context only when `personaKey === "partner"` and a `sceneId` is present.

The draft context builder should:

- Strip HTML from the current scene content.
- Compute current scene word count from plain text when needed.
- Excerpt prose so far.
- Locate the previous scene in manuscript order when the current scene is empty or near-empty.
- Return a plain text block suitable for `buildContext()` or a small appended system section.

`buildContext()` can either accept a new optional `draftContext` string or `askPersona()` can append the Partner-only draft section after `buildContext()`. A `draftContext` parameter is cleaner if inline assist may reuse the same mechanism later.

## Excerpt Strategy

For the first implementation, avoid adding a new model call just to summarize scene content.

Use deterministic context:

- If current scene plain text is short, include it as `CURRENT SCENE PROSE SO FAR`.
- If current scene plain text is long, include:
  - an opening excerpt,
  - a trailing excerpt,
  - and a simple note that middle prose is omitted.

This is predictable, cheap, and easier to test. A generated summary can be added later if raw excerpts prove insufficient.

Suggested thresholds:

- Empty or near-empty current scene: fewer than 120 words.
- Short scene: up to roughly 1,200 words, include full plain text.
- Longer scene: include first 350-500 words and last 600-900 words.
- Previous scene excerpt: use last 500-800 words, plus metadata.

Exact thresholds can be adjusted during implementation based on token budget and tests.

## Error Handling

If scene content cannot be loaded, Partner should still work with the existing scene card and project context.

If previous-scene lookup fails, omit previous-scene context rather than failing the request.

If HTML stripping produces empty text, treat the scene as empty.

The draft context should never include labels that ask the model to explain itself. Partner's existing directive still controls output: prose only, no headings or commentary.

## Testing

Add focused unit tests for the draft context builder:

- Empty current scene includes previous-scene metadata/excerpt when available.
- Near-empty current scene includes previous-scene context.
- Non-empty current scene includes current prose context and omits previous-scene context by default.
- Long current scene truncates to opening and trailing excerpts.
- Scene card goal/conflict/outcome remains available through existing context.
- Blueprint data is not included.

Add a server-action level test if practical to verify Partner appends draft context while other personas do not.

## Out of Scope

- Including scene blueprint in generation context.
- Adding a generated summary model call.
- Adding a full prompt preview UI.
- Changing inline assist behavior.
- Changing the Partner persona directive.
- Creating a broad memory/RAG system for previous scenes.

## Approval Notes

The agreed direction is to prioritize scene-level plan over exact cursor continuation. Partner should understand the plan and draft state, then respond to the author's prompt about what should happen next.
