import { mockQuizzes } from './data.js';
import { showImageLightbox } from './gemini.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getDatabase, ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
// Firestore (db) is not currently used for main quiz logic, only RTDB for views.


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
                <span class="quiz-views" id="views-${quiz.id}">Lượt truy cập: Đang tải...</span>
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
    return false; // Fix: Khách vãng lai không được phép hiển thị nút xóa
}

window.deleteCustomQuiz = function(id) {
    const isAdmin = localStorage.getItem("admin_secret_key") === "trongbeshop";
    const idx = mockQuizzes.findIndex(q => q.id === id);
    if (idx === -1) return;

    const quiz = mockQuizzes[idx];
    const isPublic = quiz.privacy === "public";
    const isOwner = isQuizOwner(id);

    // Mở modal xác nhận xóa
    const deleteModal = document.getElementById("deleteConfirmModal");
    const btnHideLocal = document.getElementById("btnHideLocal");
    const btnDeleteFirebase = document.getElementById("btnDeleteFirebase");
    
    deleteModal.style.display = "flex";
    
    // Nút Xóa vĩnh viễn chỉ hiện cho Admin hoặc Chủ sở hữu
    if (isAdmin || isOwner) {
        btnDeleteFirebase.style.display = "block";
    } else {
        btnDeleteFirebase.style.display = "none";
    }

    // Hành động 1: Chỉ ẩn cục bộ
    btnHideLocal.onclick = () => {
        mockQuizzes.splice(idx, 1);
        if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();
        initQuizList();
        closeDeleteModal();
        alert("Đã ẩn đề khỏi máy của bạn.");
    };

    // Hành động 2: Xóa vĩnh viễn (Firebase + Local)
    btnDeleteFirebase.onclick = () => {
        const msg = isAdmin ? "[ADMIN] Xóa vĩnh viễn đề này khỏi hệ thống?" : "Bạn là chủ đề này. Xóa vĩnh viễn khỏi toàn hệ thống?";
        if (confirm(msg)) {
            mockQuizzes.splice(idx, 1);
            if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();
            
            if (isPublic) {
                try {
                    const { dbRT } = window.firebaseConfig; // Giả sử đã expose hoặc dùng import
                    const { ref, runTransaction } = window.firebaseSDK; 
                    const publicRef = ref(dbRT, 'public_quizzes/' + id);
                    runTransaction(publicRef, () => null);
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

// === LẮNG NGHE DỮ LIỆU LƯỢT TRUY CẬP THỜI GIAN THỰC TỪ REALTIME DATABASE ===
function initRealtimeViews() {
    try {
        // Lắng nghe tất cả các đề cùng một lúc từ nút 'quiz_views'
        const viewsRef = ref(dbRT, 'quiz_views');
        onValue(viewsRef, (snapshot) => {
            const allViews = snapshot.val() || {};

            mockQuizzes.forEach(quiz => {
                const viewCount = allViews[quiz.id] || 0;
                const viewEl = document.getElementById(`views-${quiz.id}`);
                if (viewEl) {
                    viewEl.innerHTML = `Lượt truy cập: ${viewCount}`;
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
        
        // Nhóm các câu có cùng groupText (văn bản chung/đoạn văn) lại với nhau để không bị tách rời khi tráo
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

        // Tráo thứ tự các nhóm trong section
        for (let i = groups.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [groups[i], groups[j]] = [groups[j], groups[i]];
        }

        // Nối vào danh sách kết quả
        groups.forEach(g => {
            finalShuffled = finalShuffled.concat(g);
        });
    });
    return finalShuffled;
}

// === BẮT ĐẦU LÀM BÀI ===
window.startQuiz = async function (quizId) {
    currentQuiz = mockQuizzes.find(q => q.id == quizId);
    if (!currentQuiz || !currentQuiz.questions) return;

    // Hiển thị màn hình cấu hình trước
    document.getElementById('setupQuizTitle').textContent = `Cấu hình: ${currentQuiz.title}`;
    showView('setup');
};

// === XÁC NHẬN BẮT ĐẦU LÀM BÀI SAU KHI CẤU HÌNH ===
document.getElementById('btnConfirmStart').onclick = async function () {
    const isShuffle = document.getElementById('chkShuffle').checked;
    const quizMode = document.querySelector('input[name="quizMode"]:checked').value;

    // Lưu lại cấu hình vào dataset của form hoặc biến state
    quizForm.dataset.quizMode = quizMode;
    quizForm.dataset.isShuffle = isShuffle;

    // --- HIỂN THỊ GIAO DIỆN LÀM BÀI ---
    // Copy câu hỏi để tránh ghi đè dữ liệu gốc khi tráo
    const questionsToRender = JSON.parse(JSON.stringify(currentQuiz.questions));
    
    if (isShuffle) {
        currentQuiz.renderedQuestions = shuffleQuestionsBySection(questionsToRender);
    } else {
        currentQuiz.renderedQuestions = questionsToRender;
    }

    // Xóa kết quả chọn cũ & Reset form
    quizForm.reset();
    quizForm.dataset.mode = 'exam'; // Mặc định là chế độ thi cử khi bắt đầu
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

    // Tăng lượt xem (view) trên Realtime Database chạy ngầm
    try {
        const quizId = currentQuiz.id;
        let viewedQuizzes = [];
        try {
            viewedQuizzes = JSON.parse(localStorage.getItem('viewedQuizzes') || '[]');
        } catch (err) {
            viewedQuizzes = [];
        }

        if (!Array.isArray(viewedQuizzes)) viewedQuizzes = [];

        if (!viewedQuizzes.includes(quizId)) {
            viewedQuizzes.push(quizId);
            localStorage.setItem('viewedQuizzes', JSON.stringify(viewedQuizzes));

            const quizViewRef = ref(dbRT, `quiz_views/${quizId}`);
            try {
                runTransaction(quizViewRef, (currentValue) => {
                    return (currentValue || 0) + 1;
                });
            } catch (error) {
                console.error("Lỗi khi cập nhật Realtime view:", error);
            }
        }
    } catch (e) {
        console.error("Lỗi logic lượt xem:", e);
    }
};

document.getElementById('btnBackFromSetup').onclick = () => showView('list');

// === HÀM HIỂN THỊ TRỢ GIÚP ===
window.showHelp = function (type) {
    let msg = "";
    if (type === 'shuffle') {
        msg = "Tráo thứ tự câu hỏi: Các câu hỏi trong mỗi phần sẽ được đảo vị trí ngẫu nhiên để tăng tính thử thách.";
    } else if (type === 'mode') {
        msg = "Chế độ làm bài:\n- Thi cử: Chỉ xem được kết quả và đáp án sau khi nhấn Nộp bài.\n- Luyện tập: Thấy ngay đáp án đúng/sai ngay sau khi bạn chọn mỗi câu hỏi.";
    }
    alert(msg);
};

// === KIẾN TẠO GIAO DIỆN CÂU HỎI TRONG ĐỀ ===
function renderQuestions() {
    questionsContainer.innerHTML = '';
    let currentSection = "";
    let lastGroupText = "";
    let sectionQuestionIndex = 1;

    // Sử dụng renderedQuestions (đã được tráo hoặc copy) để hiển thị
    const qs = currentQuiz.renderedQuestions || currentQuiz.questions;

    qs.forEach((q, index) => {
        // --- PHẦN TIÊU ĐỀ NHÓM (SECTION) ---
        if (q.section && q.section !== currentSection) {
            const secHeader = document.createElement('h3');
            secHeader.className = 'section-title';
            secHeader.style.cssText = 'margin-top: 32px; margin-bottom: 16px; color: var(--primary); text-transform: uppercase;';
            secHeader.textContent = q.section;
            questionsContainer.appendChild(secHeader);
            currentSection = q.section;
            sectionQuestionIndex = 1;
        }

        // --- ĐOẠN VĂN / BỐI CẢNH CHUNG (GROUP TEXT) ---
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

        // --- HÌNH ẢNH MINH HỌA (IMAGE SRC) ---
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
        if (!q.text) qTitle.style.marginBottom = '12px';
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
            table.style.marginBottom = '20px';
            table.innerHTML = `
                <thead>
                    <tr><th style="text-align: left;">Nội dung</th><th class="tf-col">Đúng</th><th class="tf-col">Sai</th></tr>
                </thead>
                <tbody>
                    ${(q.subQuestions || []).map(sq => `
                        <tr>
                            <td style="font-size: 14px; line-height: 1.5;">${sq.text}</td>
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

            if (quizForm.dataset.quizMode === 'practice') {
                q.subQuestions.forEach(sq => {
                    const radios = table.querySelectorAll(`input[name="question_${q.id}_${sq.id}"]`);
                    radios.forEach(radio => {
                        radio.addEventListener('change', () => {
                            highlightSubAnswer(sq, table, radio);
                        });
                    });
                });
            }
        } else if (qType === 'short_answer') {
            const inputField = document.createElement('div');
            inputField.className = 'short-answer-container';
            inputField.style.marginTop = '10px';
            inputField.innerHTML = `
                <input type="text" name="question_${q.id}" class="form-control" placeholder="Nhập đáp án..." style="width: 100%; max-width: 300px; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                <div class="practice-result" style="display:none; margin-top: 5px; font-weight: 600;"></div>
            `;

            const input = inputField.querySelector('input');
            input.addEventListener('change', () => {
                if (quizForm.dataset.quizMode === 'practice') {
                    const resDiv = inputField.querySelector('.practice-result');
                    resDiv.style.display = 'block';
                    input.disabled = true;
                    if (input.value.trim().toLowerCase() == (q.correctAnswer || "").toLowerCase()) {
                        resDiv.textContent = 'Chính xác! Đáp án: ' + q.correctAnswer;
                        resDiv.style.color = 'var(--correct)';
                        input.style.borderColor = 'var(--correct)';
                    } else {
                        resDiv.textContent = 'Sai rồi! Đáp án đúng: ' + q.correctAnswer;
                        resDiv.style.color = 'var(--wrong)';
                        input.style.borderColor = 'var(--wrong)';
                    }
                }
            });
            optionsList.appendChild(inputField);
        }

        qBlock.appendChild(optionsList);
        questionsContainer.appendChild(qBlock);
        sectionQuestionIndex++;
    });
}

// === XỬ LÝ KHI NỘP BÀI TẬP ===
quizForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Nếu đang ở chế độ xem lại (review), nhấn nút sẽ quay lại màn kết quả
    if (quizForm.dataset.mode === 'review') {
        showView('result');
        return;
    }

    // Chấm điểm
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    userAnswers = {};

    const qs = currentQuiz.renderedQuestions || currentQuiz.questions;

    qs.forEach(q => {
        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const selectedRadio = quizForm.querySelector(`input[name="question_${q.id}"]:checked`);
            if (!selectedRadio) {
                unanswered++;
                userAnswers[q.id] = null;
            } else {
                const val = parseInt(selectedRadio.value);
                userAnswers[q.id] = val;
                if (val === q.correctIndex) {
                    correct++;
                } else {
                    incorrect++;
                }
            }
        } else if (qType === 'true_false_group') {
            q.subQuestions.forEach(sq => {
                const selected = quizForm.querySelector(`input[name="question_${q.id}_${sq.id}"]:checked`);
                if (!selected) {
                    unanswered++;
                    userAnswers[`${q.id}_${sq.id}`] = null;
                } else {
                    const val = selected.value;
                    userAnswers[`${q.id}_${sq.id}`] = val;
                    if (val === sq.correctAnswer) {
                        correct++;
                    } else {
                        incorrect++;
                    }
                }
            });
        } else if (qType === 'reading_group') {
            q.subQuestions.forEach(subQ => {
                const selectedRadio = quizForm.querySelector(`input[name="question_${subQ.id}"]:checked`);
                if (!selectedRadio) {
                    unanswered++;
                    userAnswers[subQ.id] = null;
                } else {
                    const val = parseInt(selectedRadio.value);
                    userAnswers[subQ.id] = val;
                    if (val === subQ.correctIndex) {
                        correct++;
                    } else {
                        incorrect++;
                    }
                }
            });
        } else if (qType === 'short_answer') {
            const input = quizForm.querySelector(`input[name="question_${q.id}"]`);
            const val = input.value.trim();
            userAnswers[q.id] = val;
            if (val === "") {
                unanswered++;
            } else if (val == q.correctAnswer) {
                correct++;
            } else {
                incorrect++;
            }
        }
    });

    // Tính tổng số item cần chấm (bao gồm cả các câu hỏi con)
    let totalItems = 0;
    // Sử dụng lại qs đã khai báo ở trên
    qs.forEach(q => {
        const qType = q.type || 'multiple_choice';
        if (qType === 'true_false_group' || qType === 'reading_group') {
            totalItems += q.subQuestions.length;
        } else {
            totalItems += 1;
        }
    });

    // Hiển thị kết quả lên màn hình Result
    document.getElementById('scoreText').textContent = `${correct}/${totalItems}`;
    document.getElementById('correctCount').textContent = correct;
    document.getElementById('incorrectCount').textContent = incorrect;

    const unansweredEl = document.getElementById('unansweredCount');
    if (unansweredEl) unansweredEl.textContent = unanswered;

    // Cập nhật biểu đồ vòng tròn
    const circle = document.querySelector('.score-circle');
    const correctP = (correct / totalItems) * 100;
    const incorrectP = (incorrect / totalItems) * 100;
    const unansweredP = (unanswered / totalItems) * 100;

    circle.style.background = `conic-gradient(
        var(--secondary) 0% ${correctP}%, 
        var(--danger) ${correctP}% ${correctP + incorrectP}%, 
        #f59e0b ${correctP + incorrectP}% ${correctP + incorrectP + unansweredP}%, 
        #E5E7EB ${correctP + incorrectP + unansweredP}% 100%
    )`;

    showView('result');
});

// === CÁC NÚT ĐIỀU HƯỚNG ===
document.getElementById('btnBackToMenu').addEventListener('click', () => {
    if (confirm("Bạn có chắc muốn thoát? Tiến trình bài đang làm sẽ bị hủy bỏ.")) {
        showView('list');
    }
});

document.getElementById('btnRetry').addEventListener('click', () => {
    quizForm.reset();
    quizForm.dataset.mode = 'exam';
    const submitBtn = quizForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Nộp Bài Ngay';
    submitBtn.classList.remove('btn-outline');
    submitBtn.classList.add('btn-primary');

    // Tráo câu hỏi nhưng giữ nguyên các phần khi làm lại
    const questionsToRender = JSON.parse(JSON.stringify(currentQuiz.questions));
    if (quizForm.dataset.isShuffle === "true") {
        currentQuiz.renderedQuestions = shuffleQuestionsBySection(questionsToRender);
    } else {
        currentQuiz.renderedQuestions = questionsToRender;
    }

    // Gọi lại renderQuestions để xóa các class correct-answer/wrong-answer và bật lại input
    resetScoreCircle();
    renderQuestions();
    showView('active');
});

document.getElementById('btnReview').addEventListener('click', () => {
    quizForm.dataset.mode = 'review';

    const qs = currentQuiz.renderedQuestions || currentQuiz.questions;
    qs.forEach(q => {
        const qType = q.type || 'multiple_choice';

        if (qType === 'multiple_choice' || qType === 'true_false') {
            const selectedVal = userAnswers[q.id];
            const container = questionsContainer.querySelector(`input[name="question_${q.id}"]`).closest('.options-list');
            highlightAnswer(q, container, selectedVal);
        } else if (qType === 'true_false_group') {
            q.subQuestions.forEach(sq => {
                const selectedVal = userAnswers[`${q.id}_${sq.id}`];
                const radio = questionsContainer.querySelector(`input[name="question_${q.id}_${sq.id}"]`);
                highlightSubAnswer(sq, radio.closest('table'), radio, selectedVal);
            });
        } else if (qType === 'reading_group') {
            q.subQuestions.forEach(subQ => {
                const selectedVal = userAnswers[subQ.id];
                const container = questionsContainer.querySelector(`input[name="question_${subQ.id}"]`).closest('.options-list');
                highlightAnswer(subQ, container, selectedVal);
            });
        } else if (qType === 'short_answer') {
            const selectedVal = userAnswers[q.id];
            const input = document.querySelector(`input[name="question_${q.id}"]`);
            input.disabled = true;
            const container = input.closest('.short-answer-container');
            const resDiv = container.querySelector('.practice-result');
            resDiv.style.display = 'block';
            if (selectedVal == q.correctAnswer) {
                resDiv.textContent = 'Chính xác: ' + q.correctAnswer;
                resDiv.style.color = 'var(--correct)';
                input.style.borderColor = 'var(--correct)';
            } else {
                resDiv.textContent = 'Đáp án đúng: ' + q.correctAnswer + ' (Bạn nhập: ' + (selectedVal || 'trống') + ')';
                resDiv.style.color = 'var(--wrong)';
                input.style.borderColor = 'var(--wrong)';
            }
        }
    });

    // Đổi nút nộp bài thành nút quay lại
    const submitBtn = quizForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Quay Lại Kết Quả';
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-outline');

    showView('active');
});

document.getElementById('btnBackToMenuFromResult').addEventListener('click', () => {
    showView('list');
});

// === HELPER FUNCTIONS FOR HIGHLIGHTING ===
function highlightAnswer(q, container, selectedVal = null) {
    const inputs = container.querySelectorAll('input');
    inputs.forEach(input => {
        input.disabled = true;
        const label = input.closest('label');
        const val = parseInt(input.value);
        if (val === q.correctIndex) {
            label.classList.add('correct-answer');
        } else if (input.checked || (selectedVal !== null && val === selectedVal)) {
            label.classList.add('wrong-answer');
        }
    });
}

function highlightSubAnswer(sq, container, radio, selectedVal = null) {
    const radios = container.querySelectorAll(`input[name="${radio.name}"]`);
    radios.forEach(r => r.disabled = true);
    const label = radio.closest('label');
    const row = radio.closest('tr');

    if (radio.value === sq.correctAnswer || (selectedVal !== null && selectedVal === sq.correctAnswer)) {
        // Find correct radio in row
        const correctRadio = row.querySelector(`input[value="${sq.correctAnswer}"]`);
        correctRadio.closest('label').classList.add('correct-answer-circle');
    } else {
        const currentLabel = selectedVal !== null ? row.querySelector(`input[value="${selectedVal}"]`).closest('label') : label;
        currentLabel.classList.add('wrong-answer-circle');
        const correctRadio = row.querySelector(`input[value="${sq.correctAnswer}"]`);
        correctRadio.closest('label').classList.add('correct-answer-circle');
    }
}

function resetScoreCircle() {
    const circle = document.querySelector('.score-circle');
    if (circle) {
        circle.style.background = '#E5E7EB';
    }
}

// === LOGIC XÁC THỰC (AUTHENTICATION) ===
// Đã được gỡ bỏ theo yêu cầu

// === KHỞI CHẠY TỰ ĐỘNG LÚC LOAD TRANG ===
// Tải các đề tự tạo từ localStorage
function loadCustomQuizzes() {
    try {
        const saved = localStorage.getItem("trongbeshop_custom_quizzes");
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Thêm vào đầu danh sách (đề mới nhất lên trên)
                mockQuizzes.unshift(...parsed);
            }
        }
    } catch (e) {
        console.error("Lỗi khi tải đề tự tạo:", e);
    }
}

// Tải các đề công khai từ Firebase
function loadPublicQuizzes() {
    try {
        const publicRef = ref(dbRT, 'public_quizzes');
        onValue(publicRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const publicList = Object.values(data);
                let addedNew = false;
                publicList.forEach(pq => {
                    // Đảm bảo questions luôn là mảng (Firebase đôi khi trả về object nếu index bị nhảy)
                    if (pq.questions && !Array.isArray(pq.questions)) {
                        pq.questions = Object.values(pq.questions);
                    }
                    if (pq.questions) {
                        pq.questions.forEach(q => {
                            if (q.subQuestions && !Array.isArray(q.subQuestions)) {
                                q.subQuestions = Object.values(q.subQuestions);
                            }
                        });
                    }

                    // Check if already in mockQuizzes (maybe from localStorage)
                    const exists = mockQuizzes.find(q => q.id == pq.id);
                    if (!exists) {
                        mockQuizzes.push(pq);
                        addedNew = true;
                    }
                });
                if (addedNew) initQuizList();
            }
        });
    } catch(e) {
        console.error("Lỗi tải đề công khai:", e);
    }
}

loadCustomQuizzes();
loadPublicQuizzes();
initQuizList();

// === EXPOSE CHO GEMINI MODULE ===
window.__mockQuizzes = mockQuizzes;
window.__initQuizList = initQuizList;
window.__saveCustomQuizzes = function() {
    try {
        // We only save quizzes created by this browser (starts with gemini_)
        const customOnly = mockQuizzes.filter(q => q.id.toString().startsWith("gemini_"));
        localStorage.setItem("trongbeshop_custom_quizzes", JSON.stringify(customOnly));
    } catch (e) {
        console.error("Lỗi khi lưu đề:", e);
    }
};

window.__publishPublicQuiz = function(quizObj) {
    try {
        if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();
        
        const publicRef = ref(dbRT, 'public_quizzes/' + quizObj.id);
        runTransaction(publicRef, () => {
            return quizObj;
        }).catch(e => {
            console.error(e);
            alert("Lỗi khi đăng công khai (Firebase không cho phép ghi): " + e.message);
        });
    } catch(e) {
        console.error("Lỗi publish:", e);
    }
};

// === ADMIN MODE (ẨN) ===
let adminClickCount = 0;
let adminClickTimer = null;
const headerTitle = document.querySelector('header h1');
if (headerTitle) {
    headerTitle.addEventListener('click', () => {
        adminClickCount++;
        clearTimeout(adminClickTimer);
        if (adminClickCount >= 10) {
            adminClickCount = 0;
            const currentAdmin = localStorage.getItem('admin_secret_key');
            if (currentAdmin === 'trongbeshop') {
                localStorage.removeItem('admin_secret_key');
                alert("Đã TẮT chế độ Admin.");
            } else {
                localStorage.setItem('admin_secret_key', 'trongbeshop');
                alert("Đã BẬT chế độ Admin! Bạn có quyền xóa toàn bộ đề thi Công Khai.");
            }
            initQuizList(); // Refresh list to show/hide delete buttons
        }
        adminClickTimer = setTimeout(() => { adminClickCount = 0; }, 2000);
    });
}

