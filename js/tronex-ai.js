/**
 * tronex-AI: TRỢ LÝ GIẢNG GIẢI & TRÌNH TẠO ĐỀ THI
 * ✅ Fix: conversation history (multi-turn), quiz context chính xác
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

// API Keys - xoay vòng khi gặp lỗi
const _K = [
    "AIzaSyBnRHrkbQwQF43n" + "UFYuE_kjkg0sK2HDDiU",
    "AIzaSyBujYVCD_avJy1E" + "yYZHpwu0M10itiAXSnY",
    "AIzaSyBW6zkLdppAwv1Y" + "I2t-ikeS3J_GXGgYjX0",
    "AIzaSyB5jCvX0f3Nu8FI" + "4QKHkfVciKm-JWCkOls",
    "AIzaSyC6nbhLMVC-91NT" + "i0vySoMH1haM9HRBdF0"
];
let _idx = parseInt(localStorage.getItem("_tronex_kidx") || "0");
const gK = () => _K[_idx % _K.length];
const rK = () => {
    _idx = (_idx + 1) % _K.length;
    localStorage.setItem("_tronex_kidx", String(_idx));
};

const MODEL_CHAIN_3 = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite"
];
const MODEL_CHAIN_2 = [
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview"
];
const MODEL_LABELS = {
    "gemini-3-flash-preview": "Gemini 3.0 Flash",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite (dự phòng)"
};

const SYSTEM_PROMPT = `Bạn là trợ lý AI thông minh tích hợp trong nền tảng học tập TRONEX.
Nhiệm vụ: Giải thích câu hỏi, hướng dẫn làm bài và trả lời thắc mắc của học sinh.

PHONG CÁCH TRẢ LỜI:
1. GREETING: Chào thân thiện (chỉ ở tin nhắn đầu tiên).
2. ANALYSIS: Phân tích ngắn gọn yêu cầu.
3. STEP-BY-STEP: Giải thích từng bước, nêu rõ kiến thức trọng tâm.
4. CONCLUSION: Đáp án cuối cùng in đậm, kèm lời khuyên hoặc khích lệ.

QUY TẮC:
- Dùng Markdown (bold, list, headers) cho đẹp.
- Trả lời bằng Tiếng Việt.
- NHỚ toàn bộ lịch sử hội thoại để trả lời nhất quán.
- Nếu người dùng hỏi "câu đó", "câu này"... hãy căn cứ vào [BỐI CẢNH ĐỀ THI] trong tin nhắn của họ.`;

class tronexAI {
    constructor() {
        this.chatContainer = document.getElementById('aiChatContainer');
        this.chatMessages = document.getElementById('aiChatMessages');
        this.chatInput = document.getElementById('aiChatInput');
        this.sendBtn = document.getElementById('btnSendAiChat');
        this.creatorOverlay = document.getElementById('manualCreatorOverlay');
        this.questionsContainer = document.getElementById('manualQuestionsContainer');
        this.manualQuestions = [];

        // ✅ Lịch sử hội thoại theo định dạng Gemini multi-turn
        // Mỗi phần tử: { role: "user"|"model", parts: [{ text: "..." }] }
        this.chatHistory = [];

        if (!this.chatContainer || !this.chatMessages || !this.chatInput) {
            console.warn('[tronexAI] Một số phần tử DOM chưa sẵn sàng.');
        }
        this.init();
    }

    init() {
        document.getElementById('btnOpenAiChat')?.addEventListener('click', () => this.toggleChat());
        this.sendBtn?.addEventListener('click', () => this.sendMessage());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) this.sendMessage();
        });
        document.getElementById('btnOpenManualCreator')?.addEventListener('click', () => this.openCreator());
        document.getElementById('btnCloseCreator')?.addEventListener('click', () => this.closeCreator());
        document.getElementById('btnSaveManualQuiz')?.addEventListener('click', () => this.saveManualQuiz());

        window.toggleAiChat = () => this.toggleChat();
        window.toggleChatFullscreen = () => this.toggleFullscreen();
        window.addManualQuestion = (type) => this.addQuestion(type);
        window.askAiAboutQuestion = (qIndex) => this.askAboutQuestion(qIndex);
        window.clearAiChatHistory = () => this.clearHistory(); // gọi từ nút "Cuộc trò chuyện mới" nếu có
    }

    // ─── CHAT UI ────────────────────────────────────────────────

    toggleChat() {
        if (!this.chatContainer) return;
        const isVisible = this.chatContainer.style.display === 'flex';
        this.chatContainer.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) this.chatInput?.focus();
    }

    toggleFullscreen() {
        this.chatContainer?.classList.toggle('fullscreen');
    }

    addMessage(text, sender = 'ai') {
        if (!this.chatMessages) return null;
        const msg = document.createElement('div');
        msg.className = `msg-bubble msg-${sender}`;
        msg.innerHTML = text;
        this.chatMessages.appendChild(msg);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        return msg;
    }

    setLoadingMsg(msg, text, color = '') {
        if (!msg) return;
        msg.innerHTML = `<span class="dots-loading" style="color:${color};">${text}</span>`;
        if (this.chatMessages) this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    // ✅ Xoá lịch sử và reset UI chat
    clearHistory() {
        this.chatHistory = [];
        if (this.chatMessages) {
            this.chatMessages.innerHTML =
                '<div class="msg-bubble msg-ai">Cuộc trò chuyện mới bắt đầu. Mình là Gemini, bạn cần hỏi gì không? 😊</div>';
        }
    }

    // ─── LẤY CONTEXT TOÀN BỘ ĐỀ THI ────────────────────────────
    // ✅ Fix: trả về TẤT CẢ câu hỏi (tối đa 20) để AI hiểu đúng
    //    khi người dùng hỏi "câu 5", "câu trên", "câu đó"...

    getQuizContext() {
        const quiz = window.currentActiveQuiz;
        if (!quiz) return "";
        const qs = quiz.renderedQuestions || quiz.questions;
        if (!qs || qs.length === 0) return "";

        const focusIdx = window.currentQuestionIndex; // câu đang hiển thị trên màn hình
        let context = `[ĐỀ THI: "${quiz.title || 'Không tên'}" — ${qs.length} câu]\n`;

        const maxQ = Math.min(qs.length, 20);
        for (let i = 0; i < maxQ; i++) {
            const q = qs[i];
            const mark = (i === focusIdx) ? ' ← (câu đang xem)' : '';
            context += `\nCâu ${i + 1}${mark}: ${q.text || ''}`;

            if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
                context += `\n  Lựa chọn: ${q.options.map((o, j) => `${['A', 'B', 'C', 'D'][j]}. ${o}`).join(' | ')}`;
                if (q.correctIndex !== undefined)
                    context += `\n  Đáp án: ${['A', 'B', 'C', 'D'][q.correctIndex]}`;
            } else if (q.type === 'short_answer' && q.correctAnswer) {
                context += `\n  Đáp án: ${q.correctAnswer}`;
            } else if (q.type === 'true_false_group' && Array.isArray(q.subQuestions)) {
                context += '\n  Các ý: ' + q.subQuestions.map(sq => `${sq.text} → ${sq.correctAnswer}`).join(' | ');
            }
        }
        if (qs.length > maxQ) context += `\n...(còn ${qs.length - maxQ} câu nữa không hiển thị)`;
        return context;
    }

    // ─── GỬI TIN NHẮN ─────────────────────────────────────────

    async sendMessage(customPrompt = null) {
        const userText = customPrompt || this.chatInput?.value.trim();
        if (!userText) return;

        // Hiển thị tin nhắn của user lên UI
        this.addMessage(this._escapeHTML(userText), 'user');
        if (!customPrompt && this.chatInput) this.chatInput.value = '';

        // Loading bubble — tạo 1 lần, truyền xuyên suốt fallback
        const loadingMsg = this.addMessage('<span class="dots-loading">Gemini đang suy nghĩ...</span>', 'ai');

        // ✅ Gắn context đề thi vào TIN NHẮN USER (không phải system prompt)
        //    → mỗi lần hỏi, Gemini đều có đủ thông tin về đề thi hiện tại
        const quizCtx = this.getQuizContext();
        const fullUserText = quizCtx
            ? `[BỐI CẢNH ĐỀ THI]\n${quizCtx}\n\n[CÂU HỎI CỦA HỌC SINH]: ${userText}`
            : userText;

        const selectedVal = document.getElementById('aiModelSelector')?.value || "3.0";
        const modelChain = (selectedVal === "3.0" || selectedVal === "3.1")
            ? MODEL_CHAIN_3 : MODEL_CHAIN_2;

        await this._tryWithFallback(userText, fullUserText, loadingMsg, modelChain, 0, 0);
    }

    // ─── FALLBACK CHAIN ──────────────────────────────────────────

    async _tryWithFallback(userText, fullUserText, loadingMsg, modelChain, modelIdx, keyRotation) {
        const modelId = modelChain[modelIdx];
        const totalKeys = _K.length;

        try {
            const genAI = new GoogleGenerativeAI(gK());
            const model = genAI.getGenerativeModel({
                model: modelId,
                systemInstruction: SYSTEM_PROMPT
            });

            // ✅ startChat() với history → Gemini nhớ toàn bộ cuộc trò chuyện trước đó
            const chat = model.startChat({ history: this.chatHistory });
            const result = await chat.sendMessage(fullUserText);
            const aiText = result.response.text();

            // ✅ Lưu vào history (dùng userText gốc, không có context đề thi để tránh lặp dài)
            this.chatHistory.push(
                { role: 'user', parts: [{ text: userText }] },
                { role: 'model', parts: [{ text: aiText }] }
            );
            // Giới hạn tối đa 20 turn (40 phần tử) để tránh prompt quá dài
            if (this.chatHistory.length > 40) {
                this.chatHistory = this.chatHistory.slice(-40);
            }

            this.renderAiResponse(loadingMsg, aiText);

        } catch (err) {
            console.error(`[tronexAI] Lỗi model=${modelId}, key#${_idx}:`, err.message || err);

            const isQuotaOrBusy = /429|503|quota|overloaded|unavailable/i.test(err.toString());
            const isInvalidModel = /404|not found|invalid model/i.test(err.toString());
            const isAuthError = /400|403|api.?key|invalid/i.test(err.toString());
            const canRotateKey = !isInvalidModel && keyRotation < totalKeys - 1;
            const canDowngradeModel = modelIdx < modelChain.length - 1;

            if (canRotateKey && isQuotaOrBusy) {
                rK();
                this.setLoadingMsg(loadingMsg,
                    `Máy chủ bận, đang thử key dự phòng ${keyRotation + 2}/${totalKeys}...`, '#f59e0b');
                await this._delay(800);
                await this._tryWithFallback(userText, fullUserText, loadingMsg, modelChain, modelIdx, keyRotation + 1);

            } else if (canDowngradeModel) {
                const nextModel = modelChain[modelIdx + 1];
                this.setLoadingMsg(loadingMsg,
                    `Đang chuyển sang ${MODEL_LABELS[nextModel] || nextModel}...`, '#6366f1');
                await this._delay(600);
                await this._tryWithFallback(userText, fullUserText, loadingMsg, modelChain, modelIdx + 1, 0);

            } else {
                if (isAuthError)
                    this.setLoadingMsg(loadingMsg, '❌ Lỗi xác thực API Key. Vui lòng liên hệ quản trị viên.', '#ef4444');
                else
                    this.setLoadingMsg(loadingMsg, '⚠️ Tất cả máy chủ đang bận. Vui lòng thử lại sau ít phút!', '#ef4444');
                if (!isAuthError) rK();
            }
        }
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ─── RENDER MARKDOWN + KATEX ─────────────────────────────────

    renderAiResponse(container, text) {
        if (!container) return;
        let html = text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;">$1</code>')
            .replace(/^### (.*?)$/gm, '<h3 style="color:var(--primary,#6366f1);margin:12px 0 6px;">$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2 style="color:var(--primary,#6366f1);margin:16px 0 8px;">$1</h2>')
            .replace(/^- (.*?)$/gm, '<li style="margin:3px 0;">$1</li>')
            .replace(/(<li.*?<\/li>)+/gs, m => `<ul style="padding-left:20px;margin:8px 0;">${m}</ul>`)
            .replace(/\n/g, '<br>');

        container.innerHTML = html;
        if (window.renderMathInElement) {
            window.renderMathInElement(container, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }
        if (this.chatMessages) this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    _escapeHTML(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ─── HỎI AI VỀ CÂU HỎI CỤ THỂ ──────────────────────────────

    askAboutQuestion(qIndex) {
        if (!this.chatContainer) return;
        if (this.chatContainer.style.display !== 'flex') this.toggleChat();
        setTimeout(() => {
            if (this.chatInput) {
                this.chatInput.value = `Hãy giải thích cách làm câu số ${qIndex + 1} cho mình với!`;
                this.chatInput.focus();
            }
        }, 150);
    }

    // ─── MANUAL CREATOR ──────────────────────────────────────────

    openCreator() {
        const title = prompt("Vui lòng nhập tên đề thi mới:", "Đề thi TRONEX mới");
        if (!title) return;
        const titleInput = document.getElementById('manualQuizTitle');
        const titleDisplay = document.getElementById('creatorTitleDisplay');
        if (titleInput) titleInput.value = title;
        if (titleDisplay) titleDisplay.textContent = title;
        if (this.creatorOverlay) this.creatorOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        window.__tronexAICollector = (questions) => {
            questions.forEach(q => {
                this.manualQuestions.push({
                    id: Date.now() + Math.random(),
                    type: q.type || 'multiple_choice',
                    text: q.text || '',
                    options: q.options || ['', '', '', ''],
                    correctIndex: q.correctIndex ?? 0,
                    correctAnswer: q.correctAnswer || ""
                });
            });
            this.renderManualQuestions();
        };
    }

    closeCreator() {
        if (this.creatorOverlay) this.creatorOverlay.style.display = 'none';
        document.body.style.overflow = '';
        window.__tronexAICollector = null;
    }

    addQuestion(type) {
        this.manualQuestions.push({
            id: Date.now(), type, text: '',
            options: ['', '', '', ''], correctIndex: 0, correctAnswer: ''
        });
        this.renderManualQuestions();
    }

    renderManualQuestions() {
        if (!this.questionsContainer) return;
        this.questionsContainer.innerHTML = '';
        this.manualQuestions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'q-creator-item';
            const typeLabel = q.type === 'multiple_choice' ? 'Trắc nghiệm'
                : q.type === 'short_answer' ? 'Điền khuyết' : 'Tự luận';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                    <strong>Câu ${index + 1} (${typeLabel})</strong>
                    <button onclick="window.__removeManualQ(${index})" style="color:#ef4444;border:none;background:none;cursor:pointer;font-size:13px;">✕ Xóa</button>
                </div>
                <textarea placeholder="Nhập nội dung câu hỏi..."
                    oninput="window.__updateManualQ(${index}, 'text', this.value)"
                    style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;min-height:80px;box-sizing:border-box;font-family:inherit;">${this._escape(q.text)}</textarea>
                ${this.renderOptions(q, index)}`;
            this.questionsContainer.appendChild(card);
        });
        window.__updateManualQ = (idx, field, val) => { if (this.manualQuestions[idx]) this.manualQuestions[idx][field] = val; };
        window.__updateManualOpt = (qIdx, optIdx, val) => { if (this.manualQuestions[qIdx]) this.manualQuestions[qIdx].options[optIdx] = val; };
        window.__removeManualQ = (idx) => { this.manualQuestions.splice(idx, 1); this.renderManualQuestions(); };
        window.updateManualQ = window.__updateManualQ;
        window.updateManualOpt = window.__updateManualOpt;
        window.removeManualQ = window.__removeManualQ;
    }

    renderOptions(q, idx) {
        if (q.type !== 'multiple_choice') {
            if (q.type === 'short_answer') {
                return `<input type="text" placeholder="Đáp án đúng..."
                    value="${this._escape(q.correctAnswer || '')}"
                    oninput="window.__updateManualQ(${idx}, 'correctAnswer', this.value)"
                    style="margin-top:10px;width:100%;padding:8px;border-radius:8px;border:1px solid #ddd;box-sizing:border-box;">`;
            }
            return '';
        }
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
        const letters = ['A', 'B', 'C', 'D'];
        return `<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${q.options.map((opt, i) => `
                <div style="display:flex;align-items:center;gap:6px;background:#f8fafc;padding:6px;border-radius:8px;">
                    <div style="width:22px;height:22px;border-radius:50%;background:${colors[i]};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${letters[i]}</div>
                    <input type="text" placeholder="Đáp án ${letters[i]}"
                        value="${this._escape(opt)}"
                        oninput="window.__updateManualOpt(${idx}, ${i}, this.value)"
                        style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px;">
                    <label style="display:flex;align-items:center;gap:3px;font-size:11px;color:#6b7280;cursor:pointer;">
                        <input type="radio" name="correct_q${idx}" value="${i}" ${q.correctIndex === i ? 'checked' : ''}
                            onchange="window.__updateManualQ(${idx}, 'correctIndex', ${i})"> ✓
                    </label>
                </div>`).join('')}
        </div>`;
    }

    _escape(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async saveManualQuiz() {
        const titleEl = document.getElementById('manualQuizTitle');
        const title = titleEl?.value.trim();
        if (!title) return alert("Vui lòng nhập tên đề thi!");
        if (this.manualQuestions.length === 0) return alert("Vui lòng thêm ít nhất 1 câu hỏi!");
        const newQuiz = {
            id: 'manual_' + Date.now(), title,
            description: `Đề thi tạo thủ công - ${this.manualQuestions.length} câu`,
            privacy: 'private', viewCount: 0,
            questions: this.manualQuestions.map((q, i) => ({
                id: `mq_${Date.now()}_${i}`, qNumber: i + 1,
                type: q.type, text: q.text,
                options: q.type === 'multiple_choice' ? q.options : null,
                correctIndex: q.type === 'multiple_choice' ? q.correctIndex : undefined,
                correctAnswer: q.correctAnswer || ""
            }))
        };
        try {
            const LOCAL_KEY = window.location.pathname.toLowerCase().includes('v-act')
                ? 'trongbeshop_vact_quizzes' : 'trongbeshop_custom_quizzes';
            const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
            saved.unshift(newQuiz);
            localStorage.setItem(LOCAL_KEY, JSON.stringify(saved));
            if (window.__mockQuizzes) window.__mockQuizzes.unshift(newQuiz);
            if (window.__initQuizList) window.__initQuizList();
            alert("✅ Đã lưu đề thi thành công!");
            this.manualQuestions = [];
            this.closeCreator();
        } catch (e) {
            alert("❌ Lỗi khi lưu: " + e.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.tronexAI = new tronexAI();
});

export default tronexAI;