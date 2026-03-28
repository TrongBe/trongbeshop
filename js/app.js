import { mockQuizzes } from './data.js';
import { showImageLightbox } from './gemini.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getDatabase, ref, onValue, runTransaction, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAAEI9nMEMfUwbGbPHTyGRJ2dAfBRW7_Fo",
    authDomain: "hoctaptructuyen-7c09a.firebaseapp.com",
    projectId: "hoctaptructuyen-7c09a",
    storageBucket: "hoctaptructuyen-7c09a.firebasestorage.app",
    messagingSenderId: "329551572068",
    appId: "1:329551572068:web:41b7b3174ef45a77008371",
    measurementId: "G-F0DTTKEBHC"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const dbRT = getDatabase(app);

// === TRẠNG THÁI (STATE) ===
let currentQuiz = null;
let userAnswers = {};

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

// === TẠO GIAO DIỆN DANH SÁCH ĐỀ ===
function initQuizList() {
    quizListContainer.innerHTML = '';
    mockQuizzes.forEach(quiz => {
        const card = document.createElement('div');
        card.className = 'quiz-card';
        card.innerHTML = `
            <h3>${quiz.title}</h3>
            <p>${quiz.description}</p>
            <div class="tags-container" style="margin-bottom: 24px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                ${quiz.privacy === 'public' ? '<span style="background:#10B981; color:white; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:bold;">🌍 Công Khai</span>' : ''}
                <span class="quiz-meta">📚 Số câu: ${quiz.questions.length}</span>
                <span class="quiz-views" id="views-${quiz.id}">Lượt truy cập: ${quiz.viewCount || 0}</span>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-primary" style="flex: 1;" onclick="startQuiz('${quiz.id}')">Bắt Đầu Làm Bài</button>
                ${isQuizOwner(quiz.id) ? `<button class="btn btn-outline" style="padding: 12px; color: #EF4444; border-color: #EF4444;" onclick="deleteCustomQuiz('${quiz.id}')" title="Xóa đề này">🗑️</button>` : ""}
            </div>
        `;
        quizListContainer.appendChild(card);
    });
    initRealtimeViews();
}

function isQuizOwner(id) {
    if (localStorage.getItem("admin_secret_key") === "trongbeshop") return true;
    if (!id.toString().startsWith("gemini_")) return false;
    try {
        const saved = localStorage.getItem("trongbeshop_custom_quizzes");
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.some(q => q.id === id);
        }
    } catch(e) {}
    return false;
}

window.deleteCustomQuiz = function(id) {
    const isAdmin = localStorage.getItem("admin_secret_key") === "trongbeshop";
    const idx = mockQuizzes.findIndex(q => q.id === id);
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
            
            if (isPublic) {
                try {
                    const publicRef = ref(dbRT, 'public_quizzes/' + id);
                    set(publicRef, null); // v41: Integrated delete
                } catch(e) { console.error("Firebase delete error:", e); }
            }
            
            initQuizList();
            closeDeleteModal();
            alert("Đã xóa vĩnh viễn đề thi thành công!");
        }
    };
};

window.closeDeleteModal = function() {
    document.getElementById("deleteConfirmModal").style.display = "none";
};

// --- NHẬT KÝ CẬP NHẬT (v41) ---
window.openChangelog = function() {
    document.getElementById("changelogModal").style.display = "flex";
};
window.closeChangelog = function() {
    document.getElementById("changelogModal").style.display = "none";
};

// === LẮNG NGHE DỮ LIỆU LƯỢT TRUY CẬP (v41: Integrated) ===
function initRealtimeViews() {
    try {
        const viewsRef = ref(dbRT, 'quiz_views');
        onValue(viewsRef, (snapshot) => {
            const allViews = snapshot.val() || {};
            mockQuizzes.forEach(quiz => {
                const legacyView = allViews[quiz.id] || 0;
                const integratedView = quiz.viewCount || 0;
                const finalView = Math.max(legacyView, integratedView);
                
                const viewEl = document.getElementById(`views-${quiz.id}`);
                if (viewEl) {
                    viewEl.innerHTML = `Lượt truy cập: ${finalView}`;
                }
            });
        }, (error) => {
            console.error("Lỗi lắng nghe Realtime Database:", error);
        });
    } catch (error) {
        console.error("Lỗi khởi tạo tính năng thời gian thực:", error);
    }
}

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
    currentQuiz = mockQuizzes.find(q => q.id.toString() === quizId.toString());
    if (!currentQuiz || !currentQuiz.questions) return;
    document.getElementById('setupQuizTitle').textContent = `Cấu hình: ${currentQuiz.title}`;
    showView('setup');
};

// === XÁC NHẬN BẮT ĐẦU LÀM BÀI SAU KHI CẤU HÌNH ===
document.getElementById('btnConfirmStart').onclick = async function () {
    const isShuffle = document.getElementById('chkShuffle').checked;
    const quizMode = document.querySelector('input[name="quizMode"]:checked').value;
    quizForm.dataset.quizMode = quizMode;
    quizForm.dataset.isShuffle = isShuffle;

    const questionsToRender = JSON.parse(JSON.stringify(currentQuiz.questions));
    if (isShuffle) {
        currentQuiz.renderedQuestions = shuffleQuestionsBySection(questionsToRender);
    } else {
        currentQuiz.renderedQuestions = questionsToRender;
    }

    // Tăng lượt xem (v41: Integrated)
    if (currentQuiz.privacy === "public") {
        try {
            const quizRef = ref(dbRT, 'public_quizzes/' + currentQuiz.id + '/viewCount');
            runTransaction(quizRef, (currentValue) => {
                return (currentValue || 0) + 1;
            });
        } catch(e) { console.error("Increment view error:", e); }
    }

    quizForm.reset();
    quizForm.dataset.mode = 'exam';
    const submitBtn = quizForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Nộp Bài Ngay';
        submitBtn.classList.remove('btn-outline');
        submitBtn.classList.add('btn-primary');
    }

    currentQuizTitle.textContent = currentQuiz.title;
    resetScoreCircle();
    renderQuestions();
    showView('active');
};

// === KIẾN TẠO GIAO DIỆN CÂU HỎI TRONG ĐỀ ===
function renderQuestions() {
    questionsContainer.innerHTML = '';
    let currentSection = "";
    let lastGroupText = "";
    let sectionQuestionIndex = 1;

    const qs = currentQuiz.renderedQuestions || currentQuiz.questions;

    qs.forEach((q, index) => {
        if (q.section && q.section !== currentSection) {
            const secHeader = document.createElement('h3');
            secHeader.className = 'section-title';
            secHeader.style.cssText = 'margin-top: 32px; margin-bottom: 16px; color: var(--primary); text-transform: uppercase;';
            secHeader.textContent = q.section;
            questionsContainer.appendChild(secHeader);
            currentSection = q.section;
            sectionQuestionIndex = 1;
        }

        if (q.groupText && q.groupText.trim() !== "" && q.groupText !== lastGroupText) {
            const passageDiv = document.createElement('div');
            passageDiv.className = 'reading-passage';
            passageDiv.style.cssText = 'background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 24px; border-left: 5px solid var(--primary); font-size: 1.05rem; line-height: 1.7;';
            passageDiv.innerHTML = q.groupText;
            questionsContainer.appendChild(passageDiv);
            lastGroupText = q.groupText;
        }

        const qBlock = document.createElement('div');
        qBlock.className = 'question-card';

        if (q.imageSrc) {
            const imgDiv = document.createElement('div');
            imgDiv.className = 'question-image';
            imgDiv.innerHTML = `<img src="${q.imageSrc}" alt="Hình minh họa">`;
            const imgEl = imgDiv.querySelector('img');
            imgEl.onclick = () => showImageLightbox(q.imageSrc);
            qBlock.appendChild(imgDiv);
        }

        const qTitle = document.createElement('h4');
        const qNumDisplay = q.qNumber || sectionQuestionIndex;
        qTitle.innerHTML = `Câu ${qNumDisplay}: ${q.text || ''}`;
        qBlock.appendChild(qTitle);

        const optionsList = document.createElement('div');
        optionsList.className = 'options-list';

        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const opts = qType === 'true_false' ? ["Đúng", "Sai"] : q.options;
            opts.forEach((opt, optIndex) => {
                const label = document.createElement('label');
                label.className = 'option-label';
                label.innerHTML = `
                    <input type="radio" name="question_${q.id}" value="${optIndex}">
                    <span>${opt}</span>
                `;
                const radio = label.querySelector('input');
                radio.addEventListener('change', () => {
                    if (quizForm.dataset.quizMode === 'practice') {
                        highlightAnswer(q, optionsList);
                    }
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
            groupDiv.appendChild(table);
            optionsList.appendChild(groupDiv);
        } else if (qType === 'short_answer') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control';
            input.name = `question_${q.id}`;
            input.placeholder = 'Nhập câu trả lời của bạn...';
            optionsList.appendChild(input);
        }

        qBlock.appendChild(optionsList);
        questionsContainer.appendChild(qBlock);
        sectionQuestionIndex++;
    });
}

// === CÁC TIỆN ÍCH KHÁC (LOAD/SAVE/UI) ===
function highlightAnswer(q, optionsList) {
    const inputs = optionsList.querySelectorAll('input');
    inputs.forEach((input, idx) => {
        const label = input.closest('label');
        label.classList.remove('correct-answer', 'wrong-answer');
        if (idx === q.correctIndex) label.classList.add('correct-answer');
        else if (input.checked) label.classList.add('wrong-answer');
    });
}

function resetScoreCircle() {
    const circle = document.querySelector('.score-circle');
    if (circle) circle.style.background = '#E5E7EB';
}

function loadCustomQuizzes() {
    try {
        const saved = localStorage.getItem("trongbeshop_custom_quizzes");
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) mockQuizzes.unshift(...parsed);
        }
    } catch (e) {}
}

function loadPublicQuizzes() {
    try {
        const publicRef = ref(dbRT, 'public_quizzes');
        onValue(publicRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const publicList = Object.values(data);
                let addedNew = false;
                publicList.forEach(pq => {
                    if (pq.questions && !Array.isArray(pq.questions)) pq.questions = Object.values(pq.questions);
                    const exists = mockQuizzes.find(q => q.id.toString() === pq.id.toString());
                    if (!exists) {
                        mockQuizzes.push(pq);
                        addedNew = true;
                    }
                });
                if (addedNew) initQuizList();
            }
        });
    } catch(e) {}
}

// Khởi động
window.firebaseConfig = firebaseConfig;
window.firebaseSDK = { ref, runTransaction, set };
window.__mockQuizzes = mockQuizzes;
window.__initQuizList = initQuizList;
window.__saveCustomQuizzes = () => {
    const custom = mockQuizzes.filter(q => q.id.toString().startsWith("gemini_"));
    localStorage.setItem("trongbeshop_custom_quizzes", JSON.stringify(custom));
};

window.__publishPublicQuiz = (quizObj) => {
    const publicRef = ref(dbRT, 'public_quizzes/' + quizObj.id);
    set(publicRef, quizObj);
};

document.addEventListener('DOMContentLoaded', () => {
    loadCustomQuizzes();
    loadPublicQuizzes();
    initQuizList();
});
