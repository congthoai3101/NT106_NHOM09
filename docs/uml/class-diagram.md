# CLASS DIAGRAM — GAME TIẾN LÊN MIỀN NAM

**Dự án:** NT106 — Nhóm 9

## 1. Sơ đồ lớp đề xuất

```mermaid
classDiagram
    class Client {
        +connect()
        +disconnect()
        +sendRequest()
        +receiveEvent()
    }

    class NetworkManager {
        +handleConnection()
        +receiveMessage()
        +sendMessage()
        +broadcastRoomState()
    }

    class RoomManager {
        +createRoom()
        +joinRoom()
        +leaveRoom()
        +startGame()
    }

    class Room {
        +roomId
        +mode
        +status
        +addPlayer()
        +removePlayer()
        +canStart()
    }

    class Player {
        +playerId
        +username
        +score
        +hand
        +playCards()
        +passTurn()
    }

    class Bot {
        +difficulty
        +chooseMove()
    }

    class Game {
        +currentTurn
        +gameStatus
        +dealCards()
        +validateMove()
        +nextTurn()
        +checkGameOver()
    }

    class Card {
        +rank
        +suit
    }

    class Hand {
        +cards
        +addCard()
        +removeCards()
    }

    class ScoreManager {
        +calculateResult()
        +updateScore()
        +getLeaderboard()
    }

    Client --> NetworkManager : gửi/nhận
    NetworkManager --> RoomManager : chuyển yêu cầu
    RoomManager --> Room : quản lý
    Room "1" o-- "2..4" Player : thành viên
    Room "1" *-- "0..1" Game : ván hiện tại
    Player <|-- Bot
    Player "1" *-- "1" Hand : sở hữu
    Hand "1" o-- "*" Card : chứa
    Game --> Player : quản lý lượt
    Game --> Card : kiểm tra tổ hợp
    Game --> ScoreManager : gửi kết quả
```

## 2. Trách nhiệm của từng lớp

| Lớp              | Trách nhiệm                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `Client`         | Giao tiếp giữa giao diện người chơi và hệ thống mạng               |
| `NetworkManager` | Nhận yêu cầu, gửi thông điệp và đồng bộ dữ liệu                    |
| `RoomManager`    | Tạo phòng, tham gia phòng, rời phòng và kiểm tra điều kiện bắt đầu |
| `Room`           | Lưu mã phòng, chế độ, trạng thái và danh sách thành viên           |
| `Player`         | Lưu thông tin người chơi và thực hiện hành động trong lượt         |
| `Bot`            | Đưa ra nước đánh theo cấp độ khó                                   |
| `Game`           | Quản lý chia bài, lượt đánh, luật chơi và kết thúc ván             |
| `Card`           | Biểu diễn một lá bài bằng giá trị và chất                          |
| `Hand`           | Quản lý các lá bài trên tay một người chơi                         |
| `ScoreManager`   | Tính điểm, cập nhật kết quả và cung cấp bảng xếp hạng              |