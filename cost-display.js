// == TypingMind Extension: OpenRouter per-message cost display ================
// Intercepts streaming responses to capture usage/cost data from OpenRouter
// and displays it inline after each assistant message.
// v0.1 - 2026-03-28
(() => {
  const PREFIX = '[cost-display]';
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);

  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const TITLE_GEN_MARKER = '[[tm-title-gen]]';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (input instanceof Request) return input.url;
    return '';
  }

  function isChatCompletionRequest(input) {
    return CHAT_COMPLETIONS_URL_PATTERN.test(getRequestUrl(input));
  }

  function isLikelyTitleGenerationRequest(bodyText) {
    try {
      const body = JSON.parse(bodyText);
      if (!body.messages || !Array.isArray(body.messages)) return false;
      return body.messages.some((m) => {
        if (typeof m.content === 'string') return m.content.includes(TITLE_GEN_MARKER);
        if (Array.isArray(m.content)) {
          return m.content.some(
            (p) => typeof p.text === 'string' && p.text.includes(TITLE_GEN_MARKER)
          );
        }
        return false;
      });
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Request patching: inject usage: { include: true }
  // ---------------------------------------------------------------------------

  function patchRequestBody(bodyText) {
    try {
      const body = JSON.parse(bodyText);
      body.usage = { include: true };
      return JSON.stringify(body);
    } catch {
      return bodyText;
    }
  }

  // ---------------------------------------------------------------------------
  // SSE stream parser — wraps a ReadableStream, passes bytes through unchanged,
  // and calls onUsage(data) when the usage chunk is found.
  // ---------------------------------------------------------------------------

  function wrapStreamForUsage(readableStream, onUsage) {
    let lineBuf = '';
    let chunkCount = 0;

    const transform = new TransformStream({
      transform(chunk, controller) {
        // Always pass through unchanged
        controller.enqueue(chunk);
        chunkCount++;

        // Also parse for usage data
        try {
          const text = new TextDecoder().decode(chunk, { stream: true });
          if (chunkCount <= 2) log('stream chunk #' + chunkCount + ' (first 200):', text.slice(0, 200));
          lineBuf += text;

          // Process complete lines
          const lines = lineBuf.split('\n');
          // Keep the last (possibly incomplete) line in the buffer
          lineBuf = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

            const json = trimmed.slice(6); // strip 'data: '
            try {
              const parsed = JSON.parse(json);
              // Usage chunk: choices is empty array, usage object present
              if (parsed.usage && typeof parsed.usage === 'object') {
                log('found usage in chunk:', JSON.stringify(parsed.usage));
                onUsage(parsed);
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        } catch {
          // Decode error, skip
        }
      },

      flush(controller) {
        // Process any remaining data in buffer
        if (lineBuf.trim()) {
          const trimmed = lineBuf.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.usage && typeof parsed.usage === 'object') {
                log('found usage in chunk:', JSON.stringify(parsed.usage));
                onUsage(parsed);
              }
            } catch {
              // skip
            }
          }
        }
        lineBuf = '';
      }
    });

    return readableStream.pipeThrough(transform);
  }

  // ---------------------------------------------------------------------------
  // UI: inject cost label after the last assistant message
  // ---------------------------------------------------------------------------

  function formatCost(cost) {
    if (cost == null) return null;
    if (cost < 0.0001) return `$${(cost * 100).toFixed(4)}¢`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  }

  function formatTokens(n) {
    if (n == null) return null;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function buildCostLabel(usage, model, provider) {
    const parts = [];

    if (usage.cost != null) {
      parts.push(formatCost(usage.cost));
    }

    const prompt = usage.prompt_tokens;
    const completion = usage.completion_tokens;
    if (prompt != null || completion != null) {
      const p = formatTokens(prompt) || '?';
      const c = formatTokens(completion) || '?';
      parts.push(`${p} → ${c}`);
    }

    if (provider) {
      parts.push(provider);
    }

    return parts.join(' · ');
  }

  function injectCostLabel(text) {
    // Find the last assistant message container in the chat
    // TypingMind uses data-element-id="ai-response" for assistant messages
    const responses = document.querySelectorAll('[data-element-id="ai-response"]');
    if (responses.length === 0) {
      log('no ai-response elements found, retrying...');
      return false;
    }

    const lastResponse = responses[responses.length - 1];

    // Don't double-inject
    if (lastResponse.querySelector('[data-tm-cost-label]')) {
      const existing = lastResponse.querySelector('[data-tm-cost-label]');
      existing.textContent = text;
      return true;
    }

    const label = document.createElement('div');
    label.setAttribute('data-tm-cost-label', 'true');
    label.textContent = text;
    label.style.cssText = [
      'font-size: 11px',
      'color: #8899a6',
      'margin-top: 4px',
      'padding: 2px 0',
      'font-family: ui-monospace, monospace',
      'opacity: 0.8',
      'user-select: all'
    ].join(';');

    lastResponse.appendChild(label);
    return true;
  }

  function showUsage(parsed) {
    const usage = parsed.usage;
    const model = parsed.model || '';
    const provider = parsed.provider || '';

    const text = buildCostLabel(usage, model, provider);
    if (!text) return;

    log('usage:', usage, 'model:', model, 'provider:', provider);

    // Retry a few times since the DOM may not be fully updated yet
    let attempts = 0;
    const tryInject = () => {
      if (injectCostLabel(text)) return;
      if (++attempts < 10) {
        setTimeout(tryInject, 300);
      }
    };
    // Small delay to let TypingMind finish rendering the message
    setTimeout(tryInject, 200);
  }

  // ---------------------------------------------------------------------------
  // Fetch interception
  // ---------------------------------------------------------------------------

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init) {
    const nextInit = init ? { ...init } : init;

    const shouldPatch =
      isChatCompletionRequest(input) &&
      nextInit &&
      typeof nextInit.body === 'string' &&
      !isLikelyTitleGenerationRequest(nextInit.body);

    if (!shouldPatch) {
      return nativeFetch(input, nextInit);
    }

    // Inject usage: { include: true } into request
    nextInit.body = patchRequestBody(nextInit.body);
    log('patched request, url:', getRequestUrl(input));

    const response = await nativeFetch(input, nextInit);

    log(
      'response ok:', response.ok,
      'status:', response.status,
      'has body:', !!response.body,
      'content-type:', response.headers.get('content-type')
    );

    if (!response.body || !response.ok) {
      return response;
    }

    // Wrap the body to intercept usage chunk (works for both streaming and non-streaming)
    try {
      const wrappedBody = wrapStreamForUsage(response.body, (parsed) => {
        showUsage(parsed);
      });

      return new Response(wrappedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (err) {
      warn('failed to wrap stream:', err);
      return response;
    }
  };

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  log('extension loaded');
})();
