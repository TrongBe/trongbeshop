import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================
// GEMINI AI - CONFIGURATION AND KEY ROTATION
// ============================================================
const _K = [
    "AIzaSyBnRHrkbQwQF43n" + "UFYuE_kjkg0sK2HDDiU", // Key 1
    "AIzaSyBujYVCD_avJy1E" + "yYZHpwu0M10itiAXSnY", // Key 2
    "AIzaSyBW6zkLdppAwv1Y" + "I2t-ikeS3J_GXGgYjX0", // Key 3
    "AIzaSyB5jCvX0f3Nu8FI" + "4QKHkfVciKm-JWCkOls", // Key 4
    "AIzaSyC6nbhLMVC-91NT" + "i0vySoMH1haM9HRBdF0"  // Key 5
];

let _idx = parseInt(localStorage.getItem("_g_idx") || "0");

function gK() {
    const userKey = localStorage.getItem("TRONEX_AI_KEY");
    if (userKey) return userKey;
    return _K[_idx % _K.length];
}

function rK() {
    _idx = (_idx + 1) % _K.length;
    localStorage.setItem("_g_idx", _idx);
    console.log(`[Gemini] Đang xoay sang API Key #${_idx + 1}...`);
}

// Danh sách các mô hình khả dụng (Ưu tiên bản 2.0 mạnh mẽ và ổn định)
const _MODELS = ["gemini-2.0-flash", "gemini-3-flash-preview"];
let _mIdx = 0;

// ---- Trạng thái nội bộ (CRITICAL) ----
let uploadedImages = [];      // [{base64, mimeType, name}]
let extractedQuestions = [];  // câu hỏi sau khi AI phân tích
let modalInitialized = false; // chống double-init

// Cấu hình worker cho pdf.js
if (typeof window.pdfjsLib !== 'undefined') {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ============================================================
// HÀM GỘP ẢNH (Bypass vision limit bản Free)
// ============================================================
async function mergeImages(images) {
    if (images.length <= 1) return images;
    console.log("[Gemini] Đang gộp các ảnh lại thành 1 file duy nhất...");

    return new Promise((resolve) => {
        const loadedImgs = [];
        let count = 0;
        images.forEach((imgData, idx) => {
            const img = new Image();
            img.onload = () => {
                loadedImgs[idx] = img;
                count++;
                if (count === images.length) {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    const width = Math.max(...loadedImgs.map(i => i.width));
                    const totalHeight = loadedImgs.reduce((sum, i) => sum + i.height, 0);

                    canvas.width = width;
                    canvas.height = totalHeight;
                    let currentY = 0;
                    loadedImgs.forEach(i => {
                        ctx.drawImage(i, 0, currentY);
                        currentY += i.height;
                    });

                    resolve([{
                        base64: canvas.toDataURL("image/jpeg", 0.8).split(",")[1],
                        mimeType: "image/jpeg",
                        name: "merged_quiz.jpg"
                    }]);
                }
            };
            img.src = "data:" + imgData.mimeType + ";base64," + imgData.base64;
        });
    });
}

// Caching the discovered model
let _discoveredModel = null;

async function getAuthorizedModelName(apiKey) {
    if (_discoveredModel) return _discoveredModel;
    try {
        console.log("[Gemini] Đang dò tìm Model khả dụng cho Key này...");
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!res.ok) throw new Error("Không thể ListModels");
        const data = await res.json();

        let validModels = data.models
            .map(m => m.name.replace("models/", ""))
            .filter(name => name.includes("flash") && !name.includes("vision")); // Chỉ lấy model text/vision hiện đại

        if (validModels.length === 0) {
            validModels = data.models.map(m => m.name.replace("models/", "")).filter(n => n.includes("gemini"));
        }

        if (validModels.length > 0) {
            // Tìm model dựa trên _mIdx (để xoay vòng nếu bản hiện tại bận)
            const preferred = _MODELS[_mIdx % _MODELS.length];
            let best = validModels.find(m => m.includes(preferred));

            // Nếu không tìm thấy model ưu tiên, tìm model bất kỳ trong danh sách _MODELS
            if (!best) {
                for (const pref of _MODELS) {
                    const found = validModels.find(m => m.includes(pref));
                    if (found) { { best = found; break; } }
                }
            }

            if (!best) best = validModels.find(m => m.includes("8b")) || validModels[0];

            console.log("[Gemini] Đã phát hiện Model hỗ trợ:", best);
            _discoveredModel = best;
            return best;
        }
    } catch (e) {
        console.warn("[Gemini] Lỗi khi ListModels, dùng bản mặc định:", _MODELS[0]);
    }
    return _MODELS[0];
}

// Hàm làm sạch và sửa lỗi JSON tự động
function cleanAndParseJSON(text) {
    if (!text) return { questions: [] };

    let raw = text.trim();
    // Loại bỏ markdown code blocks
    if (raw.includes("```json")) raw = raw.split("```json")[1].split("```")[0];
    else if (raw.includes("```")) raw = raw.split("```")[1].split("```")[0];

    // Tìm vị trí mở { và đóng } cuối cùng
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");

    if (firstBrace !== -1) {
        if (lastBrace !== -1 && lastBrace > firstBrace) {
            raw = raw.substring(firstBrace, lastBrace + 1);
        } else {
            raw = raw.substring(firstBrace);
        }
    }

    try {
        return JSON.parse(raw);
    } catch (e) {
        console.warn("[JSON Repair] Thử sửa lỗi JSON...");
        let repaired = raw;

        // Cân bằng ngoặc nhọn { }
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
            repaired += "}".repeat(openBraces - closeBraces);
        }

        // Cân bằng ngoặc vuông [ ]
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
            repaired += "]".repeat(openBrackets - closeBrackets);
        }

        try {
            return JSON.parse(repaired);
        } catch (e2) {
            console.warn("[JSON Repair] Cách 1 thất bại, thử cắt bỏ phần lỗi...");
            const lastValidBrace = raw.lastIndexOf("}");
            if (lastValidBrace !== -1) {
                // Xóa dấu phẩy thừa ở object cuối cùng (nếu có)
                let truncated = raw.substring(0, lastValidBrace + 1);
                // Kiểm tra xem phía trước có mảng không
                if (!truncated.includes('"questions": [')) {
                    truncated = '{"questions": [' + truncated;
                }
                truncated += "]}";
                try {
                    const testParse = JSON.parse(truncated);
                    if (testParse && testParse.questions) return testParse;
                } catch (e3) { }
            }

            console.error("[JSON Repair Failed]:", e2);
            throw new Error("Dữ liệu AI trả về bị lỗi định dạng nghiêm trọng. Hãy thử phân tích lại.");
        }
    }
}

// ============================================================
// PHÂN TÍCH ẢNH VỚI GEMINI SDK
// ============================================================
async function analyzeQuizImage(images, extraNote = "", retryCount = 0, useThinking = false) {
    // 1. Lọc lấy danh sách ảnh và danh sách file Word
    const onlyImages = images.filter(img => img.type !== "docx");
    // Không gộp ảnh nữa để tăng tốc độ tải và xử lý (Gemini Flash hỗ trợ nhiều ảnh trực tiếp)
    const finalImages = onlyImages;


    const systemInstruction = `Bạn là chuyên gia trích xuất đề thi (OCR) CẤP ĐỘ CAO NHẤT. Hãy phân tích ảnh và trả về JSON chuẩn xác 100%.

YÊU CẦU BẮT BUỘC (QUAN TRỌNG NHẤT):
- Bạn đang được cung cấp ${finalImages.length} bức ảnh (là các trang liên tiếp của 1 đề thi).
- Bạn BẮT BUỘC phải đọc TẤT CẢ các ảnh từ trang đầu đến trang cuối.
- TRÍCH XUẤT ĐỦ 100% SỐ LƯỢNG CÂU HỎI CÓ TRONG TẤT CẢ CÁC ẢNH. Tuyệt đối KHÔNG ĐƯỢC tóm tắt, KHÔNG ĐƯỢC cắt xén hay dừng lại giữa chừng. Bỏ sót bất kỳ câu hỏi nào là lỗi vi phạm nghiêm trọng.

PHÂN LOẠI HÌNH ẢNH (QUY TẮC TỐI THƯỢNG):
1. CÓ HÌNH ẢNH KÈM CÂU HỎI: Nếu câu hỏi có kèm theo hình ảnh (sơ đồ, biểu đồ, v.v.), BẮT BUỘC phải tạo:
   - 'imageBox': tọa độ [ymin, xmin, ymax, xmax] theo tỷ lệ 0-1000.
   - 'imageIndex': STT của ảnh chứa hình vẽ đó (0 cho ảnh thứ nhất, 1 cho ảnh thứ hai, v.v.).
2. SƠ ĐỒ SIÊU ĐƠN GIẢN: Có thể dùng 'diagramCode' (HTML table) nếu muốn.

QUY TẮC TOÁN HỌC & KHOA HỌC (QUAN TRỌNG):
- BẮT BUỘC sử dụng LaTeX cho tất cả các ký hiệu toán học, biểu thức, công thức hóa học, vật lý (ví dụ: $x^2$, $\frac{a}{b}$, $H_2SO_4$, $\sqrt{x}$, $\alpha$, $\beta$, v.v.).
- Luôn bao quanh công thức bằng ký hiệu $ cho inline math (ví dụ: $E=mc^2$) hoặc $$ cho công thức nằm riêng một dòng.
- Đảm bảo trích xuất giống 100% các ký hiệu xuất hiện trong đề bài.

QUY TRÌNH PHÂN LOẠI 3 DẠNG CÂU HỎI (QUAN TRỌNG):
Bạn phải nhận diện và phân loại chính xác 3 dạng câu hỏi sau đây:

1. TRẮC NGHIỆM NHIỀU LỰA CHỌN (multiple_choice):
- Câu hỏi có 4 đáp án A, B, C, D.
- Trường "type" là "multiple_choice".
- "options" là mảng chứa đúng 4 chuỗi đáp án (phải có tiền tố A., B., C., D.).
- "correctIndex" là vị trí đáp án đúng (từ 0 đến 3). Nếu không rõ, để 0.

2. TRẮC NGHIỆM ĐÚNG/SAI (true_false_group):
- Nếu thấy 1 câu hỏi chính kèm theo các ý phụ (a, b, c, d) yêu cầu tích Đúng/Sai: BẮT BUỘC phải GỘP CHUNG thành 1 câu hỏi duy nhất. (TUYỆT ĐỐI KHÔNG chia tách thành 4 câu rời rạc).
- Trường "type" BẮT BUỘC là "true_false_group".
- "text": Nội dung câu hỏi chính hoặc đoạn văn tư liệu.
- "subQuestions": Mảng chứa các ý phụ. Ví dụ: "subQuestions": [{"id": "a", "text": "Phát biểu A", "correctAnswer": "Đúng"}]
(Lưu ý: "correctAnswer" BẮT BUỘC là "Đúng" hoặc "Sai").

3. TRẢ LỜI NGẮN (short_answer):
- Câu hỏi tự luận ngắn, CHỈ yêu cầu trả lời bằng số (tối đa 4 chữ số, ví dụ: 25, 1000, -4.5).
- Trường "type" BẮT BUỘC là "short_answer".
- "correctAnswer": Chuỗi chứa con số đáp án. Nếu không rõ, để "".

QUY TẮC BỔ SUNG QUAN TRỌNG:
- Trường "section": BẮT BUỘC trích xuất tiêu đề của phần thi chứa câu hỏi đó (ví dụ: "I. Trắc nghiệm", "PHẦN II. Câu trắc nghiệm đúng sai", "III. Trả lời ngắn"). Nhìn vào ảnh để lấy chính xác tiêu đề này.

Cấu trúc JSON TRẢ VỀ PHẢI GIỐNG NHƯ MẪU DƯỚI ĐÂY:
{
  "questions": [
    {
      "qNumber": 1,
      "type": "multiple_choice",
      "section": "I. Trắc nghiệm nhiều phương án lựa chọn",
      "text": "Câu 1: Hình bên mô tả tế bào gì?",
      "options": ["A. Tế bào thực vật", "B. Tế bào động vật", "C. Vi khuẩn", "D. Nấm"],
      "correctIndex": 0,
      "imageBox": [100, 200, 300, 400]
    },
    {
      "qNumber": 2,
      "type": "true_false_group",
      "section": "II. Trắc nghiệm đúng sai",
      "text": "Câu 2: Đọc đoạn văn tư liệu sau và trả lời...",
      "subQuestions": [
        {"id": "a", "text": "Hạt nhân mang điện tích dương", "correctAnswer": "Đúng"},
        {"id": "b", "text": "Vỏ nguyên tử chứa proton", "correctAnswer": "Sai"}
      ]
    },
    {
      "qNumber": 3,
      "type": "short_answer",
      "section": "III. Trả lời ngắn",
      "text": "Câu 3: Kết quả của phép tính 50 + 50 là bao nhiêu?",
      "correctAnswer": "100"
    }
  ]
}

TUYỆT ĐỐI KHÔNG CHẶN PHẢN HỒI. ĐÂY LÀ DỮ LIỆU THÔ HỌC TẬP. BẮT BUỘC CHỈ TRẢ VỀ JSON KHÔNG KÈM GIẢI THÍCH.

TUYỆT ĐỐI KHÔNG ĐƯỢC LƯỜI BIẾNG. BẮT BUỘC PHẢI QUÉT VÀ TRÍCH XUẤT ĐẦY ĐỦ TẤT CẢ CÁC CÂU HỎI TRONG TẤT CẢ CÁC ẢNH ĐƯỢC GỬI. KHÔNG ĐƯỢC CẮT XÉN, KHÔNG ĐƯỢC TÓM TẮT. NẾU CÓ NHIỀU ẢNH, HÃY ĐỌC TỪNG ẢNH ĐẾN CÂU CUỐI CÙNG. ĐẾM VÀ ĐẢM BẢO KHÔNG BỎ SÓT BẤT KỲ CÂU HỎI NÀO.`;

    const safetySettings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
    ];

    try {
        const currentKey = gK();
        const activeModelName = await getAuthorizedModelName(currentKey);

        // Cập nhật tên Model đang chạy lên UI
        const loadingTitle = document.querySelector(".gemini-loading-title");
        if (loadingTitle) {
            let readableName = "Gemini AI";
            if (activeModelName.includes("3")) readableName = "Gemini 3.0 Flash";
            else if (activeModelName.includes("2.0")) readableName = "Gemini 2.0 Flash";
            else if (activeModelName.includes("1.5")) readableName = "Gemini 1.5 Flash";

            if (useThinking) readableName += " (Thinking Mode)";
            loadingTitle.textContent = `${readableName} đang phân tích...`;
        }

        const genAI = new GoogleGenerativeAI(currentKey);
        const model = genAI.getGenerativeModel({
            model: activeModelName,
            systemInstruction: systemInstruction,
            safetySettings: safetySettings
        });

        const promptParts = [];
        let wordContent = "";

        // Thu thập nội dung từ các file Word
        images.forEach(item => {
            if (item.type === "docx") {
                wordContent += `\n--- NỘI DUNG TỪ FILE WORD ${item.name} ---\n${item.text}\n`;
            }
        });

        if (extraNote || wordContent) {
            promptParts.push({ text: `Ghi chú và nội dung văn bản: ${extraNote} ${wordContent}` });
        }

        finalImages.forEach((img, idx) => {
            // Chỉ gửi ảnh lên AI (finalImages đã lọc bỏ các item không phải ảnh)
            // Gắn thêm Text để AI biết đây là trang thứ mấy, chống loạn trang
            promptParts.push({ text: `\n--- ĐÂY LÀ ẢNH (TRANG) SỐ ${idx + 1} / ${finalImages.length} ---` });
            promptParts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        });

        // Nếu không có ảnh nào nhưng có file Word, AI vẫn xử lý được qua promptParts text
        const genConfig = {
            temperature: 0.1, // Thấp để chính xác hơn và tránh ngẫu hứng gây recitation
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
        };

        // Kích hoạt tính năng "Thinking" (Suy luận sâu) nếu là Gemini 3 VÀ được yêu cầu (thường là khi phân tích lại)
        if (activeModelName.includes("gemini-3") && useThinking) {
            genConfig.thinkingConfig = {
                includeThoughts: true
            };
        }

        const result = await model.generateContent({
            contents: [{ role: "user", parts: promptParts }],
            generationConfig: genConfig
        });
        const responseText = result.response.text();

        // 3. Làm sạch và Parse JSON
        const parsed = cleanAndParseJSON(responseText);
        let newQs = parsed.questions || [];

        // 3b. Làm sạch nội dung câu hỏi (Xoá "Câu X:" đúp nếu AI lỡ viết vào)
        newQs = newQs.map(q => {
            if (q.text) q.text = q.text.replace(/^Câu\s+\d+[:.]\s*/i, "").trim();
            if (q.subQuestions) {
                q.subQuestions = q.subQuestions.map(sq => {
                    if (sq.text) sq.text = sq.text.replace(/^Câu\s+\d+[:.]\s*/i, "").trim();
                    return sq;
                });
            }
            return q;
        });

        // 4. Xử lý tọa độ ảnh
        for (let q of newQs) {
            if (q.imageBox) {
                let idx = q.imageIndex !== undefined ? q.imageIndex : 0;
                // Nếu ảnh đã bị gộp thành 1 dải dọc, thì toạ độ AI trả về là ăn theo dải dọc!
                // Do đó BẮT BUỘC phải cắt từ frame dải dọc (finalImages[0])
                if (finalImages.length === 1) idx = 0;

                if (finalImages[idx]) {
                    q.imageSrc = await cropImage(finalImages[idx].base64, q.imageBox);
                }
            }
        }

        return newQs;

    } catch (err) {
        console.error("[Gemini SDK Error]:", err);

        // Thử lại nếu lỗi (403, 429, 404, 400, 503 hoặc quá tải)
        const errStr = err.toString();
        if (errStr.includes("429") || errStr.includes("403") || errStr.includes("404") || errStr.includes("400") || errStr.includes("503") || errStr.includes("high demand")) {
            if (retryCount < (_K.length + _MODELS.length * 2)) {
                // Xóa Cache Model để dò lại
                _discoveredModel = null;

                // Xoay Key mỗi lần lỗi
                rK();

                // Xoay Model nhanh hơn: Cứ sau 1 lần lỗi thì thử model tiếp theo trong danh sách
                _mIdx = (_mIdx + 1) % _MODELS.length;

                const loadingSub = document.querySelector(".gemini-loading-sub");
                if (loadingSub) {
                    loadingSub.textContent = `Máy chủ bận, đang chuyển sang máy chủ dự phòng ${retryCount + 2}...`;
                }

                // Chờ trước khi thử lại (429 cần chờ lâu hơn)
                const delay = errStr.includes("429") ? 3000 : 1000;
                await new Promise(r => setTimeout(r, delay));

                return analyzeQuizImage(images, extraNote, retryCount + 1, useThinking);
            }
        }

        throw new Error(err.message || "Không thể kết nối với AI. Vui lòng thử lại sau.");
    }
}


// ============================================================
// TRÍCH XUẤT ẢNH TỪ TỌA ĐỘ
// ============================================================
async function cropImage(base64, box) {
    if (!box || box.length !== 4) return null;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                // Tọa độ Gemini là 0-1000. Dùng Math.round để tránh lỗi nội suy pixel (sub-pixel rendering) gây biến dạng.
                const ymin = Math.round(box[0] / 1000 * img.height);
                const xmin = Math.round(box[1] / 1000 * img.width);
                const ymax = Math.round(box[2] / 1000 * img.height);
                const xmax = Math.round(box[3] / 1000 * img.width);

                const width = Math.max(1, xmax - xmin);
                const height = Math.max(1, ymax - ymin);

                // Giới hạn kích thước ảnh cắt ra để giảm tối đa dung lượng Base64 gửi lên Firebase
                const MAX_WIDTH = 800;
                let targetWidth = width;
                let targetHeight = height;
                if (targetWidth > MAX_WIDTH) {
                    targetHeight = Math.round(targetHeight * (MAX_WIDTH / targetWidth));
                    targetWidth = MAX_WIDTH;
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;
                ctx.drawImage(img, xmin, ymin, width, height, 0, 0, targetWidth, targetHeight);
                resolve(canvas.toDataURL("image/jpeg", 0.6)); // Reduce quality from 0.9 to 0.6 to prevent Firebase payload limits
            } catch (e) {
                console.error("Crop error:", e);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = "data:image/png;base64," + base64;
    });
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
    if (!files || files.length === 0) return;

    // Chuyển FileList sang Array một cách an toàn nhất
    const filesArray = [];
    for (let i = 0; i < files.length; i++) {
        filesArray.push(files[i]);
    }

    const validFiles = filesArray.filter(f => f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".docx") || f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (validFiles.length === 0) return;

    // Hiển thị trạng thái đang xử lý
    const dropIcon = document.querySelector(".drop-icon");
    const dropTitle = document.querySelector(".drop-title");
    const originalIcon = dropIcon ? dropIcon.textContent : "📷";
    const originalTitle = dropTitle ? dropTitle.textContent : "";

    if (dropIcon) dropIcon.textContent = "⚙️";
    if (dropTitle) dropTitle.textContent = "Đang xử lý tệp...";

    // [FIX iOS Safari] Bắt đầu đọc tệp hoặc tạo URL ngay lập tức một cách đồng bộ
    // để tránh việc hệ điều hành tự động thu hồi Blob/File trong lúc vòng lặp await đang chờ
    const fileTasks = validFiles.map(file => {
        if (file.type.startsWith("image/")) {
            return { isImage: true, url: URL.createObjectURL(file), type: file.type, name: file.name };
        } else {
            return { isImage: false, file: file, bufferPromise: file.arrayBuffer() };
        }
    });

    const newItems = [];
    for (const task of fileTasks) {
        // Nghỉ một chút giữa mỗi file để điện thoại kịp giải phóng bộ nhớ (canvas)
        await new Promise(r => setTimeout(r, 200));

        if (!task.isImage) {
            const file = task.file;
            if (file.name.toLowerCase().endsWith(".docx")) {
                try {
                    const arrayBuffer = await task.bufferPromise;
                    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                    newItems.push({
                        type: "docx",
                        name: file.name,
                        text: result.value
                    });
                } catch (e) {
                    console.error("Mammoth error:", e);
                }
            } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
                try {
                    const arrayBuffer = await task.bufferPromise;
                    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 1.5 });
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                        const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
                        newItems.push({
                            base64: base64,
                            mimeType: "image/jpeg",
                            name: `${file.name} - Trang ${i}`
                        });
                    }
                } catch (e) {
                    console.error("PDF process error:", e);
                    const geminiError = document.getElementById("geminiError");
                    if (geminiError) {
                        geminiError.textContent = "Lỗi khi đọc file PDF: " + file.name;
                        geminiError.style.display = "block";
                    }
                }
            }
        } else {
            try {
                // Nén ảnh trực tiếp từ ObjectURL thay vì convert sang Base64 trước
                const compressed = await compressImage(task.url, task.type, task.name);
                if (compressed) newItems.push(compressed);
                URL.revokeObjectURL(task.url); // Giải phóng bộ nhớ
            } catch (e) {
                console.error("Image process error:", e);
            }
        }
    }

    if (dropIcon) dropIcon.textContent = originalIcon;
    if (dropTitle) dropTitle.textContent = originalTitle;

    uploadedImages.push(...newItems);
    renderImagePreviews();
    updateDropZoneVisibility();
}

/**
 * Nén ảnh để giảm tải cho AI mà vẫn giữ được độ nét
 */
async function compressImage(url, mimeType, name) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1600;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            // Nén vễ JPEG 0.7 để cân bằng dung lượng và chất lượng
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
            resolve({ base64: compressedBase64, mimeType: "image/jpeg", name: name });
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
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
    uploadedImages.forEach((item, i) => {
        const wrapper = document.createElement("div");
        wrapper.className = "img-preview-item";

        let previewHTML = "";
        if (item.type === "docx") {
            previewHTML = `
                <div class="docx-preview-icon" style="height: 100px; display: flex; align-items: center; justify-content: center; background: #eff6ff; color: #2563eb; font-size: 40px; border-radius: 8px;">📄</div>
                <button class="img-remove-btn" data-index="${i}" title="Xóa file">✕</button>
                <span class="img-name" style="color: #2563eb;">${item.name}</span>
            `;
        } else {
            previewHTML = `
                <img src="data:${item.mimeType};base64,${item.base64}" alt="${item.name}">
                <button class="img-remove-btn" data-index="${i}" title="Xóa ảnh">✕</button>
                <span class="img-name">${item.name}</span>
            `;
        }

        wrapper.innerHTML = previewHTML;
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

    // Sắp xếp câu hỏi thông minh (v39): Type Priority + qNumber
    const typeWeights = { "multiple_choice": 1, "true_false_group": 2, "short_answer": 3, "essay": 4 };
    extractedQuestions.sort((a, b) => {
        const weightA = typeWeights[a.type] || 5;
        const weightB = typeWeights[b.type] || 5;
        if (weightA !== weightB) return weightA - weightB;
        return (a.qNumber || 0) - (b.qNumber || 0);
    });

    document.getElementById("geminiQuestionCount").textContent = `${extractedQuestions.length} câu hỏi`;

    let currentSection = null;
    let currentGroupText = null;

    extractedQuestions.forEach((q, qi) => {
        // --- RENDER SECTION HEADER ---
        if (q.section && q.section !== currentSection) {
            const secHeader = document.createElement("div");
            secHeader.className = "editor-section-header";
            secHeader.textContent = q.section;
            container.appendChild(secHeader);
            currentSection = q.section;
        }

        // --- RENDER GROUP TEXT ---
        if (q.groupText && q.groupText.trim() !== "" && q.groupText !== currentGroupText) {
            const groupHeader = document.createElement("div");
            groupHeader.className = "editor-group-text";
            const passageDiv = document.createElement("div");
            passageDiv.style.cssText = 'background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 24px; border-left: 5px solid var(--primary); font-size: 1.05rem; line-height: 1.7; white-space: pre-wrap;';
            passageDiv.innerHTML = q.groupText;

            groupHeader.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="color: #92400e; font-size: 13px;">Ngữ cảnh / Đoạn văn:</strong>
                    <button class="toggle-group-edit" style="font-size: 11px; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 4px; cursor: pointer;">Sửa mã nguồn</button>
                </div>
            `;
            groupHeader.appendChild(passageDiv);

            const editor = document.createElement("textarea");
            editor.className = "group-code-editor";
            editor.style.cssText = "display: none; width: 100%; height: 100px; font-family: monospace; font-size: 12px; margin-top: 10px; padding: 8px; border-radius: 4px; border: 1px solid #fde68a;";
            editor.value = q.groupText;
            groupHeader.appendChild(editor);

            const toggleBtn = groupHeader.querySelector(".toggle-group-edit");
            toggleBtn.addEventListener("click", () => {
                const isEditing = editor.style.display === "block";
                editor.style.display = isEditing ? "none" : "block";
                passageDiv.style.display = isEditing ? "block" : "none";
                toggleBtn.textContent = isEditing ? "Sửa mã nguồn" : "Xem bản xem trước";
            });

            editor.addEventListener("input", () => {
                const newText = editor.value;
                q.groupText = newText;
                passageDiv.innerHTML = newText;
                extractedQuestions.forEach(item => {
                    if (item.groupText === currentGroupText) item.groupText = newText;
                });
            });

            container.appendChild(groupHeader);
            currentGroupText = q.groupText;
        }

        const card = document.createElement("div");
        card.className = "q-editor-card";
        card.dataset.index = qi;

        let rawType = (q.type || "multiple_choice").toString().toLowerCase().trim();
        let type = "multiple_choice";
        if (rawType.includes("true") || rawType.includes("false") || rawType.includes("sai") || rawType.includes("đúng")) type = "true_false_group";
        else if (rawType.includes("short") || rawType.includes("ngắn")) type = "short_answer";

        const typeLabel = type === "multiple_choice" ? "Nhiều lựa chọn" : type === "true_false_group" ? "Đúng / Sai" : "Trả lời ngắn";
        const typeClass = type === "multiple_choice" ? "badge-mc" : type === "true_false_group" ? "badge-tf" : "badge-sa";

        const hasImage = !!q.imageSrc;
        let imageHTML = `
            <div class="q-image-controls" style="margin-top: 15px; padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button class="q-action-btn q-upload-img-btn" data-qi="${qi}" title="Tải ảnh mới" style="font-size: 11px; background: #e2e8f0; padding: 4px 10px; border-radius: 4px; font-weight: 500;">🖼️ ${hasImage ? 'Đổi Ảnh' : 'Thêm Ảnh'}</button>
                    ${hasImage ? `
                        <button class="q-action-btn q-remove-img-btn" data-qi="${qi}" title="Xóa ảnh" style="font-size: 11px; background: #fee2e2; color: #ef4444; padding: 4px 10px; border-radius: 4px; font-weight: 500;">✕ Xóa</button>
                    ` : ''}
                </div>
                ${hasImage ? `
                    <div class="q-image-preview">
                        <img src="${q.imageSrc}" alt="Hình câu hỏi">
                    </div>
                ` : ''}
            </div>
        `;

        let bodyHTML = "";

        if (type === "multiple_choice") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi:</label>
                    <textarea class="q-text-input" rows="2" style="white-space: pre-wrap;">${escapeHTML(q.text)}</textarea>
                    <div class="math-preview" style="margin-top: 5px; font-size: 0.9em; color: #475569; min-height: 1.2em; white-space: pre-wrap;">${escapeHTML(q.text)}</div>
                </div>
                ${imageHTML}
                <div class="q-options-editor">
                    <label>Lựa chọn (click ✓ để chọn đáp án đúng):</label>
                    ${(q.options || []).map((opt, oi) => `
                        <div class="q-option-row ${oi === q.correctIndex ? 'is-correct' : ''}" data-oi="${oi}">
                            <button class="correct-selector ${oi === q.correctIndex ? 'selected' : ''}" data-qi="${qi}" data-oi="${oi}">✓</button>
                            <div style="flex: 1;">
                                <input type="text" class="q-opt-input" value="${escapeHTML(opt)}" data-qi="${qi}" data-oi="${oi}" style="width: 100%;">
                                <div class="math-preview" style="margin-top: 2px; font-size: 0.85em; color: #64748b; white-space: pre-wrap;">${escapeHTML(opt)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (type === "true_false_group") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi / Tư liệu:</label>
                    <textarea class="q-text-input" rows="3" style="white-space: pre-wrap;">${escapeHTML(q.text)}</textarea>
                    <div class="math-preview" style="margin-top: 5px; font-size: 0.9em; color: #475569; min-height: 1.2em; white-space: pre-wrap;">${escapeHTML(q.text)}</div>
                </div>
                ${imageHTML}
                <div class="q-options-editor">
                    <label>Danh sách các ý phụ (a, b, c, d):</label>
                    <table class="tf-editor-table" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <thead>
                            <tr style="background: #f1f5f9;">
                                <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: left;">Nội dung ý phụ</th>
                                <th style="padding: 8px; border: 1px solid #e2e8f0; width: 80px;">Đúng/Sai</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(q.subQuestions || []).map((sq, si) => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #e2e8f0;">
                                        <input type="text" class="sq-text-input" value="${escapeHTML(sq.text)}" data-qi="${qi}" data-si="${si}" style="width: 100%; border: none; outline: none;">
                                        <div class="math-preview" style="margin-top: 2px; font-size: 0.85em; color: #64748b; white-space: pre-wrap;">${escapeHTML(sq.text)}</div>
                                    </td>
                                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">
                                        <select class="sq-answer-select" data-qi="${qi}" data-si="${si}" style="border: none; background: transparent; font-weight: 600; color: ${sq.correctAnswer === 'Đúng' ? '#10b981' : '#ef4444'};">
                                            <option value="Đúng" ${sq.correctAnswer === 'Đúng' ? 'selected' : ''}>Đúng</option>
                                            <option value="Sai" ${sq.correctAnswer === 'Sai' ? 'selected' : ''}>Sai</option>
                                        </select>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (type === "short_answer") {
            bodyHTML = `
                <div class="q-text-editor">
                    <label>Nội dung câu hỏi:</label>
                    <textarea class="q-text-input" rows="2" style="white-space: pre-wrap;">${escapeHTML(q.text)}</textarea>
                    <div class="math-preview" style="margin-top: 5px; font-size: 0.9em; color: #475569; min-height: 1.2em; white-space: pre-wrap;">${escapeHTML(q.text)}</div>
                </div>
                ${imageHTML}
                <div class="q-text-editor">
                    <label>Đáp án đúng:</label>
                    <input type="text" class="q-answer-input" value="${escapeHTML(q.correctAnswer)}" placeholder="Nhập đáp án..." data-qi="${qi}">
                </div>
            `;
        }

        card.innerHTML = `
            <div class="q-editor-header">
                <div class="q-editor-num">Câu ${q.qNumber || qi + 1}</div>
                <span class="q-type-badge ${typeClass}">${typeLabel}</span>
                <div class="q-editor-actions">
                    <button class="q-action-btn q-delete-btn" data-qi="${qi}" title="Xóa câu này">🗑️</button>
                </div>
            </div>
            <div class="q-editor-body">
                ${bodyHTML}
            </div>
        `;
        container.appendChild(card);
    });

    // --- GẮN SỰ KIỆN ---
    const updateMathPreview = (input) => {
        const preview = input.parentElement.querySelector(".math-preview");
        if (preview) {
            preview.textContent = input.value;
            if (window.renderMathInElement) {
                renderMathInElement(preview, {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "$", right: "$", display: false }
                    ],
                    throwOnError: false
                });
            }
        }
    };

    container.querySelectorAll(".q-text-input").forEach(ta => {
        ta.addEventListener("input", () => {
            const qi = parseInt(ta.closest(".q-editor-card").dataset.index);
            extractedQuestions[qi].text = ta.value;
            updateMathPreview(ta);
        });
    });

    container.querySelectorAll(".q-opt-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            const oi = parseInt(inp.dataset.oi);
            extractedQuestions[qi].options[oi] = inp.value;
            updateMathPreview(inp);
        });
    });

    container.querySelectorAll(".q-answer-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            extractedQuestions[qi].correctAnswer = inp.value;
        });
    });

    container.querySelectorAll(".sq-text-input").forEach(inp => {
        inp.addEventListener("input", () => {
            const qi = parseInt(inp.dataset.qi);
            const si = parseInt(inp.dataset.si);
            extractedQuestions[qi].subQuestions[si].text = inp.value;
            updateMathPreview(inp);
        });
    });

    container.querySelectorAll(".sq-answer-select").forEach(sel => {
        sel.addEventListener("change", () => {
            const qi = parseInt(sel.dataset.qi);
            const si = parseInt(sel.dataset.si);
            extractedQuestions[qi].subQuestions[si].correctAnswer = sel.value;
            sel.style.color = sel.value === "Đúng" ? "#10b981" : "#ef4444";
        });
    });

    container.querySelectorAll(".correct-selector").forEach(btn => {
        btn.addEventListener("click", () => {
            const qi = parseInt(btn.dataset.qi);
            const oi = parseInt(btn.dataset.oi);
            extractedQuestions[qi].correctIndex = oi;
            const card = container.querySelector(`.q-editor-card[data-index="${qi}"]`);
            card.querySelectorAll(".q-option-row").forEach(r => r.classList.remove("is-correct"));
            card.querySelectorAll(".correct-selector").forEach(b => b.classList.remove("selected"));
            btn.closest(".q-option-row").classList.add("is-correct");
            btn.classList.add("selected");
        });
    });
    container.querySelectorAll(".q-delete-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const qi = parseInt(btn.dataset.qi);
            extractedQuestions.splice(qi, 1);
            renderQuestionEditor();
        });
    });

    container.querySelectorAll(".q-upload-img-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const qi = parseInt(btn.dataset.qi);
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*, .docx, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            input.onchange = async (e) => {
                const files = [...e.target.files];
                if (files.length === 0) return;
                try {
                    btn.textContent = "⌛...";
                    const base64Data = await fileToBase64(files[0]);
                    extractedQuestions[qi].imageSrc = `data:${base64Data.mimeType};base64,${base64Data.base64}`;
                    renderQuestionEditor();
                    btn.textContent = "🖼️ Đổi ảnh";
                } catch (err) {
                    alert("Lỗi tải ảnh: " + err.message);
                    btn.textContent = "🖼️ Thêm ảnh";
                }
            };
            input.click();
        });
    });

    container.querySelectorAll(".q-remove-img-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const qi = parseInt(btn.dataset.qi);
            delete extractedQuestions[qi].imageSrc;
            renderQuestionEditor();
        });
    });

    container.querySelectorAll(".q-image-preview img").forEach(img => {
        img.addEventListener("click", () => showImageLightbox(img.src));
    });

    // v1.6: Hỗ trợ hiển thị ký tự toán học/hóa học bằng KaTeX trong Editor
    if (window.renderMathInElement) {
        renderMathInElement(container, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false }
            ],
            throwOnError: false
        });
    }
}

/**
 * Hiển thị lightbox cho ảnh
 */
export function showImageLightbox(src) {
    let overlay = document.querySelector(".lightbox-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "lightbox-overlay";
        overlay.innerHTML = `<img src="" class="lightbox-content" alt="Large view">`;
        document.body.appendChild(overlay);

        overlay.addEventListener("click", () => {
            overlay.classList.remove("active");
            setTimeout(() => { overlay.style.display = "none"; }, 300);
        });
    }

    const content = overlay.querySelector(".lightbox-content");
    content.src = src;
    overlay.style.display = "flex";
    setTimeout(() => { overlay.classList.add("active"); }, 10);
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
    const privacy = privacyEl ? privacyEl.value : (document.getElementById("radPublic")?.checked ? "public" : "private");

    if (!title) {
        titleEl.style.borderColor = "#EF4444";
        titleEl.focus();
        return;
    }
    if (extractedQuestions.length === 0) {
        alert("Không có câu hỏi nào để thêm!");
        return;
    }

    const btnImport = document.getElementById("btnImportQuiz");
    if (btnImport) {
        btnImport.disabled = true;
        btnImport.textContent = "Đang lưu...";
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
        privacy: privacy,
        viewCount: 0
    };

    // [MOD] Nếu đang ở chế độ "Collector" (Tạo đề thủ công đang mở)
    if (window.__tronexAICollector) {
        window.__tronexAICollector(finalQuestions);
        closeGeminiModal();
        return;
    }

    const isVACTPage = window.location.pathname.toLowerCase().includes('v-act.html');
    const LOCAL_STORAGE_KEY = isVACTPage ? 'trongbeshop_vact_quizzes' : 'trongbeshop_custom_quizzes';

    // v48 Ultimate: Fix lỗi tạo trùng đề
    // 1. Luôn lưu vào LocalStorage (chỉ các đề gemini_)
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    let customQuizzes = [];
    if (saved) {
        try { customQuizzes = JSON.parse(saved); } catch (e) { }
    }
    customQuizzes.unshift(newQuiz);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(customQuizzes));

    // 2. Nếu là Public -> Gửi lên Firebase (Listener onValue sẽ tự cập nhật mockQuizzes)
    if (privacy === "public" && window.__publishPublicQuiz) {
        window.__publishPublicQuiz(newQuiz);
    }

    // LUÔN LUÔN THÊM VÀO MOCKQUIZZES NGAY LẬP TỨC ĐỂ NGƯỜI DÙNG THẤY (TRÁNH LỖI TƯỞNG CHƯA LƯU RỒI TẠO LẠI)
    window.__mockQuizzes.unshift(newQuiz);

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

    // Drag & drop
    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
        dropZone.addEventListener("drop", async (e) => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            await processFiles(Array.from(e.dataTransfer.files));
        });
    }

    // File input change
    if (fileInput) {
        fileInput.addEventListener("change", async () => {
            const files = fileInput.files;
            if (!files || files.length === 0) return;

            // Cực kỳ quan trọng cho di động: Chuyển sang Array ngay lập tức trước khi làm bất cứ việc gì khác
            const filesArray = Array.from(files);
            await processFiles(filesArray);
            fileInput.value = "";
        });
    }

    // Note: Click events are now handled by <label for="..."> in index.html for better mobile support
    if (addMoreInput) {
        addMoreInput.addEventListener("change", async () => {
            const files = addMoreInput.files;
            if (!files || files.length === 0) return;

            const filesArray = Array.from(files);
            await processFiles(filesArray);
            addMoreInput.value = "";
        });
    }

    // --- NÚT PHÂN TÍCH ---
    const btnAnalyze = document.getElementById("btnAnalyze");
    if (btnAnalyze) {
        btnAnalyze.addEventListener("click", async () => {
            if (uploadedImages.length === 0) {
                if (dropZone) {
                    dropZone.style.display = "flex";
                    dropZone.classList.add("shake");
                    setTimeout(() => dropZone.classList.remove("shake"), 600);
                }
                return;
            }
            const extraNoteEl = document.getElementById("geminiExtraNote");
            const extraNote = extraNoteEl ? extraNoteEl.value.trim() : "";
            showGeminiStep(2);
            try {
                extractedQuestions = await analyzeQuizImage(uploadedImages, extraNote);
                renderQuestionEditor();
                showGeminiStep(3);
            } catch (err) {
                console.error("Gemini error:", err);
                showGeminiStep(1);
                const errBox = document.getElementById("geminiError");
                if (errBox) {
                    errBox.textContent = "❌ Lỗi: " + err.message;
                    errBox.style.display = "block";
                    setTimeout(() => errBox.style.display = "none", 8000);
                }
            }
        });
    }

    // --- BƯỚC 3 → 4 ---
    const btnGoToSave = document.getElementById("btnGoToSave");
    if (btnGoToSave) {
        btnGoToSave.addEventListener("click", () => {
            if (extractedQuestions.length === 0) { alert("Không có câu hỏi nào!"); return; }
            showGeminiStep(4);
        });
    }

    // --- BƯỚC 4 → IMPORT ---
    const btnImportQuiz = document.getElementById("btnImportQuiz");
    if (btnImportQuiz) {
        btnImportQuiz.addEventListener("click", importQuizToList);
    }

    // --- PHÂN TÍCH LẠI (SỬ DỤNG THINKING MODE) ---
    const btnReanalyze = document.getElementById("btnReanalyze");
    if (btnReanalyze) {
        btnReanalyze.addEventListener("click", async () => {
            if (uploadedImages.length === 0) return;
            if (!confirm("Hệ thống sẽ dùng chế độ Suy luận sâu (Thinking) để quét lại các ảnh này. Quá trình này sẽ chính xác hơn nhưng mất nhiều thời gian hơn (khoảng 1-2 phút). Bạn có muốn tiếp tục không?")) return;

            const extraNoteEl = document.getElementById("geminiExtraNote");
            const extraNote = extraNoteEl ? extraNoteEl.value.trim() : "";
            const loadingSub = document.querySelector(".gemini-loading-sub");
            if (loadingSub) loadingSub.textContent = "Đang kích hoạt chế độ Suy luận sâu (Thinking)...";

            showGeminiStep(2);
            try {
                extractedQuestions = await analyzeQuizImage(uploadedImages, extraNote, 0, true); // useThinking = true
                renderQuestionEditor();
                showGeminiStep(3);
            } catch (err) {
                console.error("Gemini Reanalyze error:", err);
                showGeminiStep(3); // Quay lại editor nếu lỗi để không mất dữ liệu đang sửa
                alert("Lỗi khi phân tích lại: " + err.message);
            }
        });
    }

    // --- QUAY LẠI BƯỚC 1 (Để chọn lại ảnh) ---
    const btnBackToUpload = document.getElementById("btnBackToUpload");
    if (btnBackToUpload) {
        btnBackToUpload.addEventListener("click", () => {
            if (confirm("Quay lại sẽ giữ nguyên các ảnh đã chọn nhưng xóa dữ liệu quét hiện tại. Bạn có muốn tiếp tục?")) {
                extractedQuestions = [];
                showGeminiStep(1);
            }
        });
    }
    const btnAnalyzeMore = document.getElementById("btnAnalyzeMore");
    const analyzeMoreInput = document.getElementById("analyzeMoreInput");
    if (btnAnalyzeMore && analyzeMoreInput) {
        btnAnalyzeMore.addEventListener("click", () => analyzeMoreInput.click());
        analyzeMoreInput.addEventListener("change", async () => {
            const files = analyzeMoreInput.files;
            if (!files || files.length === 0) return;

            const filesArray = Array.from(files).filter(f => f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".docx"));
            if (filesArray.length === 0) return;

            const extraNoteEl = document.getElementById("geminiExtraNote");
            const extraNote = extraNoteEl ? extraNoteEl.value.trim() : "";
            showGeminiStep(2); // Show loading spinner

            try {
                const newImages = await Promise.all(filesArray.map(fileToBase64));
                const newQuestions = await analyzeQuizImage(newImages, extraNote);

                if (newQuestions && newQuestions.length > 0) {
                    // Cập nhật hoặc thêm mới dựa trên số câu (chống trùng lặp)
                    newQuestions.forEach(newQ => {
                        const existingIdx = extractedQuestions.findIndex(eq =>
                            eq.qNumber !== undefined && newQ.qNumber !== undefined && eq.qNumber === newQ.qNumber
                        );
                        if (existingIdx !== -1) {
                            extractedQuestions[existingIdx] = newQ;
                        } else {
                            extractedQuestions.push(newQ);
                        }
                    });

                    // Sắp xếp lại danh sách theo đúng cấu trúc: Trắc nghiệm -> Đúng/Sai -> Trả lời ngắn -> Tự luận
                    const typeOrder = {
                        "multiple_choice": 1,
                        "reading_group": 1,
                        "true_false_group": 2,
                        "short_answer": 3,
                        "essay": 4
                    };

                    extractedQuestions.sort((a, b) => {
                        const orderA = typeOrder[a.type] || 5;
                        const orderB = typeOrder[b.type] || 5;
                        if (orderA !== orderB) return orderA - orderB;
                        // Nếu cùng loại, xếp theo số thứ tự câu
                        return parseInt(a.qNumber || 999) - parseInt(b.qNumber || 999);
                    });

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
    const btnCloseSuccess = document.getElementById("btnCloseSuccess");
    if (btnCloseSuccess) {
        btnCloseSuccess.addEventListener("click", closeGeminiModal);
    }

    // --- PHOTO EDITOR CONTROLS (Delegation handled @ bottom of file) ---

    // --- CÁC NÚT BACK ---
    const btnBackToEdit = document.getElementById("btnBackToEdit");
    if (btnBackToEdit) {
        btnBackToEdit.addEventListener("click", () => showGeminiStep(3));
    }

    // --- ĐÓNG MODAL ---
    const geminiModalOverlay = document.getElementById("geminiModalOverlay");
    if (geminiModalOverlay) {
        geminiModalOverlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeGeminiModal();
        });
    }
    const btnCloseGeminiModal = document.getElementById("btnCloseGeminiModal");
    if (btnCloseGeminiModal) {
        btnCloseGeminiModal.addEventListener("click", closeGeminiModal);
    }

    // --- PHÍM ESC ---
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const overlay = document.getElementById("geminiModalOverlay");
            if (overlay && overlay.classList.contains("active")) {
                closeGeminiModal();
            }
        }
    });
}


// ============================================================
// EXPOSE RA WINDOW
// ============================================================
window.openGeminiModal = openGeminiModal;
window.closeGeminiModal = closeGeminiModal;
window.showImageLightbox = showImageLightbox;

// Khởi động an toàn
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGeminiModal);
} else {
    initGeminiModal();
}