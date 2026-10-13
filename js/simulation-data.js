/**
 * simulation-data.js
 * Cấu trúc dữ liệu cho các Case Study trong tính năng Data Analyst Simulation
 */

export const simulationCases = [
    {
        id: "case_freeship_leak",
        title: "Lỗ hổng Freeship - Trục lợi Voucher vận chuyển",
        category: "E-Commerce Fraud",
        categoryLabel: "Thương Mại Điện Tử",
        difficulty: "medium", // "easy" | "medium" | "hard"
        difficultyLabel: "Trung bình",
        estimatedTime: "25 phút",
        techStack: ["SQL", "Pandas", "EDA"],
        badgeIcon: "🚚",
        shortDesc: "Phát hiện mạng lưới gian lận cố tình chia nhỏ đơn hàng dưới giá trị quy định để bòn rút ngân sách trợ giá vận chuyển 50 tỷ VNĐ của sàn.",
        fullContext: `
            <h3>Bối cảnh doanh nghiệp</h3>
            <p>Trong chiến dịch Mega Sale tháng 10, sàn TMĐT áp dụng chính sách <b>"Freeship 0đ cho đơn từ 99.000đ"</b> với mức hỗ trợ tối đa 30.000đ/đơn. Sau chiến dịch, phòng Tài chính phát hiện chi phí trợ giá vận chuyển vượt ngân sách <b>38%</b>, trong khi doanh thu ròng (GMV) chỉ tăng trưởng khiêm tốn 4%.</p>
            <p>Bạn vào vai Senior Data Analyst được giao nhiệm vụ điều tra các giao dịch bất thường để tìm ra nguyên nhân và nhóm đối tượng trục lợi chính sách.</p>
        `,
        objectives: [
            "Truy vấn phân bổ giá trị đơn hàng (AOV) trước và trong thời gian diễn ra chiến dịch.",
            "Xác định tỷ lệ đơn hàng tập trung sát ngưỡng 99.000đ - 105.000đ.",
            "Tìm top 5 Shop và IP người mua có tần suất nhận trợ giá freeship cao bất thường.",
            "Đo lường mức độ thiệt hại tài chính ước tính do lỗ hổng chính sách gây ra."
        ],
        schema: [
            {
                tableName: "orders",
                description: "Bảng dữ liệu giao dịch đơn hàng",
                columns: [
                    { name: "order_id", type: "VARCHAR", desc: "Mã định danh đơn hàng" },
                    { name: "shop_id", type: "VARCHAR", desc: "Mã định danh người bán" },
                    { name: "buyer_id", type: "VARCHAR", desc: "Mã định danh người mua" },
                    { name: "order_amount", type: "DECIMAL", desc: "Tổng giá trị hàng hoá (VNĐ)" },
                    { name: "shipping_subsidy", type: "DECIMAL", desc: "Tiền sàn hỗ trợ ship (VNĐ)" },
                    { name: "created_at", type: "DATETIME", desc: "Thời điểm đặt hàng" },
                    { name: "status", type: "VARCHAR", desc: "Trạng thái (COMPLETED, CANCELLED)" }
                ]
            },
            {
                tableName: "buyer_profiles",
                description: "Thông tin hồ sơ và thiết bị người mua",
                columns: [
                    { name: "buyer_id", type: "VARCHAR", desc: "Mã định danh người mua" },
                    { name: "ip_address", type: "VARCHAR", desc: "Địa chỉ IP khi đặt hàng" },
                    { name: "device_id", type: "VARCHAR", desc: "Mã phần cứng thiết bị" },
                    { name: "account_created_days", type: "INT", desc: "Tuổi tài khoản (ngày)" }
                ]
            }
        ],
        hints: [
            "Thử dùng GROUP BY với khoảng giá trị (Price Binning) từ 90k-100k, 100k-110k để xem độ nhọn của phân phối.",
            "So sánh tỷ lệ đơn vị giá ~99.000đ giữa các Shop có người mua trùng lặp Device/IP.",
            "Chú ý các tài khoản mới tạo dưới 3 ngày có hành vi đặt liên tiếp nhiều đơn trong 10 phút."
        ],
        defaultSql: `SELECT 
    CASE 
        WHEN order_amount < 99000 THEN 'Dưới 99k (Không Freeship)'
        WHEN order_amount BETWEEN 99000 AND 105000 THEN '99k - 105k (Cận ngưỡng Freeship)'
        WHEN order_amount BETWEEN 105001 AND 200000 THEN '105k - 200k'
        ELSE 'Trên 200k'
    END AS price_segment,
    COUNT(order_id) AS total_orders,
    SUM(shipping_subsidy) AS total_subsidy_vnd,
    ROUND(COUNT(order_id) * 100.0 / (SELECT COUNT(*) FROM orders), 2) AS percentage_orders
FROM orders
WHERE status = 'COMPLETED'
GROUP BY price_segment
ORDER BY total_orders DESC;`,
        solutionSql: `-- 1. Phân bổ AOV và tỷ lệ đơn hàng tập trung sát ngưỡng 99k - 105k
SELECT 
    CASE 
        WHEN order_amount < 99000 THEN 'Dưới 99k (Không Freeship)'
        WHEN order_amount BETWEEN 99000 AND 105000 THEN '99k - 105k (Cận ngưỡng Freeship)'
        WHEN order_amount BETWEEN 105001 AND 200000 THEN '105k - 200k'
        ELSE 'Trên 200k'
    END AS price_segment,
    COUNT(order_id) AS total_orders,
    SUM(shipping_subsidy) AS total_subsidy_loss,
    ROUND(COUNT(order_id) * 100.0 / (SELECT COUNT(*) FROM orders WHERE status = 'COMPLETED'), 2) AS percentage_orders
FROM orders
WHERE status = 'COMPLETED'
GROUP BY price_segment
ORDER BY total_orders DESC;

-- 2. Top 5 Shop và IP người mua có dấu hiệu trục lợi trợ giá freeship
SELECT 
    o.shop_id,
    b.ip_address,
    COUNT(o.order_id) AS suspicious_orders,
    SUM(o.shipping_subsidy) AS total_subsidy_loss
FROM orders o
JOIN buyer_profiles b ON o.buyer_id = b.buyer_id
WHERE o.order_amount BETWEEN 99000 AND 105000
  AND o.status = 'COMPLETED'
GROUP BY o.shop_id, b.ip_address
ORDER BY suspicious_orders DESC
LIMIT 5;

-- 3. Ước tính tổng thiệt hại tài chính do lỗ hổng chính sách freeship gây ra
SELECT 
    COUNT(order_id) AS total_suspicious_orders,
    SUM(shipping_subsidy) AS total_financial_damage_vnd,
    ROUND(AVG(order_amount), 0) AS avg_aov_vnd
FROM orders
WHERE order_amount BETWEEN 99000 AND 105000
  AND status = 'COMPLETED';`,
        defaultPython: `# Phân tích phân bổ giá trị đơn hàng với Pandas
import pandas as pd
import numpy as np

# Tạo bins phân loại đơn hàng
bins = [0, 99000, 105000, 200000, np.inf]
labels = ['< 99k', '99k-105k (Ngưỡng)', '105k-200k', '> 200k']
df['price_group'] = pd.cut(df['order_amount'], bins=bins, labels=labels)

summary = df.groupby('price_group').agg(
    order_count=('order_id', 'count'),
    total_subsidy=('shipping_subsidy', 'sum')
).reset_index()

print(summary)`,
        mockData: {
            headers: ["Phân khúc giá", "Số lượng đơn", "Tiền trợ giá (VNĐ)", "Tỷ lệ đơn hàng (%)"],
            rows: [
                ["99k - 105k (Cận ngưỡng Freeship)", "148,520", "4,455,600,000", "58.4%"],
                ["105k - 200k", "52,310", "1,569,300,000", "20.6%"],
                ["Trên 200k", "32,180", "965,400,000", "12.7%"],
                ["Dưới 99k (Không Freeship)", "21,120", "0", "8.3%"]
            ],
            chart: {
                type: "bar",
                title: "Phân bổ số lượng đơn hàng theo tầm giá",
                labels: ["< 99k", "99k - 105k (Bất thường)", "105k - 200k", "> 200k"],
                datasets: [
                    {
                        label: "Số lượng đơn hàng",
                        data: [21120, 148520, 52310, 32180],
                        backgroundColor: ["#94A3B8", "#EF4444", "#4F46E5", "#10B981"]
                    }
                ]
            }
        },
        mockDb: {
            orders: [
                { order_id: "ORD001", shop_id: "SH01", buyer_id: "B001", order_amount: 99500,  shipping_subsidy: 30000, created_at: "2026-10-01", status: "COMPLETED" },
                { order_id: "ORD002", shop_id: "SH01", buyer_id: "B002", order_amount: 101000, shipping_subsidy: 30000, created_at: "2026-10-01", status: "COMPLETED" },
                { order_id: "ORD003", shop_id: "SH02", buyer_id: "B003", order_amount: 250000, shipping_subsidy: 30000, created_at: "2026-10-01", status: "COMPLETED" },
                { order_id: "ORD004", shop_id: "SH03", buyer_id: "B004", order_amount: 75000,  shipping_subsidy: 0,     created_at: "2026-10-01", status: "COMPLETED" },
                { order_id: "ORD005", shop_id: "SH01", buyer_id: "B005", order_amount: 100000, shipping_subsidy: 30000, created_at: "2026-10-02", status: "COMPLETED" },
                { order_id: "ORD006", shop_id: "SH04", buyer_id: "B006", order_amount: 102500, shipping_subsidy: 30000, created_at: "2026-10-02", status: "COMPLETED" },
                { order_id: "ORD007", shop_id: "SH02", buyer_id: "B001", order_amount: 99800,  shipping_subsidy: 30000, created_at: "2026-10-02", status: "COMPLETED" },
                { order_id: "ORD008", shop_id: "SH01", buyer_id: "B007", order_amount: 150000, shipping_subsidy: 30000, created_at: "2026-10-03", status: "CANCELLED" },
                { order_id: "ORD009", shop_id: "SH03", buyer_id: "B008", order_amount: 99900,  shipping_subsidy: 30000, created_at: "2026-10-03", status: "COMPLETED" },
                { order_id: "ORD010", shop_id: "SH05", buyer_id: "B009", order_amount: 350000, shipping_subsidy: 30000, created_at: "2026-10-03", status: "COMPLETED" },
                { order_id: "ORD011", shop_id: "SH01", buyer_id: "B010", order_amount: 99200,  shipping_subsidy: 30000, created_at: "2026-10-04", status: "COMPLETED" },
                { order_id: "ORD012", shop_id: "SH06", buyer_id: "B002", order_amount: 99600,  shipping_subsidy: 30000, created_at: "2026-10-04", status: "COMPLETED" },
                { order_id: "ORD013", shop_id: "SH04", buyer_id: "B011", order_amount: 50000,  shipping_subsidy: 0,     created_at: "2026-10-05", status: "COMPLETED" },
                { order_id: "ORD014", shop_id: "SH02", buyer_id: "B003", order_amount: 200000, shipping_subsidy: 30000, created_at: "2026-10-05", status: "COMPLETED" },
                { order_id: "ORD015", shop_id: "SH01", buyer_id: "B004", order_amount: 100500, shipping_subsidy: 30000, created_at: "2026-10-05", status: "COMPLETED" }
            ],
            buyer_profiles: [
                { buyer_id: "B001", ip_address: "192.168.1.10", device_id: "DEV_A", account_created_days: 1 },
                { buyer_id: "B002", ip_address: "192.168.1.10", device_id: "DEV_A", account_created_days: 2 },
                { buyer_id: "B003", ip_address: "10.0.0.5",     device_id: "DEV_B", account_created_days: 120 },
                { buyer_id: "B004", ip_address: "10.0.0.5",     device_id: "DEV_C", account_created_days: 365 },
                { buyer_id: "B005", ip_address: "192.168.1.10", device_id: "DEV_A", account_created_days: 1 },
                { buyer_id: "B006", ip_address: "172.16.0.1",   device_id: "DEV_D", account_created_days: 90 },
                { buyer_id: "B007", ip_address: "172.16.0.2",   device_id: "DEV_E", account_created_days: 200 },
                { buyer_id: "B008", ip_address: "192.168.1.10", device_id: "DEV_A", account_created_days: 1 },
                { buyer_id: "B009", ip_address: "10.0.0.9",     device_id: "DEV_F", account_created_days: 500 },
                { buyer_id: "B010", ip_address: "192.168.1.10", device_id: "DEV_A", account_created_days: 2 },
                { buyer_id: "B011", ip_address: "192.168.2.50", device_id: "DEV_G", account_created_days: 45 }
            ]
        }
    },
    {
        id: "case_fake_orders_spike",
        title: "Ảo giác nổ đơn - Bẫy tăng trưởng GMV",
        category: "Growth & Retention",
        categoryLabel: "Tăng Trưởng & Bán Hàng",
        difficulty: "hard",
        difficultyLabel: "Nâng cao",
        estimatedTime: "35 phút",
        techStack: ["SQL", "Cohorts", "Funnel Analysis"],
        badgeIcon: "📈",
        shortDesc: "Đơn hàng tăng vọt 300% trong 2 tuần nhưng tỷ lệ hủy và hoàn tiền (Return/Refund) bùng nổ chạm mốc 72%, làm méo mó báo cáo gọi vốn của Startup.",
        fullContext: `
            <h3>Bối cảnh doanh nghiệp</h3>
            <p>Một chuỗi bán lẻ đa kênh vừa huy động vòng Series A với cam kết đạt 100.000 đơn/tháng. Đội ngũ Marketing công bố tăng trưởng thần tốc với số lượng đơn đặt hàng tăng gấp 3 lần trong đợt kích cầu cuối quý.</p>
            <p>Tuy nhiên, số liệu đối soát dòng tiền từ cổng thanh toán thực tế không khớp với báo cáo doanh thu. Bạn cần thực hiện phân tích phễu chuyển đổi và tỷ lệ hoàn tất giao dịch để bóc tách hiện tượng 'nổ đơn ảo'.</p>
        `,
        objectives: [
            "Tính toán tỷ lệ hoàn thành (Fulfillment Rate) thực tế so với tỷ lệ đặt hàng ban đầu.",
            "Phân tích vòng đời đơn hàng: Thời gian trung bình từ lúc đặt đến khi bấm Hủy đơn (Cancellation Lead Time).",
            "Nhận diện mô hình gian lận 'Tự đặt đơn cho chính mình' (Self-ordering loops) của các đại lý.",
            "Trực quan hoá phễu chuyển đổi từ Click -> Add to Cart -> Order -> Delivered -> Return."
        ],
        schema: [
            {
                tableName: "sales_pipeline",
                description: "Nhật ký phễu mua sắm của khách hàng",
                columns: [
                    { name: "session_id", type: "VARCHAR", desc: "Phiên duyệt web" },
                    { name: "event_type", type: "VARCHAR", desc: "Loại sự kiện (VIEW, CART, ORDER, CANCEL)" },
                    { name: "timestamp", type: "DATETIME", desc: "Thời điểm ghi nhận" }
                ]
            },
            {
                tableName: "fulfillment_logs",
                description: "Nhật ký xử lý kho vận và giao nhận",
                columns: [
                    { name: "order_id", type: "VARCHAR", desc: "Mã đơn hàng" },
                    { name: "delivery_status", type: "VARCHAR", desc: "Trạng thái (DELIVERED, RETURNED, REJECTED)" },
                    { name: "cancel_reason", type: "VARCHAR", desc: "Lý do hủy" }
                ]
            }
        ],
        hints: [
            "Kiểm tra xem bao nhiêu phần trăm đơn hàng bị hủy trong vòng chưa đầy 120 giây sau khi đặt.",
            "Đối chiếu địa chỉ giao hàng và thông tin thẻ tín dụng có trùng lặp với danh sách nhân viên nội bộ không.",
            "Vẽ biểu đồ đường so sánh giữa Total Orders Placed vs Net Completed Orders theo từng ngày."
        ],
        defaultSql: `SELECT 
    DATE(created_at) AS order_date,
    COUNT(order_id) AS gross_orders,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS net_completed_orders,
    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders,
    ROUND(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) * 100.0 / COUNT(order_id), 1) AS cancel_rate_pct
FROM sales_pipeline
GROUP BY DATE(created_at)
ORDER BY order_date ASC;`,
        solutionSql: `-- 1. Tỷ lệ hoàn thành (Fulfillment Rate) và tỷ lệ hủy theo ngày
SELECT 
    created_at AS order_date,
    COUNT(order_id) AS gross_orders,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS net_completed_orders,
    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders,
    ROUND(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) * 100.0 / COUNT(order_id), 1) AS cancel_rate_pct
FROM sales_pipeline
GROUP BY created_at
ORDER BY order_date ASC;

-- 2. Phân loại lý do hủy đơn để bóc tách hiện tượng 'nổ đơn ảo'
SELECT 
    COALESCE(cancel_reason, 'Hoàn tất') AS reason,
    COUNT(order_id) AS order_count,
    ROUND(COUNT(order_id) * 100.0 / (SELECT COUNT(*) FROM sales_pipeline), 1) AS pct_of_total
FROM sales_pipeline
GROUP BY reason
ORDER BY order_count DESC;`,
        defaultPython: `# Phân tích tỷ lệ hủy đơn theo ngày
import pandas as pd

df['order_date'] = pd.to_datetime(df['created_at']).dt.date
cohort = df.groupby('order_date')['status'].value_counts(normalize=True).unstack() * 100
print(cohort[['COMPLETED', 'CANCELLED']])`,
        mockData: {
            headers: ["Ngày", "Tổng đơn đặt", "Đơn hoàn tất thực tế", "Đơn bị hủy", "Tỷ lệ hủy (%)"],
            rows: [
                ["2026-10-01", "3,400", "2,980", "420", "12.4%"],
                ["2026-10-05", "4,150", "3,520", "630", "15.2%"],
                ["2026-10-10", "11,800", "3,650", "8,150", "69.1%"],
                ["2026-10-12", "14,920", "4,120", "10,800", "72.4%"]
            ],
            chart: {
                type: "line",
                title: "Đối chiếu Đơn đặt ban đầu vs Đơn hoàn tất thực tế",
                labels: ["01/10", "05/10", "10/10", "12/10"],
                datasets: [
                    {
                        label: "Tổng đơn đặt (Gross Orders)",
                        data: [3400, 4150, 11800, 14920],
                        borderColor: "#EF4444",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        fill: true
                    },
                    {
                        label: "Đơn hoàn tất thực (Net Completed)",
                        data: [2980, 3520, 3650, 4120],
                        borderColor: "#10B981",
                        backgroundColor: "transparent",
                        borderDash: [5, 5]
                    }
                ]
            }
        },
        mockDb: {
            sales_pipeline: [
                { session_id: "S001", order_id: "O001", created_at: "2026-10-01", status: "COMPLETED",  cancel_reason: null },
                { session_id: "S002", order_id: "O002", created_at: "2026-10-01", status: "COMPLETED",  cancel_reason: null },
                { session_id: "S003", order_id: "O003", created_at: "2026-10-01", status: "CANCELLED",  cancel_reason: "buyer_cancel" },
                { session_id: "S004", order_id: "O004", created_at: "2026-10-05", status: "COMPLETED",  cancel_reason: null },
                { session_id: "S005", order_id: "O005", created_at: "2026-10-05", status: "CANCELLED",  cancel_reason: "agent_fraud" },
                { session_id: "S006", order_id: "O006", created_at: "2026-10-05", status: "CANCELLED",  cancel_reason: "agent_fraud" },
                { session_id: "S007", order_id: "O007", created_at: "2026-10-10", status: "CANCELLED",  cancel_reason: "agent_fraud" },
                { session_id: "S008", order_id: "O008", created_at: "2026-10-10", status: "CANCELLED",  cancel_reason: "agent_fraud" },
                { session_id: "S009", order_id: "O009", created_at: "2026-10-10", status: "COMPLETED",  cancel_reason: null },
                { session_id: "S010", order_id: "O010", created_at: "2026-10-10", status: "CANCELLED",  cancel_reason: "self_order" },
                { session_id: "S011", order_id: "O011", created_at: "2026-10-12", status: "CANCELLED",  cancel_reason: "agent_fraud" },
                { session_id: "S012", order_id: "O012", created_at: "2026-10-12", status: "CANCELLED",  cancel_reason: "self_order" },
                { session_id: "S013", order_id: "O013", created_at: "2026-10-12", status: "COMPLETED",  cancel_reason: null },
                { session_id: "S014", order_id: "O014", created_at: "2026-10-12", status: "CANCELLED",  cancel_reason: "agent_fraud" },
                { session_id: "S015", order_id: "O015", created_at: "2026-10-12", status: "COMPLETED",  cancel_reason: null }
            ]
        }
    },
    {
        id: "case_voucher_abuse",
        title: "Lỗ hổng Khuyến mãi – Bắt quả tang \"Thợ săn Voucher\"",
        category: "Fraud Detection",
        categoryLabel: "Chống Gian Lận",
        difficulty: "medium",
        difficultyLabel: "Trung bình",
        estimatedTime: "30 phút",
        techStack: ["SQL", "Pandas", "EDA"],
        badgeIcon: "🎁",
        shortDesc: "Công ty tặng mã giảm giá 50K cho khách hàng có sinh nhật trong tháng. Doanh thu tháng 10 tăng vọt, nhưng số tài khoản khai sinh nhật tháng 10 cao bất thường. Nhiệm vụ: bắt quả tang kẻ tạo tài khoản ảo để trục lợi.",
        fullContext: `
            <h3>Bối cảnh doanh nghiệp</h3>
            <p>Để tri ân khách hàng, công ty áp dụng chính sách <b>"Quà sinh nhật – Voucher 50.000đ"</b>: mỗi tài khoản có ngày sinh trong tháng hiện tại sẽ tự động nhận một mã giảm giá 50K, áp dụng cho đơn hàng từ 200.000đ trở lên.</p>
            <p>Đến tháng 10/2026, nhóm Finance phát hiện <b>số lượng voucher sinh nhật được kích hoạt tăng đột biến 340%</b> so với tháng trước, gây thâm hụt ngân sách khuyến mãi nặng nề. Đặc biệt, tỷ lệ tài khoản có tháng sinh nhật là tháng 10 chiếm tới <b>41%</b> tổng cơ sở người dùng – một tỷ lệ phi thực tế.</p>
            <p>Bạn vào vai <b>Senior Fraud Analyst</b>, được giao toàn quyền truy cập dữ liệu tài khoản và giao dịch để xây dựng bộ tiêu chí nhận diện và danh sách đen các "Thợ săn Voucher".</p>
        `,
        objectives: [
            "Phân tích phân bổ tháng sinh nhật của toàn bộ người dùng – tìm tháng nào có tỷ lệ bất thường nhất.",
            "Lọc các tài khoản được tạo trong tháng 10/2026 và có sinh nhật khai báo cũng là tháng 10 (tạo tài khoản & nhận voucher ngay lập tức).",
            "Nhóm theo địa chỉ IP, số điện thoại, email domain để phát hiện các cụm tài khoản liên quan.",
            "Xác định tổng giá trị thiệt hại tài chính (số voucher 50K được dùng bởi tài khoản nghi ngờ gian lận).",
            "Đề xuất tiêu chí cứng để hệ thống tự động từ chối cấp voucher sinh nhật trong tương lai."
        ],
        schema: [
            {
                tableName: "customers",
                description: "Bảng hồ sơ khách hàng",
                columns: [
                    { name: "Ma_KH", type: "VARCHAR", desc: "Mã khách hàng duy nhất (PK)" },
                    { name: "Ngay_Tao_TK", type: "DATE", desc: "Ngày đăng ký tài khoản" },
                    { name: "Thang_Sinh_Nhat", type: "INT", desc: "Tháng sinh nhật đã khai báo (1–12)" },
                    { name: "So_Dien_Thoai", type: "VARCHAR", desc: "SĐT đăng ký (đã mã hoá 1 chiều)" },
                    { name: "Email_Domain", type: "VARCHAR", desc: "Tên miền email (gmail.com, ...)" },
                    { name: "IP_Dang_Ky", type: "VARCHAR", desc: "IP tại thời điểm đăng ký" }
                ]
            },
            {
                tableName: "voucher_usage",
                description: "Lịch sử sử dụng voucher sinh nhật",
                columns: [
                    { name: "Ma_Voucher", type: "VARCHAR", desc: "Mã voucher (PK)" },
                    { name: "Ma_KH", type: "VARCHAR", desc: "Khách hàng sử dụng (FK → customers)" },
                    { name: "Ngay_Su_Dung", type: "DATE", desc: "Ngày áp dụng voucher" },
                    { name: "Gia_Tri_Giam", type: "DECIMAL", desc: "Giá trị giảm giá thực tế (VNĐ)" },
                    { name: "Ma_Don_Hang", type: "VARCHAR", desc: "Đơn hàng được áp dụng" }
                ]
            },
            {
                tableName: "orders",
                description: "Bảng giao dịch đơn hàng",
                columns: [
                    { name: "Ma_Don_Hang", type: "VARCHAR", desc: "Mã đơn hàng (PK)" },
                    { name: "Ma_KH", type: "VARCHAR", desc: "Mã khách hàng (FK → customers)" },
                    { name: "Tong_Tien_Hang", type: "DECIMAL", desc: "Tổng giá trị hàng (VNĐ)" },
                    { name: "Trang_Thai", type: "VARCHAR", desc: "COMPLETED | CANCELLED | RETURNED" },
                    { name: "Ngay_Dat_Hang", type: "DATE", desc: "Ngày đặt hàng" }
                ]
            }
        ],
        hints: [
            "Bắt đầu bằng câu hỏi đơn giản: Phân bổ tháng sinh nhật có đều không? Nếu tháng 10 chiếm >10% thì đó là dấu hiệu đáng ngờ.",
            "Điều kiện đủ để nghi ngờ gian lận: Tài khoản tạo trong tháng 10 VÀ khai sinh nhật tháng 10 VÀ dùng voucher ngay trong tháng 10.",
            "Gom nhóm theo IP_Dang_Ky: Nếu một IP có >3 tài khoản khác nhau, đó gần như chắc chắn là tài khoản ảo.",
            "Cuối cùng, nhân số voucher gian lận với 50.000đ để ra con số thiệt hại tài chính ước tính."
        ],
        defaultSql: `-- Bước 1: Phân bổ tháng sinh nhật để phát hiện bất thường
SELECT
    Thang_Sinh_Nhat,
    COUNT(Ma_KH) AS so_tai_khoan,
    ROUND(COUNT(Ma_KH) * 100.0 / (SELECT COUNT(*) FROM customers), 2) AS ty_le_phan_tram
FROM customers
GROUP BY Thang_Sinh_Nhat
ORDER BY ty_le_phan_tram DESC;`,
        solutionSql: `-- 1. Phân bổ tháng sinh nhật phát hiện bất thường tháng 10
SELECT 
    Thang_Sinh_Nhat,
    COUNT(Ma_KH) AS so_tai_khoan,
    ROUND(COUNT(Ma_KH) * 100.0 / (SELECT COUNT(*) FROM customers), 2) AS ty_le_phan_tram
FROM customers
GROUP BY Thang_Sinh_Nhat
ORDER BY ty_le_phan_tram DESC;

-- 2. Cụm IP có số tài khoản sinh nhật tháng 10 bất thường
SELECT 
    IP_Dang_Ky,
    COUNT(Ma_KH) AS so_luong_tk_tao
FROM customers
WHERE Thang_Sinh_Nhat = 10
GROUP BY IP_Dang_Ky
ORDER BY so_luong_tk_tao DESC;

-- 3. Tổng thiệt hại tài chính voucher bị thợ săn kích hoạt
SELECT 
    COUNT(v.Ma_Voucher) AS so_voucher_da_dung,
    SUM(v.Gia_Tri_Giam) AS tong_thiet_hai_vnd
FROM voucher_usage v
JOIN customers c ON v.Ma_KH = c.Ma_KH
WHERE c.Thang_Sinh_Nhat = 10;`,
        defaultPython: `# Bước 1: Phân bổ tháng sinh nhật
import pandas as pd
import matplotlib.pyplot as plt

birthday_dist = df_customers['Thang_Sinh_Nhat'].value_counts(normalize=True).sort_index() * 100
print("Phân bổ tháng sinh nhật (%):")
print(birthday_dist.round(2))

# Cờ đỏ: Tháng nào có tỷ lệ > 12% là bất thường
suspicious_months = birthday_dist[birthday_dist > 12]
print("\\n--- Tháng bất thường ---")
print(suspicious_months)`,
        mockData: {
            headers: ["Tháng Sinh Nhật", "Số Tài Khoản", "Tỷ Lệ (%)"],
            rows: [
                ["Tháng 10 🚨", "41,230", "41.0%"],
                ["Tháng 1",  "3,820", "3.8%"],
                ["Tháng 3",  "3,710", "3.7%"],
                ["Tháng 6",  "3,650", "3.6%"],
                ["Tháng 7",  "3,590", "3.6%"],
                ["Tháng 12", "3,540", "3.5%"],
                ["(Các tháng còn lại)", "39,460", "39.8%"]
            ],
            chart: {
                type: "bar",
                title: "Phân bổ tháng sinh nhật khách hàng – Tháng 10 bất thường",
                labels: ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"],
                datasets: [
                    {
                        label: "Số tài khoản theo tháng sinh nhật",
                        data: [3820, 3480, 3710, 3420, 3380, 3650, 3590, 3470, 3510, 41230, 3450, 3540],
                        backgroundColor: [
                            "#4F46E5","#4F46E5","#4F46E5","#4F46E5","#4F46E5","#4F46E5",
                            "#4F46E5","#4F46E5","#4F46E5","#EF4444","#4F46E5","#4F46E5"
                        ]
                    }
                ]
            }
        },
        mentorFallbackHints: [
            "Hãy suy nghĩ về phân bổ xác suất: Nếu sinh nhật là ngẫu nhiên, mỗi tháng sẽ chiếm khoảng bao nhiêu % tổng số người dùng?",
            "Bạn đã nhìn thấy dữ liệu rồi. Câu hỏi tiếp theo là: Trong số 41K tài khoản sinh nhật tháng 10, bao nhiêu tài khoản CŨNG được tạo trong tháng 10?",
            "IP là chìa khoá vàng để gom cụm. Một người thật có thể có nhiều tài khoản không? Về lý thuyết – không nên. Vậy ngưỡng bao nhiêu tài khoản/IP là bất thường?",
            "Sau khi có danh sách nghi ngờ, đừng quên kiểm tra: Họ có thực sự dùng voucher không? Và đơn hàng đó có COMPLETED hay bị CANCELLED ngay sau đó?"
        ],
        mockDb: {
            customers: [
                { Ma_KH: "KH001", Ngay_Tao_TK: "2026-10-01", Thang_Sinh_Nhat: 10, So_Dien_Thoai: "hash_001", Email_Domain: "gmail.com",   IP_Dang_Ky: "192.168.5.10" },
                { Ma_KH: "KH002", Ngay_Tao_TK: "2026-10-01", Thang_Sinh_Nhat: 10, So_Dien_Thoai: "hash_002", Email_Domain: "gmail.com",   IP_Dang_Ky: "192.168.5.10" },
                { Ma_KH: "KH003", Ngay_Tao_TK: "2026-10-02", Thang_Sinh_Nhat: 10, So_Dien_Thoai: "hash_003", Email_Domain: "yahoo.com",   IP_Dang_Ky: "192.168.5.10" },
                { Ma_KH: "KH004", Ngay_Tao_TK: "2026-10-02", Thang_Sinh_Nhat: 10, So_Dien_Thoai: "hash_004", Email_Domain: "gmail.com",   IP_Dang_Ky: "192.168.5.10" },
                { Ma_KH: "KH005", Ngay_Tao_TK: "2025-03-15", Thang_Sinh_Nhat: 3,  So_Dien_Thoai: "hash_005", Email_Domain: "gmail.com",   IP_Dang_Ky: "10.0.0.20" },
                { Ma_KH: "KH006", Ngay_Tao_TK: "2025-06-20", Thang_Sinh_Nhat: 6,  So_Dien_Thoai: "hash_006", Email_Domain: "outlook.com", IP_Dang_Ky: "10.0.0.21" },
                { Ma_KH: "KH007", Ngay_Tao_TK: "2026-10-03", Thang_Sinh_Nhat: 10, So_Dien_Thoai: "hash_007", Email_Domain: "gmail.com",   IP_Dang_Ky: "192.168.5.10" },
                { Ma_KH: "KH008", Ngay_Tao_TK: "2024-01-10", Thang_Sinh_Nhat: 1,  So_Dien_Thoai: "hash_008", Email_Domain: "gmail.com",   IP_Dang_Ky: "172.16.1.5" },
                { Ma_KH: "KH009", Ngay_Tao_TK: "2026-10-04", Thang_Sinh_Nhat: 10, So_Dien_Thoai: "hash_009", Email_Domain: "tempmail.com",IP_Dang_Ky: "192.168.5.10" },
                { Ma_KH: "KH010", Ngay_Tao_TK: "2025-12-25", Thang_Sinh_Nhat: 12, So_Dien_Thoai: "hash_010", Email_Domain: "gmail.com",   IP_Dang_Ky: "10.0.0.50" }
            ],
            voucher_usage: [
                { Ma_Voucher: "VC001", Ma_KH: "KH001", Ngay_Su_Dung: "2026-10-01", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH001" },
                { Ma_Voucher: "VC002", Ma_KH: "KH002", Ngay_Su_Dung: "2026-10-01", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH002" },
                { Ma_Voucher: "VC003", Ma_KH: "KH003", Ngay_Su_Dung: "2026-10-02", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH003" },
                { Ma_Voucher: "VC004", Ma_KH: "KH004", Ngay_Su_Dung: "2026-10-02", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH004" },
                { Ma_Voucher: "VC005", Ma_KH: "KH005", Ngay_Su_Dung: "2026-03-15", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH005" },
                { Ma_Voucher: "VC006", Ma_KH: "KH007", Ngay_Su_Dung: "2026-10-03", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH007" },
                { Ma_Voucher: "VC007", Ma_KH: "KH009", Ngay_Su_Dung: "2026-10-04", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH009" }
            ],
            orders: [
                { Ma_Don_Hang: "DH001", Ma_KH: "KH001", Tong_Tien_Hang: 220000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-01" },
                { Ma_Don_Hang: "DH002", Ma_KH: "KH002", Tong_Tien_Hang: 250000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-01" },
                { Ma_Don_Hang: "DH003", Ma_KH: "KH003", Tong_Tien_Hang: 210000, Trang_Thai: "CANCELLED", Ngay_Dat_Hang: "2026-10-02" },
                { Ma_Don_Hang: "DH004", Ma_KH: "KH004", Tong_Tien_Hang: 300000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-02" },
                { Ma_Don_Hang: "DH005", Ma_KH: "KH005", Tong_Tien_Hang: 500000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-03-15" },
                { Ma_Don_Hang: "DH006", Ma_KH: "KH006", Tong_Tien_Hang: 150000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-06-20" },
                { Ma_Don_Hang: "DH007", Ma_KH: "KH007", Tong_Tien_Hang: 200000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-03" },
                { Ma_Don_Hang: "DH009", Ma_KH: "KH009", Tong_Tien_Hang: 220000, Trang_Thai: "CANCELLED", Ngay_Dat_Hang: "2026-10-04" }
            ]
        }
    }
];
