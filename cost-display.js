// == TypingMind Extension: OpenRouter session-id tagging =======================
// Intercepts all chat/completions requests and injects session_id = chat hash ID
// so costs can be tracked per-conversation in OpenRouter's dashboard.
(() => {
  const PREFIX = '[session-id]';
  const log = (...args) => console.log(PREFIX, ...args);
  const warn = (...args) => console.warn(PREFIX, ...args);

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

    const href = `https://openrouter.ai/logs?session_id=${encodeURIComponent(chatId)}`;

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
    link.title = 'OpenRouter logs';
    link.style.cssText = [
      'font-size: 13px',
      'font-weight: 600',
      'font-family: ui-monospace, monospace',
      'opacity: 0.45',
      'transition: opacity 0.15s',
      'text-decoration: none',
      'color: inherit',
      'cursor: pointer',
    ].join(';');
    link.addEventListener('mouseenter', () => { link.style.opacity = '0.9'; });
    link.addEventListener('mouseleave', () => { link.style.opacity = '0.45'; });

    minimap.parentElement.insertBefore(link, minimap);
  }

  // Poll for link presence (handles navigation + TM re-renders)
  setInterval(ensureLogsLink, 1000);

  log('extension loaded');
})();
