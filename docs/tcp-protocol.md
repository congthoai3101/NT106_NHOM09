# ĐẶC TẢ GIAO THỨC TRUYỀN THÔNG TCP SOCKET (TCP PROTOCOL SPECIFICATION)
**Dự án:** Game Đánh bài Tiến Lên Miền Nam Desktop App  
**Môn học:** NT106 — Lập trình mạng căn bản  
**Nhóm thực hiện:** Nhóm 09  
**Người phụ trách chính:** Quang (Phụ trách thiết kế giao thức TCP)  
**Phiên bản:** 1.0 — Bản đặc tả chuẩn kỹ thuật  

---

## 1. TỔNG QUAN VÀ NGUYÊN TẮC THIẾT KẾ

### 1.1. Mục tiêu
Tài liệu này đặc tả toàn bộ quy chuẩn truyền thông tầng ứng dụng qua giao thức **TCP Socket** giữa **Desktop Client (Electron + TypeScript)** và **Game Server (Node.js + TypeScript)**. 

### 1.2. Nguyên tắc Kiến trúc Cốt lõi
1. **Server-Authoritative (Máy chủ là thẩm quyền tuyệt đối):**
   - Máy chủ lưu trữ trạng thái thực tế duy nhất của ván bài (Single Source of Truth).
   - Mọi hành động của người chơi (vào phòng, đánh bài, bỏ lượt, bắt đầu ván) chỉ là **Yêu cầu (Request)**. Máy chủ phải xác thực luật chơi, quyền sở hữu lá bài và thứ tự lượt trước khi chấp thuận và cập nhật trạng thái.
2. **Bảo mật và Chống gian lận (Anti-Cheat / Anti-Peeking):**
   - Khi chia bài, máy chủ **chỉ gửi danh sách 13 lá bài của Player X cho chính socket của Player X**.
   - Với các người chơi khác trong phòng, máy chủ chỉ thông báo số lượng lá còn lại trên tay (`remainingCount: 13`). Tuyệt đối không gửi mảng bài của đối thủ về client để ngăn chặn triệt để hành vi can thiệp bộ nhớ hoặc bắt gói tin (packet sniffing).
3. **Đồng bộ hóa phi trạng thái ván đấu qua Snapshot:**
   - Khi người chơi bị rớt mạng và kết nối lại trong thời gian cho phép, máy chủ cung cấp gói tin ảnh chụp trạng thái (State Snapshot) để client khôi phục giao diện tức thì.

---

## 2. ĐẶC TẢ TẦNG ĐÓNG GÓI DỮ LIỆU (FRAMING LAYER)

### 2.1. Vấn đề Dính gói (Sticky Packet) và Xé gói (Packet Fragmentation)
TCP là giao thức truyền luồng byte liên tục (**Byte-stream Oriented**), không có ranh giới tin nhắn (Message Boundary). Khi gửi nhiều gói tin liên tiếp, cơ chế đệm của hệ điều hành và thuật toán Nagle có thể gộp nhiều thông điệp thành một lần nhận (`recv()`), hoặc xé nhỏ một thông điệp JSON dài thành nhiều lần nhận.

### 2.2. Giải pháp: Length-Prefixed Framing với Magic Bytes
Mỗi gói tin trao đổi qua TCP bắt buộc phải tuân theo cấu trúc khung nhị phân cố định **8 bytes Header** ở đầu, theo sau là dữ liệu Payload dạng JSON UTF-8:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       Magic (0x544C)          |          OpCode               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Payload Length (N)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                     Payload Data (JSON UTF-8)                 +
|                           ... N bytes                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

| Byte Offset | Độ dài | Tên trường | Kiểu dữ liệu | Mô tả |
| :---: | :---: | :--- | :--- | :--- |
| `0..1` | 2 | **Magic Bytes** | `UInt16` (Big-Endian) | Luôn cố định là `0x544C` (tương ứng hai ký tự ASCII `"TL"` — Tiến Lên). Dùng nhận diện gói tin hợp lệ và loại bỏ rác kết nối. |
| `2..3` | 2 | **OpCode** | `UInt16` (Big-Endian) | Mã lệnh định danh loại hành động (Operation Code). |
| `4..7` | 4 | **Payload Length** | `UInt32` (Big-Endian) | Chiều dài byte ($N$) của khối dữ liệu Payload theo sau. Tối đa 65,536 bytes. |
| `8..N+7` | $N$ | **Payload Data** | `UTF-8 String` | Chuỗi nội dung định dạng JSON chứa các trường dữ liệu chi tiết. |

---

## 3. QUY CHUẨN BIỂU DIỄN THỂ THỨC GAME TRONG MẠNG

### 3.1. Mã hóa 52 Lá bài (Card Integer ID: `0..51`)
Để tối ưu băng thông mạng và đơn giản hóa thuật toán so sánh bài, mỗi lá bài được đại diện bằng một số nguyên duy nhất từ `0` đến `51`:

$$\text{CardID} = (\text{RankID} \times 4) + \text{SuitID}$$

* **Quy ước RankID (Độ mạnh số bài Tiến Lên):**
  * `0: 3`, `1: 4`, `2: 5`, `3: 6`, `4: 7`, `5: 8`, `6: 9`, `7: 10`, `8: J`, `9: Q`, `10: K`, `11: A`, `12: 2` (Heo)
* **Quy ước SuitID (Thứ tự chất bài từ bé đến lớn):**
  * `0: Bích (♠)` $<$ `1: Chuồn (♣)` $<$ `2: Rô (♦)` $<$ `3: Cơ (♥)`

#### Bảng tra cứu CardID nhanh:
| Quân bài | Bích (♠) `Suit=0` | Chuồn (♣) `Suit=1` | Rô (♦) `Suit=2` | Cơ (♥) `Suit=3` |
| :---: | :---: | :---: | :---: | :---: |
| **3** | `0` *(nhỏ nhất)* | `1` | `2` | `3` |
| **4** | `4` | `5` | `6` | `7` |
| **5** | `8` | `9` | `10` | `11` |
| **...** | ... | ... | ... | ... |
| **A (Át)** | `44` | `45` | `46` | `47` |
| **2 (Heo)** | `48` | `49` | `50` | `51` *(lớn nhất)* |

* **Quy tắc giải mã nhanh phía Client/Server:**
  * $\text{Rank} = \lfloor \text{CardID} / 4 \rfloor$
  * $\text{Suit} = \text{CardID} \pmod 4$

### 3.2. Mã hóa Tổ hợp bài (`CombinationType`)
* `SINGLE`: Bài lẻ (Rác).
* `PAIR`: Đôi (2 lá cùng Rank).
* `TRIPLE`: Sám cô (3 lá cùng Rank).
* `STRAIGHT`: Sảnh (từ 3 lá có Rank liên tiếp trở lên, không chứa Heo).
* `FOUR_OF_A_KIND`: Tứ quý (4 lá cùng Rank).
* `THREE_PAIRS_CHAIN`: 3 đôi thông (3 đôi có Rank liên tiếp).
* `FOUR_PAIRS_CHAIN`: 4 đôi thông (4 đôi có Rank liên tiếp).

---

## 4. HỆ THỐNG MÃ LỆNH (OPCODES SPECIFICATION)

### Quy ước tiền tố mã lệnh:
* `_REQ`: Yêu cầu gửi từ Client lên Server.
* `_RES`: Phản hồi riêng cho Client gửi yêu cầu.
* `_BC`: Phát tán (Broadcast) đồng thời tới tất cả người chơi trong phòng.

| OpCode | Tên Mã Lệnh | Hướng truyền | Mục đích nghiệp vụ |
| :---: | :--- | :---: | :--- |
| **Dải 1000s** | **XÁC THỰC & PHIÊN** | | |
| `1001` | `AUTH_TOKEN_REQ` | Client ➔ Server | Xác thực socket bằng Supabase JWT Token |
| `1002` | `AUTH_TOKEN_RES` | Server ➔ Client | Kết quả xác thực (thành công kèm profile) |
| `1003` | `HEARTBEAT_PING` | Client ➔ Server | Giữ kết nối socket (mỗi 5s - 10s) |
| `1004` | `HEARTBEAT_PONG` | Server ➔ Client | Phản hồi xác nhận sống kết nối |
| `1005` | `RECONNECT_REQ` | Client ➔ Server | Yêu cầu vào lại ván đấu sau khi rớt mạng |
| `1006` | `RECONNECT_RES` | Server ➔ Client | Phục hồi phiên và gửi State Snapshot |
| **Dải 2000s** | **QUẢN LÝ PHÒNG** | | |
| `2001` | `CREATE_ROOM_REQ` | Client ➔ Server | Tạo phòng mới (chọn chế độ 2/4/Bot) |
| `2002` | `CREATE_ROOM_RES` | Server ➔ Client | Trả về mã phòng `roomCode` |
| `2003` | `JOIN_ROOM_REQ` | Client ➔ Server | Xin vào phòng bằng mã `roomCode` |
| `2004` | `JOIN_ROOM_RES` | Server ➔ Client | Kết quả vào phòng |
| `2005` | `ROOM_USER_JOINED_BC` | Server ➔ Broadcast | Thông báo người mới tham gia phòng |
| `2007` | `LEAVE_ROOM_REQ` | Client ➔ Server | Người chơi chủ động rời phòng |
| `2008` | `LEAVE_ROOM_RES` | Server ➔ Client | Xác nhận rời phòng thành công |
| `2009` | `ROOM_USER_LEFT_BC` | Server ➔ Broadcast | Thông báo người chơi đã rời phòng |
| `2011` | `PLAYER_READY_REQ` | Client ➔ Server | Thay đổi trạng thái Sẵn sàng (`isReady`) |
| `2012` | `PLAYER_READY_BC` | Server ➔ Broadcast | Cập nhật trạng thái sẵn sàng của người chơi |
| `2013` | `START_GAME_REQ` | Client (Host) ➔ Server | Chủ phòng bấm bắt đầu ván bài |
| `2014` | `START_GAME_RES` | Server ➔ Client (Host) | Phản hồi lỗi nếu chưa đủ điều kiện |
| **Dải 3000s** | **VÒNG ĐỜI VÁN BÀI** | | |
| `3001` | `GAME_DEAL_CARDS_BC` | Server ➔ Client (Riêng)| Gửi 13 lá bài cho riêng client sở hữu |
| `3003` | `GAME_TURN_NOTIFY_BC` | Server ➔ Broadcast | Thông báo lượt đánh và thời gian chờ (15s) |
| `3005` | `PLAY_CARDS_REQ` | Client ➔ Server | Người chơi gửi danh sách các lá bài muốn đánh |
| `3006` | `PLAY_CARDS_RES` | Server ➔ Client | Phản hồi hợp lệ / lỗi vi phạm luật |
| `3007` | `PLAY_CARDS_BC` | Server ➔ Broadcast | Phát tán các lá bài vừa ra lên bàn chơi |
| `3009` | `PASS_TURN_REQ` | Client ➔ Server | Người chơi bấm Bỏ lượt |
| `3010` | `PASS_TURN_RES` | Server ➔ Client | Phản hồi xác nhận bỏ lượt |
| `3011` | `PASS_TURN_BC` | Server ➔ Broadcast | Thông báo người chơi đã bỏ lượt trong vòng |
| `3013` | `ROUND_RESET_BC` | Server ➔ Broadcast | Tất cả bỏ lượt, người cuối mở vòng mới |
| `3015` | `SPECIAL_ACTION_BC` | Server ➔ Broadcast | Hiệu ứng đặc biệt (Chặt heo, Tứ quý, Thối heo) |
| `3017` | `GAME_OVER_BC` | Server ➔ Broadcast | Kết thúc ván, bảng tổng kết hạng & điểm |
| **Dải 4000s** | **CHAT & HỆ THỐNG** | | |
| `4001` | `CHAT_MSG_REQ` | Client ➔ Server | Gửi tin nhắn trò chuyện trong phòng |
| `4002` | `CHAT_MSG_BC` | Server ➔ Broadcast | Phát tán tin nhắn tới mọi người trong phòng |
| `4003` | `VOICE_SIGNAL_REQ` | Client ➔ Server | Gửi gói tin báo hiệu WebRTC SDP/Candidate |
| `4004` | `VOICE_SIGNAL_BC` | Server ➔ Client khác | Chuyển tiếp tín hiệu thoại WebRTC |
| `4999` | `SYSTEM_ERROR_NOTIFY`| Server ➔ Client | Báo lỗi hệ thống hoặc ngắt kết nối cưỡng bức |

---

## 5. CẤU TRÚC CHI TIẾT PAYLOAD CÁC GÓI TIN CHÍNH

### 5.1. Xác thực Kết nối Socket
#### Client gửi yêu cầu xác thực (`OpCode 1001: AUTH_TOKEN_REQ`):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
#### Server phản hồi thành công (`OpCode 1002: AUTH_TOKEN_RES`):
```json
{
  "success": true,
  "profile": {
    "id": "e6a0d2f1-5f33-4f93-b67e-4050a41d9901",
    "username": "quang_uit",
    "avatarUrl": "https://api.dicebear.com/7.x/bottts/svg?seed=quang"
  }
}
```

---

### 5.2. Quản lý Phòng chơi
#### Tạo phòng (`OpCode 2001: CREATE_ROOM_REQ`):
```json
{
  "mode": "PVP_FOUR",
  "maxPlayers": 4
}
```
#### Phản hồi tạo phòng (`OpCode 2002: CREATE_ROOM_RES`):
```json
{
  "success": true,
  "room": {
    "id": "room_uuid_1234",
    "roomCode": "TL8899",
    "hostId": "e6a0d2f1-5f33-4f93-b67e-4050a41d9901",
    "mode": "PVP_FOUR",
    "maxPlayers": 4,
    "status": "WAITING"
  }
}
```

#### Thông báo có người chơi mới vào phòng (`OpCode 2005: ROOM_USER_JOINED_BC`):
```json
{
  "player": {
    "id": "player_uuid_4567",
    "username": "thoai_dev",
    "avatarUrl": null,
    "isReady": false,
    "isHost": false
  },
  "currentCount": 2,
  "maxPlayers": 4
}
```

---

### 5.3. Bắt đầu Ván & Chia bài (Core Gameplay)
#### Chia bài (`OpCode 3001: GAME_DEAL_CARDS_BC`):
> [!IMPORTANT]
> Gói tin này được Server mã hóa và gửi **riêng lẻ cho từng Client**. Mảng `myCards` chỉ chứa 13 lá của chính người nhận. Đối với các người chơi khác, chỉ gửi tổng số lá trong `playerCardCounts`.

```json
{
  "matchId": "match_9921b7",
  "firstTurnPlayerId": "e6a0d2f1-5f33-4f93-b67e-4050a41d9901",
  "reason": "Sở hữu lá 3 Bích (CardID: 0)",
  "myCards": [0, 4, 7, 12, 16, 21, 28, 33, 39, 44, 48, 50, 51],
  "playerCardCounts": {
    "e6a0d2f1-5f33-4f93-b67e-4050a41d9901": 13,
    "player_uuid_4567": 13,
    "player_uuid_8899": 13,
    "player_uuid_1122": 13
  }
}
```

#### Yêu cầu Đánh bài (`OpCode 3005: PLAY_CARDS_REQ`):
```json
{
  "cards": [48, 49],
  "combination": "PAIR"
}
```

#### Phát tán Nước đánh Hợp lệ (`OpCode 3007: PLAY_CARDS_BC`):
```json
{
  "playerId": "e6a0d2f1-5f33-4f93-b67e-4050a41d9901",
  "cards": [48, 49],
  "combination": "PAIR",
  "remainingCardCount": 11,
  "nextTurnPlayerId": "player_uuid_4567",
  "timeLimitSeconds": 15
}
```

#### Bỏ lượt (`OpCode 3009: PASS_TURN_REQ` & `3011: PASS_TURN_BC`):
```json
{
  "playerId": "player_uuid_4567",
  "nextTurnPlayerId": "player_uuid_8899",
  "timeLimitSeconds": 15
}
```

#### Vòng mới (`OpCode 3013: ROUND_RESET_BC`):
```json
{
  "leaderPlayerId": "e6a0d2f1-5f33-4f93-b67e-4050a41d9901",
  "message": "Tất cả đối thủ đã bỏ lượt. Vòng mới bắt đầu!"
}
```

---

### 5.4. Kết thúc Ván & Tính điểm (`OpCode 3017: GAME_OVER_BC`)
```json
{
  "matchId": "match_9921b7",
  "endedAt": "2026-10-26T08:50:00Z",
  "standings": [
    {
      "playerId": "e6a0d2f1-5f33-4f93-b67e-4050a41d9901",
      "placement": 1,
      "title": "Nhất",
      "pointsEarned": 20,
      "remainingCards": []
    },
    {
      "playerId": "player_uuid_4567",
      "placement": 2,
      "title": "Nhì",
      "pointsEarned": 10,
      "remainingCards": [35, 41]
    },
    {
      "playerId": "player_uuid_8899",
      "placement": 3,
      "title": "Ba",
      "pointsEarned": -10,
      "remainingCards": [14, 20, 22]
    },
    {
      "playerId": "player_uuid_1122",
      "placement": 4,
      "title": "Bét",
      "pointsEarned": -20,
      "remainingCards": [50]
    }
  ]
}
```

---

## 6. QUẢN LÝ PHIÊN, HEARTBEAT & XỬ LÝ RỚT MẠNG (RECONNECTION)

### 6.1. Keep-Alive / Heartbeat (Ping - Pong)
* Client gửi `HEARTBEAT_PING` định kỳ mỗi **5 giây**.
* Server phản hồi `HEARTBEAT_PONG`.
* Nếu sau **15 giây** Server không nhận được bất kỳ packet nào từ client, socket sẽ bị coi là rớt mạng (Dead Connection) và tiến hành đóng tài nguyên socket.

### 6.2. Cơ chế Xử lý Rớt mạng & Thời gian Ân hạn 30 giây (Grace Period)
Khi một kết nối socket bị đứt đột ngột trong khi ván bài đang diễn ra:
1. Server không hủy ván bài ngay, mà chuyển trạng thái người chơi sang `DISCONNECTED`.
2. Server kích hoạt bộ đếm thời gian ân hạn **30 giây (Grace Period)**.
3. Server phát tán thông báo `PLAYER_DISCONNECTED_BC` cho các người chơi còn lại trong phòng.
4. Nếu đến lượt đánh của người bị rớt mạng, hệ thống tự động đếm ngược hết 15s và kích hoạt `PASS_TURN_REQ` (tự động bỏ lượt) để bàn chơi không bị nghẽn.

### 6.3. Khôi phục Phiên khi Kết nối lại (`OpCode 1005 / 1006`)
Nếu người chơi mở lại ứng dụng trong vòng 30 giây, Client gửi `RECONNECT_REQ`. Server phản hồi `RECONNECT_RES` kèm **State Snapshot** đầy đủ:
```json
{
  "success": true,
  "matchId": "match_9921b7",
  "roomCode": "TL8899",
  "currentTurnPlayerId": "player_uuid_8899",
  "turnTimeRemaining": 9,
  "myCards": [7, 16, 28, 44],
  "tableCards": [48, 49],
  "lastCombination": "PAIR",
  "passedPlayerIds": ["player_uuid_4567"],
  "playerCardCounts": {
    "e6a0d2f1-5f33-4f93-b67e-4050a41d9901": 4,
    "player_uuid_4567": 6,
    "player_uuid_8899": 2,
    "player_uuid_1122": 8
  }
}
```

### 6.4. Xử lý Quá hạn 30 giây (Timeout Penalties)
* **Chế độ 4 người:** Người chơi bị rớt mạng quá 30 giây sẽ bị Server gán trực tiếp **vị trí BÉT**, bị trừ điểm ELO tối đa, và ván bài tiếp tục bình thường giữa 3 người còn lại.
* **Chế độ 2 người & Đấu Bot:** Ván bài lập tức kết thúc và xử hòa (hoặc người còn lại được xử thắng).

---

## 7. BẢNG MÃ LỖI HỆ THỐNG (SYSTEM ERROR CODES)

Mọi phản hồi thất bại hoặc thông báo lỗi từ máy chủ đều sử dụng cấu trúc:
```json
{
  "errorCode": 3004,
  "message": "Bài đánh ra không hợp lệ hoặc không đủ lớn để đè bài trên bàn."
}
```

| Mã lỗi | Hằng số lỗi | Nguyên nhân & Mô tả chi tiết |
| :---: | :--- | :--- |
| **1001** | `ERR_UNAUTHORIZED` | Token JWT không hợp lệ hoặc đã hết hạn |
| **1002** | `ERR_SESSION_TERMINATED` | Tài khoản đăng nhập từ nơi khác |
| **1003** | `ERR_RECONNECT_EXPIRED` | Phiên chơi đã kết thúc hoặc quá thời gian 30s ân hạn |
| **2001** | `ERR_ROOM_NOT_FOUND` | Mã phòng không tồn tại |
| **2002** | `ERR_ROOM_FULL` | Phòng đã đủ số lượng người chơi tối đa |
| **2003** | `ERR_NOT_ROOM_HOST` | Chỉ chủ phòng mới có quyền bấm Bắt đầu ván bài |
| **2004** | `ERR_PLAYERS_NOT_READY`| Chưa đủ người chơi hoặc có thành viên chưa bấm Sẵn sàng |
| **2005** | `ERR_ALREADY_IN_ROOM` | Người chơi đang ở trong một phòng khác |
| **3001** | `ERR_NOT_YOUR_TURN` | Đánh bài hoặc bỏ lượt khi chưa đến lượt mình |
| **3002** | `ERR_CARDS_NOT_IN_HAND` | Gửi lá bài mà người chơi không sở hữu (phát hiện gian lận) |
| **3003** | `ERR_INVALID_COMBINATION`| Tổ hợp lá bài gửi lên không đúng luật Tiến Lên Miền Nam |
| **3004** | `ERR_CANNOT_BEAT_PREVIOUS`| Bài đánh ra không đủ mạnh để đè bài của người đi trước |
| **3005** | `ERR_MUST_CONTAIN_THREE_SPADE`| Ván đầu tiên bắt buộc phải đánh lá 3 Bích (CardID: 0) |
| **3006** | `ERR_CANNOT_PASS_NEW_ROUND`| Người mở đầu vòng mới bắt buộc phải ra bài, không được bỏ lượt |
| **3007** | `ERR_TURN_TIMEOUT` | Hết thời gian chờ lượt đánh (15 giây) |
| **4001** | `ERR_CHAT_SPAM` | Tần suất gửi tin nhắn chat quá nhanh |
| **5000** | `ERR_INTERNAL_SERVER` | Lỗi ngoại lệ nội bộ của máy chủ game |

---



