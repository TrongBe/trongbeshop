// ============================================================
// GEMINI AI - NHẬP ĐỀ BẰNG ẢNH
// ============================================================
const GEMINI_API_KEY = "AIzaSyChR-vkkNOsb3iMrpwCnLljDTB1QfzrNY8";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ---- Trạng thái nội bộ ----
let uploadedImages = []; // [{base64, mimeType, name}]
let extractedQuestions = []; // mảng câu hỏi sau khi AI phân tích
let sectionName = "TRẮC NGHIỆM"; // tên section mặc định

// ============================================================
// PHÂN TÍCH ẢNH VỚI GEMINI
// ============================================================
async function analyzeQuizImage(images, extraNote = "") {
    const prompt = `Bạn là AI chuyên trích xuất câu hỏi từ ảnh đề thi. Hãy phân tích TẤT CẢ các câu hỏi trong ảnh và trả về JSON THUẦN TÚY (không có markdown fence, không có \`\`\`json).

Cấu trúc JSON cần trả về:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "section": "TRẮC NGHIỆM",
      "text": "Nội dung câu hỏi",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctIndex": 0
    },
    {
      "id": "q2",
      "type": "true_false_group",
      "section": "TRẮC NGHIỆM ĐÚNG SAI",
      "text": "Nội dung nhóm câu hỏi đúng/sai",
      "subQuestions": [
        {"id": "a", "text": "a) Nội dung", "correctAnswer": "Đúng"},
        {"id": "b", "text": "b) Nội dung", "correctAnswer": "Sai"}
      ]
    },
    {
      "id": "q3",
      "type": "short_answer",
      "section": "TRẢ LỜI NGẮN",
      "text": "Nội dung câu hỏi",
      "correctAnswer": "đáp án ngắn"
    }
  ]
}

Quy tắc:
- Sử dụng type "multiple_choice" cho câu trắc nghiệm có 4 lựa chọn A/B/C/D
- Sử dụng type "true_false_group" cho câu hỏi đúng/sai có nhiều ý
- Sử dụng type "short_answer" cho câu trả lời ngắn/điền số
- correctIndex là chỉ số 0-based (0=A, 1=B, 2=C, 3=D)
- Nếu không xác định được đáp án đúng, đặt correctIndex: 0 hoặc correctAnswer: "?"
- id phải là chuỗi duy nhất: "q1", "q2",... hoặc "tf1", "sa1",...
- Giữ nguyên nội dung câu hỏi bằng tiếng Việt
${extraNote ? `\nGhi chú thêm: ${extraNote}` : ""}

CHỈ TRẢ VỀ JSON, KHÔNG CÓ VĂN BẢN KHÁC.`;

    const parts = [{ text: prompt }];
    images.forEach(img => {
        parts.push({
            inlineData: {
                mimeType: img.mimeType,
                data: img.base64
            }
        });
    });

    const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Gemini API lỗi");
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Clean JSON nếu có fence
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.questions || [];
}

// ============================================================
// FILE → BASE64
// ============================================================
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            resolve({ base64, mimeType: file.type, name: file.name });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================================
// MỞ / ĐÓNG MODAL
// ============================================================
function openGeminiModal() {
    uploadedImages = [];
    extractedQuestions = [];
    showGeminiStep(1);
    document.getElementById("geminiModalOverlay").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeGeminiModal() {
    document.getElementById("geminiModalOverlay").classList.remove("active");
    document.body.style.overflow = "";
}

function showGeminiStep(step) {
    document.querySelectorAll(".gemini-step").forEach(el => el.classList.remove("active"));
    const target = document.getElementById(`geminiStep${step}`);
    if (target) target.classList.add("active");

    // Update step indicators
    document.querySelectorAll(".step-dot").forEach((dot, i) => {
        dot.classList.toggle("done", i + 1 < step);
        dot.classList.toggle("active-dot", i + 1 === step);
    });
}

// ============================================================
// RENDER PREVIEW ẢNH ĐÃ UPLOAD
// ============================================================
function renderImagePreviews() {
    const container = document.getElementById("imagePreviewContainer");
    container.innerHTML = "";
    uploadedImages.forEach((img, i) => {
        const wrapper = document.createElement("div");
        wrapper.className = "img-preview-item";
        wrapper.innerHTML = `
            <img src="data:${img.mimeType};base64,${img.base64}" alt="${img.name}">
            <button class="img-remove-btn" onclick="removeUploadedImage(${i})" title="Xóa ảnh">✕</button>
            <span class="img-name">${img.name}</span>
        `;
        container.appendChild(wrapper);
    });

    const addMoreBtn = document.getElementById("btnAddMoreImages");
    if (addMoreBtn) addMoreBtn.style.display = uploadedImages.length > 0 ? "inline-flex" : "none";
}

window.removeUploadedImage = function(index) {
    uploadedImages.splice(index, 1);
    renderImagePreviews();
    if (uploadedImages.length === 0) {
        document.getElementById("imageDrop").style.display = "flex";
    }
};

// ============================================================
// RENDER CÂU HỎI ĐỂ CHỈNH SỬA (BƯỚC 3)
// ============================================================
function renderQuestionEditor() {
    const container = document.getElementById("questionEditorContainer");
    container.innerHTML = "";

    if (extractedQuestions.length === 0) {
        container.innerHTML = `<div class="editor-empty">Không tìm thấy câu hỏi. Hãy thử lại với ảnh rõ hơn.</div>`;
        return;
    }

    document.getElementById("geminiQuestionCount").textContent = `${extractedQuestions.length} câu hỏi`;

    extractedQuestions.forEach((q, qi) => {
        const card = document.createElement("div");
        card.className = "q-editor-card";
        card.dataset.index = qi;

        const type = q.type || "multiple_choice";
        let typeLabel = type === "multiple_choice" ? "Nhiều lựa chọn" : type === "true_false_group" ? "Đúng / Sai" : "Trả lời ngắn";
        let typeClass = type === "multiple_choice" ? "badge-mc" : type === "true_false_group" ? "badge-tf" : "badge-sa";

        let bodyHTML = "";

        if (type === "multiple_choice") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi:</label>
                    <textarea class="q-text-input" data-field="text" data-qi="${qi}">${q.text || ""}</textarea>
                </div>
                <div class="q-options-editor">
                    <label>Các lựa chọn (click ô tròn để chọn đáp án đúng):</label>
                    ${(q.options || []).map((opt, oi) => `
                        <div class="q-option-row ${oi === q.correctIndex ? 'is-correct' : ''}" data-qi="${qi}" data-oi="${oi}">
                            <button class="correct-selector ${oi === q.correctIndex ? 'selected' : ''}" onclick="setCorrectMC(${qi},${oi})" title="Đánh dấu là đáp án đúng">✓</button>
                            <input type="text" class="q-opt-input" value="${opt}" data-qi="${qi}" data-oi="${oi}" placeholder="Lựa chọn ${oi+1}">
                        </div>
                    `).join("")}
                </div>
            `;
        } else if (type === "true_false_group") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi:</label>
                    <textarea class="q-text-input" data-field="text" data-qi="${qi}">${q.text || ""}</textarea>
                </div>
                <div class="tf-editor-table">
                    <table>
                        <thead><tr><th>Nội dung ý</th><th>Đúng</th><th>Sai</th></tr></thead>
                        <tbody>
                            ${(q.subQuestions || []).map((sq, si) => `
                                <tr>
                                    <td><input type="text" class="tf-sub-input" value="${sq.text}" data-qi="${qi}" data-si="${si}"></td>
                                    <td class="tf-radio-cell">
                                        <label class="tf-radio-label ${sq.correctAnswer === 'Đúng' ? 'tf-selected' : ''}">
                                            <input type="radio" name="tf_${qi}_${si}" value="Đúng" ${sq.correctAnswer === 'Đúng' ? 'checked' : ''} onchange="setCorrectTF(${qi},${si},this.value)">
                                        </label>
                                    </td>
                                    <td class="tf-radio-cell">
                                        <label class="tf-radio-label ${sq.correctAnswer === 'Sai' ? 'tf-selected' : ''}">
                                            <input type="radio" name="tf_${qi}_${si}" value="Sai" ${sq.correctAnswer === 'Sai' ? 'checked' : ''} onchange="setCorrectTF(${qi},${si},this.value)">
                                        </label>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (type === "short_answer") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi:</label>
                    <textarea class="q-text-input" data-field="text" data-qi="${qi}">${q.text || ""}</textarea>
                </div>
                <div class="q-text-editor">
                    <label>Đáp án đúng:</label>
                    <input type="text" class="q-answer-input" value="${q.correctAnswer || ""}" data-qi="${qi}" placeholder="Nhập đáp án...">
                </div>
            `;
        }

        card.innerHTML = `
            <div class="q-editor-header">
                <div class="q-editor-num">Câu ${qi + 1}</div>
                <span class="q-type-badge ${typeClass}">${typeLabel}</span>
                <div class="q-editor-actions">
                    <button class="q-action-btn q-delete-btn" onclick="deleteExtractedQuestion(${qi})" title="Xóa câu này">🗑️</button>
                </div>
            </div>
            <div class="q-editor-body">
                ${bodyHTML}
            </div>
        `;
        container.appendChild(card);
    });

    // Attach live-sync events
    syncEditorEvents();
}

function syncEditorEvents() {
    // Sync text inputs
    document.querySelectorAll(".q-text-input").forEach(ta => {
        ta.addEventListener("input", () => {
            const qi = parseInt(ta.dataset.qi);
            extractedQuestions[qi].text = ta.value;
        });
    });
    document.querySelectorAll(".q-opt-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            const oi = parseInt(inp.dataset.oi);
            extractedQuestions[qi].options[oi] = inp.value;
        });
    });
    document.querySelectorAll(".q-answer-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            extractedQuestions[qi].correctAnswer = inp.value;
        });
    });
    document.querySelectorAll(".tf-sub-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            const si = parseInt(inp.dataset.si);
            extractedQuestions[qi].subQuestions[si].text = inp.value;
        });
    });
}

window.setCorrectMC = function(qi, oi) {
    extractedQuestions[qi].correctIndex = oi;
    // Update UI
    const card = document.querySelector(`.q-editor-card[data-index="${qi}"]`);
    if (!card) return;
    card.querySelectorAll(".q-option-row").forEach((row, i) => {
        row.classList.toggle("is-correct", i === oi);
        row.querySelector(".correct-selector").classList.toggle("selected", i === oi);
    });
};

window.setCorrectTF = function(qi, si, val) {
    extractedQuestions[qi].subQuestions[si].correctAnswer = val;
    // Re-style labels
    const card = document.querySelector(`.q-editor-card[data-index="${qi}"]`);
    if (!card) return;
    const rows = card.querySelectorAll("tbody tr");
    const row = rows[si];
    row.querySelectorAll(".tf-radio-label").forEach(l => l.classList.remove("tf-selected"));
    const checkedRadio = row.querySelector(`input[value="${val}"]`);
    if (checkedRadio) checkedRadio.closest(".tf-radio-label").classList.add("tf-selected");
};

window.deleteExtractedQuestion = function(qi) {
    extractedQuestions.splice(qi, 1);
    renderQuestionEditor();
};

// ============================================================
// THÊM ĐỀ VÀO DANH SÁCH
// ============================================================
function importQuizToList() {
    const titleEl = document.getElementById("geminiQuizTitle");
    const descEl = document.getElementById("geminiQuizDesc");
    const title = titleEl.value.trim();
    const desc = descEl.value.trim();

    if (!title) {
        titleEl.style.borderColor = "#EF4444";
        titleEl.focus();
        return;
    }

    if (extractedQuestions.length === 0) {
        alert("Không có câu hỏi nào để thêm!");
        return;
    }

    // Gán id mới để tránh trùng
    const newId = "gemini_" + Date.now();
    const finalQuestions = extractedQuestions.map((q, i) => ({
        ...q,
        id: `${newId}_q${i + 1}`,
        section: q.section || "TRẮC NGHIỆM"
    }));

    const newQuiz = {
        id: newId,
        title: title || "Đề nhập từ AI",
        description: desc || "Đề thi được tạo tự động bởi Gemini AI.",
        questions: finalQuestions
    };

    // Push vào mockQuizzes (import từ app.js qua window)
    window.__mockQuizzes.push(newQuiz);
    window.__initQuizList();

    showGeminiStep(5);
}

// ============================================================
// KHỞI TẠO MODAL (chạy sau khi DOM ready)
// ============================================================
function initGeminiModal() {
    // Drag & drop zone
    const dropZone = document.getElementById("imageDrop");
    const fileInput = document.getElementById("imageFileInput");

    if (!dropZone) return;

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
        await processFiles(files);
    });

    fileInput.addEventListener("change", async () => {
        const files = Array.from(fileInput.files);
        await processFiles(files);
        fileInput.value = "";
    });

    // Thêm ảnh tiếp
    const addMoreInput = document.getElementById("addMoreFileInput");
    document.getElementById("btnAddMoreImages")?.addEventListener("click", () => addMoreInput.click());
    addMoreInput?.addEventListener("change", async () => {
        const files = Array.from(addMoreInput.files);
        await processFiles(files);
        addMoreInput.value = "";
    });

    // Nút phân tích
    document.getElementById("btnAnalyze").addEventListener("click", async () => {
        if (uploadedImages.length === 0) {
            document.getElementById("imageDrop").style.animation = "shake 0.3s";
            setTimeout(() => document.getElementById("imageDrop").style.animation = "", 300);
            return;
        }

        const extraNote = document.getElementById("geminiExtraNote").value.trim();
        showGeminiStep(2); // loading

        try {
            extractedQuestions = await analyzeQuizImage(uploadedImages, extraNote);
            renderQuestionEditor();
            showGeminiStep(3);
        } catch (err) {
            console.error("Gemini error:", err);
            showGeminiStep(1);
            const errBox = document.getElementById("geminiError");
            errBox.textContent = "❌ Lỗi: " + err.message;
            errBox.style.display = "block";
            setTimeout(() => errBox.style.display = "none", 8000);
        }
    });

    // Bước 3 → 4 (đặt tên)
    document.getElementById("btnGoToSave").addEventListener("click", () => {
        if (extractedQuestions.length === 0) {
            alert("Không có câu hỏi nào!");
            return;
        }
        showGeminiStep(4);
    });

    // Bước 4 → Import
    document.getElementById("btnImportQuiz").addEventListener("click", importQuizToList);

    // Reset về bước 1
    document.getElementById("btnReanalyze").addEventListener("click", () => {
        uploadedImages = [];
        extractedQuestions = [];
        renderImagePreviews();
        document.getElementById("imageDrop").style.display = "flex";
        showGeminiStep(1);
    });

    // Bước 5 → Đóng
    document.getElementById("btnCloseSuccess").addEventListener("click", closeGeminiModal);

    // Back buttons
    document.getElementById("btnBackToUpload").addEventListener("click", () => showGeminiStep(1));
    document.getElementById("btnBackToEdit").addEventListener("click", () => showGeminiStep(3));

    // Close overlay click
    document.getElementById("geminiModalOverlay").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeGeminiModal();
    });

    // Close button
    document.getElementById("btnCloseGeminiModal").addEventListener("click", closeGeminiModal);
}

async function processFiles(files) {
    const validFiles = files.filter(f => f.type.startsWith("image/"));
    if (validFiles.length === 0) return;

    const newImgs = await Promise.all(validFiles.map(fileToBase64));
    uploadedImages.push(...newImgs);
    document.getElementById("imageDrop").style.display = uploadedImages.length > 0 ? "none" : "flex";
    renderImagePreviews();
}

// ============================================================
// EXPOSE RA WINDOW để index.html gọi được
// ============================================================
window.openGeminiModal = openGeminiModal;
window.closeGeminiModal = closeGeminiModal;

// Khởi động sau khi DOM ready
document.addEventListener("DOMContentLoaded", initGeminiModal);
// Fallback nếu DOMContentLoaded đã qua (module load sau)
if (document.readyState !== "loading") {
    initGeminiModal();
}
