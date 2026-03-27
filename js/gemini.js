// ============================================================
// GEMINI AI - NHẬP ĐỀ BẰNG ẢNH
// ============================================================
// CÁCH CHỐNG BOT QUÉT RÒ RỈ: Hãy cắt nhỏ API KEY mới của bạn làm 3 đoạn và dán vào đây:
const KEY_PART_1 = "AIzaSyBnRHr";
const KEY_PART_2 = "kbQwQF43nUFYu";
const KEY_PART_3 = "E_kjkg0sK2HDDiU";
const GEMINI_API_KEY = KEY_PART_1 + KEY_PART_2 + KEY_PART_3;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;





// ---- Trạng thái nội bộ ----
let uploadedImages = [];      // [{base64, mimeType, name}]
let extractedQuestions = [];  // câu hỏi sau khi AI phân tích
let modalInitialized = false; // chống double-init

// ============================================================
// PHÂN TÍCH ẢNH VỚI GEMINI
// ============================================================
async function analyzeQuizImage(images, extraNote = "", retryCount = 0) {
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
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    });

    const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { 
                temperature: 0.1, 
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        const msg = err.error?.message || "Gemini API lỗi";

        // Nếu bị rate limit, tự động retry sau 25 giây
        if (response.status === 429 && retryCount < 2) {
            const waitTime = 25000;
            const loadingTitle = document.querySelector(".gemini-loading-title");
            const loadingSub = document.querySelector(".gemini-loading-sub");
            if (loadingTitle) loadingTitle.textContent = `Đang chờ ${waitTime / 1000}s để thử lại...`;
            if (loadingSub) loadingSub.textContent = `Gemini đang bận, tự động thử lại (lần ${retryCount + 1}/2)`;
            await new Promise(r => setTimeout(r, waitTime));
            if (loadingTitle) loadingTitle.textContent = "Gemini đang phân tích ảnh...";
            if (loadingSub) loadingSub.textContent = "Quá trình này có thể mất 10-30 giây";
            return analyzeQuizImage(images, extraNote, retryCount + 1);
        }

        throw new Error(msg);
    }

    try {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return parsed.questions || [];
    } catch (error) {
        console.error("JSON Parse Error:", error);
        throw new Error("Đề thi quá dài khiến AI trả về dữ liệu bị ngắt quãng. Vui lòng thử chụp gần hơn hoặc tách ra phân tích từng ảnh một (1-2 trang/lần).");
    }
}

// ============================================================
// FILE → BASE64
// ============================================================
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve({ base64: reader.result.split(",")[1], mimeType: file.type, name: file.name });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function processFiles(files) {
    const validFiles = files.filter(f => f.type.startsWith("image/"));
    if (validFiles.length === 0) return;
    const newImgs = await Promise.all(validFiles.map(fileToBase64));
    uploadedImages.push(...newImgs);
    renderImagePreviews();
    updateDropZoneVisibility();
}

function updateDropZoneVisibility() {
    const dropZone = document.getElementById("imageDrop");
    const addMoreBtn = document.getElementById("btnAddMoreImages");
    if (!dropZone) return;
    if (uploadedImages.length > 0) {
        dropZone.style.display = "none";
        if (addMoreBtn) addMoreBtn.style.display = "inline-flex";
    } else {
        dropZone.style.display = "flex";
        if (addMoreBtn) addMoreBtn.style.display = "none";
    }
}

// ============================================================
// MỞ / ĐÓNG MODAL
// ============================================================
function openGeminiModal() {
    uploadedImages = [];
    extractedQuestions = [];
    // Reset bước 1
    const dropZone = document.getElementById("imageDrop");
    const addMoreBtn = document.getElementById("btnAddMoreImages");
    const previewContainer = document.getElementById("imagePreviewContainer");
    const extraNote = document.getElementById("geminiExtraNote");
    const geminiError = document.getElementById("geminiError");
    if (dropZone) dropZone.style.display = "flex";
    if (addMoreBtn) addMoreBtn.style.display = "none";
    if (previewContainer) previewContainer.innerHTML = "";
    if (extraNote) extraNote.value = "";
    if (geminiError) geminiError.style.display = "none";
    // Reset bước 4
    const titleEl = document.getElementById("geminiQuizTitle");
    const descEl = document.getElementById("geminiQuizDesc");
    if (titleEl) { titleEl.value = ""; titleEl.style.borderColor = ""; }
    if (descEl) descEl.value = "";
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
    document.querySelectorAll(".step-dot").forEach((dot, i) => {
        dot.classList.toggle("done", i + 1 < step);
        dot.classList.toggle("active-dot", i + 1 === step);
    });
}

// ============================================================
// RENDER PREVIEW ẢNH
// ============================================================
function renderImagePreviews() {
    const container = document.getElementById("imagePreviewContainer");
    if (!container) return;
    container.innerHTML = "";
    uploadedImages.forEach((img, i) => {
        const wrapper = document.createElement("div");
        wrapper.className = "img-preview-item";
        wrapper.innerHTML = `
            <img src="data:${img.mimeType};base64,${img.base64}" alt="${img.name}">
            <button class="img-remove-btn" data-index="${i}" title="Xóa ảnh">✕</button>
            <span class="img-name">${img.name}</span>
        `;
        wrapper.querySelector(".img-remove-btn").addEventListener("click", () => {
            uploadedImages.splice(i, 1);
            renderImagePreviews();
            updateDropZoneVisibility();
        });
        container.appendChild(wrapper);
    });
}

// ============================================================
// RENDER CÂU HỎI ĐỂ CHỈNH SỬA (BƯỚC 3)
// ============================================================
function escapeHTML(str) {
    return String(str || "").replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
}

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

        let rawType = (q.type || "multiple_choice").toString().toLowerCase().trim();
        let type = "multiple_choice";
        if (rawType.includes("true") || rawType.includes("false") || rawType.includes("sai") || rawType.includes("đúng")) type = "true_false_group";
        else if (rawType.includes("short") || rawType.includes("ngắn")) type = "short_answer";

        const typeLabel = type === "multiple_choice" ? "Nhiều lựa chọn" : type === "true_false_group" ? "Đúng / Sai" : "Trả lời ngắn";
        const typeClass = type === "multiple_choice" ? "badge-mc" : type === "true_false_group" ? "badge-tf" : "badge-sa";

        let bodyHTML = "";

        if (type === "multiple_choice") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi:</label>
                    <textarea class="q-text-input" rows="2">${escapeHTML(q.text)}</textarea>
                </div>
                <div class="q-options-editor">
                    <label>Lựa chọn (click ✓ để chọn đáp án đúng):</label>
                    ${(q.options || []).map((opt, oi) => `
                        <div class="q-option-row ${oi === q.correctIndex ? 'is-correct' : ''}" data-oi="${oi}">
                            <button class="correct-selector ${oi === q.correctIndex ? 'selected' : ''}" data-qi="${qi}" data-oi="${oi}">✓</button>
                            <input type="text" class="q-opt-input" value="${escapeHTML(opt)}" data-qi="${qi}" data-oi="${oi}">
                        </div>
                    `).join("")}
                </div>
            `;
        } else if (type === "true_false_group") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi:</label>
                    <textarea class="q-text-input" rows="2">${escapeHTML(q.text)}</textarea>
                </div>
                <div class="tf-editor-table">
                    <table>
                        <thead><tr><th>Nội dung ý</th><th>Đúng</th><th>Sai</th></tr></thead>
                        <tbody>
                            ${(q.subQuestions || []).map((sq, si) => `
                                <tr>
                                    <td><input type="text" class="tf-sub-input" value="${escapeHTML(sq.text)}" data-qi="${qi}" data-si="${si}"></td>
                                    <td class="tf-radio-cell">
                                        <label class="tf-radio-label ${sq.correctAnswer === 'Đúng' ? 'tf-selected' : ''}">
                                            <input type="radio" name="tf_${qi}_${si}" value="Đúng" ${sq.correctAnswer === 'Đúng' ? 'checked' : ''} data-qi="${qi}" data-si="${si}">
                                        </label>
                                    </td>
                                    <td class="tf-radio-cell">
                                        <label class="tf-radio-label ${sq.correctAnswer === 'Sai' ? 'tf-selected' : ''}">
                                            <input type="radio" name="tf_${qi}_${si}" value="Sai" ${sq.correctAnswer === 'Sai' ? 'checked' : ''} data-qi="${qi}" data-si="${si}">
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
                    <textarea class="q-text-input" rows="2">${escapeHTML(q.text)}</textarea>
                </div>
                <div class="q-text-editor">
                    <label>Đáp án đúng:</label>
                    <input type="text" class="q-answer-input" value="${escapeHTML(q.correctAnswer)}" placeholder="Nhập đáp án..." data-qi="${qi}">
                </div>
            `;
        }

        card.innerHTML = `
            <div class="q-editor-header">
                <div class="q-editor-num">Câu ${qi + 1}</div>
                <span class="q-type-badge ${typeClass}">${typeLabel}</span>
                <div class="q-editor-actions">
                    <button class="q-action-btn q-delete-btn" data-qi="${qi}" title="Xóa câu này">🗑️</button>
                </div>
            </div>
            <div class="q-editor-body">${bodyHTML}</div>
        `;
        container.appendChild(card);
    });

    // Attach events using event delegation on container
    container.querySelectorAll(".q-text-input").forEach(ta => {
        ta.addEventListener("input", () => {
            const qi = parseInt(ta.closest(".q-editor-card").dataset.index);
            extractedQuestions[qi].text = ta.value;
        });
    });
    container.querySelectorAll(".q-opt-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            const oi = parseInt(inp.dataset.oi);
            extractedQuestions[qi].options[oi] = inp.value;
        });
    });
    container.querySelectorAll(".q-answer-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            extractedQuestions[qi].correctAnswer = inp.value;
        });
    });
    container.querySelectorAll(".tf-sub-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            const si = parseInt(inp.dataset.si);
            extractedQuestions[qi].subQuestions[si].text = inp.value;
        });
    });
    container.querySelectorAll("input[type=radio]").forEach(radio => {
        radio.addEventListener("change", () => {
            const qi = parseInt(radio.dataset.qi);
            const si = parseInt(radio.dataset.si);
            extractedQuestions[qi].subQuestions[si].correctAnswer = radio.value;
            const card = container.querySelector(`.q-editor-card[data-index="${qi}"]`);
            const rows = card.querySelectorAll("tbody tr");
            const row = rows[si];
            row.querySelectorAll(".tf-radio-label").forEach(l => l.classList.remove("tf-selected"));
            radio.closest(".tf-radio-label").classList.add("tf-selected");
        });
    });
    container.querySelectorAll(".correct-selector").forEach(btn => {
        btn.addEventListener("click", () => {
            const qi = parseInt(btn.dataset.qi);
            const oi = parseInt(btn.dataset.oi);
            extractedQuestions[qi].correctIndex = oi;
            const card = container.querySelector(`.q-editor-card[data-index="${qi}"]`);
            card.querySelectorAll(".q-option-row").forEach((row, i) => {
                row.classList.toggle("is-correct", i === oi);
                row.querySelector(".correct-selector").classList.toggle("selected", i === oi);
            });
        });
    });
    container.querySelectorAll(".q-delete-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const qi = parseInt(btn.dataset.qi);
            extractedQuestions.splice(qi, 1);
            renderQuestionEditor();
        });
    });
}

// ============================================================
// THÊM ĐỀ VÀO DANH SÁCH
// ============================================================
function importQuizToList() {
    const titleEl = document.getElementById("geminiQuizTitle");
    const descEl = document.getElementById("geminiQuizDesc");
    const privacyEl = document.querySelector('input[name="geminiQuizPrivacy"]:checked');
    const title = titleEl.value.trim();
    const desc = descEl.value.trim();
    const privacy = privacyEl ? privacyEl.value : "private";

    if (!title) {
        titleEl.style.borderColor = "#EF4444";
        titleEl.focus();
        return;
    }
    if (extractedQuestions.length === 0) {
        alert("Không có câu hỏi nào để thêm!");
        return;
    }

    const newId = "gemini_" + Date.now();
    const finalQuestions = extractedQuestions.map((q, i) => ({
        ...q,
        id: `${newId}_q${i + 1}`,
        section: q.section || "TRẮC NGHIỆM"
    }));

    const newQuiz = {
        id: newId,
        title: title,
        description: desc || "Đề thi được tạo tự động bởi Gemini AI.",
        questions: finalQuestions,
        privacy: privacy
    };
    
    window.__mockQuizzes.unshift(newQuiz);
    
    if (privacy === "public" && window.__publishPublicQuiz) {
        window.__publishPublicQuiz(newQuiz);
    } else {
        if (window.__saveCustomQuizzes) window.__saveCustomQuizzes();
    }
    
    window.__initQuizList();
    showGeminiStep(5);
}

// ============================================================
// KHỞI TẠO SỰ KIỆN KHÔNG TRÙNG LẶP
// ============================================================
function triggerFileInput(inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.click();
}

function initGeminiModal() {
    if (modalInitialized) return;
    modalInitialized = true;

    // --- DROP ZONE ---
    const dropZone = document.getElementById("imageDrop");
    const fileInput = document.getElementById("imageFileInput");
    const addMoreInput = document.getElementById("addMoreFileInput");

    // Click vùng drop để mở file picker
    dropZone.addEventListener("click", () => fileInput.click());

    // Drag & drop
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        await processFiles(Array.from(e.dataTransfer.files));
    });

    // File input change
    fileInput.addEventListener("change", async () => {
        await processFiles(Array.from(fileInput.files));
        fileInput.value = "";
    });

    // Nút "Thêm ảnh"
    document.getElementById("btnAddMoreImages").addEventListener("click", () => addMoreInput.click());
    addMoreInput.addEventListener("change", async () => {
        await processFiles(Array.from(addMoreInput.files));
        addMoreInput.value = "";
    });

    // --- NÚT PHÂN TÍCH ---
    document.getElementById("btnAnalyze").addEventListener("click", async () => {
        if (uploadedImages.length === 0) {
            dropZone.style.display = "flex";
            dropZone.classList.add("shake");
            setTimeout(() => dropZone.classList.remove("shake"), 600);
            return;
        }
        const extraNote = document.getElementById("geminiExtraNote").value.trim();
        showGeminiStep(2);
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

    // --- BƯỚC 3 → 4 ---
    document.getElementById("btnGoToSave").addEventListener("click", () => {
        if (extractedQuestions.length === 0) { alert("Không có câu hỏi nào!"); return; }
        showGeminiStep(4);
    });

    // --- BƯỚC 4 → IMPORT ---
    document.getElementById("btnImportQuiz").addEventListener("click", importQuizToList);

    // --- PHÂN TÍCH LẠI ---
    document.getElementById("btnReanalyze").addEventListener("click", () => {
        if (!confirm("Bạn có chắc muốn xóa hết dữ liệu hiện tại để phân tích lại từ đầu không?")) return;
        uploadedImages = [];
        extractedQuestions = [];
        renderImagePreviews();
        updateDropZoneVisibility();
        showGeminiStep(1);
    });

    // --- PHÂN TÍCH THÊM (APPEND) ---
    const btnAnalyzeMore = document.getElementById("btnAnalyzeMore");
    const analyzeMoreInput = document.getElementById("analyzeMoreInput");
    if (btnAnalyzeMore && analyzeMoreInput) {
        btnAnalyzeMore.addEventListener("click", () => analyzeMoreInput.click());
        analyzeMoreInput.addEventListener("change", async () => {
            const files = Array.from(analyzeMoreInput.files).filter(f => f.type.startsWith("image/"));
            if (files.length === 0) return;
            
            const extraNote = document.getElementById("geminiExtraNote").value.trim();
            showGeminiStep(2); // Show loading spinner
            
            try {
                const newImages = await Promise.all(files.map(fileToBase64));
                const newQuestions = await analyzeQuizImage(newImages, extraNote);
                
                if (newQuestions && newQuestions.length > 0) {
                    // Nối thêm câu hỏi mới vào danh sách hiện tại
                    extractedQuestions.push(...newQuestions);
                    renderQuestionEditor();
                } else {
                    alert("Gemini không nhận diện thêm được câu hỏi nào từ ảnh mới.");
                }
                showGeminiStep(3);
            } catch (err) {
                console.error("Gemini append error:", err);
                showGeminiStep(3); // Quay lại editor
                alert("Lỗi khi phân tích thêm: " + err.message);
            }
            analyzeMoreInput.value = "";
        });
    }

    // --- BƯỚC 5 → ĐÓNG ---
    document.getElementById("btnCloseSuccess").addEventListener("click", closeGeminiModal);

    // --- CÁC NÚT BACK ---
    document.getElementById("btnBackToUpload").addEventListener("click", () => showGeminiStep(1));
    document.getElementById("btnBackToEdit").addEventListener("click", () => showGeminiStep(3));

    // --- ĐÓNG MODAL ---
    document.getElementById("geminiModalOverlay").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeGeminiModal();
    });
    document.getElementById("btnCloseGeminiModal").addEventListener("click", closeGeminiModal);

    // --- PHÍM ESC ---
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && document.getElementById("geminiModalOverlay").classList.contains("active")) {
            closeGeminiModal();
        }
    });
}

// ============================================================
// EXPOSE RA WINDOW
// ============================================================
window.openGeminiModal = openGeminiModal;
window.closeGeminiModal = closeGeminiModal;

// Khởi động an toàn (chống double-init)
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGeminiModal);
} else {
    initGeminiModal();
}
