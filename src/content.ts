/**
 * Gemini Minimap Navigator - Content Script (TypeScript)
 */

import { MinimapSettings, MessageData, DEFAULT_SETTINGS, loadSettings } from './types.js';

const CONFIG = {
    SCROLL_BEHAVIOR: 'smooth' as ScrollBehavior,
    TOOLTIP_CHAR_LIMIT: 100,
    DEBOUNCE_DELAY: 250
};

let settings: MinimapSettings = { ...DEFAULT_SETTINGS };
let minimapContainer: HTMLElement | null = null;
let minimapContent: HTMLElement | null = null;
let viewportIndicator: HTMLElement | null = null;
let tooltip: HTMLElement | null = null;
let scrollContainer: HTMLElement | null = null;
let isInitialized = false;
let cachedMessages: MessageData[] = [];

async function init(): Promise<void> {
    if (isInitialized) return;

    settings = await loadSettings();

    scrollContainer = findScrollContainer();
    if (!scrollContainer) {
        setTimeout(init, 1000);
        return;
    }

    createMinimap();
    updateMinimap();
    setupObservers();
    isInitialized = true;
    console.log('[Gemini Navigator] Initialized');
}

function findScrollContainer(): HTMLElement | null {
    const selectors = ['main', '[role="main"]'];
    for (const selector of selectors) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el && el.scrollHeight > el.clientHeight) {
            return el;
        }
    }
    return document.documentElement as HTMLElement;
}

function createMinimap(): void {
    document.getElementById('gemini-minimap')?.remove();
    document.querySelector('.minimap-tooltip')?.remove();

    minimapContainer = document.createElement('div');
    minimapContainer.id = 'gemini-minimap';

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
    scrollTarget?.addEventListener('scroll', debounce(updateViewport, 30));
    window.addEventListener('resize', debounce(updateViewport, 100));

    applySettings();
}

function applySettings(): void {
    if (!minimapContainer) return;

    minimapContainer.style.width = settings.width + 'px';
    minimapContainer.style.setProperty('--minimap-opacity', settings.opacity.toString());

    if (settings.darkMode) {
        minimapContainer.classList.add('dark');
        minimapContainer.classList.remove('light');
    } else {
        minimapContainer.classList.add('light');
        minimapContainer.classList.remove('dark');
    }

    if (tooltip) {
        if (settings.darkMode) {
            tooltip.classList.add('dark');
            tooltip.classList.remove('light');
        } else {
            tooltip.classList.add('light');
            tooltip.classList.remove('dark');
        }
    }
}

function handleBlockClick(e: Event): void {
    const target = e.target as HTMLElement;
    const block = target.closest('.minimap-block');
    if (!block) return;

    const index = parseInt(block.getAttribute('data-index') || '-1', 10);
    if (index < 0 || index >= cachedMessages.length) return;

    const msg = cachedMessages[index];
    if (!msg?.element || !document.contains(msg.element)) {
        updateMinimap();
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    msg.element.scrollIntoView({ behavior: CONFIG.SCROLL_BEHAVIOR, block: 'center' });

    const el = msg.element as HTMLElement;
    const originalBg = el.style.backgroundColor;
    el.style.transition = 'background-color 0.2s';
    el.style.backgroundColor = 'rgba(138, 180, 248, 0.2)';
    setTimeout(() => {
        el.style.backgroundColor = originalBg;
    }, 1000);
}

function handleBlockHover(e: Event): void {
    const target = e.target as HTMLElement;
    const block = target.closest('.minimap-block') as HTMLElement | null;
    if (!block) return;

    const index = parseInt(block.getAttribute('data-index') || '-1', 10);
    if (index < 0 || index >= cachedMessages.length) return;

    const msg = cachedMessages[index];
    if (msg) {
        showTooltip(msg.text, (e as MouseEvent).clientY);

        // GIFを表示
        const gifUrl = msg.type === 'user' ? settings.userGif : settings.geminiGif;
        if (gifUrl && gifUrl.trim()) {
            block.style.backgroundImage = `url("${gifUrl}")`;
            block.style.backgroundSize = 'cover';
            block.style.backgroundPosition = 'center';
            block.classList.add('has-gif');
        }
    }
}

function handleBlockLeave(e: Event): void {
    const target = e.target as HTMLElement;
    const block = target.closest('.minimap-block') as HTMLElement | null;
    if (!block) return;

    hideTooltip();
    block.style.backgroundImage = '';
    block.classList.remove('has-gif');
}

function parseMessages(): MessageData[] {
    const messages: MessageData[] = [];
    const processedElements = new Set<Element>();

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
        const userSelectors = ['user-query', '[data-message-author-role="user"]'];
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

        const geminiSelectors = ['model-response', '[data-message-author-role="model"]'];
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

function isNestedIn(element: Element, processedSet: Set<Element>): boolean {
    for (const processed of processedSet) {
        if (processed.contains(element) && processed !== element) {
            return true;
        }
    }
    return false;
}

function addMessage(messages: MessageData[], element: Element, type: 'user' | 'gemini'): void {
    const rect = element.getBoundingClientRect();
    const text = element.textContent?.trim() || '';

    if (text.length > 0 && rect.height > 20) {
        messages.push({
            element,
            type,
            text,
            top: rect.top + window.scrollY,
            height: rect.height
        });
    }
}

function updateMinimap(): void {
    if (!minimapContent) return;

    const messages = parseMessages();
    cachedMessages = messages;

    Array.from(minimapContent.children).forEach(child => {
        if (child !== viewportIndicator) {
            child.remove();
        }
    });

    if (messages.length === 0) return;

    const count = messages.length;
    const minimapHeight = minimapContent.clientHeight - 16;

    const gapPerBlock = Math.max(1, Math.min(6, 8 - count * 0.3));
    const totalGap = gapPerBlock * (count - 1);
    const availableHeight = minimapHeight - totalGap;
    const baseBlockHeight = availableHeight / count;

    const minHeight = 3;
    const maxHeight = 50;
    const totalContentHeight = messages.reduce((sum, m) => sum + m.height, 0);

    messages.forEach((msg, index) => {
        const block = document.createElement('div');
        block.className = `minimap-block ${msg.type}`;

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

        block.setAttribute('data-index', index.toString());
        minimapContent!.appendChild(block);
    });

    updateViewport();
}

function updateViewport(): void {
    if (!viewportIndicator || !minimapContent || !scrollContainer) return;

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

function showTooltip(text: string, clientY: number): void {
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

function hideTooltip(): void {
    if (!tooltip) return;
    tooltip.style.display = 'none';
}

function setupObservers(): void {
    const messageObserver = new MutationObserver(debounce(() => {
        updateMinimap();
    }, CONFIG.DEBOUNCE_DELAY));

    messageObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 設定変更を監視
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes) => {
            let needsUpdate = false;
            const settingsAny = settings as unknown as { [key: string]: unknown };
            for (const key of Object.keys(changes)) {
                if (key in settings) {
                    settingsAny[key] = changes[key].newValue;
                    needsUpdate = true;
                }
            }
            if (needsUpdate) {
                applySettings();
                updateMinimap();
            }
        });
    }
}

function debounce<T extends (...args: unknown[]) => void>(func: T, wait: number): T {
    let timeout: ReturnType<typeof setTimeout>;
    return function executedFunction(...args: unknown[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    } as T;
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init, 500);
    });
} else {
    setTimeout(init, 500);
}

// SPA navigation support
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        isInitialized = false;
        setTimeout(init, 1000);
    }
}).observe(document, { subtree: true, childList: true });
