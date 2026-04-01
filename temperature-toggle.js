// == TypingMind Extension: OpenRouter temperature toggle ======================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/temperature-toggle.js
(() => {
  const STORAGE_KEY = 'TM_openRouterTemperature';
  const CONTAINER_ID = 'tm-temp-toggle-container';
  const BUTTON_ID = 'tm-temp-toggle-button';

  const TITLE_GEN_MARKER = '[[tm-title-gen]]';
  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const CHAT_INPUT_ACTIONS_SELECTOR = '[data-element-id="chat-input-actions"]';
  const REASONING_TOGGLE_CONTAINER_SELECTOR = '#tm-reasoning-toggle-container';
  const CACHE_TOGGLE_CONTAINER_SELECTOR = '#tm-cache-toggle-container';
  const SEARCH_TOGGLE_CONTAINER_SELECTOR = '#tm-online-toggle-container';
  const THINKING_BUTTON_SELECTOR = '[data-element-id="toggle-thinking-button"]';
  const KB_BUTTON_SELECTOR = '[data-element-id="toggle-kb-button"]';
  const VOICE_INPUT_BUTTON_SELECTOR = '[data-element-id="voice-input-button"]';
  const UPLOAD_DOCUMENT_BUTTON_SELECTOR = '[data-element-id="upload-document-button"]';
  const SIDEBAR_BUTTON_SELECTOR = '[data-element-id="new-chat-button-in-side-bar"]';

  const TEMP = Object.freeze({
    OFF: 'off',
    ZERO: '0',
    LOW: '0.3',
    BALANCED: '0.7',
    CREATIVE: '1'
  });

  const TEMP_ORDER = [TEMP.OFF, TEMP.ZERO, TEMP.LOW, TEMP.BALANCED, TEMP.CREATIVE];

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
    <span class="sr-only">Temperature</span>
    <svg class="w-5 h-5 flex-shrink-0" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10.5 11.08V4a1.5 1.5 0 1 0-3 0v7.08A3.5 3.5 0 1 0 10.5 11.08Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="9" cy="13.5" r="1.5" fill="currentColor"/>
      <path d="M9 11.5V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M12.5 5H14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
      <path d="M12.5 7.5H13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
    </svg>
    <span data-tm-temp-badge="true" aria-hidden="true" style="position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;font-size:9px;line-height:16px;font-weight:700;display:none;align-items:center;justify-content:center;pointer-events:none;"></span>
  `;

  const MODE_RENDER_CONFIG = Object.freeze({
    [TEMP.OFF]: Object.freeze({
      pressed: false,
      ariaLabel: 'Temperature off (model default)',
      tooltip: 'Temperature: model default. Click to set 0.0 (precise). Alt+T to cycle.',
      title: 'Temperature off',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: null
    }),
    [TEMP.ZERO]: Object.freeze({
      pressed: true,
      ariaLabel: 'Temperature 0.0 (precise)',
      tooltip: 'Temperature: 0.0 (precise). Click to set 0.3. Alt+T to cycle.',
      title: 'Temperature 0.0',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: '0.0',
        backgroundColor: '#ffffff',
        color: '#6b7280'
      })
    }),
    [TEMP.LOW]: Object.freeze({
      pressed: true,
      ariaLabel: 'Temperature 0.3 (controlled)',
      tooltip: 'Temperature: 0.3 (controlled). Click to set 0.7. Alt+T to cycle.',
      title: 'Temperature 0.3',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: '0.3',
        backgroundColor: '#ffffff',
        color: '#6b7280'
      })
    }),
    [TEMP.BALANCED]: Object.freeze({
      pressed: true,
      ariaLabel: 'Temperature 0.7 (balanced)',
      tooltip: 'Temperature: 0.7 (balanced). Click to set 1.0. Alt+T to cycle.',
      title: 'Temperature 0.7',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: '0.7',
        backgroundColor: '#ffffff',
        color: '#6b7280'
      })
    }),
    [TEMP.CREATIVE]: Object.freeze({
      pressed: true,
      ariaLabel: 'Temperature 1.0 (creative)',
      tooltip: 'Temperature: 1.0 (creative). Click to turn off. Alt+T to cycle.',
      title: 'Temperature 1.0',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: '1.0',
        backgroundColor: '#ffffff',
        color: '#6b7280'
      })
    })
  });

  const log = (...messages) => console.log('[TM Temperature]', ...messages);

  function normalizeStoredTemp(value) {
    if (TEMP_ORDER.includes(value) && value !== TEMP.OFF) return value;
    return TEMP.OFF;
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

  function patchRequestBody(bodyText, temp) {
    if (temp === TEMP.OFF) return { bodyText, patched: false };
    if (bodyText.includes(TITLE_GEN_MARKER)) return { bodyText, patched: false };

    const body = JSON.parse(bodyText);
    if (!body || typeof body !== 'object') return { bodyText, patched: false };

    body.temperature = parseFloat(temp);
    return { bodyText: JSON.stringify(body), patched: true };
  }

  function createModeStore({ storageKey, localStorage, log }) {
    const listeners = new Set();

    function get() {
      return normalizeStoredTemp(localStorage.getItem(storageKey));
    }

    function emit() {
      const temp = get();
      for (const listener of listeners) {
        listener(temp);
      }
    }

    function set(temp) {
      localStorage.setItem(storageKey, temp);
      emit();
      log('temperature', temp);
    }

    function cycle() {
      const current = get();
      const currentIndex = TEMP_ORDER.indexOf(current);
      const next = TEMP_ORDER[(currentIndex + 1) % TEMP_ORDER.length];
      set(next);
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    return { get, set, cycle, subscribe, emit };
  }

  function createToggleUI({ document, modeStore }) {
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
      badgeElement.textContent = badgeConfig.text || '';
    }

    function render(button = getButton(), temp = modeStore.get()) {
      if (!button) return;

      const config = MODE_RENDER_CONFIG[temp] || MODE_RENDER_CONFIG[TEMP.OFF];
      const badge = button.querySelector('[data-tm-temp-badge="true"]');

      button.setAttribute('aria-pressed', String(config.pressed));
      button.setAttribute('data-temperature', temp);
      button.setAttribute('aria-label', config.ariaLabel);
      button.setAttribute('data-tooltip-content', config.tooltip);
      button.setAttribute('title', config.title);

      Object.assign(button.style, config.buttonStyle);
      renderBadge(badge, config.badge);
    }

    function createButton() {
      const button = document.createElement('button');

      button.id = BUTTON_ID;
      button.type = 'button';
      button.className = BUTTON_CLASS_NAME;
      button.innerHTML = BUTTON_CONTENT;
      button.setAttribute('data-tooltip-id', 'global');
      button.style.transition = 'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease';

      button.addEventListener('click', () => {
        modeStore.cycle();
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

    return { render, getOrCreateContainer };
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

    function getSiblingAnchor(selector) {
      const el = document.querySelector(selector);
      if (!el || isHiddenClone(el) || !el.parentElement) return null;
      return { host: el.parentElement, anchor: el };
    }

    function getDirectButtonAnchor(selector) {
      const elements = document.querySelectorAll(selector);

      for (const element of elements) {
        if (!isVisibleChatInputAction(element)) continue;
        if (element.parentElement) {
          return { host: element.parentElement, anchor: element };
        }
      }

      return null;
    }

    function findTarget() {
      return getSiblingAnchor(REASONING_TOGGLE_CONTAINER_SELECTOR)
        || getSiblingAnchor(CACHE_TOGGLE_CONTAINER_SELECTOR)
        || getSiblingAnchor(SEARCH_TOGGLE_CONTAINER_SELECTOR)
        || getAnchorTarget(THINKING_BUTTON_SELECTOR, true)
        || getAnchorTarget(KB_BUTTON_SELECTOR, true)
        || getDirectButtonAnchor(VOICE_INPUT_BUTTON_SELECTOR)
        || getDirectButtonAnchor(UPLOAD_DOCUMENT_BUTTON_SELECTOR)
        || getAnchorTarget(SIDEBAR_BUTTON_SELECTOR, false);
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

  function installFetchPatch({ window, modeStore, log }) {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(input, init) {
      const nextInit = init ? { ...init } : init;

      try {
        if (shouldPatchRequest(input, nextInit)) {
          const result = patchRequestBody(nextInit.body, modeStore.get());
          nextInit.body = result.bodyText;

          if (result.patched) {
            log('injected temperature into request');
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

    function handleKeydown(event) {
      if (!event.altKey || event.key.toLowerCase() !== 't') return;
      event.preventDefault();
      modeStore.cycle();
    }

    function handleStorageChange(event) {
      if (event && event.key && event.key !== STORAGE_KEY) return;
      modeStore.emit();
    }

    function start() {
      modeStore.subscribe((temp) => ui.render(undefined, temp));
      installFetchPatch({ window, modeStore, log });

      mountManager.mount();

      document.addEventListener('keydown', handleKeydown);
      window.addEventListener('storage', handleStorageChange);

      if (document.body) {
        const observer = new MutationObserver(() => {
          mountManager.mount();
        });

        observer.observe(document.body, { subtree: true, childList: true });
      }

      log('extension loaded, temperature:', modeStore.get());
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
