import { mockQuizzes } from './data.js';
import { showImageLightbox } from './gemini.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getDatabase, ref, onValue, runTransaction, set, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
let quizTimerInterval = null;
let quizStartTime = null;

const isVACTPage = window.location.pathname.toLowerCase().includes('v-act.html');
const FIREBASE_ROOT = isVACTPage ? 'VACT' : 'public_quizzes';
const LOCAL_STORAGE_KEY = isVACTPage ? 'trongbeshop_vact_quizzes' : 'trongbeshop_custom_quizzes';
const isAdmin = localStorage.getItem("admin_secret_key") === "trongbeshop";


if (isVACTPage) {
    // Chỉ giữ lại các đề của V-ACT
    const vactQuizzes = mockQuizzes.filter(q => q.id.startsWith('de_1_dgnl') || q.id.startsWith('vact_'));
    mockQuizzes.length = 0;
    mockQuizzes.push(...vactQuizzes);
} else {
    // Ở trang chủ, ẩn các đề của V-ACT
    const homeQuizzes = mockQuizzes.filter(q => !q.id.startsWith('de_1_dgnl') && !q.id.startsWith('vact_'));
    mockQuizzes.length = 0;
    mockQuizzes.push(...homeQuizzes);
}

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
}

function isQuizOwner(id) {
    if (localStorage.getItem("admin_secret_key") === "trongbeshop") return true;
    const targetId = id.toString().trim();
    if (!targetId.startsWith("gemini_")) return false;
    try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.some(q => q.id.toString().trim() === targetId);
        }
    } catch (e) { }
    return false;
}

window.deleteCustomQuiz = function (id) {
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
                    const publicRef = ref(dbRT, FIREBASE_ROOT + '/' + id);
                    set(publicRef, null).then(() => {
                        console.log("Đã xóa xong trên Cloud");
                    }).catch(e => {
                        alert("Lỗi xóa trên Cloud: " + e.message);
                    });
                } catch (e) { console.error("Firebase delete error:", e); }
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
window.openChangelog = function () {
    document.getElementById("changelogModal").style.display = "flex";
};
window.closeChangelog = function () {
    document.getElementById("changelogModal").style.display = "none";
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
    showView('active');
    startTimer(); // Bắt đầu tính giờ từ đây

    // Cập nhật lại UI sau khi hiển thị
    const timerBox = document.getElementById('shubTimerBox');
    if (timerBox) timerBox.style.display = 'flex';
    document.getElementById('shubResultSummary').style.display = 'none';
    document.getElementById('btnSubmitQuiz').style.display = 'block';
    
    // Reset nút rời khỏi về trạng thái đang làm bài
    const leaveBtn = document.getElementById('btnLeaveQuiz');
    if (leaveBtn) {
        leaveBtn.textContent = 'Rời khỏi';
    }
};

// === TIMER FUNCTIONS ===
function startTimer() {
    stopTimer(); 
    quizStartTime = Date.now();
    sessionStorage.setItem('shub_quiz_start_time', quizStartTime);
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

// === INIT QUESTION PALETTE (SHUB) ===
function initQuestionPalette(questions) {
    const palette = document.getElementById('questionPalette');
    if (!palette) return;
    palette.innerHTML = '';
    questions.forEach((q, idx) => {
        const btn = document.createElement('div');
        btn.className = 'shub-palette-btn';
        btn.id = `palette-btn-${q.id}`;
        btn.textContent = idx + 1; // Hiển thị số thứ tự
        
        // Click để scroll tới câu hỏi
        btn.onclick = () => {
            const qEl = document.getElementById(`q-block-${q.id}`);
            if (qEl) {
                qEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Highlight tạm thời
                document.querySelectorAll('.shub-palette-btn').forEach(b => b.classList.remove('active-q'));
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
        qTitle.innerHTML = `Câu ${qNumDisplay}: ${cleanText}`;
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
            const opts = qType === 'true_false' ? ["Đúng", "Sai"] : (Array.isArray(q.options) ? q.options : []);
            const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
            opts.forEach((opt, optIndex) => {
                const label = document.createElement('label');
                label.className = 'shub-option-label';
                
                const letter = letters[optIndex] || '';
                label.innerHTML = `
                    <input type="radio" name="question_${q.id}" value="${optIndex}">
                    <div class="shub-opt-letter">${letter}</div>
                    <div class="shub-opt-text">${opt}</div>
                    <button type="button" class="shub-clear-btn" title="Hủy chọn">✕</button>
                `;
                
                const radio = label.querySelector('input');
                const clearBtn = label.querySelector('.shub-clear-btn');
                
                radio.addEventListener('change', () => {
                    optionsList.querySelectorAll('.shub-option-label').forEach(l => l.classList.remove('selected'));
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

// === CHẤM ĐIỂM (RESTORED v46) ===
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

function showReviewMode(qs) {
    qs.forEach(q => {
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
        // Thang điểm 1200 cho V-ACT (10đ mỗi câu đúng)
        score = correct * 10;
        document.querySelector('.shub-score').innerHTML = `<span id="shubScoreText">${score}</span> / 1200`;
    } else {
        score = total > 0 ? ((correct / total) * 10).toFixed(2) : 0;
        document.getElementById('shubScoreText').textContent = score;
    }
    
    // Hiển thị thời gian làm bài
    const savedStartTime = sessionStorage.getItem('shub_quiz_start_time') || quizStartTime;
    if (savedStartTime) {
        const endTime = Date.now();
        const diff = Math.floor((endTime - parseInt(savedStartTime)) / 1000);
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        const timeEl = document.getElementById('shubTimeSpent');
        if (timeEl) timeEl.textContent = timeStr;
    }
    
    // Cập nhật Result Summary (SHub clone)
    document.getElementById('shubCorrect').textContent = correct;
    document.getElementById('shubIncorrect').textContent = incorrect;
    document.getElementById('shubUnanswered').textContent = unanswered;

    document.getElementById('shubResultSummary').style.display = 'block';
    
    const timerBox = document.getElementById('shubTimerBox');
    if (timerBox) timerBox.style.display = 'none';

    const submitBtn = document.getElementById('btnSubmitQuiz');
    if (submitBtn) submitBtn.style.display = 'none';

    const leaveBtn = document.getElementById('btnLeaveQuiz');
    if (leaveBtn) {
        leaveBtn.textContent = 'Trở về danh sách';
    }
}

// === CÁC TIỆN ÍCH KHÁC (LOAD/SAVE/UI) ===
function highlightAnswer(q, optionsList) {
    const inputs = optionsList.querySelectorAll('input');
    inputs.forEach((input, idx) => {
        const label = input.closest('label.shub-option-label') || input.closest('label');
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
    try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) mockQuizzes.unshift(...parsed);
        }
    } catch (e) { }
}

window.loadPublicQuizzes = function () {
    console.log("🔄 Đang quét dữ liệu từ Cloud... (Trang V-ACT: " + isVACTPage + ")");
    try {
        const publicRef = ref(dbRT, FIREBASE_ROOT);
        onValue(publicRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                let listChanged = false;

                Object.keys(data).forEach(key => {
                    let pq = data[key];
                    const pqId = key.toString().trim();
                    const existingIdx = mockQuizzes.findIndex(q => q.id.toString().trim() === pqId);

                    // 1. Cập nhật lượt xem trực tiếp trên DOM và Memory
                    if (pq.viewCount !== undefined) {
                        if (existingIdx !== -1) mockQuizzes[existingIdx].viewCount = pq.viewCount;
                        const viewEl = document.getElementById(`views-${pqId}`);
                        if (viewEl) {
                            viewEl.innerHTML = `Lượt truy cập: ${pq.viewCount}`;
                        }
                    }

                    // 2. Xử lý nội dung đề thi (Đồng bộ toàn bộ đề từ Firebase)
                    if (!pq.title || !pq.questions) return;
                    if (pq.questions && !Array.isArray(pq.questions)) pq.questions = Object.values(pq.questions);

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

                // v51: Tự động đồng bộ đề V-ACT lên Firebase nếu chưa có
                if (isVACTPage && !data['de_1_dgnl']) {
                    const de1 = mockQuizzes.find(q => q.id === 'de_1_dgnl');
                    if (de1) {
                        console.log("🚀 Đề V-ACT chưa có trên Cloud, đang tự động đồng bộ...");
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
            // v52: Silent fail to avoid annoying user if network is restricted
        });
    } catch (e) { console.error("Load public error:", e); }
};

// Khởi động
window.firebaseConfig = firebaseConfig;
window.firebaseSDK = { ref, runTransaction, set };
window.__mockQuizzes = mockQuizzes;
window.__initQuizList = initQuizList;
window.__saveCustomQuizzes = () => {
    const custom = mockQuizzes.filter(q => q.id.toString().startsWith("gemini_"));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(custom));
};

window.__publishPublicQuiz = (quizObj) => {
    try {
        const publicRef = ref(dbRT, FIREBASE_ROOT + '/' + quizObj.id);
        set(publicRef, quizObj)
            .then(() => console.log("🚀 Đã đăng đề lên máy chủ THÀNH CÔNG!"))
            .catch(err => console.error("❌ Lỗi khi đăng đề:", err));
    } catch (e) { console.error("❌ Lỗi hệ thống:", e); }
};

document.addEventListener('DOMContentLoaded', () => {
    loadCustomQuizzes();
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
        renderQuestions();
        const submitBtn = quizForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.style.display = 'block';
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
window.toggleMinimizeSidebar = function() {
    const sidebar = document.getElementById('shubSidebar');
    if (sidebar) {
        sidebar.classList.toggle('minimized');
    }
};

function initDraggableSidebar() {
    const sidebar = document.getElementById('shubSidebar');
    const handle = document.getElementById('shubSidebarHandle');
    if (!sidebar || !handle) return;

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Load saved position
    const savedPos = localStorage.getItem('shub_sidebar_pos');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            xOffset = pos.x;
            yOffset = pos.y;
            sidebar.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
        } catch(e) {}
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
            localStorage.setItem('shub_sidebar_pos', JSON.stringify({ x: xOffset, y: yOffset }));
        } catch(e) {}
        
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
    }
}


