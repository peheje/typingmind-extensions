// == TypingMind Extension: OpenRouter prompt cache toggle ====================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/prompt-cache-toggle.js
// v0.1 - 2026-03-26
(() => {
  const STORAGE_KEY = 'TM_openRouterPromptCacheMode';
  const CONTAINER_ID = 'tm-cache-toggle-container';
  const BUTTON_ID = 'tm-cache-toggle-button';

  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const CHAT_INPUT_ACTIONS_SELECTOR = '[data-element-id="chat-input-actions"]';
  const SEARCH_TOGGLE_CONTAINER_SELECTOR = '#tm-online-toggle-container';
  const THINKING_BUTTON_SELECTOR = '[data-element-id="toggle-thinking-button"]';
  const SIDEBAR_BUTTON_SELECTOR = '[data-element-id="new-chat-button-in-side-bar"]';

  const CACHE_MODE = Object.freeze({
    OFF: 'off',
    STANDARD: 'standard',
    EXTENDED: 'extended'
  });

  const MODE_ORDER = [CACHE_MODE.OFF, CACHE_MODE.STANDARD, CACHE_MODE.EXTENDED];

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
    <span class="sr-only">Prompt cache mode</span>
    <svg class="w-5 h-5 flex-shrink-0" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3.5 3.5C3.5 2.67157 4.17157 2 5 2H13C13.8284 2 14.5 2.67157 14.5 3.5V5.5C14.5 6.32843 13.8284 7 13 7H5C4.17157 7 3.5 6.32843 3.5 5.5V3.5ZM5.5 4C5.22386 4 5 4.22386 5 4.5C5 4.77614 5.22386 5 5.5 5H6.5C6.77614 5 7 4.77614 7 4.5C7 4.22386 6.77614 4 6.5 4H5.5ZM12 4.5C12 4.77614 11.7761 5 11.5 5C11.2239 5 11 4.77614 11 4.5C11 4.22386 11.2239 4 11.5 4C11.7761 4 12 4.22386 12 4.5ZM13 4.5C13 4.77614 12.7761 5 12.5 5C12.2239 5 12 4.77614 12 4.5C12 4.22386 12.2239 4 12.5 4C12.7761 4 13 4.22386 13 4.5Z" fill="currentColor"/>
      <path d="M3.5 9.5C3.5 8.67157 4.17157 8 5 8H13C13.8284 8 14.5 8.67157 14.5 9.5V11.5C14.5 12.3284 13.8284 13 13 13H5C4.17157 13 3.5 12.3284 3.5 11.5V9.5ZM5.5 10C5.22386 10 5 10.2239 5 10.5C5 10.7761 5.22386 11 5.5 11H6.5C6.77614 11 7 10.7761 7 10.5C7 10.2239 6.77614 10 6.5 10H5.5ZM12 10.5C12 10.7761 11.7761 11 11.5 11C11.2239 11 11 10.7761 11 10.5C11 10.2239 11.2239 10 11.5 10C11.7761 10 12 10.2239 12 10.5ZM13 10.5C13 10.7761 12.7761 11 12.5 11C12.2239 11 12 10.7761 12 10.5C12 10.2239 12.2239 10 12.5 10C12.7761 10 13 10.2239 13 10.5Z" fill="currentColor"/>
      <path d="M7 15C7 14.4477 7.44772 14 8 14H10C10.5523 14 11 14.4477 11 15V15.5C11 15.7761 10.7761 16 10.5 16H7.5C7.22386 16 7 15.7761 7 15.5V15Z" fill="currentColor"/>
    </svg>
    <span data-tm-cache-badge="true" aria-hidden="true" style="position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;font-size:9px;line-height:16px;font-weight:700;display:none;align-items:center;justify-content:center;pointer-events:none;"></span>
  `;

  const MODE_RENDER_CONFIG = Object.freeze({
    [CACHE_MODE.OFF]: Object.freeze({
      pressed: false,
      ariaLabel: 'Prompt cache off',
      tooltip: 'Prompt cache is off. Click to enable standard caching. Alt+C to cycle.',
      title: 'Prompt cache off',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: null
    }),
    [CACHE_MODE.STANDARD]: Object.freeze({
      pressed: true,
      ariaLabel: 'Prompt cache standard',
      tooltip: 'Prompt cache is on (standard). Click to switch to extended (1h). Alt+C to cycle.',
      title: 'Prompt cache standard',
      buttonStyle: Object.freeze({
        backgroundColor: '#ca8a04',
        color: '#ffffff',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: 'ON',
        backgroundColor: '#ffffff',
        color: '#ca8a04'
      })
    }),
    [CACHE_MODE.EXTENDED]: Object.freeze({
      pressed: true,
      ariaLabel: 'Prompt cache extended (1h)',
      tooltip: 'Prompt cache is on (extended 1h TTL). Click to turn off. Alt+C to cycle.',
      title: 'Prompt cache extended (1h)',
      buttonStyle: Object.freeze({
        backgroundColor: '#15803d',
        color: '#ffffff',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.28)'
      }),
      badge: Object.freeze({
        text: '1H',
        backgroundColor: '#ffffff',
        color: '#15803d'
      })
    })
  });

  const log = (...messages) => console.log('[TM Prompt Cache]', ...messages);

  function normalizeStoredMode(value) {
    if (value === CACHE_MODE.STANDARD) return CACHE_MODE.STANDARD;
    if (value === CACHE_MODE.EXTENDED) return CACHE_MODE.EXTENDED;
    return CACHE_MODE.OFF;
  }

  function getCacheControl(mode) {
    if (mode === CACHE_MODE.STANDARD) return { type: 'ephemeral' };
    if (mode === CACHE_MODE.EXTENDED) return { type: 'ephemeral', ttl: '1h' };
    return null;
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

  function patchRequestBody(bodyText, mode) {
    const cacheControl = getCacheControl(mode);
    if (!cacheControl) return { bodyText, patched: false };

    const body = JSON.parse(bodyText);
    if (!body || typeof body !== 'object') return { bodyText, patched: false };

    body.cache_control = cacheControl;
    return { bodyText: JSON.stringify(body), patched: true };
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
      log('cache mode', mode);
    }

    function cycle() {
      const currentMode = get();
      const currentIndex = MODE_ORDER.indexOf(currentMode);
      const nextMode = MODE_ORDER[(currentIndex + 1) % MODE_ORDER.length];
      set(nextMode);
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

    function render(button = getButton(), mode = modeStore.get()) {
      if (!button) return;

      const config = MODE_RENDER_CONFIG[mode] || MODE_RENDER_CONFIG[CACHE_MODE.OFF];
      const badge = button.querySelector('[data-tm-cache-badge="true"]');

      button.setAttribute('aria-pressed', String(config.pressed));
      button.setAttribute('data-cache-mode', mode);
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

    function getSearchToggleAnchor() {
      const el = document.querySelector(SEARCH_TOGGLE_CONTAINER_SELECTOR);
      if (!el || isHiddenClone(el) || !el.parentElement) return null;
      return { host: el.parentElement, anchor: el };
    }

    function findTarget() {
      return getSearchToggleAnchor() || getAnchorTarget(THINKING_BUTTON_SELECTOR, true) || getAnchorTarget(SIDEBAR_BUTTON_SELECTOR, false);
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
            log('injected cache_control into request');
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
      if (!event.altKey || event.key.toLowerCase() !== 'c') return;
      event.preventDefault();
      modeStore.cycle();
    }

    function handleStorageChange(event) {
      if (event && event.key && event.key !== STORAGE_KEY) return;
      modeStore.emit();
    }

    function start() {
      modeStore.subscribe((mode) => ui.render(undefined, mode));
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

      log('extension loaded, mode:', modeStore.get());
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
