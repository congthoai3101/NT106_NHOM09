# NT106 — Nhóm 9: Game Tiến Lên Miền Nam

## 1. Giới thiệu

Đồ án môn NT106 xây dựng trò chơi Tiến Lên Miền Nam trực tuyến theo mô hình Client–Server, cho phép nhiều người chơi tham gia cùng một phòng và chơi bài thông qua kết nối mạng.

## 2. Hướng dẫn cài đặt & chạy dự án

### Yêu cầu
- [Node.js](https://nodejs.org/) >= 18
- Tài khoản [Supabase](https://supabase.com/) (đã có project)

### Các bước

```bash
# 1. Clone repository
git clone <repo-url>
cd NT106_NHOM09

# 2. Cài đặt dependencies
npm install

# 3. Tạo file .env từ template (tự động)
npm run setup
```

> **Sau bước 3**, mở file `.env` vừa được tạo và điền các giá trị thật vào:
>
> | Biến | Lấy ở đâu |
> |---|---|
> | `DATABASE_URL` / `DIRECT_URL` | Supabase → Project Settings → Database → Connection string |
> | `JWT_SECRET` | Tự đặt một chuỗi bí mật bất kỳ |
> | `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
> | `SMTP_USER` / `SMTP_PASS` | Gmail → Google Account → Security → App Passwords |

```bash
# 4. Đồng bộ schema database
npm run db:generate
npm run db:push

# 5. Chạy server (development)
npm run dev
```

## 3. Chức năng dự kiến

- Quản lý tài khoản người chơi.
- Tạo phòng, tham gia phòng và quản lý người chơi.
- Chia bài, đánh bài và xử lý lượt chơi theo luật Tiến Lên Miền Nam.
- Chat text và voice trong phòng.
- Lịch sử trận đấu và bảng xếp hạng.
- Bot AI và chế độ chơi từ 2–4 người.

## 3. Công nghệ dự kiến

- **Mô hình hệ thống:** Client–Server.
- **Giao tiếp mạng:** TCP.
- **Xác thực tài khoản:** Supabase Authentication.
- **Cơ sở dữ liệu:** PostgreSQL trên Supabase.

*Ngôn ngữ lập trình, framework và công nghệ voice chat sẽ được cập nhật sau khi nhóm thống nhất.*

## 4. Cấu trúc tài liệu

```text
docs/
├── requirements.md
├── game-rules.md
├── tcp-protocol.md
├── protocol-testing.md
├── network-room-design.md
├── database-design.md
└── uml/
    ├── use-case.md
    ├── class-diagram.md
    └── sequence-diagram.md
```

### Mô tả tài liệu

- **`docs/requirements.md`**: Phân tích yêu cầu chức năng và phi chức năng của hệ thống.
- **`docs/game-rules.md`**: Đặc tả luật chơi Tiến Lên Miền Nam.
- **`docs/tcp-protocol.md`**: Thiết kế giao thức TCP và định dạng thông điệp trao đổi giữa client và server.
- **`docs/protocol-testing.md`**: Đặc tả giao thức và kế hoạch kiểm thử các trường hợp giao tiếp mạng.
- **`docs/network-room-design.md`**: Thiết kế xử lý kết nối mạng, quản lý phòng chơi, đồng bộ trạng thái và xử lý mất kết nối.
- **`docs/database-design.md`**: Thiết kế cơ sở dữ liệu PostgreSQL thông qua Supabase.
- **`docs/uml/use-case.md`**: Sơ đồ Use Case mô tả tác nhân và chức năng hệ thống.
- **`docs/uml/class-diagram.md`**: Sơ đồ lớp mô tả cấu trúc và quan hệ giữa các lớp.
- **`docs/uml/sequence-diagram.md`**: Sơ đồ tuần tự mô tả luồng tạo phòng, bắt đầu ván, đánh bài và xử lý mất kết nối.

## 5. Tiến độ

- Giai đoạn 1: Lên ý tưởng và chuẩn bị kiến thức.
- Giai đoạn 2: Phân tích và thiết kế.
- Giai đoạn 3: Thiết kế giao diện.
- Giai đoạn 4: Thực hiện đồ án.
- Giai đoạn 5: Kiểm thử và bảo mật.
- Giai đoạn 6: Hoàn thành và nộp đồ án.

## 6. Thành viên

- Quang
- Thoại
- Nam

