// === MOCK DATA: BỘ ĐỀ MẪU ===
// Bạn có thể dễ dàng thêm hoặc thay đổi câu hỏi tại đây
const mockQuizzes = [
    {
        id: "english_review_gk2_11",
        title: "Review GK2 - 11",
        description: "Đề ôn tập giữa kỳ 2 môn Tiếng Anh lớp 11 (Phonetics, Stress, Vocabulary & Grammar).",
        questions: [
            // PHONETICS
            { id: "q1", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. heritage B. historic C. honor D. habitat", options: ["A. heritage", "B. historic", "C. honor", "D. habitat"], correctIndex: 2 },
            { id: "q2", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. ancient B. preserve C. relic D. setting", options: ["A. ancient", "B. preserve", "C. relic", "D. setting"], correctIndex: 0 },
            { id: "q3", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. degree B. apprentice C. college D. university", options: ["A. degree", "B. apprentice", "C. college", "D. university"], correctIndex: 1 },
            { id: "q4", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. choice B. chance C. character D. chair", options: ["A. choice", "B. chance", "C. character", "D. chair"], correctIndex: 2 },
            { id: "q5", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. decide B. depend C. develop D. dedicated", options: ["A. decide", "B. depend", "C. develop", "D. dedicated"], correctIndex: 3 },
            { id: "q6", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. rise B. skill C. time D. life", options: ["A. rise", "B. skill", "C. time", "D. life"], correctIndex: 1 },
            { id: "q7", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. ancient B. landscape C. valley D. state", options: ["A. ancient", "B. landscape", "C. valley", "D. state"], correctIndex: 2 },
            { id: "q8", text: "PHONETICS - Choose the word whose underlined part is pronounced differently: A. mechanic B. choice C. chance D. change", options: ["A. mechanic", "B. choice", "C. chance", "D. change"], correctIndex: 0 },
            
            // STRESS
            { id: "q9", text: "STRESS - Choose the word that has a different stress pattern: A. routine B. laundry C. household D. budget", options: ["A. routine", "B. laundry", "C. household", "D. budget"], correctIndex: 0 },
            { id: "q10", text: "STRESS - Choose the word that has a different stress pattern: A. independent B. irresponsible C. intermediate D. individual", options: ["A. independent", "B. irresponsible", "C. intermediate", "D. individual"], correctIndex: 1 },
            { id: "q11", text: "STRESS - Choose the word that has a different stress pattern: A. manage B. master C. polite D. student", options: ["A. manage", "B. master", "C. polite", "D. student"], correctIndex: 2 },
            { id: "q12", text: "STRESS - Choose the word that has a different stress pattern: A. academic B. vocational C. professional D. responsible", options: ["A. academic", "B. vocational", "C. professional", "D. responsible"], correctIndex: 0 },
            { id: "q13", text: "STRESS - Choose the word that has a different stress pattern: A. temple B. relic C. complex D. suggest", options: ["A. temple", "B. relic", "C. complex", "D. suggest"], correctIndex: 3 },
            { id: "q14", text: "STRESS - Choose the word that has a different stress pattern: A. recognize B. monument C. recommend D. landscape", options: ["A. recognize", "B. monument", "C. recommend", "D. landscape"], correctIndex: 2 },
            
            // VOCABULARY AND GRAMMAR
            { id: "q15", text: "The Citadel of the Ho Dynasty was ______ as a World Heritage Site in 2011.", options: ["A. recognized", "B. performed", "C. restored", "D. protected"], correctIndex: 0 },
            { id: "q16", text: "It is important to ______ our traditional music so that future generations can enjoy it.", options: ["A. damage", "B. preserve", "C. ignore", "D. replace"], correctIndex: 1 },
            { id: "q17", text: "______ the ancient temple, we were amazed by the intricate carvings.", options: ["A. Visit", "B. Visiting", "C. Visited", "D. To visiting"], correctIndex: 1 },
            { id: "q18", text: "The ______ of the old palace took several years and cost millions of dollars.", options: ["A. restore", "B. restorative", "C. restoration", "D. restorer"], correctIndex: 2 },
            { id: "q19", text: "Participating in the folk-singing club helps students contribute ______ the preservation of local culture.", options: ["A. in", "B. on", "C. to", "D. for"], correctIndex: 2 },
            { id: "q20", text: "It was my mother ______ taught me how to cook when I was a child.", options: ["A. which", "B. whom", "C. that", "D. whose"], correctIndex: 2 },
            { id: "q21", text: "______ in his financial report, he went to bed.", options: ["A. Having handed", "B. Handing", "C. To handing", "D. To hand"], correctIndex: 0 },
            { id: "q22", text: "Scientists are trying to come up ______ new ways to reduce plastic waste in the oceans.", options: ["A. with", "B. on", "C. in", "D. by"], correctIndex: 0 },
            { id: "q23", text: "Many school-leavers choose ______ education to learn practical skills for a specific job.", options: ["A. academic", "B. vocational", "C. secondary", "D. primary"], correctIndex: 1 },
            { id: "q24", text: "After finishing high school, you can apply for an ______ to work and learn at the same time.", options: ["A. internship", "B. appointment", "C. application", "D. apprenticeship"], correctIndex: 3 },
            { id: "q25", text: "______ hard for the entrance exam, she felt confident about her results.", options: ["A. Study", "B. Studying", "C. Studied", "D. To study"], correctIndex: 1 },
            { id: "q26", text: "Higher education provides students with specialized ______ in various fields.", options: ["A. know", "B. knowledgeable", "C. knowledge", "D. known"], correctIndex: 2 },
            { id: "q27", text: "Students often depend ______ their parents for financial support during their university years.", options: ["A. on", "B. in", "C. with", "D. at"], correctIndex: 0 },
            { id: "q28", text: "It was the vintage car ______ my father bought at the auction last Sunday.", options: ["A. whose", "B. whom", "C. who", "D. that"], correctIndex: 3 },
            { id: "q29", text: "______ for a gap year, he gained a lot of life experience before starting college.", options: ["A. Having opted", "B. To opting", "C. Opts", "D. To opt"], correctIndex: 0 },
            { id: "q30", text: "To protect the environment, we should get ______ the habit of recycling our household waste every day.", options: ["A. into", "B. in", "C. on", "D. by"], correctIndex: 0 },
            { id: "q31", text: "Learning how to ______ a budget is an essential life skill for teenagers.", options: ["A. make", "B. do", "C. manage", "D. carry"], correctIndex: 2 },
            { id: "q32", text: "Teenagers should learn to be ______ so they don't have to rely on their parents for everything.", options: ["A. dependent", "B. self-reliant", "C. helpful", "D. curious"], correctIndex: 1 },
            { id: "q33", text: "______ how to cook, Nam can now prepare healthy meals for himself.", options: ["A. Learn", "B. Learning", "C. Learned", "D. To learn"], correctIndex: 1 },
            { id: "q34", text: "Developing time-management skills is key to your ______.", options: ["A. independent", "B. independence", "C. independently", "D. independed"], correctIndex: 1 },
            { id: "q35", text: "Parents should encourage their children to take responsibility ______ their own actions.", options: ["A. with", "B. for", "C. in", "D. to"], correctIndex: 1 },
            { id: "q36", text: "It was in 2010 ______ they first met each other in London.", options: ["A. that", "B. which", "C. when", "D. where"], correctIndex: 0 },
            { id: "q37", text: "______ her household chores early, she had more time to study for the exam.", options: ["A. Having finished", "B. Finishing", "C. Finishes", "D. Finish"], correctIndex: 0 },
            { id: "q38", text: "We should ______ the natural light to save energy in our classroom.", options: ["A. make use of", "B. come up with", "C. get into", "D. look forward to"], correctIndex: 0 }
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
