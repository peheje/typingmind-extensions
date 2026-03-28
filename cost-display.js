// == TypingMind Extension: OpenRouter per-message cost display ================
// Intercepts streaming responses to capture usage/cost data from OpenRouter
// and displays it inline after each assistant message.
// Persists cost data in TypingMind's IndexedDB chat objects (tmMetadata.extCost)
// so it syncs across devices via TM's built-in cloud sync.
// v0.4 - 2026-03-28
(() => {
  const PREFIX = '[cost-display]';
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);

  const LEGACY_STORAGE_KEY = 'TM_costDisplayData';
  const LABELS_VISIBLE_KEY = 'TM_costDisplayShowLabels';
  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const TITLE_GEN_MARKER = '[[tm-title-gen]]';
  const TOP_BAR_BUTTON_ID = 'tm-cost-topbar-button';

  const DB_NAME = 'keyval-store';
  const STORE_NAME = 'keyval';

  // ---------------------------------------------------------------------------
  // Chat ID from URL
  // ---------------------------------------------------------------------------

  function getCurrentChatId() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#chat=')) return '';
    const params = new URLSearchParams(hash.slice(1));
    return params.get('chat') || '';
  }

  // ---------------------------------------------------------------------------
  // IndexedDB helpers
  // ---------------------------------------------------------------------------

  let dbHandle = null;
  let dbPromise = null;

  function openDB() {
    if (dbHandle) return Promise.resolve(dbHandle);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = (e) => {
        dbHandle = e.target.result;
        dbHandle.onclose = () => { dbHandle = null; dbPromise = null; };
        resolve(dbHandle);
      };
      req.onerror = () => reject(req.error);
    });

    return dbPromise;
  }

  async function readChatFromIDB(chatId) {
    if (!chatId) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`CHAT_${chatId}`);
      req.onsuccess = () => {
        const raw = req.result;
        if (!raw) { resolve(null); return; }
        try {
          resolve(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function saveChatToIDB(chatId, chatObj) {
    if (!chatId) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(JSON.stringify(chatObj), `CHAT_${chatId}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Serialize IDB writes to prevent read-modify-write races
  let writeQueue = Promise.resolve();

  async function saveCostEntry(chatId, uuid, costData) {
    const job = writeQueue.then(async () => {
      const chat = await readChatFromIDB(chatId);
      if (!chat || !Array.isArray(chat.messages)) {
        warn('chat not found in IDB for save, will retry later:', chatId);
        return false;
      }
      const msg = chat.messages.find((m) => m.uuid === uuid);
      if (!msg) {
        warn('message not found in chat:', uuid);
        return false;
      }
      if (!msg.tmMetadata) msg.tmMetadata = {};
      msg.tmMetadata.extCost = costData;
      await saveChatToIDB(chatId, chat);
      return true;
    });
    writeQueue = job.catch(() => {});
    return job;
  }

  async function loadCostMapForChat(chatId) {
    const chat = await readChatFromIDB(chatId);
    const map = {};
    if (!chat || !Array.isArray(chat.messages)) return map;
    for (const msg of chat.messages) {
      if (msg.uuid && msg.tmMetadata && msg.tmMetadata.extCost) {
        map[msg.uuid] = msg.tmMetadata.extCost;
      }
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // In-memory cache (avoids IDB reads on every MutationObserver tick)
  // ---------------------------------------------------------------------------

  let costCache = {};
  let cachedChatId = '';

  async function getCostCache(chatId) {
    if (chatId && chatId === cachedChatId) return costCache;

    cachedChatId = chatId;
    if (!chatId) { costCache = {}; return costCache; }

    costCache = await loadCostMapForChat(chatId);

    // Lazy migration from localStorage
    migrateLegacyData(chatId);

    return costCache;
  }

  function updateCostCache(uuid, data) {
    costCache[uuid] = data;
  }

  // ---------------------------------------------------------------------------
  // Legacy localStorage migration
  // ---------------------------------------------------------------------------

  function migrateLegacyData(chatId) {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      const legacyStore = JSON.parse(raw);
      const legacyUuids = Object.keys(legacyStore);
      if (legacyUuids.length === 0) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return;
      }

      // Find UUIDs in current chat that exist in legacy store
      const responses = document.querySelectorAll('[data-element-id="ai-response"][data-message-uuid]');
      const chatUuids = new Set();
      for (const el of responses) {
        chatUuids.add(el.getAttribute('data-message-uuid'));
      }

      let migratedAny = false;
      for (const uuid of legacyUuids) {
        if (chatUuids.has(uuid) && !costCache[uuid]) {
          costCache[uuid] = legacyStore[uuid];
          delete legacyStore[uuid];
          migratedAny = true;
        }
      }

      if (migratedAny) {
        // Write migrated entries to IDB
        const remaining = Object.keys(legacyStore);
        if (remaining.length === 0) {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } else {
          localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyStore));
        }
        // Persist migrated data to IDB
        for (const uuid of chatUuids) {
          if (costCache[uuid]) {
            saveCostEntry(chatId, uuid, costCache[uuid]).catch((err) =>
              warn('migration write failed:', err)
            );
          }
        }
        log('migrated legacy cost data for', chatUuids.size, 'messages');
      }
    } catch (err) {
      warn('legacy migration error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Labels visibility (stays in localStorage — UI pref, not data)
  // ---------------------------------------------------------------------------

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

  async function restoreAllLabels() {
    const chatId = getCurrentChatId();
    const store = await getCostCache(chatId);
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
    updateTopBarButton(store);
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

  function computeChatTotal(store) {
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

  function updateTopBarButton(store) {
    const { totalCost, totalPrompt, totalCompletion, count } = computeChatTotal(store || costCache);
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
            const chatId = getCurrentChatId();
            updateCostCache(uuid, data);
            updateTopBarButton();

            // Write to IDB (async, fire-and-forget with retry for new chats)
            const writeToIDB = (retriesLeft) => {
              saveCostEntry(chatId, uuid, data).then((ok) => {
                if (ok) {
                  log('saved cost to IDB for message', uuid);
                } else if (retriesLeft > 0) {
                  setTimeout(() => writeToIDB(retriesLeft - 1), 1000);
                } else {
                  warn('failed to save cost to IDB after retries:', uuid);
                }
              }).catch((err) => {
                if (retriesLeft > 0) {
                  setTimeout(() => writeToIDB(retriesLeft - 1), 1000);
                } else {
                  warn('IDB write error:', err);
                }
              });
            };
            writeToIDB(5);
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
  // Location watcher: detect chat switches in SPA
  // ---------------------------------------------------------------------------

  let lastSeenChatId = '';

  function handleLocationChange() {
    const currentChatId = getCurrentChatId();
    if (currentChatId !== lastSeenChatId) {
      lastSeenChatId = currentChatId;
      cachedChatId = ''; // invalidate cache
      costCache = {};
      // Remove stale top bar button (new chat will re-render it)
      const btn = document.getElementById(TOP_BAR_BUTTON_ID);
      if (btn) btn.remove();
    }
  }

  function wrapHistoryMethod(methodName) {
    const nativeMethod = window.history[methodName];
    if (typeof nativeMethod !== 'function') return;

    window.history[methodName] = function wrappedHistoryMethod(...args) {
      const result = nativeMethod.apply(this, args);
      handleLocationChange();
      return result;
    };
  }

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

    // Check for chat switch on every DOM mutation
    handleLocationChange();

    if (restoreTimer) return;
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      restoreAllLabels().catch((err) => warn('restore error:', err));
    }, 500);
  });

  function start() {
    // Init IDB connection early
    openDB().catch((err) => warn('IDB open failed:', err));

    lastSeenChatId = getCurrentChatId();

    if (document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
      restoreAllLabels().catch((err) => warn('initial restore error:', err));
    }

    // SPA navigation detection
    window.addEventListener('hashchange', () => handleLocationChange());
    window.addEventListener('popstate', () => handleLocationChange());
    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  log('extension loaded');
})();
