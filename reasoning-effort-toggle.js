// == TypingMind Extension: OpenRouter reasoning effort toggle =================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/reasoning-effort-toggle.js
// v0.1 - 2026-03-26
(() => {
  const STORAGE_KEY = 'TM_openRouterReasoningEffort';
  const CONTAINER_ID = 'tm-reasoning-toggle-container';
  const BUTTON_ID = 'tm-reasoning-toggle-button';

  const CHAT_COMPLETIONS_URL_PATTERN = /\/chat\/completions(?:[/?#]|$)/;
  const CHAT_INPUT_ACTIONS_SELECTOR = '[data-element-id="chat-input-actions"]';
  const CACHE_TOGGLE_CONTAINER_SELECTOR = '#tm-cache-toggle-container';
  const SEARCH_TOGGLE_CONTAINER_SELECTOR = '#tm-online-toggle-container';
  const THINKING_BUTTON_SELECTOR = '[data-element-id="toggle-thinking-button"]';
  const KB_BUTTON_SELECTOR = '[data-element-id="toggle-kb-button"]';
  const VOICE_INPUT_BUTTON_SELECTOR = '[data-element-id="voice-input-button"]';
  const UPLOAD_DOCUMENT_BUTTON_SELECTOR = '[data-element-id="upload-document-button"]';
  const SIDEBAR_BUTTON_SELECTOR = '[data-element-id="new-chat-button-in-side-bar"]';

  const EFFORT = Object.freeze({
    OFF: 'off',
    MINIMAL: 'minimal',
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
  });

  const EFFORT_ORDER = [EFFORT.OFF, EFFORT.MINIMAL, EFFORT.LOW, EFFORT.MEDIUM, EFFORT.HIGH];

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
    <span class="sr-only">Reasoning effort</span>
    <svg class="w-5 h-5 flex-shrink-0" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 1.75C9 1.75 10.5 4.5 10.5 7C10.5 8.5 10 9.5 9 10.5C8 9.5 7.5 8.5 7.5 7C7.5 4.5 9 1.75 9 1.75Z" fill="currentColor" opacity="0.3"/>
      <path d="M9 1.75C9 1.75 10.5 4.5 10.5 7C10.5 8.5 10 9.5 9 10.5C8 9.5 7.5 8.5 7.5 7C7.5 4.5 9 1.75 9 1.75Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5.25 6C5.25 6 4 7.5 4 9.25C4 10.5 4.75 11.5 5.75 12.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12.75 6C12.75 6 14 7.5 14 9.25C14 10.5 13.25 11.5 12.25 12.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.5 13.5H11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M7 15.5H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span data-tm-reasoning-badge="true" aria-hidden="true" style="position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;font-size:9px;line-height:16px;font-weight:700;display:none;align-items:center;justify-content:center;pointer-events:none;"></span>
  `;

  const MODE_RENDER_CONFIG = Object.freeze({
    [EFFORT.OFF]: Object.freeze({
      pressed: false,
      ariaLabel: 'Reasoning effort off',
      tooltip: 'Reasoning effort is off. Click to set minimal. Alt+R to cycle.',
      title: 'Reasoning effort off',
      buttonStyle: Object.freeze({
        backgroundColor: 'transparent',
        color: '',
        boxShadow: ''
      }),
      badge: null
    }),
    [EFFORT.MINIMAL]: Object.freeze({
      pressed: true,
      ariaLabel: 'Reasoning effort minimal',
      tooltip: 'Reasoning effort: minimal. Click to set low. Alt+R to cycle.',
      title: 'Reasoning effort minimal',
      buttonStyle: Object.freeze({
        backgroundColor: '#64748b',
        color: '#ffffff',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: 'MIN',
        backgroundColor: '#ffffff',
        color: '#64748b'
      })
    }),
    [EFFORT.LOW]: Object.freeze({
      pressed: true,
      ariaLabel: 'Reasoning effort low',
      tooltip: 'Reasoning effort: low. Click to set medium. Alt+R to cycle.',
      title: 'Reasoning effort low',
      buttonStyle: Object.freeze({
        backgroundColor: '#0284c7',
        color: '#ffffff',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: 'LO',
        backgroundColor: '#ffffff',
        color: '#0284c7'
      })
    }),
    [EFFORT.MEDIUM]: Object.freeze({
      pressed: true,
      ariaLabel: 'Reasoning effort medium',
      tooltip: 'Reasoning effort: medium. Click to set high. Alt+R to cycle.',
      title: 'Reasoning effort medium',
      buttonStyle: Object.freeze({
        backgroundColor: '#ca8a04',
        color: '#ffffff',
        boxShadow: ''
      }),
      badge: Object.freeze({
        text: 'MED',
        backgroundColor: '#ffffff',
        color: '#ca8a04'
      })
    }),
    [EFFORT.HIGH]: Object.freeze({
      pressed: true,
      ariaLabel: 'Reasoning effort high',
      tooltip: 'Reasoning effort: high. Click to turn off. Alt+R to cycle.',
      title: 'Reasoning effort high',
      buttonStyle: Object.freeze({
        backgroundColor: '#dc2626',
        color: '#ffffff',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.28)'
      }),
      badge: Object.freeze({
        text: 'HI',
        backgroundColor: '#ffffff',
        color: '#dc2626'
      })
    })
  });

  const log = (...messages) => console.log('[TM Reasoning]', ...messages);

  function normalizeStoredEffort(value) {
    if (EFFORT_ORDER.includes(value) && value !== EFFORT.OFF) return value;
    return EFFORT.OFF;
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

  function patchRequestBody(bodyText, effort) {
    if (effort === EFFORT.OFF) return { bodyText, patched: false };

    const body = JSON.parse(bodyText);
    if (!body || typeof body !== 'object') return { bodyText, patched: false };

    body.reasoning = { effort };
    return { bodyText: JSON.stringify(body), patched: true };
  }

  function createModeStore({ storageKey, localStorage, log }) {
    const listeners = new Set();

    function get() {
      return normalizeStoredEffort(localStorage.getItem(storageKey));
    }

    function emit() {
      const effort = get();
      for (const listener of listeners) {
        listener(effort);
      }
    }

    function set(effort) {
      localStorage.setItem(storageKey, effort);
      emit();
      log('reasoning effort', effort);
    }

    function cycle() {
      const current = get();
      const currentIndex = EFFORT_ORDER.indexOf(current);
      const next = EFFORT_ORDER[(currentIndex + 1) % EFFORT_ORDER.length];
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

    function render(button = getButton(), effort = modeStore.get()) {
      if (!button) return;

      const config = MODE_RENDER_CONFIG[effort] || MODE_RENDER_CONFIG[EFFORT.OFF];
      const badge = button.querySelector('[data-tm-reasoning-badge="true"]');

      button.setAttribute('aria-pressed', String(config.pressed));
      button.setAttribute('data-reasoning-effort', effort);
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

    function findTarget() {
      return getSiblingAnchor(CACHE_TOGGLE_CONTAINER_SELECTOR)
        || getSiblingAnchor(SEARCH_TOGGLE_CONTAINER_SELECTOR)
        || getAnchorTarget(THINKING_BUTTON_SELECTOR, true)
        || getAnchorTarget(KB_BUTTON_SELECTOR, true)
        || getAnchorTarget(VOICE_INPUT_BUTTON_SELECTOR, true)
        || getAnchorTarget(UPLOAD_DOCUMENT_BUTTON_SELECTOR, true)
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
            log('injected reasoning effort into request');
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
      if (!event.altKey || event.key.toLowerCase() !== 'r') return;
      event.preventDefault();
      modeStore.cycle();
    }

    function handleStorageChange(event) {
      if (event && event.key && event.key !== STORAGE_KEY) return;
      modeStore.emit();
    }

    function start() {
      modeStore.subscribe((effort) => ui.render(undefined, effort));
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

      log('extension loaded, effort:', modeStore.get());
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
