import { mockQuizzes } from './data.js?v=93';
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

const isVACTPage = window.location.pathname.toLowerCase().includes('v-act') || !!document.getElementById('quizListView');
const FIREBASE_ROOT = isVACTPage ? 'VACT' : 'public_quizzes';
const LOCAL_STORAGE_KEY = isVACTPage ? 'trongbeshop_vact_quizzes' : 'trongbeshop_custom_quizzes';
export function checkIsAdmin() {
    if (localStorage.getItem("admin_secret_key") === "trongbeshop") return true;
    if (typeof window.isUserAdmin === 'function' && window.isUserAdmin()) return true;
    const user = window.__tronexCurrentUser;
    if (user) {
        const email = (user.email || '').toLowerCase().trim();
        if (email === 'nguyentrong0398787723@gmail.com' || email.includes('trongbeshop') || user.isAdmin) {
            localStorage.setItem("admin_secret_key", "trongbeshop");
            return true;
        }
    }
    try {
        const local = JSON.parse(localStorage.getItem('tronex_user') || '{}');
        const email = (local.email || '').toLowerCase().trim();
        if (email === 'nguyentrong0398787723@gmail.com' || email.includes('trongbeshop') || local.isAdmin) {
            localStorage.setItem("admin_secret_key", "trongbeshop");
            return true;
        }
    } catch(e) {}
    return false;
}
window.checkIsAdmin = checkIsAdmin;
const isAdmin = checkIsAdmin;

// Quản lý danh sách các bộ đề đã bị Admin xóa vĩnh viễn (kể cả đề mặc định từ data.js)
const localDeletedQuizzes = JSON.parse(localStorage.getItem('tronex_deleted_quizzes') || '[]');
window.__cloudDeletedQuizzes = {};

export function isQuizDeleted(quizId) {
    if (!quizId) return false;
    const qIdStr = quizId.toString().trim();
    if (localDeletedQuizzes.includes(qIdStr)) return true;
    if (window.__cloudDeletedQuizzes && window.__cloudDeletedQuizzes[qIdStr]) return true;
    return false;
}
window.isQuizDeleted = isQuizDeleted;



if (isVACTPage) {
    // Giữ lại tất cả đề V-ACT / ĐGNL / Chương / Ôn tập / Hóa / Advertisement từ data.js
    const vactQuizzes = mockQuizzes.filter(q => q && q.id && (q.id.endsWith('_dgnl') || q.id.startsWith('de_') || q.id.startsWith('vact_') || q.id.startsWith('on_tap_') || q.id.includes('chuong_') || q.id.includes('advertisement') || q.category === 'hoa' || q.category === 'anh'));
    mockQuizzes.length = 0;
    mockQuizzes.push(...vactQuizzes);

    // Backup các đề seed V-ACT từ data.js
    window.__vactSeedBackup = [...vactQuizzes];
} else {
    // Ở trang chủ, giữ lại tất cả các đề từ data.js
    const homeQuizzes = mockQuizzes.filter(q => q && q.id);
    mockQuizzes.length = 0;
    mockQuizzes.push(...homeQuizzes);
    window.__vactSeedBackup = [...homeQuizzes];
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

// === HELPER: Đếm chính xác tổng số câu hỏi (bao gồm cả subQuestions trong bài đọc) ===
function getQuizQuestionCount(quiz) {
    if (!quiz || !quiz.questions || !Array.isArray(quiz.questions)) return 0;
    let count = 0;
    quiz.questions.forEach(q => {
        if (q && q.type === 'reading_group' && Array.isArray(q.subQuestions)) {
            count += q.subQuestions.length;
        } else {
            count += 1;
        }
    });
    return count;
}
window.getQuizQuestionCount = getQuizQuestionCount;

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
        // Tự động kích hoạt Zen Mode khi vào làm bài thi, tắt khi rời khỏi
        if (typeof toggleZenMode === 'function') {
            toggleZenMode(viewName === 'active');
        }
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

        // Xác định môn học / loại đề để hiển thị badge và accent bar
        let subjectBadge = '';
        let accentClass = 'accent-default';
        const qCount = getQuizQuestionCount(quiz);
        const titleLower = ((quiz.title || '') + ' ' + (quiz.id || '')).toLowerCase();
        if (qCount === 120 || quiz.category === 'vnu' || (quiz.id && quiz.id.endsWith('_dgnl'))) {
            subjectBadge = '<span class="quiz-pill-badge badge-vnu">🎓 VNU-ĐGNL</span>';
            accentClass = 'accent-vnu';
        } else if (quiz.category === 'hoa' || titleLower.includes('hóa') || titleLower.includes('ester') || titleLower.includes('lipid') || titleLower.includes('carbohydrate') || (quiz.id && (quiz.id.includes('chuong_1') || quiz.id.includes('chuong_2')))) {
            subjectBadge = '<span class="quiz-pill-badge badge-hoa">🧪 Hóa học</span>';
            accentClass = 'accent-hoa';
        } else if (quiz.category === 'anh' || titleLower.includes('anh') || titleLower.includes('english') || titleLower.includes('advertisement')) {
            subjectBadge = '<span class="quiz-pill-badge badge-anh">🇬🇧 Tiếng Anh</span>';
            accentClass = 'accent-anh';
        } else if (quiz.category === 'toan' || titleLower.includes('toán') || titleLower.includes('math')) {
            subjectBadge = '<span class="quiz-pill-badge badge-toan">📐 Toán học</span>';
            accentClass = 'accent-toan';
        }

        const privacyBadge = (quiz.privacy === 'public' || !quiz.privacy) 
            ? '<span class="quiz-pill-badge badge-public">🌍 Công Khai</span>' 
            : '<span class="quiz-pill-badge badge-private">🔒 Riêng tư</span>';

        const isDgnl120Quiz = (qCount === 120);
        const scaleBadge = !isDgnl120Quiz 
            ? '<span class="quiz-pill-badge badge-toan">🎯 Thang 10</span>' 
            : '<span class="quiz-pill-badge badge-vnu">🎯 Thang 1200</span>';

        // Build card HTML với top accent bar, modern pill badges và button glow
        card.innerHTML = `
            <div class="quiz-card-accent-bar ${accentClass}"></div>
            <div class="quiz-card-content" style="display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
                <div>
                    <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; line-height: 1.4;">${quiz.title}</h3>
                    <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.55; margin-bottom: 16px;">${quiz.description}</p>
                    ${quiz.createdBy ? `
                        <div class="quiz-card-author" style="margin-bottom: 14px;">
                            <img src="${quiz.createdBy.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(quiz.createdBy.displayName || 'U')}&background=6366f1&color=fff&size=48`}" 
                                 alt="${quiz.createdBy.displayName || ''}"
                                 onerror="this.src='https://ui-avatars.com/api/?name=U&background=6366f1&color=fff&size=48'">
                            <span style="font-size: 0.82rem; font-weight: 500; color: var(--text-muted);">${quiz.createdBy.displayName || 'Ẩn danh'}</span>
                        </div>` : ''}
                    <div class="tags-container" style="margin-bottom: 22px; display: flex; align-items: center; flex-wrap: wrap; gap: 7px;">
                        ${subjectBadge}
                        ${privacyBadge}
                        <span class="quiz-pill-badge badge-meta">📚 Số câu: ${qCount}</span>
                        ${scaleBadge}
                        <span class="quiz-pill-badge badge-meta quiz-views" id="views-${quiz.id}">👀 Lượt xem: ${quiz.viewCount || 0}</span>
                    </div>
                </div>
                <div class="card-btn-row" style="display: flex; gap: 10px; margin-top: auto;">
                    <button class="btn btn-primary card-start-btn" style="flex: 1; padding: 11px 18px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;" type="button"
                        onclick="window.__sq('${quiz.id}')">
                        <span>🚀 Bắt Đầu Làm Bài</span>
                    </button>
                    ${isQuizOwner(quiz.id) ? `
                        <button class="btn btn-outline card-edit-btn" style="padding: 10px 14px; color: #3B82F6; border-color: #3B82F6; border-radius: var(--radius-md);" type="button" title="Chỉnh sửa đề này">✏️</button>
                        <button class="btn btn-outline card-del-btn" style="padding: 10px 14px; color: #EF4444; border-color: #EF4444; border-radius: var(--radius-md);" type="button" title="Xóa đề này">🗑️</button>
                        <button class="btn btn-outline card-submissions-btn" style="padding: 10px 14px; color: #16a34a; border-color: #16a34a; border-radius: var(--radius-md);" type="button" title="Xem bài nộp">📋</button>
                        <button class="btn btn-outline card-share-btn" style="padding: 10px 14px; color: #8b5cf6; border-color: #8b5cf6; border-radius: var(--radius-md);" type="button" title="Sao chép link chia sẻ">🔗</button>
                    ` : ""}
                </div>
            </div>
        `;

        // Cho phép bấm vào bất kỳ vị trí nào trên thẻ để bắt đầu cấu hình
        card.style.cursor = 'pointer';
        card.addEventListener('click', function (e) {
            if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
            if (typeof window.startQuiz === 'function') {
                window.startQuiz(quiz.id);
            }
        });

        // === v73: Gắn listener TRỰC TIẾP vào button ngay sau render ===
        // Đây là cách đáng tin cậy 100%, không phụ thuộc onclick attribute hay event delegation
        const startBtn = card.querySelector('.card-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function (e) {
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
            editBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                editCustomQuiz(quiz.id);
            });
        }
        const delBtn = card.querySelector('.card-del-btn');
        if (delBtn) {
            delBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                deleteCustomQuiz(quiz.id);
            });
        }
        // Nút xem bài nộp
        const subsBtn = card.querySelector('.card-submissions-btn');
        if (subsBtn) {
            subsBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                window.viewSubmissions(quiz.id);
            });
        }
        // Nút sao chép link chia sẻ
        const shareBtn = card.querySelector('.card-share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', function (e) {
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
    if (checkIsAdmin()) return true;
    const targetId = id.toString().trim();
    try {
        const uid = localStorage.getItem('tronex_uid') || window.__tronexCurrentUser?.uid;
        if (uid) {
            const quiz = mockQuizzes.find(q => q && (q.id || '').toString().trim() === targetId);
            if (quiz && quiz.createdBy && quiz.createdBy.uid === uid) return true;
        }
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.some(q => q && (q.id || '').toString().trim() === targetId);
        }
    } catch (e) { }
    return false;
}

window.deleteCustomQuiz = function (id) {
    const isAdm = checkIsAdmin();
    const idx = mockQuizzes.findIndex(q => q && (q.id || '').toString().trim() === (id || '').toString().trim());
    if (idx === -1) return;

    const quiz = mockQuizzes[idx];
    const isPublic = quiz.privacy === 'public';
    const isOwner = isQuizOwner(id);

    const deleteModal = document.getElementById('deleteConfirmModal');
    const btnHideLocal = document.getElementById('btnHideLocal');
    const btnDeleteFirebase = document.getElementById('btnDeleteFirebase');

    if (deleteModal) deleteModal.style.display = 'flex';

    if (isAdm || isOwner) {
        if (btnDeleteFirebase) btnDeleteFirebase.style.display = 'block';
    } else {
        if (btnDeleteFirebase) btnDeleteFirebase.style.display = 'none';
    }

    if (btnHideLocal) {
        btnHideLocal.onclick = () => {
            mockQuizzes.splice(idx, 1);
            if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();
            initQuizList();
            closeDeleteModal();
            alert('Đã ẩn đề khỏi máy của bạn.');
        };
    }

    if (btnDeleteFirebase) {
        btnDeleteFirebase.onclick = () => {
            const msg = isAdm ? '[ADMIN] Xóa vĩnh viễn đề này khỏi toàn bộ hệ thống (kể cả khi tải lại trang)?' : 'Bạn là chủ đề này. Xóa vĩnh viễn khỏi toàn hệ thống?';
            if (confirm(msg)) {
                const qIdStr = (id || '').toString().trim();
                
                // 1. Đánh dấu xóa vào danh sách deleted_quizzes để không bao giờ bị seed lại
                if (!localDeletedQuizzes.includes(qIdStr)) {
                    localDeletedQuizzes.push(qIdStr);
                    localStorage.setItem('tronex_deleted_quizzes', JSON.stringify(localDeletedQuizzes));
                }
                if (window.__cloudDeletedQuizzes) {
                    window.__cloudDeletedQuizzes[qIdStr] = true;
                }

                // 2. Ghi nhận xóa triệt để trên Cloud
                try {
                    set(ref(dbRT, 'deleted_quizzes/' + qIdStr), true).catch(() => {});
                    set(ref(dbRT, 'VACT/' + qIdStr), null).catch(() => {});
                    set(ref(dbRT, 'public_quizzes/' + qIdStr), null).catch(() => {});
                    set(ref(dbRT, 'quiz_views/' + qIdStr), null).catch(() => {});
                    set(ref(dbRT, 'submissions/' + qIdStr), null).catch(() => {});
                } catch(e) {}

                // 3. Xóa trong memory & backup
                mockQuizzes.splice(idx, 1);
                if (window.__vactSeedBackup) {
                    window.__vactSeedBackup = window.__vactSeedBackup.filter(q => q && (q.id || '').toString().trim() !== qIdStr);
                }
                if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();

                const uid = localStorage.getItem('tronex_uid');
                if (!isAdm && uid && typeof window.__deletePrivateQuiz === 'function') {
                    window.__deletePrivateQuiz(uid, id);
                }

                initQuizList();
                closeDeleteModal();
                alert(isAdm ? '✅ [ADMIN] Đã xóa vĩnh viễn đề thi thành công! Đề sẽ không bao giờ xuất hiện lại kể cả khi tải lại trang.' : 'Đã xóa vĩnh viễn đề thi thành công!');
            }
        };
    }
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

    // v69: Nếu không tìm thấy quiz trong mockQuizzes, khôi phục từ backup
    if (!currentQuiz && window.__vactSeedBackup) {
        const backupQuiz = window.__vactSeedBackup.find(q => q && (q.id || '').toString().trim() === (quizId || '').toString().trim());
        if (backupQuiz) {
            console.warn(`[TRONEX] ${quizId} bị mất khỏi mockQuizzes! Đang khôi phục từ backup...`);
            mockQuizzes.unshift(backupQuiz);
            currentQuiz = backupQuiz;
        }
    }

    if (!currentQuiz || !currentQuiz.questions) {
        console.error('[TRONEX] startQuiz thất bại! quizId:', quizId, '| mockQuizzes:', mockQuizzes.map(q => q?.id));
        alert('⚠️ Lỗi: Không tìm thấy bộ đề "' + quizId + '". Vui lòng reload trang và thử lại.');
        return;
    }

    document.getElementById('setupQuizTitle').textContent = `Cấu hình: ${currentQuiz.title}`;

    // Khởi tạo bộ chọn phần ôn tập nếu đề có selectableSections
    renderSectionSelector(currentQuiz);

    // Điền tên thí sinh sẵn có nếu có
    const user = window.__currentUser || null; // từ auth.js
    const setupNameInput = document.getElementById('setupParticipantNameInput');
    const modalNameInput = document.getElementById('participantNameInput');
    if (setupNameInput) {
        if (user && user.displayName) {
            setupNameInput.value = user.displayName;
        } else if (currentParticipant && currentParticipant.displayName && currentParticipant.displayName !== 'Ẩn danh') {
            setupNameInput.value = currentParticipant.displayName;
        }
    }
    if (modalNameInput && setupNameInput) {
        modalNameInput.value = setupNameInput.value;
    }

    // Đưa thẳng người dùng tới màn hình Cấu hình & Chọn phần ôn tập
    const modal = document.getElementById('participantModal');
    if (modal) modal.style.display = 'none';
    showView('setup');
};

// === BỘ CHỌN PHẦN ÔN TẬP LINH HOẠT CHO ĐỀ THI ===
function renderSectionSelector(quiz) {
    const container = document.getElementById('setupSectionSelectorContainer');
    if (!container) return;

    if (!quiz || !quiz.selectableSections || !Array.isArray(quiz.selectableSections) || quiz.selectableSections.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    // Tính tổng số câu hỏi chính xác từ selectableSections
    const totalQCount = quiz.selectableSections.reduce((sum, s) => sum + (s.count || 0), 0);
    
    // Gom nhóm theo thuộc tính group
    const groups = {};
    quiz.selectableSections.forEach(sec => {
        const grp = sec.group || 'Phần ôn tập';
        if (!groups[grp]) groups[grp] = [];
        groups[grp].push(sec);
    });

    let groupsHtml = '';
    Object.entries(groups).forEach(([grpName, secs]) => {
        const groupTotal = secs.reduce((sum, s) => sum + (s.count || 0), 0);
        let itemsHtml = '';
        secs.forEach(s => {
            itemsHtml += `
                <label class="section-option-card" title="Tích chọn để luyện phần này">
                    <input type="checkbox" name="quizSectionSelect" value="${s.id}" data-count="${s.count || 0}" checked>
                    <span class="custom-sec-check"></span>
                    <div class="sec-text-wrap">
                        <span class="sec-name">${s.name}</span>
                        <span class="sec-badge">${s.count} câu</span>
                    </div>
                </label>
            `;
        });

        groupsHtml += `
            <div class="section-group-block">
                <div class="section-group-header">
                    <span class="section-group-title">${grpName}</span>
                    <span class="section-group-pill">${groupTotal} câu</span>
                </div>
                <div class="section-items-grid">
                    ${itemsHtml}
                </div>
            </div>
        `;
    });

    // Lấy danh sách presets tương ứng với từng bộ đề thi
    let presets = [];
    if (Array.isArray(quiz.presets) && quiz.presets.length > 0) {
        presets = quiz.presets;
    } else {
        // Tự động sinh preset tổng và theo từng nhóm nếu chưa định nghĩa sẵn
        const allIds = quiz.selectableSections.map(s => s.id);
        presets.push({
            id: 'all',
            label: `✨ Toàn bộ đề (${totalQCount} câu)`,
            sectionIds: allIds
        });
        Object.entries(groups).forEach(([grpName, secs]) => {
            const grpCount = secs.reduce((sum, s) => sum + (s.count || 0), 0);
            if (secs.length < quiz.selectableSections.length) {
                presets.push({
                    id: `grp_${secs.map(s => s.id).join('_')}`,
                    label: `📁 ${grpName} (${grpCount} câu)`,
                    sectionIds: secs.map(s => s.id)
                });
            }
        });
    }

    const presetsHtml = presets.map((p, idx) => {
        return `<button type="button" class="preset-pill-btn ${idx === 0 ? 'active' : ''}" data-preset-id="${p.id}">${p.label}</button>`;
    }).join('\n');

    const subtitleText = quiz.selectorSubtitle || (quiz.category === 'hoa' 
        ? 'Hệ thống cho phép chọn ôn từng chương trắc nghiệm, đúng/sai hoặc câu hỏi ngắn' 
        : (quiz.category === 'anh'
            ? 'Lựa chọn ôn toàn bộ đề hoặc linh hoạt chọn riêng từng phần Trắc nghiệm / Viết câu của Phần A hoặc Phần B'
            : 'Chọn một hoặc nhiều phần bên dưới để tùy chỉnh nội dung bài làm phù hợp'));

    container.innerHTML = `
        <div class="section-selector-card">
            <div class="selector-header-row">
                <div class="selector-title-wrap">
                    <span class="selector-icon">🎯</span>
                    <div>
                        <h4 class="selector-title">Chọn phần bạn muốn ôn tập:</h4>
                        <p class="selector-subtitle">${subtitleText}</p>
                    </div>
                </div>
            </div>

            <!-- Nút chọn nhanh (Preset Pills) -->
            <div class="selector-presets-row">
                ${presetsHtml}
            </div>

            <div class="selector-groups-container">
                ${groupsHtml}
            </div>

            <div class="selector-footer-bar">
                <span class="selector-status-info">⚡ Đang chọn: <strong id="selectedSecCountText">${totalQCount} câu hỏi</strong></span>
                <span class="selector-hint-text">💡 Bạn có thể chọn 1 hoặc nhiều phần kết hợp cùng lúc</span>
            </div>
        </div>
    `;

    container.style.display = 'block';

    const checkboxes = container.querySelectorAll('input[name="quizSectionSelect"]');
    const countDisplay = container.querySelector('#selectedSecCountText');
    const presetBtns = container.querySelectorAll('.preset-pill-btn');

    function updateCount() {
        let selectedCount = 0;
        let selectedSecs = 0;
        const selectedIds = [];
        checkboxes.forEach(cb => {
            if (cb.checked) {
                selectedCount += parseInt(cb.dataset.count || '0');
                selectedSecs++;
                selectedIds.push(cb.value);
            }
        });
        if (countDisplay) {
            countDisplay.textContent = `${selectedCount} câu hỏi (${selectedSecs} phần)`;
        }

        // Cập nhật trạng thái active của các preset buttons chính xác theo sectionIds
        presetBtns.forEach(btn => {
            const pId = btn.dataset.presetId;
            const targetPreset = presets.find(p => p.id === pId);
            if (targetPreset && Array.isArray(targetPreset.sectionIds)) {
                const isMatch = targetPreset.sectionIds.length === selectedIds.length &&
                    targetPreset.sectionIds.every(id => selectedIds.includes(id));
                btn.classList.toggle('active', isMatch);
            }
        });
    }

    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateCount);
    });

    presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const pId = btn.dataset.presetId;
            const targetPreset = presets.find(p => p.id === pId);
            if (targetPreset && Array.isArray(targetPreset.sectionIds)) {
                checkboxes.forEach(cb => {
                    cb.checked = targetPreset.sectionIds.includes(cb.value);
                });
                updateCount();
            }
        });
    });

    updateCount();
}

// === XÁC NHẬN PARTICIPANT VÀ VÀO SETUP ===
window.__confirmParticipant = function () {
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

    // Đảm bảo bộ chọn phần ôn tập được cập nhật trước khi hiển thị setup view
    renderSectionSelector(currentQuiz);
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

        // Cập nhật thông tin thí sinh từ ô nhập trên setupView
        const user = window.__currentUser || null;
        if (user && user.displayName) {
            currentParticipant = { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL || null };
        } else {
            const enteredName = (document.getElementById('setupParticipantNameInput')?.value || document.getElementById('participantNameInput')?.value || '').trim();
            currentParticipant = { uid: null, displayName: enteredName || 'Ẩn danh', photoURL: null };
        }

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

        // Lọc theo các phần ôn tập được tích chọn (nếu đề có selectableSections)
        if (currentQuiz.selectableSections && currentQuiz.selectableSections.length > 0) {
            const checkedBoxes = document.querySelectorAll('input[name="quizSectionSelect"]:checked');
            if (checkedBoxes.length === 0) {
                alert('⚠️ Vui lòng chọn ít nhất một phần ôn tập để bắt đầu làm bài!');
                return;
            }
            const selectedSecIds = Array.from(checkedBoxes).map(cb => cb.value);
            const activeSections = currentQuiz.selectableSections.filter(s => selectedSecIds.includes(s.id));
            const activeMatchNames = activeSections.map(s => s.section);
            flattenedQs = flattenedQs.filter(q => activeMatchNames.includes(q.section));

            if (activeSections.length < currentQuiz.selectableSections.length) {
                currentQuizTitle.textContent = `${currentQuiz.title} (${activeSections.map(s => s.name).join(' + ')})`;
            } else {
                currentQuizTitle.textContent = currentQuiz.title;
            }
        } else {
            currentQuizTitle.textContent = currentQuiz.title;
        }

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
                    const quizRef = ref(dbRT, 'quiz_views/' + currentQuiz.id);
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
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('tronexSidebar');
            if (sidebar) sidebar.classList.add('minimized');
        }
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

        // Click chuột phải để Đánh dấu xem lại (Flag for Review)
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            toggleFlagQuestion(q.id);
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
            passageDiv.style.cssText = 'padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid var(--border); border-left: 5px solid var(--primary); background: var(--bg-surface); color: var(--text-main); font-size: 1.05rem; line-height: 1.7; white-space: pre-wrap; box-shadow: var(--shadow-sm);';
            passageDiv.innerHTML = q.groupText;
            questionsContainer.appendChild(passageDiv);
            lastGroupText = q.groupText;
        }

        const qBlock = document.createElement('div');
        qBlock.className = 'question-card';
        qBlock.id = `q-block-${q.id}`;

        const qHeader = document.createElement('div');
        qHeader.className = 'q-card-header';
        const qNumDisplay = q.qNumber || sectionQuestionIndex;

        // Làm sạch text nếu AI lỡ viết đúp "Câu X:"
        const cleanText = (q.text || '').replace(/^Câu\s+\d+[:.]\s*/i, '').trim();
        qHeader.innerHTML = `
            <span class="q-card-title">Câu ${qNumDisplay}</span>
            <div style="display:flex; gap:8px; align-items:center;">
                <button type="button" class="btn-flag-review" onclick="toggleFlagQuestion('${q.id}')" title="Đánh dấu câu hỏi để xem lại sau">🚩 Đánh dấu</button>
                <button type="button" class="btn-ask-ai" onclick="askAiAboutQuestion(${index})">🤖 Hỏi AI</button>
            </div>
        `;
        qBlock.appendChild(qHeader);

        if (cleanText) {
            const textDiv = document.createElement('div');
            textDiv.className = 'question-text';
            textDiv.style.cssText = 'font-size: 1.05rem; line-height: 1.6; margin-bottom: 16px; font-weight: 500; white-space: pre-wrap;';
            textDiv.innerHTML = cleanText;
            qBlock.appendChild(textDiv);
        }

        const qImgSrc = q.imageSrc || q.imageData;
        if (qImgSrc) {
            const imgDiv = document.createElement('div');
            imgDiv.className = 'question-image';
            imgDiv.innerHTML = `<img src="${qImgSrc}" alt="Hình minh họa">`;
            const imgEl = imgDiv.querySelector('img');
            imgEl.onclick = () => {
                if (window.showImageLightbox) window.showImageLightbox(qImgSrc);
            };
            qBlock.appendChild(imgDiv);
        } else if (q.diagramCode) {
            // v48: Hiển thị sơ đồ được vẽ bằng code (HTML/SVG/Table)
            const diagramDiv = document.createElement('div');
            diagramDiv.className = 'question-diagram';
            diagramDiv.style.cssText = 'background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-main); padding: 15px; border-radius: 8px; margin-bottom: 20px; overflow-x: auto;';
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
                const cleanOptText = typeof opt === 'string' ? opt.replace(/^[A-F][.:)\s]+\s*/i, '').trim() : opt;
                label.innerHTML = `
                    <input type="radio" name="question_${q.id}" value="${optIndex}">
                    <div class="tronex-opt-letter">${letter}</div>
                    <div class="tronex-opt-text">${cleanOptText}</div>
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
            input.style.cssText = 'max-width: 650px; width: 100%; margin-top: 10px; font-size: 0.95rem; padding: 10px 14px; border: 2px solid var(--border); background: var(--bg-surface); color: var(--text-main); border-radius: 8px; transition: all 0.3s ease;';

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
        } else if (qType === 'essay') {
            const textarea = document.createElement('textarea');
            textarea.className = 'form-control essay-input';
            textarea.name = `question_${q.id}`;
            textarea.rows = 4;
            textarea.placeholder = 'Nhập câu trả lời tự luận của bạn vào đây...';
            textarea.style.cssText = 'width: 100%; max-width: 650px; margin-top: 10px; font-size: 0.95rem; padding: 10px 14px; border: 2px solid var(--border); background: var(--bg-surface); color: var(--text-main); border-radius: 8px; transition: all 0.3s ease; resize: vertical;';
            optionsList.appendChild(textarea);
        } else if (qType === 'essay_group') {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'essay-group-container';
            (q.subQuestions || []).forEach(sq => {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'margin-bottom: 14px;';
                const label = document.createElement('label');
                label.innerHTML = `<strong>${sq.text}</strong>`;
                label.style.cssText = 'display: block; margin-bottom: 6px; font-size: 0.95rem;';
                const textarea = document.createElement('textarea');
                textarea.className = 'form-control essay-input';
                textarea.name = `question_${q.id}_${sq.id}`;
                textarea.rows = 2;
                textarea.placeholder = 'Nhập câu trả lời...';
                textarea.style.cssText = 'width: 100%; max-width: 650px; font-size: 0.9rem; padding: 8px 12px; border: 2px solid var(--border); background: var(--bg-surface); color: var(--text-main); border-radius: 8px; resize: vertical;';
                itemDiv.appendChild(label);
                itemDiv.appendChild(textarea);
                groupDiv.appendChild(itemDiv);
            });
            optionsList.appendChild(groupDiv);
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

    // Tự động khôi phục tiến trình làm bài đã lưu (nếu có)
    if (typeof loadProgress === 'function') {
        loadProgress();
    }
}
window.renderQuestions = renderQuestions;

// === CHẤM ĐIỂM (RESTORED v46) ===
if (quizForm) {
    quizForm.onsubmit = async function (e) {
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
                    const userVal = (formData.get(`question_${qId}`) || "").toString().trim();
                    if (userVal === "") unanswered++;
                    else if (checkShortAnswerMatch(userVal, q.correctAnswer)) correct++;
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
                } else if (qType === 'essay') {
                    const userVal = (formData.get(`question_${qId}`) || "").toString().trim();
                    if (userVal === "") {
                        unanswered++;
                    } else {
                        const diff = computeTextDiff(userVal, q.correctAnswer || "");
                        if (diff.isPass) correct++;
                        else incorrect++;
                    }
                } else if (qType === 'essay_group') {
                    let isAllPass = true;
                    let isAnyUnanswered = false;
                    (q.subQuestions || []).forEach(sq => {
                        const userVal = (formData.get(`question_${qId}_${sq.id}`) || "").toString().trim();
                        if (userVal === "") isAnyUnanswered = true;
                        else {
                            const diff = computeTextDiff(userVal, sq.correctAnswer || "");
                            if (!diff.isPass) isAllPass = false;
                        }
                    });
                    if (isAnyUnanswered) unanswered++;
                    else if (isAllPass) correct++;
                    else incorrect++;
                }
            });

            showReviewMode(qs);
            renderResults(correct, incorrect, unanswered);
            if (typeof clearProgress === 'function') {
                clearProgress(); // Nộp bài thành công -> Dọn dẹp bản lưu nháp
            }

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
                    const totalQ = correct + incorrect + unanswered;
                    const isDgnl120 = (totalQ === 120);
                    const calculatedAutoScore = isDgnl120 
                        ? (correct * 10) 
                        : (totalQ > 0 ? Number(((correct * 10) / totalQ).toFixed(2)) : 0);
                    await set(subRef, {
                        participant: currentParticipant,
                        answers,
                        autoScore: calculatedAutoScore,
                        scoreScale: isDgnl120 ? 1200 : 10,
                        totalQuestions: totalQ,
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
        } else if (qType === 'essay') {
            const inputs = document.getElementsByName(`question_${qId}`);
            if (inputs.length > 0) {
                highlightEssay(q, inputs[0]);
            }
        } else if (qType === 'essay_group') {
            (q.subQuestions || []).forEach(sq => {
                const inputs = document.getElementsByName(`question_${qId}_${sq.id}`);
                if (inputs.length > 0) {
                    highlightEssaySub(sq, inputs[0]);
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
    const isDgnl120 = (total === 120);
    const scoreContainer = document.querySelector('.tronex-score');

    if (isDgnl120) {
        // Thang điểm 1200 cho đề chuẩn ĐGNL 120 câu (10đ mỗi câu đúng)
        score = (correct * 10).toString();
        if (scoreContainer) {
            scoreContainer.innerHTML = `<span id="tronexScoreText">${score}</span> / 1200`;
        }
    } else {
        // Thang điểm 10 cho TẤT CẢ các bộ đề khác:
        // Số điểm của 1 câu được chia đều sao cho khi làm đúng hết điểm sẽ đạt 10đ
        const rawScore = total > 0 ? ((correct * 10) / total) : 0;
        const rounded = Math.round(rawScore * 100) / 100;
        score = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '');
        if (scoreContainer) {
            scoreContainer.innerHTML = `<span id="tronexScoreText">${score}</span> / 10`;
        }
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

function checkShortAnswerMatch(userVal, correctVal) {
    if (!userVal) return false;
    const u = userVal.toString().trim().toLowerCase();
    const c = (correctVal || "").toString().trim().toLowerCase();
    if (!c) return false;
    if (u === c) return true;
    const acceptable = c.split(/[|\/]/).map(s => s.trim().toLowerCase());
    if (acceptable.includes(u)) return true;
    const norm = str => str.replace(/%/g, '').replace(/,/g, '.').trim();
    if (norm(u) === norm(c)) return true;
    for (const opt of acceptable) {
        if (norm(u) === norm(opt)) return true;
    }
    // Hỗ trợ câu văn viết: chuẩn hóa dấu câu ở cuối (chấm, phẩy), khoảng trắng thừa và dấu nháy
    const cleanSentence = str => str
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[.,;!?]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleanSentence(u) === cleanSentence(c)) return true;
    for (const opt of acceptable) {
        if (cleanSentence(u) === cleanSentence(opt)) return true;
    }
    return false;
}

function highlightShortAnswer(q, inputElement, isReview = false) {
    const userVal = inputElement.value.trim();
    const isCorrect = checkShortAnswerMatch(userVal, q.correctAnswer);

    inputElement.style.borderColor = '#E5E7EB';
    inputElement.style.backgroundColor = 'transparent';
    inputElement.style.color = 'inherit';

    // Nếu chưa nhập gì thì xóa định dạng, trừ khi đang ở chế độ xem lại
    if (userVal === "") {
        if (isReview) {
            inputElement.style.borderColor = '#EF4444';
            inputElement.style.backgroundColor = '#FEE2E2';
            inputElement.value = "Chưa làm. Đáp án: " + (q.correctAnswer && q.correctAnswer.includes('|') ? q.correctAnswer.split('|')[0] : q.correctAnswer);
            inputElement.style.color = '#991B1B';
        }
        return;
    }

    if (isCorrect) {
        inputElement.style.borderColor = '#10B981'; // Xanh lá
        inputElement.style.backgroundColor = '#D1FAE5';
        inputElement.style.color = '#065F46';
    } else {
        inputElement.style.borderColor = '#EF4444'; // Đỏ
        inputElement.style.backgroundColor = '#FEE2E2';
        inputElement.style.color = '#991B1B';
        if (isReview) {
            inputElement.title = "Đáp án đúng: " + (q.correctAnswer && q.correctAnswer.includes('|') ? q.correctAnswer.split('|')[0] : q.correctAnswer);
        }
    }
}

function computeTextDiff(userText, targetText) {
    const cleanStr = str => (str || '').toString().toLowerCase()
        .replace(/[.,;:!?()"'“”=\-+→]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    const userWords = (userText || '').toString().trim().split(/\s+/).filter(Boolean);
    const targetWords = (targetText || '').toString().trim().split(/\s+/).filter(Boolean);

    if (userWords.length === 0) {
        return { similarity: 0, isPass: false, html: '<span style="color: #EF4444; font-style: italic;">Chưa trả lời</span>', percent: 0 };
    }

    const normUser = userWords.map(cleanStr);
    const normTarget = targetWords.map(cleanStr);

    const m = normUser.length;
    const n = normTarget.length;

    // LCS Matrix
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (normUser[i - 1] === normTarget[j - 1] && normUser[i - 1] !== '') {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const lcsLen = dp[m][n];
    const similarity = n > 0 ? (lcsLen / n) : (m > 0 ? 1 : 0);
    const isPass = similarity >= 0.70;

    // Backtrack to find matched words in user text
    let i = m, j = n;
    const matchedUser = new Array(m).fill(false);
    while (i > 0 && j > 0) {
        if (normUser[i - 1] === normTarget[j - 1] && normUser[i - 1] !== '') {
            matchedUser[i - 1] = true;
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }

    const html = userWords.map((word, idx) => {
        if (matchedUser[idx]) {
            return `<span style="background-color: #D1FAE5; color: #065F46; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin: 0 1px; display: inline-block;">${escapeHTML(word)}</span>`;
        } else {
            return `<span style="background-color: #FEE2E2; color: #991B1B; padding: 2px 6px; border-radius: 4px; text-decoration: line-through; margin: 0 1px; display: inline-block;">${escapeHTML(word)}</span>`;
        }
    }).join(' ');

    return { similarity, isPass, html, percent: Math.round(similarity * 100) };
}

function escapeHTML(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlightEssay(q, textarea) {
    const parent = textarea.parentElement;
    const userText = textarea.value.trim();
    const diff = computeTextDiff(userText, q.correctAnswer || "");

    textarea.style.display = 'none';

    const resDiv = document.createElement('div');
    resDiv.className = 'essay-review-result';
    resDiv.style.cssText = 'margin-top: 10px; padding: 14px 18px; border-radius: 10px; background: var(--bg-surface); color: var(--text-main); border: 2px solid ' + (diff.isPass ? '#10B981' : '#EF4444') + '; box-shadow: var(--shadow-sm);';

    const statusBadge = diff.isPass
        ? `<span style="background: #10B981; color: #FFF; padding: 3px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; margin-left: 8px;">ĐÚNG (${diff.percent}%)</span>`
        : `<span style="background: #EF4444; color: #FFF; padding: 3px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; margin-left: 8px;">SAI (${diff.percent}%)</span>`;

    resDiv.innerHTML = `
        <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 6px; color: var(--text-main);">
            Bài làm của bạn: ${statusBadge}
        </div>
        <div style="line-height: 1.8; margin-bottom: 12px; font-size: 0.95rem; color: var(--text-main);">${diff.html}</div>
        <div style="background: rgba(59, 130, 246, 0.1); border-left: 4px solid #3B82F6; padding: 10px 14px; border-radius: 6px; font-size: 0.9rem; color: var(--text-main);">
            <strong style="color: #3B82F6;">📌 Đáp án gốc:</strong><br>${escapeHTML(q.correctAnswer || "")}
        </div>
    `;
    parent.appendChild(resDiv);
}

function highlightEssaySub(sq, textarea) {
    const parent = textarea.parentElement;
    const userText = textarea.value.trim();
    const diff = computeTextDiff(userText, sq.correctAnswer || "");

    textarea.style.display = 'none';

    const resDiv = document.createElement('div');
    resDiv.className = 'essay-review-result';
    resDiv.style.cssText = 'margin-top: 6px; padding: 12px 16px; border-radius: 8px; background: var(--bg-surface); color: var(--text-main); border: 2px solid ' + (diff.isPass ? '#10B981' : '#EF4444') + '; box-shadow: var(--shadow-sm);';

    const statusBadge = diff.isPass
        ? `<span style="background: #10B981; color: #FFF; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 6px;">ĐÚNG (${diff.percent}%)</span>`
        : `<span style="background: #EF4444; color: #FFF; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 6px;">SAI (${diff.percent}%)</span>`;

    resDiv.innerHTML = `
        <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; color: var(--text-main);">
            Kết quả: ${statusBadge}
        </div>
        <div style="line-height: 1.6; margin-bottom: 8px; font-size: 0.9rem; color: var(--text-main);">${diff.html}</div>
        <div style="background: rgba(59, 130, 246, 0.1); border-left: 4px solid #3B82F6; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; color: var(--text-main);">
            <strong style="color: #3B82F6;">📌 Đáp án gốc:</strong> ${escapeHTML(sq.correctAnswer || "")}
        </div>
    `;
    parent.appendChild(resDiv);
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

window.loadPublicQuizzes = async function () {
    try {
        // Tải danh sách đề đã bị xóa để lọc bỏ triệt để
        try {
            const delSnap = await get(ref(dbRT, 'deleted_quizzes'));
            if (delSnap.exists()) {
                window.__cloudDeletedQuizzes = delSnap.val() || {};
                let updated = false;
                Object.keys(window.__cloudDeletedQuizzes).forEach(delId => {
                    if (!localDeletedQuizzes.includes(delId)) {
                        localDeletedQuizzes.push(delId);
                        updated = true;
                    }
                });
                if (updated) {
                    localStorage.setItem('tronex_deleted_quizzes', JSON.stringify(localDeletedQuizzes));
                }

                // Lọc bỏ ngay khỏi memory
                for (let i = mockQuizzes.length - 1; i >= 0; i--) {
                    if (mockQuizzes[i] && isQuizDeleted(mockQuizzes[i].id)) {
                        mockQuizzes.splice(i, 1);
                    }
                }
                if (window.__vactSeedBackup) {
                    window.__vactSeedBackup = window.__vactSeedBackup.filter(q => q && !isQuizDeleted(q.id));
                }
            }
        } catch(e) {
            console.warn("⚠️ Kiểm tra deleted_quizzes:", e.message);
        }
        const handleSnapshot = (snapshot, sourceBranch) => {
            const data = snapshot.val();
            if (!data) return;
            let listChanged = false;

            Object.keys(data).forEach(key => {
                let pq = convertFirebaseData(data[key]);
                if (!pq) return;
                const pqId = key.toString().trim();
                const existingIdx = mockQuizzes.findIndex(q => q && (q.id || '').toString().trim() === pqId);

                // 1. Cập nhật lượt xem trực tiếp trên DOM và Memory
                if (pq.viewCount !== undefined) {
                    if (existingIdx !== -1) mockQuizzes[existingIdx].viewCount = pq.viewCount;
                    const viewEl = document.getElementById(`views-${pqId}`);
                    if (viewEl) {
                        if (viewEl.classList.contains('home-quiz-pill')) {
                            viewEl.innerHTML = `👁️ ${pq.viewCount} lượt`;
                        } else {
                            viewEl.innerHTML = `Lượt truy cập: ${pq.viewCount}`;
                        }
                    }
                }

                // 2. Xử lý nội dung đề thi - Firebase là nguồn chân lý (Không ghi đè tự động trong onValue để tránh vòng lặp giật giật)
                if (!pq.title || !pq.questions) return;
                if (!Array.isArray(pq.questions) || pq.questions.length === 0) return;

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

                // Cập nhật currentActiveQuiz nếu đang làm bài thi này
                if (window.currentActiveQuiz && (window.currentActiveQuiz.id || '').toString().trim() === pqId) {
                    window.currentActiveQuiz = pq;
                }
            });

            // Tự động seed đề TRONEX lên Firebase nếu chưa có
            if (isAdmin && isVACTPage && sourceBranch === 'VACT') {
                const seedList = window.__vactSeedBackup || mockQuizzes;
                seedList.forEach(seed => {
                    if (seed && seed.id && !isQuizDeleted(seed.id) && (!data || !data[seed.id])) {
                        console.log(`🚀 Seeding ${seed.id} lên Firebase lần đầu...`);
                        window.__publishPublicQuiz(seed);
                    }
                });
            }

            if (listChanged && typeof initQuizList === 'function' && quizListContainer) {
                initQuizList();
            }
            if (typeof window.renderHomeQuizGrid === 'function') {
                window.renderHomeQuizGrid();
            }
        };

        // Dùng get() tải 1 lần thay vì onValue() giữ kết nối WebSocket liên tục 24/7 (Tiết kiệm connection & băng thông)
        const vactRef = ref(dbRT, 'VACT');
        get(vactRef).then((snapshot) => {
            handleSnapshot(snapshot, 'VACT');
        }).catch((error) => {
            console.warn("⚠️ Firebase VACT branch error:", error.message);
        });

        const publicQuizzesRef = ref(dbRT, 'public_quizzes');
        get(publicQuizzesRef).then((snapshot) => {
            handleSnapshot(snapshot, 'public_quizzes');
        }).catch((error) => {
            console.warn("⚠️ Firebase public_quizzes branch error:", error.message);
        });

        // Tải lượt xem từ nhánh riêng quiz_views (nhẹ, không tải lại toàn bộ câu hỏi)
        const viewsRef = ref(dbRT, 'quiz_views');
        get(viewsRef).then((snapshot) => {
            const viewsData = snapshot.val();
            if (viewsData) {
                Object.keys(viewsData).forEach(qId => {
                    const count = viewsData[qId];
                    const idx = mockQuizzes.findIndex(q => q && (q.id || '').toString().trim() === qId.toString().trim());
                    if (idx !== -1) mockQuizzes[idx].viewCount = count;
                    const viewEl = document.getElementById(`views-${qId}`);
                    if (viewEl) {
                        if (viewEl.classList.contains('home-quiz-pill')) {
                            viewEl.innerHTML = `👁️ ${count} lượt`;
                        } else {
                            viewEl.innerHTML = `Lượt truy cập: ${count}`;
                        }
                    }
                });
            }
        }).catch(() => {});
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
                    if (typeof clearProgress === 'function') clearProgress();
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
        if (typeof clearProgress === 'function') clearProgress();
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
    document.addEventListener('click', function (e) {
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
    const adminTriggers = document.querySelectorAll('.header h1, .nav-brand-wrap');
    adminTriggers.forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
            adminClickCount++;
            if (adminClickCount >= 10) {
                adminClickCount = 0;
                e.preventDefault();
                const isCurrentlyAdmin = checkIsAdmin();
                if (isCurrentlyAdmin) {
                    localStorage.removeItem('admin_secret_key');
                    alert('Đã TẮT quyền Admin.');
                } else {
                    localStorage.setItem('admin_secret_key', 'trongbeshop');
                    alert('👑 Đã BẬT quyền Admin hệ thống!');
                }
                location.reload();
            }
        });
    });

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

    // Trên thiết bị di động, để CSS Bottom Sheet tự quản lý vị trí
    if (window.innerWidth <= 768) {
        sidebar.style.transform = '';
        return;
    }

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Load saved position (chỉ áp dụng cho màn hình lớn)
    const savedPos = localStorage.getItem('tronex_sidebar_pos');
    if (savedPos && window.innerWidth > 768) {
        try {
            const pos = JSON.parse(savedPos);
            xOffset = pos.x;
            yOffset = pos.y;
            sidebar.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
        } catch (e) { }
    }

    handle.addEventListener('mousedown', dragStart);
    handle.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 768) dragStart(e.touches[0]);
    }, { passive: false });

    function dragStart(e) {
        if (window.innerWidth <= 768) return;
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', (ev) => drag(ev.touches[0]), { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    function drag(e) {
        if (isDragging && window.innerWidth > 768) {
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
window.viewSubmissions = function (quizId) {
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
            const isDgnl120 = sub.scoreScale === 1200 || sub.totalQuestions === 120 || quizId === 'de_1_dgnl' || quizId === 'de_2_dgnl';
            const autoScoreDisplay = isDgnl120
                ? `${sub.autoScore}/1200đ`
                : `${sub.autoScore}/10đ`;
            const hasFinalScore = sub.finalScore !== undefined && sub.finalScore !== null && sub.finalScore !== '';
            const scoreBadge = hasFinalScore
                ? `<span style="color:#16a34a;font-weight:700;font-size:1rem;">🏅 ${sub.finalScore} điểm</span>`
                : `<span style="color:#6366f1;font-size:0.9rem;">Tự động: ${autoScoreDisplay}</span>`;

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
                ${checkIsAdmin() ? `<button class="btn-del-sub" title="Xóa bài nộp này" style="background:#fee2e2;color:#ef4444;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:0.85rem;margin-left:8px;transition:all 0.2s;" type="button" onclick="event.stopPropagation(); window.__deleteSubmission('${quizId}', '${sub.id}')">🗑️</button>` : ''}
                <span style="color:#c7d2fe;font-size:1.4rem;flex-shrink:0;">›</span>
            `;
            card.onclick = () => window.viewSubmissionDetail(quizId, sub.id, sub);
            listEl.appendChild(card);
        });
    }).catch(e => {
        if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;">❌ Lỗi tải bài nộp: ${e.message}</div>`;
    });
};


// --- XÓA 1 BÀI NỘP CỦA HỌC SINH (Dành cho Admin) ---
window.__deleteSubmission = function (quizId, subId) {
    if (!checkIsAdmin()) {
        alert("⚠️ Chỉ Quản trị viên mới có quyền xóa bài nộp!");
        return;
    }
    if (!confirm("[ADMIN] Bạn có chắc chắn muốn xóa bài nộp này khỏi hệ thống?")) return;
    try {
        set(ref(dbRT, `submissions/${quizId}/${subId}`), null).then(() => {
            alert("✅ Đã xóa bài nộp thành công!");
            window.viewSubmissions(quizId);
        }).catch(e => {
            console.error("Lỗi xóa bài nộp:", e);
            alert("❌ Lỗi xóa bài nộp: " + e.message + "\n\n(Lưu ý: Đảm bảo Rules trên Firebase cho phép Admin xóa tại nhánh submissions)");
        });
    } catch (e) {
        alert("❌ Lỗi hệ thống: " + e.message);
    }
};

// --- XÓA TOÀN BỘ BÀI NỘP CỦA 1 ĐỀ THI (Dành cho Admin) ---
window.__clearAllSubmissions = function (quizId) {
    if (!checkIsAdmin()) {
        alert("⚠️ Chỉ Quản trị viên mới có quyền xóa bài nộp!");
        return;
    }
    if (!confirm("[CẢNH BÁO ADMIN] Bạn có chắc muốn xóa TOÀN BỘ bài nộp của đề này không?\n\nHành động này sẽ xóa sạch tất cả bài làm và điểm số đã nộp, không thể khôi phục!")) return;
    try {
        set(ref(dbRT, `submissions/${quizId}`), null).then(() => {
            alert("✅ Đã xóa sạch toàn bộ lịch sử bài nộp của đề này!");
            window.viewSubmissions(quizId);
        }).catch(e => {
            alert("❌ Lỗi xóa toàn bộ bài nộp: " + e.message);
        });
    } catch (e) {
        alert("❌ Lỗi hệ thống: " + e.message);
    }
};

// --- XUẤT BẢNG ĐIỂM RA FILE CSV/EXCEL ---
window.__exportSubmissionsCSV = function (quizId) {
    get(ref(dbRT, `submissions/${quizId}`)).then(snapshot => {
        if (!snapshot.exists()) return alert("Chưa có bài nộp nào để xuất!");
        const data = snapshot.val();
        const rows = [['STT', 'Họ tên', 'Thời gian nộp', 'Điểm tự động', 'Điểm cuối cùng']];
        let i = 1;
        Object.values(data).forEach(sub => {
            const name = sub.participant?.displayName || 'Ẩn danh';
            const time = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : '';
            const auto = sub.autoScore ?? '';
            const final = sub.finalScore ?? auto;
            rows.push([i++, `"${name.replace(/"/g, '""')}"`, `"${time}"`, auto, final]);
        });
        const csvContent = '\uFEFF' + rows.map(e => e.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Bang_diem_${quizId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).catch(e => alert("Lỗi xuất dữ liệu: " + e.message));
};

// --- Xem chi tiết 1 bài làm + chấm điểm (A chấm B) ---
window.viewSubmissionDetail = function (quizId, submissionId, submissionData) {
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
        const isDgnl120 = flatQs.length === 120 || (quiz && (quiz.id === 'de_1_dgnl' || quiz.id === 'de_2_dgnl' || (quiz.category === 'vnu' && flatQs.length === 120)));
        const displayScore = isDgnl120 
            ? `${autoScore * 10} / 1200 (${autoScore}/${flatQs.length} câu đúng)`
            : `${flatQs.length > 0 ? ((autoScore * 10) / flatQs.length).toFixed(2).replace(/\.?0+$/, '') : 0} / 10 (${autoScore}/${flatQs.length} câu đúng)`;
        const autoEl = document.getElementById('autoScoreDisplay');
        if (autoEl) autoEl.textContent = displayScore;
        const finalInput = document.getElementById('finalScoreInput');
        if (finalInput) finalInput.value = (submissionData.finalScore !== null && submissionData.finalScore !== undefined) ? submissionData.finalScore : '';
    }
};

// --- A chấm câu mở (đúng/sai) ---
window.__gradeOpen = function (questionId, isGood) {
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
window.__saveFinalScore = function () {
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

// ============================================================================
// HỆ THỐNG TỰ ĐỘNG LƯU VÀ PHỤC HỒI TIẾN TRÌNH THI (AUTOSAVE & RECOVERY)
// ============================================================================

const STORAGE_PREFIX = 'tronex_quiz_progress_';

/**
 * Lấy storage key theo ID đề thi hiện tại để tránh xung đột giữa các đề
 */
function getProgressStorageKey() {
    const quizId = (window.currentActiveQuiz && window.currentActiveQuiz.id) 
                || (typeof currentQuiz !== 'undefined' && currentQuiz?.id) 
                || 'default';
    return `${STORAGE_PREFIX}${quizId}`;
}

/**
 * 1. BẮT SỰ KIỆN 'beforeunload' CỦA TRÌNH DUYỆT
 * Hiển thị popup cảnh báo mặc định nếu học sinh cố gắng đóng hoặc tải lại tab khi đang làm bài.
 */
window.addEventListener('beforeunload', (event) => {
    const activeQuizView = document.getElementById('activeQuizView');
    const qForm = document.getElementById('quizForm');

    const isDoingQuiz = activeQuizView && activeQuizView.classList.contains('active');
    const isSubmitted = qForm?.dataset?.mode === 'review' || 
                        document.getElementById('tronexResultSummary')?.style?.display === 'block';

    // Chỉ cảnh báo khi đang làm bài thi và chưa nộp bài
    if (isDoingQuiz && !isSubmitted) {
        event.preventDefault();
        event.returnValue = ''; // Chuẩn W3C kích hoạt popup xác nhận của trình duyệt
        return '';
    }
});

/**
 * 2. HÀM TỰ ĐỘNG LƯU TIẾN TRÌNH VÀO LOCALSTORAGE
 * Tự động thu thập đáp án (Radio, Checkbox, Text/Essay) và lưu dạng JSON.
 */
function saveProgress() {
    const form = document.getElementById('quizForm');
    if (!form) return;

    const progress = {
        timestamp: Date.now(),
        answers: {}
    };

    // Lưu các input Radio đang được chọn
    const checkedRadios = form.querySelectorAll('input[type="radio"]:checked');
    checkedRadios.forEach(radio => {
        progress.answers[radio.name] = radio.value;
    });

    // Lưu các input Checkbox đang được chọn
    const checkedBoxes = form.querySelectorAll('input[type="checkbox"]:checked');
    checkedBoxes.forEach(cb => {
        if (!progress.answers[cb.name]) {
            progress.answers[cb.name] = [];
        }
        if (Array.isArray(progress.answers[cb.name])) {
            progress.answers[cb.name].push(cb.value);
        }
    });

    // Lưu câu hỏi điền từ hoặc tự luận (nếu có)
    const textInputs = form.querySelectorAll('input[type="text"].short-answer-input, textarea.essay-input');
    textInputs.forEach(input => {
        if (input.name && input.value.trim() !== '') {
            progress.answers[input.name] = input.value;
        }
    });

    try {
        localStorage.setItem(getProgressStorageKey(), JSON.stringify(progress));
    } catch (e) {
        console.warn('[AUTOSAVE] Không thể lưu vào localStorage:', e);
    }
}
window.saveProgress = saveProgress;

/**
 * 3. HÀM TẢI TIẾN TRÌNH TỪ LOCALSTORAGE VÀ TICK LẠI CÁC ĐÁP ÁN ĐÃ CHỌN
 */
function loadProgress() {
    const key = getProgressStorageKey();
    const savedRaw = localStorage.getItem(key);
    if (!savedRaw) return;

    try {
        const parsed = JSON.parse(savedRaw);
        const answers = parsed.answers || parsed;
        if (!answers || typeof answers !== 'object') return;

        const form = document.getElementById('quizForm');
        if (!form) return;

        window.__isRestoringProgress = true;

        const safeEscape = (val) => window.CSS && CSS.escape ? CSS.escape(val) : String(val).replace(/"/g, '\\"');

        Object.entries(answers).forEach(([name, value]) => {
            if (Array.isArray(value)) {
                // Checkbox
                value.forEach(val => {
                    const cb = form.querySelector(`input[type="checkbox"][name="${safeEscape(name)}"][value="${safeEscape(val)}"]`);
                    if (cb) {
                        cb.checked = true;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            } else {
                // Radio
                const radio = form.querySelector(`input[type="radio"][name="${safeEscape(name)}"][value="${safeEscape(value)}"]`);
                if (radio) {
                    radio.checked = true;
                    // Kích hoạt sự kiện change để cập nhật giao diện (class .selected & Question Palette)
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    // Text / Textarea
                    const textEl = form.querySelector(`input[name="${safeEscape(name)}"], textarea[name="${safeEscape(name)}"]`);
                    if (textEl) {
                        textEl.value = value;
                        textEl.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        });

        console.log('[AUTOSAVE] Đã khôi phục tiến trình làm bài từ localStorage.');
    } catch (e) {
        console.error('[AUTOSAVE] Lỗi khi đọc tiến trình từ localStorage:', e);
    } finally {
        window.__isRestoringProgress = false;
    }
}
window.loadProgress = loadProgress;

/**
 * 4. XÓA BẢN LƯU TIẾN TRÌNH
 */
function clearProgress() {
    try {
        localStorage.removeItem(getProgressStorageKey());
        console.log('[AUTOSAVE] Đã xóa bản lưu tiến trình.');
    } catch (e) {
        console.warn('[AUTOSAVE] Lỗi khi xóa localStorage:', e);
    }
}
window.clearProgress = clearProgress;

// --- GẮN EVENT LISTENERS CHO FORM ---
if (quizForm) {
    // Bắt sự kiện change qua Event Delegation
    quizForm.addEventListener('change', (e) => {
        if (window.__isRestoringProgress) return;
        if (e.target.matches('input[type="radio"], input[type="checkbox"], input[type="text"], textarea')) {
            saveProgress();
        }
    });

    // Bắt sự kiện gõ text/textarea
    quizForm.addEventListener('input', (e) => {
        if (window.__isRestoringProgress) return;
        if (e.target.matches('input[type="text"], textarea')) {
            saveProgress();
        }
    });
}

// Tự động gọi khi DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    loadProgress();
});

// ============================================================
// CHẾ ĐỘ TẬP TRUNG (ZEN MODE) & QUẢN LÝ TRẠNG THÁI PHIẾU TRẢ LỜI
// ============================================================

/**
 * 1. Hàm bật/tắt Chế độ Tập trung (Zen Mode)
 * @param {boolean} [isActive] - true để bật, false để tắt, không truyền để toggle
 */
function toggleZenMode(isActive) {
    const body = document.body;
    const shouldActivate = (typeof isActive === 'boolean') ? isActive : !body.classList.contains('zen-mode');

    if (shouldActivate) {
        body.classList.add('zen-mode');
    } else {
        body.classList.remove('zen-mode');
    }

    const zenBtn = document.getElementById('btnZenToggle');
    if (zenBtn) {
        zenBtn.innerHTML = shouldActivate ? '✕ Thoát tập trung' : '🧘 Chế độ tập trung';
        zenBtn.classList.toggle('active', shouldActivate);
    }
}
window.toggleZenMode = toggleZenMode;

/**
 * 2. Đánh dấu câu hỏi cần xem lại (Flag for Review)
 * Thay đổi viền vàng cam và bo tròn 50% hình khối trên Phiếu trả lời
 * @param {string|number} questionId - ID của câu hỏi
 */
function toggleFlagQuestion(questionId) {
    const paletteBtn = document.getElementById(`palette-btn-${questionId}`);
    let isFlagged = false;
    if (paletteBtn) {
        isFlagged = paletteBtn.classList.toggle('flagged');
        paletteBtn.classList.toggle('status-review', isFlagged);
    }

    const qBlock = document.getElementById(`q-block-${questionId}`);
    if (qBlock) {
        const flagBtn = qBlock.querySelector('.btn-flag-review');
        if (flagBtn) {
            flagBtn.classList.toggle('active', isFlagged);
            flagBtn.innerHTML = isFlagged ? '🚩 Đã đánh dấu' : '🚩 Đánh dấu';
        }
    }
}
window.toggleFlagQuestion = toggleFlagQuestion;

/**
 * 3. Event Listener: Lắng nghe sự kiện change trên form để cập nhật trạng thái "Đã làm"
 */
if (quizForm) {
    quizForm.addEventListener('change', (e) => {
        const target = e.target;
        if (!target.name) return;

        // Trích xuất ID câu hỏi từ name (dạng "question_123" hoặc "question_123_456")
        const match = target.name.match(/^question_([^_]+)/);
        if (match && match[1]) {
            const qId = match[1];
            const paletteBtn = document.getElementById(`palette-btn-${qId}`);
            if (paletteBtn) {
                // Kiểm tra xem câu này có input nào được check hay không
                const inputs = quizForm.querySelectorAll(`input[name^="question_${qId}"]:checked`);
                const isAnswered = inputs.length > 0;
                paletteBtn.classList.toggle('answered', isAnswered);
                paletteBtn.classList.toggle('status-answered', isAnswered);
            }
        }
    });
}
