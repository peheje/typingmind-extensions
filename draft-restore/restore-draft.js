// == TypingMind Extension: Restore new-chat draft ===========================
// Install in TypingMind using a pinned jsDelivr commit URL, for example:
// https://cdn.jsdelivr.net/gh/peheje/Typingmind-Extension-searchmode@COMMIT_SHA/draft-restore/restore-draft.js
//
// TypingMind handles drafts for chats that already have messages, but not for
// fresh/new chats. This extension saves the textarea globally and restores it
// when the textarea is empty (i.e. TM did not restore its own draft).
// Because TM is an SPA that always sets #chat=<id>, we cannot rely on the URL
// to distinguish new from existing chats. Instead we simply always save and
// only restore into an empty textarea — if TM already filled it, we stay out
// of the way.
(() => {
  const STORAGE_KEY = 'TM_chatInputDraft';
  const TEXTAREA_SELECTOR = '[data-element-id="chat-input-textbox"]';
  const BOUND_ATTRIBUTE = 'data-tm-draft-restore-bound';
  const SAVE_DELAY_MS = 300;
  const RESTORE_DELAY_MS = 150;

  let saveTimerId = null;
  let lastBoundTextarea = null;
  let textareaHadContent = false;

  const log = (...messages) => console.log('[TM Draft Restore]', ...messages);

  function readDraft() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (error) {
      log('storage read error', error);
      return '';
    }
  }

  function writeDraft(value) {
    try {
      const normalized = typeof value === 'string' && value.trim() ? value : '';

      if (normalized) {
        localStorage.setItem(STORAGE_KEY, normalized);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      log('storage write error', error);
    }
  }

  function getTextarea() {
    const textarea = document.querySelector(TEXTAREA_SELECTOR);
    return textarea instanceof HTMLTextAreaElement ? textarea : null;
  }

  function setTextareaValue(textarea, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    if (setter) {
      setter.call(textarea, value);
    } else {
      textarea.value = value;
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function isStaleTextarea(textarea) {
    return Boolean(textarea && textarea !== getTextarea() && !textarea.isConnected);
  }

  function persistTextareaValue(textarea = getTextarea()) {
    if (!textarea || isStaleTextarea(textarea)) return;

    if (saveTimerId) {
      window.clearTimeout(saveTimerId);
      saveTimerId = null;
    }

    writeDraft(textarea.value);
  }

  function schedulePersist(textarea) {
    if (saveTimerId) {
      window.clearTimeout(saveTimerId);
    }

    if (textarea.value.trim()) {
      textareaHadContent = true;
    }

    if (!textarea.value.trim()) {
      persistTextareaValue(textarea);
      return;
    }

    saveTimerId = window.setTimeout(() => {
      saveTimerId = null;
      if (!isStaleTextarea(textarea)) persistTextareaValue(textarea);
    }, SAVE_DELAY_MS);
  }

  function restoreDraft(textarea = getTextarea()) {
    if (!textarea || textarea.value.length > 0) return;

    const draft = readDraft();
    if (!draft) return;

    setTextareaValue(textarea, draft);
    log('restored draft');

    try {
      textarea.setSelectionRange(draft.length, draft.length);
    } catch (_error) {
      // Ignore selection errors.
    }
  }

  function restoreDraftAfterDelay(textarea = getTextarea()) {
    // Give TM a moment to fill the textarea with its own draft for existing chats.
    // If the textarea is still empty after the delay, restore ours.
    setTimeout(() => {
      if (textarea && textarea.isConnected) restoreDraft(textarea);
    }, RESTORE_DELAY_MS);
  }

  function bindTextarea(textarea) {
    if (!textarea) return;

    if (textarea.getAttribute(BOUND_ATTRIBUTE) === 'true') {
      lastBoundTextarea = textarea;
      return;
    }

    textarea.setAttribute(BOUND_ATTRIBUTE, 'true');
    textarea.addEventListener('input', () => schedulePersist(textarea));
    textarea.addEventListener('blur', () => persistTextareaValue(textarea));

    textareaHadContent = false;
    restoreDraftAfterDelay(textarea);
    lastBoundTextarea = textarea;
    log('textarea bound');
  }

  // --- Lifecycle -------------------------------------------------------------

  const observer = new MutationObserver(() => {
    const textarea = getTextarea();
    bindTextarea(textarea);

    if (textarea && textarea.getAttribute(BOUND_ATTRIBUTE) === 'true' && !textarea.value.trim() && textareaHadContent) {
      textareaHadContent = false;
      writeDraft('');
    }
  });

  function handlePageHide() {
    const textarea = getTextarea() || (lastBoundTextarea && lastBoundTextarea.isConnected ? lastBoundTextarea : null);
    persistTextareaValue(textarea);
  }

  function start() {
    bindTextarea(getTextarea());

    if (document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
    }

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handlePageHide();
    });

    log('extension loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
    return;
  }

  start();
})();
