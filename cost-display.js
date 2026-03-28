// == TypingMind Extension: OpenRouter per-message cost display ================
// Intercepts streaming responses to capture usage/cost data from OpenRouter
// and displays it inline after each assistant message.
// Persists cost data in localStorage keyed by message UUID.
// v0.2 - 2026-03-28
(() => {
  const PREFIX = '[cost-display]';
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);

  const STORAGE_KEY = 'TM_costDisplayData';
  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const TITLE_GEN_MARKER = '[[tm-title-gen]]';

  // ---------------------------------------------------------------------------
  // Storage: { [messageUuid]: { cost, prompt_tokens, completion_tokens, model, provider } }
  // ---------------------------------------------------------------------------

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveEntry(uuid, data) {
    try {
      const store = loadStore();
      store[uuid] = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
      warn('storage write failed:', err);
    }
  }

  function getEntry(uuid) {
    return loadStore()[uuid] || null;
  }

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

    const transform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        try {
          const text = new TextDecoder().decode(chunk, { stream: true });
          lineBuf += text;

          const lines = lineBuf.split('\n');
          lineBuf = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.usage && typeof parsed.usage === 'object') {
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

      flush() {
        if (lineBuf.trim()) {
          const trimmed = lineBuf.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.usage && typeof parsed.usage === 'object') {
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
  // UI: inject cost labels
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

  function buildCostText(data) {
    const parts = [];

    if (data.cost != null) {
      parts.push(formatCost(data.cost));
    }

    if (data.prompt_tokens != null || data.completion_tokens != null) {
      const p = formatTokens(data.prompt_tokens) || '?';
      const c = formatTokens(data.completion_tokens) || '?';
      parts.push(`${p} → ${c}`);
    }

    if (data.provider) {
      parts.push(data.provider);
    }

    return parts.join(' · ');
  }

  const LABEL_STYLE = [
    'font-size: 11px',
    'color: #8899a6',
    'margin-top: 4px',
    'padding: 2px 0',
    'font-family: ui-monospace, monospace',
    'opacity: 0.8',
    'user-select: all'
  ].join(';');

  function injectLabelForElement(el, text) {
    if (el.querySelector('[data-tm-cost-label]')) {
      el.querySelector('[data-tm-cost-label]').textContent = text;
      return;
    }

    const label = document.createElement('div');
    label.setAttribute('data-tm-cost-label', 'true');
    label.textContent = text;
    label.style.cssText = LABEL_STYLE;
    el.appendChild(label);
  }

  // Restore labels for all visible ai-response elements that have stored data
  function restoreAllLabels() {
    const store = loadStore();
    const responses = document.querySelectorAll('[data-element-id="ai-response"][data-message-uuid]');
    for (const el of responses) {
      if (el.querySelector('[data-tm-cost-label]')) continue; // already has label
      const uuid = el.getAttribute('data-message-uuid');
      const data = store[uuid];
      if (data) {
        const text = buildCostText(data);
        if (text) injectLabelForElement(el, text);
      }
    }
    updateChatTotal();
  }

  // ---------------------------------------------------------------------------
  // Chat total: sum costs of all messages visible in the current chat
  // ---------------------------------------------------------------------------

  const TOTAL_ID = 'tm-cost-chat-total';

  function updateChatTotal() {
    const store = loadStore();
    const responses = document.querySelectorAll('[data-element-id="ai-response"][data-message-uuid]');
    let totalCost = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    let count = 0;

    for (const el of responses) {
      const uuid = el.getAttribute('data-message-uuid');
      const data = store[uuid];
      if (data) {
        if (data.cost != null) totalCost += data.cost;
        if (data.prompt_tokens != null) totalPrompt += data.prompt_tokens;
        if (data.completion_tokens != null) totalCompletion += data.completion_tokens;
        count++;
      }
    }

    // Find the chat date info bar to insert after
    const dateInfo = document.querySelector('[data-element-id="chat-date-info"]');
    let container = document.getElementById(TOTAL_ID);

    if (count === 0) {
      if (container) container.remove();
      return;
    }

    const parts = [];
    parts.push(`Chat total: ${formatCost(totalCost)}`);
    parts.push(`${formatTokens(totalPrompt)} → ${formatTokens(totalCompletion)}`);
    parts.push(`${count} messages`);
    const text = parts.join(' · ');

    if (container) {
      container.textContent = text;
      return;
    }

    if (!dateInfo) return;

    container = document.createElement('div');
    container.id = TOTAL_ID;
    container.textContent = text;
    container.style.cssText = [
      'font-size: 11px',
      'color: #8899a6',
      'text-align: center',
      'padding: 2px 0 6px',
      'font-family: ui-monospace, monospace',
      'opacity: 0.8',
      'user-select: all',
      'max-width: 750px',
      'margin: 0 auto'
    ].join(';');

    dateInfo.insertAdjacentElement('afterend', container);
  }

  // Inject label on the last ai-response (used right after a response finishes)
  function injectCostLabelOnLast(text) {
    const responses = document.querySelectorAll('[data-element-id="ai-response"]');
    if (responses.length === 0) return false;
    const lastResponse = responses[responses.length - 1];
    injectLabelForElement(lastResponse, text);
    return true;
  }

  function showUsage(parsed) {
    const usage = parsed.usage;
    const model = parsed.model || '';
    const provider = parsed.provider || '';

    const data = {
      cost: usage.cost,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      model,
      provider
    };

    const text = buildCostText(data);
    if (!text) return;

    log('usage:', data);

    // Inject into DOM with retries (DOM may not be ready yet)
    let attempts = 0;
    const tryInject = () => {
      if (injectCostLabelOnLast(text)) {
        // Now find the UUID from the element we just injected into, and persist
        const responses = document.querySelectorAll('[data-element-id="ai-response"]');
        const lastResponse = responses[responses.length - 1];
        if (lastResponse) {
          const uuid = lastResponse.getAttribute('data-message-uuid');
          if (uuid) {
            saveEntry(uuid, data);
            log('saved cost for message', uuid);
            updateChatTotal();
          }
        }
        return;
      }
      if (++attempts < 10) {
        setTimeout(tryInject, 300);
      }
    };
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

    nextInit.body = patchRequestBody(nextInit.body);
    const response = await nativeFetch(input, nextInit);

    if (!response.body || !response.ok) {
      return response;
    }

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
  // DOM observer: restore labels when navigating between chats
  // ---------------------------------------------------------------------------

  let restoreTimer = null;
  const observer = new MutationObserver((mutations) => {
    // Ignore mutations caused by our own label injection
    const selfCaused = mutations.every((m) => {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && (
          node.hasAttribute?.('data-tm-cost-label') ||
          node.id === TOTAL_ID
        )) continue;
        return false;
      }
      return m.addedNodes.length > 0;
    });
    if (selfCaused) return;

    // Debounce to avoid hot loops
    if (restoreTimer) return;
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      restoreAllLabels();
    }, 500);
  });

  function start() {
    if (document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
      restoreAllLabels();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  log('extension loaded');
})();
