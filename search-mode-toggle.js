// == TypingMind Extension: OpenRouter web search toggle ===================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/search-mode-toggle.js
// v0.7 - 2026-03-22
(() => {
  const STORAGE_KEY = 'TM_openRouterWebSearchOn';
  const MODEL_SUFFIX = ':online';
  const CONTAINER_ID = 'tm-online-toggle-container';
  const BUTTON_ID = 'tm-online-toggle-button';

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
    <span class="sr-only">Toggle web search</span>
    <svg class="w-5 h-5 flex-shrink-0" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 1.75C5.00194 1.75 1.75 5.00194 1.75 9C1.75 12.9981 5.00194 16.25 9 16.25C12.9981 16.25 16.25 12.9981 16.25 9C16.25 5.00194 12.9981 1.75 9 1.75ZM14.6044 8.25H11.7798C11.7083 6.75716 11.3409 5.35959 10.7406 4.17484C12.6543 4.81806 14.1128 6.37968 14.6044 8.25ZM9 3.25C9.79129 4.40611 10.2595 6.21612 10.3285 8.25H7.67148C7.74051 6.21612 8.20871 4.40611 9 3.25ZM7.25945 4.17484C6.65915 5.35959 6.29171 6.75716 6.2202 8.25H3.39557C3.8872 6.37968 5.34571 4.81806 7.25945 4.17484ZM3.39557 9.75H6.2202C6.29171 11.2428 6.65915 12.6404 7.25945 13.8252C5.34571 13.1819 3.8872 11.6203 3.39557 9.75ZM9 14.75C8.20871 13.5939 7.74051 11.7839 7.67148 9.75H10.3285C10.2595 11.7839 9.79129 13.5939 9 14.75ZM10.7406 13.8252C11.3409 12.6404 11.7083 11.2428 11.7798 9.75H14.6044C14.1128 11.6203 12.6543 13.1819 10.7406 13.8252Z" fill="currentColor"/>
    </svg>
  `;

  const log = (...messages) => console.log('[TM Web Search]', ...messages);

  function isWebSearchEnabled() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  function setWebSearchEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, String(Boolean(enabled)));
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

  function patchRequestBody(bodyText) {
    const body = JSON.parse(bodyText);
    if (!body || typeof body !== 'object' || typeof body.model !== 'string') {
      return bodyText;
    }

    body.model = updateModelSlug(body.model, isWebSearchEnabled());
    return JSON.stringify(body);
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const nextInit = init ? { ...init } : init;

    try {
      if (shouldPatchRequest(input, nextInit)) {
        nextInit.body = patchRequestBody(nextInit.body);
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

    const enabled = isWebSearchEnabled();
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('data-tooltip-content', enabled ? 'Disable web search (Alt+S)' : 'Enable web search (Alt+S)');
    button.setAttribute('title', enabled ? 'Web search is on' : 'Web search is off');
    button.style.backgroundColor = enabled ? '#2563eb' : 'transparent';
    button.style.color = enabled ? '#ffffff' : '';
  }

  function setWebSearchMode(nextValue) {
    setWebSearchEnabled(nextValue);
    renderToggleButton();
    log('web search', nextValue ? 'enabled' : 'disabled');
  }

  function toggleWebSearchMode(forceValue) {
    const nextValue = typeof forceValue === 'boolean' ? forceValue : !isWebSearchEnabled();
    setWebSearchMode(nextValue);
  }

  function createToggleButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = BUTTON_CLASS_NAME;
    button.innerHTML = BUTTON_CONTENT;
    button.setAttribute('aria-label', 'Toggle web search');
    button.setAttribute('data-tooltip-id', 'global');
    button.style.transition = 'background-color 120ms ease, color 120ms ease';
    button.addEventListener('click', () => toggleWebSearchMode());
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
    toggleWebSearchMode();
  }

  const observer = new MutationObserver(mountToggle);

  function start() {
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
