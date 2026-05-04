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
    
    // v46 Final: Tuyệt chiêu chống trùng đề - Lọc danh sách mockQuizzes theo ID duy nhất trước khi render
    const uniqueQuizzes = [];
    const seenIds = new Set();
    
    // Sắp xếp: ID gemini_ mới tạo lên đầu
    const sortedQuizzes = [...mockQuizzes].sort((a, b) => {
        const aId = a.id.toString();
        const bId = b.id.toString();
        if (aId.startsWith("gemini_") && !bId.startsWith("gemini_")) return -1;
        if (!aId.startsWith("gemini_") && bId.startsWith("gemini_")) return 1;
        return 0;
    });

    sortedQuizzes.forEach(quiz => {
        const qId = quiz.id.toString().trim();
        if (!seenIds.has(qId)) {
            seenIds.add(qId);
            uniqueQuizzes.push(quiz);
        }
    });

    uniqueQuizzes.forEach(quiz => {
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
    const targetId = id.toString().trim();
    if (!targetId.startsWith("gemini_")) return false;
    try {
        const saved = localStorage.getItem("trongbeshop_custom_quizzes");
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.some(q => q.id.toString().trim() === targetId);
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
                    // v43: Một lần xóa hết cả Đề + View vì chúng nằm chung 1 thư mục
                    const publicRef = ref(dbRT, 'public_quizzes/' + id);
                    set(publicRef, null).then(() => {
                        console.log("Đã xóa xong trên Cloud");
                    }).catch(e => {
                        alert("Lỗi xóa trên Cloud: " + e.message);
                    });
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

// === LẮNG NGHE DỮ LIỆU LƯỢT TRUY CẬP (v46 Ultimate: Integrated) ===
function initRealtimeViews() {
    try {
        // Lắng nghe trực tiếp từ bảng public_quizzes để lấy viewCount tích hợp
        const publicRef = ref(dbRT, 'public_quizzes');
        onValue(publicRef, (snapshot) => {
            const allQuizzes = snapshot.val() || {};
            mockQuizzes.forEach(quiz => {
                const quizData = allQuizzes[quiz.id];
                if (quizData && quizData.viewCount !== undefined) {
                    const viewEl = document.getElementById(`views-${quiz.id}`);
                    if (viewEl) {
                        viewEl.innerHTML = `Lượt truy cập: ${quizData.viewCount}`;
                    }
                }
            });
        }, (error) => {
            console.error("Lỗi lắng nghe lượt xem:", error);
        });
    } catch (error) {
        console.error("Lỗi khởi tạo tính năng lượt xem:", error);
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

    // Tăng lượt xem (v46 Ultimate: Tích hợp trực tiếp vào đề)
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

        const qTitle = document.createElement('h4');
        const qNumDisplay = q.qNumber || sectionQuestionIndex;
        qTitle.innerHTML = `Câu ${qNumDisplay}: ${q.text || ''}`;
        qBlock.appendChild(qTitle);

        if (q.imageSrc) {
            const imgDiv = document.createElement('div');
            imgDiv.className = 'question-image';
            imgDiv.innerHTML = `<img src="${q.imageSrc}" alt="Hình minh họa">`;
            const imgEl = imgDiv.querySelector('img');
            imgEl.onclick = () => showImageLightbox(q.imageSrc);
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
                { left: "$", right: "$", display: false }
            ],
            throwOnError: false
        });
    }
}

// === CHẤM ĐIỂM (RESTORED v46) ===
quizForm.onsubmit = function (e) {
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
        const qId = q.id;
        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const userVal = formData.get(`question_${qId}`);
            if (userVal === null) unanswered++;
            else if (parseInt(userVal) === q.correctIndex) correct++;
            else incorrect++;
        } else if (qType === 'short_answer') {
            const userVal = (formData.get(`question_${qId}`) || "").trim().toLowerCase();
            const correctVal = (q.correctAnswer || "").toLowerCase();
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

    renderResults(correct, incorrect, unanswered);
};

function renderResults(correct, incorrect, unanswered) {
    const total = correct + incorrect + unanswered;
    document.getElementById('scoreText').textContent = `${correct}/${total}`;
    document.getElementById('correctCount').textContent = correct;
    document.getElementById('incorrectCount').textContent = incorrect;
    document.getElementById('unansweredCount').textContent = unanswered;

    const percentage = (correct / total) * 100;
    const unansweredPercentage = (unanswered / total) * 100;
    const circle = document.querySelector('.score-circle');
    
    if (circle) {
        if (total === 0) {
            circle.style.backgroundImage = 'none';
            circle.style.backgroundColor = '#E5E7EB';
        } else {
            const correctPct = (correct / total) * 100;
            const incorrectPct = (incorrect / total) * 100;
            
            // Sử dụng backgroundImage để đảm bảo độ tương thích cao nhất
            circle.style.backgroundImage = `conic-gradient(#10B981 0% ${correctPct}%, #EF4444 ${correctPct}% ${correctPct + incorrectPct}%, #F59E0B ${correctPct + incorrectPct}% 100%)`;
        }
    }

    showView('result');
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

function highlightShortAnswer(q, inputElement) {
    const userVal = inputElement.value.trim().toLowerCase();
    const correctVal = (q.correctAnswer || "").toString().trim().toLowerCase();
    
    inputElement.style.borderColor = '#E5E7EB';
    inputElement.style.backgroundColor = 'transparent';
    inputElement.style.color = 'inherit';
    
    // Nếu chưa nhập gì thì xóa định dạng
    if (userVal === "") return;
    
    if (userVal === correctVal) {
        inputElement.style.borderColor = '#10B981'; // Xanh lá
        inputElement.style.backgroundColor = '#D1FAE5';
        inputElement.style.color = '#065F46';
    } else {
        inputElement.style.borderColor = '#EF4444'; // Đỏ
        inputElement.style.backgroundColor = '#FEE2E2';
        inputElement.style.color = '#991B1B';
    }
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

window.loadPublicQuizzes = function() {
    console.log("🔄 Đang quét dữ liệu từ Cloud...");
    try {
        const publicRef = ref(dbRT, 'public_quizzes');
        onValue(publicRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const publicList = Object.values(data);
                let changed = false;
                
                publicList.forEach(pq => {
                    if (pq.questions && !Array.isArray(pq.questions)) pq.questions = Object.values(pq.questions);
                    const pqId = pq.id.toString().trim();
                    const existingIdx = mockQuizzes.findIndex(q => q.id.toString().trim() === pqId);
                    
                    if (existingIdx === -1) {
                        mockQuizzes.push(pq);
                        changed = true;
                    } else if (JSON.stringify(mockQuizzes[existingIdx]) !== JSON.stringify(pq)) {
                        mockQuizzes[existingIdx] = pq;
                        changed = true;
                    }
                });
                if (changed) {
                    initQuizList();
                }
            }
        });
    } catch(e) { console.error("Load public error:", e); }
};

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
    try {
        const publicRef = ref(dbRT, 'public_quizzes/' + quizObj.id);
        set(publicRef, quizObj)
            .then(() => console.log("🚀 Đã đăng đề lên máy chủ THÀNH CÔNG!"))
            .catch(err => console.error("❌ Lỗi khi đăng đề:", err));
    } catch(e) { console.error("❌ Lỗi hệ thống:", e); }
};

document.addEventListener('DOMContentLoaded', () => {
    loadCustomQuizzes();
    loadPublicQuizzes();
    initQuizList();

    // --- ĐIỀU HƯỚNG ---
    const navButtons = {
        'btnBackToMenu': 'list',
        'btnBackFromSetup': 'list',
        'btnBackToMenuFromResult': 'list'
    };
    Object.entries(navButtons).forEach(([id, view]) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => showView(view);
    });

    const btnRetry = document.getElementById('btnRetry');
    if (btnRetry) btnRetry.onclick = () => {
        resetScoreCircle();
        quizForm.reset();
        renderQuestions();
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
});
