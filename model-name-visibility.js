// == TypingMind Extension: Model name visibility =============================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/model-name-visibility.js
// v0.1 - 2026-03-27
//
// Makes the selected model name always visible (including mobile) and removes
// the tight truncation so the full name can be read at a glance.
(() => {
  const MODEL_BUTTON_SELECTOR = '[id^="headlessui-menu-button-"]';
  const REGENERATE_BUTTON_SELECTOR = '[data-element-id="regenerate-button"]';
  const LIST_MORE_BUTTON_SELECTOR = '[data-element-id="list-more-button"]';
  const BOUND_ATTRIBUTE = 'data-tm-model-visibility-bound';

  const log = (...messages) => console.log('[TM Model Visibility]', ...messages);

  function findModelNameSpan(button) {
    // The model name span sits inside the first menu button and has the truncate class.
    const span = button.querySelector('span.truncate');
    return span || null;
  }

  function makeShrinkable(el) {
    if (el) {
      el.style.minWidth = '0';
      el.style.overflow = 'hidden';
    }
  }

  function applyVisibility(span) {
    if (!span || span.getAttribute(BOUND_ATTRIBUTE) === 'true') return;

    span.setAttribute(BOUND_ATTRIBUTE, 'true');

    // Force visible on all screen sizes (TM hides it on mobile).
    span.classList.remove('hidden');
    span.style.display = 'block';
    span.style.maxWidth = '300px';

    // Allow the button and its wrapper divs to shrink within flex layout
    // so action buttons (new chat, regenerate) don't cause horizontal overflow.
    // Structure: span → button → div.sm:relative → div.flex (the flex child).
    const button = span.closest('button');
    makeShrinkable(button);
    makeShrinkable(button?.parentElement);
    makeShrinkable(button?.parentElement?.parentElement);

    log('model name made visible');
  }

  function removeButton(selector) {
    const btn = document.querySelector(selector);
    if (btn && btn.getAttribute(BOUND_ATTRIBUTE) !== 'true') {
      btn.setAttribute(BOUND_ATTRIBUTE, 'true');
      btn.remove();
    }
  }

  function findAndApply() {
    removeButton(REGENERATE_BUTTON_SELECTOR);
    removeButton(LIST_MORE_BUTTON_SELECTOR);

    const buttons = document.querySelectorAll(MODEL_BUTTON_SELECTOR);

    for (const button of buttons) {
      // The model selector button has an <img> (provider icon) inside it.
      if (!button.querySelector('img')) continue;

      const span = findModelNameSpan(button);
      if (span) applyVisibility(span);
    }
  }

  function start() {
    findAndApply();

    if (document.body) {
      const observer = new MutationObserver(() => findAndApply());
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
