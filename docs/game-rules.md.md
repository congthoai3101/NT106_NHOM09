# GAME RULES — TIẾN LÊN MIỀN NAM

* **Dự án:** NT106 — Nhóm 9  
* **Phiên bản:** 0.1  
* **Trạng thái:** Dự kiến  

---

## 1. Mục tiêu trò chơi

Người chơi cố gắng đánh hết các lá bài trên tay trước những người chơi còn lại. Hệ thống ghi nhận thứ hạng, kết quả ván và cập nhật điểm theo chế độ chơi.

---

## 2. Chế độ chơi và bộ bài

### 2.1. Các chế độ chơi

| Chế độ | Số người tham gia | Mô tả |
| :--- | :--- | :--- |
| **Đấu 2 người** | 2 người thật | Hai người chơi thật đấu với nhau. |
| **Đấu 4 người** | 4 người thật | Bốn người chơi thật cùng tham gia một ván. |
| **Đấu với Bot** | 1 người thật + 1 Bot | Người chơi đấu với Bot trong phòng 2 người. |

* Người dùng tự chọn chế độ chơi.
* Bot chỉ xuất hiện trong chế độ đấu 2 người.
* Không cho phép thêm Bot vào phòng đang thiếu người.
* Trước khi bắt đầu, hệ thống kiểm tra số người tham gia phù hợp với chế độ.

### 2.2. Bộ bài và chia bài

* Sử dụng bộ bài Tây 52 lá, không bao gồm Joker.
* **Đấu 4 người:** mỗi người nhận 13 lá.
* **Đấu 2 người và đấu với Bot:** cách chia bài áp dụng tương tự, mỗi người nhận 13 lá.
* Mỗi lá bài chỉ được chia cho một người trong cùng ván.
* Người chơi chỉ được xem bài trên tay của chính mình.

### 2.3. Xác định người đi đầu

* Ở đầu ván game, người sở hữu lá 3 bích được xác định là người đi đầu.
* Máy chủ xác định người sở hữu 3 bích sau khi chia bài và thông báo lượt đi đầu cho phòng.
* Quy tắc này được áp dụng khi bắt đầu ván game.

---

## 3. Thứ tự giá trị lá bài

### 3.1. Thứ tự số

$$3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2$$

* `3` là lá thấp nhất và `2` là lá cao nhất về giá trị số.

### 3.2. Thứ tự chất

Quy ước dự kiến:

$$\text{Bích} < \text{Chuồn} < \text{Rô} < \text{Cơ}$$

*(Thứ tự chất và phạm vi sử dụng vẫn cần nhóm xác nhận.)*

---

## 4. Các tổ hợp bài

| Tổ hợp | Mô tả |
| :--- | :--- |
| **Bài lẻ** | Một lá bài |
| **Đôi** | Hai lá cùng giá trị số |
| **Sám cô** | Ba lá cùng giá trị số |
| **Sảnh** | Từ 3 lá liên tiếp trở lên |
| **Tứ quý** | Bốn lá cùng giá trị số |
| **Ba đôi thông** | Ba đôi có giá trị liên tiếp |
| **Bốn đôi thông** | Bốn đôi có giá trị liên tiếp |

* Ba đôi thông và bốn đôi thông được hỗ trợ.
* Sảnh rồng không thuộc phạm vi hỗ trợ hiện tại.
* Điều kiện chính xác của sảnh cần được nhóm xác nhận.

---

## 5. Luật đánh bài

### 5.1. Thực hiện lượt

* Chỉ người đang có lượt mới được đánh bài hoặc bỏ lượt.
* Người chơi chọn bài và gửi yêu cầu lên máy chủ.
* Máy chủ kiểm tra lượt chơi, quyền sở hữu bài và tính hợp lệ của tổ hợp.
* Nếu hợp lệ, máy chủ cập nhật và đồng bộ trạng thái bàn chơi.
* Nếu không hợp lệ, máy chủ từ chối hành động và giữ nguyên trạng thái ván.

### 5.2. Mở lượt và chặn bài

* Người mở vòng được đánh một tổ hợp hợp lệ.
* Người chơi tiếp theo phải có nước đánh chặn hợp lệ.
* Không được dùng tổ hợp khác loại để chặn nếu luật không cho phép.
* Máy chủ xác thực cuối cùng mọi nước đánh.

### 5.3. Bỏ lượt

* Người chơi chỉ bỏ lượt khi không có nước đánh chặn hợp lệ.
* Người đã bỏ lượt không được tham gia lại trong vòng đó.
* Khi những người còn quyền đánh đều bỏ lượt, vòng kết thúc.
* Người đánh hợp lệ cuối cùng được mở vòng mới.

---

## 6. Luật chặt heo và tổ hợp đặc biệt

Game hỗ trợ ba đôi thông và bốn đôi thông để chặt heo.  
Máy chủ phải xác thực tính hợp lệ của tổ hợp chặt trước khi chấp nhận hành động.

| Quy tắc | Trạng thái |
| :--- | :--- |
| **Ba đôi thông** | Đã thống nhất hỗ trợ |
| **Bốn đôi thông** | Đã thống nhất hỗ trợ |
| **Ba đôi thông chặt heo** | Đã thống nhất |
| **Bốn đôi thông chặt heo** | Đã thống nhất |
| **Sảnh rồng** | Không hỗ trợ |
| **Tứ quý chặt heo** | Cần xác nhận |
| **Phạt thối 2 hoặc bộ đặc biệt** | Chưa quy định |
| **Luật tới trắng** | Chưa quy định |

---

## 7. Kết thúc vòng và kết thúc ván

### 7.1. Kết thúc vòng

* Người đã bỏ lượt không được quay lại vòng hiện tại.
* Khi không còn người chơi nào có thể tiếp tục chặn nước bài đang có hiệu lực, vòng kết thúc.
* Người đánh hợp lệ cuối cùng được mở vòng mới.

### 7.2. Kết thúc ván bình thường

* Ván kết thúc khi chỉ còn một người chơi chưa đánh hết bài trên tay.
* Máy chủ xác định thứ hạng dựa trên thứ tự người chơi đánh hết bài.
* Hệ thống lưu kết quả và cập nhật điểm theo chế độ chơi.

### 7.3. Người chơi thoát phòng hoặc mất kết nối

* **Đấu 2 người hoặc đấu với Bot:**
  * Nếu người chơi thật thoát phòng hoặc mất kết nối giữa ván, ván đấu kết thúc.
  * Kết quả được xác định là hòa cho cả hai bên theo quy tắc đã thống nhất.
* **Đấu 4 người:**
  * Nếu phát hiện một người chơi thoát phòng hoặc mất kết nối giữa ván, người đó được xếp cuối cùng (về bét).
  * Ván đấu vẫn tiếp tục với những người chơi còn lại.
  * Hệ thống ghi nhận trạng thái rời phòng/mất kết nối và kết quả cuối cùng của ván.

> **Cần xác nhận:** Người mất kết nối trong chế độ đấu 4 có được phép kết nối lại và tiếp tục ván không? Nếu không, người đó có bị loại ngay lập tức khỏi ván hay vẫn được giữ trong danh sách kết quả đến khi ván kết thúc?

---

## 8. Điểm số và bảng xếp hạng

### 8.1. Đấu 4 người

| Thứ hạng | Điểm cộng |
| :--- | :--- |
| **Về nhất** | +15 |
| **Về nhì** | +10 |
| **Về ba** | +5 |
| **Về tư** | Chưa được quy định |

* Người thoát phòng hoặc mất kết nối được xếp bét theo quy tắc của chế độ đấu 4.

### 8.2. Đấu 2 người và đấu với Bot

* Chỉ người về nhất được cộng điểm.
* Người còn lại không được cộng điểm.
* Số điểm cụ thể cộng cho người về nhất ở chế độ đấu 2 vẫn cần nhóm xác nhận.

### 8.3. Cập nhật bảng xếp hạng

Hệ thống lưu:
* Tài khoản người chơi.
* Điểm tích lũy.
* Kết quả và thứ hạng từng ván.
* Lịch sử các ván đã hoàn thành.

Máy chủ cập nhật điểm sau khi xác định kết quả ván. Cách tính điểm khi ván hòa cần được nhóm xác nhận.

---

## 9. Bot

### 9.1. Chế độ Bot

* Một ván đấu với Bot gồm một người chơi thật và một Bot.
* Bot chỉ hoạt động trong chế độ đấu 2.
* Không cho phép thêm Bot vào phòng đang thiếu người.
* Bot tuân theo luật chơi chung và chỉ thực hiện hành động khi đến lượt.

### 9.2. Độ khó

Người dùng được chọn một trong ba cấp độ:

| Cấp độ | Mô tả |
| :--- | :--- |
| **Dễ** | Chiến thuật đơn giản |
| **Trung bình** | Lựa chọn nước đánh có cân nhắc hơn |
| **Khó** | Chiến thuật nâng cao hơn hai cấp độ còn lại |

### 9.3. Thời gian phản hồi

* Thời gian phản hồi dự kiến: khoảng 3–5 giây mỗi lượt.
* Bot không được đánh khi chưa đến lượt.
* Nước đánh của Bot phải được máy chủ kiểm tra như nước đánh của người chơi thật.
* Bot không được sử dụng thông tin bài riêng mà nó không được phép biết.

---

## 10. Đồng bộ và chống gian lận

* Máy chủ giữ trạng thái chính thức của ván.
* Client chỉ gửi yêu cầu hành động, không tự quyết định kết quả nước đánh.
* Máy chủ kiểm tra người gửi, lượt chơi, lá bài được chọn và tính hợp lệ của tổ hợp.
* Bài trên tay của người chơi chỉ được gửi cho chính người đó.
* Các client trong cùng phòng nhận cùng trạng thái bàn chơi công khai.
* Hành động không hợp lệ hoặc yêu cầu gửi lặp không được làm thay đổi trạng thái ván.
* Khi ván kết thúc, máy chủ ngăn các hành động tiếp theo thuộc ván đó.