// === MOCK DATA: BỘ ĐỀ MẪU ===
// Bạn có thể dễ dàng thêm hoặc thay đổi câu hỏi tại đây
const mockQuizzes = [
    {
        id: "toan_thpt",
        title: "Đề Cương Ôn Tập Toán - Cơ Bản",
        description: "Bao gồm các câu hỏi trắc nghiệm Đại Số và Hình Học cơ bản để làm quen với hệ thống.",
        questions: [
            { id: "q1", text: "1 + 1 bằng mấy?", options: ["1", "2", "3", "4"], correctIndex: 1 },
            { id: "q2", text: "Nghiệm của phương trình x - 2 = 0 là?", options: ["x = 1", "x = -2", "x = 2", "x = 0"], correctIndex: 2 },
            { id: "q3", text: "Tam giác có 3 mặt gọi là?", options: ["Không tồn tại tam giác có 3 mặt", "Hình chóp", "Tứ diện", "Cả A và C"], correctIndex: 0 }
        ]
    },
    {
        id: "tieng_anh_b1",
        title: "Bài Kiểm Tra Từ Vựng Tiếng Anh - B1",
        description: "Kiểm tra vốn từ vựng và ngữ pháp Tiếng Anh ở mức độ trung bình.",
        questions: [
            { id: "q1", text: "He _______ a book right now.", options: ["read", "reads", "is reading", "reading"], correctIndex: 2 },
            { id: "q2", text: "I _______ to London last year.", options: ["go", "goes", "went", "going"], correctIndex: 2 },
            { id: "q3", text: "What is the synonym of 'Happy'?", options: ["Sad", "Angry", "Glad", "Tired"], correctIndex: 2 },
            { id: "q4", text: "Look at those dark clouds! It _______ rain.", options: ["is going to", "will", "shall", "can"], correctIndex: 0 }
        ]
    }
];

// === TRẠNG THÁI (STATE) ===
let currentQuiz = null;

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
            <div class="quiz-meta">📚 Số câu: ${quiz.questions.length}</div>
            <button class="btn btn-primary" style="width:100%" onclick="startQuiz('${quiz.id}')">Bắt Đầu Làm Bài</button>
        `;
        quizListContainer.appendChild(card);
    });
}

// === BẮT ĐẦU LÀM BÀI ===
window.startQuiz = function(quizId) {
    currentQuiz = mockQuizzes.find(q => q.id === quizId);
    if (!currentQuiz) return;
    
    // Xóa kết quả chọn cũ
    quizForm.reset();
    
    currentQuizTitle.textContent = currentQuiz.title;
    renderQuestions();
    showView('active');
};

// === KIẾN TẠO GIAO DIỆN CÂU HỎI TRONG ĐỀ ===
function renderQuestions() {
    questionsContainer.innerHTML = '';
    currentQuiz.questions.forEach((q, index) => {
        const qBlock = document.createElement('div');
        qBlock.className = 'question-card';
        
        const qTitle = document.createElement('h4');
        qTitle.textContent = `Câu ${index + 1}: ${q.text}`;
        qBlock.appendChild(qTitle);
        
        const optionsList = document.createElement('div');
        optionsList.className = 'options-list';
        
        q.options.forEach((opt, optIndex) => {
            const label = document.createElement('label');
            label.className = 'option-label';
            label.innerHTML = `
                <input type="radio" name="question_${q.id}" value="${optIndex}" required>
                <span>${opt}</span>
            `;
            optionsList.appendChild(label);
        });
        
        qBlock.appendChild(optionsList);
        questionsContainer.appendChild(qBlock);
    });
}

// === XỬ LÝ KHI NỘP BÀI TẬP ===
quizForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Chấm điểm
    let correct = 0;
    let incorrect = 0;
    
    const formData = new FormData(quizForm);
    currentQuiz.questions.forEach(q => {
        const selectedVal = formData.get(`question_${q.id}`);
        // Chú ý: giá trị lấy từ formData làchuỗi text
        if (selectedVal !== null && parseInt(selectedVal) === q.correctIndex) {
            correct++;
        } else {
            incorrect++;
        }
    });
    
    // Hiển thị kết quả lên màn hình Result
    document.getElementById('scoreText').textContent = `${correct}/${currentQuiz.questions.length}`;
    document.getElementById('correctCount').textContent = correct;
    document.getElementById('incorrectCount').textContent = incorrect;
    
    showView('result');
});

// === CÁC NÚT ĐIỀU HƯỚNG ===
document.getElementById('btnBackToMenu').addEventListener('click', () => {
    if(confirm("Bạn có chắc muốn thoát? Tiến trình bài đang làm sẽ bị hủy bỏ.")) {
        showView('list');
    }
});

document.getElementById('btnRetry').addEventListener('click', () => {
    // Chỉ cần hiển thị lại form vì id form và radio đã được sinh ra
    // và quizForm.reset() sẽ làm sạch lựa chọn đã tick
    quizForm.reset();
    showView('active');
});

document.getElementById('btnBackToMenuFromResult').addEventListener('click', () => {
    showView('list');
});

// === KHỞI CHẠY TỰ ĐỘNG LÚC LOAD TRANG ===
initQuizList();
