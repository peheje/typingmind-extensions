# TypingMind Extensions for OpenRouter

A collection of single-file TypingMind extensions that expose OpenRouter API features not available in the TypingMind UI.

## Why these exist

TypingMind sends requests to an OpenRouter-compatible endpoint but only exposes a subset of what the API supports. These extensions intercept outgoing `fetch` calls to `/chat/completions` and inject extra fields into the JSON body before the request leaves the browser. No backend, no build step, no dependencies.

## How they work

Every request-patching extension follows the same pattern:

1. **Monkey-patch `window.fetch`** at load time, capturing the native function.
2. **Match requests** whose URL contains `/chat/completions`.
3. **Parse `init.body` as JSON**, inject the relevant field, re-serialize.
4. **Forward to the real `fetch`**.

UI buttons are injected into the DOM by observing mutations on `document.body` and inserting next to TypingMind's built-in action buttons (thinking, knowledge base, etc.). State is persisted in `localStorage`.

All request-patching extensions skip modifications when the request body contains a `[[tm-title-gen]]` marker, so TypingMind's title-generation requests are never affected. Add this to your title prompt to opt in:

```
[[tm-title-gen]] Generate a short and relevant title for this chat based on the user message.
```

## Extensions

### `search-mode-toggle.js` -- Web Search

Adds a `plugins` array with `{ id: "web" }` to the request body, optionally specifying engine (`exa`, `parallel`) and `max_results`.

**Why this works:** OpenRouter's chat completions API accepts a [`plugins`](https://openrouter.ai/docs/features/web-search) field. When `{ id: "web" }` is present, OpenRouter runs a web search and injects the results into the model's context before generating a response. The extension simply adds this field -- OpenRouter does the rest.

**Modes:** off / once (auto-clears after one message) / pinned (stays on). Right-click or long-press for a settings popup to choose engine and max results count.

**Shortcut:** `Alt+S` toggle, `Alt+E` cycle engine.

### `prompt-cache-toggle.js` -- Prompt Caching

Adds `cache_control: { type: "ephemeral" }` (standard) or `cache_control: { type: "ephemeral", ttl: "1h" }` (extended) to the request body.

**Why this works:** OpenRouter forwards `cache_control` to providers that support prompt caching (Anthropic, Google, etc.). When the same prefix is sent again within the TTL, cached tokens are billed at a reduced rate. The standard mode uses the provider's default TTL; extended requests a 1-hour window.

**Modes:** cycles through standard (provider default TTL) / extended (1h TTL) / off.

**Shortcut:** `Alt+C`.

### `reasoning-effort-toggle.js` -- Reasoning Effort

Adds `reasoning: { effort: "<level>" }` to the request body.

**Why this works:** OpenRouter passes the `reasoning` field through to models that support configurable thinking effort (OpenAI o-series, Claude with extended thinking, etc.). Setting effort to `low` or `none` reduces thinking tokens and therefore cost/latency; `high` or `xhigh` lets the model think longer for harder problems.

**Modes:** cycles through auto / none / minimal / low / medium / high / xhigh.

**Shortcut:** `Alt+R`.

### `temperature-toggle.js` -- Temperature

Adds `temperature: <value>` to the request body.

**Why this works:** The `temperature` field is part of the standard OpenAI chat completions spec and OpenRouter forwards it to all providers. TypingMind lets you set temperature per-model in settings, but this extension gives a quick toggle without leaving the chat.

**Modes:** cycles through off (model default) / 0.0 / 0.3 / 0.7 / 1.0.

**Shortcut:** `Alt+T`.

### `cost-display.js` -- Per-Chat Cost Tracking

Injects `session_id` (set to TypingMind's chat hash ID) into every request body. Adds a `$` button in the header that links directly to that session's log page on OpenRouter.

**Why this works:** OpenRouter's API accepts a `session_id` field and groups all requests with the same ID together in its [activity logs](https://openrouter.ai/logs). By using TM's chat ID as the session ID, every message in a conversation is automatically grouped, giving per-chat cost breakdowns without any client-side accounting.

### `model-name-visibility.js` -- Model Name Visibility

Pure DOM extension (no request patching). Forces the model-selector button's label to always be visible, including on mobile where TypingMind hides it. Also hides the regenerate and "list more" buttons to reclaim space.

**Why this works:** TypingMind applies `hidden` / `truncate` CSS classes to the model name span and shows action buttons that take up toolbar space. This extension removes those classes via a MutationObserver so the name stays readable at all breakpoints.

### `draft-restore/restore-draft.js` -- Draft Restore

Saves the chat textarea contents to `localStorage` on every input and restores it when a new empty textarea appears.

**Why this works:** TypingMind persists drafts for existing chats (chats that already have messages) but not for fresh/new chats. This extension fills that gap. It saves on every keystroke (debounced) and only restores into an empty textarea, so it never fights TypingMind's own draft system.

## Install

1. Host the `.js` file at a public URL (e.g. jsDelivr pinned to a commit SHA).
2. In TypingMind go to **Preferences > Advanced Settings > Extensions**.
3. Paste the URL and install.
4. Restart TypingMind.

Each extension is independent -- install any combination.

## Notes

- TypingMind loads extensions once at startup.
- If the app becomes unusable, open TypingMind with `?safe_mode=1` to disable extensions temporarily.
- No build step; the hosted JavaScript file is the extension.
