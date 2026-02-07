// Gemini Minimap Navigator - Content Script

(function () {
    'use strict';

    // 設定
    const CONFIG = {
        MAX_SCALE: 2.0,
        ACTIVE_WINDOW_SIZE: 3,
        BASE_WIDTH: 100,  // テキスト表示のため幅を増加
        BASE_HEIGHT_MIN: 30,
        BASE_HEIGHT_MAX: 180,
        HEIGHT_SCALE_FACTOR: 0.12,
        MAX_TEXT_LENGTH: 150,  // 表示する最大文字数（拡大時に多く表示）
        MAX_IMAGES: 3,
        IMAGE_SIZE: 20,
    };

    // 状態
    let minimapContainer = null;
    let blocksWrapper = null;
    let messageElements = [];
    let blockElements = [];
    let currentCenterIndex = -1;
    let observer = null;

    // ミニマップのDOM構造を作成
    function createMinimapDOM() {
        const existing = document.querySelector('.gemini-minimap-container');
        if (existing) existing.remove();

        minimapContainer = document.createElement('div');
        minimapContainer.className = 'gemini-minimap-container';

        const bg = document.createElement('div');
        bg.className = 'gemini-minimap-bg';

        const baseline = document.createElement('div');
        baseline.className = 'gemini-minimap-baseline';

        blocksWrapper = document.createElement('div');
        blocksWrapper.className = 'gemini-minimap-blocks';

        minimapContainer.appendChild(bg);
        minimapContainer.appendChild(baseline);
        minimapContainer.appendChild(blocksWrapper);
        document.body.appendChild(minimapContainer);

        setupEventListeners();
    }

    // Geminiのメッセージ要素を検出（重複なし）
    function detectMessages() {
        const conversationContainer = document.querySelector('main, [role="main"], .conversation-container');
        if (!conversationContainer) return [];

        // data-message-id を持つ要素を優先（最も確実）
        const messageById = conversationContainer.querySelectorAll('[data-message-id]');
        if (messageById.length > 0) {
            // 重複を除去（同じdata-message-idを持つ要素）
            const seenIds = new Set();
            const uniqueMessages = [];
            messageById.forEach(el => {
                const id = el.getAttribute('data-message-id');
                const text = el.textContent?.trim() || '';

                // 思考関連のUI要素のみ除外（正確なマッチ）
                // ユーザーメッセージを含めるため、条件を厳格に
                const isThinkingUI =
                    (text === '思考のプロセスを表示' || text === '思考のプロセス') ||
                    (text.length < 30 && text.includes('思考のプロセス')) ||
                    el.closest('[class*="thinking-toggle"]');

                // 画像が含まれているかチェック
                const hasImages = el.querySelector('img') !== null;

                // テキストがあるか、または画像がある場合は追加
                if (!seenIds.has(id) && !isThinkingUI && (text.length > 0 || hasImages)) {
                    seenIds.add(id);
                    uniqueMessages.push(el);
                }
            });
            return uniqueMessages;
        }

        // 代替: ネストされていないトップレベルのメッセージのみ取得
        const allTurns = conversationContainer.querySelectorAll(
            '[class*="message-row"], [class*="turn"], [class*="response"], [class*="query"]'
        );

        // ネストされた子要素を除外
        const topLevelMessages = Array.from(allTurns).filter(el => {
            // 親要素が同じセレクタにマッチしないかチェック
            const parent = el.parentElement?.closest(
                '[class*="message-row"], [class*="turn"], [class*="response"], [class*="query"]'
            );
            return !parent;
        });

        // テキストベースで重複除去
        const seenTexts = new Set();
        return topLevelMessages.filter(el => {
            const text = el.textContent?.trim() || '';
            const hasImages = el.querySelector('img') !== null;

            // UIテキストを除外
            if (text.length < 5 && !hasImages) return false;
            // メニュー等は除外
            if (text.includes('メニューを開く') || text.includes('チャットを新規作成')) return false;

            // 重複除去（最初の100文字で比較）
            // 画像のみの場合は重複チェックをスキップ（または画像URLで判断すべきだが簡易的に許可）
            const textKey = text.substring(0, 100);
            if (text.length > 0 && seenTexts.has(textKey)) return false;
            if (text.length > 0) seenTexts.add(textKey);

            return true;
        });
    }

    // メッセージの種類を判定
    function getMessageType(element) {
        const classList = element.className || '';
        const parentClass = element.closest('[class*="user"], [class*="model"], [class*="human"], [class*="assistant"], [class*="query"]')?.className || '';

        if (classList.includes('user') || classList.includes('query') ||
            parentClass.includes('user') || parentClass.includes('human') || parentClass.includes('query')) {
            return 'user';
        }
        return 'model';
    }

    // メッセージのテキストを取得（実際のメッセージ内容のみ）
    function getMessageText(element) {
        // 実際のメッセージコンテンツを探す
        // ボタンやUI要素を除外して、本文のみを取得
        let contentElement =
            element.querySelector('[class*="markdown"], [class*="response-content"], [class*="message-content"]') ||
            element.querySelector('p') ||
            element;

        // ボタンやUI要素のテキストを除外するため、クローンを作成
        const clone = contentElement.cloneNode(true);

        // UI要素を削除（ボタン、思考プロセス表示など）
        const uiElements = clone.querySelectorAll('button, [role="button"], [class*="thinking"], [class*="expand"], [class*="toggle"], [class*="action"]');
        uiElements.forEach(el => el.remove());

        let text = clone.textContent || '';
        text = text.trim().replace(/\s+/g, ' ');

        // 残りの思考関連テキストを除去
        text = text.replace(/思考のプロセスを表示/g, '');
        text = text.replace(/思考のプロセス/g, '');
        text = text.replace(/思考中/g, '');
        text = text.trim();

        if (text.length > CONFIG.MAX_TEXT_LENGTH) {
            text = text.substring(0, CONFIG.MAX_TEXT_LENGTH) + '...';
        }

        // 簡易Markdown変換
        text = text
            .replace(/\*\*(.+?)\*\*/g, '【$1】')
            .replace(/`(.+?)`/g, '『$1』')
            .replace(/^###\s*/gm, '▶ ')
            .replace(/^##\s*/gm, '■ ')
            .replace(/^#\s*/gm, '● ')
            .replace(/^-\s*/gm, '・ ');
        return text;
    }

    // メッセージ内の画像URLを取得
    function getImageUrls(element) {
        const images = element.querySelectorAll('img');
        const urls = [];
        images.forEach((img, i) => {
            if (i < CONFIG.MAX_IMAGES && img.src) {
                // アイコンやUIアイコンを除外
                if (img.width > 20 && img.height > 20) {
                    urls.push(img.src);
                }
            }
        });
        return urls;
    }

    // メッセージの長さからブロックの高さを計算
    function calculateBlockHeight(element) {
        const textLength = (element.textContent || '').trim().length;
        // テキスト長さに基づいて高さを計算
        // 短いメッセージ = 小さいブロック、長いメッセージ = 大きいブロック
        const baseFromText = Math.sqrt(textLength) * 3;
        return Math.max(CONFIG.BASE_HEIGHT_MIN, Math.min(CONFIG.BASE_HEIGHT_MAX, baseFromText));
    }

    // ミニマップブロックを生成
    function generateBlocks() {
        messageElements = detectMessages();
        blocksWrapper.innerHTML = '';
        blockElements = [];

        messageElements.forEach((msg, i) => {
            const messageType = getMessageType(msg);
            const block = document.createElement('div');
            block.className = `gemini-minimap-block ${messageType}`;
            block.dataset.index = i;

            const baseHeight = calculateBlockHeight(msg);
            block.style.height = `${baseHeight}px`;
            block.style.width = `${CONFIG.BASE_WIDTH}px`;
            block.dataset.baseHeight = baseHeight;

            // コンテンツラッパー
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'gemini-minimap-content';

            // テキスト表示
            const text = getMessageText(msg);
            if (text) {
                const textDiv = document.createElement('div');
                textDiv.className = 'gemini-minimap-text';
                textDiv.textContent = text;
                contentWrapper.appendChild(textDiv);
            }

            // 画像サムネイル
            const imageUrls = getImageUrls(msg);
            if (imageUrls.length > 0) {
                const imagesDiv = document.createElement('div');
                imagesDiv.className = 'gemini-minimap-images';
                imageUrls.forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
                    img.className = 'gemini-minimap-thumb';
                    imagesDiv.appendChild(img);
                });
                contentWrapper.appendChild(imagesDiv);
            }

            block.appendChild(contentWrapper);

            // クリックでメッセージの先頭にスクロール
            block.addEventListener('click', () => {
                msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });

            blocksWrapper.appendChild(block);
            blockElements.push({
                element: block,
                messageElement: msg,
                baseHeight: baseHeight
            });
        });
    }

    // スケール計算
    function calculateScale(distance) {
        if (distance > CONFIG.ACTIVE_WINDOW_SIZE) return 1;
        const t = distance / (CONFIG.ACTIVE_WINDOW_SIZE + 1);
        const decay = (1 + Math.cos(t * Math.PI)) / 2;
        return 1 + (CONFIG.MAX_SCALE - 1) * decay;
    }

    // マグニフィケーションエフェクトを適用
    function applyMagnification(centerIndex) {
        if (centerIndex === currentCenterIndex) return;
        currentCenterIndex = centerIndex;

        const blockData = blockElements.map((item, i) => {
            const distance = Math.abs(i - centerIndex);
            const scale = calculateScale(distance);
            const baseHeight = item.baseHeight;
            const expandedHeight = baseHeight * scale;
            const expandedWidth = CONFIG.BASE_WIDTH * scale;
            const heightIncrease = expandedHeight - baseHeight;
            const widthIncrease = expandedWidth - CONFIG.BASE_WIDTH;

            return {
                ...item,
                index: i,
                scale,
                expandedHeight,
                expandedWidth,
                heightIncrease,
                widthIncrease,
                shiftY: 0
            };
        });

        let cumulativeShiftAbove = 0;
        let cumulativeShiftBelow = 0;

        for (let i = centerIndex - 1; i >= 0; i--) {
            cumulativeShiftAbove += blockData[i + 1].heightIncrease / 4;
            blockData[i].shiftY = -cumulativeShiftAbove;
        }

        blockData[centerIndex].shiftY = 0;

        for (let i = centerIndex + 1; i < blockData.length; i++) {
            cumulativeShiftBelow += blockData[i - 1].heightIncrease / 4;
            blockData[i].shiftY = cumulativeShiftBelow;
        }

        blockData.forEach(data => {
            const { element, scale, expandedHeight, expandedWidth, widthIncrease, shiftY } = data;
            element.style.height = `${expandedHeight}px`;
            element.style.width = `${expandedWidth}px`;
            // 左への押し出し量を半分に
            element.style.transform = `translateX(${-widthIncrease / 2}px) translateY(${shiftY}px)`;

            // スケールに応じてフォントサイズを変更
            const textEl = element.querySelector('.gemini-minimap-text');
            if (textEl) {
                const baseFontSize = 11;
                const scaledFontSize = baseFontSize * scale;
                textEl.style.fontSize = `${scaledFontSize}px`;
                // 行数もスケールに応じて増やす
                const lineClamp = Math.round(5 * scale);
                textEl.style.webkitLineClamp = lineClamp;
            }

            // サムネイルもスケール
            const thumbs = element.querySelectorAll('.gemini-minimap-thumb');
            thumbs.forEach(thumb => {
                const baseSize = 20;
                const scaledSize = baseSize * scale;
                thumb.style.width = `${scaledSize}px`;
                thumb.style.height = `${scaledSize}px`;
            });
        });
    }

    // マグニフィケーションをリセット
    function resetMagnification() {
        currentCenterIndex = -1;
        blockElements.forEach(item => {
            item.element.style.height = `${item.baseHeight}px`;
            item.element.style.width = `${CONFIG.BASE_WIDTH}px`;
            item.element.style.transform = 'translateX(0) translateY(0)';

            // フォントサイズをリセット
            const textEl = item.element.querySelector('.gemini-minimap-text');
            if (textEl) {
                textEl.style.fontSize = '11px';
                textEl.style.webkitLineClamp = '5';
            }

            // サムネイルもリセット
            const thumbs = item.element.querySelectorAll('.gemini-minimap-thumb');
            thumbs.forEach(thumb => {
                thumb.style.width = '20px';
                thumb.style.height = '20px';
            });
        });
    }

    // 最も近いブロックを見つける
    function findNearestBlock(mouseY) {
        let nearestIndex = 0;
        let minDistance = Infinity;

        blockElements.forEach((item, i) => {
            const rect = item.element.getBoundingClientRect();
            const blockCenterY = rect.top + rect.height / 2;
            const distance = Math.abs(mouseY - blockCenterY);

            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = i;
            }
        });

        return nearestIndex;
    }

    // イベントリスナーを設定
    function setupEventListeners() {
        blocksWrapper.addEventListener('mousemove', (e) => {
            // マウスが右側のデフォルト幅エリアにあるかチェック
            // 拡大されていない状態のブロック幅（CONFIG.BASE_WIDTH）内にある時のみ反応
            // ただし、既に拡大中の場合は少し広めに判定するか...？
            // ユーザー要望「デフォルトのブロックにカーソルが入っている時に初めて拡大化」
            // ＝ 右端から BASE_WIDTH + 余白(20px) 以上の距離がある場合は無視

            const distFromRight = window.innerWidth - e.clientX;
            const triggerZone = CONFIG.BASE_WIDTH + 40; // 100 + 40 = 140px

            // 右端エリア外ならリセットして終了
            if (distFromRight > triggerZone) {
                resetMagnification();
                return;
            }

            const nearestIndex = findNearestBlock(e.clientY);
            applyMagnification(nearestIndex);
        });

        blocksWrapper.addEventListener('mouseleave', () => {
            resetMagnification();
        });

        minimapContainer.addEventListener('wheel', (e) => {
            blocksWrapper.scrollTop += e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }

    // MutationObserverでメッセージ追加を監視
    function setupObserver() {
        if (observer) observer.disconnect();

        const chatContainer = document.querySelector('[class*="chat"], [class*="conversation"], main');
        if (!chatContainer) {
            setTimeout(setupObserver, 1000);
            return;
        }

        observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) {
                clearTimeout(observer.updateTimeout);
                observer.updateTimeout = setTimeout(() => {
                    generateBlocks();
                }, 300);
            }
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true
        });
    }

    // 初期化
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        setTimeout(() => {
            createMinimapDOM();
            generateBlocks();
            setupObserver();

            setTimeout(() => generateBlocks(), 2000);
            setTimeout(() => generateBlocks(), 5000);
        }, 1000);
    }

    init();
})();
