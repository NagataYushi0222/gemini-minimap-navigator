/**
 * Gemini Minimap Navigator - Popup Script (TypeScript)
 */

import { MinimapSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from './types.js';

let settings: MinimapSettings;

async function init(): Promise<void> {
    settings = await loadSettings();
    updateUI();
    setupEventListeners();
}

function updateUI(): void {
    const darkModeCheckbox = document.getElementById('darkmode') as HTMLInputElement;
    const widthSlider = document.getElementById('width') as HTMLInputElement;
    const widthValue = document.getElementById('width-value') as HTMLSpanElement;
    const opacitySlider = document.getElementById('opacity') as HTMLInputElement;
    const opacityValue = document.getElementById('opacity-value') as HTMLSpanElement;
    const userColorInput = document.getElementById('usercolor') as HTMLInputElement;
    const geminiColorInput = document.getElementById('geminicolor') as HTMLInputElement;
    const userGifInput = document.getElementById('usergif') as HTMLInputElement;
    const geminiGifInput = document.getElementById('geminigif') as HTMLInputElement;

    darkModeCheckbox.checked = settings.darkMode;
    widthSlider.value = settings.width.toString();
    widthValue.textContent = settings.width + 'px';
    opacitySlider.value = (settings.opacity * 100).toString();
    opacityValue.textContent = Math.round(settings.opacity * 100) + '%';
    userColorInput.value = settings.userColor;
    geminiColorInput.value = settings.geminiColor;
    userGifInput.value = settings.userGif;
    geminiGifInput.value = settings.geminiGif;

    // テーマ適用
    document.body.classList.toggle('dark', settings.darkMode);
    document.body.classList.toggle('light', !settings.darkMode);
}

function setupEventListeners(): void {
    // ダークモード
    document.getElementById('darkmode')?.addEventListener('change', async (e) => {
        settings.darkMode = (e.target as HTMLInputElement).checked;
        document.body.classList.toggle('dark', settings.darkMode);
        document.body.classList.toggle('light', !settings.darkMode);
        await saveSettings(settings);
    });

    // 幅
    document.getElementById('width')?.addEventListener('input', async (e) => {
        settings.width = parseInt((e.target as HTMLInputElement).value);
        (document.getElementById('width-value') as HTMLSpanElement).textContent = settings.width + 'px';
        await saveSettings(settings);
    });

    // 透明度
    document.getElementById('opacity')?.addEventListener('input', async (e) => {
        settings.opacity = parseInt((e.target as HTMLInputElement).value) / 100;
        (document.getElementById('opacity-value') as HTMLSpanElement).textContent = Math.round(settings.opacity * 100) + '%';
        await saveSettings(settings);
    });

    // ユーザー色
    document.getElementById('usercolor')?.addEventListener('input', async (e) => {
        settings.userColor = (e.target as HTMLInputElement).value;
        await saveSettings(settings);
    });

    // Gemini色
    document.getElementById('geminicolor')?.addEventListener('input', async (e) => {
        settings.geminiColor = (e.target as HTMLInputElement).value;
        await saveSettings(settings);
    });

    // ユーザーGIF
    document.getElementById('usergif')?.addEventListener('change', async (e) => {
        settings.userGif = (e.target as HTMLInputElement).value.trim();
        await saveSettings(settings);
    });

    // GeminiGIF
    document.getElementById('geminigif')?.addEventListener('change', async (e) => {
        settings.geminiGif = (e.target as HTMLInputElement).value.trim();
        await saveSettings(settings);
    });

    // リセット
    document.getElementById('reset-btn')?.addEventListener('click', async () => {
        settings = { ...DEFAULT_SETTINGS };
        await saveSettings(settings);
        updateUI();
    });
}

document.addEventListener('DOMContentLoaded', init);
