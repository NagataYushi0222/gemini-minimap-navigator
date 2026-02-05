/**
 * Gemini Minimap Navigator
 * カスタマイズ可能なミニマップナビゲーター
 */

(function () {
  'use strict';

  // デフォルト設定
  const DEFAULT_SETTINGS = {
    width: 70,
    darkMode: true,
    userColor: '#8ab4f8',
    geminiColor: '#e8eaed',
    opacity: 0.6,
    userGif: '',
    geminiGif: ''
  };

  const CONFIG = {
    SCROLL_BEHAVIOR: 'smooth',
    TOOLTIP_CHAR_LIMIT: 100,
    DEBOUNCE_DELAY: 250,
    STORAGE_KEY: 'gemini-minimap-settings'
  };

  let settings = { ...DEFAULT_SETTINGS };
  let minimapContainer = null;
  let minimapContent = null;
  let viewportIndicator = null;
  let tooltip = null;
  let settingsPanel = null;
  let messageObserver = null;
  let scrollContainer = null;
  let isInitialized = false;
  let cachedMessages = [];

  // 設定を読み込み
  function loadSettings() {
    try {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (saved) {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.log('[Gemini Navigator] Could not load settings');
    }

    // ページのテーマを検出してデフォルト設定
    if (!localStorage.getItem(CONFIG.STORAGE_KEY)) {
      const isDark = document.documentElement.classList.contains('dark') ||
        document.body.style.backgroundColor?.includes('rgb(') &&
        parseInt(document.body.style.backgroundColor.match(/\d+/)?.[0] || 255) < 128;
      settings.darkMode = isDark;
    }
  }

  // 設定を保存
  function saveSettings() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.log('[Gemini Navigator] Could not save settings');
    }
  }

  function init() {
    if (isInitialized) return;

    loadSettings();

    scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      setTimeout(init, 1000);
      return;
    }

    createMinimap();
    createSettingsPanel();
    updateMinimap();
    setupObservers();
    applySettings();
    isInitialized = true;
    console.log('[Gemini Navigator] Initialized');
  }

  function findScrollContainer() {
    const selectors = ['main', '[role="main"]'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.scrollHeight > el.clientHeight) {
        return el;
      }
    }
    return document.documentElement;
  }

  function createMinimap() {
    const existing = document.getElementById('gemini-minimap');
    if (existing) existing.remove();
    const existingTooltip = document.querySelector('.minimap-tooltip');
    if (existingTooltip) existingTooltip.remove();

    minimapContainer = document.createElement('div');
    minimapContainer.id = 'gemini-minimap';

    // 設定ボタン
    const settingsBtn = document.createElement('div');
    settingsBtn.id = 'gemini-minimap-settings-btn';
    settingsBtn.innerHTML = '⚙';
    settingsBtn.title = '設定';
    settingsBtn.addEventListener('click', toggleSettings);
    minimapContainer.appendChild(settingsBtn);

    minimapContent = document.createElement('div');
    minimapContent.id = 'gemini-minimap-content';
    minimapContainer.appendChild(minimapContent);

    viewportIndicator = document.createElement('div');
    viewportIndicator.id = 'gemini-minimap-viewport';
    minimapContent.appendChild(viewportIndicator);

    tooltip = document.createElement('div');
    tooltip.className = 'minimap-tooltip';
    tooltip.style.display = 'none';

    document.body.appendChild(minimapContainer);
    document.body.appendChild(tooltip);

    minimapContent.addEventListener('click', handleBlockClick);
    minimapContent.addEventListener('mouseenter', handleBlockHover, true);
    minimapContent.addEventListener('mouseleave', handleBlockLeave, true);

    const scrollTarget = scrollContainer === document.documentElement ? window : scrollContainer;
    scrollTarget.addEventListener('scroll', debounce(updateViewport, 30));
    window.addEventListener('resize', debounce(updateViewport, 100));
  }

  function createSettingsPanel() {
    const existing = document.getElementById('gemini-minimap-panel');
    if (existing) existing.remove();

    settingsPanel = document.createElement('div');
    settingsPanel.id = 'gemini-minimap-panel';
    settingsPanel.style.display = 'none';

    settingsPanel.innerHTML = `
      <div class="minimap-panel-header">
        <span>ミニマップ設定</span>
        <span class="minimap-panel-close">✕</span>
      </div>
      <div class="minimap-panel-content">
        <div class="minimap-setting-group">
          <label>ダークモード</label>
          <input type="checkbox" id="setting-darkmode" ${settings.darkMode ? 'checked' : ''}>
        </div>
        <div class="minimap-setting-group">
          <label>幅: <span id="width-value">${settings.width}px</span></label>
          <input type="range" id="setting-width" min="40" max="120" value="${settings.width}">
        </div>
        <div class="minimap-setting-group">
          <label>透明度: <span id="opacity-value">${Math.round(settings.opacity * 100)}%</span></label>
          <input type="range" id="setting-opacity" min="20" max="100" value="${settings.opacity * 100}">
        </div>
        <div class="minimap-setting-group">
          <label>ユーザーブロック色</label>
          <input type="color" id="setting-usercolor" value="${settings.userColor}">
        </div>
        <div class="minimap-setting-group">
          <label>AIブロック色</label>
          <input type="color" id="setting-geminicolor" value="${settings.geminiColor}">
        </div>
        <div class="minimap-setting-group">
          <label>ユーザーGIF URL</label>
          <input type="text" id="setting-usergif" value="${settings.userGif}" placeholder="https://...gif">
        </div>
        <div class="minimap-setting-group">
          <label>AI GIF URL</label>
          <input type="text" id="setting-geminigif" value="${settings.geminiGif}" placeholder="https://...gif">
        </div>
        <button id="minimap-reset-btn">デフォルトに戻す</button>
      </div>
    `;

    document.body.appendChild(settingsPanel);

    // イベントリスナー
    settingsPanel.querySelector('.minimap-panel-close').addEventListener('click', toggleSettings);
    settingsPanel.querySelector('#setting-darkmode').addEventListener('change', (e) => {
      settings.darkMode = e.target.checked;
      saveSettings();
      applySettings();
    });
    settingsPanel.querySelector('#setting-width').addEventListener('input', (e) => {
      settings.width = parseInt(e.target.value);
      document.getElementById('width-value').textContent = settings.width + 'px';
      saveSettings();
      applySettings();
    });
    settingsPanel.querySelector('#setting-opacity').addEventListener('input', (e) => {
      settings.opacity = parseInt(e.target.value) / 100;
      document.getElementById('opacity-value').textContent = Math.round(settings.opacity * 100) + '%';
      saveSettings();
      applySettings();
    });
    settingsPanel.querySelector('#setting-usercolor').addEventListener('input', (e) => {
      settings.userColor = e.target.value;
      saveSettings();
      applySettings();
      updateMinimap();
    });
    settingsPanel.querySelector('#setting-geminicolor').addEventListener('input', (e) => {
      settings.geminiColor = e.target.value;
      saveSettings();
      applySettings();
      updateMinimap();
    });
    settingsPanel.querySelector('#setting-usergif').addEventListener('change', (e) => {
      settings.userGif = e.target.value;
      saveSettings();
      updateMinimap();
    });
    settingsPanel.querySelector('#setting-geminigif').addEventListener('change', (e) => {
      settings.geminiGif = e.target.value;
      saveSettings();
      updateMinimap();
    });
    settingsPanel.querySelector('#minimap-reset-btn').addEventListener('click', () => {
      settings = { ...DEFAULT_SETTINGS };
      saveSettings();
      applySettings();
      updateSettingsUI();
      updateMinimap();
    });
  }

  function updateSettingsUI() {
    if (!settingsPanel) return;
    settingsPanel.querySelector('#setting-darkmode').checked = settings.darkMode;
    settingsPanel.querySelector('#setting-width').value = settings.width;
    settingsPanel.querySelector('#width-value').textContent = settings.width + 'px';
    settingsPanel.querySelector('#setting-opacity').value = settings.opacity * 100;
    settingsPanel.querySelector('#opacity-value').textContent = Math.round(settings.opacity * 100) + '%';
    settingsPanel.querySelector('#setting-usercolor').value = settings.userColor;
    settingsPanel.querySelector('#setting-geminicolor').value = settings.geminiColor;
    settingsPanel.querySelector('#setting-usergif').value = settings.userGif;
    settingsPanel.querySelector('#setting-geminigif').value = settings.geminiGif;
  }

  function toggleSettings() {
    if (!settingsPanel) return;
    const isVisible = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = isVisible ? 'none' : 'block';
  }

  function applySettings() {
    if (!minimapContainer) return;

    const isDark = settings.darkMode;

    minimapContainer.style.width = settings.width + 'px';
    minimapContainer.style.opacity = settings.opacity;

    if (isDark) {
      minimapContainer.style.background = 'rgba(32, 33, 36, 0.85)';
      minimapContainer.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    } else {
      minimapContainer.style.background = 'rgba(255, 255, 255, 0.9)';
      minimapContainer.style.borderColor = 'rgba(0, 0, 0, 0.1)';
    }

    // 設定パネルのテーマ
    if (settingsPanel) {
      if (isDark) {
        settingsPanel.classList.add('dark');
        settingsPanel.classList.remove('light');
      } else {
        settingsPanel.classList.add('light');
        settingsPanel.classList.remove('dark');
      }
    }

    // ツールチップのテーマ
    if (tooltip) {
      if (isDark) {
        tooltip.style.background = 'rgba(41, 42, 45, 0.95)';
        tooltip.style.color = 'rgba(232, 234, 237, 0.9)';
      } else {
        tooltip.style.background = 'rgba(255, 255, 255, 0.95)';
        tooltip.style.color = 'rgba(32, 33, 36, 0.9)';
      }
    }
  }

  function handleBlockClick(e) {
    const block = e.target.closest('.minimap-block');
    if (!block) return;

    const index = parseInt(block.dataset.index, 10);
    if (isNaN(index) || index < 0 || index >= cachedMessages.length) return;

    const msg = cachedMessages[index];
    if (!msg || !msg.element) return;

    if (!document.contains(msg.element)) {
      updateMinimap();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    msg.element.scrollIntoView({ behavior: CONFIG.SCROLL_BEHAVIOR, block: 'center' });

    const originalBg = msg.element.style.backgroundColor;
    msg.element.style.transition = 'background-color 0.2s';
    msg.element.style.backgroundColor = 'rgba(138, 180, 248, 0.2)';
    setTimeout(() => {
      msg.element.style.backgroundColor = originalBg;
    }, 1000);
  }

  function handleBlockHover(e) {
    const block = e.target.closest('.minimap-block');
    if (!block) return;

    const index = parseInt(block.dataset.index, 10);
    if (isNaN(index) || index < 0 || index >= cachedMessages.length) return;

    const msg = cachedMessages[index];
    if (msg) {
      showTooltip(msg.text, e.clientY);

      // GIFがある場合、ホバー時に表示
      const gifUrl = msg.type === 'user' ? settings.userGif : settings.geminiGif;
      if (gifUrl) {
        block.style.backgroundImage = `url(${gifUrl})`;
        block.style.backgroundSize = 'cover';
        block.style.backgroundPosition = 'center';
      }
    }
  }

  function handleBlockLeave(e) {
    const block = e.target.closest('.minimap-block');
    if (!block) return;

    hideTooltip();

    // GIFを非表示（元の色に戻す）
    block.style.backgroundImage = '';
  }

  function parseMessages() {
    const messages = [];
    const processedElements = new Set();

    const turns = document.querySelectorAll('[class*="conversation-turn"], [class*="turn-content"], .chat-turn');

    if (turns.length > 0) {
      turns.forEach(turn => {
        const userQuery = turn.querySelector('user-query, [class*="user-query"], [class*="query-content"]');
        const modelResponse = turn.querySelector('model-response, [class*="model-response"], [class*="response-content"]');

        if (userQuery && !processedElements.has(userQuery)) {
          processedElements.add(userQuery);
          addMessage(messages, userQuery, 'user');
        }
        if (modelResponse && !processedElements.has(modelResponse)) {
          processedElements.add(modelResponse);
          addMessage(messages, modelResponse, 'gemini');
        }
      });
    }

    if (messages.length === 0) {
      const userSelectors = ['user-query', '[data-message-author-role="user"]', '.user-query-content'];
      for (const selector of userSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            if (!processedElements.has(el) && !isNestedIn(el, processedElements)) {
              processedElements.add(el);
              addMessage(messages, el, 'user');
            }
          });
          break;
        }
      }

      const geminiSelectors = ['model-response', '[data-message-author-role="model"]', '.model-response-content'];
      for (const selector of geminiSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            if (!processedElements.has(el) && !isNestedIn(el, processedElements)) {
              processedElements.add(el);
              addMessage(messages, el, 'gemini');
            }
          });
          break;
        }
      }
    }

    return messages.sort((a, b) => a.top - b.top);
  }

  function isNestedIn(element, processedSet) {
    for (const processed of processedSet) {
      if (processed.contains(element) && processed !== element) {
        return true;
      }
    }
    return false;
  }

  function addMessage(messages, element, type) {
    const rect = element.getBoundingClientRect();
    const text = element.textContent?.trim() || '';

    if (text.length > 0 && rect.height > 20) {
      messages.push({
        element: element,
        type: type,
        text: text,
        top: rect.top + window.scrollY,
        height: rect.height
      });
    }
  }

  function updateMinimap() {
    if (!minimapContent) return;

    const messages = parseMessages();
    cachedMessages = messages;

    Array.from(minimapContent.children).forEach(child => {
      if (child !== viewportIndicator) {
        child.remove();
      }
    });

    if (messages.length === 0) {
      return;
    }

    const count = messages.length;
    const minimapHeight = minimapContent.clientHeight - 16;

    const gapPerBlock = Math.max(1, Math.min(6, 8 - count * 0.3));
    const totalGap = gapPerBlock * (count - 1);
    const availableHeight = minimapHeight - totalGap;
    const baseBlockHeight = availableHeight / count;

    const minHeight = 3;
    const maxHeight = 50;

    messages.forEach((msg, index) => {
      const block = document.createElement('div');
      block.className = `minimap-block ${msg.type}`;

      const totalContentHeight = messages.reduce((sum, m) => sum + m.height, 0);
      const contentRatio = msg.height / totalContentHeight;
      let blockHeight = baseBlockHeight * (0.5 + contentRatio * count * 0.5);
      blockHeight = Math.max(minHeight, Math.min(maxHeight, blockHeight));

      block.style.height = `${blockHeight}px`;
      block.style.marginBottom = `${gapPerBlock}px`;

      const widthScale = Math.max(0.5, Math.min(1, 1.2 - count * 0.025));
      if (msg.type === 'user') {
        block.style.width = `${60 * widthScale + 20}%`;
        block.style.backgroundColor = settings.userColor;
        block.style.marginLeft = 'auto';
      } else {
        block.style.width = `${75 * widthScale + 15}%`;
        block.style.backgroundColor = settings.geminiColor;
        block.style.marginRight = 'auto';
      }

      block.dataset.index = index;
      minimapContent.appendChild(block);
    });

    updateViewport();
  }

  function updateViewport() {
    if (!viewportIndicator || !minimapContent) return;

    const scrollTop = scrollContainer === document.documentElement
      ? window.scrollY
      : scrollContainer.scrollTop;
    const viewportHeight = window.innerHeight;
    const scrollHeight = scrollContainer.scrollHeight;

    const minimapHeight = minimapContent.clientHeight;

    const ratio = minimapHeight / scrollHeight;
    const indicatorTop = scrollTop * ratio;
    const indicatorHeight = Math.max(30, viewportHeight * ratio);

    viewportIndicator.style.top = `${indicatorTop}px`;
    viewportIndicator.style.height = `${indicatorHeight}px`;
  }

  function showTooltip(text, clientY) {
    if (!tooltip) return;

    let preview = text.split('\n')[0].trim();
    if (preview.length > CONFIG.TOOLTIP_CHAR_LIMIT) {
      preview = preview.substring(0, CONFIG.TOOLTIP_CHAR_LIMIT) + '…';
    }

    tooltip.textContent = preview;
    tooltip.style.top = `${clientY}px`;
    tooltip.style.right = (settings.width + 20) + 'px';
    tooltip.style.display = 'block';
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.style.display = 'none';
  }

  function setupObservers() {
    messageObserver = new MutationObserver(debounce(() => {
      updateMinimap();
    }, CONFIG.DEBOUNCE_DELAY));

    messageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 500);
    });
  } else {
    setTimeout(init, 500);
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      isInitialized = false;
      setTimeout(init, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

})();
