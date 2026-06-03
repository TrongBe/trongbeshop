/**
 * tronex-AI: TRỢ LÝ GIẢNG GIẢI & TRÌNH TẠO ĐỀ THI
 * Tích hợp Gemini 3.0 Flash / 2.0 Flash (Fallback chain)
 * ✅ v3.1: Auth integration, true_false type, AI image import, ownership
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

// ✅ Model chains
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

class tronexAI {
    constructor() {
        this.chatContainer = document.getElementById('aiChatContainer');
        this.chatMessages = document.getElementById('aiChatMessages');
        this.chatInput = document.getElementById('aiChatInput');
        this.sendBtn = document.getElementById('btnSendAiChat');

        this.creatorOverlay = document.getElementById('manualCreatorOverlay');
        this.questionsContainer = document.getElementById('manualQuestionsContainer');
        this.manualQuestions = [];
        this.editingQuizId = null; // Lưu ID của đề thi đang sửa đổi (nếu có)

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
        document.getElementById('btnSaveManualQuizBottom')?.addEventListener('click', () => this.saveManualQuiz());

        // Expose to global
        window.toggleAiChat = () => this.toggleChat();
        window.toggleChatFullscreen = () => this.toggleFullscreen();
        window.addManualQuestion = (type) => this.addQuestion(type);
        window.askAiAboutQuestion = (qIndex) => this.askAboutQuestion(qIndex);
        window.triggerAiImageImport = () => this.triggerImageImport();
        window.handleAiImageImport = (e) => this.handleImageImport(e);
        window.clearAiChatHistory = () => this.clearHistory();
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

    clearHistory() {
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '<div class="msg-bubble msg-ai">Chào bạn! Mình là Gemini. Bạn cần mình giải thích gì về đề thi này không?</div>';
        }
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

    // ─── CONTEXT CÂU HỎI ───────────────────────────────────

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

    async sendMessage(customPrompt = null) {
        const text = customPrompt || this.chatInput?.value.trim();
        if (!text) return;

        this.addMessage(text, 'user');
        if (!customPrompt && this.chatInput) this.chatInput.value = '';

        const loadingMsg = this.addMessage('<span class="dots-loading">Gemini đang suy nghĩ...</span>', 'ai');

        const selectedVal = document.getElementById('aiModelSelector')?.value || "3.0";
        const modelChain = (selectedVal === "3.0" || selectedVal === "3.1")
            ? MODEL_CHAIN_3
            : MODEL_CHAIN_2;

        await this._tryWithFallback(text, loadingMsg, modelChain, 0, 0);
    }

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
                rK();
                this.setLoadingMsg(loadingMsg,
                    `Máy chủ bận, đang thử key dự phòng ${keyRotation + 2}/${totalKeys}...`,
                    '#f59e0b'
                );
                await this._delay(800);
                await this._tryWithFallback(text, loadingMsg, modelChain, modelIdx, keyRotation + 1);

            } else if (canDowngradeModel) {
                const nextModel = modelChain[modelIdx + 1];
                this.setLoadingMsg(loadingMsg,
                    `Đang chuyển sang ${MODEL_LABELS[nextModel] || nextModel}...`,
                    '#6366f1'
                );
                await this._delay(600);
                await this._tryWithFallback(text, loadingMsg, modelChain, modelIdx + 1, 0);

            } else {
                if (isAuthError) {
                    this.setLoadingMsg(loadingMsg, '❌ Lỗi xác thực API Key.', '#ef4444');
                } else {
                    this.setLoadingMsg(loadingMsg, '⚠️ Tất cả máy chủ đang bận. Vui lòng thử lại sau!', '#ef4444');
                }
                if (!isAuthError) rK();
            }
        }
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── RENDER MARKDOWN ─────────────────────────────────────

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

    // ─── HỎI AI VỀ CÂU HỎI ──────────────────────────────────

    askAboutQuestion(qIndex) {
        if (!this.chatContainer) return;
        if (this.chatContainer.style.display !== 'flex') this.toggleChat();

        const quiz = window.currentActiveQuiz;
        const qs = quiz ? (quiz.renderedQuestions || quiz.questions) : null;
        const q = qs ? qs[qIndex] : null;

        let groupPassage = '';
        if (q && quiz) {
            const rawQs = quiz.questions || [];
            for (const rg of rawQs) {
                if (rg.type === 'reading_group' && Array.isArray(rg.subQuestions)) {
                    const found = rg.subQuestions.find(sq => sq.id === q.id);
                    if (found) {
                        groupPassage = rg.passage
                            ? rg.passage.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                            : '';
                        break;
                    }
                }
            }
        }

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

        setTimeout(() => this.sendMessage(prompt), 200);
    }

    // ─── MANUAL CREATOR ──────────────────────────────────────

    openCreator() {
        // Kiểm tra đăng nhập
        const user = window.__tronexCurrentUser;
        if (!user) {
            alert('⚠️ Bạn cần đăng nhập để tạo đề thi!');
            if (typeof window.signInWithGoogle === 'function') window.signInWithGoogle();
            return;
        }

        // Reset trạng thái tạo mới
        this.editingQuizId = null;
        this.manualQuestions = [];

        const titleInput = document.getElementById('manualQuizTitle');
        const descInput = document.getElementById('manualQuizDesc');
        const titleDisplay = document.getElementById('creatorTitleDisplay');

        if (titleInput) titleInput.value = "";
        if (descInput) descInput.value = "";
        if (titleDisplay) titleDisplay.textContent = "Tạo đề mới";

        // Chọn mặc định Công khai
        const radPub = document.querySelector('input[name="quizPrivacy"][value="public"]');
        if (radPub) radPub.checked = true;

        if (this.creatorOverlay) this.creatorOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        this.renderManualQuestions();

        window.__tronexAICollector = (questions) => {
            questions.forEach(q => {
                this.manualQuestions.push({
                    id: q.id || `mq_${Date.now()}_${Math.random()}`,
                    type: q.type || 'multiple_choice',
                    text: q.text || '',
                    options: q.options || ['', '', '', ''],
                    correctIndex: q.correctIndex ?? 0,
                    correctAnswer: q.correctAnswer || "",
                    subQuestions: q.subQuestions || null,
                    imageData: q.imageData || q.imageSrc || null
                });
            });
            this.renderManualQuestions();
        };
    }

    editQuiz(quizId) {
        const user = window.__tronexCurrentUser;
        if (!user) {
            alert('⚠️ Bạn cần đăng nhập để chỉnh sửa đề thi!');
            if (typeof window.signInWithGoogle === 'function') window.signInWithGoogle();
            return;
        }

        const quiz = window.__mockQuizzes ? window.__mockQuizzes.find(q => q.id.toString() === quizId.toString()) : null;
        if (!quiz) return alert("❌ Không tìm thấy đề thi cần chỉnh sửa!");

        this.editingQuizId = quizId;

        // Clone sâu danh sách câu hỏi để chỉnh sửa độc lập
        this.manualQuestions = (quiz.questions || []).map(q => ({
            id: q.id,
            type: q.type || 'multiple_choice',
            text: q.text || '',
            options: q.options || ['', '', '', ''],
            correctIndex: q.correctIndex ?? 0,
            correctAnswer: q.correctAnswer || "",
            subQuestions: q.subQuestions || null,
            imageData: q.imageData || q.imageSrc || null
        }));

        const titleInput = document.getElementById('manualQuizTitle');
        const descInput = document.getElementById('manualQuizDesc');
        const titleDisplay = document.getElementById('creatorTitleDisplay');

        if (titleInput) titleInput.value = quiz.title || "";
        if (descInput) descInput.value = quiz.description || "";
        if (titleDisplay) titleDisplay.textContent = "Chỉnh sửa: " + (quiz.title || "");

        // Đặt radio privacy tương ứng
        const rad = document.querySelector(`input[name="quizPrivacy"][value="${quiz.privacy || 'public'}"]`);
        if (rad) rad.checked = true;

        if (this.creatorOverlay) this.creatorOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        this.renderManualQuestions();

        window.__tronexAICollector = (questions) => {
            questions.forEach(q => {
                this.manualQuestions.push({
                    id: q.id || `mq_${Date.now()}_${Math.random()}`,
                    type: q.type || 'multiple_choice',
                    text: q.text || '',
                    options: q.options || ['', '', '', ''],
                    correctIndex: q.correctIndex ?? 0,
                    correctAnswer: q.correctAnswer || "",
                    subQuestions: q.subQuestions || null,
                    imageData: q.imageData || q.imageSrc || null
                });
            });
            this.renderManualQuestions();
        };
    }

    closeCreator() {
        if (this.creatorOverlay) this.creatorOverlay.style.display = 'none';
        document.body.style.overflow = '';
        this.editingQuizId = null;
        this.manualQuestions = [];
        window.__tronexAICollector = null;
    }

    addQuestion(type) {
        const qId = Date.now();
        const q = { id: qId, type, text: '', options: ['', '', '', ''], correctIndex: 0, correctAnswer: '', imageData: null };
        if (type === 'true_false') {
            q.subQuestions = [
                { text: '', correctAnswer: 'Đúng' },
                { text: '', correctAnswer: 'Đúng' },
                { text: '', correctAnswer: 'Đúng' },
                { text: '', correctAnswer: 'Đúng' }
            ];
        }
        this.manualQuestions.push(q);
        this.renderManualQuestions();
    }

    renderManualQuestions() {
        if (!this.questionsContainer) return;
        this.questionsContainer.innerHTML = '';

        this.manualQuestions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'q-creator-item';
            const typeLabel = q.type === 'multiple_choice' ? '📝 Trắc nghiệm'
                : q.type === 'short_answer' ? '✍️ Trả lời ngắn'
                : q.type === 'true_false' ? '✅ Đúng/Sai'
                : '📝 Khác';

            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                    <strong>Câu ${index + 1} (${typeLabel})</strong>
                    <div style="display:flex;gap:8px;">
                        <button class="q-attach-btn" onclick="window.__attachImage(${index})" title="Đính kèm ảnh">📎 Ảnh</button>
                        <button onclick="window.__removeManualQ(${index})" style="color:#ef4444;border:none;background:none;cursor:pointer;font-size:13px;">✕ Xóa</button>
                    </div>
                </div>
                <textarea placeholder="Nhập nội dung câu hỏi..."
                    oninput="window.__updateManualQ(${index}, 'text', this.value)"
                    style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;min-height:80px;box-sizing:border-box;font-family:inherit;">${this._escape(q.text)}</textarea>
                ${q.imageData ? `<img src="${q.imageData}" class="q-attached-img" alt="Ảnh đính kèm">` : ''}
                <input type="file" id="imgInput_${index}" accept="image/*" style="display:none;" onchange="window.__handleImageAttach(${index}, event)">
                ${this.renderOptions(q, index)}
            `;
            this.questionsContainer.appendChild(card);
        });

        // Global handlers
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
        window.__updateTFSub = (qIdx, subIdx, field, val) => {
            if (this.manualQuestions[qIdx]?.subQuestions?.[subIdx]) {
                this.manualQuestions[qIdx].subQuestions[subIdx][field] = val;
            }
        };
        window.__attachImage = (idx) => {
            document.getElementById(`imgInput_${idx}`)?.click();
        };
        window.__handleImageAttach = (idx, event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 500 * 1024) { alert('Ảnh quá lớn! Dưới 500KB.'); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                this.manualQuestions[idx].imageData = e.target.result;
                this.renderManualQuestions();
            };
            reader.readAsDataURL(file);
        };

        window.updateManualQ = window.__updateManualQ;
        window.updateManualOpt = window.__updateManualOpt;
        window.removeManualQ = window.__removeManualQ;
    }

    renderOptions(q, idx) {
        if (q.type === 'true_false') {
            const subs = q.subQuestions || [];
            const labels = ['a', 'b', 'c', 'd'];
            return `<div class="tf-group-container">
                ${subs.map((sub, si) => `
                    <div class="tf-item">
                        <strong>${labels[si]})</strong>
                        <input type="text" placeholder="Nội dung ý ${labels[si]}..."
                            value="${this._escape(sub.text)}"
                            oninput="window.__updateTFSub(${idx}, ${si}, 'text', this.value)">
                        <select onchange="window.__updateTFSub(${idx}, ${si}, 'correctAnswer', this.value)">
                            <option value="Đúng" ${sub.correctAnswer === 'Đúng' ? 'selected' : ''}>Đúng</option>
                            <option value="Sai" ${sub.correctAnswer === 'Sai' ? 'selected' : ''}>Sai</option>
                        </select>
                    </div>
                `).join('')}
            </div>`;
        }

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

    // ─── AI IMAGE IMPORT ─────────────────────────────────────

    triggerImageImport() {
        const user = window.__tronexCurrentUser;
        if (!user) {
            alert('⚠️ Bạn cần đăng nhập để dùng tính năng này!');
            return;
        }
        document.getElementById('aiImageImportInput')?.click();
    }

    async handleImageImport(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const statusEl = this.questionsContainer;
        const originalContent = statusEl?.innerHTML || '';
        if (statusEl) {
            statusEl.innerHTML = `<div style="text-align:center;padding:40px;">
                <div class="dots-loading" style="font-size:18px;">📷 AI đang phân tích ${files.length} ảnh...</div>
                <p style="color:#6b7280;margin-top:8px;">Vui lòng chờ trong giây lát</p>
            </div>`;
        }

        try {
            // Convert all images to base64
            const imageParts = [];
            for (const file of files) {
                const base64 = await this._fileToBase64(file);
                imageParts.push({
                    inlineData: {
                        data: base64.split(',')[1],
                        mimeType: file.type
                    }
                });
            }

            const apiKey = gK();
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const prompt = `Hãy phân tích các ảnh đề thi này và trích xuất tất cả câu hỏi thành JSON array.

MỖI CÂU HỎI là một object với format:
- Trắc nghiệm: {"type":"multiple_choice","text":"nội dung câu hỏi","options":["A","B","C","D"],"correctIndex":0}
- Trả lời ngắn: {"type":"short_answer","text":"nội dung câu hỏi","correctAnswer":"đáp án"}
- Đúng/Sai: {"type":"true_false","text":"nội dung câu hỏi chung","subQuestions":[{"text":"ý a","correctAnswer":"Đúng"},{"text":"ý b","correctAnswer":"Sai"},...]}

QUAN TRỌNG:
1. Tự động nhận diện loại câu hỏi dựa trên format đề.
2. Nếu có đáp án in đậm hoặc đánh dấu, đặt làm correctIndex/correctAnswer.
3. Nếu không chắc đáp án, đặt correctIndex: 0 hoặc correctAnswer: "".
4. Giữ nguyên nội dung tiếng Việt, bao gồm dấu.
5. CHỈ trả về JSON array thuần tuý, KHÔNG kèm markdown hay text khác.`;

            const result = await model.generateContent([prompt, ...imageParts]);
            const responseText = result.response.text().trim();

            // Parse JSON from response
            let questions = [];
            try {
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    questions = JSON.parse(jsonMatch[0]);
                }
            } catch (parseErr) {
                console.error('[AI Import] Parse error:', parseErr);
                alert('❌ AI không thể phân tích ảnh. Vui lòng thử lại!');
                if (statusEl) statusEl.innerHTML = originalContent;
                return;
            }

            if (questions.length === 0) {
                alert('⚠️ Không tìm thấy câu hỏi nào trong ảnh.');
                if (statusEl) statusEl.innerHTML = originalContent;
                return;
            }

            // Add to manual questions
            questions.forEach(q => {
                this.manualQuestions.push({
                    id: Date.now() + Math.random(),
                    type: q.type || 'multiple_choice',
                    text: q.text || '',
                    options: q.options || ['', '', '', ''],
                    correctIndex: q.correctIndex ?? 0,
                    correctAnswer: q.correctAnswer || '',
                    subQuestions: q.subQuestions || null,
                    imageData: null
                });
            });

            this.renderManualQuestions();
            alert(`✅ Đã nhập thành công ${questions.length} câu hỏi từ ảnh!`);

        } catch (err) {
            console.error('[AI Import] Error:', err);
            alert('❌ Lỗi khi phân tích ảnh: ' + (err.message || err));
            if (statusEl) statusEl.innerHTML = originalContent;
        }

        // Reset input
        event.target.value = '';
    }

    _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ─── SAVE QUIZ ───────────────────────────────────────────

    async saveManualQuiz() {
        const titleEl = document.getElementById('manualQuizTitle');
        const descEl = document.getElementById('manualQuizDesc');
        const title = titleEl?.value.trim();
        if (!title) return alert("Vui lòng nhập tên đề thi!");
        if (this.manualQuestions.length === 0) return alert("Vui lòng thêm ít nhất 1 câu hỏi!");

        const user = window.__tronexCurrentUser;
        if (!user) return alert("⚠️ Bạn cần đăng nhập để lưu đề thi!");

        const privacy = document.querySelector('input[name="quizPrivacy"]:checked')?.value || 'public';
        const isEditing = !!this.editingQuizId;
        const quizId = isEditing ? this.editingQuizId : 'manual_' + Date.now();

        // Lấy thông tin đề thi cũ nếu đang edit
        let oldQuiz = null;
        if (isEditing && window.__mockQuizzes) {
            oldQuiz = window.__mockQuizzes.find(q => q.id.toString() === quizId.toString());
        }

        const createdBy = oldQuiz ? oldQuiz.createdBy : {
            uid: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || '',
            photoURL: user.photoURL || ''
        };
        const viewCount = oldQuiz ? (oldQuiz.viewCount || 0) : 0;

        const newQuiz = {
            id: quizId,
            title,
            description: descEl?.value.trim() || `Đề thi - ${this.manualQuestions.length} câu`,
            privacy,
            viewCount,
            createdBy,
            questions: this.manualQuestions.map((q, i) => ({
                id: q.id || `mq_${Date.now()}_${i}`,
                qNumber: i + 1,
                type: q.type,
                text: q.text,
                options: q.type === 'multiple_choice' ? q.options : null,
                correctIndex: q.type === 'multiple_choice' ? q.correctIndex : undefined,
                correctAnswer: q.correctAnswer || "",
                subQuestions: q.type === 'true_false' ? q.subQuestions : undefined,
                imageData: q.imageData || undefined
            }))
        };

        try {
            const LOCAL_KEY = window.location.pathname.toLowerCase().includes('v-act')
                ? 'trongbeshop_vact_quizzes'
                : 'trongbeshop_custom_quizzes';
            
            // 1. Cập nhật localStorage
            const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
            const localIdx = saved.findIndex(q => q.id.toString() === quizId.toString());
            
            if (localIdx !== -1) {
                saved[localIdx] = newQuiz;
            } else {
                saved.unshift(newQuiz);
            }
            localStorage.setItem(LOCAL_KEY, JSON.stringify(saved));

            // 2. Cập nhật window.__mockQuizzes
            if (window.__mockQuizzes) {
                const memIdx = window.__mockQuizzes.findIndex(q => q.id.toString() === quizId.toString());
                if (memIdx !== -1) {
                    window.__mockQuizzes[memIdx] = newQuiz;
                } else {
                    window.__mockQuizzes.unshift(newQuiz);
                }
            }

            // 3. Đồng bộ Firebase Cloud
            if (privacy === 'public') {
                if (window.__publishPublicQuiz) {
                    window.__publishPublicQuiz(newQuiz);
                }
                if (window.__deletePrivateQuiz) {
                    window.__deletePrivateQuiz(user.uid, quizId);
                }
            } else {
                if (window.__publishPrivateQuiz) {
                    window.__publishPrivateQuiz(user.uid, newQuiz);
                }
                if (window.__deletePublicQuiz) {
                    window.__deletePublicQuiz(quizId);
                }
            }

            if (window.__initQuizList) window.__initQuizList();

            alert(isEditing ? "✅ Đã cập nhật đề thi thành công!" : "✅ Đã lưu đề thi mới thành công!");
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