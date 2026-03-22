# TypingMind Extension: OpenRouter Web Search Toggle

This repo contains a single-file TypingMind Extension script that adds a toggle for OpenRouter web search.

When enabled, the extension rewrites the outgoing chat completion request model slug to append `:online`.

Example:

- `openai/gpt-5.2` -> `openai/gpt-5.2:online`
- `openai/gpt-oss-20b:free` -> `openai/gpt-oss-20b:free:online`

## Install as a TypingMind Extension

1. Host `search-mode-toggle.js` at a public URL.
2. Make sure the file is served with `application/javascript` or `text/javascript` and allows TypingMind to fetch it with CORS.
3. In TypingMind, go to `Preferences -> Advanced Settings -> Extensions`.
4. Paste the script URL and install it.
5. Restart TypingMind.

The extension stores its toggle state locally and adds a `Web Search: ON/OFF` button in the app UI. It also supports the `Alt+S` shortcut.

## Notes

- TypingMind loads extensions once when the app starts.
- If the app becomes unusable, open TypingMind with `?safe_mode=1` to disable extensions temporarily.
- This project does not use a build step; the hosted JavaScript file is the extension.
