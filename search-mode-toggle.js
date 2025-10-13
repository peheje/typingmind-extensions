// == TypingMind Extension: Search-mode toggle =============================
// V0.1.0
(() => {
  const STORAGE_KEY = 'TM_searchModeOn';          
  const COMPLETIONS_REGEX = /\/v\d+\/chat\/completions/; 
  const SEARCH_SUFFIX = ':search';


  const isOn = () => localStorage.getItem(STORAGE_KEY) === 'true';
  const setOn = v => localStorage.setItem(STORAGE_KEY, v);

  const origFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    try {
      if (typeof input === 'string' && COMPLETIONS_REGEX.test(input) && init.body) {
        const payload = JSON.parse(init.body);

        if (isOn()) {
          if (!payload.model.endsWith(SEARCH_SUFFIX)) payload.model += SEARCH_SUFFIX;
        } else {
          payload.model = payload.model.replace(new RegExp(`${SEARCH_SUFFIX}$`), '');
        }
        init.body = JSON.stringify(payload);
      }
    } catch (e) {
      console.warn('[Search-mode] failed to patch payload', e);
    }
    return origFetch.call(this, input, init);
  };

  function makeToggleBtn(templateBtn) {
    const btn = document.createElement('button');
    btn.id = 'tm-search-toggle';
    btn.className = templateBtn.className;
    btn.style.marginLeft = '6px';
    btn.title = 'Toggle :search sub-model';
    btn.textContent = '🔍';                      

    const refreshStyle = () => {
      btn.style.backgroundColor = isOn() ? 'rgb(59 130 246)' : '';
      btn.style.color           = isOn() ? '#fff'            : '';
    };
    refreshStyle();

    btn.onclick = () => { setOn(!isOn()); refreshStyle(); };
    return btn;
  }

  const POLL_MS = 600;
  const poll = setInterval(() => {
    const sendBtn = document.querySelector('button[data-element-id="send-message-button"]');
    if (sendBtn && !document.getElementById('tm-search-toggle')) {
      sendBtn.parentElement.insertBefore(makeToggleBtn(sendBtn), sendBtn);
    }
  }, POLL_MS);

  window.addEventListener('beforeunload', () => clearInterval(poll));
})();
