# Design Vision

Super Snake is **Snake × Lumines**: classic Snake mechanics wrapped in a slow-building, music-driven crescendo.

## Core directive

The game starts **slow and small**, then escalates. As the player advances, three things ramp together in lockstep:

1. **Speed** — the snake (and the world's tempo) gets faster.
2. **Camera** — pulls back, revealing more of the playfield.
3. **Music** — a new layer is added to the soundtrack each time the game steps up.

These three are the same beat. They should never drift apart — when one escalates, all three escalate. That synchronized step-up is the feel of the game.

## How to apply this

When evaluating any feature, mechanic, or polish work, ask: **does this support the slow→fast crescendo?** If a change would flatten the ramp, decouple speed/camera/music, or make the early game feel as busy as the late game, it's working against the core directive.

## Progressive reveal

Visual flourishes also live on the ramp. The interface itself "levels up" alongside speed, camera, and music — early levels are deliberately bare so later ones have room to grow. New effects (borders, shimmer, fireworks, banner flourishes, etc.) should be gated by level so they appear and stack as the game progresses, rather than all being live from the start.

Why staggered: a bare baseline makes each addition feel like an event. If every effect is live at level 1, there's no room for the game to grow into — and no contrast to make the late game feel like a different place.

When adding a new visual effect, pick a level for it to enter at. Don't enumerate the full stack here — that map lives in code and would drift out of sync if duplicated.
