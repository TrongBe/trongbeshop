// api/gemini.js - Vercel Serverless Function (Node.js)
// Bảo vệ Google Gemini API Key an toàn trên môi trường máy chủ

export default async function handler(req, res) {
    // 1. Chỉ chấp nhận HTTP POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({
            success: false,
            error: `Phương thức ${req.method} không được hỗ trợ. Vui lòng dùng POST.`
        });
    }

    // 2. Lấy API Key từ biến môi trường máy chủ Vercel
    // 2. Tự động lấy tất cả các biến môi trường có tiền tố GEMINI
    // Hỗ trợ mọi định dạng: GEMINI_API_1, GEMINI_API_2, GEMINI_API_KEY, GEMINI_KEY_1, GEMINI_API_KEYS...
    let keys = [];

    Object.keys(process.env)
        .filter(k => /^GEMINI/i.test(k))
        .sort()
        .forEach(k => {
            const val = process.env[k]?.trim();
            if (val) {
                val.split(',').map(s => s.trim()).filter(Boolean).forEach(keyStr => {
                    if (!keys.includes(keyStr)) keys.push(keyStr);
                });
            }
        });

    // 3. Nếu chưa cấu hình trên Vercel Dashboard, trả về thông báo hướng dẫn rõ ràng
    if (keys.length === 0) {
        return res.status(500).json({
            success: false,
            error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel Environment Variables. Vui lòng thêm biến môi trường trên Vercel Dashboard.'
        });
    }

    // 4. Trích xuất dữ liệu gửi lên từ Frontend
    const { 
        prompt, 
        systemInstruction, 
        history = [], // Lịch sử hội thoại multi-turn [{ role, parts }]
        model = 'gemini-3.1-flash-lite',
        images = [] // Hỗ trợ upload ảnh/OCR nếu có [{ mimeType, data: base64 }]
    } = req.body || {};

    if (!prompt && (!images || images.length === 0)) {
        return res.status(400).json({
            success: false,
            error: 'Thiếu nội dung yêu cầu (cần ít nhất "prompt" hoặc "images").'
        });
    }

    // 5. Thiết lập Timeout kiểm soát (25 giây để không vượt quá trần 30s của Vercel Free)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    // Xây dựng mảng parts cho tin nhắn hiện tại
    const currentParts = [];
    if (prompt) {
        currentParts.push({ text: prompt });
    }
    if (Array.isArray(images) && images.length > 0) {
        images.forEach(img => {
            if (img.data && img.mimeType) {
                currentParts.push({
                    inline_data: { mime_type: img.mimeType, data: img.data }
                });
            }
        });
    }

    // Xây dựng contents: lịch sử hội thoại + tin nhắn hiện tại
    const contents = [
        ...(Array.isArray(history) ? history : []),
        { role: 'user', parts: currentParts }
    ];

    const payload = { contents };

    if (systemInstruction) {
        payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    // Danh sách model ưu tiên (tự động thử model tiếp theo nếu gặp 503 Quá tải hoặc 404)
    const candidateModels = Array.from(new Set([
        model,
        'gemini-3.1-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-flash-latest',
        'gemini-3.8-flash',
        'gemini-3.5-flash'
    ].filter(Boolean)));

    try {
        let lastError = null;

        // Thử lần lượt các API key và candidate models nếu gặp lỗi (hết quota / quá tải 503 / 404 / 429)
        for (let kIdx = 0; kIdx < keys.length; kIdx++) {
            const apiKey = keys[kIdx];

            for (const currentModel of candidateModels) {
                const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`;

                try {
                    const googleResponse = await fetch(googleUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-goog-api-key': apiKey
                        },
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });

                    const data = await googleResponse.json().catch(() => ({}));

                    if (!googleResponse.ok) {
                        lastError = data.error?.message || `Lỗi HTTP ${googleResponse.status}`;
                        // Nếu model bị 404 hoặc 503 quá tải -> Thử model tiếp theo
                        if (googleResponse.status === 404 || googleResponse.status === 503) {
                            console.warn(`[Vercel API] Model ${currentModel} trả về ${googleResponse.status}, chuyển sang model tiếp theo...`);
                            continue;
                        }
                        // Nếu lỗi auth (400, 401, 403) hoặc rate limit (429) -> Thử API Key tiếp theo
                        console.warn(`[Vercel API] Key #${kIdx + 1} trả về HTTP ${googleResponse.status}, chuyển sang key tiếp theo...`);
                        break;
                    }

                    // Thành công!
                    clearTimeout(timeoutId);
                    const candidate = data.candidates?.[0];
                    const text = candidate?.content?.parts?.[0]?.text || '';

                    return res.status(200).json({
                        success: true,
                        text: text,
                        model: currentModel
                    });

                } catch (fetchErr) {
                    if (fetchErr.name === 'AbortError') throw fetchErr;
                    lastError = fetchErr.message;
                    // Lỗi mạng hoặc timeout của model này -> thử model tiếp theo
                    continue;
                }
            }
        }

        // Nếu tất cả các keys và models đều thất bại
        clearTimeout(timeoutId);
        return res.status(502).json({
            success: false,
            error: lastError || 'Tất cả API Key hoặc Model của Google Gemini đều đang bận hoặc quá tải. Vui lòng thử lại sau.'
        });

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            return res.status(504).json({
                success: false,
                error: 'Yêu cầu tới Gemini bị quá thời gian xử lý (Gateway Timeout).'
            });
        }

        console.error('[Server Error]:', error);
        return res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ nội bộ: ' + (error.message || 'Không xác định')
        });
    }
}
