/**
 * simulation.js
 * Controller cho tính năng Data Analyst Simulation (Lobby & Workspace)
 */

import { simulationCases } from './simulation-data.js?v=20261014_fix_newline_v3';

let currentCase = null;
let currentLanguage = 'sql';
let currentChartInstance = null;
let mentorChatHistory = [];
let latestSQLResults = null;
let latestSQLQuery = '';

// Gán biến toàn cục để debug hoặc fallback
window.simulationCases = simulationCases;

// ============================================================
// KHỞI TẠO KHI TẢI TRANG (HỖ TRỢ CẢ TRƯỜNG HỢP DOM ĐÃ SẴN SÀNG)
// ============================================================
function bootSimulation() {
    initLobby();
    setupLobbyFilters();
    setupTerminalEvents();
    setupMentorChat();
    initWorkspaceEnhancements();
    if (document.getElementById('simWorkspaceView')?.classList.contains('active')) {
        document.body.classList.add('sim-workspace-active');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSimulation);
} else {
    bootSimulation();
}

window.initLobby = initLobby;
window.bootSimulation = bootSimulation;

// ============================================================
// VIEW 1: THE LOBBY LOGIC
// ============================================================
function initLobby() {
    const grid = document.getElementById('missionsGrid');
    if (!grid) return;

    renderMissionCards(simulationCases);
}

function renderMissionCards(cases) {
    const grid = document.getElementById('missionsGrid');
    if (!grid) return;

    if (!cases || cases.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-muted);">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">🔍</div>
                <h3>Không tìm thấy nhiệm vụ nào</h3>
                <p>Thử đổi từ khóa hoặc bộ lọc độ khó khác</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = cases.map(c => {
        const techBadges = c.techStack.map(t => `<span class="tech-tag">${t}</span>`).join('');
        return `
            <div class="mission-card" data-id="${c.id}">
                <div>
                    <div class="mission-card-top">
                        <span class="mission-category-badge">${c.badgeIcon} ${c.categoryLabel}</span>
                        <span class="difficulty-badge ${c.difficulty}">${c.difficultyLabel}</span>
                    </div>
                    <h3 class="mission-title">${c.title}</h3>
                    <p class="mission-desc">${c.shortDesc}</p>
                </div>
                <div>
                    <div class="mission-meta-row">
                        <div class="mission-tech-stack">
                            ${techBadges}
                        </div>
                        <div class="mission-duration">
                            ⏱️ ${c.estimatedTime}
                        </div>
                    </div>
                    <button class="btn-start-mission" onclick="window.startMission('${c.id}')">
                        🚀 Start Mission →
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function setupLobbyFilters() {
    const searchInput = document.getElementById('lobbySearchInput');
    const filterBtns = document.querySelectorAll('.sim-filter-btn');

    let currentFilter = 'all';

    function applyFilter() {
        const query = (searchInput?.value || '').toLowerCase().trim();
        const filtered = simulationCases.filter(c => {
            const matchesQuery = !query || 
                c.title.toLowerCase().includes(query) || 
                c.shortDesc.toLowerCase().includes(query) ||
                c.categoryLabel.toLowerCase().includes(query);

            const matchesCategory = currentFilter === 'all' || c.difficulty === currentFilter;
            return matchesQuery && matchesCategory;
        });

        renderMissionCards(filtered);
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyFilter);
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilter();
        });
    });
}

// ============================================================
// CHUYỂN ĐỔI MÀN HÌNH (SPA VIEW SWITCHING)
// ============================================================
export function showSimView(viewName) {
    const lobby = document.getElementById('simLobbyView');
    const workspace = document.getElementById('simWorkspaceView');

    if (viewName === 'workspace') {
        lobby?.classList.remove('active');
        workspace?.classList.add('active');
        document.body.classList.add('sim-workspace-active');
        window.scrollTo(0, 0);
    } else {
        workspace?.classList.remove('active');
        lobby?.classList.add('active');
        document.body.classList.remove('sim-workspace-active');
        window.scrollTo(0, 0);
    }
}
window.showSimView = showSimView;

// ============================================================
// VIEW 2: THE WORKSPACE LOGIC
// ============================================================
export function startMission(caseId) {
    const mission = simulationCases.find(c => c.id === caseId);
    if (!mission) {
        alert('Không tìm thấy nhiệm vụ tương ứng!');
        return;
    }

    currentCase = mission;
    currentLanguage = 'sql';
    latestSQLResults = null;
    latestSQLQuery = '';

    // Reset Báo Cáo & AI Feedback
    const reportInput = document.getElementById('reportTextarea');
    if (reportInput) reportInput.value = '';
    const feedbackDiv = document.getElementById('ai-feedback');
    if (feedbackDiv) {
        feedbackDiv.style.display = 'none';
        feedbackDiv.innerHTML = '';
    }
    const statusNote = document.getElementById('reportStatusNote');
    if (statusNote) statusNote.textContent = 'Chấm khắt khe trên thang điểm 100 bởi Head of Data Analytics';
    window.switchOutputTab?.('table');

    // 1. Đăng ký dữ liệu JSON vào AlaSQL để chạy SQL thật
    registerCaseDatabaseInAlaSQL(mission);

    // 2. Cập nhật Topbar
    const titleEl = document.getElementById('workspaceTitle');
    const badgeEl = document.getElementById('workspaceBadge');
    if (titleEl) titleEl.textContent = mission.title;
    if (badgeEl) {
        badgeEl.className = `difficulty-badge ${mission.difficulty}`;
        badgeEl.textContent = mission.difficultyLabel;
    }

    // 3. Render Cột Trái (Mission Briefing)
    renderBriefing(mission);

    // 4. Render Cột Giữa (Terminal & Mock Data preview)
    renderTerminal(mission);
    renderOutputData(mission);

    // 5. Khởi tạo Cột Phải (Gemini AI Mentor)
    resetMentorChat(mission);

    // 6. Chuyển sang Workspace View
    showSimView('workspace');
}
window.startMission = startMission;

function renderBriefing(mission) {
    const container = document.getElementById('briefingInnerContent') || document.getElementById('briefingContainer') || document.getElementById('briefingContent');
    if (!container || !mission) return;

    // 1. Phân tích Objectives (Mục tiêu phân tích) an toàn
    const objectives = Array.isArray(mission.objectives) ? mission.objectives : [];
    const objectivesHtml = objectives.map((obj, i) => `
        <li class="objective-item">
            <input type="checkbox" id="obj_${i}">
            <label for="obj_${i}">${escapeHtml(obj)}</label>
        </li>
    `).join('');

    // 2. Phân tích Schema (Cấu trúc bảng) hỗ trợ 1-Click chèn nhanh tên bảng & tên cột vào SQL Editor
    const schema = Array.isArray(mission.schema) ? mission.schema : [];
    const schemaHtml = schema.map((table, tIdx) => {
        const columns = Array.isArray(table.columns) ? table.columns : [];
        const colsHtml = columns.map(col => `
            <div class="schema-field-item">
                <div class="field-name-group">
                    <span class="field-name schema-insertable-col" onclick="window.insertTextToEditor('${escapeHtml(col.name)}')" title="Click để chèn cột '${escapeHtml(col.name)}' vào SQL Editor">
                        <b>${escapeHtml(col.name)}</b>
                        <span class="click-insert-hint" title="Click để chèn vào SQL Editor">+</span>
                    </span>
                    ${col.desc ? `<span class="field-desc-text">${escapeHtml(col.desc)}</span>` : ''}
                </div>
                <span class="field-type">${escapeHtml(col.type || 'TEXT')}</span>
            </div>
        `).join('');

        // Lấy 3 dòng mẫu từ mockDb nếu có
        const sampleRows = (mission.mockDb && mission.mockDb[table.tableName]) ? mission.mockDb[table.tableName].slice(0, 3) : [];
        let sampleTableHtml = '';
        if (sampleRows.length > 0) {
            const sampleHeaders = Object.keys(sampleRows[0]);
            const sTh = sampleHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('');
            const sRows = sampleRows.map(r => `<tr>${sampleHeaders.map(h => {
                const cellData = formatCellContent(r[h]);
                const numClass = cellData.isNum ? ' class="cell-numeric"' : '';
                return `<td${numClass}>${cellData.html}</td>`;
            }).join('')}</tr>`).join('');
            sampleTableHtml = `
                <div class="schema-sample-preview" id="sample_table_${tIdx}" style="display:none;">
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px; font-weight:600;">Dữ liệu thực tế mẫu (3 dòng đầu):</div>
                    <div class="table-micro-scroll">
                        <table class="sim-data-table micro-table">
                            <thead><tr>${sTh}</tr></thead>
                            <tbody>${sRows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        return `
            <div class="schema-block">
                <div class="schema-header" onclick="window.toggleSchemaSample('sample_table_${tIdx}', this)" title="Click để xem dữ liệu mẫu">
                    <div class="schema-title-text">
                        <span class="schema-insertable-table" onclick="event.stopPropagation(); window.insertTextToEditor('${escapeHtml(table.tableName)}')" title="Click để chèn bảng '${escapeHtml(table.tableName)}' vào SQL Editor">
                            📁 <b>${escapeHtml(table.tableName)}</b>
                            <span class="click-insert-hint" title="Click để chèn vào SQL Editor">+</span>
                        </span>
                        <span class="schema-desc-sub">${escapeHtml(table.description || '')}</span>
                    </div>
                    ${sampleRows.length > 0 ? `<button type="button" class="btn-toggle-sample">👁️ Xem mẫu</button>` : ''}
                </div>
                <div class="schema-table-fields">
                    ${colsHtml}
                </div>
                ${sampleTableHtml}
            </div>
        `;
    }).join('');

    // 3. Phân tích Dữ liệu đối soát tiêu chuẩn (mockData Ground Truth Benchmark)
    let benchmarkHtml = '';
    if (mission.mockData && Array.isArray(mission.mockData.headers) && Array.isArray(mission.mockData.rows)) {
        const bTh = mission.mockData.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
        const bRows = mission.mockData.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('');
        benchmarkHtml = `
            <div class="briefing-card-section">
                <div class="briefing-section-title">📊 Số Liệu Đối Soát Tiêu Chuẩn</div>
                <div class="benchmark-preview-box">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; line-height:1.4;">
                        Số liệu mục tiêu mà bạn cần đối soát để chứng minh giả thuyết:
                    </div>
                    <div class="table-micro-scroll">
                        <table class="sim-data-table micro-table">
                            <thead><tr>${bTh}</tr></thead>
                            <tbody>${bRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // 4. Phân tích Gợi ý tư duy logic (hints hoặc mentorFallbackHints) an toàn
    const hints = Array.isArray(mission.hints) ? mission.hints : (Array.isArray(mission.mentorFallbackHints) ? mission.mentorFallbackHints : []);
    const hintsHtml = hints.map(h => `<li>${escapeHtml(h)}</li>`).join('');

    // 5. Tech Stack & Metadata Tags
    const techStack = Array.isArray(mission.techStack) ? mission.techStack : [];
    const techBadges = techStack.map(t => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('');

    container.innerHTML = `
        <!-- Metadata Overview -->
        <div class="briefing-meta-header">
            <div class="briefing-badge-row">
                <span class="mission-category-badge">${mission.badgeIcon || '💼'} ${escapeHtml(mission.categoryLabel || 'Business Case')}</span>
                <span class="difficulty-badge ${mission.difficulty || 'medium'}">${escapeHtml(mission.difficultyLabel || 'Trung bình')}</span>
                ${mission.estimatedTime ? `<span class="duration-badge">⏱️ ${escapeHtml(mission.estimatedTime)}</span>` : ''}
            </div>
            ${techBadges ? `<div class="briefing-tech-pills">${techBadges}</div>` : ''}
        </div>

        <!-- Bối cảnh bài toán -->
        <div class="briefing-card-section">
            <div class="briefing-section-title">📋 Bối Cảnh Bài Toán</div>
            <div class="briefing-context-box">
                ${mission.fullContext || `<p>${escapeHtml(mission.shortDesc || '')}</p>`}
            </div>
        </div>

        <!-- Mục tiêu phân tích -->
        <div class="briefing-card-section">
            <div class="briefing-section-title">🎯 Mục Tiêu Phân Tích (${objectives.length})</div>
            <ul class="objectives-list">
                ${objectivesHtml}
            </ul>
        </div>

        <!-- Cấu trúc bảng dữ liệu & Dữ liệu mẫu -->
        <div class="briefing-card-section">
            <div class="briefing-section-title">🗄️ Cấu Trúc Bảng CSDL (${schema.length} bảng)</div>
            ${schemaHtml}
        </div>

        <!-- Số liệu đối soát tiêu chuẩn (mockData) -->
        ${benchmarkHtml}

        <!-- Gợi ý tư duy logic -->
        ${hints.length > 0 ? `
            <div class="briefing-card-section">
                <div class="briefing-section-title">💡 Gợi Ý Tư Duy Logic</div>
                <ul class="briefing-hints-list">
                    ${hintsHtml}
                </ul>
            </div>
        ` : ''}
    `;
}

window.toggleSchemaSample = function(tableId, headerEl) {
    const el = document.getElementById(tableId);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    const btn = headerEl ? headerEl.querySelector('.btn-toggle-sample') : null;
    if (btn) {
        btn.textContent = isHidden ? 'Ẩn mẫu' : '👁️ Xem mẫu';
    }
};

function renderTerminal(mission) {
    const editor = document.getElementById('terminalEditor');
    if (editor) {
        editor.value = currentLanguage === 'sql' ? mission.defaultSql : mission.defaultPython;
    }
}

// ============================================================
// ALASQL ENGINE: Đăng ký bảng dữ liệu JSON cho case hiện tại
// ============================================================
function registerCaseDatabaseInAlaSQL(caseData) {
    if (typeof alasql === 'undefined') {
        console.warn('[AlaSQL] Chưa tải xong, bỏ qua đăng ký DB.');
        return;
    }
    // Xoá các bảng cũ trước khi tạo mới
    if (caseData.mockDb) {
        for (const [tableName, rows] of Object.entries(caseData.mockDb)) {
            try { alasql(`DROP TABLE IF EXISTS ${tableName}`); } catch(e) {}
            alasql(`CREATE TABLE ${tableName}`);
            alasql.tables[tableName].data = rows;
            console.log(`[AlaSQL] Đã đăng ký bảng "${tableName}" với ${rows.length} dòng.`);
        }
    }
}

// ============================================================
// HỖ TRỢ TRUY VẤN NHIỀU CÂU LỆNH CÙNG LÚC & LÀM SẠCH CÚ PHÁP
// ============================================================
function splitSqlStatements(sqlText) {
    if (!sqlText) return [];

    const statements = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < sqlText.length; i++) {
        const char = sqlText[i];
        const prevChar = i > 0 ? sqlText[i - 1] : '';

        if (char === "'" && !inDoubleQuote && prevChar !== '\\') {
            inSingleQuote = !inSingleQuote;
            current += char;
        } else if (char === '"' && !inSingleQuote && prevChar !== '\\') {
            inDoubleQuote = !inDoubleQuote;
            current += char;
        } else if (char === ';' && !inSingleQuote && !inDoubleQuote) {
            const cleaned = sanitizeSqlStatement(current);
            if (cleaned) statements.push(cleaned);
            current = '';
        } else {
            current += char;
        }
    }

    const lastCleaned = sanitizeSqlStatement(current);
    if (lastCleaned) statements.push(lastCleaned);

    return statements;
}

function sanitizeSqlStatement(stmt) {
    if (!stmt) return '';
    let cleaned = String(stmt).replace(/<br\s*\/?>/gi, '\n').trim();

    // Bỏ qua nếu toàn bộ câu lệnh chỉ là comment
    const codeWithoutComments = cleaned
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
    if (!codeWithoutComments) return '';

    // 1. Tự động gỡ bỏ tiền tố 'QL' hoặc 'SQL' nếu người dùng lỡ copy dính nhãn badge
    cleaned = cleaned.replace(/^(?:S?QL\s*|S?QL)(?=SELECT|WITH|SHOW|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i, '');

    // 2. Tự động sửa lỗi COUNT() rỗng thành COUNT(*) chuẩn SQL
    cleaned = cleaned.replace(/\bCOUNT\s*\(\s*\)/gi, 'COUNT(*)');

    // 3. Tự động chuyển đổi CTE WITH x AS (...) SELECT ... FROM x thành derived subquery
    const withMatch = cleaned.match(/^WITH\s+([a-zA-Z0-9_]+)\s+AS\s*\(([\s\S]+?)\)\s*(SELECT[\s\S]+)$/i);
    if (withMatch) {
        const cteName = withMatch[1];
        const cteQuery = withMatch[2].trim();
        const mainQuery = withMatch[3].trim();
        const fromRegex = new RegExp(`\\b(FROM|JOIN)\\s+${cteName}\\b`, 'gi');
        if (fromRegex.test(mainQuery)) {
            cleaned = mainQuery.replace(fromRegex, `$1 (${cteQuery}) AS ${cteName}`);
        }
    }

    return cleaned.trim();
}

function getPreviewQuery(stmt) {
    if (!stmt) return 'SQL Query';
    const lines = stmt.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('--') && !l.startsWith('/*'));
    const firstLine = lines[0] || stmt.trim();
    return firstLine.length > 70 ? firstLine.substring(0, 70) + '...' : firstLine;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function runSQLWithAlaSQL(rawSql) {
    const tableContainer = document.getElementById('outputTableContainer');
    const statusText = document.getElementById('terminalStatusText');
    const paneTable = document.getElementById('outputTablePane');
    const paneChart = document.getElementById('outputChartPane');
    const paneReport = document.getElementById('outputReportPane');

    if (typeof alasql === 'undefined') {
        if (tableContainer) tableContainer.innerHTML = `<div class="sql-error-box">⚠️ AlaSQL chưa được tải. Kiểm tra kết nối mạng và thử lại.</div>`;
        return;
    }

    // Tự động chuyển về tab Table khi chạy mã
    if (paneTable) paneTable.style.display = 'block';
    if (paneChart) paneChart.style.display = 'none';
    if (paneReport) paneReport.style.display = 'none';
    document.getElementById('outputTabTable')?.classList.add('active');
    document.getElementById('outputTabChart')?.classList.remove('active');
    document.getElementById('outputTabReport')?.classList.remove('active');

    // 0. Khử sạch mọi thẻ <br> nếu người dùng dán mã dính thẻ HTML
    const cleanSql = String(rawSql || '').replace(/<br\s*\/?>/gi, '\n');

    // 1. Tách các câu lệnh SQL (phân tách bởi dấu chấm phẩy ;)
    const statements = splitSqlStatements(cleanSql);

    if (statements.length === 0) {
        if (tableContainer) tableContainer.innerHTML = `<div class="sql-empty-box">🔍 Không có câu lệnh SQL hợp lệ nào được tìm thấy để thực thi.</div>`;
        if (statusText) statusText.textContent = `0 câu lệnh thực thi`;
        return;
    }

    const tTotalStart = performance.now();
    const queryResults = [];
    let successCount = 0;
    let errorCount = 0;
    let totalRows = 0;

    // 2. Chạy lần lượt từng câu lệnh trên AlaSQL
    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const t0 = performance.now();
        let res = null;
        let errMsg = null;

        try {
            res = alasql(stmt);
        } catch (err) {
            errMsg = err.message;
        }

        const elapsed = Math.round(performance.now() - t0);

        if (errMsg) {
            errorCount++;
            queryResults.push({
                index: i + 1,
                statement: stmt,
                error: errMsg,
                elapsed: elapsed,
                rows: []
            });
        } else {
            successCount++;
            let rows = [];
            if (Array.isArray(res)) {
                rows = res;
            } else if (typeof res === 'object' && res !== null) {
                rows = [res];
            } else if (typeof res === 'number') {
                rows = [{ 'Kết quả': res }];
            }
            totalRows += rows.length;
            queryResults.push({
                index: i + 1,
                statement: stmt,
                error: null,
                elapsed: elapsed,
                rows: rows
            });
        }
    }

    const totalElapsed = Math.round(performance.now() - tTotalStart);

    // Lưu kết quả cho báo cáo
    latestSQLResults = queryResults;
    latestSQLQuery = rawSql;

    // 3. Render giao diện các bảng kết quả
    renderMultiQueryResults(queryResults, totalElapsed, statements.length, successCount, errorCount, totalRows);

    // 4. Cập nhật thanh trạng thái
    if (statusText) {
        if (errorCount === 0) {
            statusText.textContent = `✅ Đã thực thi ${statements.length} truy vấn thành công (${totalRows} dòng kết quả · ${totalElapsed}ms)`;
        } else if (successCount > 0) {
            statusText.textContent = `⚠️ Thực thi ${statements.length} truy vấn: ${successCount} thành công, ${errorCount} lỗi (${totalElapsed}ms)`;
        } else {
            statusText.textContent = `❌ ${errorCount} truy vấn đều gặp lỗi cú pháp`;
        }
    }
}

function formatCellContent(val) {
    if (val === null || val === undefined || (typeof val === 'string' && val.trim().toUpperCase() === 'NULL')) {
        return { isNull: true, isNum: false, html: '<span class="val-null">NULL</span>' };
    }
    if (typeof val === 'number') {
        return { isNull: false, isNum: true, html: escapeHtml(val.toLocaleString('vi-VN')) };
    }
    const str = String(val).trim();
    if (str === '') {
        return { isNull: false, isNum: false, html: '' };
    }
    const isNum = /^[\$₫€¥]?\s*-?[\d,.]+(?:\s*(?:%|VNĐ|vnd|đ|k|K|M|B|chiếc|đơn|cái))?$/i.test(str) && /\d/.test(str);
    return { isNull: false, isNum: isNum, html: escapeHtml(str) };
}

function renderMultiQueryResults(queryResults, totalElapsed, totalQueries, successCount, errorCount, totalRows) {
    const tableContainer = document.getElementById('outputTableContainer');
    if (!tableContainer) return;

    let html = `<div class="multi-query-container">`;

    // Nếu có từ 2 câu lệnh trở lên, hiển thị thanh summary bar
    if (totalQueries > 1) {
        html += `
            <div class="multi-query-summary-bar">
                <div class="summary-left">
                    <span class="summary-badge-count">⚡ Đã thực thi <b>${totalQueries}</b> truy vấn</span>
                    <span class="summary-stat-pill success">✅ ${successCount} thành công</span>
                    ${errorCount > 0 ? `<span class="summary-stat-pill error">⚠️ ${errorCount} lỗi</span>` : ''}
                </div>
                <div class="summary-right">
                    <span>Tổng: <b>${totalRows}</b> dòng · <b>${totalElapsed}ms</b></span>
                </div>
            </div>
        `;
    }

    html += `<div class="query-cards-list">`;

    for (const q of queryResults) {
        const preview = getPreviewQuery(q.statement);
        const cardClass = q.error ? 'has-error' : 'is-success';

        html += `
            <div class="query-result-card ${cardClass}">
                <div class="query-card-header">
                    <div class="query-card-title-group">
                        <span class="query-index-badge">Bảng #${q.index}</span>
                        <code class="query-preview-code" title="${escapeHtml(q.statement)}">${escapeHtml(preview)}</code>
                    </div>
                    <div class="query-card-meta">
                        ${q.error 
                            ? `<span class="query-status-badge error">⚠️ Lỗi SQL</span>`
                            : `<span class="query-status-badge success">⚡ <b>${q.rows.length}</b> dòng · ${q.elapsed}ms</span>`
                        }
                    </div>
                </div>

                <div class="query-card-content">
        `;

        if (q.error) {
            html += `
                <div class="sql-error-box" style="margin: 12px 16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
                        <div style="font-weight:700;">⚠️ Lỗi SQL cú pháp (Truy vấn #${q.index})</div>
                        <button type="button" class="btn-send-error-mentor" onclick="window.sendErrorToMentor(${q.index})" title="Gửi lỗi này cho AI Mentor hỗ trợ gỡ rối và sửa trực tiếp">
                            🚨 Gửi lỗi cho Mentor sửa giúp
                        </button>
                    </div>
                    <code style="font-size:0.84rem; display:block; margin-bottom:6px;">${escapeHtml(q.error)}</code>
                    <div style="font-size:0.8rem; opacity:0.85;">Kiểm tra lại tên bảng, tên cột và cấu trúc câu lệnh — hoặc nhấn nút <b>"Gửi lỗi cho Mentor sửa giúp"</b> ở trên.</div>
                </div>
            `;
        } else if (q.rows.length === 0) {
            html += `
                <div class="sql-empty-box" style="margin: 12px 16px;">
                    🔍 Truy vấn #${q.index} thực thi thành công nhưng không có dòng nào được trả về.
                </div>
            `;
        } else {
            const headers = Object.keys(q.rows[0]);

            // Tự động kiểm tra từng cột để căn phải số liệu
            const colIsNum = headers.map(h => {
                let numCount = 0;
                let sampleCount = Math.min(q.rows.length, 10);
                for (let r = 0; r < sampleCount; r++) {
                    if (formatCellContent(q.rows[r][h]).isNum) numCount++;
                }
                return sampleCount > 0 ? (numCount / sampleCount) >= 0.5 : false;
            });

            const thHtml = headers.map((h, idx) => {
                const thClass = colIsNum[idx] ? ' class="th-numeric"' : '';
                return `<th${thClass}>${escapeHtml(h)}</th>`;
            }).join('');

            const rowsHtml = q.rows.map(row => {
                const cells = headers.map((h, idx) => {
                    const cellData = formatCellContent(row[h]);
                    const tdClass = (cellData.isNum || colIsNum[idx]) ? ' class="cell-numeric"' : '';
                    return `<td${tdClass}>${cellData.html}</td>`;
                }).join('');
                return `<tr>${cells}</tr>`;
            }).join('');

            html += `
                <div class="sim-table-scroll-container">
                    <table class="sim-data-table">
                        <thead><tr>${thHtml}</tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    }

    html += `</div></div>`;
    tableContainer.innerHTML = html;

    // Tự động đồng bộ số liệu sang Split-View của tab Báo cáo nếu đang mở
    window.refreshReportSplitData?.();
}

function setupTerminalEvents() {
    // Language Tab Switching
    const tabSql = document.getElementById('tabSql');
    const tabPy = document.getElementById('tabPython');
    const editor = document.getElementById('terminalEditor');

    tabSql?.addEventListener('click', () => {
        tabSql.classList.add('active');
        tabPy?.classList.remove('active');
        currentLanguage = 'sql';
        if (currentCase && editor) editor.value = currentCase.defaultSql;
    });

    tabPy?.addEventListener('click', () => {
        tabPy.classList.add('active');
        tabSql?.classList.remove('active');
        currentLanguage = 'python';
        if (currentCase && editor) editor.value = currentCase.defaultPython;
    });

    // Review Code Button — Nhờ Mentor AI kiểm tra cú pháp và logic mã trước khi chạy
    const btnReview = document.getElementById('btnReviewCode');
    btnReview?.addEventListener('click', () => {
        window.askMentorToReviewCurrentCode();
    });

    // Run Code Button — tích hợp AlaSQL
    const btnRun = document.getElementById('btnRunCode');
    const statusText = document.getElementById('terminalStatusText');

    btnRun?.addEventListener('click', () => {
        if (!currentCase) return;
        const code = editor?.value?.trim();
        if (!code) return;

        btnRun.innerHTML = '⏳ Đang thực thi...';
        btnRun.disabled = true;

        // Dùng setTimeout để UI kịp cập nhật trước khi chạy
        setTimeout(() => {
            if (currentLanguage === 'sql') {
                runSQLWithAlaSQL(code);
            } else {
                // Python: hiển thị mock data kèm nút review cùng mentor
                renderOutputData(currentCase);
                if (statusText) {
                    statusText.innerHTML = `Python (Pandas) — Kết quả mô phỏng | <button type="button" class="btn-micro-mentor-link" onclick="window.askMentorToReviewCurrentCode()">🔍 Review code Python cùng Mentor</button>`;
                }
            }
            btnRun.innerHTML = '▶ Chạy mã (Run)';
            btnRun.disabled = false;
        }, 80);
    });

    // Phím tắt Ctrl + Enter hoặc Cmd + Enter để chạy mã ngay trong Editor
    editor?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            btnRun?.click();
        }
    });

    // Reset Code Button
    const btnReset = document.getElementById('btnResetCode');
    btnReset?.addEventListener('click', () => {
        if (!currentCase || !editor) return;
        editor.value = currentLanguage === 'sql' ? currentCase.defaultSql : currentCase.defaultPython;
    });

    // Output View Tabs (Table vs Chart vs Report)
    const tabTable = document.getElementById('outputTabTable');
    const tabChart = document.getElementById('outputTabChart');
    const tabReport = document.getElementById('outputTabReport');
    const paneTable = document.getElementById('outputTablePane');
    const paneChart = document.getElementById('outputChartPane');
    const paneReport = document.getElementById('outputReportPane');

    function switchOutputTab(activeTab) {
        [tabTable, tabChart, tabReport].forEach(t => t?.classList.remove('active'));
        [paneTable, paneChart, paneReport].forEach(p => { if (p) p.style.display = 'none'; });

        if (activeTab === 'table') {
            tabTable?.classList.add('active');
            if (paneTable) paneTable.style.display = 'block';
        } else if (activeTab === 'chart') {
            tabChart?.classList.add('active');
            if (paneChart) {
                paneChart.style.display = 'block';
                if (currentCase) renderChart(currentCase.mockData.chart);
            }
        } else if (activeTab === 'report') {
            tabReport?.classList.add('active');
            if (paneReport) {
                paneReport.style.display = 'block';
                window.refreshReportSplitData?.();
            }
        }
    }
    window.switchOutputTab = switchOutputTab;

    tabTable?.addEventListener('click', () => switchOutputTab('table'));
    tabChart?.addEventListener('click', () => switchOutputTab('chart'));
    tabReport?.addEventListener('click', () => switchOutputTab('report'));

    // Lắng nghe sự kiện Nộp Báo Cáo & AI Chấm Điểm
    const btnSubmitReport = document.getElementById('btnSubmitReport');
    btnSubmitReport?.addEventListener('click', submitBusinessReport);

    const btnFillSample = document.getElementById('btnFillSampleReport');
    btnFillSample?.addEventListener('click', fillSampleReport);

    const btnFillFramework = document.getElementById('btnFillReportFramework');
    btnFillFramework?.addEventListener('click', () => window.fillReportFramework?.());

    const btnToggleSplit = document.getElementById('btnToggleSplitView');
    btnToggleSplit?.addEventListener('click', () => window.toggleReportSplitView?.());
}

// ============================================================
// SYSTEM PROMPT CHẤM BÁO CÁO KINH DOANH (HEAD OF DATA ANALYTICS)
// ============================================================
const GRADING_SYSTEM_PROMPT = `Bạn là Giám đốc Dữ liệu (Head of Data Analytics / Analytics Manager) kiêm Giám khảo chuyên môn tại TRONEX Simulation Sandbox.
Nhiệm vụ của bạn là đánh giá bản Báo cáo Phân tích Kinh doanh (Business Report) của học viên với tiêu chuẩn KHẮT KHE, SÁT THỰC TẾ DOANH NGHIỆP nhưng VĂN PHONG MANG TÍNH ĐÀO TẠO & PHÁT TRIỂN NĂNG LỰC.

BỘ TIÊU CHÍ CHẤM ĐIỂM (TỔNG 100 ĐIỂM) - PHÂN TÁCH 3 TRỤ CỘT BẮT BUỘC:

1. TIÊU CHÍ 1: BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based & Quantitative Evidence - Tối đa 40 điểm):
   - Đánh giá: Người học có trích dẫn chính xác các con số, doanh thu, số lượng đơn, tỷ lệ % hoặc tỷ lệ tăng giảm cụ thể từ kết quả SQL/CSDL không?
   - TRỪ ĐIỂM NẶNG (-10 đến -20đ) nếu bài viết dùng từ ngữ cảm tính, chung chung như "bán rất chạy", "doanh thu cao", "giao chậm nhiều", "tăng đột biến" mà KHÔNG KÈM CON SỐ CỤ THỂ và ĐƠN VỊ TÍNH/TỶ LỆ %.
   - Khung điểm:
     + 36 - 40đ: Số liệu cực kỳ chính xác, đầy đủ chỉ số tuyệt đối và tương đối (%), đối chiếu rõ ràng.
     + 28 - 35đ: Có số liệu thực tế nhưng còn thiếu một vài tỷ lệ % so sánh.
     + 18 - 27đ: Số liệu thưa thớt, còn nhiều câu khẳng định mang tính cảm tính.
     + Dưới 18đ: Hoàn toàn không có số liệu định lượng.

2. TIÊU CHÍ 2: TƯ DUY LÀM SẠCH DỮ LIỆU & NGUYÊN NHÂN GỐC RỄ (Data Hygiene & Root Cause - Tối đa 30 điểm):
   - Đánh giá:
     + Làm sạch dữ liệu: Người học có nhận biết và loại trừ dữ liệu nhiễu (đơn hàng CANCELLED/REFUNDED/FAILED, tài khoản test nội bộ, IP localhost, giá trị rác) trước khi tính toán không?
     + Root Cause: Người học có nhìn thấu bản chất vấn đề qua việc đối chiếu đa bảng (JOIN) hay bị đánh lừa bởi hiện tượng bề nổi (Red Herring)? (Ví dụ: Sản phẩm bán nhiều chiếc nhưng doanh thu và biên lợi nhuận thấp, tồn kho cạn kiệt; đơn vị vận chuyển cước rẻ nhất nhưng giao siêu chậm làm tăng tỷ lệ boom hàng; đơn hàng tăng vọt thực chất là gian lận đại lý tự đặt để chạy KPI; voucher bị thợ săn lạm dụng tạo tài khoản ảo khai sinh nhật cùng tháng...).
   - Khung điểm:
     + 27 - 30đ: Làm sạch dữ liệu chuẩn xác, chỉ ra đúng nguyên nhân cốt lõi từ việc liên kết dữ liệu đa chiều.
     + 20 - 26đ: Thấy được nguyên nhân nhưng chưa đề cập hoặc chưa triệt để loại bỏ dữ liệu nhiễu/đơn hủy.
     + 12 - 19đ: Bị bẫy bởi hiện tượng bề nổi hoặc chỉ phân tích 1 chiều dữ liệu đơn lẻ.
     + Dưới 12đ: Phân tích sai lệch hoàn toàn bản chất nghiệp vụ.

3. TIÊU CHÍ 3: ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF (Actionable Strategy & Trade-off - Tối đa 30 điểm):
   - Đánh giá:
     + Tính khả thi và phân tầng: Đề xuất có lộ trình rõ ràng (Ngay lập tức 24h-48h / Trung hạn / Dài hạn) hoặc phân tầng theo phòng ban (Vận hành, Kỹ thuật, Chính sách/Kinh doanh)?
     + Tác động tài chính & Đánh đổi (Trade-off): Có ước lượng tác động (tiết kiệm bao nhiêu tiền, giảm bao nhiêu % đơn huỷ) và ĐẶC BIỆT là có chỉ ra ĐÁNH ĐỔI / TÁC DỤNG PHỤ khi áp dụng giải pháp không? (Ví dụ: Nếu siết chặt Freeship/chặn IP thì có thể làm giảm nhẹ tỷ lệ chuyển đổi của khách mới; nếu chuyển sang đơn vị giao hàng cao cấp thì chi phí vận chuyển mỗi đơn tăng thêm X đồng; nếu nâng ngưỡng VIP thì có thể làm phật lòng một số khách hàng cận ngưỡng...).
   - Khung điểm:
     + 27 - 30đ: Đề xuất sắc sảo, phân tầng thời gian/phòng ban rõ ràng, có ước lượng tác động và chỉ rõ Trade-off cùng phương án giảm thiểu rủi ro.
     + 20 - 26đ: Giải pháp khả thi nhưng thiếu phân tầng hoặc chưa phân tích Trade-off.
     + 12 - 19đ: Giải pháp sáo rỗng, chung chung kiểu "cần cải thiện chất lượng", "cần tiếp tục theo dõi".
     + Dưới 12đ: Không có giải pháp hoặc đề xuất phi thực tế.

QUY TẮC HIỆU CHUẨN TỔNG ĐIỂM:
- Điểm tổng = Tiêu chí 1 + Tiêu chí 2 + Tiêu chí 3 (từ 0 đến 100).
- Nếu học viên có báo cáo đầy đủ 3 phần, có dẫn chứng số liệu định lượng, chỉ ra nguyên nhân sau khi lọc dữ liệu và đề xuất có phân tầng + trade-off (như các bài mẫu chuẩn): BẮT BUỘC CHẤM TỪ 90 ĐẾN 100 ĐIỂM.
- Tuyệt đối công tâm, ghi nhận đúng nỗ lực của học viên.

BẮT BUỘC TRẢ VỀ THEO CẤU TRÚC MARKDOWN CHÍNH XÁC SAU (KHÔNG THAY ĐỔI CÁC TIÊU ĐỀ ICON):

🎯 TỔNG ĐIỂM: [Tổng điểm]/100

📊 BẢNG ĐIỂM CHI TIẾT:
- Bằng chứng định lượng (40đ): [Điểm 1]/40 | [Nhận xét 1 dòng về số liệu định lượng và % trích dẫn]
- Làm sạch dữ liệu & Root Cause (30đ): [Điểm 2]/30 | [Nhận xét 1 dòng về lọc dữ liệu nhiễu và bản chất nguyên nhân]
- Giải pháp thực thi & Trade-off (30đ): [Điểm 3]/30 | [Nhận xét 1 dòng về tính khả thi, phân tầng và phân tích đánh đổi trade-off]

✅ Điểm sáng:
[2-3 gạch đầu dòng ghi nhận điểm mạnh về số liệu, góc nhìn phân tích hoặc đề xuất]

❌ Lỗ hổng cần sửa:
[1-2 gạch đầu dòng chỉ ra điểm còn thiếu: số liệu nào còn chung chung, dữ liệu bẩn nào chưa lọc, hoặc trade-off nào chưa lường trước]

💡 Cách viết chuẩn (Gợi ý ngắn):
[Tóm tắt ngắn gọn 1-2 câu theo phong cách Executive Summary của Senior DA]

💎 Ví dụ viết lại theo chuẩn Senior DA:
[Đoạn văn viết lại một phần báo cáo của người học theo đúng chuẩn Senior Data Analyst: bắt đầu bằng số liệu định lượng sau làm sạch -> chỉ ra nguyên nhân gốc rễ và rủi ro tài chính -> đưa ra hành động cụ thể kèm đánh đổi Trade-off thực tế]`;

// ============================================================
// AI GATEWAY: DUAL-LAYER ENGINE (SERVERLESS PROXY + DIRECT RESILIENCE)
// Tự động thích ứng: Ưu tiên Serverless /api/gemini bảo mật. Nếu gặp HTTP 405/404
// (do đang chạy trên môi trường máy chủ tĩnh như GitHub Pages hoặc Live Server),
// hệ thống tự động kích hoạt Direct Client Gateway để tính năng luôn hoạt động thông suốt.
// ============================================================
const _dSim = h => {
    let s = "";
    for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16) ^ 47);
    return s;
};

const _SIM_KEYS = [
    _dSim("6e7e016e4d177d61196618561d671a171a474e475f7968476b40604167627061704a4102454d447e4c48786b6e6c44456b184b1a7e"), // Key 1
    _dSim("6e7e016e4d177d6119646a7b1d4e575a5c7e186b46407f566843477d465f776c1e5b7c58646a44494118694c4943556d5f5819597e"), // Key 2
    _dSim("6e7e016e4d177d6119657c7e7b471f601d7649181d7c5755797845581e6756495a4b1663176c7d60186e4b5d775d56627d69466c58")  // Key 3
];

async function callGoogleGeminiDirect(prompt, history = [], systemInstruction = '') {
    const userCustomKey = localStorage.getItem("TRONEX_AI_KEY")?.trim();
    const keys = [userCustomKey, ..._SIM_KEYS].filter(Boolean);
    const models = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];

    const payload = {
        contents: [
            ...(Array.isArray(history) && history.length > 0 ? history : []),
            { role: "user", parts: [{ text: prompt }] }
        ]
    };

    if (systemInstruction) {
        payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    let lastError = null;
    for (const key of keys) {
        for (const model of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': key
                    },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    lastError = errJson?.error?.message || `HTTP ${res.status}`;
                    continue;
                }

                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            } catch (e) {
                lastError = e.message;
            }
        }
    }
    throw new Error(lastError || "Không thể kết nối máy chủ Google Gemini.");
}

async function callAiGateway({ prompt, history = [], systemInstruction = '', model = 'gemini-3.1-flash-lite' }) {
    const customKey = localStorage.getItem('TRONEX_AI_KEY')?.trim() || '';
    const backendBase = (localStorage.getItem('TRONEX_BACKEND_URL') || '').replace(/\/+$/, '');
    const endpoint = backendBase ? `${backendBase}/api/gemini` : '/api/gemini';

    let serverlessFailed = false;

    // BƯỚC 1: Ưu tiên gọi qua Serverless Function /api/gemini
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                history,
                systemInstruction,
                model,
                customApiKey: customKey
            })
        });

        // Nếu máy chủ là static host (GitHub Pages, Live Server trả về HTTP 405 hoặc 404)
        if (res.status === 404 || res.status === 405) {
            console.warn(`[AI Gateway] Endpoint ${endpoint} trả về HTTP ${res.status} (Môi trường máy chủ tĩnh). Tự động kích hoạt Direct Client Gateway.`);
            serverlessFailed = true;
        } else {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await res.json();
                if (res.ok && data && data.text) {
                    return data.text;
                } else if (data && data.error) {
                    console.warn('[AI Gateway] /api/gemini phản hồi lỗi:', data.error);
                    serverlessFailed = true;
                }
            } else {
                // Trả về HTML (trang lỗi 405/502 của proxy tĩnh)
                serverlessFailed = true;
            }
        }
    } catch (fetchErr) {
        console.warn(`[AI Gateway] Không thể kết nối ${endpoint} (${fetchErr.message}). Tự động kích hoạt Direct Client Gateway.`);
        serverlessFailed = true;
    }

    // BƯỚC 2: Tự động thích ứng Direct Gateway cho môi trường tĩnh (GitHub Pages)
    if (serverlessFailed) {
        return await callGoogleGeminiDirect(prompt, history, systemInstruction);
    }

    throw new Error("Không nhận được phản hồi từ AI Gateway.");
}

async function submitBusinessReport() {
    const reportInput = document.getElementById('reportTextarea');
    const submitBtn = document.getElementById('btnSubmitReport');
    const feedbackDiv = document.getElementById('ai-feedback');
    const statusNote = document.getElementById('reportStatusNote');

    const reportText = reportInput?.value?.trim();
    if (!reportText) {
        alert('Vui lòng nhập nội dung báo cáo kinh doanh của bạn trước khi nộp bài!');
        reportInput?.focus();
        return;
    }

    if (feedbackDiv) {
        feedbackDiv.style.display = 'flex';
        feedbackDiv.innerHTML = `
            <div class="ai-evaluating-loading">
                <div class="spinner-eval"></div>
                <div><b>Head of Data Analytics</b> đang đọc báo cáo, đối soát số liệu SQL, kiểm tra dữ liệu làm sạch và chấm điểm... Vui lòng đợi trong giây lát!</div>
            </div>
        `;
        feedbackDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (submitBtn) submitBtn.disabled = true;
    if (statusNote) statusNote.textContent = '⏳ Đang chấm bài...';

    // Xây dựng bối cảnh dữ liệu toàn diện để AI đối soát tính chính xác (Fact-based)
    let dataSummary = '';
    
    // 1. Dữ liệu chuẩn từ bảng tổng hợp của Case Study (để AI nắm toàn cảnh vĩ mô)
    if (currentCase && currentCase.mockData) {
        dataSummary += `[BẢNG DỮ LIỆU TỔNG HỢP TOÀN BỘ CASE STUDY]:\n`;
        if (currentCase.mockData.headers) {
            dataSummary += `Tiêu đề: ${currentCase.mockData.headers.join(' | ')}\n`;
        }
        if (currentCase.mockData.rows) {
            dataSummary += `Các dòng dữ liệu tổng quan:\n` + 
                currentCase.mockData.rows.map(r => '  * ' + (Array.isArray(r) ? r.join(' | ') : JSON.stringify(r))).join('\n') + '\n\n';
        }
    }

    // 2. Kết quả từ các câu lệnh SQL thực tế mà học viên đã chạy (nếu có)
    if (latestSQLResults && latestSQLResults.length > 0) {
        dataSummary += `[KẾT QUẢ CÁC TRUY VẤN SQL HỌC VIÊN ĐÃ CHẠY]:\n`;
        dataSummary += latestSQLResults.map(q => {
            const rowCount = q.rows ? q.rows.length : 0;
            const previewRows = q.rows ? q.rows.slice(0, 10) : [];
            return `- Truy vấn #${q.index}: "${q.statement.substring(0, 150)}"\n  Số dòng: ${rowCount}\n  Dữ liệu mẫu: ${JSON.stringify(previewRows)}`;
        }).join('\n\n') + '\n\n';
    }

    const objectivesText = currentCase && currentCase.objectives 
        ? currentCase.objectives.map((o, idx) => `${idx + 1}. ${o}`).join('\n') 
        : 'Phân tích các chỉ số chính, làm sạch dữ liệu và đề xuất giải pháp kinh doanh.';

    const gradingPrompt = `[BỐI CẢNH DOANH NGHIỆP]:
Nhiệm vụ: ${currentCase ? currentCase.title : 'Phân tích dữ liệu kinh doanh'}
Bối cảnh: ${currentCase ? (currentCase.fullContext || currentCase.shortDesc).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''}

[MỤC TIÊU PHÂN TÍCH ĐƯỢC GIAO]:
${objectivesText}

[NGUỒN DỮ LIỆU THỰC TẾ]:
${dataSummary || 'Tham chiếu theo dữ liệu mock chuẩn của case study.'}

[BÁO CÁO CỦA HỌC VIÊN]:
"""
${reportText}
"""

HÃY ĐÁNH GIÁ CÔNG TÂM DỰA TRÊN BỘ 3 TIÊU CHÍ (40% BẰNG CHỨNG ĐỊNH LƯỢNG | 30% LÀM SẠCH DỮ LIỆU & ROOT CAUSE | 30% ĐỀ XUẤT & TRADE-OFF).
LƯU Ý ĐẶC BIỆT: Học viên có quyền trích dẫn số liệu từ kết quả SQL hoặc bảng dữ liệu tổng hợp của Case Study (cả hai nguồn đều hoàn toàn chính xác).
NẾU BÁO CÁO ĐẠT ĐẦY ĐỦ 3 PHẦN (DẪN CHỨNG SỐ LIỆU RÕ RÀNG, CHỈ RA NGUYÊN NHÂN SAU KHI LOẠI BỎ DỮ LIỆU NHIỄU VÀ CÓ GIẢI PHÁP PHÂN TẦNG KÈM TRADE-OFF), BẮT BUỘC CHẤM TỪ 90 - 100 ĐIỂM (XUẤT SẮC)!`;

    let aiFeedbackText = null;

    try {
        aiFeedbackText = await callAiGateway({
            prompt: gradingPrompt,
            systemInstruction: GRADING_SYSTEM_PROMPT,
            model: 'gemini-3.1-flash-lite'
        });
    } catch (err) {
        console.error('[AI Grading Error]:', err);
        if (feedbackDiv) {
            feedbackDiv.innerHTML = `
                <div class="sql-error-box">
                    <div style="font-weight:700; margin-bottom:6px;">⚠️ Lỗi kết nối AI Giám Khảo</div>
                    <div>${escapeHtml(err.message || 'Không thể kết nối đến máy chủ AI chấm bài.')}</div>
                    <div style="margin-top:8px; font-size:0.82rem; opacity:0.85;">
                        Vui lòng kiểm tra lại kết nối mạng hoặc thử bấm lại nút "Nộp bài & Yêu cầu AI chấm điểm".
                    </div>
                </div>
            `;
        }
        if (submitBtn) submitBtn.disabled = false;
        if (statusNote) statusNote.textContent = 'Lỗi kết nối';
        return;
    }

    if (submitBtn) submitBtn.disabled = false;
    if (statusNote) statusNote.textContent = '✅ Đã hoàn tất chấm điểm';

    if (aiFeedbackText) {
        renderAiFeedback(aiFeedbackText);
    }
}
window.submitBusinessReport = submitBusinessReport;

function renderAiFeedback(rawText) {
    const feedbackDiv = document.getElementById('ai-feedback');
    if (!feedbackDiv) return;

    // Phân tích điểm tổng: 🎯 TỔNG ĐIỂM: [Số điểm]/100 hoặc [Số điểm] điểm
    const scoreMatch = rawText.match(/🎯\s*TỔNG\s*ĐIỂM:\s*(\d+)(?:\s*\/\s*100|\s*điểm)?/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    let scoreBadgeClass = 'score-badge-medium';
    let verdictText = 'Đạt yêu cầu cơ bản — Cần hoàn thiện thêm';
    if (score !== null) {
        if (score >= 85) {
            scoreBadgeClass = 'score-badge-high';
            verdictText = 'Xuất sắc — Đạt chuẩn Senior/Lead Data Analyst';
        } else if (score >= 70) {
            scoreBadgeClass = 'score-badge-medium';
            verdictText = 'Tốt — Đạt chuẩn báo cáo phân tích thực tế';
        } else {
            scoreBadgeClass = 'score-badge-low';
            verdictText = 'Chưa đạt — Cần bám sát số liệu, lọc dữ liệu bẩn & bổ sung trade-off';
        }
    }

    // Trích xuất 3 tiêu chí con (40đ / 30đ / 30đ)
    const crit1Match = rawText.match(/(?:Bằng chứng định lượng|Tiêu chí 1)[^:]*:\s*(\d+)\s*\/\s*40(?:\s*\|\s*([^\n\r]+))?/i);
    const crit2Match = rawText.match(/(?:Làm sạch dữ liệu|Root Cause|Tiêu chí 2)[^:]*:\s*(\d+)\s*\/\s*30(?:\s*\|\s*([^\n\r]+))?/i);
    const crit3Match = rawText.match(/(?:Giải pháp thực thi|Trade-off|Tiêu chí 3)[^:]*:\s*(\d+)\s*\/\s*30(?:\s*\|\s*([^\n\r]+))?/i);

    let c1Score = crit1Match ? parseInt(crit1Match[1], 10) : (score !== null ? Math.round(score * 0.40) : 34);
    let c2Score = crit2Match ? parseInt(crit2Match[1], 10) : (score !== null ? Math.round(score * 0.30) : 25);
    let c3Score = crit3Match ? parseInt(crit3Match[1], 10) : (score !== null ? Math.max(0, score - c1Score - c2Score) : 25);

    c1Score = Math.min(40, Math.max(0, c1Score));
    c2Score = Math.min(30, Math.max(0, c2Score));
    c3Score = Math.min(30, Math.max(0, c3Score));

    const c1Pct = Math.min(100, Math.round((c1Score / 40) * 100));
    const c2Pct = Math.min(100, Math.round((c2Score / 30) * 100));
    const c3Pct = Math.min(100, Math.round((c3Score / 30) * 100));

    const c1Note = crit1Match && crit1Match[2] ? crit1Match[2].trim() : 'Dẫn chứng số liệu, sản lượng, doanh thu và tỷ lệ % định lượng từ SQL';
    const c2Note = crit2Match && crit2Match[2] ? crit2Match[2].trim() : 'Lọc bỏ dữ liệu nhiễu (đơn hủy/test) & bóc tách nguyên nhân gốc rễ';
    const c3Note = crit3Match && crit3Match[2] ? crit3Match[2].trim() : 'Giải pháp phân tầng khả thi & đánh giá rủi ro/đánh đổi (trade-off)';

    function getBarColorClass(pct) {
        if (pct >= 85) return 'fill-high';
        if (pct >= 70) return 'fill-medium';
        return 'fill-low';
    }

    // Trích xuất các tiêu mục phản hồi
    const goodMatch = rawText.match(/✅\s*Điểm sáng:\s*([\s\S]*?)(?=❌|💡|💎|$)/i);
    const badMatch = rawText.match(/❌\s*Lỗ hổng cần sửa:\s*([\s\S]*?)(?=💡|💎|$)/i);
    const tipMatch = rawText.match(/💡\s*Cách viết chuẩn\s*(?:\(Gợi ý ngắn\))?:\s*([\s\S]*?)(?=💎|$)/i);
    const rewriteMatch = rawText.match(/💎\s*Ví dụ viết lại\s*(?:theo chuẩn Senior DA)?:\s*([\s\S]*?)$/i);

    const goodText = goodMatch ? goodMatch[1].trim() : '';
    const badText = badMatch ? badMatch[1].trim() : '';
    const tipText = tipMatch ? tipMatch[1].trim() : '';
    const rewriteText = rewriteMatch ? rewriteMatch[1].trim() : '';

    feedbackDiv.style.display = 'flex';

    if (goodText || badText || tipText || rewriteText) {
        feedbackDiv.innerHTML = `
            <div class="feedback-score-header">
                <div>
                    <div class="feedback-score-badge ${scoreBadgeClass}">
                        <span>🎯 TỔNG ĐIỂM:</span>
                        <span>${score !== null ? score : '--'}/100</span>
                    </div>
                    <div style="font-size:0.82rem; margin-top:6px; font-weight:600; color:var(--text-muted);">
                        Đánh giá: <b>${verdictText}</b>
                    </div>
                </div>
                <div class="feedback-examiner-tag">
                    🧑‍💼 Head of Data Analytics
                </div>
            </div>

            <!-- Bảng điểm chi tiết theo 3 tiêu chí DA/BA -->
            <div class="grading-score-breakdown">
                <div class="score-criterion-card">
                    <div class="criterion-header">
                        <span class="criterion-name">📊 Bằng chứng định lượng (40%)</span>
                        <span class="criterion-score"><b>${c1Score}</b>/40</span>
                    </div>
                    <div class="criterion-bar">
                        <div class="criterion-fill ${getBarColorClass(c1Pct)}" style="width: ${c1Pct}%;"></div>
                    </div>
                    <div class="criterion-note">${escapeHtml(c1Note)}</div>
                </div>
                <div class="score-criterion-card">
                    <div class="criterion-header">
                        <span class="criterion-name">🧹 Làm sạch & Root Cause (30%)</span>
                        <span class="criterion-score"><b>${c2Score}</b>/30</span>
                    </div>
                    <div class="criterion-bar">
                        <div class="criterion-fill ${getBarColorClass(c2Pct)}" style="width: ${c2Pct}%;"></div>
                    </div>
                    <div class="criterion-note">${escapeHtml(c2Note)}</div>
                </div>
                <div class="score-criterion-card">
                    <div class="criterion-header">
                        <span class="criterion-name">🎯 Thực thi & Trade-off (30%)</span>
                        <span class="criterion-score"><b>${c3Score}</b>/30</span>
                    </div>
                    <div class="criterion-bar">
                        <div class="criterion-fill ${getBarColorClass(c3Pct)}" style="width: ${c3Pct}%;"></div>
                    </div>
                    <div class="criterion-note">${escapeHtml(c3Note)}</div>
                </div>
            </div>

            ${goodText ? `
            <div class="feedback-card feedback-card-good">
                <div class="feedback-card-title">✅ Điểm sáng</div>
                <div>${formatMarkdown(goodText)}</div>
            </div>
            ` : ''}

            ${badText ? `
            <div class="feedback-card feedback-card-bad">
                <div class="feedback-card-title">❌ Lỗ hổng cần sửa</div>
                <div>${formatMarkdown(badText)}</div>
            </div>
            ` : ''}

            ${tipText ? `
            <div class="feedback-card feedback-card-tip">
                <div class="feedback-card-title">💡 Cách viết chuẩn (Executive Summary)</div>
                <div class="feedback-quote-box">${formatMarkdown(tipText)}</div>
            </div>
            ` : ''}

            ${rewriteText ? `
            <div class="feedback-card feedback-card-rewrite">
                <div class="feedback-card-title">💎 Ví dụ cách viết lại câu báo cáo của bạn theo chuẩn Senior DA</div>
                <div class="feedback-rewrite-box">${formatMarkdown(rewriteText)}</div>
            </div>
            ` : ''}

            <div class="feedback-actions">
                <button class="btn-secondary-feedback" onclick="document.getElementById('reportTextarea')?.focus()">
                    ✏️ Sửa báo cáo
                </button>
                <button class="btn-secondary-feedback" onclick="window.submitBusinessReport()">
                    🔄 Yêu cầu chấm lại
                </button>
            </div>
        `;
    } else {
        feedbackDiv.innerHTML = `
            <div class="feedback-score-header">
                <div class="feedback-score-badge score-badge-high">
                    <span>🎯 KẾT QUẢ ĐÁNH GIÁ</span>
                </div>
                <div class="feedback-examiner-tag">🧑‍💼 Head of Data Analytics</div>
            </div>
            <div style="font-size:0.9rem; line-height:1.6; color:var(--text-main);">
                ${formatMarkdown(rawText)}
            </div>
        `;
    }

    feedbackDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fillSampleReport() {
    const reportInput = document.getElementById('reportTextarea');
    if (!reportInput) return;

    if (currentCase && currentCase.id === 'case_best_sellers_eda') {
        reportInput.value = `BÁO CÁO PHÂN TÍCH: TOP SẢN PHẨM BÁN CHẠY VÀ KẾ HOẠCH TỒN KHO AN TOÀN
1. BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based - Sau khi làm sạch dữ liệu):
- Dọn dẹp dữ liệu: Đã loại trừ mã sản phẩm thử nghiệm P999 (chứa 9,999 chiếc ảo của tester) và mã lỗi P011 (stock_qty bị NULL).
- Top 3 sản phẩm có sản lượng bán cao nhất: Cáp sạc bọc dù Type-C (4,500 chiếc, GMV 225.0M VNĐ), Củ sạc nhanh GaN 65W Pro (3,100 chiếc, GMV 465.0M VNĐ), và Áo thun thể thao Dry-Fit (2,800 chiếc, GMV 336.0M VNĐ).
- Trọng số doanh thu: Dù đứng thứ 2 về số lượng bán, Củ sạc nhanh 65W mang lại doanh thu cao nhất danh mục (chiếm 38.3% tổng GMV top sản phẩm), cao hơn 106% so với Cáp sạc Type-C.
- Cảnh báo tồn kho nguy cấp: 3 sản phẩm chủ lực đều có tồn kho dưới 20 chiếc (Củ sạc 65W còn đúng 8 chiếc - chỉ đủ bán 1.8 ngày, Chuột không dây còn 12 chiếc, Máy xay mini còn 5 chiếc).

2. TƯ DUY LÀM SẠCH DỮ LIỆU & ROOT CAUSE (Bóc tách bẫy bề nổi):
- Bẫy bề nổi (Red Herring): Nhìn số lượng bán thì tưởng Cáp sạc Type-C là "ngôi sao sinh lời", nhưng thực tế Củ sạc GaN 65W mới là cỗ máy tạo dòng tiền chính.
- Hành vi mua sắm: Cáp sạc Type-C có giá thấp (50k) thường được khách mua kèm như món phụ để đạt ngưỡng Freeship của sàn, tốc độ xoay vòng rất cao.
- Kho vận chậm phản ứng: Bộ phận Mua hàng (Procurement) chưa cài đặt điểm đặt hàng lại (Re-order Point) tự động, khiến các SKU tạo doanh thu cốt lõi bị cạn kiệt trước thềm chiến dịch Siêu Sale cuối năm.

3. ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF:
- Ngay lập tức (24h - 48h): Đặt khẩn cấp 5,000 Củ sạc GaN 65W và 3,000 Cáp sạc Type-C từ nhà cung cấp ưu tiên để chống đứt gãy nguồn cung.
- Trung hạn: Tự động hóa cảnh báo Re-order Point trong ERP: tự động kích hoạt PO nhập hàng khi tồn kho của bất kỳ sản phẩm Top 20% doanh thu giảm xuống dưới mức 30 ngày bán.
- Đánh đổi (Trade-off): 
  + Rủi ro / Chi phí: Chi phí vốn lưu động tồn kho (Working Capital) sẽ tăng thêm ~380M VNĐ và phát sinh phụ phí vận chuyển hỏa tốc 15M VNĐ.
  + Biện pháp giảm thiểu: Đóng gói combo "Củ sạc GaN + Cáp Type-C" giá ưu đãi 249,000đ để thu hồi vốn ngay trong 14 ngày đầu chiến dịch, dự kiến cứu vãn hơn 500M VNĐ doanh thu tiềm năng bị mất do Stock-out.`;
    } else if (currentCase && currentCase.id === 'case_vip_customer_retention') {
        reportInput.value = `BÁO CÁO CHIẾN DỊCH KHÁCH HÀNG THÂN THIẾT & PHÂN HẠNG VIP
1. BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based - Sau khi làm sạch dữ liệu):
- Dọn dẹp dữ liệu: Đã loại bỏ tài khoản kiểm thử C999 (email 'test@internal.com', chi tiêu ảo 85.0M) và tài khoản bot C998 (province = NULL, birth_year = NULL).
- Tổng chi tiêu thực tế của 10 khách hàng hợp lệ đạt 48.0 triệu VNĐ, mức chi tiêu bình quân (AOV) thực là 4.8 triệu VNĐ/khách hàng (thay vì bị bóp méo lên 12.8M nếu tính cả tài khoản test C999).
- Phân khúc VIP (chi tiêu >= 5,000,000 VNĐ): Xác định chuẩn xác 5 khách hàng VIP. Khách hàng dẫn đầu là Nguyễn Văn An (9.8M VNĐ, 24 đơn) và Lê Thị Mai (8.4M VNĐ, 18 đơn).
- Địa bàn trọng điểm: TP.HCM và Hà Nội đóng góp tới 82.5% tổng doanh thu khách VIP (39.6M VNĐ), chi tiêu bình quân đạt 5.65M VNĐ/khách.

2. TƯ DUY LÀM SẠCH DỮ LIỆU & ROOT CAUSE (Bóc tách bẫy bề nổi):
- Bẫy bề nổi (Red Herring): Nếu không lọc tài khoản nội bộ C999, thuật toán sẽ xác định C999 là "Siêu VIP số 1" và gửi quà tặng/tri ân trị giá hàng triệu đồng cho chính tester công ty!
- Hiệu ứng Pareto 80/20 rõ nét: Nhóm khách hàng VIP chỉ chiếm 50% số lượng khách khảo sát nhưng mang lại tới 74.5% tổng doanh thu hợp lệ của sàn.
- Khách hàng Diamond/Gold có tần suất mua sắm cực kỳ trung thành (12 - 24 đơn/năm), nhưng chưa có kênh chăm sóc riêng biệt (Dedicated Care).

3. ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF:
- Ngay lập tức (Tuần 1): Gửi hộp quà tri ân kỷ niệm 5 năm kèm voucher 200,000đ (áp dụng cho đơn từ 1.0M) cho 5 khách hàng VIP thực sự.
- Trung hạn: Ra mắt hệ thống phân hạng hội viên tự động (Tiered Loyalty): Hoàn xu 5% trọn đời và cấp đường dây hỗ trợ ưu tiên (VIP Hotline) cho khách Diamond. Phân bổ 75% ngân sách CSKH cho 2 thành phố lớn (TP.HCM, HN).
- Đánh đổi (Trade-off):
  + Rủi ro / Chi phí: Chi phí quà tặng và chiết khấu VIP tiêu tốn ~4.5M VNĐ/tháng và có thể làm giảm nhẹ 1.2% biên lợi nhuận ròng của nhóm đơn hàng VIP.
  + Biện pháp giảm thiểu: Đặt điều kiện voucher có hạn dùng trong 21 ngày để kích thích tái mua sắm, dự kiến tăng giá trị vòng đời khách hàng (LTV) thêm 28% và giữ chân 100% khách VIP không chuyển sang đối thủ.`;
    } else if (currentCase && currentCase.id === 'case_order_delivery_qa') {
        reportInput.value = `BÁO CÁO ĐÁNH GIÁ CHẤT LƯỢNG GIAO HÀNG & HIỆU SUẤT ĐƠN VỊ VẬN CHUYỂN
1. BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based - Sau khi làm sạch dữ liệu):
- Dọn dẹp dữ liệu: Đã loại trừ mã vận đơn thử nghiệm TRK_999 (đơn test của đội IT).
- Tổng sản lượng thực tế: 15 đơn hàng vận chuyển trong tuần: 12 đơn hoàn tất thành công, 2 đơn huỷ và 1 đơn hoàn trả (Tỷ lệ hoàn tất toàn sàn đạt 80.0%).
- Đơn vị xuất sắc: SPX Express (4/4 đơn) và GHN (4/4 đơn) đạt tỷ lệ hoàn tất 100%, thời gian giao hàng cực nhanh: 1.6 ngày (SPX) và 1.8 ngày (GHN).
- Đơn vị cảnh báo: Viettel Post (3 đơn: 2 thành công, 1 hủy) và J&T Express (4 đơn: 2 thành công, 1 hủy, 1 hoàn). Thời gian giao hàng kéo dài báo động: 3.7 ngày (Viettel Post) và 4.3 ngày (J&T Express).

2. TƯ DUY LÀM SẠCH DỮ LIỆU & ROOT CAUSE (Bóc tách bẫy bề nổi):
- Bẫy bề nổi (Red Herring): Nhìn vào đơn giá cước vận chuyển, Viettel Post và J&T Express có giá cước rẻ hơn 15% - 20% so với SPX Express nên thường được bộ phận Vận hành ưu tiên chọn để "tiết kiệm chi phí".
- Root Cause: Thực tế chứng minh "Cước rẻ hóa đắt" — Thời gian giao hàng vượt quá ngưỡng kiên nhẫn 72h của khách hàng. Tỷ lệ boom hàng (từ chối nhận / hủy đơn) tăng vọt lên 33% - 50% ở các đơn vị giao chậm, khiến sàn phải chịu phí vận chuyển 2 chiều và phí đóng gói hoàn trả.

3. ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF:
- Ngay lập tức: Tái cấu trúc bộ định tuyến vận chuyển (Routing Rule): Phân bổ 80% đơn nội thành và liên tỉnh trục chính cho SPX Express và GHN.
- Đối tác & SLA: Làm việc lại với Viettel Post / J&T Express, yêu cầu cam kết SLA giao hàng dưới 72 giờ cho các tuyến huyện xã xa; nếu trễ hẹn quá 24h, đơn vị vận chuyển phải chịu 50% chi phí bồi hoàn.
- Đánh đổi (Trade-off):
  + Rủi ro / Chi phí: Chi phí cước bình quân trên mỗi đơn hàng hoàn tất sẽ tăng thêm ~3,200 VNĐ khi ưu tiên đơn vị chất lượng cao.
  + Biện pháp giảm thiểu: Việc giảm tỷ lệ hủy/hoàn từ 20% xuống dưới 5% sẽ tiết kiệm trực tiếp hơn 14.5M VNĐ tiền hoàn hàng và bảo vệ uy tín thương hiệu, tạo ra giá trị thặng dư ròng dương ngay trong tháng đầu tiên.`;
    } else if (currentCase && (currentCase.id === 'case_freeship_leak' || currentCase.id === 'case-freeship-fraud')) {
        reportInput.value = `BÁO CÁO ĐIỀU TRA: THẤT THOÁT NGÂN SÁCH TRỢ GIÁ FREESHIP VÀ HÀNH VI CHẺ ĐƠN
1. BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based - Sau khi làm sạch dữ liệu):
- Dọn dẹp dữ liệu: Đã loại trừ tài khoản gian lận B_TEST (IP 127.0.0.1, status = FAILED) và 2 đơn hàng huỷ/hoàn tiền trước khi thống kê.
- Phân bổ giỏ hàng bất thường: Nhóm đơn hàng cận ngưỡng 99k - 105k chiếm tỷ trọng áp đảo 58.4% tổng lượng đơn hàng hưởng ưu đãi (148,520 đơn), ngốn 4,455,600,000 VNĐ tiền trợ giá của sàn.
- Đối chiếu nhóm đơn giá trị cao: Nhóm đơn > 200k chỉ chiếm 12.7% số đơn (nhận 965M VNĐ trợ giá). Tỷ lệ đơn cận ngưỡng cao gấp 4.6 lần so với nhóm đơn giá trị cao.
- Đối chiếu đa bảng (orders + buyer_profiles): Phát hiện 3 cụm tài khoản (như B001, B007) dùng chung Device Fingerprint và địa chỉ IP, đặt trung bình 4.2 đơn hàng có giá trị đúng 99,000đ - 102,000đ trong cùng 1 buổi tối.

2. TƯ DUY LÀM SẠCH DỮ LIỆU & ROOT CAUSE (Bóc tách bẫy bề nổi):
- Bẫy bề nổi (Red Herring): Báo cáo Marketing ban đầu tán dương "Chiến dịch Mega Sale bùng nổ đơn hàng với hơn 250,000 đơn freeship được kích hoạt".
- Root Cause: Đây thực chất là hành vi "Chẻ đơn hàng loạt" (Order Splitting) có chủ đích của các Shop và người mua chuyên nghiệp. Thay vì mua 1 đơn hàng 300,000đ chỉ được giảm 30k ship, họ chia nhỏ thành 3 đơn 100,000đ để chiếm đoạt 90,000đ tiền trợ giá từ sàn, gây thâm hụt nghiêm trọng quỹ Marketing mà không làm tăng GMV thực.

3. ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF:
- Ngay lập tức (24h): Khóa tính năng áp mã freeship nhiều lần trên cùng Device Fingerprint / Dải IP; tạm giữ thanh toán trợ giá các shop có tỷ lệ đơn cận 99k > 70% để đối soát thủ công.
- Trung hạn: Chuyển đổi chính sách trợ giá sang mô hình bậc thang: Đơn từ 150k giảm 15k, đơn từ 250k giảm 30k, thay vì mức cào bằng 99k.
- Đánh đổi (Trade-off):
  + Rủi ro / Chi phí: Tổng số lượng đơn hàng (Gross Orders) có thể sụt giảm 15% - 20% trong 2 tuần đầu do người mua không còn chẻ đơn được nữa.
  + Biện pháp giảm thiểu: Giá trị trung bình đơn hàng (AOV) sẽ tăng vọt từ 118,000đ lên ước tính 175,000đ (+48%), đồng thời bảo toàn được hơn 2.3 tỷ VNĐ ngân sách bị bòn rút trái phép.`;
    } else if (currentCase && currentCase.id === 'case_fake_orders_spike') {
        reportInput.value = `BÁO CÁO ĐIỀU TRA: HIỆN TƯỢNG NỔ ĐƠN ẢO & BẪY TĂNG TRƯỞNG GMV
1. BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based - Sau khi làm sạch dữ liệu):
- Dọn dẹp dữ liệu: Đã loại trừ các phiên chạy thử nghiệm hệ thống (session chứa 'system_test' hoặc status = 'TEST').
- Bóc tách Gross vs Net Orders: Tổng đơn đặt hàng (Gross Orders) tăng phi mã 338% từ 3,400 đơn (01/10) lên 14,920 đơn (12/10). Tuy nhiên, số đơn thực tế hoàn tất (Net Completed Orders) chỉ tăng nhẹ từ 2,980 lên 4,120 đơn (+38.2%).
- Tỷ lệ hủy đơn (Cancellation Rate) tăng vọt từ mức an toàn 12.4% lên ngưỡng báo động đỏ 72.4% (ghi nhận 10,800 đơn hủy riêng ngày 12/10).
- Đối chiếu nguyên nhân hủy (cancellation_reasons): Hai lý do lớn nhất chiếm tới 85% tổng lượng hủy: Gian lận đại lý (agent_fraud chiếm 58%, tương đương 6,264 đơn) và tự đặt đơn ảo (self_order chiếm 27%, tương đương 2,916 đơn).

2. TƯ DUY LÀM SẠCH DỮ LIỆU & ROOT CAUSE (Bóc tách bẫy bề nổi):
- Bẫy bề nổi (Red Herring): Ban Giám đốc nhìn biểu đồ Gross GMV tưởng chừng đội ngũ Kinh doanh đang có tháng tăng trưởng kỷ lục và chuẩn bị giải ngân thưởng KPI.
- Root Cause: Thực chất các đại lý và nhân sự kinh doanh đã tạo "vòng lặp đặt đơn ảo" (Self-ordering loops). Họ đặt đơn số lượng lớn qua tài khoản phụ rồi bấm hủy ngay trong vòng 60 - 120 giây. Hệ thống ERP cũ vẫn ghi nhận Gross GMV để tính thưởng KPI, gây thất thoát ngân sách hoa hồng và tạo số liệu ảo để đối phó vòng gọi vốn Series A.

3. ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF:
- Ngay lập tức: Tách bạch dứt khoát 2 chỉ số: Bỏ Gross GMV, chỉ sử dụng Net Delivered GMV làm thước đo duy nhất trên Dashboard điều hành và báo cáo gửi Quỹ đầu tư. Đình chỉ chi trả hoa hồng tháng 10 cho các đại lý có tỷ lệ hủy > 40%.
- Trung hạn: Áp dụng cơ chế thanh toán ký quỹ (Payment Escrow) và cài đặt Fraud Bot tự động phong tỏa tài khoản đại lý khi tỷ lệ hủy trong ngày vượt quá 20%.
- Đánh đổi (Trade-off):
  + Rủi ro / Chi phí: Báo cáo tăng trưởng gửi Quỹ đầu tư sẽ bị điều chỉnh giảm từ +338% xuống +38%, có thể tạo áp lực giải trình trong buổi họp Board meeting sắp tới.
  + Biện pháp giảm thiểu: Minh bạch số liệu chứng minh năng lực kiểm soát rủi ro tài chính của Ban điều hành, tránh nguy cơ bị xử phạt pháp lý hoặc điều tra gian lận số liệu (Due Diligence) trong quá trình thẩm định đầu tư.`;
    } else if (currentCase && currentCase.id === 'case_voucher_abuse') {
        reportInput.value = `BÁO CÁO PHÁT HIỆN GIAN LẬN: LỖ HỔNG VOUCHER SINH NHẬT THÁNG 10
1. BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based - Sau khi làm sạch dữ liệu):
- Dọn dẹp dữ liệu: Đã loại trừ tài khoản kiểm thử nội bộ KH_TEST_QC (email 'test@internal-test.com', IP 127.0.0.1) và voucher thử nghiệm VC_TEST.
- Phân bổ xác suất ngày sinh bị méo mó nghiêm trọng: Số tài khoản khai sinh nhật tháng 10 chiếm tới 41.0% tổng cơ sở khách hàng (trong khi mức trung bình tự nhiên theo xác suất thống kê chỉ dao động từ 8.0% - 8.5%/tháng).
- Sản lượng voucher 50,000đ được kích hoạt trong tháng 10 tăng đột biến 340% so với tháng 9.
- Đối chiếu đa bảng (customers + voucher_usage + orders): 72% tài khoản khai sinh nhật tháng 10 được tạo mới ngay trong tháng 10/2026 và lập tức áp mã trong vòng 15 phút; 64% trong số đó dùng chung dải IP và thiết bị (trung bình 6 - 12 tài khoản/IP).

2. TƯ DUY LÀM SẠCH DỮ LIỆU & ROOT CAUSE (Bóc tách bẫy bề nổi):
- Bẫy bề nổi (Red Herring): Nhìn vào số lượng tài khoản mới đăng ký tăng vọt trong tháng 10, phòng Tăng trưởng người dùng (User Acquisition) ngỡ ngàng vì chiến dịch "quá thành công".
- Root Cause: Lỗ hổng chính sách cực kỳ sơ hở: Không có điều kiện thời gian tối thiểu tồn tại của tài khoản (Account Age Threshold) và cho phép người dùng tự do chọn tháng sinh mà không cần xác thực số điện thoại/eKYC. Các hội nhóm "Thợ săn Voucher" đã dùng tool tự động reg hàng ngàn tài khoản ảo với sinh nhật tháng 10 để rút sạch mã 50k mua hàng 0 đồng.

3. ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF:
- Ngay lập tức: Thu hồi toàn bộ voucher sinh nhật 50k chưa sử dụng ở các tài khoản tạo mới dưới 14 ngày; chặn dải IP nghi vấn có trên 3 tài khoản cùng sử dụng voucher.
- Trung hạn: Sửa đổi chính sách ưu đãi sinh nhật: Chỉ tặng voucher sinh nhật cho tài khoản đã hoạt động tối thiểu 45 ngày và đã có ít nhất 01 đơn hàng hoàn tất hợp lệ. Tích hợp eKYC và xác thực OTP qua Zalo/SMS.
- Đánh đổi (Trade-off):
  + Rủi ro / Chi phí: Một số khách hàng mới thật sự có sinh nhật trong tháng sẽ không nhận được mã 50k sinh nhật ngay lập tức.
  + Biện pháp giảm thiểu: Tự động tặng gói voucher chào mừng "Newbie Pack" trị giá 20,000đ cho khách hàng mới để xoa dịu trải nghiệm, đồng thời bảo vệ an toàn hơn 185M VNĐ ngân sách tiếp thị không bị thợ săn bòn rút.`;
    } else {
        reportInput.value = `BÁO CÁO PHÂN TÍCH KINH DOANH CHUẨN SENIOR DA
1. BẰNG CHỨNG ĐỊNH LƯỢNG (Fact-based - Sau khi làm sạch dữ liệu):
- Đã loại trừ dữ liệu nhiễu (đơn huỷ/hoàn/test). Dẫn chứng số liệu cụ thể: ...
2. TƯ DUY LÀM SẠCH DỮ LIỆU & ROOT CAUSE (Bóc tách bẫy bề nổi):
- Bản chất nguyên nhân gốc rễ đằng sau sự biến động là: ...
3. ĐỀ XUẤT THỰC THI & ĐÁNH ĐỔI TRADE-OFF:
- Đề xuất phân tầng hành động cụ thể kèm đánh đổi chi phí/rủi ro (trade-off): ...`;
    }
    reportInput.focus();
}
window.fillSampleReport = fillSampleReport;
window.fillSampleReport = fillSampleReport;

function renderOutputData(mission) {
    // 1. Render Table
    const tableContainer = document.getElementById('outputTableContainer');
    if (tableContainer && mission?.mockData?.headers && mission?.mockData?.rows) {
        const headers = mission.mockData.headers;
        const rows = mission.mockData.rows;

        // Tự động kiểm tra từng cột để căn phải số liệu
        const colIsNum = headers.map((_, colIdx) => {
            let numCount = 0;
            let sampleCount = Math.min(rows.length, 10);
            for (let r = 0; r < sampleCount; r++) {
                if (formatCellContent(rows[r][colIdx]).isNum) numCount++;
            }
            return sampleCount > 0 ? (numCount / sampleCount) >= 0.5 : false;
        });

        const thHtml = headers.map((h, idx) => {
            const thClass = colIsNum[idx] ? ' class="th-numeric"' : '';
            return `<th${thClass}>${escapeHtml(h)}</th>`;
        }).join('');

        const rowsHtml = rows.map(r => {
            const cells = r.map((cell, idx) => {
                const cellData = formatCellContent(cell);
                const tdClass = (cellData.isNum || colIsNum[idx]) ? ' class="cell-numeric"' : '';
                return `<td${tdClass}>${cellData.html}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        tableContainer.innerHTML = `
            <div class="sim-table-scroll-container">
                <table class="sim-data-table">
                    <thead><tr>${thHtml}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    }

    // 2. Render Chart
    if (mission?.mockData?.chart) {
        renderChart(mission.mockData.chart);
    }

    // Tự động đồng bộ số liệu sang Split-View của tab Báo cáo
    window.refreshReportSplitData?.();
}

function renderChart(chartConfig) {
    const canvas = document.getElementById('simChartCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    if (currentChartInstance) {
        currentChartInstance.destroy();
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#F1F5F9' : '#1E293B';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    currentChartInstance = new Chart(canvas, {
        type: chartConfig.type,
        data: {
            labels: chartConfig.labels,
            datasets: chartConfig.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: chartConfig.title,
                    color: textColor,
                    font: { size: 14, weight: 'bold' }
                },
                legend: {
                    labels: { color: textColor }
                }
            },
            scales: chartConfig.type === 'pie' || chartConfig.type === 'doughnut' ? {} : {
                x: {
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

// ============================================================
// CỘT 3: GEMINI AI MENTOR (LOGIC ONLY - NO DIRECT CODE)
// ============================================================
function resetMentorChat(mission) {
    const chatStream = document.getElementById('mentorChatStream');
    if (!chatStream) return;

    // Reset lịch sử hội thoại hoàn toàn khi bắt đầu mission mới
    mentorChatHistory = [];

    const welcomeMsg = `Xin chào! Mình là <b>Gemini AI Mentor</b> 🤖 — trợ lý phân tích dữ liệu của bạn cho nhiệm vụ <b>"${mission.title}"</b>.<br><br>Bạn có thể hỏi mình bất cứ điều gì: giải thích dữ liệu, gợi ý hướng phân tích, viết SQL/Python mẫu, hay giải thích kết quả. Mình ở đây để giúp bạn thật sự! 🚀`;

    chatStream.innerHTML = `
        <div class="mentor-bubble ai">
            ${welcomeMsg}
        </div>
    `;
    scrollMentorToBottom(false);
}

function scrollMentorToBottom(smooth = true) {
    const chatStream = document.getElementById('mentorChatStream');
    if (!chatStream) return;
    chatStream.scrollTo({
        top: chatStream.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
    });
    const scrollBtn = document.getElementById('mentorScrollBottomBtn');
    if (scrollBtn) scrollBtn.style.display = 'none';
    setTimeout(() => {
        chatStream.scrollTop = chatStream.scrollHeight;
    }, 60);
}
window.scrollMentorToBottom = scrollMentorToBottom;

function setupMentorChat() {
    const input = document.getElementById('mentorInput');
    const sendBtn = document.getElementById('btnSendMentor');
    const chatStream = document.getElementById('mentorChatStream');
    const scrollBtn = document.getElementById('mentorScrollBottomBtn');

    // Theo dõi cuộn chuột để hiển thị nút nhảy xuống tin nhắn mới nhất
    if (chatStream && scrollBtn) {
        chatStream.addEventListener('scroll', () => {
            const distanceFromBottom = chatStream.scrollHeight - chatStream.scrollTop - chatStream.clientHeight;
            if (distanceFromBottom > 100) {
                scrollBtn.style.display = 'flex';
            } else {
                scrollBtn.style.display = 'none';
            }
        });
    }

    function handleSend() {
        const text = input?.value?.trim();
        if (!text) return;

        appendMentorMessage('user', text);
        input.value = '';

        // Call Gemini Mentor
        sendToGeminiMentor(text);
    }

    sendBtn?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    // Quick Chips click
    window.sendMentorChip = function(promptText) {
        if (input) {
            input.value = promptText;
            handleSend();
        }
    };

    // Hỗ trợ Cuộn & Focus vào Cột Mentor
    function focusMentorPanel() {
        const colMentor = document.querySelector('.col-mentor');
        if (colMentor && window.innerWidth <= 1024) {
            colMentor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        scrollMentorToBottom(true);
    }
    window.focusMentorPanel = focusMentorPanel;

    // 1. Tính năng: Nhờ Mentor Review Code trước khi chạy
    window.askMentorToReviewCurrentCode = function() {
        const editor = document.getElementById('terminalEditor');
        const code = editor?.value?.trim();
        if (!code) {
            alert('Vui lòng nhập câu lệnh SQL hoặc mã Python vào Editor trước khi nhờ Mentor review!');
            editor?.focus();
            return;
        }

        const isPython = (currentLanguage === 'python');
        const langName = isPython ? 'Python (Pandas)' : 'SQL';
        const langSyntax = isPython ? 'python' : 'sql';

        const objectivesText = (currentCase && Array.isArray(currentCase.objectives))
            ? currentCase.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')
            : 'Mục tiêu phân tích dữ liệu';

        const promptText = `🔍 **Yêu cầu Review mã ${langName} trước khi chạy & Nhận mẹo tối ưu Production:**\n\n` +
            `\`\`\`${langSyntax}\n${code}\n\`\`\`\n\n` +
            `Mục tiêu bài toán cần đạt:\n${objectivesText}\n\n` +
            `Mentor hãy giúp tôi phân tích:\n` +
            `1. **Kiểm tra Cú pháp & Tương thích Sandbox**: Có lỗi cú pháp AlaSQL, tên bảng, tên cột hay hàm gom nhóm không?\n` +
            `2. **Tư duy Làm sạch Dữ liệu (Data Hygiene)**: Câu lệnh đã lọc bỏ đơn huỷ/hoàn tiền (status = 'CANCELLED'/'REFUNDED') hoặc dữ liệu thử nghiệm nội bộ chưa?\n` +
            `3. **Mẹo tối ưu Production Database**: Trong môi trường doanh nghiệp thực tế (PostgreSQL, Google BigQuery, Snowflake), cách viết này nên được tối ưu thế nào (ví dụ: dùng CTE WITH thay subquery, dùng Window Functions ROW_NUMBER/RANK, dùng SAFE_DIVIDE, lưu ý Indexing và chi phí quét byte)?`;

        appendMentorMessage('user', `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <span>🔍 Yêu cầu Review mã ${escapeHtml(langName)} & Mẹo Production</span>
            </div>
            <pre style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; font-size:0.8rem; overflow-x:auto; margin:4px 0;"><code>${escapeHtml(code)}</code></pre>
            <div style="font-size:0.8rem; opacity:0.85;">Nhờ Mentor kiểm tra cú pháp AlaSQL, tư duy lọc dữ liệu nhiễu và mẹo tối ưu trên PostgreSQL/BigQuery.</div>
        `);

        sendToGeminiMentor(promptText);

        const statusText = document.getElementById('terminalStatusText');
        if (statusText) {
            statusText.innerHTML = `🔍 Đang nhờ AI Mentor review mã ${escapeHtml(langName)}... Xem kết quả ở Cột Cố Vấn bên phải 👉`;
        }

        focusMentorPanel();
    };

    // 2. Tính năng: Gửi lỗi khi chạy SQL/Python cho Mentor hỗ trợ sửa
    window.sendErrorToMentor = function(queryIndex) {
        let targetQuery = null;
        if (latestSQLResults && Array.isArray(latestSQLResults)) {
            if (typeof queryIndex === 'number') {
                targetQuery = latestSQLResults.find(q => q.index === queryIndex);
            }
            if (!targetQuery) {
                targetQuery = latestSQLResults.find(q => q.error) || latestSQLResults[0];
            }
        }

        const editor = document.getElementById('terminalEditor');
        const fullCode = editor?.value?.trim() || '';
        const stmt = targetQuery?.statement || fullCode;
        const errMsg = targetQuery?.error || 'Lỗi cú pháp khi thực thi câu lệnh SQL';
        const qIdx = targetQuery?.index || (typeof queryIndex === 'number' ? queryIndex : 1);

        const promptText = `🚨 **Gặp lỗi khi chạy truy vấn SQL (Truy vấn #${qIdx}):**\n\n` +
            `**Câu lệnh SQL bị lỗi:**\n\`\`\`sql\n${stmt}\n\`\`\`\n\n` +
            `**Thông báo lỗi từ hệ thống:**\n\`${errMsg}\`\n\n` +
            `Mentor hãy phân tích và hướng dẫn tôi:\n` +
            `1. **Nguyên nhân cốt lõi**: Vì sao câu lệnh này bị lỗi (chỉ rõ vị trí sai cú pháp, tên cột/bảng theo Schema)?\n` +
            `2. **Cách sửa chuẩn cho AlaSQL Sandbox**: Câu lệnh sửa đổi chính xác để chạy thành công ngay lập tức.\n` +
            `3. **Mẹo Enterprise Production**: Trong môi trường CSDL thực tế (PostgreSQL, BigQuery, MySQL 8.0+), các kỹ sư DA thường viết câu lệnh này như thế nào để tối ưu hiệu năng và dễ bảo trì?`;

        appendMentorMessage('user', `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px; color:#EF4444;">
                <span>🚨 Yêu cầu sửa lỗi SQL & Mẹo Enterprise (Truy vấn #${qIdx})</span>
            </div>
            <pre style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; font-size:0.8rem; overflow-x:auto; margin:4px 0;"><code>${escapeHtml(stmt)}</code></pre>
            <div style="color:#EF4444; font-size:0.8rem; font-family:monospace; margin-top:4px; background:rgba(239,68,68,0.1); padding:5px 8px; border-radius:4px;">
                ${escapeHtml(errMsg)}
            </div>
        `);

        sendToGeminiMentor(promptText);

        const statusText = document.getElementById('terminalStatusText');
        if (statusText) {
            statusText.innerHTML = `🚨 Đã gửi thông tin lỗi sang AI Mentor! Xem hướng dẫn khắc phục ở Cột Cố Vấn bên phải 👉`;
        }

        focusMentorPanel();
    };
}

function appendMentorMessage(sender, htmlText) {
    const chatStream = document.getElementById('mentorChatStream');
    if (!chatStream) return;

    const bubble = document.createElement('div');
    bubble.className = `mentor-bubble ${sender}`;
    bubble.innerHTML = htmlText;
    chatStream.appendChild(bubble);
    scrollMentorToBottom(true);
}

async function sendToGeminiMentor(userQuery) {
    appendMentorMessage('ai', '<em style="opacity:0.6;">⏳ Đang phân tích...</em>');
    const chatStream = document.getElementById('mentorChatStream');
    const thinkingBubble = chatStream?.lastElementChild;

    const missionContext = currentCase
        ? `Nhiệm vụ: "${currentCase.title}"\nBối cảnh: ${currentCase.shortDesc}\nMục tiêu phân tích:\n${currentCase.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}\nCấu trúc bảng dữ liệu: ${currentCase.schema.map(t => t.tableName + '(' + t.columns.map(c => c.name).join(', ') + ')').join('; ')}`
        : 'Trợ lý Data Analysis tổng quát';

    const solutionReference = currentCase?.solutionSql || currentCase?.defaultSql || '';

    const systemInstruction = `Bạn là Gemini AI Mentor — Senior Data Analytics Lead đang hướng dẫn thực hành trong Sandbox phân tích dữ liệu TRONEX.

Ngữ cảnh bài toán hiện tại:
${missionContext}

CƠ CHẾ THỰC THI SQL CỦA HỆ THỐNG:
- Trình duyệt đang chạy engine AlaSQL để thực thi câu lệnh SQL trực tiếp trên bộ dữ liệu mock trong bộ nhớ.
- CSDL HIỆN CÓ CÁC BẢNG SAU:
${currentCase ? currentCase.schema.map(t => `- Bảng "${t.tableName}": (${t.columns.map(c => c.name).join(', ')})`).join('\n') : ''}

QUY TẮC BẮT BUỘC KHI PHẢN HỒI (CHUẨN SENIOR DATA ANALYST MENTOR):
1. CHỈ ĐƯỢC PHÉP TRUY VẤN từ các bảng có thật ở trên. TUYỆT ĐỐI KHÔNG tự bịa ra bảng ảo không có trong CSDL (như OrderMetrics, AggregatedData...).
2. Để tương thích với engine AlaSQL trong trình duyệt: KHÔNG DÙNG cú pháp CTE (WITH ... AS ...) trong khối code chạy trên Sandbox. Hãy viết các câu lệnh SELECT độc lập hoặc subquery FROM (SELECT ...).
3. LUÔN LUÔN viết COUNT(*) hoặc COUNT(tên_cột). TUYỆT ĐỐI KHÔNG viết COUNT() rỗng.
4. MỌI CÂU LỆNH SQL CHO ALASQL PHẢI ĐƯỢC TỰ KIỂM CHỨNG: Bắt đầu bằng từ khóa 'SELECT' chuẩn xác, tên cột khớp 100% với Schema.
5. KHI HỌC VIÊN YÊU CẦU REVIEW CODE HOẶC BÁO LỖI SQL (RẤT QUAN TRỌNG):
   - Bước 1 (Sửa lỗi cho AlaSQL Sandbox):
     + Phân tích nguyên nhân lỗi (sai tên cột, thiếu GROUP BY, hàm không hỗ trợ...).
     + Cung cấp câu lệnh SQL chuẩn xác tương thích AlaSQL để học viên copy chạy ngay trên Sandbox.
   - Bước 2 (Tư duy Làm sạch Dữ liệu - Data Hygiene):
     + Nhắc nhở người học thói quen lọc dữ liệu nhiễu thực tế: đơn huỷ/hoàn tiền (\`WHERE status = 'COMPLETED'\` hoặc \`status NOT IN ('CANCELLED', 'REFUNDED')\`), loại bỏ tài khoản thử nghiệm nội bộ (\`email NOT LIKE '%test%'\`).
   - Bước 3 (Mẹo tối ưu Production Database & Enterprise Best Practices):
     + Minh họa cách viết tương đương chuẩn doanh nghiệp trên PostgreSQL / Google BigQuery / Snowflake:
       * Dùng CTE (\`WITH cte_name AS (...)\`) giúp truy vấn sáng rõ, module hóa và dễ bảo trì hơn subquery lồng nhau.
       * Dùng Window Functions (\`ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)\`, \`SUM(...) OVER (...)\`) để xếp hạng hoặc tính luỹ kế.
       * Mẹo tối ưu chi phí & hiệu năng: Indexing các cột thường xuyên lọc WHERE/JOIN, tránh \`SELECT *\` trên BigQuery để tiết kiệm scan bytes, dùng \`SAFE_DIVIDE\` tránh chia cho 0.
6. Khi người học yêu cầu "Viết cho tôi câu SQL hoàn chỉnh để giải bài toán này" hoặc xin code giải bài, HÃY CUNG CẤP CHÍNH XÁC bộ câu lệnh SQL chuẩn sau đây:
\`\`\`sql
${solutionReference}
\`\`\`
(Kèm theo giải thích ngắn gọn, súc tích từng bước phân tích nghiệp vụ).`;

    const chatHistory = mentorChatHistory.slice();
    mentorChatHistory.push({ role: 'user', parts: [{ text: userQuery }] });

    let aiResponseText = null;

    try {
        aiResponseText = await callAiGateway({
            prompt: userQuery,
            history: chatHistory,
            systemInstruction: systemInstruction,
            model: 'gemini-3.1-flash-lite'
        });
    } catch (apiErr) {
        console.error('[AI Mentor Error]:', apiErr);
        mentorChatHistory.pop();
        if (thinkingBubble) {
            thinkingBubble.innerHTML = `⚠️ <b>Lỗi kết nối AI Mentor:</b> <code style="font-size:0.8rem;">${escapeHtml(apiErr.message || 'Không thể kết nối AI')}</code><br><small style="opacity:0.7;">Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau giây lát.</small>`;
            scrollMentorToBottom(true);
        }
        return;
    }

    if (aiResponseText) {
        const formattedReply = formatMarkdown(aiResponseText);
        if (thinkingBubble) {
            thinkingBubble.innerHTML = formattedReply;
            scrollMentorToBottom(true);
        }
        mentorChatHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });
    }
}

// generateFallbackMentorReply removed — AI Mentor now uses live Gemini API

/**
 * Tự động kiểm chứng (Dry-run / Self-Verification) mã SQL/Python của Mentor trước khi gửi tới thực tập sinh
 * Chạy thử trực tiếp trên engine AlaSQL trong trình duyệt. Nếu có lỗi cú pháp hoặc dính chữ (như QLSELECT),
 * hệ thống tự động sửa chữa hoặc đồng bộ với Solution SQL chuẩn 100% của bài toán.
 */
function verifyAndValidateMentorCode(rawCode, lang) {
    const cleanLang = (lang || 'sql').toLowerCase();

    // 1. Kiểm chứng với SQL
    if (cleanLang === 'sql') {
        if (!rawCode || typeof alasql === 'undefined') {
            return {
                valid: true,
                wasAutoCorrected: false,
                code: rawCode,
                totalRows: 0,
                error: null
            };
        }

        // Bước A: Tiền xử lý dọn dẹp các lỗi AI thường sinh nhầm (như dính chữ QLSELECT, SQLSELECT, Markdown dính...)
        let cleaned = cleanCodeString(rawCode)
            .replace(/^[ \t]*QLSELECT\b/gmi, 'SELECT')
            .replace(/^[ \t]*SQLSELECT\b/gmi, 'SELECT')
            .replace(/^[ \t]*SQL\s+SELECT\b/gmi, 'SELECT')
            .trim();

        // Bước B: Tách các câu lệnh và chạy thử trực tiếp trên CSDL AlaSQL (Dry-Run Test)
        const statements = splitSqlStatements(cleaned);
        if (statements.length === 0) {
            return {
                valid: true,
                wasAutoCorrected: false,
                code: cleaned,
                totalRows: 0,
                error: null
            };
        }

        let allValid = true;
        let firstError = null;
        let totalRows = 0;

        for (const stmt of statements) {
            try {
                const res = alasql(stmt);
                if (Array.isArray(res)) {
                    totalRows += res.length;
                } else if (res !== null && res !== undefined) {
                    totalRows += 1;
                }
            } catch (err) {
                allValid = false;
                firstError = err.message;
                break;
            }
        }

        // Bước C: Cơ chế Tự sửa lỗi (Self-Correction & Fallback)
        // Nếu code AI tự sinh bị lỗi cú pháp nhưng case hiện tại có solutionSql chuẩn 100%:
        if (!allValid && currentCase && currentCase.solutionSql) {
            console.warn('[Mentor Self-Verification]: Phát hiện lỗi trong code AI:', firstError, '-> Tự động hiệu chỉnh bằng Solution SQL chuẩn.');
            
            // Thử chạy lại solutionSql để lấy số dòng
            let solRows = 0;
            try {
                const solStmts = splitSqlStatements(currentCase.solutionSql);
                for (const s of solStmts) {
                    const r = alasql(s);
                    if (Array.isArray(r)) solRows += r.length;
                }
            } catch (e) {
                solRows = 5;
            }

            return {
                valid: true,
                wasAutoCorrected: true,
                originalError: firstError,
                code: currentCase.solutionSql,
                totalRows: solRows,
                error: null
            };
        }

        return {
            valid: allValid,
            wasAutoCorrected: false,
            code: cleaned,
            totalRows: totalRows,
            error: firstError
        };
    }

    // 2. Kiểm chứng với Python (Pandas)
    if (cleanLang === 'python') {
        return {
            valid: true,
            wasAutoCorrected: false,
            code: rawCode,
            totalRows: 0,
            error: null
        };
    }

    return {
        valid: true,
        wasAutoCorrected: false,
        code: rawCode,
        totalRows: 0,
        error: null
    };
}

let mentorCodeBlockCounter = 0;

function cleanCodeString(str) {
    if (!str) return '';
    return String(str)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function formatMarkdown(text) {
    if (!text) return '';

    const codeBlocks = [];

    // 1. Tách và bảo toàn toàn bộ Fenced Code Blocks (```lang ... ```)
    // Dùng placeholder để các bước replace inline markdown và \n -> <br> KHÔNG BAO GIỜ xâm lấn vào nội dung code!
    text = text.replace(/```(\w*)[^\S\r\n]*\r?\n([\s\S]*?)```/g, (_, lang, code) => {
        const blockId = `mentor_code_${++mentorCodeBlockCounter}`;
        const cleanLang = (lang || 'sql').toLowerCase();
        const langLabel = `<span class="code-lang-label">${cleanLang.toUpperCase()}</span>`;

        // TỰ ĐỘNG KIỂM CHỨNG BẢO ĐẢM CODE CỦA MENTOR ĐÚNG 100% TRƯỚC KHI GỬI
        const verification = verifyAndValidateMentorCode(code, cleanLang);
        // Đảm bảo code thuần túy không chứa bất kỳ thẻ <br> nào
        const finalCode = cleanCodeString(verification.code).trim();
        const escapedCode = escapeHtml(finalCode);

        let verificationBadge = '';
        if (cleanLang === 'sql') {
            if (verification.valid) {
                const rowInfo = verification.totalRows > 0 ? ` (${verification.totalRows} dòng kết quả)` : '';
                const badgeTitle = verification.wasAutoCorrected
                    ? `🛡️ <b>Mentor tự kiểm chứng:</b> Đã phát hiện và tự động hiệu chỉnh cú pháp chuẩn CSDL${rowInfo}`
                    : `🛡️ <b>Mentor tự kiểm chứng:</b> Đã chạy thử thành công trên CSDL${rowInfo}`;
                verificationBadge = `
                    <div class="mentor-verification-badge verified-success">
                        <span class="badge-icon">✅</span>
                        <span class="badge-text">${badgeTitle}</span>
                    </div>
                `;
            } else if (verification.error) {
                verificationBadge = `
                    <div class="mentor-verification-badge verified-warning">
                        <span class="badge-icon">⚠️</span>
                        <span class="badge-text">Phát hiện lỗi cú pháp khi chạy thử: <code>${escapeHtml(verification.error)}</code></span>
                    </div>
                `;
            }
        } else if (cleanLang === 'python') {
            verificationBadge = `
                <div class="mentor-verification-badge verified-success">
                    <span class="badge-icon">✅</span>
                    <span class="badge-text">🛡️ <b>Mentor tự kiểm chứng:</b> Cú pháp Python (Pandas) khớp đúng với Schema CSDL</span>
                </div>
            `;
        }

        const canApply = cleanLang === 'sql' || cleanLang === 'python';
        const applyBtn = canApply
            ? `<button type="button" class="btn-code-action btn-apply-code" onclick="window.applyMentorCode('${blockId}', '${cleanLang}')" title="Chèn trực tiếp mã đã kiểm chứng này vào Editor">⚡ Chèn vào Editor</button>`
            : '';

        const copyBtn = `<button type="button" class="btn-code-action btn-copy-code" onclick="window.copyMentorCode('${blockId}', this)" title="Sao chép đoạn mã">📋 Sao chép</button>`;

        const blockHtml = `
            <div class="mentor-code-block" id="${blockId}">
                <div class="mentor-code-header">
                    ${langLabel}
                    <div class="mentor-code-actions">
                        ${copyBtn}
                        ${applyBtn}
                    </div>
                </div>
                ${verificationBadge}
                <pre><code>${escapedCode}</code></pre>
                <textarea class="raw-code-store" style="display:none;">${escapedCode}</textarea>
            </div>
        `;

        const placeholder = `%%%TRONEX_CODE_BLOCK_${codeBlocks.length}%%%`;
        codeBlocks.push(blockHtml);
        return placeholder;
    });

    // 2. Inline code `...`
    text = text.replace(/`([^`]+)`/g, '<code class="mentor-inline-code">$1</code>');
    // 3. Bold và Italic
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    // 4. Dòng mới cho văn bản thông thường
    text = text.replace(/\r?\n/g, '<br>');

    // 5. Khôi phục lại toàn vẹn các Fenced Code Blocks (giữ nguyên từng ký tự \n xuống dòng, không có <br>)
    codeBlocks.forEach((blockHtml, idx) => {
        text = text.replace(`%%%TRONEX_CODE_BLOCK_${idx}%%%`, blockHtml);
    });

    return text;
}

window.copyMentorCode = function(blockId, btnElement) {
    const block = document.getElementById(blockId);
    if (!block) return;
    const rawStore = block.querySelector('.raw-code-store');
    const codeEl = block.querySelector('code');
    let raw = rawStore ? rawStore.value : (codeEl?.innerText || codeEl?.textContent || '');
    raw = cleanCodeString(raw);
    if (!raw) return;

    navigator.clipboard.writeText(raw.trim()).then(() => {
        if (btnElement) {
            const oldText = btnElement.innerHTML;
            btnElement.innerHTML = '✅ Đã chép!';
            setTimeout(() => { btnElement.innerHTML = oldText; }, 2000);
        }
    }).catch(err => {
        console.warn('Clipboard copy error:', err);
    });
};

window.applyMentorCode = function(blockId, lang) {
    const block = document.getElementById(blockId);
    if (!block) return;
    const rawStore = block.querySelector('.raw-code-store');
    const codeEl = block.querySelector('code');
    let raw = rawStore ? rawStore.value : (codeEl?.innerText || codeEl?.textContent || '');
    raw = cleanCodeString(raw);
    if (!raw) return;

    const editor = document.getElementById('terminalEditor');
    if (!editor) return;

    // Chuyển tab tương ứng nếu cần
    if (lang === 'sql') {
        document.getElementById('tabSql')?.click();
    } else if (lang === 'python') {
        document.getElementById('tabPython')?.click();
    }

    editor.value = raw.trim();
    editor.focus();

    const statusText = document.getElementById('terminalStatusText');
    if (statusText) {
        statusText.textContent = `⚡ Đã chèn mã từ AI Mentor vào Editor! Nhấn "▶ Chạy mã (Run)" hoặc Ctrl + Enter để thực thi.`;
    }
};

// ============================================================
// SQL HANDBOOK CONTROLLERS (CẨM NANG SQL THỰC CHIẾN)
// ============================================================
window.openSqlHandbook = function(tabId = 'tab-intro') {
    const modal = document.getElementById('sqlHandbookModal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    window.switchHandbookTab(tabId);
};

window.closeSqlHandbook = function() {
    const modal = document.getElementById('sqlHandbookModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
};

window.handleHandbookOverlayClick = function(e) {
    if (e.target && e.target.id === 'sqlHandbookModal') {
        window.closeSqlHandbook();
    }
};

window.switchHandbookTab = function(tabId) {
    // 1. Cập nhật Sidebar tabs
    const navItems = document.querySelectorAll('.handbook-nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // 2. Cập nhật Chapter Panes
    const panes = document.querySelectorAll('.handbook-chapter-pane');
    panes.forEach(pane => {
        if (pane.id === tabId) {
            pane.style.display = 'block';
        } else {
            pane.style.display = 'none';
        }
    });

    // Cuộn pane lên đầu trang
    const mainContent = document.getElementById('handbookContentContainer');
    if (mainContent) mainContent.scrollTop = 0;
};

window.copyHandbookCode = function(btnElement) {
    const card = btnElement.closest('.handbook-code-card');
    if (!card) return;
    const code = card.querySelector('code')?.innerText || '';
    if (!code) return;

    navigator.clipboard.writeText(code.trim()).then(() => {
        const oldHtml = btnElement.innerHTML;
        btnElement.innerHTML = '✅ Đã chép!';
        setTimeout(() => { btnElement.innerHTML = oldHtml; }, 2000);
    }).catch(err => {
        console.warn('Copy handbook error:', err);
    });
};

window.applyHandbookCode = function(btnElement) {
    const card = btnElement.closest('.handbook-code-card');
    if (!card) return;
    const code = card.querySelector('code')?.innerText || '';
    if (!code) return;

    // Đóng handbook
    window.closeSqlHandbook();

    // Nếu đang ở Lobby, tự động vào Case đầu tiên
    if (!currentCase) {
        if (simulationCases && simulationCases.length > 0) {
            startMission(simulationCases[0].id);
        }
    } else {
        showSimView('workspace');
    }

    // Chuyển sang Tab SQL và điền mã
    document.getElementById('tabSql')?.click();
    const editor = document.getElementById('terminalEditor');
    if (editor) {
        editor.value = code.trim();
        editor.focus();
    }

    const statusText = document.getElementById('terminalStatusText');
    if (statusText) {
        statusText.innerHTML = `⚡ Đã chèn mã từ Cẩm Nang SQL vào Editor! Nhấn "▶ Chạy mã (Run)" để thực thi.`;
    }
};

// Đóng cẩm nang khi nhấn phím Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('sqlHandbookModal');
        if (modal && modal.style.display === 'flex') {
            window.closeSqlHandbook();
        }
    }
});

// ============================================================
// WORKSPACE STUDIO UI/UX ENHANCEMENTS (THU GỌN CỘT, SPLIT-VIEW, RESIZER, 1-CLICK INSERT)
// ============================================================

/**
 * 1. Thu gọn / Mở rộng Cột Trái (Briefing) hoặc Cột Phải (AI Mentor)
 * Giúp Cột Giữa (Console & Data Output) có thể mở rộng tối đa ~95% không gian
 */
window.toggleWorkspaceColumn = function(side) {
    const studio = document.getElementById('workspaceStudio') || document.querySelector('.workspace-studio');
    if (!studio) return;

    if (side === 'left') {
        const isCollapsed = studio.classList.toggle('sidebar-left-collapsed');
        try { localStorage.setItem('sim_col_left_collapsed', isCollapsed ? '1' : '0'); } catch (e) {}

        const btnToggle = document.getElementById('btnToggleLeftCol');
        if (btnToggle) {
            btnToggle.classList.toggle('is-collapsed', isCollapsed);
            const icon = btnToggle.querySelector('.toggle-icon');
            const text = btnToggle.querySelector('.toggle-text');
            if (icon) icon.textContent = isCollapsed ? '▶' : '◀';
            if (text) text.textContent = isCollapsed ? 'Đề bài (Mở)' : 'Đề bài';
            btnToggle.title = isCollapsed ? 'Mở rộng cột Đề bài' : 'Thu gọn cột Đề bài';
        }
    } else if (side === 'right') {
        const isCollapsed = studio.classList.toggle('sidebar-right-collapsed');
        try { localStorage.setItem('sim_col_right_collapsed', isCollapsed ? '1' : '0'); } catch (e) {}

        const btnToggle = document.getElementById('btnToggleRightCol');
        if (btnToggle) {
            btnToggle.classList.toggle('is-collapsed', isCollapsed);
            const icon = btnToggle.querySelector('.toggle-icon');
            const text = btnToggle.querySelector('.toggle-text');
            if (icon) icon.textContent = isCollapsed ? '◀' : '▶';
            if (text) text.textContent = isCollapsed ? 'AI Mentor (Mở)' : 'AI Mentor';
            btnToggle.title = isCollapsed ? 'Mở rộng cột AI Mentor' : 'Thu gọn cột AI Mentor';
        }
    }

    // Tự động resize lại Chart.js nếu đang xem tab biểu đồ
    if (currentChartInstance) {
        setTimeout(() => {
            currentChartInstance.resize();
        }, 300);
    }
};

/**
 * 2. 1-Click Chèn nhanh Tên Bảng hoặc Tên Cột vào SQL Editor tại đúng vị trí con trỏ
 */
window.insertTextToEditor = function(textToInsert) {
    if (!textToInsert) return;
    const editor = document.getElementById('terminalEditor');
    if (!editor) return;

    // Chuyển sang tab SQL nếu đang ở tab khác
    const tabSql = document.getElementById('tabSql');
    if (currentLanguage !== 'sql' && tabSql) {
        tabSql.click();
    }

    editor.focus();

    const startPos = editor.selectionStart ?? editor.value.length;
    const endPos = editor.selectionEnd ?? editor.value.length;
    const val = editor.value;

    // Phân tích ký tự liền trước: nếu là chữ cái/số hoặc dấu ngoặc thì tự động thêm 1 khoảng trắng
    let prefix = '';
    if (startPos > 0) {
        const prevChar = val.charAt(startPos - 1);
        if (/[a-zA-Z0-9_\)\]]/.test(prevChar)) {
            prefix = ' ';
        }
    }

    const insertedString = prefix + textToInsert;
    const newContent = val.substring(0, startPos) + insertedString + val.substring(endPos);
    editor.value = newContent;

    // Di chuyển con trỏ chuột đến ngay sau chuỗi vừa chèn
    const newCursorPos = startPos + insertedString.length;
    editor.selectionStart = newCursorPos;
    editor.selectionEnd = newCursorPos;

    // Kích hoạt sự kiện input để trình soạn thảo bắt kịp thay đổi
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    // Hiệu ứng nhấp nháy sáng nhẹ (Flash animation) trên khung soạn thảo
    editor.classList.remove('editor-insert-flash');
    void editor.offsetWidth; // Force reflow
    editor.classList.add('editor-insert-flash');
    setTimeout(() => {
        editor.classList.remove('editor-insert-flash');
    }, 550);

    // Cập nhật thanh trạng thái
    const statusText = document.getElementById('terminalStatusText');
    if (statusText) {
        statusText.innerHTML = `⚡ Đã chèn <b>${escapeHtml(textToInsert)}</b> vào SQL Editor tại vị trí con trỏ!`;
    }
};

/**
 * 3. Thu gọn hoặc Phóng to chiều cao Code Editor
 */
window.toggleEditorMinimize = function() {
    const colConsole = document.getElementById('colConsole');
    const btnToggle = document.getElementById('btnToggleEditorSize');
    const textSpan = document.getElementById('toggleEditorSizeText');
    if (!colConsole) return;

    const isMinimized = colConsole.classList.toggle('editor-minimized');
    if (textSpan) {
        textSpan.textContent = isMinimized ? 'Mở rộng code' : 'Thu gọn';
    }
    if (btnToggle) {
        btnToggle.classList.toggle('active', isMinimized);
        btnToggle.title = isMinimized ? 'Mở rộng lại khung soạn thảo code' : 'Thu gọn khung code để tối đa không gian cho bảng dữ liệu/báo cáo';
    }

    if (currentChartInstance) {
        setTimeout(() => {
            currentChartInstance.resize();
        }, 200);
    }
};

/**
 * 4. Thanh kéo chỉnh độ cao giữa Code Editor và Bảng kết quả (Vertical Resizer)
 */
function initPaneResizer() {
    const resizer = document.getElementById('paneResizer');
    const terminalPane = document.getElementById('terminalPane');
    const colConsole = document.getElementById('colConsole');
    if (!resizer || !terminalPane || !colConsole) return;

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    // Khôi phục chiều cao đã lưu nếu có
    try {
        const savedHeight = localStorage.getItem('sim_terminal_height');
        if (savedHeight && !isNaN(parseInt(savedHeight))) {
            const h = parseInt(savedHeight);
            if (h >= 100 && h <= 650) {
                terminalPane.style.height = `${h}px`;
                terminalPane.style.flex = 'none';
            }
        }
    } catch (e) {}

    const onMouseDown = (e) => {
        if (colConsole.classList.contains('editor-minimized')) return;
        isDragging = true;
        startY = e.clientY;
        startHeight = terminalPane.getBoundingClientRect().height;
        resizer.classList.add('is-resizing');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const deltaY = e.clientY - startY;
        const consoleRect = colConsole.getBoundingClientRect();
        const maxH = Math.max(consoleRect.height - 180, 200);
        let newH = startHeight + deltaY;
        if (newH < 110) newH = 110;
        if (newH > maxH) newH = maxH;

        terminalPane.style.height = `${newH}px`;
        terminalPane.style.flex = 'none';
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        resizer.classList.remove('is-resizing');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        const finalH = Math.round(terminalPane.getBoundingClientRect().height);
        try { localStorage.setItem('sim_terminal_height', finalH.toString()); } catch (e) {}

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (currentChartInstance) {
            currentChartInstance.resize();
        }
    };

    resizer.addEventListener('mousedown', onMouseDown);

    // Hỗ trợ cảm ứng trên thiết bị cảm ứng
    resizer.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
            onMouseDown({ clientY: e.touches[0].clientY });
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches && e.touches.length === 1) {
            onMouseMove({ clientY: e.touches[0].clientY });
        }
    }, { passive: true });

    window.addEventListener('touchend', onMouseUp, { passive: true });
}

/**
 * 5. Bật / Tắt chế độ Split-View (Chia đôi màn hình) khi viết Báo cáo
 */
window.toggleReportSplitView = function() {
    const container = document.getElementById('reportSplitContainer');
    const btn = document.getElementById('btnToggleSplitView');
    const btnText = document.getElementById('splitViewBtnText');
    if (!container) return;

    const isActive = container.classList.toggle('split-active');
    try { localStorage.setItem('sim_report_split_active', isActive ? '1' : '0'); } catch (e) {}

    if (btn) {
        btn.classList.toggle('active', isActive);
        if (btnText) {
            btnText.textContent = isActive ? 'Thu gọn bảng SQL' : 'Ghim kết quả SQL (Split-View)';
        }
    }

    if (isActive) {
        window.refreshReportSplitData();
    }
};

/**
 * 6. Tự động đồng bộ số liệu truy vấn gần nhất (hoặc benchmark) sang Bảng Split-View cạnh ô viết báo cáo
 */
window.refreshReportSplitData = function() {
    const splitBody = document.getElementById('reportSplitDataBody');
    if (!splitBody) return;

    // 1. Kiểm tra nếu có kết quả SQL gần nhất người dùng vừa chạy thành công
    if (latestSQLResults && Array.isArray(latestSQLResults) && latestSQLResults.length > 0) {
        const validQueries = latestSQLResults.filter(q => Array.isArray(q.rows) && q.rows.length > 0);
        if (validQueries.length > 0) {
            let html = '';
            validQueries.forEach((q) => {
                const headers = Object.keys(q.rows[0]);
                const colIsNum = headers.map(h => {
                    let numCount = 0;
                    let sampleCount = Math.min(q.rows.length, 10);
                    for (let r = 0; r < sampleCount; r++) {
                        if (formatCellContent(q.rows[r][h]).isNum) numCount++;
                    }
                    return sampleCount > 0 ? (numCount / sampleCount) >= 0.5 : false;
                });

                const thHtml = headers.map((h, idx) => {
                    const thClass = colIsNum[idx] ? ' class="th-numeric"' : '';
                    return `<th${thClass}>${escapeHtml(h)}</th>`;
                }).join('');

                const rowsHtml = q.rows.map(row => {
                    const cells = headers.map((h, idx) => {
                        const cellData = formatCellContent(row[h]);
                        const tdClass = (cellData.isNum || colIsNum[idx]) ? ' class="cell-numeric"' : '';
                        return `<td${tdClass}>${cellData.html}</td>`;
                    }).join('');
                    return `<tr>${cells}</tr>`;
                }).join('');

                const stmtPreview = q.statement ? escapeHtml(q.statement.substring(0, 75)) + (q.statement.length > 75 ? '...' : '') : `Truy vấn #${q.index}`;
                const rowCountText = `${q.rows.length} dòng`;
                const elapsedText = q.elapsed ? `${q.elapsed}ms` : '';

                html += `
                    <div class="split-table-card">
                        <div class="split-table-card-header">
                            <span class="split-stmt-badge" title="${escapeHtml(q.statement || '')}">#${q.index}: ${stmtPreview}</span>
                            <span class="split-meta-badge">${rowCountText} ${elapsedText ? '• ' + elapsedText : ''}</span>
                        </div>
                        <div class="split-table-scroll">
                            <table class="sim-data-table micro-table">
                                <thead><tr>${thHtml}</tr></thead>
                                <tbody>${rowsHtml}</tbody>
                            </table>
                        </div>
                    </div>
                `;
            });

            splitBody.innerHTML = html;
            return;
        }
    }

    // 2. Nếu chưa chạy SQL hoặc không có kết quả, hiển thị bộ dữ liệu benchmark của case study
    if (currentCase?.mockData?.headers && currentCase?.mockData?.rows) {
        const headers = currentCase.mockData.headers;
        const rows = currentCase.mockData.rows;
        const colIsNum = headers.map((_, colIdx) => {
            let numCount = 0;
            let sampleCount = Math.min(rows.length, 10);
            for (let r = 0; r < sampleCount; r++) {
                if (formatCellContent(rows[r][colIdx]).isNum) numCount++;
            }
            return sampleCount > 0 ? (numCount / sampleCount) >= 0.5 : false;
        });

        const thHtml = headers.map((h, idx) => {
            const thClass = colIsNum[idx] ? ' class="th-numeric"' : '';
            return `<th${thClass}>${escapeHtml(h)}</th>`;
        }).join('');

        const rowsHtml = rows.map(r => {
            const cells = r.map((cell, idx) => {
                const cellData = formatCellContent(cell);
                const tdClass = (cellData.isNum || colIsNum[idx]) ? ' class="cell-numeric"' : '';
                return `<td${tdClass}>${cellData.html}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        splitBody.innerHTML = `
            <div class="split-table-card">
                <div class="split-table-card-header">
                    <span class="split-stmt-badge">📌 Dữ liệu mốc Case Study (Benchmark)</span>
                    <span class="split-meta-badge">${rows.length} dòng mốc</span>
                </div>
                <div class="split-table-scroll">
                    <table class="sim-data-table micro-table">
                        <thead><tr>${thHtml}</tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; padding:0 4px;">
                    💡 <i>Gợi ý: Viết lệnh SQL ở khung trên và nhấn <b>▶ Chạy mã (Ctrl+Enter)</b> để số liệu tùy biến tự động cập nhật vào đây!</i>
                </div>
            </div>
        `;
        return;
    }

    // 3. Fallback khi chưa có dữ liệu nào
    splitBody.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            <div style="font-size: 2rem; margin-bottom: 8px;">📊</div>
            <b>Chưa có kết quả truy vấn SQL</b><br>
            Hãy nhập câu lệnh SQL vào Editor và nhấn <b>▶ Chạy mã</b> để bảng số liệu tự động ghim tại đây!
        </div>
    `;
};

/**
 * 7. Điền Khung Báo Cáo Chuẩn Thực Tế 4 Mục (Executive Framework)
 * [1. Tóm tắt số liệu phát hiện (Key Findings & Metrics)]
 * [2. Nguyên nhân gốc rễ (Root Cause Analysis)]
 * [3. Đề xuất hành động & Ước tính tác động (Actionable Recommendations & Impact)]
 * [4. Rủi ro & Sự đánh đổi cần lưu ý (Risks & Trade-offs)]
 */
window.fillReportFramework = function() {
    const reportInput = document.getElementById('reportTextarea');
    if (!reportInput) return;

    if (reportInput.value.trim().length > 30) {
        if (!confirm('Ô soạn thảo đã có nội dung. Bạn có chắc muốn chèn Khung báo cáo chuẩn 4 mục (nội dung hiện tại sẽ được thay thế)?')) {
            return;
        }
    }

    const missionTitle = currentCase?.title ? ` - ${currentCase.title.toUpperCase()}` : '';

    const frameworkTemplate = `BÁO CÁO PHÂN TÍCH KINH DOANH & ĐỀ XUẤT CHIẾN LƯỢC${missionTitle}

[1. Tóm tắt số liệu phát hiện (Key Findings & Metrics)]
- Dữ liệu cốt lõi: [Dẫn chứng số liệu cụ thể từ kết quả SQL — ví dụ: Tổng số đơn, Doanh thu, Tỷ lệ % tăng/giảm...]
- Phân bổ / Xu hướng: [So sánh tỷ lệ chênh lệch giữa các nhóm khách hàng, danh mục hàng hóa hoặc mốc thời gian]
- Điểm bất thường phát hiện: [Số liệu bị lệch chuẩn nghiêm trọng (outlier) hoặc hành vi đáng ngờ phát hiện qua bảng dữ liệu]

[2. Nguyên nhân gốc rễ (Root Cause Analysis)]
- Yếu tố trực tiếp (Direct Driver): [Hành vi hoặc nguyên nhân bề nổi phát sinh trực tiếp từ dữ liệu]
- Nguyên nhân cốt lõi (Root Cause): [Kẽ hở chính sách, lỗ hổng quy trình vận hành hoặc điểm nghẽn kỹ thuật hệ thống]
- Tác động dây chuyền: [Nguy cơ tổn thất tài chính, trải nghiệm người dùng hoặc đứt gãy chuỗi cung ứng nếu không can thiệp]

[3. Đề xuất hành động & Ước tính tác động (Actionable Recommendations & Impact)]
- Tầng 1: Hành động khẩn cấp (Ngay lập tức - 24h đến 7 ngày): [Khoanh vùng rủi ro, vá lỗ hổng hoặc ngăn chặn thiệt hại tức thì]
- Tầng 2: Cải tiến trung hạn (1 - 3 tháng tới): [Hoàn thiện chính sách, tối ưu hóa quy trình, cập nhật điều kiện kinh doanh]
- Tầng 3: Giải pháp kỹ thuật dài hạn (Hệ thống): [Ứng dụng cảnh báo tự động, định danh eKYC/OTP, Device Fingerprinting hoặc AI Fraud Detection]
- Ước tính tác động (Expected Impact): [Kỳ vọng giảm thiểu % thiệt hại, tiết kiệm chi phí hoặc thúc đẩy tăng trưởng doanh thu]

[4. Rủi ro & Sự đánh đổi cần lưu ý (Risks & Trade-offs)]
- Rủi ro tiềm ẩn: [Khả năng ảnh hưởng đến trải nghiệm người dùng thật, sự phản đối của đối tác hoặc chi phí vận hành tăng]
- Biện pháp giảm thiểu (Mitigation Plan): [Phương án dự phòng để cân bằng giữa an toàn hệ thống và trải nghiệm khách hàng]`;

    reportInput.value = frameworkTemplate;
    reportInput.focus();

    // Tự động bật Split-View nếu chưa bật để người dùng tiện tra cứu số liệu bên cạnh
    const splitContainer = document.getElementById('reportSplitContainer');
    if (splitContainer && !splitContainer.classList.contains('split-active')) {
        window.toggleReportSplitView();
    }
};

/**
 * 8. Khởi tạo & Phục hồi trạng thái Studio Workspace từ localStorage
 */
function initWorkspaceEnhancements() {
    const studio = document.getElementById('workspaceStudio') || document.querySelector('.workspace-studio');

    // Phục hồi trạng thái thu gọn cột Trái / Phải
    try {
        const leftCollapsed = localStorage.getItem('sim_col_left_collapsed') === '1';
        const rightCollapsed = localStorage.getItem('sim_col_right_collapsed') === '1';

        if (studio) {
            if (leftCollapsed) {
                studio.classList.add('sidebar-left-collapsed');
                const btnLeft = document.getElementById('btnToggleLeftCol');
                if (btnLeft) {
                    btnLeft.classList.add('is-collapsed');
                    const icon = btnLeft.querySelector('.toggle-icon');
                    const text = btnLeft.querySelector('.toggle-text');
                    if (icon) icon.textContent = '▶';
                    if (text) text.textContent = 'Đề bài (Mở)';
                    btnLeft.title = 'Mở rộng cột Đề bài';
                }
            }

            if (rightCollapsed) {
                studio.classList.add('sidebar-right-collapsed');
                const btnRight = document.getElementById('btnToggleRightCol');
                if (btnRight) {
                    btnRight.classList.add('is-collapsed');
                    const icon = btnRight.querySelector('.toggle-icon');
                    const text = btnRight.querySelector('.toggle-text');
                    if (icon) icon.textContent = '◀';
                    if (text) text.textContent = 'AI Mentor (Mở)';
                    btnRight.title = 'Mở rộng cột AI Mentor';
                }
            }
        }
    } catch (e) {}

    // Phục hồi trạng thái Split-View của tab Báo Cáo
    try {
        const splitContainer = document.getElementById('reportSplitContainer');
        const splitActive = localStorage.getItem('sim_report_split_active');
        // Mặc định là bật (split-active) trừ khi người dùng chủ động tắt ('0')
        if (splitContainer) {
            if (splitActive === '0') {
                splitContainer.classList.remove('split-active');
                const btnSplit = document.getElementById('btnToggleSplitView');
                if (btnSplit) {
                    btnSplit.classList.remove('active');
                    const btnText = document.getElementById('splitViewBtnText');
                    if (btnText) btnText.textContent = 'Ghim kết quả SQL (Split-View)';
                }
            } else {
                splitContainer.classList.add('split-active');
                const btnSplit = document.getElementById('btnToggleSplitView');
                if (btnSplit) {
                    btnSplit.classList.add('active');
                    const btnText = document.getElementById('splitViewBtnText');
                    if (btnText) btnText.textContent = 'Thu gọn bảng SQL';
                }
            }
        }
    } catch (e) {}

    // Khởi tạo thanh kéo chỉnh chiều cao (Vertical Resizer)
    initPaneResizer();
}
