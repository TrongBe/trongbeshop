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
    // 2. Lấy danh sách API Keys (Hỗ trợ từ Vercel Env hoặc backup keys)
    let keys = [];

    // 1. Kiểm tra nếu có các biến đánh số: GEMINI_KEY_1, GEMINI_KEY_2, ... GEMINI_KEY_6
    const numberedKeys = Object.keys(process.env)
        .filter(k => /^GEMINI_(API_)?KEY_\d+$/i.test(k))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
            const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
            return numA - numB;
        })
        .map(k => process.env[k]?.trim())
        .filter(Boolean);

    if (numberedKeys.length > 0) {
        keys = numberedKeys;
    } else {
        // 2. Nếu không có đánh số, lấy từ GEMINI_API_KEYS hoặc GEMINI_API_KEY (phân cách bằng dấu phẩy)
        keys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
            .split(',')
            .map(k => k.trim())
            .filter(Boolean);
    }

    // 3. Nếu chưa cấu hình trên Vercel Dashboard, trả về thông báo hướng dẫn rõ ràng
    if (keys.length === 0) {
        return res.status(500).json({
            success: false,
            error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel Environment Variables. Vui lòng thêm biến môi trường trên Vercel Dashboard.'
        });
    }

    // 3. Trích xuất dữ liệu gửi lên từ Frontend
    const { 
        prompt, 
        systemInstruction, 
        history = [], // Lịch sử hội thoại multi-turn [{ role, parts }]
        model = 'gemini-3.5-flash',
        images = [] // Hỗ trợ upload ảnh/OCR nếu có [{ mimeType, data: base64 }]
    } = req.body || {};

    if (!prompt && (!images || images.length === 0)) {
        return res.status(400).json({
            success: false,
            error: 'Thiếu nội dung yêu cầu (cần ít nhất "prompt" hoặc "images").'
        });
    }

    // 4. Thiết lập Timeout kiểm soát (25 giây để không vượt quá trần 30s của Vercel Free)
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


    try {
        // 5. TỰ ĐỘNG XOAY VÒNG KEY NẾU GẶP LỖI HẾT QUOTA (429) HOẶC BẬN (503)
        let lastError = null;

        for (let kIdx = 0; kIdx < keys.length; kIdx++) {
            const apiKey = keys[kIdx];
            const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

            try {
                const googleResponse = await fetch(googleUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                const data = await googleResponse.json();

                // Nếu gặp lỗi (429 Quota hoặc 503 Quá tải) và vẫn còn key dự phòng -> Tự động thử key tiếp theo
                if (!googleResponse.ok) {
                    lastError = data.error?.message || `Lỗi HTTP ${googleResponse.status}`;
                    const isQuotaOrBusy = googleResponse.status === 429 || googleResponse.status === 503;

                    if (isQuotaOrBusy && kIdx < keys.length - 1) {
                        console.warn(`[Vercel API] Key #${kIdx + 1} bận/hết quota, tự động đổi sang Key #${kIdx + 2}...`);
                        continue;
                    }

                    clearTimeout(timeoutId);
                    return res.status(googleResponse.status).json({
                        success: false,
                        error: lastError,
                        code: googleResponse.status
                    });
                }

                // Thành công
                clearTimeout(timeoutId);
                const candidate = data.candidates?.[0];
                const text = candidate?.content?.parts?.[0]?.text || '';

                return res.status(200).json({
                    success: true,
                    text: text
                });

            } catch (fetchErr) {
                if (fetchErr.name === 'AbortError') throw fetchErr;
                lastError = fetchErr.message;
                if (kIdx < keys.length - 1) {
                    console.warn(`[Vercel API] Key #${kIdx + 1} gặp lỗi, thử Key #${kIdx + 2}...`);
                    continue;
                }
                throw fetchErr;
            }
        }

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
