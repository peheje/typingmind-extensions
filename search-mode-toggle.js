// == TypingMind Extension: OpenRouter web search toggle ===================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/search-mode-toggle.js
// v0.14 - 2026-03-26
(() => {
  const STORAGE_KEY = 'TM_openRouterWebSearchOn';
  const MODEL_SUFFIX = ':online';
  const CONTAINER_ID = 'tm-online-toggle-container';
  const BUTTON_ID = 'tm-online-toggle-button';
  const TITLE_REQUEST_MARKER = '[[tm-title-no-online]]';
  const TOUCH_LONG_PRESS_MS = 450;

  const SEARCH_MODE = Object.freeze({
    OFF: 'off',
    ONCE: 'once',
    PINNED: 'pinned'
  });

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

  const MODE_RENDER_CONFIG = Object.freeze({
    [SEARCH_MODE.OFF]: Object.freeze({
      pressed: false,
      ariaLabel: 'Web search off',
      tooltip: 'Web search is off. Click or tap for the next message only. Shift+Click or touch and hold to pin it on. Alt+S toggles once, Shift+Alt+S toggles pinned.',
      title: 'Web search off',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: null
    }),
    [SEARCH_MODE.ONCE]: Object.freeze({
      pressed: true,
      ariaLabel: 'Web search on for next message',
      tooltip: 'Web search is on for the next message. Click or tap to cancel. Shift+Click or touch and hold to pin. Alt+S toggles once, Shift+Alt+S toggles pinned.',
      title: 'Web search on for next message',
      buttonStyle: Object.freeze({
        backgroundColor: '#2563eb',
        color: '#ffffff',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: '1x',
        backgroundColor: '#ffffff',
        color: '#2563eb'
      })
    }),
    [SEARCH_MODE.PINNED]: Object.freeze({
      pressed: true,
      ariaLabel: 'Web search pinned',
      tooltip: 'Web search is pinned for every message. Click or tap to switch to one-off. Shift+Click or touch and hold to turn it off. Alt+S toggles once, Shift+Alt+S toggles pinned.',
      title: 'Web search pinned',
      buttonStyle: Object.freeze({
        backgroundColor: '#0f766e',
        color: '#ffffff',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.28)'
      }),
      badge: Object.freeze({
        html: PIN_BADGE_CONTENT,
        backgroundColor: '#ffffff',
        color: '#0f766e'
      })
    })
  });

  const MODE_TOGGLE_TRANSITIONS = Object.freeze({
    once: Object.freeze({
      [SEARCH_MODE.OFF]: SEARCH_MODE.ONCE,
      [SEARCH_MODE.ONCE]: SEARCH_MODE.OFF,
      [SEARCH_MODE.PINNED]: SEARCH_MODE.ONCE
    }),
    pinned: Object.freeze({
      [SEARCH_MODE.OFF]: SEARCH_MODE.PINNED,
      [SEARCH_MODE.ONCE]: SEARCH_MODE.PINNED,
      [SEARCH_MODE.PINNED]: SEARCH_MODE.OFF
    })
  });

  const log = (...messages) => console.log('[TM Web Search]', ...messages);

  function getCurrentLocationKey() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function getCurrentChatId() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#chat=')) return '';

    const params = new URLSearchParams(hash.slice(1));
    return params.get('chat') || '';
  }

  function normalizeStoredMode(value) {
    if (value === SEARCH_MODE.PINNED) return SEARCH_MODE.PINNED;
    if (value === SEARCH_MODE.ONCE || value === 'true') return SEARCH_MODE.ONCE;
    return SEARCH_MODE.OFF;
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

  function mapContentText(content, transformText) {
    if (typeof content === 'string') {
      return transformText(content);
    }

    if (!Array.isArray(content)) {
      return content;
    }

    return content.map((part) => {
      if (typeof part === 'string') {
        return transformText(part);
      }

      if (!part || typeof part !== 'object') {
        return part;
      }

      if (typeof part.text === 'string') {
        return { ...part, text: transformText(part.text) };
      }

      if (typeof part.content === 'string') {
        return { ...part, content: transformText(part.content) };
      }

      return part;
    });
  }

  function mapMessagesContent(messages, transformText) {
    if (!Array.isArray(messages)) return messages;

    return messages.map((message) => {
      if (!message || typeof message !== 'object') {
        return message;
      }

      return {
        ...message,
        content: mapContentText(message.content, transformText)
      };
    });
  }

  function stripTitleRequestMarker(text) {
    if (typeof text !== 'string' || !text.includes(TITLE_REQUEST_MARKER)) {
      return text;
    }

    return text
      .replace(TITLE_REQUEST_MARKER, '')
      .replace(/^\s+/, '');
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

  function patchRequestBody(bodyText, mode) {
    const body = JSON.parse(bodyText);
    if (!body || typeof body !== 'object' || typeof body.model !== 'string') {
      return { bodyText, shouldConsumeWebSearch: false, skippedForTitle: false };
    }

    const webSearchEnabled = mode !== SEARCH_MODE.OFF;
    const isTitleGenerationRequest = isLikelyTitleGenerationRequest(body);
    const shouldEnableOnline = webSearchEnabled && !isTitleGenerationRequest;

    if (isTitleGenerationRequest) {
      body.messages = mapMessagesContent(body.messages, stripTitleRequestMarker);
    }

    body.model = updateModelSlug(body.model, shouldEnableOnline);

    return {
      bodyText: JSON.stringify(body),
      shouldConsumeWebSearch: shouldEnableOnline && mode === SEARCH_MODE.ONCE,
      skippedForTitle: webSearchEnabled && !shouldEnableOnline
    };
  }

  function createModeStore({ storageKey, localStorage, log }) {
    const listeners = new Set();

    function get() {
      return normalizeStoredMode(localStorage.getItem(storageKey));
    }

    function emit() {
      const mode = get();
      for (const listener of listeners) {
        listener(mode);
      }
    }

    function set(mode) {
      localStorage.setItem(storageKey, mode);
      emit();
      log('web search mode', mode);
    }

    function clear(reason) {
      if (get() === SEARCH_MODE.OFF) return;
      set(SEARCH_MODE.OFF);
      log('cleared web search mode', reason);
    }

    function consumeOnce() {
      if (get() !== SEARCH_MODE.ONCE) return;
      clear('consumed after send');
    }

    function toggle(kind) {
      const currentMode = get();
      const nextMode = MODE_TOGGLE_TRANSITIONS[kind][currentMode] || SEARCH_MODE.OFF;
      set(nextMode);
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    return {
      get,
      set,
      clear,
      consumeOnce,
      toggleOnce() {
        toggle('once');
      },
      togglePinned() {
        toggle('pinned');
      },
      syncStoredValue() {
        localStorage.setItem(storageKey, get());
      },
      subscribe,
      emit
    };
  }

  function createToggleUI({ document, modeStore }) {
    function isTouchLikePointer(event) {
      return Boolean(event && (event.pointerType === 'touch' || event.pointerType === 'pen'));
    }

    function getButton() {
      return document.getElementById(BUTTON_ID);
    }

    function renderBadge(badgeElement, badgeConfig) {
      if (!(badgeElement instanceof HTMLSpanElement)) return;

      if (!badgeConfig) {
        badgeElement.textContent = '';
        badgeElement.style.display = 'none';
        badgeElement.style.backgroundColor = '';
        badgeElement.style.color = '';
        return;
      }

      badgeElement.style.display = 'inline-flex';
      badgeElement.style.backgroundColor = badgeConfig.backgroundColor;
      badgeElement.style.color = badgeConfig.color;

      if (typeof badgeConfig.html === 'string') {
        badgeElement.innerHTML = badgeConfig.html;
        return;
      }

      badgeElement.textContent = badgeConfig.text || '';
    }

    function render(button = getButton(), mode = modeStore.get()) {
      if (!button) return;

      const config = MODE_RENDER_CONFIG[mode] || MODE_RENDER_CONFIG[SEARCH_MODE.OFF];
      const badge = button.querySelector('[data-tm-online-badge="true"]');

      button.setAttribute('aria-pressed', String(config.pressed));
      button.setAttribute('data-search-mode', mode);
      button.setAttribute('aria-label', config.ariaLabel);
      button.setAttribute('data-tooltip-content', config.tooltip);
      button.setAttribute('title', config.title);

      Object.assign(button.style, config.buttonStyle);
      renderBadge(badge, config.badge);
    }

    function createButton() {
      const button = document.createElement('button');
      let longPressTimerId = null;
      let suppressNextClick = false;

      function clearLongPressTimer() {
        if (longPressTimerId === null) return;
        window.clearTimeout(longPressTimerId);
        longPressTimerId = null;
      }

      function clearSuppressedClickSoon() {
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }

      button.id = BUTTON_ID;
      button.type = 'button';
      button.className = BUTTON_CLASS_NAME;
      button.innerHTML = BUTTON_CONTENT;
      button.setAttribute('data-tooltip-id', 'global');
      button.style.transition = 'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease';

      button.addEventListener('pointerdown', (event) => {
        if (!isTouchLikePointer(event)) return;

        clearLongPressTimer();
        longPressTimerId = window.setTimeout(() => {
          longPressTimerId = null;
          suppressNextClick = true;
          modeStore.togglePinned();
        }, TOUCH_LONG_PRESS_MS);
      });

      button.addEventListener('pointerup', clearLongPressTimer);
      button.addEventListener('pointerup', () => {
        clearSuppressedClickSoon();
      });
      button.addEventListener('pointercancel', () => {
        clearLongPressTimer();
        clearSuppressedClickSoon();
      });
      button.addEventListener('pointerleave', () => {
        clearLongPressTimer();
        clearSuppressedClickSoon();
      });

      button.addEventListener('click', (event) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          event.preventDefault();
          return;
        }

        if (event.shiftKey) {
          modeStore.togglePinned();
          return;
        }

        modeStore.toggleOnce();
      });
      render(button);
      return button;
    }

    function getOrCreateContainer() {
      let container = document.getElementById(CONTAINER_ID);
      if (container) return container;

      container = document.createElement('div');
      container.id = CONTAINER_ID;
      container.style.cssText = 'display: inline-flex; align-items: center; flex: 0 0 auto;';
      container.appendChild(createButton());
      return container;
    }

    return {
      render,
      getOrCreateContainer
    };
  }

  function createMountManager({ document, ui }) {
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

    function findTarget() {
      return getAnchorTarget(THINKING_BUTTON_SELECTOR, true) || getAnchorTarget(SIDEBAR_BUTTON_SELECTOR, false);
    }

    function mount() {
      const target = findTarget();
      if (!target) return;

      const container = ui.getOrCreateContainer();
      if (container.parentElement === target.host) return;

      target.host.insertBefore(container, target.anchor.nextSibling);
    }

    return { mount };
  }

  function createLocationWatcher({ onLocationChange }) {
    let lastSeenChatId = '';
    let lastSeenLocationKey = '';

    function sync() {
      lastSeenChatId = getCurrentChatId();
      lastSeenLocationKey = getCurrentLocationKey();
    }

    function handleChange(source) {
      const currentLocationKey = getCurrentLocationKey();
      const currentChatId = getCurrentChatId();

      if (currentLocationKey !== lastSeenLocationKey || currentChatId !== lastSeenChatId) {
        onLocationChange(source || 'location changed');
        lastSeenLocationKey = currentLocationKey;
        lastSeenChatId = currentChatId;
      }
    }

    return {
      sync,
      handleChange
    };
  }

  function installFetchPatch({ window, modeStore, log }) {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(input, init) {
      const nextInit = init ? { ...init } : init;

      try {
        if (shouldPatchRequest(input, nextInit)) {
          const patchedRequest = patchRequestBody(nextInit.body, modeStore.get());
          nextInit.body = patchedRequest.bodyText;

          if (patchedRequest.skippedForTitle) {
            log('skipping web search for title-generation request');
          }

          if (patchedRequest.shouldConsumeWebSearch) {
            modeStore.consumeOnce();
          }
        }
      } catch (error) {
        log('fetch patch error', error);
      }

      return nativeFetch(input, nextInit);
    };
  }

  function createApp({ window, document, localStorage }) {
    const modeStore = createModeStore({ storageKey: STORAGE_KEY, localStorage, log });
    const ui = createToggleUI({ document, modeStore });
    const mountManager = createMountManager({ document, ui });
    const locationWatcher = createLocationWatcher({
      onLocationChange(source) {
        modeStore.clear(source);
      }
    });

    function handleKeydown(event) {
      if (!event.altKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();

      if (event.shiftKey) {
        modeStore.togglePinned();
        return;
      }

      modeStore.toggleOnce();
    }

    function handleStorageChange(event) {
      if (event && event.key && event.key !== STORAGE_KEY) return;
      modeStore.emit();
    }

    function wrapHistoryMethod(methodName) {
      const nativeMethod = window.history[methodName];
      if (typeof nativeMethod !== 'function') return;

      window.history[methodName] = function wrappedHistoryMethod(...args) {
        const result = nativeMethod.apply(this, args);
        locationWatcher.handleChange(`history ${methodName}`);
        return result;
      };
    }

    function start() {
      modeStore.subscribe((mode) => ui.render(undefined, mode));
      installFetchPatch({ window, modeStore, log });

      locationWatcher.sync();
      modeStore.clear('page loaded');
      modeStore.syncStoredValue();
      mountManager.mount();

      document.addEventListener('keydown', handleKeydown);
      window.addEventListener('hashchange', () => locationWatcher.handleChange('hashchange'));
      window.addEventListener('popstate', () => locationWatcher.handleChange('popstate'));
      window.addEventListener('storage', handleStorageChange);

      wrapHistoryMethod('pushState');
      wrapHistoryMethod('replaceState');

      if (document.body) {
        const observer = new MutationObserver(() => {
          locationWatcher.handleChange('dom changed');
          mountManager.mount();
        });

        observer.observe(document.body, { subtree: true, childList: true });
      }

      log('extension loaded');
    }

    return { start };
  }

  const app = createApp({ window, document, localStorage });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.start(), { once: true });
    return;
  }

  app.start();
})();
