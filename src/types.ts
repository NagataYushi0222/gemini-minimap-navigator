/**
 * Shared types for Gemini Minimap Navigator
 */

export interface MinimapSettings {
    width: number;
    darkMode: boolean;
    userColor: string;
    geminiColor: string;
    opacity: number;
    userGif: string;
    geminiGif: string;
}

export const DEFAULT_SETTINGS: MinimapSettings = {
    width: 70,
    darkMode: true,
    userColor: '#8ab4f8',
    geminiColor: '#e8eaed',
    opacity: 0.6,
    userGif: '',
    geminiGif: ''
};

export interface MessageData {
    element: Element;
    type: 'user' | 'gemini';
    text: string;
    top: number;
    height: number;
}

/**
 * Load settings from Chrome storage
 */
export async function loadSettings(): Promise<MinimapSettings> {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                resolve(result as MinimapSettings);
            });
        } else {
            // Fallback to localStorage for development
            try {
                const saved = localStorage.getItem('gemini-minimap-settings');
                if (saved) {
                    resolve({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
                } else {
                    resolve(DEFAULT_SETTINGS);
                }
            } catch {
                resolve(DEFAULT_SETTINGS);
            }
        }
    });
}

/**
 * Save settings to Chrome storage
 */
export async function saveSettings(settings: MinimapSettings): Promise<void> {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.sync.set(settings, () => {
                resolve();
            });
        } else {
            // Fallback to localStorage for development
            try {
                localStorage.setItem('gemini-minimap-settings', JSON.stringify(settings));
            } catch {
                // ignore
            }
            resolve();
        }
    });
}
