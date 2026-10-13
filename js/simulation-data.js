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
        }
    }
];
