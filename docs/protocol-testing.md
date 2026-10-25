# Đặc tả và kiểm thử giao thức TCP — Game Tiến Lên Miền Nam

**Môn học:** NT106  
**Nhóm:** 9

## 1. Mục tiêu

Tài liệu đặc tả giao thức trao đổi dữ liệu giữa client và server trong game Tiến Lên Miền Nam. Đồng thời, tài liệu xác định các trường hợp kiểm thử để kiểm tra tính chính xác, ổn định và an toàn của giao tiếp mạng.

## 2. Mô hình giao tiếp

- Client gửi yêu cầu đến server thông qua kết nối TCP.
- Server tiếp nhận, kiểm tra yêu cầu và xử lý nghiệp vụ.
- Server gửi phản hồi cho client đã gửi yêu cầu.
- Khi trạng thái phòng hoặc ván đấu thay đổi, server gửi thông báo cập nhật đến các client liên quan.
- Server là nơi xác thực lượt đánh, bài được chọn và kết quả ván đấu.

## 3. Quy ước thông điệp

Ở giai đoạn thiết kế, sử dụng JSON để biểu diễn nội dung thông điệp. Mỗi thông điệp có trường `type` để xác định loại yêu cầu hoặc sự kiện.

Ví dụ yêu cầu đăng nhập:

```json
{
  "type": "LOGIN",
  "requestId": "req_001",
  "payload": {
    "username": "player1",
    "password": "example"
  }
}
```

Ví dụ phản hồi thành công:

```json
{
  "type": "LOGIN_RESULT",
  "requestId": "req_001",
  "success": true,
  "message": "Đăng nhập thành công",
  "payload": {
    "playerId": "player_001"
  }
}
```

**Lưu ý:** Đây là định dạng đề xuất. Khi triển khai TCP, nhóm phải thống nhất cách phân tách thông điệp JSON trong luồng byte, chẳng hạn dùng ký tự xuống dòng làm dấu kết thúc mỗi thông điệp. Không được giả định mỗi lần `recv()` sẽ nhận đủ một thông điệp.

## 4. Danh sách thông điệp

| Loại thông điệp | Hướng truyền | Mục đích |
|---|---|---|
| `REGISTER` | Client → Server | Đăng ký tài khoản. |
| `LOGIN` | Client → Server | Đăng nhập. |
| `LOGOUT` | Client → Server | Đăng xuất. |
| `CREATE_ROOM` | Client → Server | Tạo phòng chơi. |
| `JOIN_ROOM` | Client → Server | Tham gia phòng bằng mã phòng. |
| `LEAVE_ROOM` | Client → Server | Rời phòng. |
| `READY` | Client → Server | Thông báo sẵn sàng. |
| `START_GAME` | Client → Server | Yêu cầu chủ phòng bắt đầu ván. |
| `DEAL` | Server → Client | Gửi bài riêng cho từng người chơi. |
| `PLAY` | Client → Server | Yêu cầu đánh các lá bài được chọn. |
| `PASS` | Client → Server | Yêu cầu bỏ lượt. |
| `CHAT` | Hai chiều | Gửi và nhận tin nhắn trong phòng. |
| `ROOM_UPDATE` | Server → Client | Cập nhật trạng thái phòng. |
| `GAME_UPDATE` | Server → Client | Cập nhật lượt và trạng thái bàn chơi. |
| `ERROR` | Server → Client | Thông báo yêu cầu không hợp lệ hoặc lỗi xử lý. |
| `GAME_OVER` | Server → Client | Thông báo kết thúc ván và kết quả. |

## 5. Quy tắc xử lý thông điệp

### 5.1. Quy tắc chung

- Mỗi yêu cầu cần có `type` hợp lệ.
- Nếu có `requestId`, server dùng trường này để liên kết phản hồi với yêu cầu tương ứng.
- Server kiểm tra dữ liệu đầu vào trước khi xử lý.
- Yêu cầu không hợp lệ phải nhận phản hồi lỗi phù hợp.
- Client không được tự quyết định trạng thái chính thức của ván đấu.
- Không gửi toàn bộ bài trên tay của những người chơi khác cho client.

### 5.2. Xử lý yêu cầu đánh bài

Khi nhận thông điệp `PLAY`, server kiểm tra:

1. Người gửi có thuộc phòng đang chơi hay không.
2. Ván đấu có đang diễn ra hay không.
3. Người gửi có đúng lượt hay không.
4. Các lá bài được chọn có thuộc bài trên tay người gửi hay không.
5. Bộ bài được chọn có đúng tổ hợp và hợp lệ theo luật hiện hành hay không.
6. Nước đánh có hợp lệ với bộ bài đang bị chặn hay không.

Nếu hợp lệ, server cập nhật trạng thái ván và gửi `GAME_UPDATE` đến những người chơi liên quan. Nếu không hợp lệ, server gửi `ERROR` và không thay đổi trạng thái ván.

### 5.3. Xử lý yêu cầu bỏ lượt

Khi nhận `PASS`, server kiểm tra người gửi có đúng lượt và có được phép bỏ lượt trong tình huống hiện tại hay không. Nếu hợp lệ, server cập nhật lượt và thông báo trạng thái mới. Nếu không hợp lệ, server từ chối yêu cầu.

### 5.4. Xử lý mất kết nối

- Server phát hiện kết nối bị đóng hoặc hết thời gian chờ.
- Server cập nhật trạng thái kết nối của người chơi.
- Trong chế độ hai người hoặc đấu với Bot, nếu người chơi rời hoặc mất kết nối giữa ván, ván đấu kết thúc với kết quả hòa theo yêu cầu hiện tại của dự án.
- Trong chế độ bốn người, người chơi rời hoặc mất kết nối được xếp cuối và ván đấu tiếp tục với những người còn lại, theo quy tắc đã thống nhất.
- Chính sách kết nối lại cần được nhóm thống nhất và bổ sung trước khi triển khai.

## 6. Kế hoạch kiểm thử giao thức

| Mã kiểm thử | Tình huống | Dữ liệu hoặc thao tác | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Đăng nhập hợp lệ | Gửi `LOGIN` với thông tin đúng | Server xác thực và trả kết quả thành công. |
| TC02 | Đăng nhập sai | Gửi thông tin đăng nhập không đúng | Server từ chối và trả thông báo lỗi phù hợp. |
| TC03 | Tạo phòng hợp lệ | Gửi `CREATE_ROOM` với chế độ hợp lệ | Phòng được tạo và trả mã phòng. |
| TC04 | Tham gia phòng hợp lệ | Gửi `JOIN_ROOM` với mã phòng tồn tại và còn chỗ | Người chơi được thêm vào phòng. |
| TC05 | Tham gia phòng không hợp lệ | Mã phòng không tồn tại hoặc phòng đã đầy | Server từ chối yêu cầu. |
| TC06 | Bắt đầu ván hợp lệ | Chủ phòng yêu cầu bắt đầu khi đủ điều kiện | Server bắt đầu ván và chia bài theo chế độ. |
| TC07 | Bắt đầu ván sai điều kiện | Người không phải chủ phòng yêu cầu bắt đầu | Server từ chối yêu cầu. |
| TC08 | Đánh bài đúng lượt | Gửi `PLAY` với bộ bài hợp lệ | Server cập nhật bài và lượt chơi. |
| TC09 | Đánh bài sai lượt | Người chơi chưa đến lượt gửi `PLAY` | Server từ chối, trạng thái ván không đổi. |
| TC10 | Đánh lá bài không sở hữu | Chọn lá bài không nằm trong bài trên tay | Server từ chối nước đánh. |
| TC11 | Đánh bộ bài không hợp lệ | Gửi tổ hợp không đúng luật | Server từ chối nước đánh. |
| TC12 | Bỏ lượt hợp lệ | Gửi `PASS` trong tình huống được phép | Server cập nhật lượt chơi. |
| TC13 | Gửi thông điệp sai định dạng | JSON không hợp lệ hoặc thiếu trường bắt buộc | Server xử lý lỗi an toàn, không làm dừng toàn bộ dịch vụ. |
| TC14 | Gửi loại thông điệp không hỗ trợ | `type` không nằm trong danh sách cho phép | Server trả lỗi phù hợp. |
| TC15 | Gửi tin nhắn trong phòng | Gửi `CHAT` từ thành viên hợp lệ | Tin nhắn được chuyển đến thành viên trong phòng theo thiết kế. |
| TC16 | Mất kết nối giữa ván | Đóng kết nối client đang chơi | Server xử lý theo quy tắc của chế độ chơi. |
| TC17 | Hai yêu cầu đến gần đồng thời | Gửi nhiều yêu cầu thay đổi trạng thái liên tiếp | Server xử lý tuần tự hoặc đồng bộ, không tạo trạng thái mâu thuẫn. |
| TC18 | Nhận thông điệp TCP bị chia nhỏ | Chia một thông điệp thành nhiều lần gửi | Server ghép và xử lý đúng một thông điệp hoàn chỉnh. |
| TC19 | Nhận nhiều thông điệp cùng lúc | Gửi liên tiếp nhiều thông điệp trên một kết nối | Server phân tách và xử lý từng thông điệp chính xác. |

## 7. Tiêu chí đánh giá

- Tất cả thông điệp hợp lệ được xử lý đúng theo đặc tả.
- Thông điệp không hợp lệ bị từ chối và không làm sai lệch trạng thái ván đấu.
- Client nhận được cập nhật trạng thái cần thiết.
- Không để client xem bài riêng của người chơi khác.
- Server tiếp tục hoạt động khi nhận dữ liệu sai định dạng hoặc gặp lỗi kết nối.
- Kết quả kiểm thử được ghi lại để nhóm có thể đối chiếu và sửa lỗi.

## 8. Bảng ghi nhận kết quả kiểm thử

Nhóm điền bảng này sau khi chạy thử giao thức thực tế.

| Mã kiểm thử | Kết quả thực tế | Trạng thái | Ghi chú |
|---|---|---|---|
| TC01 | Chưa thực hiện | Chưa kiểm thử | |
| TC02 | Chưa thực hiện | Chưa kiểm thử | |
| TC03 | Chưa thực hiện | Chưa kiểm thử | |
| TC04 | Chưa thực hiện | Chưa kiểm thử | |
| TC05 | Chưa thực hiện | Chưa kiểm thử | |

Có thể bổ sung các dòng cho những mã kiểm thử còn lại sau khi triển khai.

## 9. Lưu ý triển khai

Tài liệu này là đặc tả và kế hoạch kiểm thử ở giai đoạn thiết kế. Chỉ đánh dấu kiểm thử đạt sau khi đã chạy thử và có kết quả thực tế. Định dạng thông điệp, tên trường, mã lỗi và chính sách xử lý kết nối cần thống nhất với tài liệu `docs/tcp-protocol.md` trước khi lập trình.