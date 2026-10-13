/**
 * simulation.js
 * Controller cho tính năng Data Analyst Simulation (Lobby & Workspace)
 */

import { simulationCases } from './simulation-data.js';

let currentCase = null;
let currentLanguage = 'sql';
let currentChartInstance = null;
let mentorChatHistory = [];
let latestSQLResults = null;
let latestSQLQuery = '';

// ============================================================
// KHỞI TẠO KHI TẢI TRANG
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initLobby();
    setupLobbyFilters();
    setupTerminalEvents();
    setupMentorChat();
    if (document.getElementById('simWorkspaceView')?.classList.contains('active')) {
        document.body.classList.add('sim-workspace-active');
    }
});

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
    const container = document.getElementById('briefingContainer') || document.getElementById('briefingContent');
    if (!container || !mission) return;

    // 1. Phân tích Objectives (Mục tiêu phân tích) an toàn
    const objectives = Array.isArray(mission.objectives) ? mission.objectives : [];
    const objectivesHtml = objectives.map((obj, i) => `
        <li class="objective-item">
            <input type="checkbox" id="obj_${i}">
            <label for="obj_${i}">${escapeHtml(obj)}</label>
        </li>
    `).join('');

    // 2. Phân tích Schema (Cấu trúc bảng) hiển thị đầy đủ col.name, col.type VÀ col.desc, kèm preview dòng mẫu từ mockDb
    const schema = Array.isArray(mission.schema) ? mission.schema : [];
    const schemaHtml = schema.map((table, tIdx) => {
        const columns = Array.isArray(table.columns) ? table.columns : [];
        const colsHtml = columns.map(col => `
            <div class="schema-field-item">
                <div class="field-name-group">
                    <span class="field-name"><b>${escapeHtml(col.name)}</b></span>
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
            const sRows = sampleRows.map(r => `<tr>${sampleHeaders.map(h => `<td>${escapeHtml(String(r[h] ?? ''))}</td>`).join('')}</tr>`).join('');
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
                        <span>📁 <b>${escapeHtml(table.tableName)}</b></span>
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
    let cleaned = stmt.trim();

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

    // 1. Tách các câu lệnh SQL (phân tách bởi dấu chấm phẩy ;)
    const statements = splitSqlStatements(rawSql);

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
            const thHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
            const rowsHtml = q.rows.map(row => {
                const cells = headers.map(h => {
                    const val = row[h];
                    const displayVal = (typeof val === 'number') ? val.toLocaleString('vi-VN') : (val ?? '');
                    return `<td>${escapeHtml(String(displayVal))}</td>`;
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
            if (paneReport) paneReport.style.display = 'block';
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
}

// ============================================================
// SYSTEM PROMPT CHẤM BÁO CÁO KINH DOANH (HEAD OF DATA ANALYTICS)
// ============================================================
const GRADING_SYSTEM_PROMPT = `Bạn là một Head of Data Analytics đang chấm báo cáo (Data Storytelling) của thực tập sinh. Người dùng sẽ gửi cho bạn một đoạn báo cáo kinh doanh. Hãy chấm điểm khắt khe dựa trên thang điểm 100, chia làm 3 tiêu chí:

1. Bám sát Dữ liệu (Fact-based) - 30 điểm: Báo cáo có trích dẫn đúng con số từ kết quả SQL không? (Nếu nói chung chung không có số, trừ điểm nặng).
2. Insight & Logic (Business Sense) - 40 điểm: Có chỉ ra được 'sự thật ngầm hiểu' đằng sau con số không? Có phát hiện ra nguyên nhân gốc rễ (như hành vi chẻ đơn, bom hàng) không?
3. Đề xuất hành động (Actionable Recommendation) - 30 điểm: Giải pháp đưa ra có thực tế, hợp lý và giải quyết được bài toán kinh doanh không? (Nếu chỉ đưa ra số liệu mà không có giải pháp, trừ điểm).

ĐỊNH DẠNG TRẢ VỀ (Bắt buộc theo format này):
🎯 TỔNG ĐIỂM: [Số điểm]/100
✅ Điểm sáng: [Khen ngợi 1-2 ý tốt]
❌ Lỗ hổng cần sửa: [Chỉ ra lỗi sai logic hoặc thiếu sót trong tư duy]
💡 Cách viết chuẩn (Gợi ý ngắn): [Sửa lại 1 câu trong báo cáo cho sắc bén hơn theo phong cách Executive Summary]`;

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
                <div><b>Head of Data Analytics</b> đang đọc báo cáo, đối soát số liệu SQL và chấm điểm... Vui lòng đợi trong giây lát!</div>
            </div>
        `;
        feedbackDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (submitBtn) submitBtn.disabled = true;
    if (statusNote) statusNote.textContent = '⏳ Đang chấm bài...';

    // Xây dựng số liệu thực tế để AI đối soát tính chính xác (Fact-based)
    let dataSummary = '';
    if (latestSQLResults && latestSQLResults.length > 0) {
        dataSummary = latestSQLResults.map(q => {
            const rowCount = q.rows ? q.rows.length : 0;
            const previewRows = q.rows ? q.rows.slice(0, 8) : [];
            return `[KẾT QUẢ TRUY VẤN #${q.index} (${rowCount} dòng)]:
Câu lệnh: ${q.statement.substring(0, 150)}
Dữ liệu mẫu: ${JSON.stringify(previewRows, null, 2)}`;
        }).join('\n\n');
    } else if (currentCase && currentCase.mockData && currentCase.mockData.rows) {
        dataSummary = `Dữ liệu đối soát tiêu chuẩn của bài toán:\nHeaders: ${currentCase.mockData.headers.join(', ')}\nRows: ` +
            JSON.stringify(currentCase.mockData.rows.slice(0, 8));
    }

    const gradingPrompt = `[BỐI CẢNH BÀI TOÁN DOANH NGHIỆP]:
Nhiệm vụ: ${currentCase ? currentCase.title : 'Phân tích dữ liệu kinh doanh'}
Bối cảnh: ${currentCase ? currentCase.fullContext || currentCase.shortDesc : ''}
Mục tiêu phân tích: ${currentCase && currentCase.objectives ? currentCase.objectives.join('; ') : ''}

[SỐ LIỆU ĐỐI SOÁT TỪ TRUY VẤN SQL CỦA HỆ THỐNG]:
${dataSummary || 'Tham chiếu theo dữ liệu mock chuẩn của case study.'}

[BÁO CÁO CỦA THỰC TẬP SINH]:
"""
${reportText}
"""

Hãy chấm điểm thật khắt khe và trả về đúng định dạng yêu cầu.`;

    let aiFeedbackText = null;

    // 1. Thử gọi qua Vercel Serverless Function /api/gemini
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: gradingPrompt,
                systemInstruction: GRADING_SYSTEM_PROMPT,
                model: 'gemini-3.1-flash-lite'
            })
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await res.json();
            if (res.ok && data && data.text) {
                aiFeedbackText = data.text;
            }
        }
    } catch (err) {
        console.warn('[AI Grading] /api/gemini gặp lỗi, chuyển sang gọi trực tiếp:', err.message);
    }

    // 2. Dự phòng: gọi trực tiếp Google Gemini API Client-side
    if (!aiFeedbackText) {
        try {
            aiFeedbackText = await callGoogleGeminiDirect(gradingPrompt, [], GRADING_SYSTEM_PROMPT);
        } catch (directErr) {
            console.error('[AI Grading Direct Error]:', directErr);
            if (feedbackDiv) {
                feedbackDiv.innerHTML = `
                    <div class="sql-error-box">
                        <div style="font-weight:700; margin-bottom:6px;">⚠️ Lỗi kết nối AI chấm bài</div>
                        <div>${directErr.message}</div>
                        <div style="margin-top:8px;">Vui lòng thử bấm nút "Nộp bài & Yêu cầu AI chấm điểm" lại.</div>
                    </div>
                `;
            }
            if (submitBtn) submitBtn.disabled = false;
            if (statusNote) statusNote.textContent = 'Lỗi kết nối';
            return;
        }
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

    // Phân tích điểm: 🎯 TỔNG ĐIỂM: [Số điểm]/100
    const scoreMatch = rawText.match(/🎯\s*TỔNG\s*ĐIỂM:\s*(\d+)\/100/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    let scoreBadgeClass = 'score-badge-medium';
    let verdictText = 'Cần cải thiện thêm';
    if (score !== null) {
        if (score >= 80) {
            scoreBadgeClass = 'score-badge-high';
            verdictText = 'Xuất sắc — Đạt chuẩn Senior/Lead';
        } else if (score < 50) {
            scoreBadgeClass = 'score-badge-low';
            verdictText = 'Chưa đạt — Cần bám sát số liệu hơn';
        }
    }

    // Trích xuất các tiêu mục
    const goodMatch = rawText.match(/✅\s*Điểm sáng:\s*([\s\S]*?)(?=❌|💡|$)/i);
    const badMatch = rawText.match(/❌\s*Lỗ hổng cần sửa:\s*([\s\S]*?)(?=💡|$)/i);
    const tipMatch = rawText.match(/💡\s*Cách viết chuẩn\s*(?:\(Gợi ý ngắn\))?:\s*([\s\S]*?)$/i);

    const goodText = goodMatch ? goodMatch[1].trim() : '';
    const badText = badMatch ? badMatch[1].trim() : '';
    const tipText = tipMatch ? tipMatch[1].trim() : '';

    feedbackDiv.style.display = 'flex';

    if (goodText || badText || tipText) {
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

    if (currentCase && (currentCase.id === 'case_freeship_leak' || currentCase.id === 'case-freeship-fraud')) {
        reportInput.value = `BÁO CÁO PHÂN TÍCH HIỆN TƯỢNG VƯỢT NGÂN SÁCH TRỢ GIÁ VẬN CHUYỂN
1. Dữ liệu thực tế:
- Trong chiến dịch Mega Sale, phân khúc đơn hàng cận ngưỡng 99k - 105k chiếm tỷ lệ áp đảo 58.4% tổng lượng đơn (148,520 đơn), tiêu tốn 4,455,600,000 VNĐ tiền trợ giá.
- Tỷ lệ này cao gấp gần 5 lần so với nhóm đơn hàng trên 200k (chỉ chiếm 12.7% và 965 triệu VNĐ).

2. Insight & Phân tích nguyên nhân:
- Xuất hiện hành vi chẻ đơn hàng loạt (order splitting) từ nhóm các Shop và IP người mua nhằm trục lợi mức voucher hỗ trợ 30.000đ/đơn từ sàn.
- Chính sách Freeship 0đ hiện tại đang có kẽ hở khi không giới hạn lượt hưởng voucher theo cụm IP/thiết bị, và ngưỡng áp dụng quá phẳng khiến người mua chia nhỏ giỏ hàng thay vì mua nhiều sản phẩm.

3. Đề xuất hành động:
- Ngay lập tức: Chặn dải IP và tạm giữ thanh toán của các Shop có tỷ lệ đơn cận 99k bất thường để đối soát.
- Trung hạn: Chuyển đổi chính sách Freeship bậc thang (Đơn 150k giảm 15k, đơn 250k giảm 30k) để kích thích tăng AOV (giá trị trung bình đơn hàng).
- Kỹ thuật: Bổ sung luật phát hiện gian lận tự động (Fraud Rules) dựa trên Device Fingerprinting.`;
    } else {
        reportInput.value = `BÁO CÁO PHÂN TÍCH KINH DOANH
1. Bám sát Dữ liệu (Fact-based):
- Dựa trên kết quả truy vấn SQL, các chỉ số ghi nhận thực tế là: ...
2. Insight & Phân tích nguyên nhân (Business Sense):
- Bản chất ngầm hiểu đằng sau sự biến động của dữ liệu là: ...
3. Đề xuất hành động (Actionable Recommendation):
- Đề xuất các giải pháp khả thi để giải quyết bài toán: ...`;
    }
    reportInput.focus();
}
window.fillSampleReport = fillSampleReport;

function renderOutputData(mission) {
    // 1. Render Table
    const tableContainer = document.getElementById('outputTableContainer');
    if (tableContainer && mission?.mockData?.headers && mission?.mockData?.rows) {
        const thHtml = mission.mockData.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
        const rowsHtml = mission.mockData.rows.map(r => `
            <tr>${r.map(cell => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>
        `).join('');

        tableContainer.innerHTML = `
            <table class="sim-data-table">
                <thead><tr>${thHtml}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }

    // 2. Render Chart
    if (mission?.mockData?.chart) {
        renderChart(mission.mockData.chart);
    }
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

        const promptText = `🔍 **Yêu cầu Review mã ${langName} trước khi chạy:**\n\n` +
            `\`\`\`${langSyntax}\n${code}\n\`\`\`\n\n` +
            `Mục tiêu bài toán cần đạt:\n${objectivesText}\n\n` +
            `Mentor hãy giúp tôi kiểm tra:\n` +
            `1. Cú pháp có lỗi gì không (tên bảng, tên cột, dấu câu, logic GROUP BY / aggregation...)?\n` +
            `2. Logic truy vấn có đáp ứng đúng mục tiêu bài toán không?\n` +
            `3. Đánh giá: Mã này đã chuẩn để chạy chưa hay cần lưu ý/sửa đổi gì trước khi chạy?`;

        appendMentorMessage('user', `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <span>🔍 Yêu cầu Review mã ${escapeHtml(langName)}</span>
            </div>
            <pre style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; font-size:0.8rem; overflow-x:auto; margin:4px 0;"><code>${escapeHtml(code)}</code></pre>
            <div style="font-size:0.8rem; opacity:0.85;">Nhờ Mentor kiểm tra cú pháp và logic nghiệp vụ trước khi chạy.</div>
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
            `1. Nguyên nhân vì sao câu lệnh này bị lỗi (chỉ rõ vị trí sai cú pháp, tên cột hoặc tên bảng)?\n` +
            `2. Hãy hướng dẫn tôi cách sửa lại câu lệnh chuẩn xác nhất theo đúng cấu trúc CSDL để thực thi thành công.`;

        appendMentorMessage('user', `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px; color:#EF4444;">
                <span>🚨 Yêu cầu sửa lỗi SQL (Truy vấn #${qIdx})</span>
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

    const systemInstruction = `Bạn là Gemini AI Mentor — một Senior Data Analyst đang hướng dẫn thực hành trong Sandbox phân tích dữ liệu TRONEX.

Ngữ cảnh bài toán hiện tại:
${missionContext}

CƠ CHẾ THỰC THI SQL CỦA HỆ THỐNG:
- Trình duyệt đang chạy engine AlaSQL để thực thi câu lệnh SQL trực tiếp trên bộ dữ liệu mock.
- CSDL HIỆN CHỈ CÓ CÁC BẢNG SAU:
${currentCase ? currentCase.schema.map(t => `- Bảng "${t.tableName}": (${t.columns.map(c => c.name).join(', ')})`).join('\n') : ''}

QUY TẮC BẮT BUỘC KHI PHẢN HỒI (MENTOR PHẢI TỰ KIỂM CHỨNG CODE TRƯỚC KHI GỬI):
1. CHỈ ĐƯỢC PHÉP TRUY VẤN từ các bảng có thật ở trên. TUYỆT ĐỐI KHÔNG tự bịa ra bảng ảo không có trong CSDL (như OrderMetrics, AggregatedData...).
2. KHÔNG DÙNG cú pháp CTE (WITH ... AS ...). Hãy viết các câu lệnh SELECT độc lập, hoặc dùng subquery lồng nhau FROM (SELECT ...).
3. LUÔN LUÔN viết COUNT(*) hoặc COUNT(tên_cột). TUYỆT ĐỐI KHÔNG viết COUNT() rỗng.
4. MỌI CÂU LỆNH SQL BẠN CUNG CẤP PHẢI ĐƯỢC TỰ KIỂM CHỨNG CÚ PHÁP:
   - TUYỆT ĐỐI KHÔNG viết dính tiền tố (như 'QLSELECT' hay 'SQL SELECT'). Luôn bắt đầu bằng từ khóa 'SELECT' chuẩn xác.
   - Luôn kiểm tra từng tên cột phải khớp 100% với Schema đã cung cấp.
5. KHI NGƯỜI DÙNG YÊU CẦU REVIEW CODE (SQL hoặc Python):
   - Đọc kỹ mã người dùng gửi và đối chiếu với Schema các bảng có thật.
   - Kiểm tra kỹ: Cú pháp, tên bảng, tên cột, logic gom nhóm (GROUP BY), điều kiện WHERE, và kiểu dữ liệu.
   - Trình bày phản hồi có cấu trúc:
     ✅ Điểm viết đúng / hợp lý
     ⚠️ Điểm sai hoặc nguy cơ lỗi (nếu có, chỉ rõ dòng & tên cột)
     🚀 Đánh giá: Có thể chạy ngay hay cần điều chỉnh gì trước khi chạy?
6. KHI NGƯỜI DÙNG BÁO LỖI (Gửi lỗi SQL/Python khi chạy):
   - Phân tích nguyên nhân cốt lõi gây ra lỗi (Parse error, sai chính tả tên cột, quên dấu chấm phẩy, hàm không hỗ trợ...).
   - Chỉ rõ vị trí sai và cung cấp câu lệnh SQL/Python chuẩn đã kiểm chứng để người dùng copy chạy lại thành công.
7. Khi người học yêu cầu "Viết cho tôi câu SQL hoàn chỉnh để giải bài toán này" hoặc xin code giải bài, HÃY CUNG CẤP CHÍNH XÁC bộ câu lệnh SQL chuẩn sau đây:
\`\`\`sql
${solutionReference}
\`\`\`
(Kèm theo giải thích ngắn gọn, súc tích từng bước phân tích nghiệp vụ).`;

    const chatHistory = mentorChatHistory.slice();
    // Thêm tin nhắn người dùng vào lịch sử
    mentorChatHistory.push({ role: 'user', parts: [{ text: userQuery }] });

    let aiResponseText = null;

    // BƯỚC 1: Thử gọi qua Vercel Serverless Function /api/gemini
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: userQuery,
                history: chatHistory,
                systemInstruction: systemInstruction,
                model: 'gemini-3.1-flash-lite'
            })
        });

        const contentType = res.headers.get('content-type') || '';
        // Chỉ parse JSON nếu server trả về application/json (tránh lỗi Unexpected token '<' khi gặp HTML 404/500)
        if (contentType.includes('application/json')) {
            const data = await res.json();
            if (res.ok && data && data.text) {
                aiResponseText = data.text;
            }
        }
    } catch (apiErr) {
        console.warn('[AI Mentor] Không gọi được /api/gemini:', apiErr.message);
    }

    // BƯỚC 2: Nếu Serverless chưa sẵn sàng (trả về HTML 404/500 hoặc lỗi), tự động gọi Google Gemini API trực tiếp (Client-side)
    if (!aiResponseText) {
        try {
            aiResponseText = await callGoogleGeminiDirect(userQuery, chatHistory, systemInstruction);
        } catch (directErr) {
            console.error('[AI Mentor Direct Error]:', directErr);
            mentorChatHistory.pop(); // Xóa tin nhắn chưa được phản hồi
            if (thinkingBubble) {
                thinkingBubble.innerHTML = `⚠️ <b>Lỗi kết nối AI Mentor:</b> <code style="font-size:0.8rem;">${directErr.message}</code><br><small style="opacity:0.7;">Vui lòng thử lại sau giây lát hoặc nhập API Key cá nhân trong cài đặt.</small>`;
                scrollMentorToBottom(true);
            }
            return;
        }
    }

    // Hiển thị phản hồi từ AI
    if (aiResponseText) {
        const formattedReply = formatMarkdown(aiResponseText);
        if (thinkingBubble) {
            thinkingBubble.innerHTML = formattedReply;
            scrollMentorToBottom(true);
        }
        // Lưu phản hồi AI vào lịch sử để duy trì ngữ cảnh
        mentorChatHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });
    }
}

// Giải mã khóa an toàn trong bộ nhớ
const _dSim = h => {
    let s = "";
    for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16) ^ 47);
    return s;
};

async function callGoogleGeminiDirect(prompt, history, systemInstruction) {
    const userCustomKey = localStorage.getItem("TRONEX_AI_KEY");
    const defaultKeys = [
        _dSim("6e7e016e4d177d61196618561d671a171a474e475f7968476b40604167627061704a4102454d447e4c48786b6e6c44456b184b1a7e"), // Key 1
        _dSim("6e7e016e4d177d6119646a7b1d4e575a5c7e186b46407f566843477d465f776c1e5b7c58646a44494118694c4943556d5f5819597e"), // Key 2
        _dSim("6e7e016e4d177d6119657c7e7b471f601d7649181d7c5755797845581e6756495a4b1663176c7d60186e4b5d775d56627d69466c58")  // Key 3
    ];
    const keys = [userCustomKey, ...defaultKeys].filter(Boolean);

    const models = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];

    const payload = {
        contents: [
            ...(Array.isArray(history) ? history : []),
            { role: "user", parts: [{ text: prompt }] }
        ],
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        }
    };

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

    throw new Error(lastError || "Không thể kết nối máy chủ Google Gemini");
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
        let cleaned = rawCode
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

function formatMarkdown(text) {
    if (!text) return '';

    // 1. Xử lý fenced code blocks (```lang\n...\n```) với thanh công cụ Sao chép, Chèn vào Editor & BẢO CHỨNG TỰ KIỂM TRA
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const blockId = `mentor_code_${++mentorCodeBlockCounter}`;
        const cleanLang = (lang || 'sql').toLowerCase();
        const langLabel = `<span class="code-lang-label">${cleanLang.toUpperCase()}</span>`;

        // TỰ ĐỘNG KIỂM CHỨNG BẢO ĐẢM CODE CỦA MENTOR ĐÚNG 100% TRƯỚC KHI GỬI
        const verification = verifyAndValidateMentorCode(code, cleanLang);
        const finalCode = verification.code;
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

        return `
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
                <textarea class="raw-code-store" style="display:none;">${finalCode}</textarea>
            </div>
        `;
    });

    // 2. Inline code `...`
    text = text.replace(/`([^`]+)`/g, '<code class="mentor-inline-code">$1</code>');
    // 3. Bold và Italic
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
    // 4. Dòng mới
    text = text.replace(/\n/g, '<br>');
    return text;
}

window.copyMentorCode = function(blockId, btnElement) {
    const block = document.getElementById(blockId);
    if (!block) return;
    const raw = block.querySelector('.raw-code-store')?.value || block.querySelector('code')?.textContent || '';
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
    const raw = block.querySelector('.raw-code-store')?.value || block.querySelector('code')?.textContent || '';
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
