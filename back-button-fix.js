// == TypingMind Extension: Android back-button fix ============================
// Prevents the Android PWA from closing when pressing the back button.
// Instead, closes any open sidebar, modal, or popup first.
// v0.1 - 2026-03-31
(() => {
  const log = (...messages) => console.log('[TM Back Button]', ...messages);

  // Selectors for closeable overlays (checked in priority order).
  const CLOSEABLE_SELECTORS = [
    '[data-element-id="side-bar-background"]',       // sidebar backdrop
    '[id^="headlessui-dialog-"]',                     // headlessui modals
    '[id^="headlessui-popover-panel-"]',              // headlessui popovers
  ];

  function tryCloseOverlay() {
    for (const selector of CLOSEABLE_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) {
        el.click();
        log('closed overlay via', selector);
        return true;
      }
    }
    return false;
  }

  function pushGuardState() {
    window.history.pushState({ tmBackGuard: true }, '');
  }

  function handlePopState(event) {
    // Only handle our guard states — let real navigation through.
    if (!event.state?.tmBackGuard) {
      pushGuardState();
      return;
    }

    tryCloseOverlay();

    // Re-push so the next back press is caught too.
    pushGuardState();
  }

  function start() {
    pushGuardState();
    window.addEventListener('popstate', handlePopState);
    log('extension loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
    return;
  }

  start();
})();
