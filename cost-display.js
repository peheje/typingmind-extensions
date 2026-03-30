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

  log('extension loaded');
})();
