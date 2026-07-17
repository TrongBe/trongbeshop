import { mockQuizzes } from './data.js';
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getDatabase, ref, onValue, runTransaction, set, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAAEI9nMEMfUwbGbPHTyGRJ2dAfBRW7_Fo",
    authDomain: "hoctaptructuyen-7c09a.firebaseapp.com",
    projectId: "hoctaptructuyen-7c09a",
    storageBucket: "hoctaptructuyen-7c09a.firebasestorage.app",
    messagingSenderId: "329551572068",
    appId: "1:329551572068:web:41b7b3174ef45a77008371",
    measurementId: "G-F0DTTKEBHC",
    databaseURL: "https://hoctaptructuyen-7c09a-default-rtdb.firebaseio.com"
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (e) {
    console.warn("[TRONEX] Firebase Analytics không hỗ trợ hoặc bị chặn trong môi trường này:", e.message);
}
const dbRT = getDatabase(app);

// === TRẠNG THÁI (STATE) ===
let currentQuiz = null;
let userAnswers = {};
let quizTimerInterval = null;
let quizStartTime = null;

const isVACTPage = window.location.pathname.toLowerCase().includes('v-act.html');
const FIREBASE_ROOT = isVACTPage ? 'VACT' : 'public_quizzes';
const LOCAL_STORAGE_KEY = isVACTPage ? 'trongbeshop_vact_quizzes' : 'trongbeshop_custom_quizzes';
const isAdmin = localStorage.getItem("admin_secret_key") === "trongbeshop";


if (isVACTPage) {
    // Chỉ giữ lại DUY NHẤT đề 1 ĐGNL của TRONEX (v68: Strict Mode)
    const vactQuizzes = mockQuizzes.filter(q => q.id === 'de_1_dgnl');
    mockQuizzes.length = 0;
    mockQuizzes.push(...vactQuizzes);

    // v69: Backup de_1_dgnl từ data.js vào window để khôi phục nếu Firebase sync gây lỗi
    const originalDe1 = vactQuizzes.find(q => q.id === 'de_1_dgnl');
    if (originalDe1) {
        window.__de1Backup = JSON.parse(JSON.stringify(originalDe1)); // deep copy
    }
} else {
    // Ở trang chủ, ẩn các đề của TRONEX
    const homeQuizzes = mockQuizzes.filter(q => !q.id.startsWith('de_1_dgnl') && !q.id.startsWith('vact_'));
    mockQuizzes.length = 0;
    mockQuizzes.push(...homeQuizzes);
}

// === HELPER: Đệ quy chuyển Firebase Object-Array về Array thực (v70) ===
// Firebase Realtime DB không hỗ trợ Array, lưu thành {"0":{...},"1":{...},...}
// Hàm này tự phát hiện và convert ngược lại, kể cả nested (subQuestions, options...)
function convertFirebaseData(val) {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(convertFirebaseData);

    const keys = Object.keys(val);
    // Phát hiện array giả: tất cả keys đều là số nguyên
    const isArrayLike = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
    if (isArrayLike) {
        const maxIdx = Math.max(...keys.map(Number));
        const arr = new Array(maxIdx + 1).fill(null);
        for (const k of keys) arr[parseInt(k)] = convertFirebaseData(val[k]);
        return arr;
    }

    // Object thông thường - đệ quy từng field
    const result = {};
    for (const key of keys) result[key] = convertFirebaseData(val[key]);
    return result;
}
window.convertFirebaseData = convertFirebaseData;

// === LOAD ĐỀ TỰ TẠO TỪ localStorage (Fix Bug 2) ===
function loadCustomQuizzesFromStorage() {
    try {
        const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        const currentUser = window.__tronexCurrentUser;
        saved.forEach(quiz => {
            if (!quiz || !quiz.id) return;
            // Không thêm nếu đã có trong mảng
            if (!mockQuizzes.find(q => q && (q.id || '').toString() === (quiz.id || '').toString())) {
                // Nếu quiz riêng tư, chỉ hiện khi đúng chủ sở hữu
                if (quiz.privacy === 'private') {
                    const uid = currentUser?.uid || localStorage.getItem('tronex_uid');
                    if (!uid || quiz.createdBy?.uid !== uid) return;
                }
                mockQuizzes.unshift(quiz);
            }
        });
    } catch (e) { console.warn('[TRONEX] Không thể load đề từ localStorage:', e); }
}
window.loadCustomQuizzesFromStorage = loadCustomQuizzesFromStorage;

// Export ra window để tronex-ai.js truy cập (Fix Bug 1)
window.__mockQuizzes = mockQuizzes;


// === PHẦN TỬ DOM ===
const views = {
    list: document.getElementById('quizListView'),
    setup: document.getElementById('setupView'),
    active: document.getElementById('activeQuizView'),
    result: document.getElementById('resultView')
};

const quizListContainer = document.getElementById('quizList');
const questionsContainer = document.getElementById('questionsContainer');
const currentQuizTitle = document.getElementById('currentQuizTitle');
const quizForm = document.getElementById('quizForm');

// === HÀM CHUYỂN ĐỔI MÀN HÌNH ===
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showView = showView;

// === TẠO GIAO DIỆN DANH SÁCH ĐỀ ===
function initQuizList() {
    if (!quizListContainer) return;
    quizListContainer.innerHTML = '';

    // v46 Final: Tuyệt chiêu chống trùng đề - Lọc danh sách mockQuizzes theo ID duy nhất trước khi render
    const uniqueQuizzes = [];
    const seenIds = new Set();

    // Sắp xếp: ID gemini_ và manual_ mới tạo lên đầu
    const sortedQuizzes = [...mockQuizzes].sort((a, b) => {
        const aId = (a && a.id) ? a.id.toString() : '';
        const bId = (b && b.id) ? b.id.toString() : '';
        const aCustom = aId.startsWith('gemini_') || aId.startsWith('manual_');
        const bCustom = bId.startsWith('gemini_') || bId.startsWith('manual_');
        if (aCustom && !bCustom) return -1;
        if (!aCustom && bCustom) return 1;
        return 0;
    });

    sortedQuizzes.forEach(quiz => {
        if (!quiz || !quiz.id) return;
        const qId = quiz.id.toString().trim();
        if (!seenIds.has(qId)) {
            seenIds.add(qId);
            uniqueQuizzes.push(quiz);
        }
    });

    uniqueQuizzes.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'quiz-card';
        card.dataset.quizId = quiz.id; // for filter
        card.innerHTML = `
            <h3>${quiz.title}</h3>
            <p>${quiz.description}</p>
            ${quiz.createdBy ? `
                <div class="quiz-card-author">
                    <img src="${quiz.createdBy.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(quiz.createdBy.displayName || 'U')}&background=6366f1&color=fff&size=48`}" 
                         alt="${quiz.createdBy.displayName || ''}"
                         onerror="this.src='https://ui-avatars.com/api/?name=U&background=6366f1&color=fff&size=48'">
                    <span>${quiz.createdBy.displayName || 'Ẩn danh'}</span>
                </div>` : ''}
            <div class="tags-container" style="margin-bottom: 24px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                ${(quiz.privacy === 'public' || !quiz.privacy) ? '<span style="background:#10B981; color:white; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🌍 Công Khai</span>' : '<span style="background:#6366f1; color:white; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🔒 Riêng tư</span>'}
                <span class="quiz-meta">📚 Số câu: ${(quiz.questions || []).length}</span>
                <span class="quiz-views" id="views-${quiz.id}">Lượt truy cập: ${quiz.viewCount || 0}</span>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-primary" style="flex: 1;" onclick="startQuiz('${quiz.id}')">Bắt Đầu Làm Bài</button>
                ${isQuizOwner(quiz.id) ? `
                    <button class="btn btn-outline" style="padding: 12px; color: #3B82F6; border-color: #3B82F6;" onclick="editCustomQuiz('${quiz.id}')" title="Chỉnh sửa đề này">✏️</button>
                    <button class="btn btn-outline" style="padding: 12px; color: #EF4444; border-color: #EF4444;" onclick="deleteCustomQuiz('${quiz.id}')" title="Xóa đề này">🗑️</button>
                ` : ""}
            </div>
        `;
        quizListContainer.appendChild(card);
    });

    // Re-apply search/filter after list renders
    if (typeof window.filterQuizList === 'function') window.filterQuizList();
}
window.initQuizList = initQuizList;
window.__initQuizList = initQuizList; // alias for tronex-ai.js

function isQuizOwner(id) {
    if (!id) return false;
    if (localStorage.getItem("admin_secret_key") === "trongbeshop") return true;
    const targetId = id.toString().trim();
    // Kiểm tra cả gemini_ và manual_ prefix
    if (!targetId.startsWith('gemini_') && !targetId.startsWith('manual_')) return false;
    try {
        // Kiểm tra theo UID nếu đã đăng nhập
        const uid = localStorage.getItem('tronex_uid');
        if (uid) {
            const quiz = mockQuizzes.find(q => q && (q.id || '').toString().trim() === targetId);
            if (quiz && quiz.createdBy?.uid === uid) return true;
        }
        // Fallback: kiểm tra localStorage key
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.some(q => q && (q.id || '').toString().trim() === targetId);
        }
    } catch (e) { }
    return false;
}

window.deleteCustomQuiz = function (id) {
    const isAdmin = localStorage.getItem("admin_secret_key") === "trongbeshop";
    const idx = mockQuizzes.findIndex(q => q && (q.id || '').toString().trim() === (id || '').toString().trim());
    if (idx === -1) return;

    const quiz = mockQuizzes[idx];
    const isPublic = quiz.privacy === "public";
    const isOwner = isQuizOwner(id);

    const deleteModal = document.getElementById("deleteConfirmModal");
    const btnHideLocal = document.getElementById("btnHideLocal");
    const btnDeleteFirebase = document.getElementById("btnDeleteFirebase");

    deleteModal.style.display = "flex";

    if (isAdmin || isOwner) {
        btnDeleteFirebase.style.display = "block";
    } else {
        btnDeleteFirebase.style.display = "none";
    }

    btnHideLocal.onclick = () => {
        mockQuizzes.splice(idx, 1);
        if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();
        initQuizList();
        closeDeleteModal();
        alert("Đã ẩn đề khỏi máy của bạn.");
    };

    btnDeleteFirebase.onclick = () => {
        const msg = isAdmin ? "[ADMIN] Xóa vĩnh viễn đề này khỏi hệ thống?" : "Bạn là chủ đề này. Xóa vĩnh viễn khỏi toàn hệ thống?";
        if (confirm(msg)) {
            mockQuizzes.splice(idx, 1);
            if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();

            const uid = localStorage.getItem('tronex_uid');
            if (isPublic) {
                if (typeof window.__deletePublicQuiz === 'function') {
                    window.__deletePublicQuiz(id);
                }
            } else {
                if (uid && typeof window.__deletePrivateQuiz === 'function') {
                    window.__deletePrivateQuiz(uid, id);
                }
            }

            initQuizList();
            closeDeleteModal();
            alert("Đã xóa vĩnh viễn đề thi thành công!");
        }
    };
};

window.closeDeleteModal = function () {
    document.getElementById("deleteConfirmModal").style.display = "none";
};

// --- NHẬT KÝ CẬP NHẬT (v41) ---
window.showHelp = function (type) {
    const msgs = {
        shuffle: '🔀 Tráo thứ tự:\nCâu hỏi sẽ được xáo trộn ngẫu nhiên mỗi lần làm bài, giúp bạn luyện tập hiệu quả hơn.',
        mode: '📋 Chế độ làm bài:\n• Thi cử: Nộp bài mới thấy đáp án và kết quả.\n• Luyện tập: Hiển thị đáp án đúng/sai ngay sau khi bạn chọn.'
    };
    alert(msgs[type] || '');
};

window.openChangelog = function () {
    document.getElementById("changelogModal").style.display = "flex";
};
window.closeChangelog = function () {
    document.getElementById("changelogModal").style.display = "none";
};
window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebarMenu');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    } else {
        overlay.style.display = 'block';
        setTimeout(() => {
            overlay.classList.add('active');
            sidebar.classList.add('active');
        }, 10);
    }
};

// === HÀM ĐẢO CÂU HỎI THEO PHẦN ===
function shuffleQuestionsBySection(questions) {
    const sections = [...new Set(questions.map(q => q.section))];
    let finalShuffled = [];

    sections.forEach(sec => {
        let sectionQs = questions.filter(q => q.section === sec);
        let groups = [];
        let currentGroup = [];
        let currentGT = null;

        sectionQs.forEach(q => {
            const gt = (q.groupText || "").trim();
            if (gt !== "") {
                if (gt === currentGT) {
                    currentGroup.push(q);
                } else {
                    if (currentGroup.length > 0) groups.push(currentGroup);
                    currentGroup = [q];
                    currentGT = gt;
                }
            } else {
                if (currentGroup.length > 0) groups.push(currentGroup);
                groups.push([q]);
                currentGroup = [];
                currentGT = null;
            }
        });
        if (currentGroup.length > 0) groups.push(currentGroup);

        for (let i = groups.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [groups[i], groups[j]] = [groups[j], groups[i]];
        }

        groups.forEach(g => {
            finalShuffled = finalShuffled.concat(g);
        });
    });
    return finalShuffled;
}

// === BẮT ĐẦU LÀM BÀI ===
window.startQuiz = async function (quizId) {
    currentQuiz = mockQuizzes.find(q => q && (q.id || '').toString().trim() === (quizId || '').toString().trim());

    // v69: Nếu không tìm thấy de_1_dgnl trong mockQuizzes, khôi phục từ backup
    if (!currentQuiz && quizId === 'de_1_dgnl' && window.__de1Backup) {
        console.warn('[TRONEX] de_1_dgnl bị mất khỏi mockQuizzes! Đang khôi phục từ backup...');
        mockQuizzes.unshift(window.__de1Backup);
        currentQuiz = window.__de1Backup;
    }

    if (!currentQuiz || !currentQuiz.questions) {
        console.error('[TRONEX] startQuiz thất bại! quizId:', quizId, '| mockQuizzes count:', mockQuizzes.length);
        return;
    }
    document.getElementById('setupQuizTitle').textContent = `Cấu hình: ${currentQuiz.title}`;
    showView('setup');
};

// === XÁC NHẬN BẮT ĐẦU LÀM BÀI SAU KHI CẤU HÌNH ===
const btnConfirmStart = document.getElementById('btnConfirmStart');
if (btnConfirmStart) {
    btnConfirmStart.onclick = async function () {
        const isShuffle = document.getElementById('chkShuffle').checked;
        const quizMode = document.querySelector('input[name="quizMode"]:checked').value;
        quizForm.dataset.quizMode = quizMode;
        quizForm.dataset.isShuffle = isShuffle;

        let flattenedQs = [];
        JSON.parse(JSON.stringify(currentQuiz.questions)).forEach(q => {
            if (q.type === 'reading_group') {
                (q.subQuestions || []).forEach(sq => {
                    flattenedQs.push({
                        ...sq,
                        section: q.section,
                        groupText: q.passage,
                        type: sq.type || 'multiple_choice'
                    });
                });
            } else {
                flattenedQs.push(q);
            }
        });

        if (isShuffle) {
            currentQuiz.renderedQuestions = shuffleQuestionsBySection(flattenedQs);
        } else {
            currentQuiz.renderedQuestions = flattenedQs;
        }

        // Tăng lượt xem (Áp dụng cho mọi đề không phải local, kể cả đề trong data.js)
        if (currentQuiz.privacy !== "local") {
            try {
                let viewedList = JSON.parse(localStorage.getItem("viewed_quizzes") || "[]");
                const qIdStr = currentQuiz.id.toString();
                if (!viewedList.includes(qIdStr)) {
                    const quizRef = ref(dbRT, FIREBASE_ROOT + '/' + currentQuiz.id + '/viewCount');
                    runTransaction(quizRef, (currentValue) => {
                        return (currentValue || 0) + 1;
                    });
                    viewedList.push(qIdStr);
                    localStorage.setItem("viewed_quizzes", JSON.stringify(viewedList));
                }
            } catch (e) { console.error("Increment view error:", e); }
        }

        quizForm.reset();
        quizForm.dataset.mode = 'exam';
        const submitBtn = quizForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.textContent = 'Nộp Bài Ngay';
            submitBtn.classList.remove('btn-outline');
            submitBtn.classList.add('btn-primary');
            submitBtn.style.display = 'block';
        }

        currentQuizTitle.textContent = currentQuiz.title;
        resetScoreCircle();
        renderQuestions();
        initQuestionPalette(currentQuiz.renderedQuestions || currentQuiz.questions);

        // === RE-ENABLE tất cả inputs (phòng trường hợp session trước đã disabled sau khi nộp bài) ===
        quizForm.querySelectorAll('input').forEach(input => {
            input.disabled = false;
            input.readOnly = false;
        });

        showView('active');
        startTimer(); // Bắt đầu tính giờ từ đây
        window.currentActiveQuiz = currentQuiz;
        window.currentQuestionIndex = 0;

        // Cập nhật lại UI sau khi hiển thị
        const timerBox = document.getElementById('tronexTimerBox');
        if (timerBox) timerBox.style.display = 'flex';
        document.getElementById('tronexResultSummary').style.display = 'none';
        document.getElementById('btnSubmitQuiz').style.display = 'block';

        // Reset nút rời khỏi về trạng thái đang làm bài
        const leaveBtn = document.getElementById('btnLeaveQuiz');
        if (leaveBtn) {
            leaveBtn.textContent = 'Rời khỏi';
        }
    };
}

// === TIMER FUNCTIONS ===
function startTimer() {
    stopTimer();
    quizStartTime = Date.now();
    sessionStorage.setItem('tronex_quiz_start_time', quizStartTime);
    const timerDisplay = document.getElementById('quizTimer');
    if (!timerDisplay) return;

    timerDisplay.textContent = "00:00";

    quizTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - quizStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function stopTimer() {
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }
}

// === INIT QUESTION PALETTE (tronex) ===
function initQuestionPalette(questions) {
    const palette = document.getElementById('questionPalette');
    if (!palette) return;
    palette.innerHTML = '';
    questions.forEach((q, idx) => {
        if (!q) return;
        const btn = document.createElement('div');
        btn.className = 'tronex-palette-btn';
        btn.id = `palette-btn-${q.id}`;
        btn.textContent = idx + 1; // Hiển thị số thứ tự

        // Click để scroll tới câu hỏi
        btn.onclick = () => {
            const qEl = document.getElementById(`q-block-${q.id}`);
            if (qEl) {
                qEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Highlight tạm thời
                document.querySelectorAll('.tronex-palette-btn').forEach(b => b.classList.remove('active-q'));
                btn.classList.add('active-q');
            }
        };
        palette.appendChild(btn);
    });
}

function updatePalette(questionId, letter, isCorrect = null) {
    const btn = document.getElementById(`palette-btn-${questionId}`);
    if (!btn) return;

    // Nếu có tham số isCorrect (dành cho chế độ xem kết quả)
    if (isCorrect !== null) {
        btn.classList.remove('answered', 'active-q');
        if (isCorrect) {
            btn.classList.add('res-correct');
        } else {
            btn.classList.add('res-wrong');
        }
        return;
    }

    // Chế độ đang làm bài
    if (letter) {
        btn.classList.add('answered');
        const qIndex = Array.from(btn.parentNode.children).indexOf(btn) + 1;
        btn.textContent = `${qIndex}:${letter}`;
    } else {
        btn.classList.remove('answered');
        const qIndex = Array.from(btn.parentNode.children).indexOf(btn) + 1;
        btn.textContent = qIndex;
    }
}

// === KIẾN TẠO GIAO DIỆN CÂU HỎI TRONG ĐỀ ===
function renderQuestions() {
    questionsContainer.innerHTML = '';
    let currentSection = "";
    let lastGroupText = "";
    let sectionQuestionIndex = 1;

    const qs = currentQuiz.renderedQuestions || currentQuiz.questions;
    window.currentActiveQuiz = currentQuiz; // v54: Expose for AI context

    qs.forEach((q, index) => {
        if (!q) return;
        if (q.section && q.section !== currentSection) {
            const secHeader = document.createElement('h3');
            secHeader.className = 'section-title';
            secHeader.style.cssText = 'margin-top: 32px; margin-bottom: 16px; color: var(--primary); text-transform: uppercase;';
            secHeader.textContent = q.section;
            questionsContainer.appendChild(secHeader);
            currentSection = q.section;
            sectionQuestionIndex = 1;
        }

        window.currentQuestionIndex = index; // v54: Track current for AI

        if (q.groupText && q.groupText.trim() !== "" && q.groupText !== lastGroupText) {
            const passageDiv = document.createElement('div');
            passageDiv.className = 'reading-passage';
            passageDiv.style.cssText = 'background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 24px; border-left: 5px solid var(--primary); font-size: 1.05rem; line-height: 1.7; white-space: pre-wrap;';
            passageDiv.innerHTML = q.groupText;
            questionsContainer.appendChild(passageDiv);
            lastGroupText = q.groupText;
        }

        const qBlock = document.createElement('div');
        qBlock.className = 'question-card';
        qBlock.id = `q-block-${q.id}`;

        const qTitle = document.createElement('h4');
        const qNumDisplay = q.qNumber || sectionQuestionIndex;
        qTitle.style.whiteSpace = 'pre-wrap';

        // Làm sạch text nếu AI lỡ viết đúp "Câu X:"
        const cleanText = (q.text || '').replace(/^Câu\s+\d+[:.]\s*/i, '').trim();
        qTitle.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
                <span>Câu ${qNumDisplay}: ${cleanText}</span>
                <button type="button" class="btn btn-text" onclick="askAiAboutQuestion(${index})" style="padding: 2px 8px; font-size: 12px; background: #EEF2FF; color: #4F46E5; border-radius: 6px; border: 1px solid #E0E7FF; flex-shrink: 0;">✨ Hỏi AI</button>
            </div>
        `;
        qBlock.appendChild(qTitle);

        if (q.imageSrc) {
            const imgDiv = document.createElement('div');
            imgDiv.className = 'question-image';
            imgDiv.innerHTML = `<img src="${q.imageSrc}" alt="Hình minh họa">`;
            const imgEl = imgDiv.querySelector('img');
            imgEl.onclick = () => {
                if (window.showImageLightbox) window.showImageLightbox(q.imageSrc);
            };
            qBlock.appendChild(imgDiv);
        } else if (q.diagramCode) {
            // v48: Hiển thị sơ đồ được vẽ bằng code (HTML/SVG/Table)
            const diagramDiv = document.createElement('div');
            diagramDiv.className = 'question-diagram';
            diagramDiv.style.cssText = 'background: white; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-bottom: 20px; overflow-x: auto;';
            diagramDiv.innerHTML = q.diagramCode;
            qBlock.appendChild(diagramDiv);
        }

        const optionsList = document.createElement('div');
        optionsList.className = 'options-list';

        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const opts = qType === 'true_false' ? ["Đúng", "Sai"] : (Array.isArray(q.options) ? q.options : []);
            const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
            opts.forEach((opt, optIndex) => {
                const label = document.createElement('label');
                label.className = 'tronex-option-label';

                const letter = letters[optIndex] || '';
                label.innerHTML = `
                    <input type="radio" name="question_${q.id}" value="${optIndex}">
                    <div class="tronex-opt-letter">${letter}</div>
                    <div class="tronex-opt-text">${opt}</div>
                    <button type="button" class="tronex-clear-btn" title="Hủy chọn">✕</button>
                `;

                const radio = label.querySelector('input');
                const clearBtn = label.querySelector('.tronex-clear-btn');

                radio.addEventListener('change', () => {
                    optionsList.querySelectorAll('.tronex-option-label').forEach(l => l.classList.remove('selected'));
                    if (radio.checked) {
                        label.classList.add('selected');
                        updatePalette(q.id, letter);
                    }
                    if (quizForm.dataset.quizMode === 'practice') {
                        highlightAnswer(q, optionsList);
                    }
                });

                clearBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    radio.checked = false;
                    label.classList.remove('selected');
                    updatePalette(q.id, null);
                });



                optionsList.appendChild(label);
            });
        } else if (qType === 'true_false_group') {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'tf-group-container';
            const table = document.createElement('table');
            table.className = 'tf-table';
            table.innerHTML = `
                <thead><tr><th>Nội dung</th><th>Đúng</th><th>Sai</th></tr></thead>
                <tbody>
                    ${(q.subQuestions || []).map(sq => `
                        <tr>
                            <td>${sq.text}</td>
                            <td class="tf-col">
                                <label class="radio-label">
                                    <input type="radio" name="question_${q.id}_${sq.id}" value="Đúng">
                                    <span class="custom-radio"></span>
                                </label>
                            </td>
                            <td class="tf-col">
                                <label class="radio-label">
                                    <input type="radio" name="question_${q.id}_${sq.id}" value="Sai">
                                    <span class="custom-radio"></span>
                                </label>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            const radios = table.querySelectorAll('input[type="radio"]');
            radios.forEach(radio => {
                radio.addEventListener('change', () => {
                    if (quizForm.dataset.quizMode === 'practice') {
                        highlightTFGroupAnswer(q, table, radio.name);
                    }
                });
            });
            groupDiv.appendChild(table);
            optionsList.appendChild(groupDiv);
        } else if (qType === 'short_answer') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control short-answer-input';
            input.name = `question_${q.id}`;
            input.placeholder = 'Nhập câu trả lời của bạn...';
            input.style.cssText = 'max-width: 300px; margin-top: 10px; font-size: 1.1rem; padding: 10px; border: 2px solid #E5E7EB; border-radius: 8px; transition: all 0.3s ease;';

            input.addEventListener('change', () => {
                if (quizForm.dataset.quizMode === 'practice') {
                    highlightShortAnswer(q, input);
                }
            });
            // Hỗ trợ kiểm tra ngay lập tức khi người dùng nhập xong và bấm Enter hoặc click ra ngoài
            input.addEventListener('input', () => {
                if (quizForm.dataset.quizMode === 'practice') {
                    // Nếu muốn kiểm tra realtime thì mở dòng dưới, nhưng khuyên dùng change để không bị lỗi lúc đang gõ dở
                    // highlightShortAnswer(q, input);
                }
            });

            optionsList.appendChild(input);
        }

        qBlock.appendChild(optionsList);
        questionsContainer.appendChild(qBlock);
        sectionQuestionIndex++;
    });

    // v1.6: Hỗ trợ hiển thị ký tự toán học/hóa học bằng KaTeX
    if (window.renderMathInElement) {
        renderMathInElement(questionsContainer, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true }
            ],
            throwOnError: false
        });
    }
}
window.renderQuestions = renderQuestions;

// === CHẤM ĐIỂM (RESTORED v46) ===
if (quizForm) {
    quizForm.onsubmit = function (e) {
        try {
            e.preventDefault();
            if (quizForm.dataset.mode === 'practice') {
                alert("Bạn đã hoàn thành chế độ luyện tập. Chế độ luyện tập không chấm điểm tổng.");
                return;
            }

            const formData = new FormData(quizForm);
            let correct = 0;
            let incorrect = 0;
            let unanswered = 0;

            const qs = currentQuiz.renderedQuestions || currentQuiz.questions;

            qs.forEach(q => {
                if (!q) return;
                const qId = q.id;
                const qType = q.type || 'multiple_choice';

                if (qType === 'multiple_choice' || qType === 'true_false') {
                    const userVal = formData.get(`question_${qId}`);
                    if (userVal === null) unanswered++;
                    else if (parseInt(userVal) === parseInt(q.correctIndex)) correct++;
                    else incorrect++;
                } else if (qType === 'short_answer') {
                    const userVal = (formData.get(`question_${qId}`) || "").toString().trim().toLowerCase();
                    const correctVal = (q.correctAnswer || "").toString().toLowerCase();
                    if (userVal === "") unanswered++;
                    else if (userVal === correctVal) correct++;
                    else incorrect++;
                } else if (qType === 'true_false_group') {
                    let isAllCorrect = true;
                    let isAnyUnanswered = false;
                    (q.subQuestions || []).forEach(sq => {
                        const val = formData.get(`question_${qId}_${sq.id}`);
                        if (val === null) isAnyUnanswered = true;
                        else if (val !== sq.correctAnswer) isAllCorrect = false;
                    });
                    if (isAnyUnanswered) unanswered++;
                    else if (isAllCorrect) correct++;
                    else incorrect++;
                }
            });

            showReviewMode(qs);
            renderResults(correct, incorrect, unanswered);
        } catch (err) {
            alert("LỖI KHI NỘP BÀI: " + err.message + "\n\nVui lòng chụp màn hình lỗi này gửi cho tôi để tôi sửa nhé!");
            console.error(err);
        }
    };
}

function showReviewMode(qs) {
    qs.forEach(q => {
        if (!q) return;
        const qId = q.id;
        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const inputs = document.getElementsByName(`question_${qId}`);
            if (inputs.length > 0) {
                const optionsList = inputs[0].closest('.options-list');
                if (optionsList) highlightAnswer(q, optionsList);
            }
        } else if (qType === 'short_answer') {
            const inputs = document.getElementsByName(`question_${qId}`);
            if (inputs.length > 0) {
                highlightShortAnswer(q, inputs[0], true);
            }
        } else if (qType === 'true_false_group') {
            (q.subQuestions || []).forEach(sq => {
                const radioName = `question_${qId}_${sq.id}`;
                const inputs = document.getElementsByName(radioName);
                if (inputs.length > 0) {
                    const table = inputs[0].closest('.tf-table');
                    if (table) highlightTFGroupAnswer(q, table, radioName);
                }
            });
        }
    });

    const allInputs = quizForm.querySelectorAll('input');
    allInputs.forEach(input => {
        if (input.type === 'text') {
            input.readOnly = true;
        } else {
            input.disabled = true;
        }
    });

    const submitBtn = quizForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.style.display = 'none';
    }
}

function renderResults(correct, incorrect, unanswered) {
    stopTimer(); // Dừng tính giờ khi nộp bài
    const total = correct + incorrect + unanswered;

    let score;
    if (isVACTPage) {
        // Thang điểm 1200 cho TRONEX (10đ mỗi câu đúng)
        score = correct * 10;
        document.querySelector('.tronex-score').innerHTML = `<span id="tronexScoreText">${score}</span> / 1200`;
    } else {
        score = total > 0 ? ((correct / total) * 10).toFixed(2) : 0;
        document.getElementById('tronexScoreText').textContent = score;
    }

    // Hiển thị thời gian làm bài
    const savedStartTime = sessionStorage.getItem('tronex_quiz_start_time') || quizStartTime;
    let elapsedSeconds = 0;
    if (savedStartTime) {
        const endTime = Date.now();
        elapsedSeconds = Math.floor((endTime - parseInt(savedStartTime)) / 1000);
        const mins = Math.floor(elapsedSeconds / 60);
        const secs = elapsedSeconds % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        const timeEl = document.getElementById('tronexTimeSpent');
        if (timeEl) timeEl.textContent = timeStr;
    }

    // Cập nhật Result Summary (TRONEX Style)
    document.getElementById('tronexCorrect').textContent = correct;
    document.getElementById('tronexIncorrect').textContent = incorrect;
    document.getElementById('tronexUnanswered').textContent = unanswered;

    document.getElementById('tronexResultSummary').style.display = 'block';

    const timerBox = document.getElementById('tronexTimerBox');
    if (timerBox) timerBox.style.display = 'none';

    const submitBtn = document.getElementById('btnSubmitQuiz');
    if (submitBtn) submitBtn.style.display = 'none';

    const leaveBtn = document.getElementById('btnLeaveQuiz');
    if (leaveBtn) {
        leaveBtn.textContent = 'Trở về danh sách';
    }

    // === LƯU LỊCH SỬ LÀM BÀI ===
    try {
        const attempts = JSON.parse(localStorage.getItem('tronex_attempts') || '[]');
        attempts.push({
            quizId: currentQuiz?.id || 'unknown',
            quizTitle: currentQuiz?.title || '',
            score: parseFloat(score),
            correct,
            total,
            seconds: elapsedSeconds,
            date: new Date().toISOString()
        });
        // Giữ tối đa 200 lần gần nhất
        if (attempts.length > 200) attempts.splice(0, attempts.length - 200);
        localStorage.setItem('tronex_attempts', JSON.stringify(attempts));
    } catch (e) { console.warn('Không thể lưu lịch sử:', e); }

    // === CONFETTI KHI ĐIỂM CAO ===
    const scoreRatio = total > 0 ? correct / total : 0;
    if (scoreRatio >= 0.8) {
        fireConfetti();
    }
}

// === CÁC TIỆN ÍCH KHÁC (LOAD/SAVE/UI) ===
function highlightAnswer(q, optionsList) {
    const inputs = optionsList.querySelectorAll('input');
    inputs.forEach((input, idx) => {
        const label = input.closest('label.tronex-option-label') || input.closest('label');
        if (label) {
            label.classList.remove('correct-answer', 'wrong-answer', 'correct', 'wrong');
            const isCorrectOption = idx === parseInt(q.correctIndex);

            if (isCorrectOption) {
                label.classList.add('correct');
            } else if (input.checked) {
                label.classList.add('wrong');
            }

            // Cập nhật luôn cho Palette nếu đang chấm điểm
            if (input.checked) {
                updatePalette(q.id, null, isCorrectOption);
            } else if (isCorrectOption) {
                // Nếu người dùng không chọn gì, mà câu này đúng thì set palette là sai (màu đỏ)
                const isAnyChecked = Array.from(inputs).some(i => i.checked);
                if (!isAnyChecked) {
                    updatePalette(q.id, null, false);
                }
            }
        }
    });
}

function highlightTFGroupAnswer(q, table, radioName) {
    const radios = table.querySelectorAll(`input[name="${radioName}"]`);
    const parts = radioName.split('_');
    const sqId = parts[parts.length - 1];
    const sq = q.subQuestions ? q.subQuestions.find(s => s.id === sqId) : null;

    if (sq) {
        radios.forEach(input => {
            const label = input.closest('label');
            label.classList.remove('correct-answer', 'wrong-answer');
            const val = input.value;
            if (val === sq.correctAnswer) {
                label.classList.add('correct-answer');
            } else if (input.checked) {
                label.classList.add('wrong-answer');
            }
        });
    }
}

function highlightShortAnswer(q, inputElement, isReview = false) {
    const userVal = inputElement.value.trim().toLowerCase();
    const correctVal = (q.correctAnswer || "").toString().trim().toLowerCase();

    inputElement.style.borderColor = '#E5E7EB';
    inputElement.style.backgroundColor = 'transparent';
    inputElement.style.color = 'inherit';

    // Nếu chưa nhập gì thì xóa định dạng, trừ khi đang ở chế độ xem lại
    if (userVal === "") {
        if (isReview) {
            inputElement.style.borderColor = '#EF4444';
            inputElement.style.backgroundColor = '#FEE2E2';
            inputElement.value = "Chưa làm. Đáp án: " + q.correctAnswer;
            inputElement.style.color = '#991B1B';
        }
        return;
    }

    if (userVal === correctVal) {
        inputElement.style.borderColor = '#10B981'; // Xanh lá
        inputElement.style.backgroundColor = '#D1FAE5';
        inputElement.style.color = '#065F46';
    } else {
        inputElement.style.borderColor = '#EF4444'; // Đỏ
        inputElement.style.backgroundColor = '#FEE2E2';
        inputElement.style.color = '#991B1B';
        if (isReview && !inputElement.value.includes("Đáp án:")) {
            inputElement.value = inputElement.value + " (Đáp án: " + q.correctAnswer + ")";
        }
    }
}

function resetScoreCircle() {
    const circle = document.querySelector('.score-circle');
    if (circle) circle.style.background = '#E5E7EB';
}

function loadCustomQuizzes() {
    // v68: Không load đề tùy chỉnh nếu đang ở trang VACT (Strict Data Integrity)
    if (isVACTPage) return;
    try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) mockQuizzes.unshift(...parsed);
        }
    } catch (e) { }
}

window.loadPublicQuizzes = function () {
    if (!quizListContainer && !isVACTPage) return; // Bảo vệ trang index.html
    console.log("🔄 Đang quét dữ liệu từ Cloud... (Trang TRONEX: " + isVACTPage + ")");
    try {
        const publicRef = ref(dbRT, FIREBASE_ROOT);
        onValue(publicRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                let listChanged = false;

                // v70: Không xóa mockQuizzes nữa - chỉ merge từ Firebase vào
                // de_1_dgnl từ data.js là seed ban đầu, Firebase là nguồn chân lý sau khi đã có data

                Object.keys(data).forEach(key => {
                    // v70: Dùng convertFirebaseData để đệ quy convert toàn bộ nested arrays
                    let pq = convertFirebaseData(data[key]);
                    const pqId = key.toString().trim();
                    const existingIdx = mockQuizzes.findIndex(q => q && (q.id || '').toString().trim() === pqId);

                    // 1. Cập nhật lượt xem trực tiếp trên DOM và Memory
                    if (pq.viewCount !== undefined) {
                        if (existingIdx !== -1) mockQuizzes[existingIdx].viewCount = pq.viewCount;
                        const viewEl = document.getElementById(`views-${pqId}`);
                        if (viewEl) {
                            viewEl.innerHTML = `Lượt truy cập: ${pq.viewCount}`;
                        }
                    }

                    // 2. Xử lý nội dung đề thi - Firebase là nguồn chân lý
                    if (!pq.title || !pq.questions) return;
                    if (!Array.isArray(pq.questions) || pq.questions.length === 0) return;

                    // Với de_1_dgnl: Firebase được phép override NHƯNG phải có đủ câu hỏi
                    // Nếu Firebase trả về ít hơn 50% so với backup → dùng backup (data bị corrupt)
                    if (pqId === 'de_1_dgnl' && window.__de1Backup) {
                        const backupCount = (window.__de1Backup.questions || []).length;
                        if (backupCount > 0 && pq.questions.length < backupCount * 0.5) {
                            console.warn('[TRONEX] Firebase data cho de_1_dgnl bị thiếu câu hỏi, dùng backup từ data.js');
                            return; // Giữ nguyên version từ data.js
                        }
                    }

                    if (existingIdx === -1) {
                        mockQuizzes.push(pq);
                        listChanged = true;
                    } else {
                        const localCopy = { ...mockQuizzes[existingIdx] };
                        const remoteCopy = { ...pq };
                        delete localCopy.viewCount;
                        delete remoteCopy.viewCount;

                        if (JSON.stringify(localCopy) !== JSON.stringify(remoteCopy)) {
                            mockQuizzes[existingIdx] = pq;
                            listChanged = true;
                        }
                    }
                });

                // v51: Tự động seed đề TRONEX lên Firebase nếu chưa có
                if (isVACTPage && !data['de_1_dgnl']) {
                    const de1 = mockQuizzes.find(q => q.id === 'de_1_dgnl');
                    if (de1) {
                        console.log("🚀 Seeding de_1_dgnl lên Firebase lần đầu...");
                        window.__publishPublicQuiz(de1);
                    }
                }

                if (listChanged) initQuizList();
            } else {
                // v51: Firebase trống hoàn toàn
                if (isVACTPage) {
                    const de1 = mockQuizzes.find(q => q.id === 'de_1_dgnl');
                    if (de1) {
                        console.log("🚀 Nhánh VACT trống, đang tự động tạo và đồng bộ...");
                        window.__publishPublicQuiz(de1);
                    } else {
                        console.warn("⚠️ Không tìm thấy đề de_1_dgnl trong mockQuizzes để đồng bộ.");
                    }
                }
            }
        }, (error) => {
            console.warn("⚠️ Firebase connection blocked or restricted:", error.message);
        });
    } catch (e) { console.error("Load public error:", e); }
};

// --- HÀM ĐỒNG BỘ ĐỀ RIÊNG TƯ TỪ CLOUD THEO UID ---
window.syncPrivateQuizzesFromFirebase = async function (user) {
    if (!user) return;
    try {
        console.log("🔄 Đang đồng bộ các đề thi riêng tư của bạn từ Cloud...");
        const userQuizzesRef = ref(dbRT, `users/${user.uid}/quizzes`);
        const snapshot = await get(userQuizzesRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            let changed = false;
            Object.keys(data).forEach(key => {
                const quiz = data[key];
                const existingIdx = mockQuizzes.findIndex(q => q && (q.id || '').toString().trim() === key.toString().trim());
                if (existingIdx === -1) {
                    mockQuizzes.unshift(quiz);
                    changed = true;
                } else {
                    const localCopy = { ...mockQuizzes[existingIdx] };
                    const remoteCopy = { ...quiz };
                    delete localCopy.viewCount;
                    delete remoteCopy.viewCount;
                    if (JSON.stringify(localCopy) !== JSON.stringify(remoteCopy)) {
                        mockQuizzes[existingIdx] = quiz;
                        changed = true;
                    }
                }
            });
            if (changed) {
                window.__saveCustomQuizzes();
                initQuizList();
            }
        }
    } catch (e) {
        console.warn("⚠️ Lỗi đồng bộ đề riêng tư từ Firebase:", e.message);
    }
};

// --- ĐĂNG/XÓA ĐỀ TRÊN CLOUD (Công khai & Riêng tư) ---
window.__publishPublicQuiz = (quizObj) => {
    try {
        const publicRef = ref(dbRT, FIREBASE_ROOT + '/' + quizObj.id);
        set(publicRef, quizObj)
            .then(() => console.log("🚀 Đã đăng đề CÔNG KHAI lên máy chủ THÀNH CÔNG!"))
            .catch(err => console.error("❌ Lỗi khi đăng đề công khai:", err));
    } catch (e) { console.error("❌ Lỗi hệ thống:", e); }
};

window.__publishPrivateQuiz = (userUid, quizObj) => {
    try {
        const privateRef = ref(dbRT, `users/${userUid}/quizzes/${quizObj.id}`);
        set(privateRef, quizObj)
            .then(() => console.log("🚀 Đã đăng đề RIÊNG TƯ lên máy chủ THÀNH CÔNG!"))
            .catch(err => console.error("❌ Lỗi khi lưu đề riêng tư:", err));
    } catch (e) { console.error("❌ Lỗi hệ thống:", e); }
};

window.__deletePublicQuiz = (quizId) => {
    try {
        const publicRef = ref(dbRT, FIREBASE_ROOT + '/' + quizId);
        set(publicRef, null)
            .then(() => console.log("🗑️ Đã xóa đề CÔNG KHAI trên Cloud."))
            .catch(err => console.error("❌ Lỗi khi xóa đề công khai trên Cloud:", err));
    } catch (e) { console.error("❌ Lỗi hệ thống:", e); }
};

window.__deletePrivateQuiz = (userUid, quizId) => {
    try {
        const privateRef = ref(dbRT, `users/${userUid}/quizzes/${quizId}`);
        set(privateRef, null)
            .then(() => console.log("🗑️ Đã xóa đề RIÊNG TƯ trên Cloud."))
            .catch(err => console.error("❌ Lỗi khi xóa đề riêng tư trên Cloud:", err));
    } catch (e) { console.error("❌ Lỗi hệ thống:", e); }
};

// --- CHỈNH SỬA ĐỀ THI TỰ TẠO ---
window.editCustomQuiz = function (id) {
    if (window.tronexAI && typeof window.tronexAI.editQuiz === 'function') {
        window.tronexAI.editQuiz(id);
    } else {
        alert("⚠️ Trình quản lý đề chưa sẵn sàng hoặc không khả dụng trên trang này.");
    }
};

// Khởi động
window.firebaseConfig = firebaseConfig;
window.firebaseSDK = { ref, runTransaction, set };
window.__mockQuizzes = mockQuizzes;
window.__initQuizList = initQuizList;
window.__saveCustomQuizzes = () => {
    const custom = mockQuizzes.filter(q => {
        const id = q.id.toString();
        return id.startsWith('gemini_') || id.startsWith('manual_');
    });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(custom));
};

document.addEventListener('DOMContentLoaded', () => {
    loadCustomQuizzes();
    loadCustomQuizzesFromStorage(); // Fix Bug 2: reload đề tự tạo từ localStorage
    loadPublicQuizzes();
    initQuizList();

    // --- ĐIỀU HƯỚNG ---
    const btnLeaveQuiz = document.getElementById('btnLeaveQuiz');
    if (btnLeaveQuiz) {
        btnLeaveQuiz.onclick = () => {
            // Nếu đang ở trạng thái xem kết quả (nút ghi là "Trở về danh sách")
            if (btnLeaveQuiz.textContent.includes("Trở về")) {
                showView('list');
                initQuizList();
            } else {
                // Đang làm bài dở
                if (confirm("Bạn có chắc chắn muốn rời khỏi bài thi? Tiến trình sẽ không được lưu.")) {
                    stopTimer();
                    showView('list');
                }
            }
        };
    }

    const navButtons = {
        'btnBackToMenu': 'list',
        'btnBackFromSetup': 'list',
        'btnBackToMenuFromResult': 'list'
    };
    Object.entries(navButtons).forEach(([id, view]) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => {
            if (id === 'btnBackToMenu') stopTimer(); // Dừng timer nếu đang làm dở mà thoát
            showView(view);
        };
    });

    const btnRetry = document.getElementById('btnRetry');
    if (btnRetry) btnRetry.onclick = () => {
        resetScoreCircle();
        quizForm.reset();
        quizForm.dataset.mode = 'exam';
        renderQuestions();
        // Re-enable tất cả inputs sau khi render lại
        quizForm.querySelectorAll('input').forEach(input => {
            input.disabled = false;
            input.readOnly = false;
        });
        document.getElementById('btnSubmitQuiz').style.display = 'block';
        const timerBox = document.getElementById('tronexTimerBox');
        if (timerBox) timerBox.style.display = 'flex';
        document.getElementById('tronexResultSummary').style.display = 'none';
        const leaveBtn = document.getElementById('btnLeaveQuiz');
        if (leaveBtn) leaveBtn.textContent = 'Rời khỏi';
        startTimer();
        showView('active');
    };

    const btnReview = document.getElementById('btnReview');
    if (btnReview) btnReview.onclick = () => showView('active');

    // --- QUYỀN ADMIN ẨN ---
    let adminClickCount = 0;
    const adminTriggerRow = document.querySelector('.header h1');
    if (adminTriggerRow) {
        adminTriggerRow.style.cursor = "pointer";
        adminTriggerRow.addEventListener('click', () => {
            adminClickCount++;
            if (adminClickCount >= 10) {
                const isAdmin = localStorage.getItem("admin_secret_key") === "trongbeshop";
                if (isAdmin) {
                    localStorage.removeItem("admin_secret_key");
                    alert("Đã TẮT quyền Admin.");
                } else {
                    localStorage.setItem("admin_secret_key", "trongbeshop");
                    alert("Đã BẬT quyền Admin!");
                }
                location.reload();
            }
        });
    }

    // --- KHỞI TẠO SIDEBAR KÉO THẢ (v51) ---
    initDraggableSidebar();
});

// === DRAGGABLE & MINIMIZABLE SIDEBAR ===
window.toggleMinimizeSidebar = function () {
    const sidebar = document.getElementById('tronexSidebar');
    if (sidebar) {
        sidebar.classList.toggle('minimized');
    }
};

function initDraggableSidebar() {
    const sidebar = document.getElementById('tronexSidebar');
    const handle = document.getElementById('tronexSidebarHandle');
    if (!sidebar || !handle) return;

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Load saved position
    const savedPos = localStorage.getItem('tronex_sidebar_pos');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            xOffset = pos.x;
            yOffset = pos.y;
            sidebar.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
        } catch (e) { }
    }

    handle.addEventListener('mousedown', dragStart);
    handle.addEventListener('touchstart', (e) => dragStart(e.touches[0]), { passive: false });

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', (ev) => drag(ev.touches[0]), { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            sidebar.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;

        try {
            localStorage.setItem('tronex_sidebar_pos', JSON.stringify({ x: xOffset, y: yOffset }));
        } catch (e) { }

        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
    }
}

// ============================================================
//  CONFETTI — Hiệu ứng pháo hoa khi điểm cao (≥80%)
// ============================================================
function fireConfetti() {
    const colors = ['#4F46E5', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
    const count = 80;

    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.cssText = `
            left: ${Math.random() * 100}vw;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            width: ${6 + Math.random() * 8}px;
            height: ${10 + Math.random() * 10}px;
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            animation-duration: ${1.5 + Math.random() * 2}s;
            animation-delay: ${Math.random() * 0.8}s;
            opacity: ${0.7 + Math.random() * 0.3};
        `;
        document.body.appendChild(el);
        // Tự xóa sau khi animation xong
        el.addEventListener('animationend', () => el.remove());
    }
}
window.fireConfetti = fireConfetti;
