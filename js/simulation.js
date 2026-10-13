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
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        workspace?.classList.remove('active');
        lobby?.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const container = document.getElementById('briefingContainer');
    if (!container) return;

    const objectivesHtml = mission.objectives.map((obj, i) => `
        <li class="objective-item">
            <input type="checkbox" id="obj_${i}">
            <label for="obj_${i}">${obj}</label>
        </li>
    `).join('');

    const schemaHtml = mission.schema.map(table => `
        <div class="schema-block">
            <div class="schema-header">
                <span>📁 ${table.tableName}</span>
                <span style="font-size:0.75rem;opacity:0.8;">${table.description}</span>
            </div>
            <div class="schema-table-fields">
                ${table.columns.map(col => `
                    <div class="schema-field-item">
                        <span>${col.name}</span>
                        <span class="field-type">${col.type}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    const hintsHtml = mission.hints.map(h => `<li>${h}</li>`).join('');

    container.innerHTML = `
        <div>
            <div class="briefing-section-title">📋 Bối Cảnh Bài Toán</div>
            <div class="briefing-context-box">
                ${mission.fullContext}
            </div>
        </div>

        <div>
            <div class="briefing-section-title">🎯 Mục Tiêu Phân Tích</div>
            <ul class="objectives-list">
                ${objectivesHtml}
            </ul>
        </div>

        <div>
            <div class="briefing-section-title">🗄️ Cấu Trúc Bảng Dữ Liệu</div>
            ${schemaHtml}
        </div>

        <div>
            <div class="briefing-section-title">💡 Gợi Ý Tư Duy Logic</div>
            <ul style="padding-left: 20px; font-size: 0.88rem; line-height: 1.6; color: var(--text-muted);">
                ${hintsHtml}
            </ul>
        </div>
    `;
}

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

function runSQLWithAlaSQL(sqlQuery) {
    const tableContainer = document.getElementById('outputTableContainer');
    const statusText = document.getElementById('terminalStatusText');
    const paneTable = document.getElementById('outputTablePane');
    const paneChart = document.getElementById('outputChartPane');

    if (typeof alasql === 'undefined') {
        if (tableContainer) tableContainer.innerHTML = `<div class="sql-error-box">⚠️ AlaSQL chưa được tải. Kiểm tra kết nối mạng và thử lại.</div>`;
        return;
    }

    const t0 = performance.now();
    let results, errMsg = null;

    try {
        results = alasql(sqlQuery);
    } catch (err) {
        errMsg = err.message;
    }

    const elapsed = Math.round(performance.now() - t0);

    // Chuyển sang tab Table
    if (paneTable) paneTable.style.display = 'block';
    if (paneChart) paneChart.style.display = 'none';
    document.getElementById('outputTabTable')?.classList.add('active');
    document.getElementById('outputTabChart')?.classList.remove('active');

    if (errMsg) {
        if (statusText) statusText.textContent = `Lỗi SQL | ${errMsg.substring(0, 80)}`;
        if (tableContainer) {
            tableContainer.innerHTML = `
                <div class="sql-error-box">
                    <div style="font-weight:700; margin-bottom:6px;">⚠️ Lỗi SQL cú pháp</div>
                    <code style="font-size:0.82rem;">${errMsg}</code>
                    <div style="margin-top:8px; font-size:0.8rem; opacity:0.7;">Kiểm tra lại tên bảng, tên cột và cú pháp truy vấn.</div>
                </div>`;
        }
        return;
    }

    // Nếu kết quả là số (INSERT, UPDATE...)
    if (typeof results !== 'object' || results === null) {
        if (tableContainer) tableContainer.innerHTML = `<div class="sql-success-box">✅ Thực thi thành công. Kết quả: <b>${results}</b></div>`;
        if (statusText) statusText.textContent = `Hoàn tất trong ${elapsed}ms`;
        return;
    }

    const rows = Array.isArray(results) ? results : [results];
    latestSQLResults = rows;
    latestSQLQuery = sqlQuery;

    if (rows.length === 0) {
        if (tableContainer) tableContainer.innerHTML = `<div class="sql-empty-box">🔍 Truy vấn thực thi thành công nhưng không có dòng nào được trả về.</div>`;
        if (statusText) statusText.textContent = `Hoàn tất trong ${elapsed}ms | 0 dòng kết quả`;
        return;
    }

    // Lấy headers từ keys của object đầu tiên
    const headers = Object.keys(rows[0]);
    const thHtml = headers.map(h => `<th>${h}</th>`).join('');
    const rowsHtml = rows.map(row => `<tr>${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`).join('');

    if (tableContainer) {
        tableContainer.innerHTML = `
            <div style="padding: 8px 12px; font-size:0.78rem; color:var(--text-muted); border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between;">
                <span>⚡ AlaSQL Engine — Kết quả thật từ dữ liệu mock</span>
                <span><b>${rows.length}</b> dòng · ${elapsed}ms</span>
            </div>
            <table class="sim-data-table">
                <thead><tr>${thHtml}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;
    }
    if (statusText) statusText.textContent = `✅ Thực thi thành công trong ${elapsed}ms | Trả về ${rows.length} dòng kết quả`;
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
                // Python: hiển thị mock data như cũ (không thể chạy Python ở browser)
                renderOutputData(currentCase);
                if (statusText) statusText.textContent = `Python (Pandas) — Hiển thị kết quả mô phỏng | ${currentCase.mockData.rows.length} dòng`;
            }
            btnRun.innerHTML = '▶ Chạy mã (Run)';
            btnRun.disabled = false;
        }, 80);
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
        dataSummary = `Dữ liệu thực tế người dùng vừa truy vấn từ SQL (${latestSQLResults.length} dòng):\n` +
            JSON.stringify(latestSQLResults.slice(0, 10), null, 2);
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

    if (currentCase && currentCase.id === 'case-freeship-fraud') {
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
    if (tableContainer && mission.mockData) {
        const thHtml = mission.mockData.headers.map(h => `<th>${h}</th>`).join('');
        const rowsHtml = mission.mockData.rows.map(r => `
            <tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>
        `).join('');

        tableContainer.innerHTML = `
            <table class="sim-data-table">
                <thead><tr>${thHtml}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }

    // 2. Render Chart
    if (mission.mockData?.chart) {
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

    // Xây dựng System Instruction với ngữ cảnh nhiệm vụ
    const missionContext = currentCase
        ? `Nhiệm vụ: "${currentCase.title}"\nBối cảnh: ${currentCase.shortDesc}\nMục tiêu phân tích:\n${currentCase.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}\nCấu trúc bảng dữ liệu: ${currentCase.schema.map(t => t.tableName + '(' + t.columns.map(c => c.name).join(', ') + ')').join('; ')}`
        : 'Trợ lý Data Analysis tổng quát';

    const systemInstruction = `Bạn là Gemini AI Mentor — một Senior Data Analyst giàu kinh nghiệm đang hỗ trợ người học trong môi trường thực hành phân tích dữ liệu.

Ngữ cảnh bài toán hiện tại:
${missionContext}

Phong cách trả lời:
- Trả lời bằng tiếng Việt, chuyên nghiệp, thân thiện và khích lệ.
- Khi được hỏi về SQL hoặc Python, hãy cung cấp ví dụ code cụ thể, rõ ràng và giải thích từng bước.
- Khi giải thích kết quả dữ liệu, hãy gắn với bối cảnh nghiệp vụ thực tế.
- Sử dụng markdown (**, *, dấu gạch đầu dòng) để câu trả lời dễ đọc.
- Có thể đặt thêm câu hỏi gợi mở để người học tự suy nghĩ sâu hơn sau khi đã trả lời.`;

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
        _dSim("6e7e016e4d177d6119657c7e7b471f601d7649181d7c5755797845581e6756495a4b1663176c7d60186e4b5d775d56627d69466c58"), // Key 3
        _dSim("6e66554e7c566d417d675d444d7e587e691b1c417a69765a6a70444544481f5c641d676b6b467a"),
        _dSim("6e66554e7c566b63624070755775457e56697f567e774b4347571d1f1a684362607d1b1a7a6748")
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

function formatMarkdown(text) {
    // 1. Xử lý fenced code blocks (```lang\n...\n```) trước — đặt trong <pre><code>
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const langLabel = lang ? `<span class="code-lang-label">${lang.toUpperCase()}</span>` : '';
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div class="mentor-code-block">${langLabel}<pre><code>${escapedCode}</code></pre></div>`;
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
