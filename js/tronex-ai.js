/**
 * tronex-AI: TRỢ LÝ GIẢNG GIẢI & TRÌNH TẠO ĐỀ THI
 * Tích hợp Gemini 2.0 Flash / 3.0 Flash
 */
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// Lấy API Key từ gemini.js (giả sử được export hoặc dùng chung logic)
const _K = [
    "AIzaSyBnRHrkbQwQF43n" + "UFYuE_kjkg0sK2HDDiU",
    "AIzaSyBujYVCD_avJy1E" + "yYZHpwu0M10itiAXSnY",
    "AIzaSyBW6zkLdppAwv1Y" + "I2t-ikeS3J_GXGgYjX0",
    "AIzaSyB5jCvX0f3Nu8FI" + "4QKHkfVciKm-JWCkOls",
    "AIzaSyC6nbhLMVC-91NT" + "i0vySoMH1haM9HRBdF0"
];
let _idx = 0;
const gK = () => _K[_idx % _K.length];

class tronexAI {
    constructor() {
        this.chatContainer = document.getElementById('aiChatContainer');
        this.chatMessages = document.getElementById('aiChatMessages');
        this.chatInput = document.getElementById('aiChatInput');
        this.sendBtn = document.getElementById('btnSendAiChat');
        
        this.creatorOverlay = document.getElementById('manualCreatorOverlay');
        this.questionsContainer = document.getElementById('manualQuestionsContainer');
        this.manualQuestions = [];
        
        this.init();
    }

    init() {
        // AI Chat Events
        document.getElementById('btnOpenAiChat')?.addEventListener('click', () => this.toggleChat());
        this.sendBtn?.addEventListener('click', () => this.sendMessage());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Manual Creator Events
        document.getElementById('btnOpenManualCreator')?.addEventListener('click', () => this.openCreator());
        document.getElementById('btnCloseCreator')?.addEventListener('click', () => this.closeCreator());
        document.getElementById('btnSaveManualQuiz')?.addEventListener('click', () => this.saveManualQuiz());

        // Global functions for HTML onclick
        window.toggleAiChat = () => this.toggleChat();
        window.toggleChatFullscreen = () => this.toggleFullscreen();
        window.addManualQuestion = (type) => this.addQuestion(type);
        window.askAiAboutQuestion = (qIndex) => this.askAboutQuestion(qIndex);
    }

    // --- AI CHAT LOGIC ---
    toggleChat() {
        const isVisible = this.chatContainer.style.display === 'flex';
        this.chatContainer.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) this.chatInput.focus();
    }

    toggleFullscreen() {
        this.chatContainer.classList.toggle('fullscreen');
    }

    addMessage(text, sender = 'ai') {
        const msg = document.createElement('div');
        msg.className = `msg-bubble msg-${sender}`;
        msg.innerHTML = text; // Có thể chứa markdown/html
        this.chatMessages.appendChild(msg);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async sendMessage(customPrompt = null) {
        const text = customPrompt || this.chatInput.value.trim();
        if (!text) return;

        if (!customPrompt) {
            this.addMessage(text, 'user');
            this.chatInput.value = '';
        }

        // Loading state
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'msg-bubble msg-ai';
        loadingMsg.innerHTML = '<span class="dots-loading">Gemini đang suy nghĩ...</span>';
        this.chatMessages.appendChild(loadingMsg);

        try {
            const genAI = new GoogleGenerativeAI(gK());
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            // Lấy ngữ cảnh nếu đang làm bài
            let context = "";
            if (window.currentActiveQuiz && window.currentQuestionIndex !== undefined) {
                const q = window.currentActiveQuiz.questions[window.currentQuestionIndex];
                context = `\nNgữ cảnh: Học sinh đang làm Câu ${window.currentQuestionIndex + 1}. \nNội dung: ${q.text}\nĐáp án: ${q.options ? q.options.join(', ') : 'Tự luận'}`;
            }

            const prompt = `Bạn là trợ lý giảng dạy thông minh Gemini. Hãy giải thích ngắn gọn, dễ hiểu và truyền cảm hứng. ${context}\nCâu hỏi của học sinh: ${text}`;
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            loadingMsg.innerHTML = response.text().replace(/\n/g, '<br>');
        } catch (err) {
            loadingMsg.innerHTML = "Xin lỗi, tôi gặp chút sự cố kết nối. Hãy thử lại nhé!";
            console.error(err);
        }
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    askAboutQuestion(qIndex) {
        this.toggleChat();
        if (this.chatContainer.style.display === 'flex') {
            this.sendMessage(`Hãy giải thích cho mình cách làm câu này với!`);
        }
    }

    // --- MANUAL CREATOR LOGIC ---
    openCreator() {
        const title = prompt("Vui lòng nhập tên đề thi mới:", "Đề thi V-ACT mới");
        if (!title) return;
        
        document.getElementById('manualQuizTitle').value = title;
        document.getElementById('creatorTitleDisplay').textContent = title;
        
        this.creatorOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Đăng ký collector cho Gemini
        window.__tronexAICollector = (questions) => {
            questions.forEach(q => {
                this.manualQuestions.push({
                    id: Date.now() + Math.random(),
                    type: q.type || 'multiple_choice',
                    text: q.text,
                    options: q.options || ['', '', '', ''],
                    correctIndex: q.correctIndex || 0,
                    correctAnswer: q.correctAnswer || ""
                });
            });
            this.renderManualQuestions();
        };
    }

    closeCreator() {
        this.creatorOverlay.style.display = 'none';
        document.body.style.overflow = '';
        window.__tronexAICollector = null;
    }

    addQuestion(type) {
        const qId = Date.now();
        const q = { id: qId, type, text: '', options: ['', '', '', ''], correctIndex: 0 };
        this.manualQuestions.push(q);
        this.renderManualQuestions();
    }

    renderManualQuestions() {
        this.questionsContainer.innerHTML = '';
        this.manualQuestions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'q-creator-item';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <strong>Câu ${index + 1} (${q.type === 'multiple_choice' ? 'Trắc nghiệm' : q.type === 'short_answer' ? 'Điền khuyết' : 'Tự luận'})</strong>
                    <button onclick="removeManualQ(${index})" style="color: red; border: none; background: none; cursor: pointer;">Xóa</button>
                </div>
                <textarea placeholder="Nhập câu hỏi tại đây..." oninput="updateManualQ(${index}, 'text', this.value)" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd; min-height: 80px;">${q.text}</textarea>
                ${this.renderOptions(q, index)}
            `;
            this.questionsContainer.appendChild(card);
        });

        // Add helper functions to window
        window.updateManualQ = (idx, field, val) => {
            this.manualQuestions[idx][field] = val;
        };
        window.removeManualQ = (idx) => {
            this.manualQuestions.splice(idx, 1);
            this.renderManualQuestions();
        };
    }

    renderOptions(q, idx) {
        if (q.type !== 'multiple_choice') return '';
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
        return `
            <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                ${q.options.map((opt, i) => `
                    <div class="option-edit-row">
                        <div class="option-color-box" style="background: ${colors[i]}"></div>
                        <input type="text" placeholder="Đáp án ${i+1}" value="${opt}" oninput="updateManualOpt(${idx}, ${i}, this.value)" style="flex: 1; padding: 8px; border-radius: 8px; border: 1px solid #ddd;">
                        <input type="radio" name="correct_${idx}" ${q.correctIndex === i ? 'checked' : ''} onchange="updateManualQ(${idx}, 'correctIndex', ${i})">
                    </div>
                `).join('')}
            </div>
        `;
    }

    async saveManualQuiz() {
        const title = document.getElementById('manualQuizTitle').value.trim();
        if (!title) return alert("Vui lòng nhập tên đề thi!");
        if (this.manualQuestions.length === 0) return alert("Vui lòng thêm ít nhất 1 câu hỏi!");

        const newQuiz = {
            id: 'manual_' + Date.now(),
            title: title,
            questions: this.manualQuestions.map(q => ({
                qNumber: 0, // Sẽ được gán lại
                type: q.type,
                text: q.text,
                options: q.type === 'multiple_choice' ? q.options : null,
                correctIndex: q.correctIndex,
                correctAnswer: q.correctAnswer || ""
            }))
        };

        // Lưu vào Local Storage (hoặc Firebase nếu đã login)
        const localQuizzes = JSON.parse(localStorage.getItem('tronex_local_quizzes') || '[]');
        localQuizzes.push(newQuiz);
        localStorage.setItem('tronex_local_quizzes', JSON.stringify(localQuizzes));

        alert("Đã lưu đề thi thành công!");
        this.closeCreator();
        location.reload(); // Để cập nhật danh sách
    }
}

// Khởi tạo
document.addEventListener('DOMContentLoaded', () => {
    window.tronexAI = new tronexAI();
});

export default tronexAI;
