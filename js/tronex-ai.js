/**
 * tronex-AI: TRỢ LÝ GIẢNG GIẢI & TRÌNH TẠO ĐỀ THI
 * Tích hợp Gemini 3.0 Flash / 2.0 Flash (Fallback chain)
 * ✅ Fixed: model names, selector logic, fallback recursion bug
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

// ✅ Nâng cấp: Gemini 3.0 Flash → 2.0 Flash → 2.5 Flash-Lite (dự phòng cuối)
// Gemini 3 Flash: mạnh nhất, reasoning cao
// Gemini 2.0 Flash: nhanh, ổn định
// Gemini 2.5 Flash-Lite: nhẹ nhất, luôn available, free tier
const MODEL_CHAIN_3 = [
    "gemini-3-flash-preview",   // Ưu tiên 1: Gemini 3.0 Flash (mới nhất)
    "gemini-2.5-flash",         // Ưu tiên 2: ổn định
    "gemini-3.1-flash-lite"     // Ưu tiên 3: nhẹ nhất, free tier
];

const MODEL_CHAIN_2 = [
    "gemini-2.5-flash",         // Ưu tiên 1: Gemini 2.0/2.5 Flash
    "gemini-3.1-flash-lite",    // Ưu tiên 2: dự phòng
    "gemini-3-flash-preview"    // Ưu tiên 3: fallback lên 3.0 nếu cần
];

const MODEL_LABELS = {
    "gemini-3-flash-preview": "Gemini 3.0 Flash",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite (dự phòng)"
};

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
    // ✅ Fix: tách riêng text gốc ra khỏi customPrompt để tránh mất nội dung khi fallback đệ quy

    async sendMessage(customPrompt = null) {
        const text = customPrompt || this.chatInput?.value.trim();
        if (!text) return;

        this.addMessage(text, 'user');
        if (!customPrompt && this.chatInput) this.chatInput.value = '';

        // Loading bubble - tạo 1 lần duy nhất, truyền xuyên suốt fallback
        const loadingMsg = this.addMessage('<span class="dots-loading">Gemini đang suy nghĩ...</span>', 'ai');

        // Chọn model chain theo selector
        const selectedVal = document.getElementById('aiModelSelector')?.value || "3.0";
        const modelChain = (selectedVal === "3.0" || selectedVal === "3.1")
            ? MODEL_CHAIN_3
            : MODEL_CHAIN_2;

        await this._tryWithFallback(text, loadingMsg, modelChain, 0, 0);
    }

    // ✅ Fix: fallback không đệ quy qua sendMessage nữa → dùng hàm riêng, giữ loadingMsg
    async _tryWithFallback(text, loadingMsg, modelChain, modelIdx, keyRotation) {
        const modelId = modelChain[modelIdx];
        const totalKeys = _K.length;

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

            const canRotateKey = !isInvalidModel && keyRotation < totalKeys - 1;
            const canDowngradeModel = modelIdx < modelChain.length - 1;

            if (canRotateKey && isQuotaOrBusy) {
                // Tầng 1: Xoay key, giữ nguyên model
                rK();
                this.setLoadingMsg(loadingMsg,
                    `Máy chủ bận, đang thử key dự phòng ${keyRotation + 2}/${totalKeys}...`,
                    '#f59e0b'
                );
                await this._delay(800);
                await this._tryWithFallback(text, loadingMsg, modelChain, modelIdx, keyRotation + 1);

            } else if (canDowngradeModel) {
                // Tầng 2: Hết key hoặc lỗi model → xuống model kế tiếp, reset key rotation
                const nextModel = modelChain[modelIdx + 1];
                this.setLoadingMsg(loadingMsg,
                    `Đang chuyển sang ${MODEL_LABELS[nextModel] || nextModel}...`,
                    '#6366f1'
                );
                await this._delay(600);
                await this._tryWithFallback(text, loadingMsg, modelChain, modelIdx + 1, 0);

            } else {
                // Tầng 3: Đã thử hết tất cả → thông báo lỗi
                if (isAuthError) {
                    this.setLoadingMsg(loadingMsg, '❌ Lỗi xác thực API Key. Vui lòng liên hệ quản trị viên.', '#ef4444');
                } else {
                    this.setLoadingMsg(loadingMsg, '⚠️ Tất cả máy chủ đang bận. Vui lòng thử lại sau ít phút!', '#ef4444');
                }
                if (!isAuthError) rK();
            }
        }
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── RENDER MARKDOWN + KATEX ─────────────────────────────

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
    // ✅ Fix: tự động gửi + kèm passage nhóm nếu là dạng reading_group

    askAboutQuestion(qIndex) {
        if (!this.chatContainer) return;

        // Mở chat nếu chưa mở
        if (this.chatContainer.style.display !== 'flex') this.toggleChat();

        const quiz = window.currentActiveQuiz;
        const qs = quiz ? (quiz.renderedQuestions || quiz.questions) : null;
        const q = qs ? qs[qIndex] : null;

        // ✅ Tìm passage của nhóm câu hỏi (reading_group) chứa câu này
        // Logic: duyệt questions gốc, tìm reading_group mà subQuestions chứa id trùng với q.id
        let groupPassage = '';
        if (q && quiz) {
            const rawQs = quiz.questions || [];
            for (const rg of rawQs) {
                if (rg.type === 'reading_group' && Array.isArray(rg.subQuestions)) {
                    const found = rg.subQuestions.find(sq => sq.id === q.id);
                    if (found) {
                        // Lấy text thuần từ HTML passage (bỏ tag HTML)
                        groupPassage = rg.passage
                            ? rg.passage.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                            : '';
                        break;
                    }
                }
            }
        }

        // Build prompt đầy đủ
        let prompt = `Hãy giải thích cách làm **Câu ${qIndex + 1}** cho mình nhé!`;
        if (groupPassage) {
            prompt += `\n\n[DỮ LIỆU ĐỀ BÀI]\n${groupPassage}`;
        }
        if (q) {
            prompt += `\n\n[NỘI DUNG CÂU HỎI]: ${q.text || ''}`;
            if (Array.isArray(q.options) && q.options.length > 0) {
                prompt += `\nCác đáp án: ` + q.options.map((o, i) => `${['A', 'B', 'C', 'D'][i]}. ${o}`).join(' | ');
            } else if (q.correctAnswer) {
                prompt += `\nĐáp án đúng: ${q.correctAnswer}`;
            } else if (q.type === 'true_false_group' && Array.isArray(q.subQuestions)) {
                prompt += `\nCác ý: ` + q.subQuestions.map(sq => `${sq.text} → ${sq.correctAnswer}`).join(' | ');
            }
        }

        // Gửi tự động sau một chút để chat kịp mở
        setTimeout(() => this.sendMessage(prompt), 200);
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