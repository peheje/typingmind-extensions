# Lesson: The Brute-Force Trap vs. Thinking Outside the Box

## The Problem

We wanted per-chat cost tracking in TypingMind (TM) using OpenRouter as the API provider.

## The Hard Way (weeks of iteration)

We built a 600+ line extension that:

- Intercepted every API response to extract cost from `x-openrouter-cost` headers
- Accumulated costs in an in-memory counter per chat
- Synced totals to TM's IndexedDB (`keyval-store`) so costs survived page reloads
- Monkey-patched TM's native "About this chat" UI to display our numbers
- Tracked chat navigation via `hashchange` events and URL polling
- Handled edge cases: regenerated messages, cross-chat contamination, formatting precision

**Every fix created new bugs:**

1. Regeneration lost costs → switched to cumulative-only counter
2. Navigating chats overwrote costs → added per-chat ID tracking
3. `hashchange` events were unreliable → polled `window.location.hash` instead
4. Small costs rounded to `$0.0000` → used `toFixed(8)` with trailing-zero stripping
5. Patching TM's DOM hit both the text label AND a pie-chart badge SVG → destroyed the icon, showed doubled costs
6. TM re-rendered from its own IDB writes, fighting our patches in an endless loop

The fundamental issue: **we were fighting the host application's rendering and storage system**. Every layer of complexity added more surface area for bugs, and none of it synced across devices.

## The Easy Way (30 minutes)

OpenRouter already supports a `session_id` field on API requests. We:

1. Intercept `fetch` calls to `/chat/completions` (~20 lines)
2. Inject `session_id` set to TM's chat hash ID
3. Add a small `$` button linking to `openrouter.ai/logs?session_id=<chatId>`

Total: ~100 lines. Zero storage. Zero DOM patching. Zero sync issues.

**Result:** More accurate costs (OpenRouter's own accounting), automatic cross-device sync, zero maintenance, and a direct link to detailed per-request breakdowns.

## The Takeaway

Before building a complex system to replicate data that already exists somewhere else, ask: **can I just point to where the data already lives?**

The brute-force solution spent hundreds of lines recreating what OpenRouter already tracks natively. The simple solution just tags requests so the existing system groups them correctly.

Sometimes the best engineering is not writing code — it's realizing someone else already did.
