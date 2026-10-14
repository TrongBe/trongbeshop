/**
 * simulation-data.js
 * Cấu trúc dữ liệu cho các Case Study trong tính năng Data Analyst Simulation
 */

export const simulationCases = [
    {
        id: "case_best_sellers_eda",
        title: "Khám Phá Sức Mua – Top 5 Sản Phẩm Bán Chạy Nhất",
        category: "Retail & Sales Analytics",
        categoryLabel: "Phân Tích Bán Lẻ",
        difficulty: "easy",
        difficultyLabel: "Mới bắt đầu",
        estimatedTime: "10 - 15 phút",
        techStack: ["SQL Cơ Bản", "SELECT", "ORDER BY", "LIMIT"],
        badgeIcon: "🛍️",
        shortDesc: "Làm quen với kho dữ liệu bán lẻ: Trích xuất danh sách sản phẩm, xếp hạng Top 5 mặt hàng bán chạy nhất và phát hiện sản phẩm sắp hết hàng cần nhập gấp.",
        fullContext: `
            <h3>Bối cảnh doanh nghiệp</h3>
            <p>Chào mừng bạn gia nhập đội ngũ Data Analyst của chuỗi bán lẻ công nghệ và gia dụng thông minh! Trước thềm chiến dịch mua sắm cuối năm, Trưởng phòng Kinh doanh cần một bản phân tích nhanh về tình hình tiêu thụ sản phẩm trong quý vừa qua.</p>
            <p>Bạn được cung cấp bảng dữ liệu sản phẩm <code>products</code> chứa thông tin về đơn giá, số lượng đã bán, và số lượng hàng còn trong kho. Nhiệm vụ của bạn là trích xuất các thông tin bán chạy và gửi cảnh báo hàng sắp hết cho bộ phận Kho vận.</p>
        `,
        objectives: [
            "Làm sạch danh mục sản phẩm: Viết truy vấn loại trừ các bản ghi kiểm thử nội bộ (category != 'Hàng Thử Nghiệm') và xử lý dữ liệu tồn kho thiếu (NULL).",
            "Định vị sản phẩm 'Gánh team' (Revenue Drivers): Tìm Top 5 sản phẩm bán chạy nhất toàn sàn và đối chiếu xem sản phẩm nào đóng góp doanh thu (units_sold * unit_price) lớn nhất thực tế (tránh bẫy nhìn số lượng tưởng doanh thu cao).",
            "Cảnh báo nguy cơ đứt gãy chuỗi cung ứng (Stock-out Risk): Lọc danh sách các sản phẩm đóng góp doanh thu lớn nhưng tồn kho chạm mức báo động đỏ (< 20 cái) để đề xuất phòng Mua hàng kích hoạt đơn đặt khẩn cấp."
        ],
        schema: [
            {
                tableName: "products",
                description: "Danh mục sản phẩm và tình trạng tồn kho",
                columns: [
                    { name: "product_id", type: "VARCHAR", desc: "Mã sản phẩm (PK)" },
                    { name: "product_name", type: "VARCHAR", desc: "Tên sản phẩm" },
                    { name: "category", type: "VARCHAR", desc: "Ngành hàng (Lưu ý: Cần làm sạch dữ liệu bằng cách loại trừ 'Hàng Thử Nghiệm' hoặc tên chứa '[TEST]')" },
                    { name: "unit_price", type: "DECIMAL", desc: "Đơn giá niêm yết (VNĐ)" },
                    { name: "units_sold", type: "INT", desc: "Số lượng sản phẩm đã bán" },
                    { name: "stock_quantity", type: "INT", desc: "Số lượng tồn kho (Có thể có giá trị NULL do lỗi kiểm kê kho)" },
                    { name: "rating", type: "DECIMAL", desc: "Điểm đánh giá trung bình (1.0 - 5.0)" }
                ]
            }
        ],
        hints: [
            "Để loại bỏ hàng thử nghiệm: Dùng WHERE category != 'Hàng Thử Nghiệm' AND product_name NOT LIKE '%[TEST]%';",
            "Để xếp sản phẩm bán chạy nhất: Dùng ORDER BY units_sold DESC LIMIT 5;",
            "Để tính doanh thu theo ngành hàng: Dùng GROUP BY category và SUM(units_sold * unit_price) AS total_revenue;",
            "Để lọc hàng sắp hết: Dùng WHERE stock_quantity < 20 AND units_sold > 1000;"
        ],
        defaultSql: `-- Nhiệm vụ 1: Xem thử 5 sản phẩm đầu tiên sau khi loại bỏ hàng thử nghiệm
SELECT 
    product_name, 
    category, 
    unit_price, 
    units_sold, 
    stock_quantity 
FROM products 
WHERE category != 'Hàng Thử Nghiệm'
LIMIT 5;`,
        solutionSql: `-- 1. Top 5 sản phẩm bán chạy nhất (đã làm sạch dữ liệu kiểm thử)
SELECT 
    product_name, 
    category, 
    units_sold, 
    stock_quantity, 
    unit_price,
    (units_sold * unit_price) AS total_revenue_vnd
FROM products 
WHERE category != 'Hàng Thử Nghiệm'
ORDER BY units_sold DESC 
LIMIT 5;

-- 2. Tổng doanh thu thực tế theo từng ngành hàng
SELECT 
    category, 
    COUNT(product_id) AS total_products, 
    SUM(units_sold) AS total_units_sold, 
    SUM(units_sold * unit_price) AS total_revenue_vnd 
FROM products 
WHERE category != 'Hàng Thử Nghiệm'
GROUP BY category 
ORDER BY total_revenue_vnd DESC;

-- 3. Cảnh báo các sản phẩm có doanh thu cao nhưng tồn kho chạm mức báo động đỏ (< 20 cái)
SELECT 
    product_name, 
    category, 
    stock_quantity, 
    units_sold, 
    unit_price,
    (units_sold * unit_price) AS est_revenue_loss_if_stockout
FROM products 
WHERE category != 'Hàng Thử Nghiệm'
  AND stock_quantity < 20 
  AND units_sold > 1000 
ORDER BY stock_quantity ASC;`,
        defaultPython: `# Đọc dữ liệu sản phẩm, làm sạch và xem top 5 bán chạy
import pandas as pd

df = pd.DataFrame(data)
clean_df = df[df['category'] != 'Hàng Thử Nghiệm'].copy()
clean_df['revenue'] = clean_df['units_sold'] * clean_df['unit_price']
top_sellers = clean_df.sort_values(by='units_sold', ascending=False).head(5)
print(top_sellers[['product_name', 'category', 'units_sold', 'stock_quantity', 'revenue']])`,
        mockData: {
            headers: ["Tên sản phẩm", "Ngành hàng", "Đã bán (cái)", "Tồn kho (cái)", "Đơn giá (VNĐ)"],
            rows: [
                ["Cáp sạc bọc dù Type-C 1.2m", "Phụ Kiện Điện Thoại", "4,500", "25", "45,000"],
                ["Củ sạc nhanh GaN 65W Pro", "Phụ Kiện Điện Thoại", "3,100", "8 ⚠️", "220,000"],
                ["Áo thun thể thao Dry-Fit", "Thời Trang & Thể Thao", "2,800", "50", "150,000"],
                ["Tai nghe Bluetooth True Wireless", "Thiết Bị Số", "2,400", "15 ⚠️", "350,000"],
                ["Bình giữ nhiệt Inox 800ml", "Gia Dụng Thông Minh", "2,100", "18 ⚠️", "290,000"]
            ],
            chart: {
                type: "bar",
                title: "Top 5 Sản Phẩm Bán Chạy Nhất (Số lượng bán)",
                labels: ["Cáp sạc Type-C", "Củ sạc GaN 65W", "Áo thun Dry-Fit", "Tai nghe True Wireless", "Bình giữ nhiệt 800ml"],
                datasets: [
                    {
                        label: "Số lượng đã bán (Chiếc)",
                        data: [4500, 3100, 2800, 2400, 2100],
                        backgroundColor: ["#6366F1", "#10B981", "#3B82F6", "#F59E0B", "#EC4899"]
                    }
                ]
            }
        },
        mockDb: {
            products: [
                { product_id: "P001", product_name: "Cáp sạc bọc dù Type-C 1.2m", category: "Phụ Kiện Điện Thoại", unit_price: 45000, units_sold: 4500, stock_quantity: 25, rating: 4.6 },
                { product_id: "P002", product_name: "Củ sạc nhanh GaN 65W Pro", category: "Phụ Kiện Điện Thoại", unit_price: 220000, units_sold: 3100, stock_quantity: 8, rating: 4.9 },
                { product_id: "P003", product_name: "Áo thun thể thao Dry-Fit", category: "Thời Trang & Thể Thao", unit_price: 150000, units_sold: 2800, stock_quantity: 50, rating: 4.7 },
                { product_id: "P004", product_name: "Tai nghe Bluetooth True Wireless", category: "Thiết Bị Số", unit_price: 350000, units_sold: 2400, stock_quantity: 15, rating: 4.8 },
                { product_id: "P005", product_name: "Bình giữ nhiệt Inox 800ml", category: "Gia Dụng Thông Minh", unit_price: 290000, units_sold: 2100, stock_quantity: 18, rating: 4.9 },
                { product_id: "P006", product_name: "Chuột không dây Silent Click", category: "Thiết Bị Số", unit_price: 180000, units_sold: 1950, stock_quantity: 12, rating: 4.6 },
                { product_id: "P007", product_name: "Máy xay sinh tố cầm tay", category: "Gia Dụng Thông Minh", unit_price: 420000, units_sold: 1600, stock_quantity: 5, rating: 4.5 },
                { product_id: "P008", product_name: "Bàn phím cơ Tenkeyless RGB", category: "Thiết Bị Số", unit_price: 650000, units_sold: 1200, stock_quantity: 30, rating: 4.8 },
                { product_id: "P009", product_name: "Đèn học chống cận thông minh", category: "Gia Dụng Thông Minh", unit_price: 310000, units_sold: 920, stock_quantity: 60, rating: 4.6 },
                { product_id: "P010", product_name: "Nồi chiên không dầu 6L", category: "Gia Dụng Thông Minh", unit_price: 1200000, units_sold: 850, stock_quantity: 45, rating: 4.7 },
                { product_id: "P011", product_name: "Giá đỡ điện thoại livestream", category: "Phụ Kiện Điện Thoại", unit_price: 85000, units_sold: 1800, stock_quantity: null, rating: 4.4 },
                { product_id: "P999", product_name: "[TEST QC] Hàng mẫu kiểm thử nội bộ", category: "Hàng Thử Nghiệm", unit_price: 1000, units_sold: 9999, stock_quantity: 0, rating: null }
            ]
        }
    },
    {
        id: "case_vip_customer_retention",
        title: "Phân Hạng Khách Hàng VIP & Doanh Thu Theo Tỉnh Thành",
        category: "CRM & Growth",
        categoryLabel: "Khách Hàng & CRM",
        difficulty: "easy",
        difficultyLabel: "Mới bắt đầu",
        estimatedTime: "10 - 15 phút",
        techStack: ["SQL Cơ Bản", "WHERE", "GROUP BY", "AVG"],
        badgeIcon: "👑",
        shortDesc: "Lọc danh sách khách hàng VIP chi tiêu trên 5 triệu VNĐ để gửi quà tri ân cuối năm, đồng thời tìm ra thành phố có sức chi tiêu bình quân cao nhất.",
        fullContext: `
            <h3>Bối cảnh doanh nghiệp</h3>
            <p>Đội ngũ Marketing chuẩn bị triển khai chương trình tri ân khách hàng thân thiết nhân dịp kỷ niệm 5 năm thành lập. Ban Giám Đốc muốn gửi hộp quà đặc biệt cho tất cả khách hàng đạt hạng VIP (tổng chi tiêu tích lũy từ 5,000,000 VNĐ trở lên).</p>
            <p>Là một Data Analyst, bạn được giao nhiệm vụ trích xuất danh sách khách hàng VIP, thống kê tỷ lệ khách hàng theo từng thành phố (Hà Nội, TP.HCM, Đà Nẵng...) và tính toán mức chi tiêu trung bình để phân bổ ngân sách quà tặng hợp lý.</p>
        `,
        objectives: [
            "Làm sạch hồ sơ khách hàng: Loại trừ các tài khoản thử nghiệm nội bộ (membership_tier != 'TEST_INTERNAL') và xử lý dữ liệu địa phương bị thiếu (NULL).",
            "Bóc tách doanh thu thực tế theo tỉnh thành: Tính tổng số khách hàng thực và giá trị chi tiêu trung bình (AOV) của từng thành phố.",
            "Phân bổ ngân sách quà tặng khách VIP: Lọc danh sách khách hàng VIP chi tiêu từ 5.000.000 VNĐ trở lên và đề xuất cơ cấu phân bổ ngân sách quà tri ân công bằng giữa các khu vực."
        ],
        schema: [
            {
                tableName: "customers",
                description: "Hồ sơ khách hàng và lịch sử chi tiêu tích lũy",
                columns: [
                    { name: "customer_id", type: "VARCHAR", desc: "Mã định danh khách hàng (PK)" },
                    { name: "full_name", type: "VARCHAR", desc: "Họ và tên khách hàng" },
                    { name: "city", type: "VARCHAR", desc: "Tỉnh / Thành phố sinh sống (Có thể chứa giá trị NULL)" },
                    { name: "total_spent", type: "DECIMAL", desc: "Tổng tiền đã chi tiêu tích lũy (VNĐ)" },
                    { name: "total_orders", type: "INT", desc: "Tổng số đơn hàng đã đặt" },
                    { name: "membership_tier", type: "VARCHAR", desc: "Hạng thành viên (Standard, Silver, Gold, Diamond - Lưu ý: Loại trừ 'TEST_INTERNAL')" },
                    { name: "join_year", type: "INT", desc: "Năm tạo tài khoản" }
                ]
            }
        ],
        hints: [
            "Để loại bỏ tài khoản test nội bộ: Dùng WHERE membership_tier != 'TEST_INTERNAL' AND city IS NOT NULL;",
            "Lọc danh sách khách VIP: Dùng WHERE total_spent >= 5000000 AND membership_tier != 'TEST_INTERNAL' ORDER BY total_spent DESC;",
            "Dùng GROUP BY city và SUM(total_spent) để tính doanh thu theo từng thành phố;",
            "Dùng ROUND(AVG(total_spent), 0) để tính mức chi tiêu trung bình không bị số lẻ."
        ],
        defaultSql: `-- Nhiệm vụ 1: Lấy danh sách khách hàng VIP thực tế (loại bỏ dữ liệu test nội bộ)
SELECT 
    full_name, 
    city, 
    total_spent, 
    membership_tier 
FROM customers 
WHERE total_spent >= 5000000 
  AND membership_tier != 'TEST_INTERNAL'
ORDER BY total_spent DESC;`,
        solutionSql: `-- 1. Danh sách khách hàng VIP chi tiêu nhiều nhất (đã loại bỏ tài khoản test)
SELECT 
    full_name, 
    city, 
    total_spent, 
    total_orders, 
    membership_tier 
FROM customers 
WHERE total_spent >= 5000000 
  AND membership_tier != 'TEST_INTERNAL'
ORDER BY total_spent DESC;

-- 2. Thống kê khách hàng và tổng doanh thu theo Tỉnh/Thành phố
SELECT 
    city, 
    COUNT(customer_id) AS total_customers, 
    SUM(total_spent) AS total_revenue_vnd, 
    ROUND(AVG(total_spent), 0) AS avg_spent_per_customer 
FROM customers 
WHERE membership_tier != 'TEST_INTERNAL'
  AND city IS NOT NULL
GROUP BY city 
ORDER BY total_revenue_vnd DESC;

-- 3. Phân bổ số lượng khách hàng theo hạng thành viên thực tế
SELECT 
    membership_tier, 
    COUNT(customer_id) AS customer_count, 
    SUM(total_spent) AS tier_revenue_vnd, 
    ROUND(AVG(total_spent), 0) AS avg_spent_vnd 
FROM customers 
WHERE membership_tier != 'TEST_INTERNAL'
GROUP BY membership_tier 
ORDER BY avg_spent_vnd DESC;`,
        defaultPython: `# Phân tích chi tiêu khách hàng theo thành phố sau khi lọc dữ liệu test
import pandas as pd

df = pd.DataFrame(data)
clean_df = df[(df['membership_tier'] != 'TEST_INTERNAL') & (df['city'].notna())]
city_summary = clean_df.groupby('city')['total_spent'].agg(['count', 'sum', 'mean']).round(0)
print(city_summary)`,
        mockData: {
            headers: ["Họ tên", "Tỉnh / Thành phố", "Tổng chi tiêu (VNĐ)", "Số đơn", "Hạng thành viên"],
            rows: [
                ["Nguyễn Văn An", "TP. Hồ Chí Minh", "9,800,000", "24", "Diamond 💎"],
                ["Trần Thị Mai", "Hà Nội", "7,500,000", "18", "Diamond 💎"],
                ["Lê Hoàng Phúc", "Hà Nội", "5,900,000", "14", "Gold 🥇"],
                ["Phạm Hồng Ngọc", "TP. Hồ Chí Minh", "5,200,000", "12", "Gold 🥇"],
                ["Võ Minh Khôi", "Đà Nẵng", "5,100,000", "11", "Gold 🥇"]
            ],
            chart: {
                type: "pie",
                title: "Tỷ Trọng Doanh Thu Khách VIP Theo Tỉnh Thành",
                labels: ["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Hải Phòng", "Cần Thơ"],
                datasets: [
                    {
                        label: "Doanh thu (VNĐ)",
                        data: [16800000, 17200000, 8500000, 2900000, 2600000],
                        backgroundColor: ["#4F46E5", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6"]
                    }
                ]
            }
        },
        mockDb: {
            customers: [
                { customer_id: "C001", full_name: "Nguyễn Văn An", city: "TP. Hồ Chí Minh", total_spent: 9800000, total_orders: 24, membership_tier: "Diamond", join_year: 2024 },
                { customer_id: "C002", full_name: "Trần Thị Mai", city: "Hà Nội", total_spent: 7500000, total_orders: 18, membership_tier: "Diamond", join_year: 2024 },
                { customer_id: "C003", full_name: "Lê Hoàng Phúc", city: "Hà Nội", total_spent: 5900000, total_orders: 14, membership_tier: "Gold", join_year: 2025 },
                { customer_id: "C004", full_name: "Phạm Hồng Ngọc", city: "TP. Hồ Chí Minh", total_spent: 5200000, total_orders: 12, membership_tier: "Gold", join_year: 2025 },
                { customer_id: "C005", full_name: "Võ Minh Khôi", city: "Đà Nẵng", total_spent: 5100000, total_orders: 11, membership_tier: "Gold", join_year: 2024 },
                { customer_id: "C006", full_name: "Đỗ Gia Huy", city: "Hà Nội", total_spent: 3800000, total_orders: 8, membership_tier: "Silver", join_year: 2025 },
                { customer_id: "C007", full_name: "Bùi Thị Lan", city: "Đà Nẵng", total_spent: 3400000, total_orders: 7, membership_tier: "Silver", join_year: 2026 },
                { customer_id: "C008", full_name: "Hoàng Đức Anh", city: "Hải Phòng", total_spent: 2900000, total_orders: 5, membership_tier: "Silver", join_year: 2025 },
                { customer_id: "C009", full_name: "Đặng Thu Thảo", city: "Cần Thơ", total_spent: 2600000, total_orders: 6, membership_tier: "Silver", join_year: 2026 },
                { customer_id: "C010", full_name: "Lý Quốc Bảo", city: "TP. Hồ Chí Minh", total_spent: 1800000, total_orders: 3, membership_tier: "Standard", join_year: 2026 },
                { customer_id: "C998", full_name: "Tester_Bot_01", city: "Hà Nội", total_spent: 0, total_orders: 0, membership_tier: "Standard", join_year: null },
                { customer_id: "C999", full_name: "TEST_ADMIN_DEV", city: null, total_spent: 85000000, total_orders: 250, membership_tier: "TEST_INTERNAL", join_year: 2026 }
            ]
        }
    },
    {
        id: "case_order_delivery_qa",
        title: "Kiểm Toán Đơn Hàng & Tỷ Lệ Hoàn Tất Giao Nhận",
        category: "Operations & Delivery",
        categoryLabel: "Vận Hành & Giao Nhận",
        difficulty: "easy",
        difficultyLabel: "Mới bắt đầu",
        estimatedTime: "10 - 15 phút",
        techStack: ["SQL Cơ Bản", "COUNT", "SUM", "Tỷ lệ %"],
        badgeIcon: "📦",
        shortDesc: "Kiểm tra chất lượng dịch vụ giao hàng: Đo lường tỷ lệ giao thành công (Fulfillment Rate), và so sánh tốc độ giao của các đơn vị vận chuyển.",
        fullContext: `
            <h3>Bối cảnh doanh nghiệp</h3>
            <p>Khâu vận chuyển và giao nhận là huyết mạch quyết định sự hài lòng của khách hàng trên sàn TMĐT. Trong tuần lễ kích cầu mua sắm, Giám đốc Vận hành (COO) yêu cầu bộ phận Dữ liệu kiểm toán hiệu suất giao hàng của 4 đối tác vận chuyển lớn: SPX Express, Giao Hàng Nhanh (GHN), Viettel Post và J&T Express.</p>
            <p>Bạn cần tính toán tỷ lệ đơn hoàn tất giao thành công (Fulfillment Rate), số đơn bị huỷ/hoàn hàng, và thời gian giao hàng trung bình của từng đối tác để đề xuất phương án điều phối đơn hàng tối ưu.</p>
        `,
        objectives: [
            "Kiểm toán tỷ lệ giao nhận thành công thực tế (Net Fulfillment Rate %): Tính tỷ lệ đơn hoàn tất của từng đơn vị sau khi loại trừ các đơn hủy (CANCELLED) hoặc hoàn trả (RETURNED).",
            "Phân tích Trade-off giữa Chi phí cước vs Tốc độ giao hàng: So sánh thời gian giao trung bình (Lead Time) và chi phí cước của 4 đối tác để vạch trần bẫy 'ham cước rẻ nhưng giao chậm, tỷ lệ boom hàng cao'.",
            "Tái cơ cấu thị phần vận chuyển: Đề xuất phương án điều phối đơn hàng cụ thể: Cắt giảm hoặc phạt SLA đối tác nào, tăng tỷ trọng đối tác nào để tối ưu chi phí và độ hài lòng của khách."
        ],
        schema: [
            {
                tableName: "shipments",
                description: "Nhật ký vận đơn và hiệu suất giao nhận",
                columns: [
                    { name: "tracking_id", type: "VARCHAR", desc: "Mã vận đơn bưu kiện (PK)" },
                    { name: "order_id", type: "VARCHAR", desc: "Mã đơn hàng liên kết" },
                    { name: "carrier_name", type: "VARCHAR", desc: "Đơn vị vận chuyển (SPX Express, GHN, Viettel Post, J&T - Lưu ý: Loại trừ đơn vị kiểm thử 'INTERNAL_TEST')" },
                    { name: "shipping_fee", type: "DECIMAL", desc: "Cước phí vận chuyển (VNĐ)" },
                    { name: "delivery_days", type: "INT", desc: "Thời gian giao hàng (ngày) - Đơn hủy hoặc lỗi trả về NULL" },
                    { name: "status", type: "VARCHAR", desc: "Trạng thái giao hàng (COMPLETED, CANCELLED, RETURNED, FAILED - Chú ý: Cần lọc đúng status = 'COMPLETED' khi tính thời gian giao thực tế)" }
                ]
            }
        ],
        hints: [
            "Đếm số đơn theo trạng thái (loại trừ hàng test): Dùng WHERE carrier_name != 'INTERNAL_TEST' GROUP BY status;",
            "Tính thời gian giao trung bình cho đơn hoàn tất: Dùng ROUND(AVG(delivery_days), 1) WHERE status = 'COMPLETED' GROUP BY carrier_name;",
            "Lọc chỉ các đơn hoàn tất: WHERE status = 'COMPLETED' AND carrier_name != 'INTERNAL_TEST';"
        ],
        defaultSql: `-- Nhiệm vụ 1: Đếm số đơn theo từng trạng thái giao nhận (đã làm sạch đơn test)
SELECT 
    status, 
    COUNT(tracking_id) AS total_orders 
FROM shipments 
WHERE carrier_name != 'INTERNAL_TEST'
GROUP BY status;`,
        solutionSql: `-- 1. Tỷ lệ hoàn tất giao nhận thực tế (Net Fulfillment Rate)
SELECT 
    COUNT(tracking_id) AS total_shipments,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_orders,
    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders,
    SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) AS returned_orders,
    ROUND(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) * 100.0 / COUNT(tracking_id), 1) AS fulfillment_rate_pct
FROM shipments
WHERE carrier_name != 'INTERNAL_TEST';

-- 2. So sánh hiệu suất, tốc độ giao thực tế và tổng cước phí của từng đối tác
SELECT 
    carrier_name, 
    COUNT(tracking_id) AS total_orders, 
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_orders, 
    ROUND(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) * 100.0 / COUNT(tracking_id), 1) AS success_rate_pct,
    ROUND(AVG(CASE WHEN status = 'COMPLETED' THEN delivery_days ELSE NULL END), 1) AS avg_delivery_days, 
    SUM(shipping_fee) AS total_shipping_fee_vnd 
FROM shipments 
WHERE carrier_name != 'INTERNAL_TEST'
GROUP BY carrier_name 
ORDER BY completed_orders DESC;`,
        defaultPython: `# Tính tỷ lệ hoàn tất giao nhận sau khi lọc đơn test
import pandas as pd

df = pd.DataFrame(data)
clean_df = df[df['carrier_name'] != 'INTERNAL_TEST']
fulfillment = clean_df['status'].value_counts(normalize=True) * 100
print(fulfillment.round(1))`,
        mockData: {
            headers: ["Đơn vị vận chuyển", "Tổng đơn", "Giao thành công", "Thời gian TB (ngày)", "Tổng cước (VNĐ)"],
            rows: [
                ["SPX Express", "5", "5 (100%)", "1.6 ngày ⚡", "113,000"],
                ["GHN (Giao Hàng Nhanh)", "4", "4 (100%)", "1.8 ngày ⚡", "116,000"],
                ["Viettel Post", "4", "3 (75%)", "3.7 ngày", "104,000"],
                ["J&T Express", "2", "1 (50%)", "4.3 ngày", "48,000"]
            ],
            chart: {
                type: "bar",
                title: "Thời Gian Giao Hàng Trung Bình Theo Đơn Vị (Ngày)",
                labels: ["SPX Express", "GHN", "Viettel Post", "J&T Express"],
                datasets: [
                    {
                        label: "Số ngày giao trung bình",
                        data: [1.6, 1.8, 3.7, 4.3],
                        backgroundColor: ["#10B981", "#10B981", "#F59E0B", "#EF4444"]
                    }
                ]
            }
        },
        mockDb: {
            shipments: [
                { tracking_id: "TRK_001", order_id: "ORD_101", carrier_name: "SPX Express", shipping_fee: 22000, delivery_days: 1, status: "COMPLETED" },
                { tracking_id: "TRK_002", order_id: "ORD_102", carrier_name: "SPX Express", shipping_fee: 25000, delivery_days: 2, status: "COMPLETED" },
                { tracking_id: "TRK_003", order_id: "ORD_103", carrier_name: "GHN", shipping_fee: 28000, delivery_days: 2, status: "COMPLETED" },
                { tracking_id: "TRK_004", order_id: "ORD_104", carrier_name: "GHN", shipping_fee: 30000, delivery_days: 2, status: "COMPLETED" },
                { tracking_id: "TRK_005", order_id: "ORD_105", carrier_name: "Viettel Post", shipping_fee: 26000, delivery_days: 3, status: "COMPLETED" },
                { tracking_id: "TRK_006", order_id: "ORD_106", carrier_name: "SPX Express", shipping_fee: 22000, delivery_days: 1, status: "COMPLETED" },
                { tracking_id: "TRK_007", order_id: "ORD_107", carrier_name: "J&T Express", shipping_fee: 24000, delivery_days: 4, status: "RETURNED" },
                { tracking_id: "TRK_008", order_id: "ORD_108", carrier_name: "Viettel Post", shipping_fee: 26000, delivery_days: 4, status: "COMPLETED" },
                { tracking_id: "TRK_009", order_id: "ORD_109", carrier_name: "GHN", shipping_fee: 28000, delivery_days: 1, status: "COMPLETED" },
                { tracking_id: "TRK_010", order_id: "ORD_110", carrier_name: "J&T Express", shipping_fee: 24000, delivery_days: null, status: "CANCELLED" },
                { tracking_id: "TRK_011", order_id: "ORD_111", carrier_name: "SPX Express", shipping_fee: 22000, delivery_days: 2, status: "COMPLETED" },
                { tracking_id: "TRK_012", order_id: "ORD_112", carrier_name: "GHN", shipping_fee: 30000, delivery_days: 2, status: "COMPLETED" },
                { tracking_id: "TRK_013", order_id: "ORD_113", carrier_name: "Viettel Post", shipping_fee: 26000, delivery_days: 3, status: "COMPLETED" },
                { tracking_id: "TRK_014", order_id: "ORD_114", carrier_name: "J&T Express", shipping_fee: 24000, delivery_days: 4, status: "COMPLETED" },
                { tracking_id: "TRK_015", order_id: "ORD_115", carrier_name: "Viettel Post", shipping_fee: 26000, delivery_days: null, status: "CANCELLED" },
                { tracking_id: "TRK_016", order_id: "ORD_116", carrier_name: "J&T Express", shipping_fee: 24000, delivery_days: null, status: "CANCELLED" },
                { tracking_id: "TRK_999", order_id: "ORD_TEST_99", carrier_name: "INTERNAL_TEST", shipping_fee: 0, delivery_days: null, status: "FAILED" }
            ]
        }
    },
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
            "Phân tích phân bổ giỏ hàng (Basket Size Distribution): Phân khúc giá trị đơn hàng (Price Binning) để chứng minh hiện tượng dồn cục bất thường ngay tại mốc cận ngưỡng 99.000đ - 105.000đ (sau khi lọc sạch đơn hủy/hoàn).",
            "Điều tra mạng lưới gian lận liên bảng (Cross-table Fraud Investigation): Thực hiện JOIN bảng orders với buyer_profiles theo buyer_id để chứng minh hành vi trục lợi theo cụm: Tìm IP, Device ID và Shop ID đứng sau các đơn hàng cận 99k.",
            "Định lượng thất thoát & Đề xuất giải pháp kiểm soát rủi ro: Đo lường tổng số tiền sàn bị rút ruột và đề xuất 3 tầng rào chắn kỹ thuật (Account Age Threshold, Device Fingerprinting, Nâng ngưỡng đơn tối thiểu) kèm phân tích tác động tới người mua thật."
        ],
        schema: [
            {
                tableName: "orders",
                description: "Bảng dữ liệu giao dịch đơn hàng",
                columns: [
                    { name: "order_id", type: "VARCHAR", desc: "Mã định danh đơn hàng (PK)" },
                    { name: "shop_id", type: "VARCHAR", desc: "Mã định danh người bán" },
                    { name: "buyer_id", type: "VARCHAR", desc: "Mã định danh người mua" },
                    { name: "order_amount", type: "DECIMAL", desc: "Tổng giá trị hàng hoá (VNĐ)" },
                    { name: "shipping_subsidy", type: "DECIMAL", desc: "Tiền sàn hỗ trợ ship (VNĐ)" },
                    { name: "created_at", type: "DATETIME", desc: "Thời điểm đặt hàng" },
                    { name: "status", type: "VARCHAR", desc: "Trạng thái đơn (COMPLETED, CANCELLED, REFUNDED - Bắt buộc lọc status = 'COMPLETED' để không tính trùng trợ giá của các đơn bị hủy/hoàn)" }
                ]
            },
            {
                tableName: "buyer_profiles",
                description: "Thông tin hồ sơ và thiết bị người mua",
                columns: [
                    { name: "buyer_id", type: "VARCHAR", desc: "Mã định danh người mua" },
                    { name: "ip_address", type: "VARCHAR", desc: "Địa chỉ IP khi đặt hàng (Lưu ý: Cần loại trừ IP kiểm thử nội bộ 127.0.0.1)" },
                    { name: "device_id", type: "VARCHAR", desc: "Mã phần cứng thiết bị" },
                    { name: "account_created_days", type: "INT", desc: "Tuổi tài khoản (ngày)" }
                ]
            }
        ],
        hints: [
            "Thử dùng GROUP BY với khoảng giá trị (Price Binning) từ 90k-100k, 100k-110k sau khi lọc WHERE status = 'COMPLETED'.",
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
    ROUND(COUNT(order_id) * 100.0 / (SELECT COUNT(*) FROM orders WHERE status = 'COMPLETED'), 2) AS percentage_orders
FROM orders
WHERE status = 'COMPLETED'
GROUP BY price_segment
ORDER BY total_orders DESC;`,
        solutionSql: `-- 1. Phân bổ AOV và tỷ lệ đơn hàng tập trung sát ngưỡng 99k - 105k (đã làm sạch dữ liệu)
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

-- 2. Top 5 Shop và IP người mua có dấu hiệu trục lợi trợ giá freeship (JOIN 2 bảng)
SELECT 
    o.shop_id,
    b.ip_address,
    b.device_id,
    COUNT(o.order_id) AS suspicious_orders,
    SUM(o.shipping_subsidy) AS total_subsidy_loss
FROM orders o
JOIN buyer_profiles b ON o.buyer_id = b.buyer_id
WHERE o.order_amount BETWEEN 99000 AND 105000
  AND o.status = 'COMPLETED'
  AND b.ip_address != '127.0.0.1'
GROUP BY o.shop_id, b.ip_address, b.device_id
ORDER BY suspicious_orders DESC
LIMIT 5;

-- 3. Ước tính tổng thiệt hại tài chính thực tế do lỗ hổng chính sách freeship gây ra
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

# Lọc chỉ đơn COMPLETED
clean_orders = df[df['status'] == 'COMPLETED'].copy()

# Tạo bins phân loại đơn hàng
bins = [0, 99000, 105000, 200000, np.inf]
labels = ['< 99k', '99k-105k (Ngưỡng)', '105k-200k', '> 200k']
clean_orders['price_group'] = pd.cut(clean_orders['order_amount'], bins=bins, labels=labels)

summary = clean_orders.groupby('price_group').agg(
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
                { order_id: "ORD015", shop_id: "SH01", buyer_id: "B004", order_amount: 100500, shipping_subsidy: 30000, created_at: "2026-10-05", status: "COMPLETED" },
                { order_id: "ORD016", shop_id: "SH_TEST", buyer_id: "B_TEST", order_amount: 100000, shipping_subsidy: 30000, created_at: "2026-10-06", status: "CANCELLED" },
                { order_id: "ORD017", shop_id: "SH01", buyer_id: "B001", order_amount: 99000,  shipping_subsidy: 30000, created_at: "2026-10-06", status: "REFUNDED" },
                { order_id: "ORD018", shop_id: "SH05", buyer_id: "B012", order_amount: 450000, shipping_subsidy: 30000, created_at: "2026-10-06", status: "COMPLETED" }
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
                { buyer_id: "B011", ip_address: "192.168.2.50", device_id: "DEV_G", account_created_days: 45 },
                { buyer_id: "B012", ip_address: "10.0.0.99",    device_id: "DEV_H", account_created_days: 180 },
                { buyer_id: "B_TEST", ip_address: "127.0.0.1",   device_id: "DEV_TEST", account_created_days: 0 }
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
            "Bóc tách 'Ảo giác tăng trưởng' (Gross vs Net Orders): Đo lường tỷ lệ hoàn tất thực tế (Net Fulfillment Rate) và tỷ lệ hủy đơn theo từng ngày, loại bỏ dữ liệu kiểm thử hệ thống ('system_test').",
            "Truy vết nguyên nhân gốc rễ (Root Cause Analysis): Gom nhóm theo lý do hủy (cancel_reason) để vạch trần hành vi các đại lý tự đặt đơn ảo ('agent_fraud', 'self_order') nhằm gian lận KPI doanh số.",
            "Tái thiết lập bộ chỉ số quản trị rủi ro: Đề xuất thay thế chỉ số Gross GMV bằng Net Completed GMV và Cash-in Rate trong báo cáo quản trị và quan hệ nhà đầu tư (IR)."
        ],
        schema: [
            {
                tableName: "sales_pipeline",
                description: "Nhật ký phễu mua sắm của khách hàng",
                columns: [
                    { name: "session_id", type: "VARCHAR", desc: "Phiên duyệt web" },
                    { name: "order_id", type: "VARCHAR", desc: "Mã đơn hàng liên kết" },
                    { name: "created_at", type: "DATE", desc: "Ngày đặt đơn" },
                    { name: "status", type: "VARCHAR", desc: "Trạng thái đơn (COMPLETED, CANCELLED, FAILED - Cần phân biệt rõ Gross Orders vs Net Completed Orders)" },
                    { name: "cancel_reason", type: "VARCHAR", desc: "Lý do hủy đơn (agent_fraud, self_order, buyer_cancel, system_test - Cần loại trừ 'system_test')" }
                ]
            }
        ],
        hints: [
            "Kiểm tra xem bao nhiêu phần trăm đơn hàng bị hủy do hành vi gian lận (agent_fraud, self_order).",
            "Loại bỏ dữ liệu test hệ thống: WHERE cancel_reason != 'system_test' OR cancel_reason IS NULL.",
            "So sánh Total Orders Placed vs Net Completed Orders theo từng ngày để vạch trần số liệu ảo."
        ],
        defaultSql: `SELECT 
    created_at AS order_date,
    COUNT(order_id) AS gross_orders,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS net_completed_orders,
    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders,
    ROUND(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) * 100.0 / COUNT(order_id), 1) AS cancel_rate_pct
FROM sales_pipeline
WHERE cancel_reason != 'system_test' OR cancel_reason IS NULL
GROUP BY created_at
ORDER BY order_date ASC;`,
        solutionSql: `-- 1. Tỷ lệ hoàn thành thực tế (Net Fulfillment Rate) và tỷ lệ hủy theo ngày (đã loại trừ test)
SELECT 
    created_at AS order_date,
    COUNT(order_id) AS gross_orders,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS net_completed_orders,
    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders,
    ROUND(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) * 100.0 / COUNT(order_id), 1) AS cancel_rate_pct
FROM sales_pipeline
WHERE cancel_reason != 'system_test' OR cancel_reason IS NULL
GROUP BY created_at
ORDER BY order_date ASC;

-- 2. Phân loại nguyên nhân gốc rễ dẫn đến bùng nổ hủy đơn (Root Cause)
SELECT 
    COALESCE(cancel_reason, 'Hoàn tất giao dịch') AS reason,
    COUNT(order_id) AS order_count,
    ROUND(COUNT(order_id) * 100.0 / (SELECT COUNT(*) FROM sales_pipeline WHERE cancel_reason != 'system_test' OR cancel_reason IS NULL), 1) AS pct_of_total
FROM sales_pipeline
WHERE cancel_reason != 'system_test' OR cancel_reason IS NULL
GROUP BY reason
ORDER BY order_count DESC;`,
        defaultPython: `# Phân tích tỷ lệ hủy đơn theo ngày sau khi loại trừ test hệ thống
import pandas as pd

clean_pipeline = df[df['cancel_reason'] != 'system_test'].copy()
cohort = clean_pipeline.groupby('created_at')['status'].value_counts(normalize=True).unstack() * 100
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
                { session_id: "S015", order_id: "O015", created_at: "2026-10-12", status: "COMPLETED",  cancel_reason: null },
                { session_id: "S_TEST_01", order_id: "O_TEST_01", created_at: "2026-10-01", status: "FAILED", cancel_reason: "system_test" },
                { session_id: "S_TEST_02", order_id: "O_TEST_02", created_at: "2026-10-10", status: "CANCELLED", cancel_reason: "system_test" }
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
            "Kiểm toán độ lệch phân bổ xác suất (Probability & Distribution Audit): Phân tích phân bổ tháng sinh nhật của toàn bộ tập khách hàng để chứng minh sự bất thường toán học của tháng 10 (41% so với mức ngẫu nhiên 8.3%).",
            "Điều tra liên bảng bóc trần đường dây săn voucher (Cross-table Fraud Investigation): JOIN 3 bảng customers, voucher_usage, orders để cô lập các tài khoản vừa tạo trong tháng 10, khai sinh nhật tháng 10, dùng chung IP và tên miền email rác (tempmail.com).",
            "Đo lường thiệt hại ròng & Thiết kế chính sách chống lạm dụng: Tính toán chính xác số tiền thất thoát thực tế sau khi lọc bỏ đơn hủy/hoàn (Trang_Thai = 'COMPLETED') và đề xuất chính sách sinh nhật chặt chẽ (yêu cầu thâm niên tài khoản > 60 ngày, có ít nhất 1 đơn thành công trước đó)."
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
                    { name: "Email_Domain", type: "VARCHAR", desc: "Tên miền email (Lưu ý phát hiện các domain email rác như tempmail.com hoặc tài khoản test nội bộ)" },
                    { name: "IP_Dang_Ky", type: "VARCHAR", desc: "IP tại thời điểm đăng ký (Lưu ý loại trừ IP test 127.0.0.1)" }
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
                    { name: "Ma_Don_Hang", type: "VARCHAR", desc: "Đơn hàng được áp dụng (FK → orders)" }
                ]
            },
            {
                tableName: "orders",
                description: "Bảng giao dịch đơn hàng",
                columns: [
                    { name: "Ma_Don_Hang", type: "VARCHAR", desc: "Mã đơn hàng (PK)" },
                    { name: "Ma_KH", type: "VARCHAR", desc: "Mã khách hàng (FK → customers)" },
                    { name: "Tong_Tien_Hang", type: "DECIMAL", desc: "Tổng giá trị hàng (VNĐ)" },
                    { name: "Trang_Thai", type: "VARCHAR", desc: "COMPLETED | CANCELLED | REFUNDED (Bắt buộc lọc Trang_Thai = 'COMPLETED' để không tính trùng đơn hủy/hoàn)" },
                    { name: "Ngay_Dat_Hang", type: "DATE", desc: "Ngày đặt hàng" }
                ]
            }
        ],
        hints: [
            "Bắt đầu bằng câu hỏi đơn giản: Phân bổ tháng sinh nhật có đều không? Nếu tháng 10 chiếm >10% thì đó là dấu hiệu đáng ngờ.",
            "Điều kiện đủ để nghi ngờ gian lận: Tài khoản tạo trong tháng 10 VÀ khai sinh nhật tháng 10 VÀ dùng voucher ngay trong tháng 10.",
            "Gom nhóm theo IP_Dang_Ky: Nếu một IP có >3 tài khoản khác nhau, đó gần như chắc chắn là cụm tài khoản ảo.",
            "Cuối cùng, JOIN với bảng orders để lọc Trang_Thai = 'COMPLETED' nhằm xác định chính xác số tiền thiệt hại thực tế."
        ],
        defaultSql: `-- Bước 1: Phân bổ tháng sinh nhật để phát hiện bất thường
SELECT
    Thang_Sinh_Nhat,
    COUNT(Ma_KH) AS so_tai_khoan,
    ROUND(COUNT(Ma_KH) * 100.0 / (SELECT COUNT(*) FROM customers WHERE IP_Dang_Ky != '127.0.0.1'), 2) AS ty_le_phan_tram
FROM customers
WHERE IP_Dang_Ky != '127.0.0.1'
GROUP BY Thang_Sinh_Nhat
ORDER BY ty_le_phan_tram DESC;`,
        solutionSql: `-- 1. Phân bổ tháng sinh nhật phát hiện bất thường tháng 10 (đã loại trừ test IP)
SELECT 
    Thang_Sinh_Nhat,
    COUNT(Ma_KH) AS so_tai_khoan,
    ROUND(COUNT(Ma_KH) * 100.0 / (SELECT COUNT(*) FROM customers WHERE IP_Dang_Ky != '127.0.0.1'), 2) AS ty_le_phan_tram
FROM customers
WHERE IP_Dang_Ky != '127.0.0.1'
GROUP BY Thang_Sinh_Nhat
ORDER BY ty_le_phan_tram DESC;

-- 2. Cụm IP có số tài khoản sinh nhật tháng 10 bất thường
SELECT 
    IP_Dang_Ky,
    COUNT(Ma_KH) AS so_luong_tk_tao
FROM customers
WHERE Thang_Sinh_Nhat = 10
  AND IP_Dang_Ky != '127.0.0.1'
GROUP BY IP_Dang_Ky
ORDER BY so_luong_tk_tao DESC;

-- 3. Tổng thiệt hại tài chính thực tế (JOIN 3 bảng: voucher_usage, customers, orders và lọc Trang_Thai = 'COMPLETED')
SELECT 
    COUNT(v.Ma_Voucher) AS so_voucher_da_dung,
    SUM(v.Gia_Tri_Giam) AS tong_thiet_hai_vnd,
    SUM(CASE WHEN o.Trang_Thai = 'COMPLETED' THEN v.Gia_Tri_Giam ELSE 0 END) AS thiet_hai_thuc_te_don_thanh_cong_vnd
FROM voucher_usage v
JOIN customers c ON v.Ma_KH = c.Ma_KH
JOIN orders o ON v.Ma_Don_Hang = o.Ma_Don_Hang
WHERE c.Thang_Sinh_Nhat = 10
  AND c.IP_Dang_Ky != '127.0.0.1';`,
        defaultPython: `# Bước 1: Phân bổ tháng sinh nhật
import pandas as pd

clean_customers = df_customers[df_customers['IP_Dang_Ky'] != '127.0.0.1']
birthday_dist = clean_customers['Thang_Sinh_Nhat'].value_counts(normalize=True).sort_index() * 100
print("Phân bổ tháng sinh nhật (%):")
print(birthday_dist.round(2))

# Cờ đỏ: Tháng nào có tỷ lệ > 12% là bất thường
suspicious_months = birthday_dist[birthday_dist > 12]
print("\n--- Tháng bất thường ---")
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
                { Ma_KH: "KH010", Ngay_Tao_TK: "2025-12-25", Thang_Sinh_Nhat: 12, So_Dien_Thoai: "hash_010", Email_Domain: "gmail.com",   IP_Dang_Ky: "10.0.0.50" },
                { Ma_KH: "KH_TEST_QC", Ngay_Tao_TK: "2026-10-01", Thang_Sinh_Nhat: 10, So_Dien_Thoai: "hash_test", Email_Domain: "internal-test.com", IP_Dang_Ky: "127.0.0.1" }
            ],
            voucher_usage: [
                { Ma_Voucher: "VC001", Ma_KH: "KH001", Ngay_Su_Dung: "2026-10-01", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH001" },
                { Ma_Voucher: "VC002", Ma_KH: "KH002", Ngay_Su_Dung: "2026-10-01", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH002" },
                { Ma_Voucher: "VC003", Ma_KH: "KH003", Ngay_Su_Dung: "2026-10-02", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH003" },
                { Ma_Voucher: "VC004", Ma_KH: "KH004", Ngay_Su_Dung: "2026-10-02", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH004" },
                { Ma_Voucher: "VC005", Ma_KH: "KH005", Ngay_Su_Dung: "2026-03-15", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH005" },
                { Ma_Voucher: "VC006", Ma_KH: "KH007", Ngay_Su_Dung: "2026-10-03", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH007" },
                { Ma_Voucher: "VC007", Ma_KH: "KH009", Ngay_Su_Dung: "2026-10-04", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH009" },
                { Ma_Voucher: "VC_TEST", Ma_KH: "KH_TEST_QC", Ngay_Su_Dung: "2026-10-01", Gia_Tri_Giam: 50000, Ma_Don_Hang: "DH_TEST" }
            ],
            orders: [
                { Ma_Don_Hang: "DH001", Ma_KH: "KH001", Tong_Tien_Hang: 220000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-01" },
                { Ma_Don_Hang: "DH002", Ma_KH: "KH002", Tong_Tien_Hang: 250000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-01" },
                { Ma_Don_Hang: "DH003", Ma_KH: "KH003", Tong_Tien_Hang: 210000, Trang_Thai: "CANCELLED", Ngay_Dat_Hang: "2026-10-02" },
                { Ma_Don_Hang: "DH004", Ma_KH: "KH004", Tong_Tien_Hang: 300000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-02" },
                { Ma_Don_Hang: "DH005", Ma_KH: "KH005", Tong_Tien_Hang: 500000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-03-15" },
                { Ma_Don_Hang: "DH006", Ma_KH: "KH006", Tong_Tien_Hang: 150000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-06-20" },
                { Ma_Don_Hang: "DH007", Ma_KH: "KH007", Tong_Tien_Hang: 200000, Trang_Thai: "COMPLETED", Ngay_Dat_Hang: "2026-10-03" },
                { Ma_Don_Hang: "DH009", Ma_KH: "KH009", Tong_Tien_Hang: 220000, Trang_Thai: "CANCELLED", Ngay_Dat_Hang: "2026-10-04" },
                { Ma_Don_Hang: "DH010", Ma_KH: "KH001", Tong_Tien_Hang: 280000, Trang_Thai: "REFUNDED",  Ngay_Dat_Hang: "2026-10-05" },
                { Ma_Don_Hang: "DH_TEST", Ma_KH: "KH_TEST_QC", Tong_Tien_Hang: 200000, Trang_Thai: "CANCELLED", Ngay_Dat_Hang: "2026-10-01" }
            ]
        }
    }
];

// ============================================================
// CHẾ ĐỘ LUYỆN TẬP SQL THEO TỪNG CÂU (SQL PRACTICE DRILLS)
// ============================================================
export const drillSchema = [
    {
        tableName: "orders",
        description: "Bảng dữ liệu giao dịch đơn hàng toàn sàn",
        columns: [
            { name: "order_id", type: "VARCHAR", desc: "Mã đơn hàng (PK)" },
            { name: "shop_id", type: "VARCHAR", desc: "Mã gian hàng bán lẻ" },
            { name: "buyer_id", type: "VARCHAR", desc: "Mã người mua hàng" },
            { name: "order_amount", type: "DECIMAL", desc: "Tổng tiền hàng (VNĐ)" },
            { name: "shipping_subsidy", type: "DECIMAL", desc: "Tiền trợ giá freeship (VNĐ)" },
            { name: "status", type: "VARCHAR", desc: "Trạng thái: COMPLETED, CANCELLED, REFUNDED" }
        ]
    },
    {
        tableName: "buyer_profiles",
        description: "Bảng hồ sơ người mua và thiết bị truy cập",
        columns: [
            { name: "buyer_id", type: "VARCHAR", desc: "Mã người mua hàng (PK/FK)" },
            { name: "ip_address", type: "VARCHAR", desc: "Địa chỉ IP mạng đặt hàng" },
            { name: "account_age_days", type: "INT", desc: "Số ngày tuổi đời tài khoản" }
        ]
    }
];

export const drillMockDb = {
    orders: [
        // SHOP_102: 12 đơn (10 đơn hoàn tất có trợ giá > 0, 1 đơn trợ giá = 0, 1 đơn hủy)
        { order_id: "ORD_1001", shop_id: "SHOP_102", buyer_id: "B_001", order_amount: 99000,  shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1002", shop_id: "SHOP_102", buyer_id: "B_002", order_amount: 99500,  shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1003", shop_id: "SHOP_102", buyer_id: "B_003", order_amount: 100000, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1004", shop_id: "SHOP_102", buyer_id: "B_001", order_amount: 101000, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1005", shop_id: "SHOP_102", buyer_id: "B_004", order_amount: 102500, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1006", shop_id: "SHOP_102", buyer_id: "B_002", order_amount: 103000, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1007", shop_id: "SHOP_102", buyer_id: "B_005", order_amount: 104000, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1008", shop_id: "SHOP_102", buyer_id: "B_001", order_amount: 105000, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1009", shop_id: "SHOP_102", buyer_id: "B_006", order_amount: 120000, shipping_subsidy: 25000, status: "COMPLETED" },
        { order_id: "ORD_1010", shop_id: "SHOP_102", buyer_id: "B_007", order_amount: 150000, shipping_subsidy: 25000, status: "COMPLETED" },
        { order_id: "ORD_1011", shop_id: "SHOP_102", buyer_id: "B_008", order_amount: 85000,  shipping_subsidy: 0,     status: "COMPLETED" },
        { order_id: "ORD_1012", shop_id: "SHOP_102", buyer_id: "B_009", order_amount: 100000, shipping_subsidy: 30000, status: "CANCELLED" },

        // SHOP_101: 8 đơn (5 hoàn tất, 1 hủy, 2 hoàn tiền)
        { order_id: "ORD_1013", shop_id: "SHOP_101", buyer_id: "B_010", order_amount: 99800,  shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1014", shop_id: "SHOP_101", buyer_id: "B_011", order_amount: 100500, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1015", shop_id: "SHOP_101", buyer_id: "B_012", order_amount: 102000, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1016", shop_id: "SHOP_101", buyer_id: "B_010", order_amount: 180000, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1017", shop_id: "SHOP_101", buyer_id: "B_013", order_amount: 250000, shipping_subsidy: 35000, status: "COMPLETED" },
        { order_id: "ORD_1018", shop_id: "SHOP_101", buyer_id: "B_014", order_amount: 75000,  shipping_subsidy: 0,     status: "COMPLETED" },
        { order_id: "ORD_1019", shop_id: "SHOP_101", buyer_id: "B_015", order_amount: 99200,  shipping_subsidy: 30000, status: "CANCELLED" },
        { order_id: "ORD_1020", shop_id: "SHOP_101", buyer_id: "B_016", order_amount: 320000, shipping_subsidy: 35000, status: "REFUNDED" },

        // SHOP_103: 6 đơn (5 hoàn tất, 1 hủy)
        { order_id: "ORD_1021", shop_id: "SHOP_103", buyer_id: "B_017", order_amount: 99100,  shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1022", shop_id: "SHOP_103", buyer_id: "B_018", order_amount: 104500, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1023", shop_id: "SHOP_103", buyer_id: "B_019", order_amount: 160000, shipping_subsidy: 25000, status: "COMPLETED" },
        { order_id: "ORD_1024", shop_id: "SHOP_103", buyer_id: "B_020", order_amount: 450000, shipping_subsidy: 35000, status: "COMPLETED" },
        { order_id: "ORD_1025", shop_id: "SHOP_103", buyer_id: "B_021", order_amount: 55000,  shipping_subsidy: 0,     status: "COMPLETED" },
        { order_id: "ORD_1026", shop_id: "SHOP_103", buyer_id: "B_022", order_amount: 110000, shipping_subsidy: 25000, status: "CANCELLED" },

        // SHOP_104: 5 đơn (4 hoàn tất, 1 hoàn tiền)
        { order_id: "ORD_1027", shop_id: "SHOP_104", buyer_id: "B_001", order_amount: 99900,  shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1028", shop_id: "SHOP_104", buyer_id: "B_023", order_amount: 135000, shipping_subsidy: 25000, status: "COMPLETED" },
        { order_id: "ORD_1029", shop_id: "SHOP_104", buyer_id: "B_024", order_amount: 280000, shipping_subsidy: 35000, status: "COMPLETED" },
        { order_id: "ORD_1030", shop_id: "SHOP_104", buyer_id: "B_025", order_amount: 65000,  shipping_subsidy: 0,     status: "COMPLETED" },
        { order_id: "ORD_1031", shop_id: "SHOP_104", buyer_id: "B_003", order_amount: 101500, shipping_subsidy: 30000, status: "REFUNDED" },

        // SHOP_105: 4 đơn (4 hoàn tất)
        { order_id: "ORD_1032", shop_id: "SHOP_105", buyer_id: "B_006", order_amount: 99300,  shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1033", shop_id: "SHOP_105", buyer_id: "B_008", order_amount: 195000, shipping_subsidy: 25000, status: "COMPLETED" },
        { order_id: "ORD_1034", shop_id: "SHOP_105", buyer_id: "B_014", order_amount: 550000, shipping_subsidy: 40000, status: "COMPLETED" },
        { order_id: "ORD_1035", shop_id: "SHOP_105", buyer_id: "B_017", order_amount: 750000, shipping_subsidy: 40000, status: "COMPLETED" },

        // SHOP_106: 3 đơn (2 hoàn tất, 1 hủy)
        { order_id: "ORD_1036", shop_id: "SHOP_106", buyer_id: "B_004", order_amount: 103500, shipping_subsidy: 30000, status: "COMPLETED" },
        { order_id: "ORD_1037", shop_id: "SHOP_106", buyer_id: "B_011", order_amount: 80000,  shipping_subsidy: 0,     status: "COMPLETED" },
        { order_id: "ORD_1038", shop_id: "SHOP_106", buyer_id: "B_019", order_amount: 100000, shipping_subsidy: 30000, status: "CANCELLED" }
    ],
    buyer_profiles: [
        { buyer_id: "B_001", ip_address: "192.168.1.88", account_age_days: 2 },
        { buyer_id: "B_002", ip_address: "192.168.1.88", account_age_days: 1 },
        { buyer_id: "B_003", ip_address: "192.168.1.88", account_age_days: 3 },
        { buyer_id: "B_004", ip_address: "192.168.1.88", account_age_days: 2 },
        { buyer_id: "B_005", ip_address: "192.168.1.88", account_age_days: 1 },
        { buyer_id: "B_006", ip_address: "113.161.45.22", account_age_days: 180 },
        { buyer_id: "B_007", ip_address: "14.232.88.10",  account_age_days: 320 },
        { buyer_id: "B_008", ip_address: "171.244.12.9",  account_age_days: 45 },
        { buyer_id: "B_009", ip_address: "192.168.1.88", account_age_days: 1 },
        { buyer_id: "B_010", ip_address: "10.0.4.15",     account_age_days: 4 },
        { buyer_id: "B_011", ip_address: "10.0.4.15",     account_age_days: 5 },
        { buyer_id: "B_012", ip_address: "10.0.4.15",     account_age_days: 2 },
        { buyer_id: "B_013", ip_address: "27.72.100.4",   account_age_days: 540 },
        { buyer_id: "B_014", ip_address: "118.69.34.8",   account_age_days: 90 },
        { buyer_id: "B_015", ip_address: "10.0.4.15",     account_age_days: 3 },
        { buyer_id: "B_016", ip_address: "42.112.50.19",  account_age_days: 210 },
        { buyer_id: "B_017", ip_address: "125.235.14.88", account_age_days: 15 },
        { buyer_id: "B_018", ip_address: "125.235.14.88", account_age_days: 12 },
        { buyer_id: "B_019", ip_address: "1.53.190.22",   account_age_days: 400 },
        { buyer_id: "B_020", ip_address: "115.79.80.12",  account_age_days: 600 },
        { buyer_id: "B_021", ip_address: "183.80.45.6",   account_age_days: 720 },
        { buyer_id: "B_022", ip_address: "125.235.14.88", account_age_days: 10 },
        { buyer_id: "B_023", ip_address: "203.162.0.1",   account_age_days: 300 },
        { buyer_id: "B_024", ip_address: "116.108.99.3",  account_age_days: 150 },
        { buyer_id: "B_025", ip_address: "171.225.10.8",  account_age_days: 85 }
    ]
};

// ============================================================
// 3 THẺ CẤP ĐỘ LUYỆN TẬP SQL (EASY - MEDIUM - HARD)
// ============================================================
export const drillCases = [
    {
        id: "drill_sql_basic",
        type: "sql_drill",
        title: "Luyện tập SQL Cơ bản — Truy vấn & Bộ lọc điều kiện",
        category: "SQL Practice Drills",
        categoryLabel: "Luyện Tập SQL",
        difficulty: "easy",
        difficultyLabel: "Cơ bản",
        estimatedTime: "15 - 20 phút",
        techStack: ["SQL Drill", "SELECT", "WHERE", "ORDER BY", "LIMIT"],
        badgeIcon: "⚡",
        shortDesc: "Thực hành 5 câu hỏi truy vấn cơ bản: Lọc đơn COMPLETED, giới hạn kết quả, kiểm tra ngưỡng giá 99k và lọc theo gian hàng SHOP_102.",
        schema: drillSchema,
        mockDb: drillMockDb,
        questions: [
            {
                id: "q1",
                questionNumber: 1,
                title: "Lấy 3 đơn hàng hoàn tất đầu tiên",
                prompt: "Lấy 3 đơn hàng hoàn tất (`status = 'COMPLETED'`) đầu tiên từ bảng `orders` với đầy đủ 6 cột: `order_id`, `shop_id`, `buyer_id`, `order_amount`, `shipping_subsidy`, `status`.",
                hint: "Dùng mệnh đề WHERE status = 'COMPLETED' kết hợp LIMIT 3 để lấy đúng 3 dòng đầu tiên.",
                expectedSql: `SELECT 
    order_id, 
    shop_id, 
    buyer_id, 
    order_amount, 
    shipping_subsidy, 
    status 
FROM orders 
WHERE status = 'COMPLETED' 
LIMIT 3;`,
                defaultSql: `-- [Câu 1] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q2",
                questionNumber: 2,
                title: "Xem toàn bộ hồ sơ 5 người mua đầu tiên",
                prompt: "Xem nhanh toàn bộ các cột (`SELECT *`) của 5 hồ sơ người mua đầu tiên trong bảng `buyer_profiles`.",
                hint: "Sử dụng ký tự sao (*) để lấy mọi cột: SELECT * FROM buyer_profiles LIMIT 5;",
                expectedSql: `SELECT * 
FROM buyer_profiles 
LIMIT 5;`,
                defaultSql: `-- [Câu 2] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q3",
                questionNumber: 3,
                title: "Lọc đơn hoàn tất có giá trị từ 99.000đ trở lên",
                prompt: "Lọc các đơn hàng đã hoàn tất (`status = 'COMPLETED'`) có giá trị đơn (`order_amount`) từ `99000` trở lên. Hiển thị 4 cột: `order_id`, `shop_id`, `order_amount`, `shipping_subsidy`.",
                hint: "Kết hợp 2 điều kiện bằng toán tử AND: WHERE status = 'COMPLETED' AND order_amount >= 99000;",
                expectedSql: `SELECT 
    order_id, 
    shop_id, 
    order_amount, 
    shipping_subsidy 
FROM orders 
WHERE status = 'COMPLETED' 
  AND order_amount >= 99000;`,
                defaultSql: `-- [Câu 3] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q4",
                questionNumber: 4,
                title: "Top 5 đơn hàng hoàn tất có giá trị cao nhất sàn",
                prompt: "Tìm Top 5 đơn hàng hoàn tất có giá trị (`order_amount`) cao nhất toàn sàn từ `99000` trở lên. Hiển thị 4 cột: `order_id`, `shop_id`, `order_amount`, `shipping_subsidy`, sắp xếp giảm dần theo giá trị đơn.",
                hint: "Sắp xếp giảm dần bằng ORDER BY order_amount DESC và lấy 5 dòng với LIMIT 5.",
                expectedSql: `SELECT 
    order_id, 
    shop_id, 
    order_amount, 
    shipping_subsidy 
FROM orders 
WHERE status = 'COMPLETED' 
  AND order_amount >= 99000 
ORDER BY order_amount DESC 
LIMIT 5;`,
                defaultSql: `-- [Câu 4] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q5",
                questionNumber: 5,
                title: "Đơn hoàn tất của SHOP_102 có trợ giá vận chuyển",
                prompt: "Lọc danh sách các đơn hàng hoàn tất của riêng gian hàng `'SHOP_102'` có nhận trợ giá vận chuyển (`shipping_subsidy > 0`), sắp xếp theo giá trị đơn hàng tăng dần (`ASC`) và lấy 10 dòng đầu tiên.",
                hint: "Sử dụng 3 điều kiện lọc: WHERE status = 'COMPLETED' AND shop_id = 'SHOP_102' AND shipping_subsidy > 0 ORDER BY order_amount ASC LIMIT 10;",
                expectedSql: `SELECT 
    order_id, 
    shop_id, 
    buyer_id, 
    order_amount, 
    shipping_subsidy, 
    status 
FROM orders 
WHERE status = 'COMPLETED' 
  AND shop_id = 'SHOP_102' 
  AND shipping_subsidy > 0 
ORDER BY order_amount ASC 
LIMIT 10;`,
                defaultSql: `-- [Câu 5] Viết câu lệnh SQL của bạn tại đây:\n\n`
            }
        ]
    },
    {
        id: "drill_sql_intermediate",
        type: "sql_drill",
        title: "Luyện tập SQL Trung bình — Gom nhóm GROUP BY & Tính KPIs",
        category: "SQL Practice Drills",
        categoryLabel: "Luyện Tập SQL",
        difficulty: "medium",
        difficultyLabel: "Trung bình",
        estimatedTime: "20 - 25 phút",
        techStack: ["SQL Drill", "GROUP BY", "COUNT/SUM/AVG", "ROUND", "DISTINCT"],
        badgeIcon: "⚡",
        shortDesc: "Thực hành 5 câu hỏi hàm tổng hợp và gom nhóm: Đếm đơn, tính GMV, AOV làm tròn, tỷ lệ chi phí freeship và Top 5 Shop nhiều đơn nhất.",
        schema: drillSchema,
        mockDb: drillMockDb,
        questions: [
            {
                id: "q1",
                questionNumber: 1,
                title: "Đếm tổng đơn hoàn tất và tổng GMV toàn sàn",
                prompt: "Đếm tổng số đơn hàng hoàn tất (`COUNT(order_id) AS total_completed_orders`) và tính tổng doanh số GMV (`SUM(order_amount) AS total_gmv_vnd`) của toàn sàn.",
                hint: "Dùng các hàm COUNT() và SUM() trên bảng orders kèm điều kiện WHERE status = 'COMPLETED'.",
                expectedSql: `SELECT 
    COUNT(order_id) AS total_completed_orders, 
    SUM(order_amount) AS total_gmv_vnd 
FROM orders 
WHERE status = 'COMPLETED';`,
                defaultSql: `-- [Câu 1] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q2",
                questionNumber: 2,
                title: "Tính AOV làm tròn, đơn rẻ nhất và đắt nhất",
                prompt: "Tính giá trị trung bình mỗi đơn hàng hoàn tất được làm tròn đến hàng đơn vị (`ROUND(AVG(order_amount), 0) AS aov_vnd`), kèm giá trị đơn rẻ nhất (`MIN(order_amount) AS min_order_vnd`) và đắt nhất (`MAX(order_amount) AS max_order_vnd`).",
                hint: "Dùng ROUND(AVG(cột), 0) để làm tròn số thực, kết hợp MIN() và MAX().",
                expectedSql: `SELECT 
    ROUND(AVG(order_amount), 0) AS aov_vnd, 
    MIN(order_amount) AS min_order_vnd, 
    MAX(order_amount) AS max_order_vnd 
FROM orders 
WHERE status = 'COMPLETED';`,
                defaultSql: `-- [Câu 2] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q3",
                questionNumber: 3,
                title: "Tính tổng tiền trợ giá và tỷ lệ % trợ giá / GMV",
                prompt: "Tính tổng tiền trợ giá (`SUM(shipping_subsidy) AS total_subsidy_vnd`) và tỷ lệ % chi phí trợ giá so với tổng GMV (`ROUND(SUM(shipping_subsidy) * 100.0 / SUM(order_amount), 2) AS subsidy_to_gmv_pct`) cho các đơn hoàn tất.",
                hint: "Bắt buộc nhân với 100.0 (số thực) trước khi chia để không bị cắt bớt phần thập phân: ROUND(SUM(...) * 100.0 / SUM(...), 2).",
                expectedSql: `SELECT 
    SUM(shipping_subsidy) AS total_subsidy_vnd, 
    ROUND(SUM(shipping_subsidy) * 100.0 / SUM(order_amount), 2) AS subsidy_to_gmv_pct 
FROM orders 
WHERE status = 'COMPLETED';`,
                defaultSql: `-- [Câu 3] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q4",
                questionNumber: 4,
                title: "Top 5 Shop có số lượng đơn hoàn tất cao nhất",
                prompt: "Gom nhóm các đơn hoàn tất theo từng gian hàng (`GROUP BY shop_id`) để tính tổng số đơn (`total_orders`) và tổng tiền trợ giá (`total_subsidy_vnd`). Sắp xếp giảm dần theo số đơn để lấy Top 5 Shop nhiều đơn nhất.",
                hint: "Sử dụng SELECT shop_id, COUNT(...) AS total_orders, SUM(...) GROUP BY shop_id ORDER BY total_orders DESC LIMIT 5;",
                expectedSql: `SELECT 
    shop_id, 
    COUNT(order_id) AS total_orders, 
    SUM(shipping_subsidy) AS total_subsidy_vnd 
FROM orders 
WHERE status = 'COMPLETED' 
GROUP BY shop_id 
ORDER BY total_orders DESC 
LIMIT 5;`,
                defaultSql: `-- [Câu 4] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q5",
                questionNumber: 5,
                title: "Đếm số người mua duy nhất và tổng đơn theo từng Shop",
                prompt: "Gom nhóm các đơn hoàn tất theo từng gian hàng (`GROUP BY shop_id`), đếm số lượng người mua duy nhất không trùng lặp (`COUNT(DISTINCT buyer_id) AS unique_buyers`) và tổng số đơn (`COUNT(order_id) AS total_orders`), lấy Top 5 Shop có số đơn cao nhất.",
                hint: "Dùng từ khóa DISTINCT bên trong COUNT: COUNT(DISTINCT buyer_id) AS unique_buyers.",
                expectedSql: `SELECT 
    shop_id, 
    COUNT(DISTINCT buyer_id) AS unique_buyers, 
    COUNT(order_id) AS total_orders 
FROM orders 
WHERE status = 'COMPLETED' 
GROUP BY shop_id 
ORDER BY total_orders DESC 
LIMIT 5;`,
                defaultSql: `-- [Câu 5] Viết câu lệnh SQL của bạn tại đây:\n\n`
            }
        ]
    },
    {
        id: "drill_sql_advanced",
        type: "sql_drill",
        title: "Luyện tập SQL Nâng cao — Phân khúc CASE WHEN & Truy vết với JOIN",
        category: "SQL Practice Drills",
        categoryLabel: "Luyện Tập SQL",
        difficulty: "hard",
        difficultyLabel: "Nâng cao",
        estimatedTime: "25 - 30 phút",
        techStack: ["SQL Drill", "CASE WHEN", "JOIN", "Conditional Aggregation"],
        badgeIcon: "⚡",
        shortDesc: "Thực hành 5 câu hỏi nâng cao: Phân khúc 4 giỏ giá bằng CASE WHEN, đếm điều kiện trên 1 dòng và JOIN bảng người mua để truy vết gian lận IP.",
        schema: drillSchema,
        mockDb: drillMockDb,
        questions: [
            {
                id: "q1",
                questionNumber: 1,
                title: "Phân loại đơn Freeship bằng CASE WHEN",
                prompt: "Dùng `CASE WHEN` gắn nhãn các đơn hoàn tất thành 2 nhóm: `'Không Freeship'` (nếu `order_amount < 99000`) và `'Đủ điều kiện Freeship'` (từ `99000` trở lên) đặt tên cột là `freeship_group`, sau đó đếm tổng số đơn của mỗi nhóm (`COUNT(order_id) AS total_orders`).",
                hint: "Cấu trúc CASE WHEN: CASE WHEN order_amount < 99000 THEN 'Không Freeship' ELSE 'Đủ điều kiện Freeship' END AS freeship_group, gom nhóm bằng GROUP BY freeship_group.",
                expectedSql: `SELECT 
    CASE 
        WHEN order_amount < 99000 THEN 'Không Freeship' 
        ELSE 'Đủ điều kiện Freeship' 
    END AS freeship_group, 
    COUNT(order_id) AS total_orders 
FROM orders 
WHERE status = 'COMPLETED' 
GROUP BY freeship_group;`,
                defaultSql: `-- [Câu 1] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q2",
                questionNumber: 2,
                title: "Chia 4 giỏ giá bằng CASE WHEN BETWEEN & tính KPI",
                prompt: "Dùng `CASE WHEN ... BETWEEN` chia các đơn hoàn tất thành 4 giỏ giá (`price_segment`):\n- `< 99000`: `'1. Dưới 99k (Không Freeship)'`\n- `BETWEEN 99000 AND 105000`: `'2. 99k - 105k (Cận ngưỡng Freeship)'`\n- `BETWEEN 105001 AND 200000`: `'3. 105k - 200k (Bình thường)'`\n- `ELSE`: `'4. Trên 200k (Giá trị cao)'`\nGom nhóm theo `price_segment` để tính số lượng đơn (`total_orders`), tổng trợ giá (`total_subsidy_vnd`) và AOV làm tròn (`avg_order_value_vnd`), sắp xếp theo `total_orders DESC`.",
                hint: "Sử dụng CASE WHEN ... BETWEEN ... AND ... THEN ... END AS price_segment, gom nhóm bằng GROUP BY price_segment và sắp xếp ORDER BY total_orders DESC.",
                expectedSql: `SELECT 
    CASE 
        WHEN order_amount < 99000 THEN '1. Dưới 99k (Không Freeship)' 
        WHEN order_amount BETWEEN 99000 AND 105000 THEN '2. 99k - 105k (Cận ngưỡng Freeship)' 
        WHEN order_amount BETWEEN 105001 AND 200000 THEN '3. 105k - 200k (Bình thường)' 
        ELSE '4. Trên 200k (Giá trị cao)' 
    END AS price_segment, 
    COUNT(order_id) AS total_orders, 
    SUM(shipping_subsidy) AS total_subsidy_vnd, 
    ROUND(AVG(order_amount), 0) AS avg_order_value_vnd 
FROM orders 
WHERE status = 'COMPLETED' 
GROUP BY price_segment 
ORDER BY total_orders DESC;`,
                defaultSql: `-- [Câu 2] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q3",
                questionNumber: 3,
                title: "Conditional Aggregation trên 1 dòng duy nhất",
                prompt: "Sử dụng kỹ thuật Conditional Aggregation (`SUM(CASE WHEN order_amount BETWEEN 99000 AND 105000 THEN 1 ELSE 0 END) AS suspicious_orders`) để đếm số đơn cận ngưỡng 99k-105k và tổng số đơn hoàn tất (`COUNT(order_id) AS total_completed_orders`) ngay trên 1 dòng kết quả duy nhất mà không dùng `GROUP BY`.",
                hint: "Lồng CASE WHEN bên trong SUM: SUM(CASE WHEN ... THEN 1 ELSE 0 END), không dùng GROUP BY.",
                expectedSql: `SELECT 
    SUM(CASE WHEN order_amount BETWEEN 99000 AND 105000 THEN 1 ELSE 0 END) AS suspicious_orders, 
    COUNT(order_id) AS total_completed_orders 
FROM orders 
WHERE status = 'COMPLETED';`,
                defaultSql: `-- [Câu 3] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q4",
                questionNumber: 4,
                title: "Nối 2 bảng orders và buyer_profiles bằng JOIN",
                prompt: "Dùng `JOIN` nối bảng `orders o` với `buyer_profiles b` qua khóa chung `ON o.buyer_id = b.buyer_id`. Lấy ra 5 đơn hàng hoàn tất đầu tiên gồm các cột: `o.order_id`, `o.shop_id`, `o.order_amount`, `b.ip_address`, `b.account_age_days`.",
                hint: "Cú pháp JOIN: FROM orders o JOIN buyer_profiles b ON o.buyer_id = b.buyer_id WHERE o.status = 'COMPLETED' LIMIT 5;",
                expectedSql: `SELECT 
    o.order_id, 
    o.shop_id, 
    o.order_amount, 
    b.ip_address, 
    b.account_age_days 
FROM orders o 
JOIN buyer_profiles b ON o.buyer_id = b.buyer_id 
WHERE o.status = 'COMPLETED' 
LIMIT 5;`,
                defaultSql: `-- [Câu 4] Viết câu lệnh SQL của bạn tại đây:\n\n`
            },
            {
                id: "q5",
                questionNumber: 5,
                title: "Truy vết Top 5 cặp (Shop + IP) khả nghi gian lận",
                prompt: "Nối `orders o` và `buyer_profiles b` (`ON o.buyer_id = b.buyer_id`), lọc các đơn hoàn tất nằm trong giỏ giá nhạy cảm (`o.order_amount BETWEEN 99000 AND 105000`). Gom nhóm theo cặp `GROUP BY o.shop_id, b.ip_address` để tìm Top 5 cặp (Shop + Địa chỉ IP) có số đơn khả nghi (`COUNT(o.order_id) AS suspicious_orders`) cao nhất, kèm tổng tiền trợ giá thất thoát (`SUM(o.shipping_subsidy) AS total_subsidy_loss_vnd`) và AOV (`ROUND(AVG(o.order_amount), 0) AS avg_order_amount_vnd`).",
                hint: "Nối 2 bảng bằng JOIN, lọc giỏ giá nhạy cảm, gom nhóm 2 cột GROUP BY o.shop_id, b.ip_address và ORDER BY suspicious_orders DESC LIMIT 5.",
                expectedSql: `SELECT 
    o.shop_id, 
    b.ip_address, 
    COUNT(o.order_id) AS suspicious_orders, 
    SUM(o.shipping_subsidy) AS total_subsidy_loss_vnd, 
    ROUND(AVG(o.order_amount), 0) AS avg_order_amount_vnd 
FROM orders o 
JOIN buyer_profiles b ON o.buyer_id = b.buyer_id 
WHERE o.status = 'COMPLETED' 
  AND o.order_amount BETWEEN 99000 AND 105000 
GROUP BY o.shop_id, b.ip_address 
ORDER BY suspicious_orders DESC 
LIMIT 5;`,
                defaultSql: `-- [Câu 5] Viết câu lệnh SQL của bạn tại đây:\n\n`
            }
        ]
    }
];

// Tự động thêm 3 thẻ luyện tập vào danh sách tổng
simulationCases.push(...drillCases);

