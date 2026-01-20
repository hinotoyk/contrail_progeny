// ==UserScript==
// @name         云崽高亮器
// @namespace    https://github.com/hinotoyk/contrail_progeny
// @version      1.3.0
// @description  一键高亮云崽并展示相关数据
// @author       hinotoyk
// @match        https://www.jra.go.jp/*
// @match        https://www.jbis.or.jp/*
// @match        https://*.netkeiba.com/*
// @match        https://www.keibanomiryoku.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Module: Constants
     * 常量定义
     */
    const Constants = {
        DATA_URL: `https://raw.githubusercontent.com/hinotoyk/contrail_progeny/refs/heads/main/tampermonkey-project/data/Contrail%27s%20Crops%20Progress%202023.json`,
        CACHE_KEY: 'contrail_progeny_data',
        CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24小时
        ALPINE_URL: 'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js'
    };

    /**
     * Module: Utils
     * 工具函数
     */
    const Utils = {
        escapeHTML(str) {
            return String(str)
                .replace(/&/g, '&')
                .replace(/</g, '<')
                .replace(/>/g, '>')
                .replace(/"/g, '"')
                .replace(/'/g, '&#039;');
        },

        nl2br(str) {
            return this.escapeHTML(str).replace(/\n/g, '<br>');
        },

        loadAlpine(cb) {
            if (window.Alpine) return cb();
            const script = document.createElement('script');
            script.src = Constants.ALPINE_URL;
            script.defer = true;
            script.onload = cb;
            document.head.appendChild(script);
        }
    };

    /**
     * Module: DataManager
     * 数据管理与缓存
     */
    const DataManager = {
        async fetchAndCache() {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: Constants.DATA_URL,
                    onload: (res) => {
                        if (res.status === 200) {
                            try {
                                const data = JSON.parse(res.responseText);
                                this.saveCache(data);
                                resolve(data);
                            } catch (e) {
                                reject(e);
                            }
                        } else {
                            reject(new Error(`Failed to fetch data: ${res.status}`));
                        }
                    },
                    onerror: reject
                });
            });
        },

        getCache() {
            const cached = GM_getValue(Constants.CACHE_KEY);
            if (!cached) return null;

            try {
                // 如果是旧版本的非JSON字符串或者是对象，需要兼容处理
                // 这里假设存入的是 { timestamp: number, data: any }
                if (Date.now() - cached.timestamp < Constants.CACHE_EXPIRY) {
                    console.log('Using cached data');
                    return cached.data;
                }
            } catch (e) {
                console.error('Cache parse error', e);
            }
            return null;
        },

        saveCache(data) {
            GM_setValue(Constants.CACHE_KEY, {
                timestamp: Date.now(),
                data: data
            });
        },

        async getData() {
            const cachedData = this.getCache();
            if (cachedData) {
                return cachedData;
            }
            return this.fetchAndCache();
        }
    };

    /**
     * Module: Styles
     * 样式定义
     */
    const Styles = {
        CSS: `
            :root {
                --contrail-font-family: 'Source Han Sans', '思源黑体', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif;
                
                /* Light Mode Variables */
                --contrail-bg: #faf7f2;
                --contrail-text: #333;
                --contrail-text-secondary: #666;
                --contrail-border: #ddd;
                --contrail-link: #318cfa;
                --contrail-highlight-bg: #ffd6d6;
                --contrail-highlight-text: rgb(255, 136, 166);
                --contrail-shadow: rgba(0,0,0,.25);
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --contrail-bg: #2d2d2d;
                    --contrail-text: #e0e0e0;
                    --contrail-text-secondary: #a0a0a0;
                    --contrail-border: #444;
                    --contrail-link: #5ca1ff;
                    --contrail-highlight-bg: #4a2c2c;
                    --contrail-highlight-text: #ff88a6;
                    --contrail-shadow: rgba(0,0,0,.5);
                }
            }

            .horse-highlight,
            .horse-tooltip,
            .horse-tooltip * {
                font-family: var(--contrail-font-family);
                box-sizing: border-box;
            }

            .horse-highlight {
                background: linear-gradient(transparent 60%, var(--contrail-highlight-bg) 60%);
                color: var(--contrail-highlight-text);
                font-weight: 600;
                cursor: pointer;
                position: relative;
            }

            .horse-tooltip {
                position: fixed;
                top: 0;
                left: 0;
                width: 490px;
                max-height: 80vh;
                overflow-y: auto;
                background: var(--contrail-bg);
                color: var(--contrail-text);
                border-radius: 12px;
                padding: 16px;
                box-shadow: 0 15px 40px var(--contrail-shadow);
                z-index: 2147483647;
                font-size: 15px;
                line-height: 1.5;
                pointer-events: auto;
                text-align: left;
                overscroll-behavior: contain;
                
                /* Animation Initial State */
                opacity: 0;
                transform: scale(0.95);
                transform-origin: center;
                pointer-events: none;
                transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1), transform 0.2s cubic-bezier(0.2, 0, 0, 1);
            }

            .horse-tooltip.horse-tooltip--visible {
                opacity: 1;
                transform: scale(1);
                pointer-events: auto;
            }

            .tt-header {
                border-bottom: 1px solid var(--contrail-border);
                margin-bottom: 10px;
            }

            .tt-name {
                font-size: 20px;
                font-weight: bold;
                color: var(--contrail-highlight-text);
            }

            .tt-sub {
                font-size: 13px;
                color: var(--contrail-text-secondary);
            }

            .tt-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 6px 12px;
                margin-top: 10px;
            }

            .tt-row span {
                color: var(--contrail-text-secondary);
            }
            
            .tt-row strong {
                color: var(--contrail-text);
                font-weight: 600;
            }

            .tt-block {
                margin-top: 12px;
            }

            .tt-block-title {
                font-weight: bold;
                margin-bottom: 4px;
                color: var(--contrail-text);
            }

            .tt-block-body {
                font-size: 14px;
                color: var(--contrail-text);
            }

            .tt-collapse {
                margin-top: 12px;
            }

            .tt-collapse-title {
                cursor: pointer;
                font-weight: bold;
                color: var(--contrail-link);
            }

            .tt-collapse-icon {
                display: inline-block;
                width: 1em;
            }

            .tt-collapse-label {
                margin-left: 4px;
            }

            .tt-collapse-body {
                margin-top: 6px;
                font-size: 14px;
                color: var(--contrail-text);
            }
        `,
        inject() {
            GM_addStyle(this.CSS);
        }
    };

    /**
     * Module: Components
     * UI 组件渲染
     */
    const Components = {
        row(label, val) {
            const value = val ? Utils.escapeHTML(val) : '/';
            return `
            <div class="tt-row">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>`;
        },

        block(label, val) {
            if (!val) return '';
            return `
            <div class="tt-block">
                <div class="tt-block-title">${label}</div>
                <div class="tt-block-body">${Utils.nl2br(val)}</div>
            </div>`;
        },

        collapse(label, val) {
            if (!val) return '';
            return `
            <div class="tt-collapse open">
                <div class="tt-collapse-title">
                    <span class="tt-collapse-icon">▼</span>
                    <span class="tt-collapse-label">${Utils.escapeHTML(label)}</span>
                </div>
                <div class="tt-collapse-body">
                    ${Utils.nl2br(val)}
                </div>
            </div>`;
        },

        renderTooltip(horse) {
            const translation = horse['港译'] || horse['译名'];
            const displayName = translation
                ? `${Utils.escapeHTML(horse['馬名'])}【${Utils.escapeHTML(translation)}】`
                : Utils.escapeHTML(horse['馬名']);
            const fallbackTranslation = translation ? '' : '<div class="tt-sub">暂无译名</div>';

            const html = `
            <div class="horse-tooltip">
                <div class="tt-header">
                    <div class="tt-name">${displayName}</div>
                    ${fallbackTranslation}
                </div>

                <div class="tt-grid">
                    ${this.row('性别', horse['性別'])}
                    ${this.row('毛色', horse['毛色'])}
                    ${this.row('马主', horse['馬主'])}
                    ${this.row('母马', horse['母名'])}
                    ${this.row('母父', horse['母父名'])}
                    ${this.row('牧场', horse['生产牧场'])}
                    ${this.row('调教师', horse['管理調教師'])}
                </div>

                ${this.block('备注', horse['备考'])}
                ${this.collapse('近况 / 牧场评价', horse['近况更新/近走/牧场评价'])}
                ${this.collapse('血统分析', horse['血统分析'])}
            </div>`;

            const template = document.createElement('template');
            template.innerHTML = html.trim();
            const tooltip = template.content.firstElementChild;

            // 交互逻辑绑定
            // 阻止滚动冒泡到父页面
            const stopScrollPropagation = (e) => {
                const el = e.currentTarget;
                // 只有当元素实际可滚动时才处理
                if (el.scrollHeight <= el.clientHeight) return;

                const delta = e.deltaY;
                const scrollTop = el.scrollTop;
                const scrollHeight = el.scrollHeight;
                const height = el.clientHeight;

                // 滚动到底部且继续向下滚，或者滚动到顶部且继续向上滚
                if ((delta > 0 && scrollTop + height >= scrollHeight - 1) ||
                    (delta < 0 && scrollTop <= 1)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            
            // 注意：passive: false 是必须的，否则 preventDefault 无效
            tooltip.addEventListener('wheel', stopScrollPropagation, { passive: false });

            tooltip.querySelectorAll('.tt-collapse').forEach(section => {
                const title = section.querySelector('.tt-collapse-title');
                const icon = section.querySelector('.tt-collapse-icon');
                const body = section.querySelector('.tt-collapse-body');

                const setState = open => {
                    section.classList.toggle('open', open);
                    if (icon) icon.textContent = open ? '▼' : '▶';
                    if (body) body.style.display = open ? '' : 'none';
                };

                setState(section.classList.contains('open'));

                if (title) {
                    title.addEventListener('click', () => {
                        const next = !section.classList.contains('open');
                        setState(next);
                    });
                }
            });

            return tooltip;
        }
    };

    /**
     * Module: App
     * 主程序逻辑
     */
    const App = {
        init() {
            Styles.inject();
            Utils.loadAlpine(async () => {
                try {
                    const data = await DataManager.getData();
                    this.highlight(data);
                } catch (err) {
                    console.error('Failed to load horse data:', err);
                }
            });
        },

        setupMutationObserver(map) {
            const observer = new MutationObserver((mutations) => {
                let shouldProcess = false;
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0) {
                        shouldProcess = true;
                        break;
                    }
                }
                if (shouldProcess) {
                    this.processNodes(document.body, map);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        processNodes(rootNode, map) {
            const walker = document.createTreeWalker(
                rootNode,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        // Skip already highlighted nodes or tooltips
                        if (node.parentElement && (
                            node.parentElement.classList.contains('horse-highlight') ||
                            node.parentElement.closest('.horse-tooltip')
                        )) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);

            nodes.forEach(node => {
                const text = node.nodeValue;
                if (!text || !text.trim()) return;

                // Simple check before iterating map
                let found = false;
                
                // Convert Map keys to array for iteration to break early
                for (const [name, horse] of map.entries()) {
                    if (text.includes(name)) {
                        // 高亮文本生成
                        const translation = horse['港译'] || horse['译名'];
                        const highlightedName = translation
                            ? `${Utils.escapeHTML(name)}【${Utils.escapeHTML(translation)}】`
                            : Utils.escapeHTML(name);

                        const span = document.createElement('span');
                        span.className = 'horse-highlight';
                        span.innerHTML = highlightedName;

                        // 生成 Tooltip
                        const tooltip = Components.renderTooltip(horse);
                        document.body.appendChild(tooltip);
                        // tooltip.classList.add('horse-tooltip--floating'); // Removed, handled by base class + visible class

                        // Tooltip 交互逻辑
                        this.attachTooltipEvents(span, tooltip);

                        if (node.parentNode) {
                            node.parentNode.replaceChild(span, node);
                        }
                        
                        found = true;
                        break; // Only highlight first match per text node to avoid complexity
                    }
                }
            });
        },

        highlight(horses) {
            const map = new Map();
            horses.forEach(h => h['馬名'] && map.set(h['馬名'], h));

            // Initial processing
            this.processNodes(document.body, map);
            
            // Setup observer for dynamic content
            this.setupMutationObserver(map);
        },

        attachTooltipEvents(targetSpan, tooltip) {
            let hideTimer = null;
            let listenersAttached = false;
            const margin = 12;
            const order = ['bottom', 'top', 'right', 'left'];

            const positionTooltip = () => {
                const tooltipRect = tooltip.getBoundingClientRect();
                const targetRect = targetSpan.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                const spaces = {
                    bottom: viewportHeight - targetRect.bottom - margin,
                    top: targetRect.top - margin,
                    right: viewportWidth - targetRect.right - margin,
                    left: targetRect.left - margin
                };

                const fits = order.find(dir => {
                    if (dir === 'bottom' || dir === 'top') {
                        return spaces[dir] >= tooltipRect.height;
                    }
                    return spaces[dir] >= tooltipRect.width;
                });

                const placement = fits || order.reduce((best, dir) => spaces[dir] > spaces[best] ? dir : best, order[0]);

                let top, left;

                switch (placement) {
                    case 'bottom':
                        top = targetRect.bottom + margin;
                        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                        break;
                    case 'top':
                        top = targetRect.top - tooltipRect.height - margin;
                        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                        break;
                    case 'right':
                        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                        left = targetRect.right + margin;
                        break;
                    default:
                        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                        left = targetRect.left - tooltipRect.width - margin;
                        break;
                }

                const maxLeft = viewportWidth - tooltipRect.width - margin;
                const maxTop = viewportHeight - tooltipRect.height - margin;

                left = Math.min(Math.max(left, margin), Math.max(maxLeft, margin));
                top = Math.min(Math.max(top, margin), Math.max(maxTop, margin));

                tooltip.style.top = `${top}px`;
                tooltip.style.left = `${left}px`;
            };

            const reposition = () => {
                if (!tooltip.classList.contains('horse-tooltip--visible')) return;
                positionTooltip();
            };

            const attachListeners = () => {
                if (listenersAttached) return;
                window.addEventListener('scroll', reposition, true);
                window.addEventListener('resize', reposition);
                listenersAttached = true;
            };

            const detachListeners = () => {
                if (!listenersAttached) return;
                window.removeEventListener('scroll', reposition, true);
                window.removeEventListener('resize', reposition);
                listenersAttached = false;
            };

            const showTooltip = () => {
                clearTimeout(hideTimer);
                tooltip.classList.add('horse-tooltip--visible');
                positionTooltip();
                attachListeners();
            };

            const hideTooltip = () => {
                hideTimer = setTimeout(() => {
                    tooltip.classList.remove('horse-tooltip--visible');
                    detachListeners();
                }, 100);
            };

            targetSpan.addEventListener('mouseenter', showTooltip);
            targetSpan.addEventListener('mouseleave', hideTooltip);
            tooltip.addEventListener('mouseenter', showTooltip);
            tooltip.addEventListener('mouseleave', hideTooltip);
        }
    };

    // 启动应用
    App.init();

})();
