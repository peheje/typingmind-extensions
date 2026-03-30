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
  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const TITLE_GEN_MARKER = '[[tm-title-gen]]';

  // IDB constants
  const IDB_DB_NAME = 'keyval-store';
  const IDB_STORE_NAME = 'keyval';
  const IDB_KEY_PREFIX = 'CHAT_';
  const SYNC_INTERVAL_MS = 800;
  const DEBUG_SYNC = true; // verbose sync logging, disable after stabilising

  const idbLog = (...args) => console.log(PREFIX, '[idb]', ...args);
  const idbWarn = (...args) => console.warn(PREFIX, '[idb]', ...args);

  // In-memory accumulator for the current chat's correct total.
  // Bootstrapped from IDB on chat open; only increases via showUsage().
  let _knownChatId = null;
  let _knownTotal = null;
  let _knownPrompt = 0;
  let _knownCompletion = 0;
  let _hasLocalCosts = false; // true once we've added at least one cost in this session

  function resetAccumulator() {
    _knownChatId = null;
    _knownTotal = null;
    _knownPrompt = 0;
    _knownCompletion = 0;
    _hasLocalCosts = false;
  }

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
   * Core sync: defend our _knownTotal against TM overwriting IDB with its own value.
   * On first run for a chat (_knownTotal === null), bootstrap from IDB (trust synced value).
   */
  async function syncTokenUsage() {
    const chatId = getCurrentChatId();
    if (!chatId) return;

    // Detect chat change — reset accumulator so we bootstrap fresh
    if (chatId !== _knownChatId) {
      resetAccumulator();
      _knownChatId = chatId;
    }

    try {
      const idbData = await readChatTokenUsage(chatId);
      if (!idbData) {
        if (DEBUG_SYNC) idbLog('chat not found in IDB');
        return;
      }

      const existing = idbData.tokenUsage || {};
      const tmCost = existing.totalCostUSD ?? 0;

      // Bootstrap: first sync cycle for this chat — trust IDB
      if (_knownTotal === null) {
        _knownTotal = tmCost;
        _knownPrompt = existing.totalTokens ?? 0; // approximate, but fine
        _knownCompletion = 0;
        if (DEBUG_SYNC) idbLog('bootstrapped from IDB:', formatCost(_knownTotal));
        patchNativeCostSpan(_knownTotal);
        return;
      }

      // If we haven't added any costs this session, don't fight TM
      if (!_hasLocalCosts) {
        _knownTotal = tmCost; // stay in sync with whatever TM has
        if (DEBUG_SYNC) idbLog('no local costs, tracking TM:', formatCost(tmCost));
        return;
      }

      // Already matches — just keep the DOM span in sync
      if (Math.abs(tmCost - _knownTotal) < 0.000001) {
        if (DEBUG_SYNC) idbLog('values match, skipping');
        patchNativeCostSpan(_knownTotal);
        return;
      }

      // TM overwrote our value (or it drifted) — restore ours
      const newTokenUsage = {
        ...existing,
        totalCostUSD: _knownTotal,
        totalTokens: _knownPrompt + _knownCompletion,
      };

      const ok = await writeChatTokenUsage(chatId, newTokenUsage);
      if (ok) {
        idbLog(`restored: ${formatCost(tmCost)} → ${formatCost(_knownTotal)}`);
        patchNativeCostSpan(_knownTotal);
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
    return `$${cost.toFixed(4)}`;
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
    const existing = el.querySelector('[data-tm-cost-label]');
    if (existing) {
      existing.textContent = text;
      return;
    }

    const label = document.createElement('div');
    label.setAttribute('data-tm-cost-label', 'true');
    label.textContent = text;
    label.style.cssText = LABEL_STYLE;
    el.appendChild(label);
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
  }

  function injectCostLabelOnLast(text) {
    const responses = document.querySelectorAll('[data-element-id="ai-response"]');
    if (responses.length === 0) return false;
    injectLabelForElement(responses[responses.length - 1], text);
    return true;
  }

  // ---------------------------------------------------------------------------
  // showUsage: called when stream parser finds usage data
  // ---------------------------------------------------------------------------

  /**
   * Increment _knownTotal and write to IDB immediately.
   * Called once per completed response — cost only ever increases.
   */
  async function addCostToTotal(data) {
    const chatId = getCurrentChatId();
    if (!chatId) return;

    const cost = data.cost || 0;
    const prompt = data.prompt_tokens || 0;
    const completion = data.completion_tokens || 0;

    try {
      // Bootstrap if needed, or chat changed since last call
      if (_knownTotal === null || chatId !== _knownChatId) {
        const idbData = await readChatTokenUsage(chatId);
        _knownTotal = idbData?.tokenUsage?.totalCostUSD ?? 0;
        _knownPrompt = 0;
        _knownCompletion = 0;
        _knownChatId = chatId;
      }

      _knownTotal += cost;
      _knownPrompt += prompt;
      _knownCompletion += completion;
      _hasLocalCosts = true;

      const idbData = await readChatTokenUsage(chatId);
      const existing = idbData?.tokenUsage || {};

      const newTokenUsage = {
        ...existing,
        totalCostUSD: _knownTotal,
        messageCostUSD: cost,
        totalTokens: _knownPrompt + _knownCompletion,
        messageTokens: prompt + completion,
      };

      const ok = await writeChatTokenUsage(chatId, newTokenUsage);
      if (ok) {
        idbLog(`added ${formatCost(cost)}, total now ${formatCost(_knownTotal)}`);
        patchNativeCostSpan(_knownTotal);
      }
    } catch (err) {
      idbWarn('addCostToTotal failed:', err);
    }
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

    // Increment cumulative total immediately (don't wait for DOM)
    addCostToTotal(data).catch(err => idbWarn('addCostToTotal error:', err));

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
        if (node.nodeType === 1 &&
          node.hasAttribute?.('data-tm-cost-label')
        ) continue;
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
