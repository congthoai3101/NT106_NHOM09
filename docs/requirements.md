# PHÂN TÍCH YÊU CẦU — GAME TIẾN LÊN MIỀN NAM

**Dự án:** NT106 — Nhóm 9  
**Phiên bản:** 1.0

## 1. Mục tiêu

Xây dựng game Tiến Lên Miền Nam cho phép người chơi tạo phòng, tham gia phòng, chơi theo lượt với người khác hoặc Bot, và xem điểm số trên bảng xếp hạng.

## 2. Tác nhân

- **Người chơi:** Đăng nhập, chọn chế độ, tạo/tham gia phòng và chơi bài.
- **Chủ phòng:** Có quyền bắt đầu ván và quản lý phòng theo quyền được cấp.
- **Bot:** Tham gia ván đấu 2 người, có ba cấp độ khó.
- **Game Server:** Quản lý kết nối, phòng, luật chơi, trạng thái ván và điểm số.

## 3. Yêu cầu chức năng

| Mã | Yêu cầu |
|---|---|
| FR01 | Người chơi đăng nhập vào hệ thống. |
| FR02 | Người chơi chọn đấu 2 người, đấu 4 người hoặc đấu với Bot. |
| FR03 | Người chơi tạo phòng và nhận mã phòng. |
| FR04 | Người chơi tham gia phòng bằng mã phòng. |
| FR05 | Chủ phòng bắt đầu ván khi đủ điều kiện. |
| FR06 | Hệ thống chia bài theo quy tắc đã thống nhất. |
| FR07 | Người chơi đánh bài hoặc bỏ lượt theo luật. |
| FR08 | Server xác thực tính hợp lệ của mọi hành động. |
| FR09 | Hệ thống đồng bộ trạng thái bàn chơi cho các thành viên trong phòng. |
| FR10 | Hệ thống xác định kết quả và cập nhật điểm số. |
| FR11 | Người chơi xem bảng xếp hạng và lịch sử kết quả. |
| FR12 | Người chơi chọn độ khó Bot: Dễ, Trung bình hoặc Khó. |
| FR13 | Hệ thống xử lý người chơi thoát phòng hoặc mất kết nối theo chế độ chơi. |

## 4. Yêu cầu phi chức năng

- **Đồng bộ:** Các client trong cùng ván nhận được trạng thái công khai thống nhất.
- **Bảo mật:** Người chơi chỉ được xem bài trên tay của chính mình.
- **Tính toàn vẹn:** Client không được tự quyết định kết quả nước đánh hoặc điểm số.
- **Kiểm tra hợp lệ:** Server kiểm tra lượt, quyền sở hữu bài và tổ hợp được đánh.
- **Ổn định:** Hệ thống xử lý lỗi kết nối và yêu cầu không hợp lệ mà không làm sai lệch trạng thái ván.
- **Dễ bảo trì:** Tách phần giao diện, mạng, quản lý phòng và luật chơi thành các thành phần riêng.

## 5. Quy tắc nghiệp vụ chính

- Đấu 2 người: hai người chơi thật.
- Đấu 4 người: bốn người chơi thật.
- Đấu với Bot: một người thật và một Bot, sử dụng chế độ 2 người.
- Không tự động thêm Bot vào phòng đang thiếu người.
- Sử dụng bộ bài 52 lá, không có Joker.
- Mỗi người được chia 13 lá theo quy tắc đã thống nhất.
- Ở đầu ván game, người sở hữu 3 bích đi đầu.
- Ba đôi thông và bốn đôi thông được hỗ trợ để chặt heo.
- Nếu người chơi thoát hoặc mất kết nối trong chế độ 2 người/đấu Bot, ván kết thúc hòa.
- Trong chế độ 4 người, người thoát hoặc mất kết nối bị xếp bét; ván tiếp tục với những người còn lại.
