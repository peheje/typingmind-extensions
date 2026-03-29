// == TypingMind Extension: OpenRouter per-message cost display ================
// Intercepts streaming responses to capture usage/cost data from OpenRouter
// and displays it inline after each assistant message.
// Persists cost data in localStorage keyed by message UUID.
// v0.4 - 2026-03-29 - IDB tokenUsage hijack for native cost UI sync
(() => {
  const PREFIX = '[cost-display]';
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);

  const STORAGE_KEY = 'TM_costDisplayData';
  const LABELS_VISIBLE_KEY = 'TM_costDisplayShowLabels';
  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const TITLE_GEN_MARKER = '[[tm-title-gen]]';
  const TOP_BAR_BUTTON_ID = 'tm-cost-topbar-button';

  // IDB constants
  const IDB_DB_NAME = 'keyval-store';
  const IDB_STORE_NAME = 'keyval';
  const IDB_KEY_PREFIX = 'CHAT_';
  const SYNC_INTERVAL_MS = 800;
  const DEBUG_SYNC = true; // verbose sync logging, disable after stabilising

  const idbLog = (...args) => console.log(PREFIX, '[idb]', ...args);
  const idbWarn = (...args) => console.warn(PREFIX, '[idb]', ...args);

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
  // IDB sync — override TM's native tokenUsage with our accurate costs
  // ---------------------------------------------------------------------------

  let _db = null;

  function getCurrentChatId() {
    const hash = window.location.hash; // e.g. #chat=dapdPWzL8o
    const m = hash.match(/^#chat=(.+)$/);
    return m ? m[1] : '';
  }

  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB_NAME);
      req.onsuccess = () => {
        _db = req.result;
        _db.onclose = () => { _db = null; };
        _db.onerror = () => { _db = null; };
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Atomic read-modify-write: reads chat object, replaces tokenUsage, writes back.
   * Uses a single readwrite transaction to avoid race conditions with TM.
   * Returns true if written, false if chat not found.
   */
  async function writeChatTokenUsage(chatId, newTokenUsage) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      const key = IDB_KEY_PREFIX + chatId;

      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const raw = getReq.result;
        if (!raw) { resolve(false); return; }

        const wasString = typeof raw === 'string';
        let chatObj;
        try {
          chatObj = wasString ? JSON.parse(raw) : raw;
        } catch (err) {
          idbWarn('failed to parse chat object:', err);
          resolve(false);
          return;
        }

        chatObj.tokenUsage = newTokenUsage;

        const putReq = store.put(wasString ? JSON.stringify(chatObj) : chatObj, key);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Read tokenUsage from IDB for a chat. Returns { tokenUsage } or null.
   */
  async function readChatTokenUsage(chatId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const key = IDB_KEY_PREFIX + chatId;

      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const raw = getReq.result;
        if (!raw) { resolve(null); return; }
        try {
          const chatObj = typeof raw === 'string' ? JSON.parse(raw) : raw;
          resolve({ tokenUsage: chatObj.tokenUsage || null });
        } catch (err) {
          idbWarn('failed to parse chat object for read:', err);
          resolve(null);
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  /**
   * Core sync: compare our localStorage totals with IDB tokenUsage, overwrite if different.
   * If we have no localStorage data for this chat, we trust IDB (cross-device sync).
   */
  async function syncTokenUsage() {
    const chatId = getCurrentChatId();
    if (!chatId) return;

    try {
      const { totalCost, totalPrompt, totalCompletion, count } = computeChatTotal();

      // No local cost data → trust IDB (probably synced from another device)
      if (count === 0) {
        if (DEBUG_SYNC) idbLog('no local cost data, trusting IDB');
        return;
      }

      const idbData = await readChatTokenUsage(chatId);
      if (!idbData) {
        if (DEBUG_SYNC) idbLog('chat not found in IDB');
        return;
      }

      const existing = idbData.tokenUsage || {};
      const tmCost = existing.totalCostUSD ?? 0;

      // Already matches in IDB — but still patch the DOM span
      // (TM may have re-rendered from stale in-memory state)
      if (Math.abs(tmCost - totalCost) < 0.000001) {
        if (DEBUG_SYNC) idbLog('values match, skipping');
        patchNativeCostSpan(totalCost);
        return;
      }

      // Find last message cost for messageCostUSD
      const store = loadStore();
      const responses = document.querySelectorAll(
        '[data-element-id="ai-response"][data-message-uuid]'
      );
      let lastMsgCost = 0;
      let lastMsgTokens = 0;
      if (responses.length > 0) {
        const lastUuid = responses[responses.length - 1].getAttribute('data-message-uuid');
        const lastData = store[lastUuid];
        if (lastData) {
          lastMsgCost = lastData.cost || 0;
          lastMsgTokens = (lastData.prompt_tokens || 0) + (lastData.completion_tokens || 0);
        }
      }

      const newTokenUsage = {
        ...existing, // preserve fields we don't manage
        totalCostUSD: totalCost,
        messageCostUSD: lastMsgCost,
        totalTokens: totalPrompt + totalCompletion,
        messageTokens: lastMsgTokens,
      };

      const ok = await writeChatTokenUsage(chatId, newTokenUsage);
      if (ok) {
        idbLog(`synced: ${formatCost(tmCost)} → ${formatCost(totalCost)}`);
        // Also patch TM's native cost span so it updates without reload
        patchNativeCostSpan(totalCost);
      }
    } catch (err) {
      idbWarn('sync error:', err);
    }
  }

  /**
   * Directly mutate TM's native cost span in the DOM.
   * TM doesn't reactively read IDB changes, so we patch the span ourselves.
   */
  function patchNativeCostSpan(totalCost) {
    const aboutBtn = document.querySelector(
      '[data-tooltip-content="About this chat"]'
    );
    if (!aboutBtn) return;
    const span = aboutBtn.querySelector('span.text-xs');
    if (!span) return;
    const formatted = formatCost(totalCost);
    if (span.textContent !== formatted) {
      idbLog(`patched native span: ${span.textContent} → ${formatted}`);
      span.textContent = formatted;
    }
  }

  // Polling loop
  let _syncInterval = null;

  function startSyncLoop() {
    if (_syncInterval) return;
    _syncInterval = setInterval(syncTokenUsage, SYNC_INTERVAL_MS);
    idbLog('loop started');
  }

  function stopSyncLoop() {
    if (_syncInterval) {
      clearInterval(_syncInterval);
      _syncInterval = null;
      idbLog('loop stopped');
    }
  }

  function handleNavigation() {
    const chatId = getCurrentChatId();
    if (chatId) {
      startSyncLoop();
    } else {
      stopSyncLoop();
    }
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
    if (cost < 0.0001) return `${(cost * 100).toFixed(4)}¢`;
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

    // Find anchor: the "More actions" dropdown button in the top bar
    const moreActionsBtn = document.querySelector(
      '[data-element-id="current-chat-title"] [data-tooltip-content="More actions"]'
    );
    if (!moreActionsBtn) return;
    // The button is inside a wrapper div, insert before the wrapper
    const aboutBtn = moreActionsBtn.closest('div[data-headlessui-state]') || moreActionsBtn;
    if (!aboutBtn.parentElement) return;

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
            // Immediate IDB sync — don't wait for next poll cycle
            syncTokenUsage().catch(err => idbWarn('immediate sync failed:', err));
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

    const shouldIntercept =
      isChatCompletionRequest(input) &&
      nextInit &&
      typeof nextInit.body === 'string' &&
      !isLikelyTitleGenerationRequest(nextInit.body);

    if (!shouldIntercept) {
      return nativeFetch(input, nextInit);
    }

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

    // IDB sync: start/stop polling based on active chat
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    handleNavigation(); // initial check
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  log('extension loaded');
})();
