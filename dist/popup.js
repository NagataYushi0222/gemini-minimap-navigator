/**
 * Gemini Minimap Navigator - Popup Script
 * Bundled single file for Chrome extension compatibility
 */

(function () {
    'use strict';

    const DEFAULT_SETTINGS = {
        minimapMode: 'block',
        magnificationScale: 1.6,
        width: 70,
        darkMode: true,
        userColor: '#8ab4f8',
        geminiColor: '#e8eaed',
        opacity: 0.6,
        tooltipOpacity: 0.95,
        userGif: '',
        geminiGif: ''
    };

    let settings = { ...DEFAULT_SETTINGS };

    async function loadSettings() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                    resolve(result);
                });
            } else {
                resolve({ ...DEFAULT_SETTINGS });
            }
        });
    }

    async function saveSettings(newSettings) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.set(newSettings, () => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    async function init() {
        settings = await loadSettings();
        updateUI();
        setupEventListeners();
    }

    function updateUI() {
        document.getElementById('minimap-mode').value = settings.minimapMode || 'block';
        document.getElementById('magnification').value = settings.magnificationScale || 1.6;
        document.getElementById('magnification-value').textContent = (settings.magnificationScale || 1.6) + 'x';
        document.getElementById('darkmode').checked = settings.darkMode;
        document.getElementById('width').value = settings.width;
        document.getElementById('width-value').textContent = settings.width + 'px';
        document.getElementById('opacity').value = settings.opacity * 100;
        document.getElementById('opacity-value').textContent = Math.round(settings.opacity * 100) + '%';
        document.getElementById('tooltip-opacity').value = settings.tooltipOpacity * 100;
        document.getElementById('tooltip-opacity-value').textContent = Math.round(settings.tooltipOpacity * 100) + '%';
        document.getElementById('usercolor').value = settings.userColor;
        document.getElementById('geminicolor').value = settings.geminiColor;
        document.getElementById('usergif').value = settings.userGif;
        document.getElementById('geminigif').value = settings.geminiGif;

        document.body.classList.toggle('dark', settings.darkMode);
        document.body.classList.toggle('light', !settings.darkMode);

        // Show/hide scale setting based on mode
        const scaleGroup = document.getElementById('scale-group');
        if (scaleGroup) {
            scaleGroup.style.display = settings.minimapMode === 'scaled' ? 'block' : 'none';
        }
    }

    function setupEventListeners() {
        document.getElementById('minimap-mode').addEventListener('change', async (e) => {
            settings.minimapMode = e.target.value;
            // Show/hide scale setting
            const scaleGroup = document.getElementById('scale-group');
            if (scaleGroup) {
                scaleGroup.style.display = settings.minimapMode === 'scaled' ? 'block' : 'none';
            }
            await saveSettings(settings);
        });

        document.getElementById('magnification').addEventListener('input', (e) => {
            settings.magnificationScale = parseFloat(e.target.value);
            document.getElementById('magnification-value').textContent = settings.magnificationScale + 'x';
        });

        document.getElementById('darkmode').addEventListener('change', async (e) => {
            settings.darkMode = e.target.checked;
            document.body.classList.toggle('dark', settings.darkMode);
            document.body.classList.toggle('light', !settings.darkMode);
            await saveSettings(settings);
        });

        document.getElementById('width').addEventListener('input', async (e) => {
            settings.width = parseInt(e.target.value);
            document.getElementById('width-value').textContent = settings.width + 'px';
            await saveSettings(settings);
        });

        document.getElementById('opacity').addEventListener('input', async (e) => {
            settings.opacity = parseInt(e.target.value) / 100;
            document.getElementById('opacity-value').textContent = Math.round(settings.opacity * 100) + '%';
            await saveSettings(settings);
        });

        document.getElementById('tooltip-opacity').addEventListener('input', async (e) => {
            settings.tooltipOpacity = parseInt(e.target.value) / 100;
            document.getElementById('tooltip-opacity-value').textContent = Math.round(settings.tooltipOpacity * 100) + '%';
            await saveSettings(settings);
        });

        document.getElementById('usercolor').addEventListener('input', async (e) => {
            settings.userColor = e.target.value;
            await saveSettings(settings);
        });

        document.getElementById('geminicolor').addEventListener('input', async (e) => {
            settings.geminiColor = e.target.value;
            await saveSettings(settings);
        });

        document.getElementById('usergif').addEventListener('change', async (e) => {
            settings.userGif = e.target.value.trim();
            await saveSettings(settings);
        });

        document.getElementById('geminigif').addEventListener('change', async (e) => {
            settings.geminiGif = e.target.value.trim();
            await saveSettings(settings);
        });

        document.getElementById('save-btn').addEventListener('click', async () => {
            await saveSettings(settings);
            const btn = document.getElementById('save-btn');
            btn.textContent = '✅ 保存しました！';
            setTimeout(() => {
                btn.textContent = '💾 設定を保存';
            }, 1500);
        });

        document.getElementById('reset-btn').addEventListener('click', async () => {
            settings = { ...DEFAULT_SETTINGS };
            await saveSettings(settings);
            updateUI();
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
