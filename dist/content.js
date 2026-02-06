/**
 * Gemini Minimap Navigator - Content Script
 * Bundled single file for Chrome extension compatibility
 */

(function () {
    'use strict';

    // === Types & Defaults ===
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

    const CONFIG = {
        SCROLL_BEHAVIOR: 'smooth',
        TOOLTIP_CHAR_LIMIT: 100,
        DEBOUNCE_DELAY: 500
    };

    // === State ===
    let settings = { ...DEFAULT_SETTINGS };
    let minimapContainer = null;
    let minimapContent = null;
    let viewportIndicator = null;
    let tooltip = null;
    let scrollContainer = null;
    let isInitialized = false;
    let cachedMessages = [];
    let currentHoveredBlock = null;

    // === Storage Functions ===
    async function loadSettings() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                    console.log('[Gemini Navigator] Settings loaded:', result);
                    resolve(result);
                });
            } else {
                resolve({ ...DEFAULT_SETTINGS });
            }
        });
    }

    // === Initialize ===
    async function init() {
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

    function findScrollContainer() {
        // Try various selectors for Gemini's scroll container
        const selectors = [
            'main',
            '[role="main"]',
            '.conversation-container',
            '[class*="conversation"]',
            '[class*="chat-container"]'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.scrollHeight > el.clientHeight) {
                console.log('[Gemini Navigator] Found scroll container:', selector);
                return el;
            }
        }
        // Fallback: find any scrollable element
        const allElements = document.querySelectorAll('div');
        for (const el of allElements) {
            if (el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 200) {
                console.log('[Gemini Navigator] Found scrollable div');
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

        // Use mouseover/mouseout for delegation (bubbles, unlike mouseenter/mouseleave)
        minimapContent.addEventListener('click', handleBlockClick, false);
        minimapContent.addEventListener('mouseover', handleBlockHover, false);
        minimapContent.addEventListener('mouseout', handleBlockLeave, false);

        // Listen to all possible scroll sources for real-time viewport updates
        const scrollUpdate = () => requestAnimationFrame(updateViewport);

        // Window scroll
        window.addEventListener('scroll', scrollUpdate, { passive: true, capture: true });

        // Scroll container scroll
        if (scrollContainer && scrollContainer !== document.documentElement) {
            scrollContainer.addEventListener('scroll', scrollUpdate, { passive: true });
        }

        // Find and listen to all scrollable elements (Gemini uses nested scroll containers)
        document.querySelectorAll('main, [role="main"], div').forEach(el => {
            if (el.scrollHeight > el.clientHeight + 50) {
                el.addEventListener('scroll', scrollUpdate, { passive: true });
            }
        });

        window.addEventListener('resize', debounce(updateViewport, 100));


        applySettings();
    }

    function applySettings() {
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
            tooltip.style.setProperty('--tooltip-opacity', settings.tooltipOpacity.toString());
        }
    }

    function handleBlockClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const block = e.target.closest('.minimap-block');
        if (!block) return;

        const index = parseInt(block.getAttribute('data-index') || '-1', 10);
        console.log('[Gemini Navigator] Click on block index:', index);

        if (index < 0 || index >= cachedMessages.length) {
            console.log('[Gemini Navigator] Invalid index or stale cache, updating...');
            updateMinimap();
            return;
        }

        const msg = cachedMessages[index];
        if (!msg || !msg.element) {
            console.log('[Gemini Navigator] No message found for index');
            updateMinimap();
            return;
        }

        // Check if element still exists in DOM
        if (!document.body.contains(msg.element)) {
            console.log('[Gemini Navigator] Element no longer in DOM, updating...');
            updateMinimap();
            return;
        }

        // Scroll to element
        console.log('[Gemini Navigator] Scrolling to element');
        msg.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight effect
        const originalBg = msg.element.style.backgroundColor;
        msg.element.style.transition = 'background-color 0.3s ease';
        msg.element.style.backgroundColor = 'rgba(138, 180, 248, 0.3)';
        setTimeout(() => {
            msg.element.style.backgroundColor = originalBg;
        }, 1200);
    }

    function handleBlockHover(e) {
        const block = e.target.closest('.minimap-block');
        if (!block || block === currentHoveredBlock) return;

        // Clean up previous hover
        if (currentHoveredBlock) {
            cleanupBlockHover(currentHoveredBlock);
        }

        currentHoveredBlock = block;

        const index = parseInt(block.getAttribute('data-index') || '-1', 10);
        if (index < 0 || index >= cachedMessages.length) return;

        const msg = cachedMessages[index];
        if (msg) {
            showTooltip(msg.text, e.clientY);
            block.classList.add('is-hovered');

            // Switch to animated GIF on hover
            const staticImg = block.querySelector('.minimap-static');
            const gifImg = block.querySelector('.minimap-gif');

            if (staticImg) {
                staticImg.style.display = 'none';
            }
            if (gifImg) {
                gifImg.style.display = 'block';
            }
        }
    }

    function handleBlockLeave(e) {
        const block = e.target.closest('.minimap-block');
        if (!block) return;

        // Check if we're leaving to another block or outside
        const relatedTarget = e.relatedTarget;
        if (relatedTarget && block.contains(relatedTarget)) {
            return; // Still inside the same block
        }

        cleanupBlockHover(block);

        if (currentHoveredBlock === block) {
            currentHoveredBlock = null;
        }
    }

    function cleanupBlockHover(block) {
        hideTooltip();
        block.classList.remove('is-hovered');

        // Switch back to static image
        const staticImg = block.querySelector('.minimap-static');
        const gifImg = block.querySelector('.minimap-gif');

        if (staticImg) {
            staticImg.style.display = 'block';
        }
        if (gifImg) {
            gifImg.style.display = 'none';
        }
    }

    // Extract first frame from GIF using canvas
    function extractFirstFrame(gifUrl, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                callback(dataUrl);
            } catch (e) {
                // If CORS fails, just use the GIF URL for static too
                callback(gifUrl);
            }
        };
        img.onerror = function () {
            callback(gifUrl);
        };
        img.src = gifUrl;
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
                element,
                type,
                text,
                top: rect.top + window.scrollY,
                height: rect.height
            });
        }
    }

    function updateMinimap() {
        if (!minimapContent) return;

        // Mode switch: block mode or scaled mode
        if (settings.minimapMode === 'scaled') {
            updateMinimapScaled();
            return;
        }

        // Block mode (original)
        const messages = parseMessages();

        // Skip redraw if message count is same (prevents flicker)
        if (messages.length === cachedMessages.length && messages.length > 0) {
            // Just update the viewport position
            updateViewport();
            return;
        }

        cachedMessages = messages;

        // Remove old blocks (keep viewport indicator)
        const blocksToRemove = minimapContent.querySelectorAll('.minimap-block, .minimap-scaled-content');
        blocksToRemove.forEach(block => block.remove());

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

            // Add static image (first frame) and animated GIF
            const gifUrl = msg.type === 'user' ? settings.userGif : settings.geminiGif;
            if (gifUrl && gifUrl.trim()) {
                // Static image (shown by default)
                const staticImg = document.createElement('img');
                staticImg.className = 'minimap-static';
                staticImg.alt = '';
                block.appendChild(staticImg);

                // Extract first frame for static display
                extractFirstFrame(gifUrl, (dataUrl) => {
                    staticImg.src = dataUrl;
                });

                // Animated GIF (hidden by default)
                const gifImg = document.createElement('img');
                gifImg.className = 'minimap-gif';
                gifImg.src = gifUrl;
                gifImg.alt = '';
                gifImg.style.display = 'none';
                block.appendChild(gifImg);
            }

            block.setAttribute('data-index', index.toString());
            block.style.cursor = 'pointer';
            minimapContent.appendChild(block);
        });

        updateViewport();
    }

    function updateMinimapScaled() {
        if (!minimapContent) return;

        // Remove old content
        const oldContent = minimapContent.querySelectorAll('.minimap-block, .minimap-scaled-content');
        oldContent.forEach(el => el.remove());

        // Find main content area
        const mainContent = document.querySelector('main') || document.querySelector('[role="main"]');
        if (!mainContent) return;

        const messages = parseMessages();
        cachedMessages = messages;

        if (messages.length === 0) return;

        // Create container for scaled blocks (allows overflow)
        const scaledContainer = document.createElement('div');
        scaledContainer.className = 'minimap-scaled-content';
        scaledContainer.style.cssText = `
            position: relative;
            width: 100%;
            overflow: visible;
        `;

        // Stack blocks sequentially with gap
        let currentY = 0;
        const blockGap = 20;

        // Create blocks positioned sequentially
        messages.forEach((msg, index) => {
            if (!msg.element) return;

            const clone = document.createElement('div');
            clone.className = `minimap-scaled-block ${msg.type}`;

            // Calculate height based on text length
            const textLength = msg.text.length;
            const baseHeight = Math.max(18, Math.min(45, 18 + Math.floor(textLength / 40) * 8));

            // Check for images
            const images = msg.element.querySelectorAll('img');
            const hasImages = images.length > 0;
            const finalHeight = hasImages ? baseHeight + 22 : baseHeight;

            clone.style.cssText = `
                position: absolute;
                top: ${currentY}px;
                right: 0;
                width: ${settings.width - 16}px;
                min-height: ${finalHeight}px;
                padding: 4px 6px;
                border-radius: 4px;
                font-size: 8px;
                line-height: 1.3;
                background: ${msg.type === 'user' ? settings.userColor : settings.geminiColor};
                color: rgba(0, 0, 0, 0.8);
                cursor: pointer;
                pointer-events: auto;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                transform-origin: right center;
            `;

            // Add images if present
            if (hasImages) {
                const imgContainer = document.createElement('div');
                imgContainer.style.cssText = 'display: flex; gap: 2px; margin-bottom: 3px; flex-wrap: wrap;';

                images.forEach((img, i) => {
                    if (i < 2) {
                        const imgClone = document.createElement('img');
                        imgClone.src = img.src;
                        imgClone.style.cssText = 'height: 20px; width: auto; max-width: 40px; object-fit: cover; border-radius: 2px;';
                        imgContainer.appendChild(imgClone);
                    }
                });

                clone.appendChild(imgContainer);
            }

            // Add text
            const textSpan = document.createElement('span');
            textSpan.textContent = msg.text.substring(0, 80);
            textSpan.style.cssText = 'display: block; word-break: break-all;';
            clone.appendChild(textSpan);

            clone.setAttribute('data-index', index.toString());
            clone.setAttribute('data-base-y', currentY.toString());
            clone.setAttribute('data-base-height', finalHeight.toString());

            scaledContainer.appendChild(clone);

            // Update Y position for next block
            currentY += finalHeight + blockGap;
        });

        minimapContent.appendChild(scaledContainer);

        // Setup click handlers and Dock magnification effect
        const blocks = scaledContainer.querySelectorAll('.minimap-scaled-block');

        blocks.forEach(block => {
            block.addEventListener('click', (e) => {
                const idx = parseInt(block.getAttribute('data-index') || '-1', 10);
                if (idx >= 0 && cachedMessages[idx] && cachedMessages[idx].element) {
                    cachedMessages[idx].element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        // Dock magnification effect with Gaussian curve
        const DOCK_CONFIG = {
            maxScale: settings.magnificationScale || 1.6,
            minScale: 1.0,
            sigma: 80
        };

        // Gaussian function: e^(-d²/2σ²)
        function gaussian(distance, sigma) {
            return Math.exp(-(distance * distance) / (2 * sigma * sigma));
        }

        // Store original positions (calculated once)
        const originalPositions = [];
        blocks.forEach((block, i) => {
            const baseY = parseFloat(block.getAttribute('data-base-y') || '0');
            const baseHeight = parseFloat(block.getAttribute('data-base-height') || '20');
            originalPositions.push({
                top: baseY,
                height: baseHeight,
                centerY: baseY + baseHeight / 2
            });
        });

        function applyDockEffect(mouseY) {
            // Find the block closest to cursor
            let centerIndex = 0;
            let minDistance = Infinity;
            for (let i = 0; i < originalPositions.length; i++) {
                const dist = Math.abs(mouseY - originalPositions[i].centerY);
                if (dist < minDistance) {
                    minDistance = dist;
                    centerIndex = i;
                }
            }

            // Calculate scales using Gaussian, limit to ±3 blocks
            const affectRange = 3;
            const gap = 10; // Consistent gap between blocks
            const scales = [];

            for (let i = 0; i < blocks.length; i++) {
                const blockDistance = Math.abs(i - centerIndex);

                if (blockDistance <= affectRange) {
                    const orig = originalPositions[i];
                    const pixelDistance = Math.abs(mouseY - orig.centerY);
                    const gaussianFactor = gaussian(pixelDistance, DOCK_CONFIG.sigma);
                    const scale = DOCK_CONFIG.minScale + (DOCK_CONFIG.maxScale - DOCK_CONFIG.minScale) * gaussianFactor;
                    scales.push(Math.max(1.0, scale));
                } else {
                    scales.push(1.0);
                }
            }

            // Calculate new positions with consistent gaps
            // Position each block based on accumulated heights + gaps
            const newTops = [];
            let currentTop = 0;

            for (let i = 0; i < blocks.length; i++) {
                newTops.push(currentTop);
                const scaledHeight = originalPositions[i].height * scales[i];
                currentTop += scaledHeight + gap;
            }

            // Apply styles
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                block.style.top = `${newTops[i]}px`;
                block.style.transform = `scale(${scales[i]})`;
                block.style.zIndex = (Math.abs(i - centerIndex) <= affectRange)
                    ? (100 + (affectRange - Math.abs(i - centerIndex)) * 10).toString()
                    : '1';
            }
        }

        function resetDockEffect() {
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                const orig = originalPositions[i];
                block.style.top = `${orig.top}px`;
                block.style.transform = 'scale(1)';
                block.style.zIndex = '1';
            }
        }

        // Apply effect on mouseenter and mousemove
        scaledContainer.addEventListener('mouseenter', (e) => {
            const rect = scaledContainer.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;
            applyDockEffect(mouseY);
        });

        scaledContainer.addEventListener('mousemove', (e) => {
            const rect = scaledContainer.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;
            applyDockEffect(mouseY);
        });

        scaledContainer.addEventListener('mouseleave', () => {
            resetDockEffect();
        });

        updateViewportScaled();
    }

    function updateViewportScaled() {
        if (!viewportIndicator || !minimapContent) return;

        const scaledContainer = minimapContent.querySelector('.minimap-scaled-content');
        if (!scaledContainer) {
            updateViewport();
            return;
        }

        const blocks = scaledContainer.querySelectorAll('.minimap-scaled-block');
        if (blocks.length === 0) return;

        // Find first and last visible message
        let firstVisibleIdx = -1;
        let lastVisibleIdx = -1;

        cachedMessages.forEach((msg, idx) => {
            if (msg.element) {
                const rect = msg.element.getBoundingClientRect();
                const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
                if (isVisible) {
                    if (firstVisibleIdx === -1) firstVisibleIdx = idx;
                    lastVisibleIdx = idx;
                }
            }
        });

        if (firstVisibleIdx === -1) {
            viewportIndicator.style.display = 'none';
            return;
        }

        const firstBlock = blocks[firstVisibleIdx];
        const lastBlock = blocks[lastVisibleIdx];

        if (!firstBlock || !lastBlock) return;

        const firstTop = firstBlock.offsetTop;
        const lastBottom = lastBlock.offsetTop + lastBlock.offsetHeight;

        viewportIndicator.style.display = 'block';
        viewportIndicator.style.top = `${firstTop}px`;
        viewportIndicator.style.height = `${Math.max(30, lastBottom - firstTop)}px`;
    }

    function updateViewport() {
        if (!viewportIndicator || !minimapContent) return;

        // If scaled mode, use scaled viewport update
        if (settings.minimapMode === 'scaled') {
            updateViewportScaled();
            return;
        }

        const blocks = minimapContent.querySelectorAll('.minimap-block');
        if (blocks.length === 0) return;

        // Find first and last visible message in viewport
        let firstVisibleIdx = -1;
        let lastVisibleIdx = -1;

        cachedMessages.forEach((msg, idx) => {
            if (msg.element) {
                const rect = msg.element.getBoundingClientRect();
                const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
                if (isVisible) {
                    if (firstVisibleIdx === -1) firstVisibleIdx = idx;
                    lastVisibleIdx = idx;
                }
            }
        });

        if (firstVisibleIdx === -1) {
            viewportIndicator.style.display = 'none';
            return;
        }

        // Map visible message range to minimap block positions
        const firstBlock = blocks[firstVisibleIdx];
        const lastBlock = blocks[lastVisibleIdx];

        if (!firstBlock || !lastBlock) return;

        const firstTop = firstBlock.offsetTop;
        const lastBottom = lastBlock.offsetTop + lastBlock.offsetHeight;

        viewportIndicator.style.display = 'block';
        viewportIndicator.style.top = `${firstTop}px`;
        viewportIndicator.style.height = `${Math.max(30, lastBottom - firstTop)}px`;
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
        const messageObserver = new MutationObserver(debounce(() => {
            updateMinimap();
        }, CONFIG.DEBOUNCE_DELAY));

        messageObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Watch for settings changes
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== 'sync') return;

                console.log('[Gemini Navigator] Settings changed:', changes);
                let needsUpdate = false;
                for (const key of Object.keys(changes)) {
                    if (key in settings) {
                        settings[key] = changes[key].newValue;
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

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 500);
        });
    } else {
        setTimeout(init, 500);
    }

    // SPA navigation support - improved detection
    let lastUrl = location.href;

    function handleNavigation() {
        console.log('[Gemini Navigator] Navigation detected, reinitializing...');
        isInitialized = false;
        cachedMessages = [];

        // Clear existing minimap content
        if (minimapContent) {
            const blocks = minimapContent.querySelectorAll('.minimap-block');
            blocks.forEach(block => block.remove());
        }

        // Reinitialize after a delay to allow page content to load
        setTimeout(() => {
            init();
        }, 800);
    }

    // Method 1: MutationObserver for URL changes
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    }).observe(document, { subtree: true, childList: true });

    // Method 2: popstate event for back/forward navigation
    window.addEventListener('popstate', () => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    });

    // Method 3: Intercept History API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    };

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    };

    // Method 4: Periodic check for URL changes (fallback)
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    }, 2000);

})();
