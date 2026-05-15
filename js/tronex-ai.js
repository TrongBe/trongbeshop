/**
 * tronex-AI: TRỢ LÝ GIẢNG GIẢI & TRÌNH TẠO ĐỀ THI
 * Tích hợp Gemini 2.0 Flash / 1.5 Flash (Fallback chain)
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
    localStorage.setItem("_tronex_kidx", _idx);
};

// Fallback chain: thử lần lượt từ mạnh → ổn định
// Mỗi model được thử với TẤT CẢ key trước khi xuống model kế tiếp
const MODEL_CHAIN = [
    "gemini-2.0-flash",       // Ưu tiên 1: nhanh + thông minh
    "gemini-1.5-flash-latest", // Ưu tiên 2: ổn định
    "gemini-1.5-flash-8b"      // Ưu tiên 3: nhẹ nhất, luôn available
];

class tronexAI {
    constructor() {
        this.chatContainer = document.getElementById('aiChatContainer');
        this.chatMessages = document.getElementById('aiChatMessages');
        this.chatInput = document.getElementById('aiChatInput');
        this.sendBtn = document.getElementById('btnSendAiChat');

        this.creatorOverlay = document.getElementById('manualCreatorOverlay');
        this.questionsContainer = document.getElementById('manualQuestionsContainer');
        this.manualQuestions = [];

        // Guard: nếu DOM chưa sẵn sàng thì không crash
        if (!this.chatContainer || !this.chatMessages || !this.chatInput) {
            console.warn('[tronexAI] Một số phần tử DOM chưa sẵn sàng, kiểm tra lại HTML.');
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

        // Expose to global for inline onclick handlers
        window.toggleAiChat = () => this.toggleChat();
        window.toggleChatFullscreen = () => this.toggleFullscreen();
        window.addManualQuestion = (type) => this.addQuestion(type);
        window.askAiAboutQuestion = (qIndex) => this.askAboutQuestion(qIndex);
    }

    // ─── CHAT UI ───────────────────────────────────────────────

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

    // ─── LẤY CONTEXT CÂU HỎI HIỆN TẠI ───────────────────────

    getQuizContext() {
        // app.js expose window.currentActiveQuiz và window.currentQuestionIndex
        const quiz = window.currentActiveQuiz;
        const idx = window.currentQuestionIndex;
        if (!quiz) return "";

        const qs = quiz.renderedQuestions || quiz.questions;
        if (!qs || idx === undefined) return "";

        const q = qs[idx];
        if (!q) return "";

        let context = `\n[BỐI CẢNH CÂU HỎI HIỆN TẠI - Câu ${idx + 1}]:
Nội dung: ${q.text || ''}`;

        if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
            context += `\nCác lựa chọn: ${q.options.join(' | ')}`;
            if (q.correctIndex !== undefined) {
                context += `\nĐáp án đúng: ${['A', 'B', 'C', 'D'][q.correctIndex]} (vị trí ${q.correctIndex + 1})`;
            }
        } else if (q.type === 'short_answer' && q.correctAnswer) {
            context += `\nĐáp án: ${q.correctAnswer}`;
        } else if (q.type === 'true_false_group' && Array.isArray(q.subQuestions)) {
            context += `\nCác ý:\n` + q.subQuestions.map(sq =>
                `  - ${sq.text} → ${sq.correctAnswer}`
            ).join('\n');
        }

        return context;
    }

    // ─── GỬI TIN NHẮN VỚI FALLBACK CHAIN ────────────────────

    async sendMessage(customPrompt = null, _forcedModel = null, _keyRotation = 0, _modelChainIdx = 0) {
        const text = customPrompt || this.chatInput?.value.trim();
        if (!text) return;

        // Chỉ hiển thị tin nhắn user ở lần gọi đầu tiên
        if (!customPrompt) {
            this.addMessage(text, 'user');
            if (this.chatInput) this.chatInput.value = '';
        }

        // Loading bubble
        const loadingMsg = this.addMessage('<span class="dots-loading">Gemini đang suy nghĩ...</span>', 'ai');

        // Xác định model sẽ dùng
        const selectedVal = document.getElementById('aiModelSelector')?.value || "3.0";
        let modelId;
        if (_forcedModel) {
            modelId = _forcedModel;
        } else {
            // Map selector value → model, theo ưu tiên người dùng chọn
            if (selectedVal === "3.1" || selectedVal === "3.0") {
                modelId = MODEL_CHAIN[_modelChainIdx] || MODEL_CHAIN[0];
            } else {
                // Người dùng chọn 2.0 → bắt đầu từ model thứ 2 (bỏ qua flash mới nhất)
                modelId = MODEL_CHAIN[Math.max(_modelChainIdx, 1)] || MODEL_CHAIN[1];
            }
        }

        const systemPrompt = `Bạn là trợ lý AI thông minh tích hợp trong nền tảng học tập TRONEX.
PHONG CÁCH TRẢ LỜI (100% giống Google Gemini App):
1. GREETING: Chào người dùng một cách thân thiện, chuyên nghiệp.
2. ANALYSIS: Phân tích ngắn gọn yêu cầu để người dùng thấy bạn hiểu vấn đề.
3. STEP-BY-STEP: Giải thích từng bước sư phạm, dễ hiểu. Nếu là bài tập, chỉ ra kiến thức trọng tâm.
4. CONCLUSION: Đưa ra đáp án cuối cùng (in đậm) và lời khuyên hoặc khích lệ.
LƯU Ý: Dùng Markdown (bold, list, headers) để tăng tính thẩm mỹ. Trả lời bằng Tiếng Việt.`;

        try {
            const apiKey = gK();
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelId,
                systemInstruction: systemPrompt
            });

            const context = this.getQuizContext();
            const prompt = context
                ? `${context}\n\n[YÊU CẦU CỦA NGƯỜI DÙNG]: ${text}`
                : text;

            const result = await model.generateContent(prompt);
            const output = result.response.text();

            this.renderAiResponse(loadingMsg, output);

        } catch (err) {
            console.error(`[tronexAI] Lỗi model=${modelId}, key#${_idx}:`, err.message || err);

            const isQuotaOrBusy = /429|503|quota|overloaded|unavailable/i.test(err.toString());
            const isInvalidModel = /404|not found|invalid model/i.test(err.toString());
            const isAuthError = /400|403|api.?key|invalid/i.test(err.toString());

            // Chiến lược fallback theo 3 tầng:
            // Tầng 1: Xoay key (tối đa số key lần) cùng model hiện tại
            // Tầng 2: Xuống model kế tiếp trong chain
            // Tầng 3: Báo lỗi rõ ràng

            const totalKeys = _K.length;
            const canRotateKey = !isInvalidModel && _keyRotation < totalKeys - 1;
            const canDowngradeModel = _modelChainIdx < MODEL_CHAIN.length - 1;

            if (canRotateKey && isQuotaOrBusy) {
                // Xoay key, giữ nguyên model
                rK();
                this.setLoadingMsg(loadingMsg,
                    `Máy chủ bận, đang thử key dự phòng ${_keyRotation + 2}/${totalKeys}...`,
                    '#f59e0b'
                );
                setTimeout(() => {
                    loadingMsg.remove();
                    this.sendMessage(text, null, _keyRotation + 1, _modelChainIdx);
                }, 800);

            } else if (canDowngradeModel) {
                // Hết key hoặc lỗi model → xuống model kế tiếp, reset key rotation
                const nextModel = MODEL_CHAIN[_modelChainIdx + 1];
                const modelLabels = {
                    "gemini-2.0-flash": "Gemini 2.0 Flash",
                    "gemini-1.5-flash-latest": "Gemini 1.5 Flash",
                    "gemini-1.5-flash-8b": "Gemini Flash 8B (dự phòng)"
                };
                this.setLoadingMsg(loadingMsg,
                    `Đang chuyển sang ${modelLabels[nextModel] || nextModel}...`,
                    '#6366f1'
                );
                setTimeout(() => {
                    loadingMsg.remove();
                    this.sendMessage(text, null, 0, _modelChainIdx + 1);
                }, 600);

            } else {
                // Đã thử hết tất cả → thông báo lỗi thân thiện
                if (isAuthError) {
                    this.setLoadingMsg(loadingMsg, '❌ Lỗi xác thực API Key. Vui lòng liên hệ quản trị viên.', '#ef4444');
                } else {
                    this.setLoadingMsg(loadingMsg, '⚠️ Tất cả máy chủ đang bận. Vui lòng thử lại sau ít phút!', '#ef4444');
                }
                // Nếu không phải lỗi auth, thử đổi key để lần sau dùng key khác
                if (!isAuthError) rK();
            }
        }
    }

    // ─── RENDER MARKDOWN + KATEX ─────────────────────────────

    renderAiResponse(container, text) {
        if (!container) return;
        let html = text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // escape HTML trước
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;">$1</code>')
            .replace(/^### (.*?)$/gm, '<h3 style="color:var(--primary,#6366f1);margin:12px 0 6px;">$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2 style="color:var(--primary,#6366f1);margin:16px 0 8px;">$1</h2>')
            .replace(/^- (.*?)$/gm, '<li style="margin:3px 0;">$1</li>')
            .replace(/(<li.*<\/li>)/gs, '<ul style="padding-left:20px;margin:8px 0;">$1</ul>')
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

    // ─── HỎI AI VỀ CÂU HỎI CỤ THỂ ──────────────────────────

    askAboutQuestion(qIndex) {
        if (!this.chatContainer) return;
        const isVisible = this.chatContainer.style.display === 'flex';
        if (!isVisible) this.toggleChat();
        setTimeout(() => {
            if (this.chatInput) {
                this.chatInput.value = `Hãy giải thích cách làm câu số ${qIndex + 1} cho mình với!`;
                this.chatInput.focus();
            }
        }, 150);
    }

    // ─── MANUAL CREATOR ──────────────────────────────────────

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
        const qId = Date.now();
        this.manualQuestions.push({ id: qId, type, text: '', options: ['', '', '', ''], correctIndex: 0, correctAnswer: '' });
        this.renderManualQuestions();
    }

    renderManualQuestions() {
        if (!this.questionsContainer) return;
        this.questionsContainer.innerHTML = '';

        this.manualQuestions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'q-creator-item';
            const typeLabel = q.type === 'multiple_choice' ? 'Trắc nghiệm' : q.type === 'short_answer' ? 'Điền khuyết' : 'Tự luận';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                    <strong>Câu ${index + 1} (${typeLabel})</strong>
                    <button onclick="window.__removeManualQ(${index})" style="color:#ef4444;border:none;background:none;cursor:pointer;font-size:13px;">✕ Xóa</button>
                </div>
                <textarea placeholder="Nhập nội dung câu hỏi..."
                    oninput="window.__updateManualQ(${index}, 'text', this.value)"
                    style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;min-height:80px;box-sizing:border-box;font-family:inherit;">${this._escape(q.text)}</textarea>
                ${this.renderOptions(q, index)}
            `;
            this.questionsContainer.appendChild(card);
        });

        // Helper functions
        window.__updateManualQ = (idx, field, val) => {
            if (this.manualQuestions[idx]) this.manualQuestions[idx][field] = val;
        };
        window.__updateManualOpt = (qIdx, optIdx, val) => {
            if (this.manualQuestions[qIdx]) this.manualQuestions[qIdx].options[optIdx] = val;
        };
        window.__removeManualQ = (idx) => {
            this.manualQuestions.splice(idx, 1);
            this.renderManualQuestions();
        };

        // Backward compat aliases
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
        return `
            <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
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
                    </div>
                `).join('')}
            </div>
        `;
    }

    _escape(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async saveManualQuiz() {
        const titleEl = document.getElementById('manualQuizTitle');
        const title = titleEl?.value.trim();
        if (!title) return alert("Vui lòng nhập tên đề thi!");
        if (this.manualQuestions.length === 0) return alert("Vui lòng thêm ít nhất 1 câu hỏi!");

        const newQuiz = {
            id: 'manual_' + Date.now(),
            title,
            description: `Đề thi tạo thủ công - ${this.manualQuestions.length} câu`,
            privacy: 'private',
            viewCount: 0,
            questions: this.manualQuestions.map((q, i) => ({
                id: `mq_${Date.now()}_${i}`,
                qNumber: i + 1,
                type: q.type,
                text: q.text,
                options: q.type === 'multiple_choice' ? q.options : null,
                correctIndex: q.type === 'multiple_choice' ? q.correctIndex : undefined,
                correctAnswer: q.correctAnswer || ""
            }))
        };

        try {
            const LOCAL_KEY = window.location.pathname.toLowerCase().includes('v-act')
                ? 'trongbeshop_vact_quizzes'
                : 'trongbeshop_custom_quizzes';
            const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
            saved.unshift(newQuiz);
            localStorage.setItem(LOCAL_KEY, JSON.stringify(saved));

            // Thêm vào danh sách hiện tại ngay lập tức
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

// Khởi tạo sau khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    window.tronexAI = new tronexAI();
});

export default tronexAI;