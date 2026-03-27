# Extension Ideas

Ideas for new TypingMind extensions that expose OpenRouter features.

## Provider preferences toggle
OpenRouter supports `provider.order`, `provider.allow_fallbacks`, etc. Pin a preferred provider (e.g. Anthropic direct vs AWS Bedrock) or disable fallbacks when you notice quality/speed differences.

## Middle-out transforms
`transforms: ["middle-out"]` compresses long contexts to save tokens/cost. Toggle for when pasting large documents.

## Per-message cost display
Intercept OpenRouter responses and display token usage / cost per message inline. OpenRouter returns usage stats in the response body (`usage.prompt_tokens`, `usage.completion_tokens`).

## Max tokens quick toggle
Override `max_tokens` between presets (short/medium/long/unlimited) without changing model settings.

## Temperature preset toggle
Cycle between precise (0.0) / balanced (0.7) / creative (1.0). Same pattern as existing toggles.
