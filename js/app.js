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

    // v71: Backup nhẹ - chỉ lưu tham chiếu trực tiếp (không deep copy 87KB object dễ bị crash)
    const originalDe1 = vactQuizzes.find(q => q.id === 'de_1_dgnl');
    if (originalDe1) {
        window.__de1Backup = originalDe1; // Chỉ giữ tham chiếu, không deep copy
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
    result: document.getElementById('resultView'),
    submissions: document.getElementById('submissionsView'),
    submissionDetail: document.getElementById('submissionDetailView')
};

const quizListContainer = document.getElementById('quizList');
const questionsContainer = document.getElementById('questionsContainer');
const currentQuizTitle = document.getElementById('currentQuizTitle');
const quizForm = document.getElementById('quizForm');

// === STATE: Thông tin người tham gia (B) ===
let currentParticipant = null;    // {uid, displayName, photoURL}
let currentSubmissionQuizId = null; // Quiz đang xem submissions
let currentViewingSubmission = null; // {quizId, submissionId, data}

// === HÀM CHUYỂN ĐỔI MÀN HÌNH ===
function showView(viewName) {
    console.log('[TRONEX] showView:', viewName);
    Object.entries(views).forEach(([name, v]) => {
        if (v) v.classList.remove('active');
        else console.warn('[TRONEX] views.' + name + ' là null! Kiểm tra HTML.');
    });
    if (views[viewName]) {
        views[viewName].classList.add('active');
    } else {
        console.error('[TRONEX] Không tìm thấy view:', viewName);
        return;
    }
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
        card.dataset.quizId = quiz.id;

        // Build card HTML (không dùng onclick attribute)
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
            <div class="card-btn-row" style="display: flex; gap: 10px;">
                <button class="btn btn-primary card-start-btn" style="flex: 1;" type="button"
                    onclick="window.__sq('${quiz.id}')">Bắt Đầu Làm Bài</button>
                ${isQuizOwner(quiz.id) ? `
                    <button class="btn btn-outline card-edit-btn" style="padding: 12px; color: #3B82F6; border-color: #3B82F6;" type="button" title="Chỉnh sửa đề này">✏️</button>
                    <button class="btn btn-outline card-del-btn" style="padding: 12px; color: #EF4444; border-color: #EF4444;" type="button" title="Xóa đề này">🗑️</button>
                    <button class="btn btn-outline card-submissions-btn" style="padding: 12px; color: #16a34a; border-color: #16a34a;" type="button" title="Xem bài nộp">📋</button>
                    <button class="btn btn-outline card-share-btn" style="padding: 12px; color: #8b5cf6; border-color: #8b5cf6;" type="button" title="Sao chép link chia sẻ">🔗</button>
                ` : ""}
            </div>
        `;

        // === v73: Gắn listener TRỰC TIẾP vào button ngay sau render ===
        // Đây là cách đáng tin cậy 100%, không phụ thuộc onclick attribute hay event delegation
        const startBtn = card.querySelector('.card-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                console.log('[TRONEX] ✅ Click nút:', quiz.id);
                if (typeof window.startQuiz === 'function') {
                    window.startQuiz(quiz.id);
                } else {
                    alert('[DEBUG] window.startQuiz chưa được định nghĩa!');
                }
            });
        }
        const editBtn = card.querySelector('.card-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                editCustomQuiz(quiz.id);
            });
        }
        const delBtn = card.querySelector('.card-del-btn');
        if (delBtn) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteCustomQuiz(quiz.id);
            });
        }
        // Nút xem bài nộp
        const subsBtn = card.querySelector('.card-submissions-btn');
        if (subsBtn) {
            subsBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                window.viewSubmissions(quiz.id);
            });
        }
        // Nút sao chép link chia sẻ
        const shareBtn = card.querySelector('.card-share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
                const shareUrl = base + 'v-act.html?quiz=' + encodeURIComponent(quiz.id);
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        shareBtn.textContent = '✅';
                        setTimeout(() => { shareBtn.textContent = '🔗'; }, 2000);
                    });
                } else {
                    prompt('Sao chép link này để chia sẻ đề với người khác:', shareUrl);
                }
            });
        }

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
    console.log('[TRONEX] startQuiz called:', quizId, '| mockQuizzes count:', mockQuizzes.length);
    currentQuiz = mockQuizzes.find(q => q && (q.id || '').toString().trim() === (quizId || '').toString().trim());

    // v69: Nếu không tìm thấy de_1_dgnl trong mockQuizzes, khôi phục từ backup
    if (!currentQuiz && quizId === 'de_1_dgnl' && window.__de1Backup) {
        console.warn('[TRONEX] de_1_dgnl bị mất khỏi mockQuizzes! Đang khôi phục từ backup...');
        mockQuizzes.unshift(window.__de1Backup);
        currentQuiz = window.__de1Backup;
    }

    if (!currentQuiz || !currentQuiz.questions) {
        console.error('[TRONEX] startQuiz thất bại! quizId:', quizId, '| mockQuizzes:', mockQuizzes.map(q => q?.id));
        alert('⚠️ Lỗi: Không tìm thấy bộ đề "' + quizId + '". Vui lòng reload trang và thử lại.');
        return;
    }

    document.getElementById('setupQuizTitle').textContent = `Cấu hình: ${currentQuiz.title}`;

    // === Hiển thị Participant Modal trước khi vào setup ===
    const modal = document.getElementById('participantModal');
    const nameInput = document.getElementById('participantNameInput');
    const nameField = document.getElementById('participantNameField');
    const greeting = document.getElementById('participantGreeting');
    const subtitle = document.getElementById('participantSubtitle');
    const avatarArea = document.getElementById('participantAvatarArea');

    if (!modal) { showView('setup'); return; }

    const user = window.__currentUser || null; // từ auth.js
    if (user && user.displayName) {
        // Đã đăng nhập — auto fill
        greeting.textContent = `Xin chào, ${user.displayName}! 👋`;
        subtitle.textContent = 'Tài khoản của bạn sẽ được gắn vào bài nộp tự động.';
        if (nameField) nameField.style.display = 'none';
        if (avatarArea) avatarArea.innerHTML = `<img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName) + '&background=6366f1&color=fff&size=80'}" style="width:72px;height:72px;border-radius:50%;border:3px solid #6366f1;" onerror="this.src='https://ui-avatars.com/api/?name=U&background=6366f1&color=fff&size=80'">`;
        currentParticipant = { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL || null };
    } else {
        // Chưa đăng nhập — hiện ô nhập tên
        greeting.textContent = 'Xác nhận thông tin';
        subtitle.textContent = 'Nhập tên của bạn để bắt đầu làm bài (không bắt buộc)';
        if (nameField) nameField.style.display = 'block';
        if (avatarArea) avatarArea.innerHTML = '<span style="font-size:52px; line-height:1;">👤</span>';
        if (nameInput) nameInput.value = '';
        currentParticipant = null;
    }
    modal.style.display = 'flex';
};

// === XÁC NHẬN PARTICIPANT VÀ VÀO SETUP ===
window.__confirmParticipant = function() {
    const modal = document.getElementById('participantModal');
    const nameInput = document.getElementById('participantNameInput');
    const user = window.__currentUser || null;

    if (user && user.displayName) {
        currentParticipant = { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL || null };
    } else {
        const name = ((nameInput ? nameInput.value : '') || '').trim();
        currentParticipant = { uid: null, displayName: name || 'Ẩn danh', photoURL: null };
    }
    if (modal) modal.style.display = 'none';
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

            // === LƯU SUBMISSION LÊN FIREBASE (nếu có participant) ===
            if (currentParticipant && currentQuiz && isVACTPage) {
                try {
                    const answers = {};
                    qs.forEach(q => {
                        if (!q) return;
                        const val = formData.get(`question_${q.id}`);
                        if (val !== null && val !== undefined) answers[String(q.id)] = val;
                    });
                    const subId = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    const subRef = ref(dbRT, `submissions/${currentQuiz.id}/${subId}`);
                    await set(subRef, {
                        participant: currentParticipant,
                        answers,
                        autoScore: correct,
                        totalQuestions: correct + incorrect + unanswered,
                        submittedAt: Date.now(),
                        finalScore: null,
                        manualGrades: {}
                    });
                    console.log('[TRONEX] ✅ Submission đã lưu lên Firebase:', subId);
                } catch (e) {
                    console.warn('[TRONEX] Không thể lưu submission:', e.message);
                }
            }
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

    // === v72: GLOBAL EVENT DELEGATION cho quiz card buttons ===
    // Dùng event delegation thay vì onclick inline — an toàn hơn, luôn hoạt động
    document.addEventListener('click', function(e) {
        const startBtn = e.target.closest('[data-start-quiz]');
        if (startBtn) {
            const quizId = startBtn.dataset.startQuiz;
            console.log('[TRONEX] 👊 Click bắt đầu:', quizId);
            startQuiz(quizId);
            return;
        }
        const editBtn = e.target.closest('[data-edit-quiz]');
        if (editBtn) {
            editCustomQuiz(editBtn.dataset.editQuiz);
            return;
        }
        const delBtn = e.target.closest('[data-delete-quiz]');
        if (delBtn) {
            deleteCustomQuiz(delBtn.dataset.deleteQuiz);
            return;
        }
    });
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

// ============================================================
// === SUBMISSION SYSTEM: Giao bài & Chấm bài (v76) ===
// ============================================================

// --- Xem danh sách bài nộp của một đề (dành cho A - người tạo) ---
window.viewSubmissions = function(quizId) {
    const quiz = mockQuizzes.find(q => q && q.id === quizId);
    const title = quiz ? quiz.title : quizId;
    const titleEl = document.getElementById('submissionsViewTitle');
    if (titleEl) titleEl.textContent = `📋 ${title}`;
    currentSubmissionQuizId = quizId;
    showView('submissions');

    const listEl = document.getElementById('submissionsList');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">⏳ Đang tải danh sách bài nộp...</div>';

    get(ref(dbRT, `submissions/${quizId}`)).then(snapshot => {
        if (!snapshot.exists()) {
            listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">📭 Chưa có bài nộp nào.</div>';
            const cnt = document.getElementById('submissionsCount');
            if (cnt) cnt.textContent = '0';
            return;
        }
        const data = snapshot.val();
        const submissions = Object.entries(data).map(([id, sub]) => ({ id, ...sub }));
        submissions.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        const cnt = document.getElementById('submissionsCount');
        if (cnt) cnt.textContent = submissions.length;

        listEl.innerHTML = '';
        submissions.forEach(sub => {
            const p = sub.participant || {};
            const avatarUrl = p.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.displayName || 'A')}&background=6366f1&color=fff&size=48&bold=true`;
            const time = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : 'Không rõ';
            const hasFinalScore = sub.finalScore !== null && sub.finalScore !== undefined;
            const scoreBadge = hasFinalScore
                ? `<span style="color:#16a34a;font-weight:700;font-size:1rem;">🏅 ${sub.finalScore} điểm</span>`
                : `<span style="color:#6366f1;font-size:0.9rem;">Tự động: ${sub.autoScore || 0}</span>`;

            const card = document.createElement('div');
            card.style.cssText = 'background:var(--bg-card,white);border:1px solid var(--border,#e2e8f0);border-radius:16px;padding:16px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:all 0.2s;';
            card.onmouseover = () => { card.style.boxShadow = '0 6px 20px rgba(99,102,241,0.15)'; card.style.borderColor = '#c7d2fe'; };
            card.onmouseout = () => { card.style.boxShadow = 'none'; card.style.borderColor = 'var(--border,#e2e8f0)'; };
            card.innerHTML = `
                <img src="${avatarUrl}" style="width:48px;height:48px;border-radius:50%;border:2px solid #e0e7ff;flex-shrink:0;" onerror="this.src='https://ui-avatars.com/api/?name=A&background=6366f1&color=fff&size=48'">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;color:var(--text-main,#1e293b);font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.displayName || 'Ẩn danh'}</div>
                    <div style="color:#94a3b8;font-size:0.8rem;margin-top:3px;">🕐 ${time}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">${scoreBadge}</div>
                <span style="color:#c7d2fe;font-size:1.4rem;flex-shrink:0;">›</span>
            `;
            card.onclick = () => window.viewSubmissionDetail(quizId, sub.id, sub);
            listEl.appendChild(card);
        });
    }).catch(e => {
        if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;">❌ Lỗi tải bài nộp: ${e.message}</div>`;
    });
};

// --- Xem chi tiết 1 bài làm + chấm điểm (A chấm B) ---
window.viewSubmissionDetail = function(quizId, submissionId, submissionData) {
    currentViewingSubmission = { quizId, submissionId, data: submissionData };
    const quiz = mockQuizzes.find(q => q && q.id === quizId);
    const p = submissionData.participant || {};
    const avatarUrl = p.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.displayName || 'A')}&background=6366f1&color=fff&size=48&bold=true`;

    const titleEl = document.getElementById('submissionDetailTitle');
    if (titleEl) titleEl.innerHTML = `<img src="${avatarUrl}" style="width:36px;height:36px;border-radius:50%;vertical-align:middle;margin-right:8px;"> Bài làm của <strong>${p.displayName || 'Ẩn danh'}</strong>`;

    const backBtn = document.getElementById('btnBackToSubmissions');
    if (backBtn) backBtn.onclick = () => window.viewSubmissions(quizId);

    showView('submissionDetail');

    const content = document.getElementById('submissionDetailContent');
    if (!content) return;
    content.innerHTML = '';

    if (!quiz || !quiz.questions) {
        content.innerHTML = '<p style="color:#ef4444">Không tìm thấy dữ liệu bộ đề.</p>';
        return;
    }

    // Flatten questions (tương tự confirmStart)
    const flatQs = [];
    (quiz.questions || []).forEach(q => {
        if (!q) return;
        if (q.type === 'reading_group') {
            (q.subQuestions || []).forEach(sq => flatQs.push({ ...sq, groupText: q.passage, section: q.section }));
        } else {
            flatQs.push(q);
        }
    });

    let autoScore = 0;
    flatQs.forEach((q, idx) => {
        if (!q) return;
        const userAnswer = (submissionData.answers || {})[String(q.id)];
        const isOpen = q.isOpen || q.correctIndex === null || q.correctIndex === undefined;
        const options = q.options || [];
        const qType = q.type || 'multiple_choice';

        let isCorrect = null;
        if (!isOpen && (qType === 'multiple_choice' || qType === 'true_false') && userAnswer !== undefined && userAnswer !== null) {
            isCorrect = parseInt(userAnswer) === parseInt(q.correctIndex);
            if (isCorrect) autoScore++;
        }

        const card = document.createElement('div');
        card.style.cssText = 'background:var(--bg-card,white);border:1px solid var(--border,#e2e8f0);border-radius:14px;padding:18px 20px;';

        // Badge trạng thái
        let statusBadge = '';
        if (isOpen) {
            statusBadge = '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:8px;font-size:0.75rem;font-weight:600;flex-shrink:0;">🖊️ Câu mở</span>';
        } else if (userAnswer === undefined || userAnswer === null) {
            statusBadge = '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:8px;font-size:0.75rem;font-weight:600;flex-shrink:0;">⬜ Bỏ qua</span>';
        } else if (isCorrect) {
            statusBadge = '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:8px;font-size:0.75rem;font-weight:600;flex-shrink:0;">✅ Đúng</span>';
        } else {
            statusBadge = '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:8px;font-size:0.75rem;font-weight:600;flex-shrink:0;">❌ Sai</span>';
        }

        // Hiển thị các lựa chọn
        const optionsHtml = options.map((opt, i) => {
            const letter = ['A', 'B', 'C', 'D', 'E'][i] || i;
            const isChosen = userAnswer !== undefined && userAnswer !== null && parseInt(userAnswer) === i;
            const isCorrectOpt = !isOpen && parseInt(q.correctIndex) === i;
            let bg = 'transparent'; let border = '#e2e8f0'; let color = 'var(--text-main,#374151)'; let prefix = '○ ';
            if (isChosen && isOpen) { bg = '#ede9fe'; border = '#c4b5fd'; color = '#5b21b6'; prefix = '● '; }
            else if (isChosen && !isOpen) {
                bg = isCorrect ? '#dcfce7' : '#fee2e2';
                border = isCorrect ? '#86efac' : '#fca5a5';
                color = isCorrect ? '#15803d' : '#991b1b';
                prefix = '● ';
            } else if (!isOpen && isCorrectOpt && !isChosen) {
                bg = '#f0fdf4'; border = '#86efac'; color = '#15803d';
            }
            return `<div style="padding:8px 12px;border-radius:8px;border:1.5px solid ${border};background:${bg};color:${color};margin-bottom:6px;font-size:0.9rem;">${prefix}<strong>${letter}.</strong> ${opt}</div>`;
        }).join('');

        // Chấm câu mở (A chấm)
        const manualGrades = submissionData.manualGrades || {};
        const manualGradeHtml = isOpen ? `
            <div style="margin-top:10px;padding:10px 14px;background:#fefce8;border-radius:10px;border:1px solid #fde68a;">
                <span style="font-size:0.82rem;color:#92400e;font-weight:600;">A đánh giá câu này:</span>
                <div style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap;">
                    <button onclick="window.__gradeOpen('${q.id}', true)" style="padding:5px 12px;background:#22c55e;color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:600;">✅ Phù hợp</button>
                    <button onclick="window.__gradeOpen('${q.id}', false)" style="padding:5px 12px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:600;">❌ Chưa phù hợp</button>
                    <span id="grade-status-${q.id}" style="font-size:0.82rem;color:#92400e;">${manualGrades[q.id] === true ? '✅ Đã đánh giá: Phù hợp' : manualGrades[q.id] === false ? '❌ Đã đánh giá: Chưa phù hợp' : '(Chưa đánh giá)'}</span>
                </div>
            </div>
        ` : '';

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px;">
                <strong style="color:var(--text-main,#1e293b);font-size:0.95rem;line-height:1.4;">Câu ${idx + 1}: ${q.text || ''}</strong>
                ${statusBadge}
            </div>
            ${optionsHtml}
            ${manualGradeHtml}
        `;
        content.appendChild(card);
    });

    // Hiển thị ô chấm điểm tổng
    const gradeBox = document.getElementById('submissionGradeBox');
    if (gradeBox) {
        gradeBox.style.display = 'block';
        const autoEl = document.getElementById('autoScoreDisplay');
        if (autoEl) autoEl.textContent = autoScore;
        const finalInput = document.getElementById('finalScoreInput');
        if (finalInput) finalInput.value = (submissionData.finalScore !== null && submissionData.finalScore !== undefined) ? submissionData.finalScore : '';
    }
};

// --- A chấm câu mở (đúng/sai) ---
window.__gradeOpen = function(questionId, isGood) {
    if (!currentViewingSubmission) return;
    const { quizId, submissionId } = currentViewingSubmission;
    const gradeRef = ref(dbRT, `submissions/${quizId}/${submissionId}/manualGrades/${questionId}`);
    set(gradeRef, isGood).then(() => {
        if (!currentViewingSubmission.data.manualGrades) currentViewingSubmission.data.manualGrades = {};
        currentViewingSubmission.data.manualGrades[questionId] = isGood;
        const statusEl = document.getElementById(`grade-status-${questionId}`);
        if (statusEl) statusEl.textContent = isGood ? '✅ Đã đánh giá: Phù hợp' : '❌ Đã đánh giá: Chưa phù hợp';
    }).catch(e => console.error('[TRONEX] gradeOpen error:', e));
};

// --- A lưu điểm tổng cuối cùng ---
window.__saveFinalScore = function() {
    if (!currentViewingSubmission) return;
    const { quizId, submissionId } = currentViewingSubmission;
    const input = document.getElementById('finalScoreInput');
    const score = parseFloat(input ? input.value : '');
    if (isNaN(score)) { alert('Vui lòng nhập điểm hợp lệ!'); return; }
    set(ref(dbRT, `submissions/${quizId}/${submissionId}/finalScore`), score).then(() => {
        currentViewingSubmission.data.finalScore = score;
        const msg = document.getElementById('savedScoreMsg');
        if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 3000); }
    }).catch(e => alert('Lỗi lưu điểm: ' + e.message));
};

// ============================================================
// === DEEP LINK: v-act.html?quiz=quizId (Chia sẻ đề trực tiếp) ===
// ============================================================
(function handleDeepLink() {
    try {
        const params = new URLSearchParams(window.location.search);
        const deepQuizId = params.get('quiz');
        if (!deepQuizId) return;
        console.log('[TRONEX] Deep link quiz ID:', deepQuizId);
        // Thử start ngay, retry nếu quiz chưa load
        const tryStart = (retries) => {
            const quiz = mockQuizzes.find(q => q && q.id === deepQuizId);
            if (quiz) {
                window.startQuiz(deepQuizId);
            } else if (retries < 15) {
                setTimeout(() => tryStart(retries + 1), 400);
            } else {
                console.warn('[TRONEX] Deep link: không tìm thấy quiz', deepQuizId);
            }
        };
        setTimeout(() => tryStart(0), 600);
    } catch (e) { console.warn('[TRONEX] Deep link error:', e); }
})();
