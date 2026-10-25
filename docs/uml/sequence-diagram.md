# SEQUENCE DIAGRAM — GAME TIẾN LÊN MIỀN NAM

**Dự án:** NT106 — Nhóm 9

## 1. Sequence Diagram: Tạo và tham gia phòng

```mermaid
sequenceDiagram
    actor A as Người chơi A
    actor B as Người chơi B
    participant C as Client
    participant S as Game Server
    participant RM as RoomManager
    participant R as Room

    A->>C: Chọn tạo phòng
    C->>S: CREATE_ROOM(mode)
    S->>RM: createRoom(mode)
    RM->>R: Khởi tạo phòng
    R-->>RM: Thông tin phòng
    RM-->>S: Room ID
    S-->>C: CREATE_ROOM_SUCCESS
    C-->>A: Hiển thị mã phòng

    B->>C: Nhập mã phòng
    C->>S: JOIN_ROOM(roomId)
    S->>RM: joinRoom(roomId, B)

    alt Phòng hợp lệ và còn chỗ
        RM->>R: addPlayer(B)
        R-->>RM: Cập nhật thành viên
        RM-->>S: JOIN_SUCCESS
        S-->>C: JOIN_ROOM_SUCCESS
        S-->>C: ROOM_UPDATED
        C-->>A: Cập nhật sảnh phòng
        C-->>B: Hiển thị phòng đã tham gia
    else Phòng không hợp lệ hoặc đã đầy
        RM-->>S: JOIN_FAILED
        S-->>C: Thông báo lỗi
        C-->>B: Hiển thị lý do thất bại
    end
```

## 2. Sequence Diagram: Bắt đầu ván và đánh bài

```mermaid
sequenceDiagram
    actor H as Chủ phòng
    actor P as Người chơi
    participant C as Client
    participant S as Game Server
    participant G as Game

    H->>C: Nhấn bắt đầu
    C->>S: START_GAME(roomId)
    S->>G: Kiểm tra điều kiện bắt đầu

    alt Đủ người và phòng hợp lệ
        G->>G: Khởi tạo ván và chia bài
        G->>G: Xác định người có 3 bích
        S-->>C: GAME_STARTED
        S-->>C: Trạng thái bàn chơi phù hợp với từng người
        C-->>P: Hiển thị bài và lượt đi
    else Chưa đủ điều kiện
        S-->>C: START_GAME_FAILED
        C-->>H: Hiển thị thông báo
    end

    P->>C: Chọn bài muốn đánh
    C->>S: PLAY_CARDS(cards)
    S->>G: validateMove(player, cards)

    alt Nước đánh hợp lệ
        G->>G: Cập nhật bài và lượt
        G->>G: Kiểm tra kết thúc ván
        S-->>C: MOVE_ACCEPTED
        S-->>C: GAME_STATE_UPDATED
        C-->>P: Cập nhật bàn chơi
    else Nước đánh không hợp lệ
        S-->>C: MOVE_REJECTED
        C-->>P: Hiển thị lý do không hợp lệ
    end
```

## 3. Sequence Diagram: Xử lý người chơi mất kết nối

```mermaid
sequenceDiagram
    participant S as Game Server
    participant R as Room
    participant G as Game
    participant P as Người chơi còn lại

    S->>R: Phát hiện người chơi mất kết nối
    R->>G: Xử lý theo chế độ

    alt Đấu 2 người hoặc đấu với Bot
        G->>G: Kết thúc ván với kết quả hòa
        S-->>P: GAME_OVER_DRAW
    else Đấu 4 người
        G->>G: Ghi nhận người chơi về bét
        G->>G: Tiếp tục ván với người còn lại
        S-->>P: GAME_STATE_UPDATED
    end
```

## 4. Lưu ý triển khai

- Các tên thông điệp trong sơ đồ là tên đề xuất, nhóm có thể thay đổi theo giao thức thực tế.
- Server phải xác thực yêu cầu trước khi cập nhật trạng thái game.
- Dữ liệu bài trên tay phải được gửi riêng cho đúng người chơi; không phát tán bài riêng trong thông điệp đồng bộ chung.
- Luồng mất kết nối trong chế độ 4 người cần được thống nhất thêm về việc giữ kết quả người về bét và khả năng kết nối lại.
