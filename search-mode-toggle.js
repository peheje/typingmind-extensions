// == TypingMind Extension: Search-mode toggle =============================
// v0.5 – 2025-10-13
(() => {

  const STORAGE_KEY     = 'TM_searchModeOn';
  const SEARCH_SUFFIX   = ':search';
  const PLUGIN_CONTAINER_SEL = '.sm\\:relative'; 
  
  const log   = (...m) => console.log('[Search-mode]', ...m);
  const isOn  = ()    => localStorage.getItem(STORAGE_KEY) === 'true';
  const setOn = v     => localStorage.setItem(STORAGE_KEY, v);

 
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    try {
      if (typeof input === 'string' && /\/chat\/completions/.test(input) && init.body) {
        const body = JSON.parse(init.body);
        if (isOn()) {
          if (!body.model.endsWith(SEARCH_SUFFIX)) body.model += SEARCH_SUFFIX;
        } else {
          body.model = body.model.replace(new RegExp(SEARCH_SUFFIX + '$'), '');
        }
        init.body = JSON.stringify(body);
      }
    } catch (err) {
      log('fetch patch error', err);
    }
    return nativeFetch.call(this, input, init);
  };

 
  function makeSwitch() {
    const container = document.createElement('div');
    container.id = 'tm-search-toggle-container';
    container.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-left: 12px;
    `;
    container.title = 'Toggle :search sub-model (Alt+S)';

    const label = document.createElement('span');
    label.textContent = '🔍';
    label.style.cssText = `
      font-size: 16px;
      user-select: none;
    `;

    const switchWrapper = document.createElement('label');
    switchWrapper.style.cssText = `
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      cursor: pointer;
    `;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = isOn();
    input.style.cssText = `
      opacity: 0;
      width: 0;
      height: 0;
    `;

    const slider = document.createElement('span');
    slider.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      border-radius: 24px;
      transition: 0.3s;
    `;

    const knob = document.createElement('span');
    knob.style.cssText = `
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      border-radius: 50%;
      transition: 0.3s;
    `;
    slider.appendChild(knob);

    const updateSwitch = () => {
      const active = isOn();
      input.checked = active;
      slider.style.backgroundColor = active ? 'rgb(59, 130, 246)' : '#ccc';
      knob.style.transform = active ? 'translateX(20px)' : 'translateX(0)';
    };

    input.onchange = () => {
      setOn(input.checked);
      updateSwitch();
    };

    switchWrapper.appendChild(input);
    switchWrapper.appendChild(slider);
    
    container.appendChild(label);
    container.appendChild(switchWrapper);

    document.addEventListener('keydown', e => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        input.checked = !input.checked;
        input.onchange();
      }
    });

    updateSwitch();
    return container;
  }

 
  const observer = new MutationObserver(() => {
    if (document.getElementById('tm-search-toggle-container')) return;
    
    const pluginContainer = document.querySelector(PLUGIN_CONTAINER_SEL);
    
    if (pluginContainer) {
      pluginContainer.parentElement.insertBefore(makeSwitch(), pluginContainer.nextSibling);
      log('Toggle switch injected after plugin selector');
    }
  });
  observer.observe(document.body, {subtree: true, childList: true});

  log('extension loaded');
})();
