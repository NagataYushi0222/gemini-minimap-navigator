/**
 * Shared types for Gemini Minimap Navigator
 */
export const DEFAULT_SETTINGS = {
    width: 70,
    darkMode: true,
    userColor: '#8ab4f8',
    geminiColor: '#e8eaed',
    opacity: 0.6,
    userGif: '',
    geminiGif: ''
};
/**
 * Load settings from Chrome storage
 */
export async function loadSettings() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                resolve(result);
            });
        }
        else {
            // Fallback to localStorage for development
            try {
                const saved = localStorage.getItem('gemini-minimap-settings');
                if (saved) {
                    resolve({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
                }
                else {
                    resolve(DEFAULT_SETTINGS);
                }
            }
            catch {
                resolve(DEFAULT_SETTINGS);
            }
        }
    });
}
/**
 * Save settings to Chrome storage
 */
export async function saveSettings(settings) {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.sync.set(settings, () => {
                resolve();
            });
        }
        else {
            // Fallback to localStorage for development
            try {
                localStorage.setItem('gemini-minimap-settings', JSON.stringify(settings));
            }
            catch {
                // ignore
            }
            resolve();
        }
    });
}
