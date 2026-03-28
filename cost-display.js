// == TypingMind Extension: OpenRouter per-message cost display ================
// Intercepts streaming responses to capture usage/cost data from OpenRouter
// and displays it inline after each assistant message.
// Persists cost data in localStorage keyed by message UUID.
// v0.3 - 2026-03-28
(() => {
  const PREFIX = '[cost-display]';
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);

  const STORAGE_KEY = 'TM_costDisplayData';
  const LABELS_VISIBLE_KEY = 'TM_costDisplayShowLabels';
  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const TITLE_GEN_MARKER = '[[tm-title-gen]]';
  const TOP_BAR_BUTTON_ID = 'tm-cost-topbar-button';

  // ---------------------------------------------------------------------------
  // Storage
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

  function areLabelsVisible() {
    return localStorage.getItem(LABELS_VISIBLE_KEY) !== 'false';
  }

  function setLabelsVisible(visible) {
    localStorage.setItem(LABELS_VISIBLE_KEY, String(visible));
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
  // SSE stream parser
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
  // Formatting
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
    if (data.cost != null) parts.push(formatCost(data.cost));
    if (data.prompt_tokens != null || data.completion_tokens != null) {
      const p = formatTokens(data.prompt_tokens) || '?';
      const c = formatTokens(data.completion_tokens) || '?';
      parts.push(`${p} → ${c}`);
    }
    if (data.provider) parts.push(data.provider);
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------------------
  // Per-message labels
  // ---------------------------------------------------------------------------

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
    const visible = areLabelsVisible();
    const existing = el.querySelector('[data-tm-cost-label]');
    if (existing) {
      existing.textContent = text;
      existing.style.display = visible ? '' : 'none';
      return;
    }

    const label = document.createElement('div');
    label.setAttribute('data-tm-cost-label', 'true');
    label.textContent = text;
    label.style.cssText = LABEL_STYLE;
    if (!visible) label.style.display = 'none';
    el.appendChild(label);
  }

  function applyLabelVisibility() {
    const visible = areLabelsVisible();
    const labels = document.querySelectorAll('[data-tm-cost-label]');
    for (const label of labels) {
      label.style.display = visible ? '' : 'none';
    }
  }

  function restoreAllLabels() {
    const store = loadStore();
    const responses = document.querySelectorAll('[data-element-id="ai-response"][data-message-uuid]');
    for (const el of responses) {
      if (el.querySelector('[data-tm-cost-label]')) continue;
      const uuid = el.getAttribute('data-message-uuid');
      const data = store[uuid];
      if (data) {
        const text = buildCostText(data);
        if (text) injectLabelForElement(el, text);
      }
    }
    updateTopBarButton();
  }

  function injectCostLabelOnLast(text) {
    const responses = document.querySelectorAll('[data-element-id="ai-response"]');
    if (responses.length === 0) return false;
    injectLabelForElement(responses[responses.length - 1], text);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Top bar button: shows chat total, toggles per-message labels
  // ---------------------------------------------------------------------------

  function computeChatTotal() {
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

    return { totalCost, totalPrompt, totalCompletion, count };
  }

  function updateTopBarButton() {
    const { totalCost, totalPrompt, totalCompletion, count } = computeChatTotal();
    let btn = document.getElementById(TOP_BAR_BUTTON_ID);

    if (count === 0) {
      if (btn) btn.remove();
      return;
    }

    const costText = formatCost(totalCost) || '$0';
    const tooltip = [
      `Chat total: ${costText}`,
      `${formatTokens(totalPrompt)} → ${formatTokens(totalCompletion)}`,
      `${count} message${count !== 1 ? 's' : ''}`,
      areLabelsVisible() ? 'Click to hide per-message costs' : 'Click to show per-message costs'
    ].join(' · ');

    if (btn) {
      const span = btn.querySelector('span');
      if (span) span.textContent = costText;
      btn.setAttribute('data-tooltip-content', tooltip);
      btn.setAttribute('title', tooltip);
      btn.style.opacity = areLabelsVisible() ? '1' : '0.5';
      return;
    }

    // Find anchor: the "About this chat" button in the top bar
    const aboutBtn = document.querySelector(
      '[data-element-id="current-chat-title"] [data-tooltip-content="About this chat"]'
    );
    if (!aboutBtn) return;

    btn = document.createElement('button');
    btn.id = TOP_BAR_BUTTON_ID;
    btn.className = [
      'gap-2 h-9 w-auto px-2 rounded-lg',
      'text-slate-900 dark:text-white',
      'inline-flex items-center justify-center shrink-0 relative',
      'dark:hover:bg-white/20 dark:active:bg-white/25',
      'hover:bg-slate-900/20 active:bg-slate-900/25',
      'focus-visible:outline-offset-2 focus-visible:outline-slate-500',
      'transition-all'
    ].join(' ');
    btn.setAttribute('data-tooltip-id', 'global');
    btn.setAttribute('data-tooltip-content', tooltip);
    btn.setAttribute('title', tooltip);
    btn.style.opacity = areLabelsVisible() ? '1' : '0.5';

    const span = document.createElement('span');
    span.className = 'text-slate-500 dark:text-slate-400 text-xs font-normal';
    span.style.fontFamily = 'ui-monospace, monospace';
    span.textContent = costText;
    btn.appendChild(span);

    btn.addEventListener('click', () => {
      const nowVisible = !areLabelsVisible();
      setLabelsVisible(nowVisible);
      applyLabelVisibility();
      updateTopBarButton();
      log('labels', nowVisible ? 'shown' : 'hidden');
    });

    aboutBtn.insertAdjacentElement('beforebegin', btn);
  }

  // ---------------------------------------------------------------------------
  // showUsage: called when stream parser finds usage data
  // ---------------------------------------------------------------------------

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

    let attempts = 0;
    const tryInject = () => {
      if (injectCostLabelOnLast(text)) {
        const responses = document.querySelectorAll('[data-element-id="ai-response"]');
        const lastResponse = responses[responses.length - 1];
        if (lastResponse) {
          const uuid = lastResponse.getAttribute('data-message-uuid');
          if (uuid) {
            saveEntry(uuid, data);
            log('saved cost for message', uuid);
            updateTopBarButton();
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
    // Ignore mutations caused by our own elements
    const selfCaused = mutations.every((m) => {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && (
          node.hasAttribute?.('data-tm-cost-label') ||
          node.id === TOP_BAR_BUTTON_ID
        )) continue;
        return false;
      }
      return m.addedNodes.length > 0;
    });
    if (selfCaused) return;

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
