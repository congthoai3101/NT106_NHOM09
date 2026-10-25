# USE CASE DIAGRAM — GAME TIẾN LÊN MIỀN NAM

**Dự án:** NT106 — Nhóm 9

## 1. Sơ đồ chức năng

```mermaid
flowchart LR
    Player["Người chơi"]
    Host["Chủ phòng"]
    Bot["Bot"]
    Server["Game Server"]

    subgraph Game["Hệ thống game Tiến Lên Miền Nam"]
        Login["Đăng nhập"]
        Mode["Chọn chế độ chơi"]
        Create["Tạo phòng"]
        Join["Tham gia phòng"]
        Ready["Sẵn sàng"]
        Start["Bắt đầu ván"]
        Play["Đánh bài"]
        Pass["Bỏ lượt"]
        View["Xem trạng thái bàn"]
        Rank["Xem bảng xếp hạng"]
        History["Xem lịch sử"]
        Difficulty["Chọn độ khó Bot"]
        Validate["Xác thực nước đánh"]
        Sync["Đồng bộ trạng thái"]
        Result["Tính kết quả và điểm"]
    end

    Player --> Login
    Player --> Mode
    Player --> Create
    Player --> Join
    Player --> Ready
    Player --> Play
    Player --> Pass
    Player --> View
    Player --> Rank
    Player --> History
    Player --> Difficulty

    Host --> Start
    Bot --> Play

    Create --> Server
    Join --> Server
    Start --> Server
    Play --> Validate
    Pass --> Validate
    Validate --> Sync
    Sync --> View
    Sync --> Result
```

## 2. Mô tả các Use Case

| Use Case          | Tác nhân chính | Kết quả                               |
| ----------------- | -------------- | ------------------------------------- |
| Đăng nhập         | Người chơi     | Truy cập hệ thống                     |
| Chọn chế độ       | Người chơi     | Xác định kiểu phòng                   |
| Tạo phòng         | Người chơi     | Phòng mới được tạo                    |
| Tham gia phòng    | Người chơi     | Thành viên được thêm vào phòng hợp lệ |
| Bắt đầu ván       | Chủ phòng      | Server bắt đầu ván nếu đủ điều kiện   |
| Đánh bài          | Người chơi/Bot | Nước đánh được server xác thực        |
| Bỏ lượt           | Người chơi/Bot | Server cập nhật lượt nếu hợp lệ       |
| Xem bảng xếp hạng | Người chơi     | Hiển thị điểm tích lũy                |
| Xem lịch sử       | Người chơi     | Hiển thị kết quả các ván đã lưu       |

## 3. Ghi chú

- Sơ đồ này thể hiện các chức năng chính ở mức tổng quan.
- Server là thành phần xác thực hành động và quản lý trạng thái chính thức.
- Bot chỉ tham gia chế độ đấu 2 người.
