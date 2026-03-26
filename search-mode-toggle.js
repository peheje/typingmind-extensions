// == TypingMind Extension: OpenRouter web search toggle ===================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/search-mode-toggle.js
// v0.11 - 2026-03-26
(() => {
  const STORAGE_KEY = 'TM_openRouterWebSearchOn';
  const MODEL_SUFFIX = ':online';
  const CONTAINER_ID = 'tm-online-toggle-container';
  const BUTTON_ID = 'tm-online-toggle-button';
  const TITLE_REQUEST_MARKER = '[[tm-title-no-online]]';
  const SEARCH_MODE_OFF = 'off';
  const SEARCH_MODE_ONCE = 'once';
  const SEARCH_MODE_PINNED = 'pinned';

  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const CHAT_INPUT_ACTIONS_SELECTOR = '[data-element-id="chat-input-actions"]';
  const THINKING_BUTTON_SELECTOR = '[data-element-id="toggle-thinking-button"]';
  const SIDEBAR_BUTTON_SELECTOR = '[data-element-id="new-chat-button-in-side-bar"]';

  const BUTTON_CLASS_NAME = [
    'relative',
    'focus-visible:outline-blue-600',
    'h-9',
    'w-9',
    'rounded-lg',
    'justify-center',
    'items-center',
    'gap-1.5',
    'inline-flex',
    'disabled:text-neutral-400',
    'dark:disabled:text-neutral-500',
    'text-slate-900',
    'dark:text-white',
    'dark:hover:bg-white/20',
    'dark:active:bg-white/25',
    'hover:bg-slate-900/20',
    'active:bg-slate-900/25',
    'shrink-0'
  ].join(' ');

  const BUTTON_CONTENT = `
    <span class="sr-only">Web search mode</span>
    <svg class="w-5 h-5 flex-shrink-0" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 1.75C5.00194 1.75 1.75 5.00194 1.75 9C1.75 12.9981 5.00194 16.25 9 16.25C12.9981 16.25 16.25 12.9981 16.25 9C16.25 5.00194 12.9981 1.75 9 1.75ZM14.6044 8.25H11.7798C11.7083 6.75716 11.3409 5.35959 10.7406 4.17484C12.6543 4.81806 14.1128 6.37968 14.6044 8.25ZM9 3.25C9.79129 4.40611 10.2595 6.21612 10.3285 8.25H7.67148C7.74051 6.21612 8.20871 4.40611 9 3.25ZM7.25945 4.17484C6.65915 5.35959 6.29171 6.75716 6.2202 8.25H3.39557C3.8872 6.37968 5.34571 4.81806 7.25945 4.17484ZM3.39557 9.75H6.2202C6.29171 11.2428 6.65915 12.6404 7.25945 13.8252C5.34571 13.1819 3.8872 11.6203 3.39557 9.75ZM9 14.75C8.20871 13.5939 7.74051 11.7839 7.67148 9.75H10.3285C10.2595 11.7839 9.79129 13.5939 9 14.75ZM10.7406 13.8252C11.3409 12.6404 11.7083 11.2428 11.7798 9.75H14.6044C14.1128 11.6203 12.6543 13.1819 10.7406 13.8252Z" fill="currentColor"/>
    </svg>
    <span data-tm-online-badge="true" aria-hidden="true" style="position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;font-size:9px;line-height:16px;font-weight:700;display:none;align-items:center;justify-content:center;pointer-events:none;"></span>
  `;

  const PIN_BADGE_CONTENT = `
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10.9073 1.25C10.6387 1.25 10.3812 1.35671 10.1912 1.5467L9.56629 2.17157L13.8285 6.43376L14.4533 5.80888C14.6433 5.61889 14.75 5.36141 14.75 5.09283C14.75 4.82426 14.6433 4.56677 14.4533 4.37679L11.6232 1.5467C11.4332 1.35671 11.1757 1.25 10.9073 1.25ZM8.68241 3.05546L4.84283 6.89504L3.78033 7.24914C3.50502 7.34091 3.28978 7.55616 3.19802 7.83146L2.84391 8.89396L1.52773 10.2101C1.23433 10.5035 1.23433 10.9791 1.52773 11.2725C1.82112 11.5659 2.29676 11.5659 2.59015 11.2725L3.90633 9.95633L4.96883 9.60223C5.24413 9.51046 5.45938 9.29521 5.55114 9.0199L5.90525 7.95741L9.74484 4.11782L8.68241 3.05546ZM7.21459 9.31559L10.9073 13.0083L10.0643 15.1143C9.94781 15.4056 9.66608 15.5938 9.35241 15.5938C9.15077 15.5938 8.95739 15.5137 8.81483 15.3712L4.85236 11.4087L5.95628 11.0407C6.53685 10.8472 6.98958 10.3944 7.18313 9.81387L7.21459 9.31559Z" fill="currentColor"/>
    </svg>
  `;

  const log = (...messages) => console.log('[TM Web Search]', ...messages);

  function getWebSearchMode() {
    const storedValue = localStorage.getItem(STORAGE_KEY);

    if (storedValue === SEARCH_MODE_PINNED) return SEARCH_MODE_PINNED;
    if (storedValue === SEARCH_MODE_ONCE || storedValue === 'true') return SEARCH_MODE_ONCE;
    return SEARCH_MODE_OFF;
  }

  function setStoredWebSearchMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
  }

  function updateModelSlug(model, enabled) {
    if (typeof model !== 'string' || model.length === 0) return model;
    if (enabled) return model.endsWith(MODEL_SUFFIX) ? model : model + MODEL_SUFFIX;
    return model.endsWith(MODEL_SUFFIX) ? model.slice(0, -MODEL_SUFFIX.length) : model;
  }

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function shouldPatchRequest(input, init) {
    return CHAT_COMPLETIONS_URL_PATTERN.test(getRequestUrl(input)) && init && typeof init.body === 'string';
  }

  function getTextFromContentPart(part) {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    return '';
  }

  function getTextFromMessageContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(getTextFromContentPart).filter(Boolean).join('\n');
  }

  function stripTitleRequestMarker(text) {
    if (typeof text !== 'string' || !text.includes(TITLE_REQUEST_MARKER)) {
      return text;
    }

    return text
      .replace(TITLE_REQUEST_MARKER, '')
      .replace(/^\s+/, '');
  }

  function stripTitleRequestMarkerFromContent(content) {
    if (typeof content === 'string') {
      return stripTitleRequestMarker(content);
    }

    if (!Array.isArray(content)) {
      return content;
    }

    return content.map((part) => {
      if (typeof part === 'string') {
        return stripTitleRequestMarker(part);
      }

      if (!part || typeof part !== 'object') {
        return part;
      }

      if (typeof part.text === 'string') {
        return { ...part, text: stripTitleRequestMarker(part.text) };
      }

      if (typeof part.content === 'string') {
        return { ...part, content: stripTitleRequestMarker(part.content) };
      }

      return part;
    });
  }

  function stripTitleRequestMarkerFromMessages(messages) {
    if (!Array.isArray(messages)) return messages;

    return messages.map((message) => {
      if (!message || typeof message !== 'object') {
        return message;
      }

      return {
        ...message,
        content: stripTitleRequestMarkerFromContent(message.content)
      };
    });
  }

  function isLikelyTitleGenerationRequest(body) {
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return false;
    }

    const combinedText = body.messages
      .filter(Boolean)
      .map((message) => getTextFromMessageContent(message.content))
      .join('\n')
      .trim();

    if (!combinedText) {
      return false;
    }

    return combinedText.includes(TITLE_REQUEST_MARKER);
  }

  function patchRequestBody(bodyText) {
    const body = JSON.parse(bodyText);
    if (!body || typeof body !== 'object' || typeof body.model !== 'string') {
      return { bodyText, shouldConsumeWebSearch: false };
    }

    const webSearchMode = getWebSearchMode();
    const webSearchEnabled = webSearchMode !== SEARCH_MODE_OFF;
    const isTitleGenerationRequest = isLikelyTitleGenerationRequest(body);
    const shouldEnableOnline = webSearchEnabled && !isTitleGenerationRequest;

    if (webSearchEnabled && !shouldEnableOnline) {
      log('skipping web search for title-generation request');
    }

    if (isTitleGenerationRequest) {
      body.messages = stripTitleRequestMarkerFromMessages(body.messages);
    }

    body.model = updateModelSlug(body.model, shouldEnableOnline);
    return {
      bodyText: JSON.stringify(body),
      shouldConsumeWebSearch: shouldEnableOnline && webSearchMode === SEARCH_MODE_ONCE
    };
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const nextInit = init ? { ...init } : init;

    try {
      if (shouldPatchRequest(input, nextInit)) {
        const patchedRequest = patchRequestBody(nextInit.body);
        nextInit.body = patchedRequest.bodyText;

        if (patchedRequest.shouldConsumeWebSearch) {
          consumeWebSearchMode();
        }
      }
    } catch (error) {
      log('fetch patch error', error);
    }

    return nativeFetch(input, nextInit);
  };

  function getToggleButton() {
    return document.getElementById(BUTTON_ID);
  }

  function renderToggleButton(button = getToggleButton()) {
    if (!button) return;

    const mode = getWebSearchMode();
    const enabled = mode !== SEARCH_MODE_OFF;
    const badge = button.querySelector('[data-tm-online-badge="true"]');

    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('data-search-mode', mode);

    if (mode === SEARCH_MODE_ONCE) {
      button.setAttribute('aria-label', 'Web search on for next message');
      button.setAttribute('data-tooltip-content', 'Web search is on for the next message. Click to cancel. Shift+Click to pin. Alt+S toggles once, Shift+Alt+S toggles pinned.');
      button.setAttribute('title', 'Web search on for next message');
      button.style.backgroundColor = '#2563eb';
      button.style.color = '#ffffff';
      button.style.boxShadow = '';

      if (badge instanceof HTMLSpanElement) {
        badge.textContent = '1x';
        badge.style.display = 'inline-flex';
        badge.style.backgroundColor = '#ffffff';
        badge.style.color = '#2563eb';
      }

      return;
    }

    if (mode === SEARCH_MODE_PINNED) {
      button.setAttribute('aria-label', 'Web search pinned');
      button.setAttribute('data-tooltip-content', 'Web search is pinned for every message. Click to switch to one-off. Shift+Click to turn it off. Alt+S toggles once, Shift+Alt+S toggles pinned.');
      button.setAttribute('title', 'Web search pinned');
      button.style.backgroundColor = '#0f766e';
      button.style.color = '#ffffff';
      button.style.boxShadow = 'inset 0 0 0 1px rgba(255, 255, 255, 0.28)';

      if (badge instanceof HTMLSpanElement) {
        badge.innerHTML = PIN_BADGE_CONTENT;
        badge.style.display = 'inline-flex';
        badge.style.backgroundColor = '#ffffff';
        badge.style.color = '#0f766e';
      }

      return;
    }

    button.setAttribute('aria-label', 'Web search off');
    button.setAttribute('data-tooltip-content', 'Web search is off. Click for the next message only. Shift+Click to pin it on. Alt+S toggles once, Shift+Alt+S toggles pinned.');
    button.setAttribute('title', 'Web search off');
    button.style.backgroundColor = 'transparent';
    button.style.color = '';
    button.style.boxShadow = '';

    if (badge instanceof HTMLSpanElement) {
      badge.textContent = '';
      badge.style.display = 'none';
    }
  }

  function setWebSearchMode(mode) {
    setStoredWebSearchMode(mode);
    renderToggleButton();
    log('web search mode', mode);
  }

  function consumeWebSearchMode() {
    if (getWebSearchMode() !== SEARCH_MODE_ONCE) return;
    setWebSearchMode(SEARCH_MODE_OFF);
  }

  function toggleOneOffWebSearch() {
    const currentMode = getWebSearchMode();
    setWebSearchMode(currentMode === SEARCH_MODE_ONCE ? SEARCH_MODE_OFF : SEARCH_MODE_ONCE);
  }

  function togglePinnedWebSearch() {
    const currentMode = getWebSearchMode();
    setWebSearchMode(currentMode === SEARCH_MODE_PINNED ? SEARCH_MODE_OFF : SEARCH_MODE_PINNED);
  }

  function createToggleButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = BUTTON_CLASS_NAME;
    button.innerHTML = BUTTON_CONTENT;
    button.setAttribute('data-tooltip-id', 'global');
    button.style.transition = 'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease';
    button.addEventListener('click', (event) => {
      if (event.shiftKey) {
        togglePinnedWebSearch();
        return;
      }

      toggleOneOffWebSearch();
    });
    renderToggleButton(button);
    return button;
  }

  function getOrCreateToggleContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;

    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.style.cssText = 'display: inline-flex; align-items: center; flex: 0 0 auto;';
    container.appendChild(createToggleButton());
    return container;
  }

  function isHiddenClone(element) {
    return Boolean(element.closest('[inert]') || element.closest('[aria-hidden="true"]'));
  }

  function isVisibleChatInputAction(element) {
    return Boolean(element && !isHiddenClone(element) && element.closest(CHAT_INPUT_ACTIONS_SELECTOR));
  }

  function getAnchorTarget(selector, requireChatInputActions) {
    const elements = document.querySelectorAll(selector);

    for (const element of elements) {
      if (isHiddenClone(element)) continue;
      if (requireChatInputActions && !isVisibleChatInputAction(element)) continue;

      const anchor = element.closest('div') || element;
      if (anchor.parentElement) {
        return { host: anchor.parentElement, anchor };
      }
    }

    return null;
  }

  function findMountTarget() {
    return getAnchorTarget(THINKING_BUTTON_SELECTOR, true) || getAnchorTarget(SIDEBAR_BUTTON_SELECTOR, false);
  }

  function mountToggle() {
    const target = findMountTarget();
    if (!target) return;

    const container = getOrCreateToggleContainer();
    const isAlreadyMounted = container.parentElement === target.host && container.previousSibling === target.anchor;

    if (!isAlreadyMounted) {
      target.host.insertBefore(container, target.anchor.nextSibling);
    }
  }

  function handleKeydown(event) {
    if (!event.altKey || event.key.toLowerCase() !== 's') return;
    event.preventDefault();

    if (event.shiftKey) {
      togglePinnedWebSearch();
      return;
    }

    toggleOneOffWebSearch();
  }

  const observer = new MutationObserver(mountToggle);

  function start() {
    setStoredWebSearchMode(getWebSearchMode());
    mountToggle();
    document.addEventListener('keydown', handleKeydown);

    if (document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
    }

    log('extension loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
    return;
  }

  start();
})();
