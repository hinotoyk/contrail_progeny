// ==UserScript==
// @name         云崽高亮器
// @namespace    https://github.com/hinotoyk/contrail_progeny
// @version      2.3.0
// @description  一键高亮云崽并展示相关数据
// @author       hinotoyk
// @license      CC BY-NC-SA 4.0
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      raw.githubusercontent.com
// @connect      docs.google.com
// @connect      googleusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) {
        return;
    }

    /**
     * Module: Constants
     * 常量定义
     */
    const Constants = {
        DATA_URL: `https://raw.githubusercontent.com/hinotoyk/contrail_progeny/refs/heads/main/tampermonkey-project/data/ContrailCrops.json`,
        SHEET_URL: `https://docs.google.com/spreadsheets/d/1PPasJnqqBQy_cbhXLDJ0V11CTUDJs6UBtRwe-nsCNfc/export?format=csv&gid=0`,
        RACE_SHEET_URL: `https://docs.google.com/spreadsheets/d/1PPasJnqqBQy_cbhXLDJ0V11CTUDJs6UBtRwe-nsCNfc/export?format=csv&gid=1454271910`,
        CACHE_KEY: 'contrail_progeny_data',
        SHEET_CACHE_KEY: 'sheet_csv_cache',
        RACE_SHEET_CACHE_KEY: 'sheet_race_cache',
        CACHE_EXPIRY: 1 * 60 * 60 * 1000, // 1小时
        SHEET_CACHE_EXPIRY: 10 * 60 * 1000, // 10分钟
        ALPINE_URL: 'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js',
        GRADE_ORDER: ['GI', 'JpnI', 'GII', 'JpnII', 'GIII', 'JpnIII', 'L', 'OP', ''],
        SITE_STORAGE_KEY: 'contrail_progeny_sites',
        SITE_STORAGE_VERSION: 1,
        DEFAULT_SITES: [
            { id: 'jra', label: 'JRA 官方网站', pattern: 'https://www.jra.go.jp/*', enabled: true, origin: 'default' },
            { id: 'jbis', label: 'JBIS 官方数据库', pattern: 'https://www.jbis.or.jp/*', enabled: true, origin: 'default' },
            { id: 'netkeiba', label: 'netkeiba', pattern: 'https://*.netkeiba.com/*', enabled: true, origin: 'default' },
            { id: 'keibanomiryoku', label: '競馬の魅力', pattern: 'https://www.keibanomiryoku.com/*', enabled: true, origin: 'default' }
        ]
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

        escapeRegExp(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        matchWildcard(url, pattern) {
            if (!pattern) return false;
            const escaped = this.escapeRegExp(pattern).replace(/\\\*/g, '.*');
            const regex = new RegExp(`^${escaped}$`, 'i');
            return regex.test(url);
        },

        onDocumentReady(cb) {
            if (document.readyState === 'loading') {
                const once = () => {
                    document.removeEventListener('DOMContentLoaded', once);
                    cb();
                };
                document.addEventListener('DOMContentLoaded', once);
            } else {
                cb();
            }
        },

        /**
         * 円 → 日式金额显示（万円 / 億）
         * @param {number|string} amount
         * @returns {string}
         */
        formatJPY(amount) {
            if (amount === null || amount === undefined || amount === '') return '';

            // 移除逗号
            const cleanAmount = String(amount).replace(/,/g, '');
            const num = Number(cleanAmount);
            if (Number.isNaN(num)) return '';

            const YEN_PER_MAN = 10000;
            const YEN_PER_OKU = 100000000;

            // 小于 1 亿
            if (num < YEN_PER_OKU) {
                const man = num / YEN_PER_MAN;
                // 保留 1 位小数，去掉多余 0
                const manStr = man.toFixed(1).replace(/\.0$/, '');
                return `${manStr}万円`;
            }

            // 大于等于 1 亿
            const oku = Math.floor(num / YEN_PER_OKU);
            const rest = num % YEN_PER_OKU;
            const man = Math.floor(rest / YEN_PER_MAN);

            if (man > 0) {
                return `${oku}億${man}万円`;
            } else {
                return `${oku}億`;
            }
        },

        nl2br(str) {
            return this.escapeHTML(str).replace(/\n/g, '<br>');
        },

        formatDate(dateStr) {
            if (!dateStr) return null;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        },

        loadAlpine(cb) {
            if (window.Alpine) return cb();
            const script = document.createElement('script');
            script.src = Constants.ALPINE_URL;
            script.defer = true;
            script.onload = cb;
            document.head.appendChild(script);
        },

        calculateStats(races) {
            if (!races || !races.length) return null;

            let wins = 0;
            const places = [0, 0, 0, 0, 0]; // 1st, 2nd, 3rd, 4th, 5th
            let total = 0;

            races.forEach(r => {
                // 解析着顺，可能是数字字符串，也可能是 "1(降)" 等
                const resultStr = String(r.result).trim();
                const rank = parseInt(resultStr, 10);

                // 只要有结果，就计入总场数（排除取消、中止等非数字情况，如果需要更严谨判断需调整）
                if (!isNaN(rank)) {
                    total++;
                    if (rank >= 1 && rank <= 5) {
                        places[rank - 1]++;
                    }
                }
            });

            wins = places[0];
            const p1_2 = places[0] + places[1]; // 连对 (前2)
            const p1_3 = p1_2 + places[2];      // 复胜 (前3)
            const p1_5 = p1_3 + places[3] + places[4]; // 进板 (前5)

            const formatRate = (num, den) => {
                if (den === 0) return '0%';
                return Math.round((num / den) * 100) + '%';
            };

            return {
                total,
                wins,
                places,
                winRate: formatRate(wins, total),
                quinellaRate: formatRate(p1_2, total),
                placeRate: formatRate(p1_3, total),
                boardRate: formatRate(p1_5, total)
            };
        },

        calculateWins(races) {
            if (!races || !races.length) return [];

            // 筛选出所有获胜比赛（着顺为1）
            const wins = races.filter(r => String(r.result).trim() === '1');
            if (!wins.length) return [];

            // 排序逻辑：格高者优先，同格日期新者优先
            wins.sort((a, b) => {
                const gradeA = (a.grade || '').trim();
                const gradeB = (b.grade || '').trim();

                const idxA = Constants.GRADE_ORDER.indexOf(gradeA);
                const idxB = Constants.GRADE_ORDER.indexOf(gradeB);

                // 如果都不在列表中（未知等级），按字符串排序（或者都视为最低级）
                // 这里假设不在列表中的等级排在列表之后
                const rankA = idxA === -1 ? 999 : idxA;
                const rankB = idxB === -1 ? 999 : idxB;

                if (rankA !== rankB) {
                    return rankA - rankB;
                }

                // 同等级，按日期倒序
                return new Date(b.date) - new Date(a.date);
            });

            // 过滤逻辑：
            // 如果所有胜鞍都是空白格（普通赛事），只保留最新的3个
            // 如果有分级赛胜鞍，全部展示

            const hasOpOrHigherWin = wins.some(w => {
                const g = (w.grade || '').trim();
                // OP is index 7 in GRADE_ORDER
                return g && Constants.GRADE_ORDER.indexOf(g) !== -1 && Constants.GRADE_ORDER.indexOf(g) <= 7;
            });

            if (hasOpOrHigherWin) {
                // 如果有 OP 以上的胜鞍，过滤掉空白格的胜鞍
                return wins.filter(w => {
                    const g = (w.grade || '').trim();
                    return g && Constants.GRADE_ORDER.indexOf(g) !== -1 && Constants.GRADE_ORDER.indexOf(g) <= 7;
                });
            }

            // 否则（只有空白格胜鞍），只保留最新的3个
            return wins.slice(0, 3);
        },

        getLatestRace(races) {
            if (!races || !races.length) return null;
            // 假设 races 已经按日期倒序排列
            return races[0];
        }
    };

    /**
     * Module: SiteManager
     * 支持站点动态管理
     */
    const SiteManager = {
        sites: [],
        onSiteEnabled: null,
        init(options = {}) {
            this.onSiteEnabled = options.onSiteEnabled || null;
            this.sites = this.loadSites();
            this.renderMenu();
        },

        loadSites() {
            try {
                const stored = GM_getValue(Constants.SITE_STORAGE_KEY, null);
                if (stored && stored.version === Constants.SITE_STORAGE_VERSION && Array.isArray(stored.sites)) {
                    return this.mergeDefaults(this.normalizeSites(stored.sites));
                }
            } catch (err) {
                console.warn('Failed to load site configuration', err);
            }
            const defaults = this.normalizeSites(Constants.DEFAULT_SITES);
            this.saveSites(defaults);
            return defaults;
        },

        mergeDefaults(currentSites) {
            const patternSet = new Set(currentSites.map(site => site.pattern));
            Constants.DEFAULT_SITES.forEach(def => {
                if (!patternSet.has(def.pattern)) {
                    currentSites.push({ ...def });
                }
            });
            return this.normalizeSites(currentSites);
        },

        normalizeSites(list) {
            const usedIds = new Set();
            return list.reduce((acc, site) => {
                const pattern = (site.pattern || '').trim();
                if (!pattern) return acc;

                let id = site.id && !usedIds.has(site.id)
                    ? site.id
                    : this.makeIdFromPattern(pattern, usedIds);
                usedIds.add(id);

                acc.push({
                    id,
                    label: (site.label || pattern).trim(),
                    pattern,
                    enabled: site.enabled !== false,
                    origin: site.origin || 'user'
                });
                return acc;
            }, []);
        },

        makeIdFromPattern(pattern, usedIds) {
            const base = pattern
                .replace(/[^a-z0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '')
                .toLowerCase() || 'site';
            let candidate = base;
            let idx = 1;
            while (usedIds.has(candidate)) {
                candidate = `${base}_${idx++}`;
            }
            usedIds.add(candidate);
            return candidate;
        },

        saveSites(sites) {
            GM_setValue(Constants.SITE_STORAGE_KEY, {
                version: Constants.SITE_STORAGE_VERSION,
                sites: this.normalizeSites(sites)
            });
        },

        persist() {
            this.sites = this.normalizeSites(this.sites);
            this.saveSites(this.sites);
        },

        renderMenu() {
            if (typeof GM_registerMenuCommand !== 'function') return;
            GM_registerMenuCommand('Contrail · 添加当前站点', () => this.openSiteModal('add'));
            GM_registerMenuCommand('Contrail · 管理站点列表', () => this.openSiteModal('manage'));
        },

        getActiveSites() {
            return this.sites.filter(site => site.enabled);
        },

        isCurrentSiteEnabled() {
            const href = window.location.href;
            return this.getActiveSites().some(site => Utils.matchWildcard(href, site.pattern));
        },

        getTopLevelLocation() {
            try {
                const topLocation = window.top?.location;
                if (topLocation) {
                    return {
                        origin: topLocation.origin,
                        href: topLocation.href,
                        hostname: topLocation.hostname
                    };
                }
            } catch (err) {
                // ignore cross-origin errors
            }
            return {
                origin: window.location.origin,
                href: window.location.href,
                hostname: window.location.hostname
            };
        },

        promptAddCurrentSite() {
            const topLoc = this.getTopLevelLocation();
            const defaultPattern = `${topLoc.origin}/*`;
            return this.openSiteModal('add', {
                pattern: defaultPattern,
                label: document.title || topLoc.hostname || defaultPattern
            });
        },

        openManagePrompt() {
            this.openSiteModal('manage');
        },

        toggleSite(index) {
            const site = this.sites[index];
            if (!site) return;
            this.sites[index] = { ...site, enabled: !site.enabled };
            this.persist();

            if (this.isCurrentSiteEnabled() && this.sites[index].enabled && this.onSiteEnabled) {
                this.onSiteEnabled();
            }
        },

        deleteSite(index) {
            const site = this.sites[index];
            if (!site) return;
            if (site.origin === 'default') {
                if (typeof alert === 'function') alert('默认站点不可删除，可通过切换禁用');
                return;
            }
            this.sites.splice(index, 1);
            this.persist();

            if (this.isCurrentSiteEnabled() && this.onSiteEnabled) {
                this.onSiteEnabled();
            }
        },
        renderInactiveBanner() {},
        removeInactiveBanner() {},

        openSiteModal(mode, options = {}) {
            const topLoc = this.getTopLevelLocation();
            const overlay = document.createElement('div');
            overlay.className = 'contrail-modal-overlay';

            const modal = document.createElement('div');
            modal.className = 'contrail-modal';

            const closeModal = () => {
                overlay.remove();
            };

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    closeModal();
                }
            });

            const renderAdd = () => {
                const patternValue = options.pattern || `${topLoc.origin}/*`;
                const labelValue = options.label || document.title || topLoc.hostname || patternValue;

                modal.innerHTML = `
                    <div class="contrail-modal__header">
                        <div class="contrail-modal__title">添加支持站点</div>
                        <button class="contrail-modal__close" aria-label="关闭">×</button>
                    </div>
                    <div class="contrail-modal__body">
                        <label class="contrail-modal__field">
                            <span>地址匹配规则 <small>(支持 * 通配符)</small></span>
                            <input type="text" class="contrail-modal__input" data-field="pattern" value="${patternValue}">
                        </label>
                        <label class="contrail-modal__field">
                            <span>站点名称</span>
                            <input type="text" class="contrail-modal__input" data-field="label" value="${labelValue}">
                        </label>
                    </div>
                    <div class="contrail-modal__footer">
                        <button class="contrail-btn contrail-btn--secondary" data-action="cancel">取消</button>
                        <button class="contrail-btn contrail-btn--primary" data-action="submit">保存并启用</button>
                    </div>
                `;

                modal.querySelector('[data-action="submit"]').addEventListener('click', () => {
                    const pattern = modal.querySelector('[data-field="pattern"]').value.trim();
                    const label = modal.querySelector('[data-field="label"]').value.trim() || pattern;

                    if (!pattern) {
                        alert('地址匹配规则不能为空');
                        return;
                    }

                    const existingIndex = this.sites.findIndex(site => site.pattern === pattern);
                    if (existingIndex !== -1) {
                        this.sites[existingIndex] = {
                            ...this.sites[existingIndex],
                            label,
                            pattern,
                            enabled: true
                        };
                    } else {
                        this.sites.push({
                            id: null,
                            label,
                            pattern,
                            enabled: true,
                            origin: 'user'
                        });
                    }

                    this.persist();
                    closeModal();

                    if (this.onSiteEnabled && this.isCurrentSiteEnabled()) {
                        this.onSiteEnabled();
                    }

                    alert('站点已保存并启用');
                });
            };

            const renderManage = () => {
                if (!this.sites.length) {
                    modal.innerHTML = `
                        <div class="contrail-modal__header">
                            <div class="contrail-modal__title">管理支持站点</div>
                            <button class="contrail-modal__close" aria-label="关闭">×</button>
                        </div>
                        <div class="contrail-modal__body">
                            <div class="contrail-empty">尚未配置任何站点</div>
                        </div>
                        <div class="contrail-modal__footer">
                            <button class="contrail-btn contrail-btn--secondary" data-action="close">关闭</button>
                        </div>
                    `;
                    return;
                }

                const listHtml = this.sites.map((site, idx) => {
                    const statusClass = site.enabled ? 'is-enabled' : 'is-disabled';
                    const toggleLabel = site.enabled ? '已启用' : '已禁用';
                    const badge = site.origin === 'default' ? '<span class="contrail-tag">默认</span>' : '';
                    const deleteDisabled = site.origin === 'default' ? 'disabled' : '';

                    return `
                        <div class="contrail-site-item ${statusClass}" data-index="${idx}">
                            <div class="contrail-site-item__info">
                                <div class="contrail-site-item__title">${Utils.escapeHTML(site.label)} ${badge}</div>
                                <div class="contrail-site-item__url">${Utils.escapeHTML(site.pattern)}</div>
                            </div>
                            <div class="contrail-site-item__buttons">
                                <button class="contrail-btn contrail-btn--ghost" data-action="toggle">${toggleLabel}</button>
                                <button class="contrail-btn contrail-btn--danger" data-action="delete" ${deleteDisabled}>删除</button>
                            </div>
                        </div>
                    `;
                }).join('');

                modal.innerHTML = `
                    <div class="contrail-modal__header">
                        <div class="contrail-modal__title">管理支持站点</div>
                        <button class="contrail-modal__close" aria-label="关闭">×</button>
                    </div>
                    <div class="contrail-modal__body">
                        <div class="contrail-site-list">${listHtml}</div>
                    </div>
                    <div class="contrail-modal__footer">
                        <button class="contrail-btn contrail-btn--secondary" data-action="close">关闭</button>
                    </div>
                `;

                modal.querySelectorAll('.contrail-site-item').forEach(item => {
                    const index = Number(item.getAttribute('data-index'));
                    const toggleBtn = item.querySelector('[data-action="toggle"]');
                    const deleteBtn = item.querySelector('[data-action="delete"]');

                    toggleBtn.addEventListener('click', () => {
                        this.toggleSite(index);
                        closeModal();
                        this.openSiteModal('manage');
                    });

                    if (deleteBtn && !deleteBtn.disabled) {
                        deleteBtn.addEventListener('click', () => {
                            if (!confirm('确定删除该站点吗？')) return;
                            this.deleteSite(index);
                            closeModal();
                            this.openSiteModal('manage');
                        });
                    }
                });
            };

            if (mode === 'add') {
                renderAdd();
            } else {
                renderManage();
            }

            modal.querySelectorAll('.contrail-modal__close, [data-action="cancel"], [data-action="close"]').forEach(btn => {
                btn.addEventListener('click', closeModal);
            });

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            return true;
        }
    };

    /**
     * Module: CSVUtils
     * Google Sheet CSV 解析工具
     */
    const CSVUtils = {
        parse(text) {
            const rows = [];
            let row = [];
            let cell = '';
            let inQuotes = false;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const next = text[i + 1];

                if (char === '"' && inQuotes && next === '"') {
                    cell += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    row.push(cell);
                    cell = '';
                } else if ((char === '\n' || char === '\r') && !inQuotes) {
                    if (cell || row.length) {
                        row.push(cell);
                        rows.push(row);
                        row = [];
                        cell = '';
                    }
                } else {
                    cell += char;
                }
            }

            if (cell || row.length) {
                row.push(cell);
                rows.push(row);
            }

            return rows;
        },

        loadSheetCsvData({ url, fields, cacheKey, cacheTTL }) {
            return new Promise((resolve, reject) => {
                const cache = GM_getValue(cacheKey, null);
                const cacheTime = GM_getValue(cacheKey + '_time', 0);

                // 命中缓存
                if (cache && Date.now() - cacheTime < cacheTTL) {
                    console.log('Using cached sheet data');
                    resolve(cache);
                    return;
                }

                console.log('Fetching sheet data from:', url);
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: res => {
                        try {
                            console.log('Sheet data response length:', res.responseText.length);
                            const rows = this.parse(res.responseText);
                            console.log('Parsed CSV rows:', rows.length);
                            const headers = rows[0];
                            console.log('CSV Headers:', headers);

                            const result = rows.slice(1).map(cols => {
                                const rowObj = {};
                                headers.forEach((h, i) => {
                                    rowObj[h] = cols[i] ?? null;
                                });

                                // 字段映射
                                const mapped = {};
                                Object.entries(fields).forEach(([outKey, header]) => {
                                    mapped[outKey] = rowObj[header] ?? null;
                                });

                                return mapped;
                            });

                            GM_setValue(cacheKey, result);
                            GM_setValue(cacheKey + '_time', Date.now());

                            resolve(result);
                        } catch (e) {
                            if (cache) resolve(cache);
                            else reject(e);
                        }
                    },
                    onerror: err => {
                        if (cache) resolve(cache);
                        else reject(err);
                    }
                });
            });
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
            try {
                // 并行获取主数据和Sheet数据
                const [mainData, sheetData, raceData] = await Promise.all([
                    this.getMainData(),
                    this.getSheetData(),
                    this.getRaceSheetData()
                ]);

                // 合并数据
                return this.mergeData(mainData, sheetData, raceData);
            } catch (err) {
                console.error('Data loading error:', err);
                // 降级：如果部分失败，尝试返回已有数据
                return await this.getMainData();
            }
        },

        async getMainData() {
            const cachedData = this.getCache();
            if (cachedData) return cachedData;
            return this.fetchAndCache();
        },

        async getSheetData() {
            return CSVUtils.loadSheetCsvData({
                url: Constants.SHEET_URL,
                fields: {
                    horseName: '馬名',
                    debutDate: '初出走',
                    winDate: '初勝利',
                    registerDate: '登録日',
                    retireDate: '抹消日',
                    prizeMoney: '獲得賞金(円)',
                    earnings: '収得賞金(円)'
                },
                cacheKey: Constants.SHEET_CACHE_KEY,
                cacheTTL: Constants.SHEET_CACHE_EXPIRY
            });
        },

        async getRaceSheetData() {
            const rawData = await CSVUtils.loadSheetCsvData({
                url: Constants.RACE_SHEET_URL,
                fields: {
                    horseName: '出走馬名',
                    date: '日付',
                    raceName: '競走名',
                    grade: '格',
                    result: '結果'
                },
                cacheKey: Constants.RACE_SHEET_CACHE_KEY,
                cacheTTL: Constants.SHEET_CACHE_EXPIRY
            });
            // 按马名分组
            const grouped = new Map();
            rawData.forEach(item => {
                if (!item.horseName) return;
                // 清理马名中的空白字符
                const cleanName = item.horseName.trim();
                if (!grouped.has(cleanName)) {
                    grouped.set(cleanName, []);
                }
                grouped.get(cleanName).push(item);
            });

            // 按日期倒序排序
            grouped.forEach(races => {
                races.sort((a, b) => new Date(b.date) - new Date(a.date));
            });

            return grouped;
        },

        mergeData(mainList, sheetList, raceMap) {
            const sheetMap = new Map();
            if (sheetList) {
                sheetList.forEach(item => {
                    if (item.horseName) {
                        sheetMap.set(item.horseName, item);
                    }
                });
            }

            const merged = mainList.map(horse => {
                const cleanName = horse['馬名'] ? horse['馬名'].trim() : '';
                const sheetInfo = sheetMap.get(cleanName);
                const races = raceMap ? raceMap.get(cleanName) : null;

                let combined = horse;
                if (sheetInfo) {
                    combined = { ...combined, ...sheetInfo };
                }
                if (races) {
                    combined = { ...combined, races };
                }
                return combined;
            });
            return merged;
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

            .contrail-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.35);
                backdrop-filter: blur(2px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2147483646;
                padding: 24px;
            }

            .contrail-modal {
                width: min(480px, calc(100vw - 48px));
                max-height: min(620px, calc(100vh - 48px));
                background: var(--contrail-bg);
                color: var(--contrail-text);
                border-radius: 16px;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: var(--contrail-font-family);
                border: 1px solid var(--contrail-border);
                animation: contrail-modal-in 0.18s ease-out;
            }

            @keyframes contrail-modal-in {
                from { transform: translateY(16px) scale(0.98); opacity: 0; }
                to   { transform: translateY(0) scale(1); opacity: 1; }
            }

            .contrail-modal__header,
            .contrail-modal__footer {
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                background: rgba(0,0,0,0.02);
            }

            .contrail-modal__header {
                border-bottom: 1px solid var(--contrail-border);
            }

            .contrail-modal__footer {
                border-top: 1px solid var(--contrail-border);
                justify-content: flex-end;
            }

            .contrail-modal__body {
                padding: 20px;
                overflow-y: auto;
                max-height: 100%;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .contrail-modal__title {
                font-size: 18px;
                font-weight: 600;
                color: var(--contrail-highlight-text);
            }

            .contrail-modal__close {
                border: none;
                background: transparent;
                color: var(--contrail-text-secondary);
                font-size: 20px;
                cursor: pointer;
                transition: color 0.2s ease;
            }

            .contrail-modal__close:hover {
                color: var(--contrail-highlight-text);
            }

            .contrail-modal__field {
                display: flex;
                flex-direction: column;
                gap: 6px;
                font-size: 14px;
                color: var(--contrail-text-secondary);
            }

            .contrail-modal__field span {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                font-weight: 600;
                color: var(--contrail-text);
            }

            .contrail-modal__field small {
                font-weight: normal;
                color: var(--contrail-text-secondary);
                font-size: 12px;
            }

            .contrail-modal__input {
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid var(--contrail-border);
                background: rgba(255,255,255,0.9);
                color: var(--contrail-text);
                font-size: 14px;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }

            .contrail-modal__input:focus {
                outline: none;
                border-color: var(--contrail-highlight-text);
                box-shadow: 0 0 0 2px rgba(255,136,166,0.25);
            }

            .contrail-btn {
                border: none;
                border-radius: 999px;
                padding: 8px 18px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                color: inherit;
            }

            .contrail-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                box-shadow: none;
                transform: none;
            }

            .contrail-btn:not(:disabled):hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 12px rgba(0,0,0,0.12);
            }

            .contrail-btn--primary {
                background: linear-gradient(135deg, var(--contrail-highlight-bg), rgba(255,136,166,0.65));
                color: var(--contrail-highlight-text);
                border: 1px solid rgba(255,136,166,0.4);
            }

            .contrail-btn--secondary {
                background: rgba(0,0,0,0.05);
                border: 1px solid var(--contrail-border);
                color: var(--contrail-text);
            }

            .contrail-btn--ghost {
                background: transparent;
                border: 1px solid var(--contrail-border);
                color: var(--contrail-text);
            }

            .contrail-btn--danger {
                background: rgba(255, 82, 82, 0.12);
                border: 1px solid rgba(255, 82, 82, 0.4);
                color: #d32f2f;
            }

            .contrail-site-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .contrail-site-item {
                border: 1px solid var(--contrail-border);
                border-radius: 12px;
                padding: 12px 16px;
                display: flex;
                gap: 16px;
                align-items: center;
                justify-content: space-between;
                background: rgba(0,0,0,0.02);
                transition: border-color 0.2s ease, background 0.2s ease;
            }

            .contrail-site-item.is-enabled {
                border-color: rgba(255,136,166,0.45);
                background: rgba(255,136,166,0.08);
            }

            .contrail-site-item__info {
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
            }

            .contrail-site-item__title {
                font-weight: 600;
                font-size: 15px;
                color: var(--contrail-text);
            }

            .contrail-site-item__url {
                font-size: 13px;
                color: var(--contrail-text-secondary);
                word-break: break-all;
            }

            .contrail-site-item__buttons {
                display: flex;
                gap: 8px;
                flex-shrink: 0;
            }

            .contrail-tag {
                display: inline-block;
                padding: 2px 8px;
                margin-left: 8px;
                border-radius: 999px;
                background: rgba(0,0,0,0.08);
                color: var(--contrail-text-secondary);
                font-size: 12px;
                font-weight: 600;
            }

            .contrail-empty {
                text-align: center;
                color: var(--contrail-text-secondary);
                padding: 24px 0;
                font-size: 14px;
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
                gap: 8px 16px;
                margin-top: 10px;
                background: rgba(0,0,0,0.02);
                padding: 10px;
                border-radius: 8px;
            }

            .tt-row {
                display: flex;
                flex-direction: column;
                gap: 2px;
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

            .tt-race-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
                margin-top: 5px;
            }

            .tt-race-table th,
            .tt-race-table td {
                padding: 4px 6px;
                border: 1px solid var(--contrail-border);
                text-align: left;
            }

            .tt-race-table th {
                background: rgba(0,0,0,0.05);
                font-weight: bold;
                color: var(--contrail-text);
            }
            
            .tt-race-table td {
                color: var(--contrail-text);
            }

            /* Stats Card Styles */
            .tt-stats-card {
                background: rgba(0,0,0,0.03);
                border-radius: 8px;
                padding: 10px;
                margin-top: 8px;
            }

            .tt-stats-header {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 8px;
                display: flex;
                align-items: baseline;
                color: var(--contrail-text);
            }

            .tt-stats-record {
                font-family: var(--contrail-font-family);
                font-size: 14px;
                color: var(--contrail-text-secondary);
                margin-left: 4px;
                font-weight: normal;
            }

            .tt-stats-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                margin-bottom: 8px;
            }

            .tt-stat-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                background: rgba(255,255,255,0.5);
                border-radius: 6px;
                padding: 4px;
            }

            .tt-stat-label {
                font-size: 10px;
                color: var(--contrail-text-secondary);
                margin-bottom: 2px;
            }

            .tt-stat-value {
                font-size: 14px;
                font-weight: bold;
                color: var(--contrail-text);
            }
            
            .tt-stat-row {
                display: flex;
                font-size: 13px;
                margin-top: 4px;
                line-height: 1.4;
            }

            .tt-stat-row-label {
                color: var(--contrail-text-secondary);
                width: 60px;
                flex-shrink: 0;
            }

            .tt-stat-row-value {
                color: var(--contrail-text);
                font-weight: 500;
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
            const value = val ? Utils.escapeHTML(val) : '<span style="color:#ccc">/</span>';
            return `
            <div class="tt-row">
                <span style="font-size:14px;">${label}</span>
                <strong style="font-size:16px;">${value}</strong>
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

        raceStats(races) {
            const stats = Utils.calculateStats(races);
            if (!stats) return '';

            const p = stats.places;
            const recordStr = `[${p[0]}-${p[1]}-${p[2]}-${p[3]}-${p[4]}]`;

            // 主胜鞍
            const majorWins = Utils.calculateWins(races);
            const majorWinsStr = majorWins.length > 0
                ? majorWins.map(w => {
                    const name = Utils.escapeHTML(w.raceName);
                    const grade = (w.grade || '').trim();

                    // 判断是否为 OP 及以上
                    const isOpOrHigher = grade && Constants.GRADE_ORDER.indexOf(grade) !== -1 && Constants.GRADE_ORDER.indexOf(grade) <= 7;

                    let displayName;
                    if (isOpOrHigher) {
                        // OP及以上：25'xxx(G1)
                        const yy = w.date ? String(new Date(w.date).getFullYear()).slice(-2) : '';
                        const prefix = yy ? `${yy}'` : '';
                        displayName = `${prefix}${name}(${grade})`;
                    } else {
                        // 条件赛：xxx
                        displayName = name;
                    }

                    if (grade === 'GI' || grade === 'JpnI') {
                        return `<b style="color:#d32f2f">${displayName}</b>`; // G1 wins highlighted red
                    }
                    return displayName;
                }).join('、')
                : '-';

            // 前走
            const latest = Utils.getLatestRace(races);
            let latestStr = '-';
            if (latest) {
                const name = Utils.escapeHTML(latest.raceName);
                const grade = (latest.grade || '').trim();
                const isOpOrHigher = grade && Constants.GRADE_ORDER.indexOf(grade) !== -1 && Constants.GRADE_ORDER.indexOf(grade) <= 7;

                const displayName = isOpOrHigher ? `${name}(${grade})` : name;

                latestStr = `${displayName} <span style="font-weight:bold; color:${latest.result == 1 ? '#d32f2f' : 'inherit'}">(${Utils.escapeHTML(latest.result)})</span>`;
            }

            return `
            <div class="tt-stats-card">
                <div class="tt-stats-header">
                    <span>${stats.total}战${stats.wins}胜</span>
                    <span class="tt-stats-record">${recordStr}</span>
                </div>
                
                <div class="tt-stats-grid">
                    <div class="tt-stat-item">
                        <span class="tt-stat-label">胜率</span>
                        <span class="tt-stat-value">${stats.winRate}</span>
                    </div>
                    <div class="tt-stat-item">
                        <span class="tt-stat-label">连对率</span>
                        <span class="tt-stat-value">${stats.quinellaRate}</span>
                    </div>
                    <div class="tt-stat-item">
                        <span class="tt-stat-label">复胜率</span>
                        <span class="tt-stat-value">${stats.placeRate}</span>
                    </div>
                    <div class="tt-stat-item">
                        <span class="tt-stat-label">进板率</span>
                        <span class="tt-stat-value">${stats.boardRate}</span>
                    </div>
                </div>

                <div class="tt-stat-row">
                    <div class="tt-stat-row-label">主胜鞍</div>
                    <div class="tt-stat-row-value">${majorWinsStr}</div>
                </div>
                <div class="tt-stat-row">
                    <div class="tt-stat-row-label">前走</div>
                    <div class="tt-stat-row-value">${latestStr}</div>
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
                    ${this.row('调教师', horse['管理調教師'])}
                    ${this.row('生产牧场', horse['生产牧场'])}
                    ${this.row('母父', horse['母父名'])}
                    ${this.row('母马', horse['母名'])}
                    <div style="grid-column: span 2;">
                        ${this.row('马主', horse['馬主'])}
                    </div>
                    
                    ${this.row('注册日', Utils.formatDate(horse['registerDate']))}
                    ${this.row('抹消日', Utils.formatDate(horse['retireDate']))}
                    ${this.row('初出走', Utils.formatDate(horse['debutDate']))}
                    ${this.row('初胜利', Utils.formatDate(horse['winDate']))}
                    ${this.row('赏金', Utils.formatJPY(horse['prizeMoney']))}
                    ${this.row('收得', Utils.formatJPY(horse['earnings']))}
                </div>

                ${this.raceStats(horse.races)}
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
        loading: false,
        dataCache: null,
        mapCache: null,
        observer: null,

        init() {
            Styles.inject();
            SiteManager.init({
                onSiteEnabled: () => this.enableForCurrentSite()
            });

            if (SiteManager.isCurrentSiteEnabled()) {
                this.enableForCurrentSite();
            }
        },

        enableForCurrentSite() {
            if (this.loading) return;

            if (this.dataCache) {
                this.highlight(this.dataCache);
                return;
            }

            this.loading = true;
            Utils.loadAlpine(async () => {
                try {
                    const data = await DataManager.getData();
                    this.dataCache = data;
                    this.highlight(data);
                } catch (err) {
                    console.error('Failed to load horse data:', err);
                } finally {
                    this.loading = false;
                }
            });
        },

        setupMutationObserver() {
            if (this.observer) return;

            const initObserver = () => {
                if (this.observer || !document.body) return;

                this.observer = new MutationObserver((mutations) => {
                    let shouldProcess = false;
                    for (const mutation of mutations) {
                        if (mutation.addedNodes.length > 0) {
                            shouldProcess = true;
                            break;
                        }
                    }
                    if (shouldProcess) {
                        this.processNodes(document.body);
                    }
                });

                this.observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            };

            if (document.body) {
                initObserver();
            } else {
                Utils.onDocumentReady(initObserver);
            }
        },

        processNodes(rootNode) {
            const map = this.mapCache;
            if (!map || !map.size || !rootNode) return;

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
                    const index = text.indexOf(name);
                    if (index !== -1) {
                        // Split text node to isolate the matching part
                        const matchNode = node.splitText(index);
                        matchNode.splitText(name.length);

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

                        if (matchNode.parentNode) {
                            matchNode.parentNode.replaceChild(span, matchNode);
                        }

                        found = true;
                        break; // Only highlight first match per text node to avoid complexity
                    }
                }
            });
        },

        highlight(horses) {
            if (!SiteManager.isCurrentSiteEnabled()) {
                return;
            }

            if (!Array.isArray(horses) || !horses.length) return;

            const map = new Map();
            horses.forEach(h => h && h['馬名'] && map.set(h['馬名'], h));
            this.mapCache = map;

            const process = () => {
                if (!document.body) return;
                this.processNodes(document.body);
                this.setupMutationObserver();
            };

            if (document.body) {
                process();
            } else {
                Utils.onDocumentReady(process);
            }
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
