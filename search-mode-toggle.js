// == TypingMind Extension: OpenRouter web search toggle ===================
// v0.7 - 2026-03-22
(() => {
  const STORAGE_KEY = 'TM_openRouterWebSearchOn';
  const ONLINE_SUFFIX = ':online';
  const CONTAINER_ID = 'tm-online-toggle-container';
  const BUTTON_ID = 'tm-online-toggle-button';

  const log = (...messages) => console.log('[TM Web Search]', ...messages);
  const isOn = () => localStorage.getItem(STORAGE_KEY) === 'true';
  const setOn = (value) => localStorage.setItem(STORAGE_KEY, String(Boolean(value)));

  function updateModelSlug(model, enabled) {
    if (typeof model !== 'string' || !model) return model;
    if (enabled) return model.endsWith(ONLINE_SUFFIX) ? model : model + ONLINE_SUFFIX;
    return model.endsWith(ONLINE_SUFFIX) ? model.slice(0, -ONLINE_SUFFIX.length) : model;
  }

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function shouldPatchRequest(input, init) {
    const url = getRequestUrl(input);
    return /\/chat\/completions(?:[/?#]|$)/.test(url) && init && typeof init.body === 'string';
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const nextInit = init ? { ...init } : init;

    try {
      if (shouldPatchRequest(input, nextInit)) {
        const body = JSON.parse(nextInit.body);
        if (body && typeof body === 'object' && typeof body.model === 'string') {
          body.model = updateModelSlug(body.model, isOn());
          nextInit.body = JSON.stringify(body);
        }
      }
    } catch (error) {
      log('fetch patch error', error);
    }

    return nativeFetch(input, nextInit);
  };

  function getButton() {
    return document.getElementById(BUTTON_ID);
  }

  function renderButton() {
    const button = getButton();
    if (!button) return;

    const active = isOn();
    button.setAttribute('aria-pressed', String(active));
    button.style.background = active ? '#0f766e' : '#f3f4f6';
    button.style.color = active ? '#ffffff' : '#111827';
    button.style.borderColor = active ? '#0f766e' : '#d1d5db';
    button.textContent = active ? 'Web Search: ON' : 'Web Search: OFF';
  }

  function toggleMode(forceValue) {
    const nextValue = typeof forceValue === 'boolean' ? forceValue : !isOn();
    setOn(nextValue);
    renderButton();
    log('web search', nextValue ? 'enabled' : 'disabled');
  }

  function createToggle() {
    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.title = 'Toggle OpenRouter web search (:online) (Alt+S)';

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.style.cssText = [
      'width: 100%',
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'padding: 10px 12px',
      'border: 1px solid #d1d5db',
      'border-radius: 12px',
      'font: 600 13px/1.2 sans-serif',
      'letter-spacing: 0.02em',
      'cursor: pointer',
      'box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08)',
      'transition: background 120ms ease, color 120ms ease, border-color 120ms ease'
    ].join(';');
    button.addEventListener('click', () => toggleMode());

    container.appendChild(button);
    renderButton();
    return container;
  }

  function findPreferredHost() {
    const newChatButton = document.querySelector('[data-element-id="new-chat-button-in-side-bar"]');
    if (newChatButton && newChatButton.parentElement) return { host: newChatButton.parentElement, mode: 'sidebar' };
    if (document.body) return { host: document.body, mode: 'floating' };
    return null;
  }

  function applyContainerLayout(container, mode) {
    if (mode === 'sidebar') {
      container.style.cssText = 'margin-top: 8px; width: 100%;';
      return;
    }

    container.style.cssText = [
      'position: fixed',
      'right: 16px',
      'bottom: 16px',
      'width: min(220px, calc(100vw - 32px))',
      'z-index: 2147483647'
    ].join(';');
  }

  function mountToggle() {
    const target = findPreferredHost();
    if (!target) return;

    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = createToggle();
    }

    applyContainerLayout(container, target.mode);

    if (target.mode === 'sidebar') {
      const anchor = target.host.querySelector('[data-element-id="new-chat-button-in-side-bar"]');
      if (anchor && container.parentElement !== target.host) {
        target.host.insertBefore(container, anchor.nextSibling);
      }
      return;
    }

    if (container.parentElement !== document.body) {
      document.body.appendChild(container);
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      toggleMode();
    }
  });

  const observer = new MutationObserver(() => {
    mountToggle();
    renderButton();
  });

  function start() {
    mountToggle();
    renderButton();
    if (document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
    }
    log('extension loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
