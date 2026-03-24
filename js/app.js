import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const db = getFirestore(app);

// === MOCK DATA: BỘ ĐỀ MẪU ===
// Bạn có thể dễ dàng thêm hoặc thay đổi câu hỏi tại đây
const mockQuizzes = [
    {
        id: "english_review_gk2_11",
        title: "Review GK2 - 11",
        description: "Đề ôn tập giữa kỳ 2 môn Tiếng Anh lớp 11 (Phonetics, Stress, Vocabulary & Grammar).",
        questions: [
            // PHONETICS
            { id: "q1", section: "PHONETICS", text: "", options: ["A. <u>h</u>eritage", "B. <u>h</u>istoric", "C. <u>h</u>onor", "D. <u>h</u>abitat"], correctIndex: 2 },
            { id: "q2", section: "PHONETICS", text: "", options: ["A. <u>a</u>ncient", "B. pr<u>e</u>serve", "C. r<u>e</u>lic", "D. s<u>e</u>tting"], correctIndex: 0 },
            { id: "q3", section: "PHONETICS", text: "", options: ["A. d<u>e</u>gree", "B. appr<u>e</u>ntice", "C. coll<u>e</u>ge", "D. univ<u>e</u>rsity"], correctIndex: 1 },
            { id: "q4", section: "PHONETICS", text: "", options: ["A. <u>ch</u>oice", "B. <u>ch</u>ance", "C. <u>ch</u>aracter", "D. <u>ch</u>air"], correctIndex: 2 },
            { id: "q5", section: "PHONETICS", text: "", options: ["A. d<u>e</u>cide", "B. d<u>e</u>pend", "C. d<u>e</u>velop", "D. d<u>e</u>dicated"], correctIndex: 3 },
            { id: "q6", section: "PHONETICS", text: "", options: ["A. r<u>i</u>se", "B. sk<u>i</u>ll", "C. t<u>i</u>me", "D. l<u>i</u>fe"], correctIndex: 1 },
            { id: "q7", section: "PHONETICS", text: "", options: ["A. <u>a</u>ncient", "B. l<u>a</u>ndscape", "C. v<u>a</u>lley", "D. st<u>a</u>te"], correctIndex: 2 },
            { id: "q8", section: "PHONETICS", text: "", options: ["A. me<u>ch</u>anic", "B. <u>ch</u>oice", "C. <u>ch</u>ance", "D. <u>ch</u>ange"], correctIndex: 0 },

            // STRESS
            { id: "q9", section: "STRESS", text: "", options: ["A. routine", "B. laundry", "C. household", "D. budget"], correctIndex: 0 },
            { id: "q10", section: "STRESS", text: "", options: ["A. independent", "B. irresponsible", "C. intermediate", "D. individual"], correctIndex: 1 },
            { id: "q11", section: "STRESS", text: "", options: ["A. manage", "B. master", "C. polite", "D. student"], correctIndex: 2 },
            { id: "q12", section: "STRESS", text: "", options: ["A. academic", "B. vocational", "C. professional", "D. responsible"], correctIndex: 0 },
            { id: "q13", section: "STRESS", text: "", options: ["A. temple", "B. relic", "C. complex", "D. suggest"], correctIndex: 3 },
            { id: "q14", section: "STRESS", text: "", options: ["A. recognize", "B. monument", "C. recommend", "D. landscape"], correctIndex: 2 },

            // VOCABULARY AND GRAMMAR
            { id: "q15", section: "VOCABULARY AND GRAMMAR", text: "The Citadel of the Ho Dynasty was ______ as a World Heritage Site in 2011.", options: ["A. recognized", "B. performed", "C. restored", "D. protected"], correctIndex: 0 },
            { id: "q16", section: "VOCABULARY AND GRAMMAR", text: "It is important to ______ our traditional music so that future generations can enjoy it.", options: ["A. damage", "B. preserve", "C. ignore", "D. replace"], correctIndex: 1 },
            { id: "q17", section: "VOCABULARY AND GRAMMAR", text: "______ the ancient temple, we were amazed by the intricate carvings.", options: ["A. Visit", "B. Visiting", "C. Visited", "D. To visiting"], correctIndex: 1 },
            { id: "q18", section: "VOCABULARY AND GRAMMAR", text: "The ______ of the old palace took several years and cost millions of dollars.", options: ["A. restore", "B. restorative", "C. restoration", "D. restorer"], correctIndex: 2 },
            { id: "q19", section: "VOCABULARY AND GRAMMAR", text: "Participating in the folk-singing club helps students contribute ______ the preservation of local culture.", options: ["A. in", "B. on", "C. to", "D. for"], correctIndex: 2 },
            { id: "q20", section: "VOCABULARY AND GRAMMAR", text: "It was my mother ______ taught me how to cook when I was a child.", options: ["A. which", "B. whom", "C. that", "D. whose"], correctIndex: 2 },
            { id: "q21", section: "VOCABULARY AND GRAMMAR", text: "______ in his financial report, he went to bed.", options: ["A. Having handed", "B. Handing", "C. To handing", "D. To hand"], correctIndex: 0 },
            { id: "q22", section: "VOCABULARY AND GRAMMAR", text: "Scientists are trying to come up ______ new ways to reduce plastic waste in the oceans.", options: ["A. with", "B. on", "C. in", "D. by"], correctIndex: 0 },
            { id: "q23", section: "VOCABULARY AND GRAMMAR", text: "Many school-leavers choose ______ education to learn practical skills for a specific job.", options: ["A. academic", "B. vocational", "C. secondary", "D. primary"], correctIndex: 1 },
            { id: "q24", section: "VOCABULARY AND GRAMMAR", text: "After finishing high school, you can apply for an ______ to work and learn at the same time.", options: ["A. internship", "B. appointment", "C. application", "D. apprenticeship"], correctIndex: 3 },
            { id: "q25", section: "VOCABULARY AND GRAMMAR", text: "______ hard for the entrance exam, she felt confident about her results.", options: ["A. Study", "B. Studying", "C. Studied", "D. To study"], correctIndex: 1 },
            { id: "q26", section: "VOCABULARY AND GRAMMAR", text: "Higher education provides students with specialized ______ in various fields.", options: ["A. know", "B. knowledgeable", "C. knowledge", "D. known"], correctIndex: 2 },
            { id: "q27", section: "VOCABULARY AND GRAMMAR", text: "Students often depend ______ their parents for financial support during their university years.", options: ["A. on", "B. in", "C. with", "D. at"], correctIndex: 0 },
            { id: "q28", section: "VOCABULARY AND GRAMMAR", text: "It was the vintage car ______ my father bought at the auction last Sunday.", options: ["A. whose", "B. whom", "C. who", "D. that"], correctIndex: 3 },
            { id: "q29", section: "VOCABULARY AND GRAMMAR", text: "______ for a gap year, he gained a lot of life experience before starting college.", options: ["A. Having opted", "B. To opting", "C. Opts", "D. To opt"], correctIndex: 0 },
            { id: "q30", section: "VOCABULARY AND GRAMMAR", text: "To protect the environment, we should get ______ the habit of recycling our household waste every day.", options: ["A. into", "B. in", "C. on", "D. by"], correctIndex: 0 },
            { id: "q31", section: "VOCABULARY AND GRAMMAR", text: "Learning how to ______ a budget is an essential life skill for teenagers.", options: ["A. make", "B. do", "C. manage", "D. carry"], correctIndex: 2 },
            { id: "q32", section: "VOCABULARY AND GRAMMAR", text: "Teenagers should learn to be ______ so they don't have to rely on their parents for everything.", options: ["A. dependent", "B. self-reliant", "C. helpful", "D. curious"], correctIndex: 1 },
            { id: "q33", section: "VOCABULARY AND GRAMMAR", text: "______ how to cook, Nam can now prepare healthy meals for himself.", options: ["A. Learn", "B. Learning", "C. Learned", "D. To learn"], correctIndex: 1 },
            { id: "q34", section: "VOCABULARY AND GRAMMAR", text: "Developing time-management skills is key to your ______.", options: ["A. independent", "B. independence", "C. independently", "D. independed"], correctIndex: 1 },
            { id: "q35", section: "VOCABULARY AND GRAMMAR", text: "Parents should encourage their children to take responsibility ______ their own actions.", options: ["A. with", "B. for", "C. in", "D. to"], correctIndex: 1 },
            { id: "q36", section: "VOCABULARY AND GRAMMAR", text: "It was in 2010 ______ they first met each other in London.", options: ["A. that", "B. which", "C. when", "D. where"], correctIndex: 0 },
            { id: "q37", section: "VOCABULARY AND GRAMMAR", text: "______ her household chores early, she had more time to study for the exam.", options: ["A. Having finished", "B. Finishing", "C. Finishes", "D. Finish"], correctIndex: 0 },
            { id: "q38", section: "VOCABULARY AND GRAMMAR", text: "We should ______ the natural light to save energy in our classroom.", options: ["A. make use of", "B. come up with", "C. get into", "D. look forward to"], correctIndex: 0 }
        ]
    }
];

// === TRẠNG THÁI (STATE) ===
let currentQuiz = null;
let userAnswers = {};

// === PHẦN TỬ DOM ===
const views = {
    list: document.getElementById('quizListView'),
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
            <div class="tags-container" style="margin-bottom: 24px; display: flex; align-items: center;">
                <span class="quiz-meta">📚 Số câu: ${quiz.questions.length}</span>
                <span class="quiz-views" id="views-${quiz.id}">Lượt truy cập: Đang tải...</span>
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="startQuiz('${quiz.id}')">Bắt Đầu Làm Bài</button>
        `;
        quizListContainer.appendChild(card);
    });
    initRealtimeViews();
}

// === LẮNG NGHE DỮ LIỆU LƯỢT TRUY CẬP THỜI GIAN THỰC TỪ FIREBASE ===
function initRealtimeViews() {
    try {
        // Sử dụng onSnapshot để cập nhật tự động mà không cần load lại trang
        onSnapshot(collection(db, "quizzes"), (querySnapshot) => {
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const viewEl = document.getElementById(`views-${docSnap.id}`);
                if (viewEl) {
                    viewEl.innerHTML = `Lượt truy cập: ${data.views || 0}`;
                }
            });

            // Cập nhật 0 cho những tài liệu chưa có trong bảng dữ liệu
            mockQuizzes.forEach(quiz => {
                const viewEl = document.getElementById(`views-${quiz.id}`);
                if (viewEl && (viewEl.textContent.includes("Đang tải") || viewEl.textContent === "")) {
                    viewEl.innerHTML = `Lượt truy cập: 0`;
                }
            });
        }, (error) => {
            console.error("Lỗi lắng nghe lượt truy cập Firebase:", error);
        });
    } catch (error) {
        console.error("Lỗi khởi tạo tính năng thời gian thực:", error);
    }
}

// === HÀM ĐẢO CÂU HỎI THEO PHẦN ===
function shuffleQuestionsBySection(questions) {
    const sections = [];
    questions.forEach(q => {
        if (!sections.includes(q.section)) {
            sections.push(q.section);
        }
    });

    let shuffled = [];
    sections.forEach(sec => {
        let group = questions.filter(q => q.section === sec);
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        shuffled = shuffled.concat(group);
    });
    return shuffled;
}

// === BẮT ĐẦU LÀM BÀI ===
window.startQuiz = async function (quizId) {
    currentQuiz = mockQuizzes.find(q => q.id === quizId);
    if (!currentQuiz) return;

    // --- TỐI ƯU HIỆU SUẤT: HIỂN THỊ GIAO DIỆN NGAY LẬP TỨC ---
    // Tráo câu hỏi nhưng giữ nguyên các phần
    currentQuiz.questions = shuffleQuestionsBySection(currentQuiz.questions);

    // Xóa kết quả chọn cũ & Reset form
    quizForm.reset();
    quizForm.dataset.mode = 'exam';
    const submitBtn = quizForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Nộp Bài Ngay';
        submitBtn.classList.remove('btn-outline');
        submitBtn.classList.add('btn-primary');
    }

    currentQuizTitle.textContent = currentQuiz.title;
    renderQuestions();
    showView('active'); 
    // ---------------------------------------------------------

    // Tăng lượt xem (view) trên Firebase chạy ngầm phía dưới
    try {
        let viewedQuizzes = [];
        try {
            viewedQuizzes = JSON.parse(localStorage.getItem('viewedQuizzes') || '[]');
        } catch (err) {
            viewedQuizzes = [];
        }
        
        if (!Array.isArray(viewedQuizzes)) viewedQuizzes = [];

        if (!viewedQuizzes.includes(quizId)) {
            // Đánh dấu đã xem ngay lập tức
            viewedQuizzes.push(quizId);
            localStorage.setItem('viewedQuizzes', JSON.stringify(viewedQuizzes));

            const quizRef = doc(db, "quizzes", quizId);
            try {
                // Tăng lượt xem ngầm
                const quizSnap = await getDoc(quizRef);
                if (quizSnap.exists()) {
                    await updateDoc(quizRef, { views: increment(1) });
                } else {
                    await setDoc(quizRef, { views: 1 });
                }
                // Do đã sử dụng onSnapshot, UI sẽ tự động cập nhật mà không cần gán thủ công ở đây
            } catch (error) {
                console.error("Lỗi khi cập nhật view:", error);
            }
        }
    } catch (e) {
        console.error("Lỗi logic lượt xem:", e);
    }
};

// === KIẾN TẠO GIAO DIỆN CÂU HỎI TRONG ĐỀ ===
function renderQuestions() {
    questionsContainer.innerHTML = '';
    let currentSection = "";
    let sectionQuestionIndex = 1;

    currentQuiz.questions.forEach((q, index) => {
        // Render phần tiêu đề nhóm câu hỏi nếu có
        if (q.section && q.section !== currentSection) {
            const secHeader = document.createElement('h3');
            secHeader.className = 'section-title';
            secHeader.style.marginTop = '32px';
            secHeader.style.marginBottom = '16px';
            secHeader.style.color = 'var(--primary)';
            secHeader.style.textTransform = 'uppercase';
            secHeader.textContent = q.section;
            questionsContainer.appendChild(secHeader);
            currentSection = q.section;
            sectionQuestionIndex = 1; // Khởi động lại đếm số câu cho phần mới
        }

        const qBlock = document.createElement('div');
        qBlock.className = 'question-card';

        const qTitle = document.createElement('h4');
        if (q.text) {
            qTitle.innerHTML = `Câu ${sectionQuestionIndex}: ${q.text}`;
        } else {
            qTitle.innerHTML = `Câu ${sectionQuestionIndex}:`;
            qTitle.style.marginBottom = '12px'; // Giảm khoảng cách nếu không có nội dung chữ dài
        }
        qBlock.appendChild(qTitle);

        const optionsList = document.createElement('div');
        optionsList.className = 'options-list';

        q.options.forEach((opt, optIndex) => {
            const label = document.createElement('label');
            label.className = 'option-label';
            label.innerHTML = `
                <input type="radio" name="question_${q.id}" value="${optIndex}">
                <span>${opt}</span>
            `;
            optionsList.appendChild(label);
        });

        qBlock.appendChild(optionsList);
        questionsContainer.appendChild(qBlock);

        sectionQuestionIndex++; // Tăng số đếm câu hiện tại lên 1
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
    userAnswers = {}; // Reset lại đáp án đã chọn

    const formData = new FormData(quizForm);
    currentQuiz.questions.forEach(q => {
        const selectedVal = formData.get(`question_${q.id}`);
        if (selectedVal === null) {
            unanswered++;
            userAnswers[q.id] = null;
        } else {
            const val = parseInt(selectedVal);
            userAnswers[q.id] = val;
            if (val === q.correctIndex) {
                correct++;
            } else {
                incorrect++;
            }
        }
    });

    // Hiển thị kết quả lên màn hình Result
    document.getElementById('scoreText').textContent = `${correct}/${currentQuiz.questions.length}`;
    document.getElementById('correctCount').textContent = correct;
    document.getElementById('incorrectCount').textContent = incorrect;

    const unansweredEl = document.getElementById('unansweredCount');
    if (unansweredEl) unansweredEl.textContent = unanswered;

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
    currentQuiz.questions = shuffleQuestionsBySection(currentQuiz.questions);

    // Gọi lại renderQuestions để xóa các class correct-answer/wrong-answer và bật lại input
    renderQuestions();
    showView('active');
});

document.getElementById('btnReview').addEventListener('click', () => {
    quizForm.dataset.mode = 'review';

    currentQuiz.questions.forEach(q => {
        const selectedVal = userAnswers[q.id];
        const inputs = document.querySelectorAll(`input[name="question_${q.id}"]`);

        inputs.forEach(input => {
            input.disabled = true; // Khóa thay đổi đáp án
            const label = input.closest('label');
            const val = parseInt(input.value);

            // Đánh dấu đáp án đúng
            if (val === q.correctIndex) {
                label.classList.add('correct-answer');
            }
            // Đánh dấu đáp án sai mà người dùng đã chọn
            else if (val === selectedVal) {
                label.classList.add('wrong-answer');
            }
        });
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

// === LOGIC XÁC THỰC (AUTHENTICATION) ===
// Đã được gỡ bỏ theo yêu cầu

// === KHỞI CHẠY TỰ ĐỘNG LÚC LOAD TRANG ===
initQuizList();
