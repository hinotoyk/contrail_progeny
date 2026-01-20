// ==UserScript==
// @name         云崽高亮器
// @namespace    https://github.com/hinotoyk/contrail_progeny
// @version      1.2.0
// @description  一键高亮云崽并展示相关数据
// @author       hinotoyk
// @match        https://www.jra.go.jp/*
// @match        https://www.jbis.or.jp/*
// @match        https://*.netkeiba.com/*
// @match        https://www.keibanomiryoku.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    /**********************
     * Alpine.js 注入
     **********************/
    function loadAlpine(cb) {
        if (window.Alpine) return cb();
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js';
        script.defer = true;
        script.onload = cb;
        document.head.appendChild(script);
    }

    /**********************
     * JSON 数据地址
     **********************/
    const DATA_URL = `https://raw.githubusercontent.com/hinotoyk/contrail_progeny/refs/heads/main/tampermonkey-project/data/Contrail%27s%20Crops%20Progress%202023.json`;

    /**********************
     * Tooltip 渲染（Alpine）
     **********************/
function renderTooltip(horse) {
    const translation = horse['港译'] || horse['译名'];
    const displayName = translation
        ? `${escapeHTML(horse['馬名'])}【${escapeHTML(translation)}】`
        : escapeHTML(horse['馬名']);
    const fallbackTranslation = translation ? '' : '<div class="tt-sub">暂无译名</div>';

    const html = `
<div class="horse-tooltip">
    <div class="tt-header">
        <div class="tt-name">${displayName}</div>
        ${fallbackTranslation}
    </div>

    <div class="tt-grid">
        ${row('性别', horse['性別'])}
        ${row('毛色', horse['毛色'])}
        ${row('马主', horse['馬主'])}
        ${row('母马', horse['母名'])}
        ${row('母父', horse['母父名'])}
        ${row('牧场', horse['生产牧场'])}
        ${row('调教师', horse['管理調教師'])}
    </div>

    ${block('备注', horse['备考'])}
    ${collapse('近况 / 牧场评价', horse['近况更新/近走/牧场评价'])}
    ${collapse('血统分析', horse['血统分析'])}
</div>`;

    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const tooltip = template.content.firstElementChild;

    const stopScrollPropagation = ev => {
        ev.stopPropagation();
    };
    tooltip.addEventListener('wheel', stopScrollPropagation, { passive: true });
    tooltip.addEventListener('touchmove', stopScrollPropagation, { passive: true });

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


    function row(label, val) {
        const value = val ? escapeHTML(val) : '/';
        return `
<div class="tt-row">
    <span>${label}</span>
    <strong>${value}</strong>
</div>`;
    }

    function block(label, val) {
        if (!val) return '';
        return `
<div class="tt-block">
    <div class="tt-block-title">${label}</div>
    <div class="tt-block-body">${nl2br(val)}</div>
</div>`;
    }

    function collapse(label, val) {
        if (!val) return '';
        return `
<div class="tt-collapse open">
    <div class="tt-collapse-title">
        <span class="tt-collapse-icon">▼</span>
        <span class="tt-collapse-label">${escapeHTML(label)}</span>
    </div>
    <div class="tt-collapse-body">
        ${nl2br(val)}
    </div>
</div>`;
    }

    /**********************
     * 样式
     **********************/
    GM_addStyle(`
:root {
    --contrail-font-family: 'Source Han Sans', '思源黑体', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif;
}

.horse-highlight,
.horse-tooltip,
.horse-tooltip * {
    font-family: var(--contrail-font-family);
}

.horse-highlight {
    background: linear-gradient(transparent 60%, #ffd6d6 60%);
    color: rgb(255, 136, 166);
    font-weight: 600;
    cursor: pointer;
    position: relative;
}

.horse-tooltip {
    position: fixed;
    top: 0;
    left: 0;
    width: 440px;
    max-height: 80vh;
    overflow-y: auto;
    background: #faf7f2;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 15px 40px rgba(0,0,0,.25);
    z-index: 2147483647;
    font-size: 15px;
    line-height: 1.5;
    pointer-events: auto;
}

.horse-tooltip--floating {
    display: none;
    opacity: 0;
    transition: opacity .15s ease;
}

.horse-tooltip--floating.horse-tooltip--visible {
    display: block;
    opacity: 1;
}

.tt-header {
    border-bottom: 1px solid #ddd;
    margin-bottom: 10px;
}

.tt-name {
    font-size: 20px;
    font-weight: bold;
}

.tt-sub {
    font-size: 13px;
    color: #666;
}

.tt-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 12px;
    margin-top: 10px;
}

.tt-row span,
.tt-row strong {
    color: #333;
}

.tt-row strong {
    font-weight: 600;
}

.tt-block {
    margin-top: 12px;
}

.tt-block-title {
    font-weight: bold;
    margin-bottom: 4px;
    color: #333;
}

.tt-block-body {
    font-size: 14px;
    color: #333;
}

.tt-collapse {
    margin-top: 12px;
}

.tt-collapse-title {
    cursor: pointer;
    font-weight: bold;
    color: #318cfa;
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
    color: #333;
}
    `);

    /**********************
     * 加载 JSON + 初始化
     **********************/
    loadAlpine(() => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: DATA_URL,
            onload(res) {
                const list = JSON.parse(res.responseText);
            highlight(list);
        }
    });
});

    function highlight(horses) {
        const map = new Map();
        horses.forEach(h => h['馬名'] && map.set(h['馬名'], h));

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT
        );

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            const text = node.nodeValue;
            if (!text) return;

            map.forEach((horse, name) => {
                if (!text.includes(name)) return;

                const translation = horse['港译'] || horse['译名'];
                const highlightedName = translation
                    ? `${escapeHTML(name)}【${escapeHTML(translation)}】`
                    : escapeHTML(name);

                const span = document.createElement('span');
                span.className = 'horse-highlight';
                span.innerHTML = highlightedName;

                const tooltip = renderTooltip(horse);
                document.body.appendChild(tooltip);
                tooltip.classList.add('horse-tooltip--floating');

                let hideTimer = null;
                let listenersAttached = false;

                const margin = 12;
                const order = ['bottom', 'top', 'right', 'left'];

                const positionTooltip = () => {
                    const tooltipRect = tooltip.getBoundingClientRect();
                    const targetRect = span.getBoundingClientRect();
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

                    let top;
                    let left;

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

                span.addEventListener('mouseenter', showTooltip);
                span.addEventListener('mouseleave', hideTooltip);
                tooltip.addEventListener('mouseenter', showTooltip);
                tooltip.addEventListener('mouseleave', hideTooltip);

                node.parentNode.replaceChild(span, node);
            });
        });
    }

    function nl2br(str) {
        return escapeHTML(str).replace(/\n/g, '<br>');
    }

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();
