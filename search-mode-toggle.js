// == TypingMind Extension: OpenRouter web search toggle ===================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/search-mode-toggle.js
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

  function renderButton(button = getButton()) {
    if (!button) return;

    const active = isOn();
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('data-tooltip-content', active ? 'Disable web search (Alt+S)' : 'Enable web search (Alt+S)');
    button.setAttribute('title', active ? 'Web search is on' : 'Web search is off');
    button.style.backgroundColor = active ? '#2563eb' : 'transparent';
    button.style.color = active ? '#ffffff' : '';
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
    container.style.cssText = 'display: inline-flex; align-items: center; flex: 0 0 auto;';

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'relative focus-visible:outline-blue-600 h-9 w-9 rounded-lg justify-center items-center gap-1.5 inline-flex disabled:text-neutral-400 dark:disabled:text-neutral-500 text-slate-900 dark:text-white dark:hover:bg-white/20 dark:active:bg-white/25 hover:bg-slate-900/20 active:bg-slate-900/25 shrink-0';
    button.setAttribute('aria-label', 'Toggle web search');
    button.setAttribute('data-tooltip-id', 'global');
    button.style.transition = 'background-color 120ms ease, color 120ms ease';
    button.innerHTML = '<span class="sr-only">Toggle web search</span><svg class="w-5 h-5 flex-shrink-0" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 1.75C5.00194 1.75 1.75 5.00194 1.75 9C1.75 12.9981 5.00194 16.25 9 16.25C12.9981 16.25 16.25 12.9981 16.25 9C16.25 5.00194 12.9981 1.75 9 1.75ZM14.6044 8.25H11.7798C11.7083 6.75716 11.3409 5.35959 10.7406 4.17484C12.6543 4.81806 14.1128 6.37968 14.6044 8.25ZM9 3.25C9.79129 4.40611 10.2595 6.21612 10.3285 8.25H7.67148C7.74051 6.21612 8.20871 4.40611 9 3.25ZM7.25945 4.17484C6.65915 5.35959 6.29171 6.75716 6.2202 8.25H3.39557C3.8872 6.37968 5.34571 4.81806 7.25945 4.17484ZM3.39557 9.75H6.2202C6.29171 11.2428 6.65915 12.6404 7.25945 13.8252C5.34571 13.1819 3.8872 11.6203 3.39557 9.75ZM9 14.75C8.20871 13.5939 7.74051 11.7839 7.67148 9.75H10.3285C10.2595 11.7839 9.79129 13.5939 9 14.75ZM10.7406 13.8252C11.3409 12.6404 11.7083 11.2428 11.7798 9.75H14.6044C14.1128 11.6203 12.6543 13.1819 10.7406 13.8252Z" fill="currentColor"/></svg>';
    button.addEventListener('click', () => toggleMode());

    renderButton(button);
    container.appendChild(button);
    return container;
  }

  function isUsableAnchorElement(element) {
    if (!element) return false;
    if (element.closest('[inert]')) return false;
    if (element.closest('[aria-hidden="true"]')) return false;
    return Boolean(element.closest('[data-element-id="chat-input-actions"]'));
  }

  function findPreferredHost() {
    const thinkingButtons = document.querySelectorAll('[data-element-id="toggle-thinking-button"]');
    for (const thinkingButton of thinkingButtons) {
      if (!isUsableAnchorElement(thinkingButton)) continue;
      const anchor = thinkingButton.closest('div') || thinkingButton;
      if (anchor.parentElement) return { host: anchor.parentElement, anchor };
    }

    const newChatButtons = document.querySelectorAll('[data-element-id="new-chat-button-in-side-bar"]');
    for (const newChatButton of newChatButtons) {
      if (newChatButton.closest('[inert]')) continue;
      if (newChatButton.closest('[aria-hidden="true"]')) continue;
      const anchor = newChatButton.closest('div') || newChatButton;
      if (anchor.parentElement) return { host: anchor.parentElement, anchor };
    }

    return null;
  }

  function mountToggle() {
    const target = findPreferredHost();
    if (!target) return;

    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = createToggle();
    }

    if (target.anchor) {
      const expectedPreviousSibling = target.anchor;
      const isMountedInRightPlace = container.parentElement === target.host && container.previousSibling === expectedPreviousSibling;
      if (!isMountedInRightPlace) {
        target.host.insertBefore(container, target.anchor.nextSibling);
      }
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
  });

  function start() {
    mountToggle();
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
