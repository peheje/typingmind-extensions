// == TypingMind Extension: Search-mode toggle =============================
// v0.7 – 2025-10-13
(() => {

  const STORAGE_KEY           = 'TM_searchModeOn';
  const MODELS_SEARCH_SUPPORT = 'TM_modelsSearchSupport';
  const SEARCH_SUFFIX         = ':search';

  
  const log   = (...m) => console.log('[Search-mode]', ...m);
  const isOn  = ()    => localStorage.getItem(STORAGE_KEY) === 'true';
  const setOn = v     => localStorage.setItem(STORAGE_KEY, v);
  
  const getSearchSupportedModels = () => {
    const data = localStorage.getItem(MODELS_SEARCH_SUPPORT);
    return data ? JSON.parse(data) : {};
  };
  const setModelSearchSupport = (modelId, supported) => {
    const models = getSearchSupportedModels();
    models[modelId] = supported;
    localStorage.setItem(MODELS_SEARCH_SUPPORT, JSON.stringify(models));
  };
  const isModelSearchSupported = (modelId) => {
    return getSearchSupportedModels()[modelId] === true;
  };

  const getCurrentModel = () => {
    try {
      const chatSettings = localStorage.getItem('typingmind_chat_settings');
      if (chatSettings) {
        const settings = JSON.parse(chatSettings);
        return settings.model || null;
      }
    } catch (err) {
      log('Error getting current model', err);
    }
    return null;
  };

 
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
      display: none;
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
        const currentModel = getCurrentModel();
        if (currentModel && isModelSearchSupported(currentModel)) {
          input.checked = !input.checked;
          input.onchange();
        }
      }
    });

    updateSwitch();
    return container;
  }

  function updateSwitchVisibility() {
    const switchContainer = document.getElementById('tm-search-toggle-container');
    if (!switchContainer) return;

    const currentModel = getCurrentModel();
    if (currentModel && isModelSearchSupported(currentModel)) {
      switchContainer.style.display = 'inline-flex';
    } else {
      switchContainer.style.display = 'none';
    }
  }

  function injectSearchSupportCheckbox() {
    const modalContent = document.querySelector('[role="dialog"]');
    if (!modalContent) return;

    const hasModelIdInput = modalContent.querySelector('input[placeholder*="model"]') || 
                            modalContent.querySelector('label[for*="model"]');
    if (!hasModelIdInput) return;

    if (modalContent.querySelector('#tm-search-support-checkbox')) return;

    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.cssText = `
      margin-top: 16px;
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background-color: #f9fafb;
    `;

    const label = document.createElement('label');
    label.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 14px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'tm-search-support-checkbox';
    checkbox.style.cssText = `
      width: 16px;
      height: 16px;
      cursor: pointer;
    `;

    const labelText = document.createElement('span');
    labelText.textContent = '🔍 This model supports :search suffix';
    labelText.style.cssText = `
      user-select: none;
    `;

    label.appendChild(checkbox);
    label.appendChild(labelText);
    checkboxContainer.appendChild(label);

    const formGroups = modalContent.querySelectorAll('div.space-y-4, div.flex.flex-col, form > div');
    if (formGroups.length > 0) {
      const targetGroup = formGroups[0];
      targetGroup.appendChild(checkboxContainer);
      log('Search support checkbox injected');

      const modelIdInput = modalContent.querySelector('input[name*="model"], input[placeholder*="model"]');
      if (modelIdInput && modelIdInput.value) {
        checkbox.checked = isModelSearchSupported(modelIdInput.value);
      }

      checkbox.onchange = () => {
        if (modelIdInput && modelIdInput.value) {
          setModelSearchSupport(modelIdInput.value, checkbox.checked);
          log(`Model ${modelIdInput.value} search support:`, checkbox.checked);
          updateSwitchVisibility();
        }
      };
    }
  }

 
  const switchObserver = new MutationObserver(() => {
    if (document.getElementById('tm-search-toggle-container')) return;
    
    const relativeContainers = document.querySelectorAll('.sm\\:relative');
    let pluginContainer = null;
    relativeContainers.forEach(container => {
      const hasPluginBtn = container.querySelector('[id^="headlessui-menu-button-"]');
      if (hasPluginBtn) {
        pluginContainer = container;
      }
    });
    
    if (pluginContainer) {
      pluginContainer.parentElement.insertBefore(makeSwitch(), pluginContainer.nextSibling);
      log('Toggle switch injected');
      updateSwitchVisibility();
    }
  });
  switchObserver.observe(document.body, {subtree: true, childList: true});

  const modalObserver = new MutationObserver(() => {
    injectSearchSupportCheckbox();
  });
  modalObserver.observe(document.body, {subtree: true, childList: true});

  const storageObserver = new MutationObserver(() => {
    updateSwitchVisibility();
  });
  
  window.addEventListener('storage', (e) => {
    if (e.key === 'typingmind_chat_settings') {
      updateSwitchVisibility();
    }
  });

  setInterval(updateSwitchVisibility, 1000);

  log('extension loaded');
})();
