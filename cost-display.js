// == TypingMind Extension: OpenRouter session-id tagging =======================
// Intercepts all chat/completions requests and injects session_id = chat hash ID
// so costs can be tracked per-conversation in OpenRouter's dashboard.
(() => {
  const log = (...args) => console.log('[TM Session ID]', ...args);
  const warn = (...args) => console.warn('[TM Session ID]', ...args);

  // TODO: remove after all devices have run this once
  localStorage.removeItem('TM_costDisplayData');
  localStorage.removeItem('TM_costDisplayShowLabels');

  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (input instanceof Request) return input.url;
    return '';
  }

  function isChatCompletionRequest(input) {
    return CHAT_COMPLETIONS_URL_PATTERN.test(getRequestUrl(input));
  }

  function getCurrentChatId() {
    const m = window.location.hash.match(/^#chat=(.+)$/);
    return m ? m[1] : '';
  }

  // ---------------------------------------------------------------------------
  // Fetch interception
  // ---------------------------------------------------------------------------

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init) {
    if (!isChatCompletionRequest(input) || !init || typeof init.body !== 'string') {
      return nativeFetch(input, init);
    }

    const chatId = getCurrentChatId();
    if (!chatId) {
      return nativeFetch(input, init);
    }

    try {
      const body = JSON.parse(init.body);
      body.session_id = chatId;
      log('tagged request with session_id:', chatId);
      return nativeFetch(input, { ...init, body: JSON.stringify(body) });
    } catch (err) {
      warn('failed to inject session_id:', err);
      return nativeFetch(input, init);
    }
  };

  // ---------------------------------------------------------------------------
  // OpenRouter logs link
  // ---------------------------------------------------------------------------

  const LINK_ID = 'tm-or-logs-link';

  function ensureLogsLink() {
    const chatId = getCurrentChatId();
    const existing = document.getElementById(LINK_ID);

    if (!chatId) {
      if (existing) existing.remove();
      return;
    }

    const minimap = document.querySelector('[data-element-id="minimap-button"]');
    if (!minimap) return;

    const href = `https://openrouter.ai/logs?tab=sessions&session_id=${encodeURIComponent(chatId)}`;

    if (existing) {
      if (existing.href !== href) existing.href = href;
      return;
    }

    const link = document.createElement('a');
    link.id = LINK_ID;
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '$';
    link.className = 'w-9 justify-center dark:hover:bg-white/20 dark:active:bg-white/25 hover:bg-slate-900/20 active:bg-slate-900/25 focus-visible:outline-offset-2 focus-visible:outline-slate-500 text-slate-900 dark:text-white inline-flex items-center rounded-lg h-9 transition-all font-semibold text-xs';
    link.setAttribute('data-tooltip-id', 'global');
    link.setAttribute('data-tooltip-content', 'OpenRouter logs');
    link.style.textDecoration = 'none';

    minimap.parentElement.insertBefore(link, minimap);
  }

  // Poll for link presence (handles navigation + TM re-renders)
  setInterval(ensureLogsLink, 1000);

  log('extension loaded');
})();
