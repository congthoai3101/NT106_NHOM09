# Chạy game server TCP qua Internet

## Kiến trúc đã triển khai

- `src/server.ts` chạy HTTP API và TCP game server trong cùng tiến trình.
- TCP dùng frame 8 byte theo `docs/tcp-protocol.md`: magic `0x544C`, opcode, độ dài JSON UTF-8.
- Electron main process sở hữu socket; renderer chỉ gọi các hàm IPC được preload cho phép.
- Server xác thực Supabase access token, lấy `player_id` từ token và đọc/ghi `rooms`, `room_players` theo chính sách RLS của người dùng.
- Trạng thái ván và bài được giữ trong bộ nhớ của một game-server instance. Không chạy nhiều replica và không restart server giữa ván.
- Mã phòng trong DB là nguồn chung; tên phòng hiện chỉ hiển thị ở máy tạo vì bảng `rooms` chưa có cột tên.

## Cấu hình

Sao chép `.env.example` thành `.env`; không đưa `.env` lên Git. Điền `SUPABASE_URL` và `SUPABASE_ANON_KEY` hợp lệ. Không dùng `service_role` key trong desktop hoặc game server.

Game server:

```env
GAME_TCP_BIND_HOST=0.0.0.0
GAME_TCP_PORT=6000
```

Client Electron:

```env
GAME_TCP_HOST=game.example.com
GAME_TCP_PORT=6000
GAME_TCP_TLS=true
API_BASE_URL=https://api.example.com/api
```

`API_BASE_URL` không có dấu `/` cuối. API public nên chạy sau HTTPS reverse proxy. Với TCP public, cấu hình đồng thời trên game server:

```env
NODE_ENV=production
GAME_TLS_KEY_PATH=/etc/letsencrypt/live/game.example.com/privkey.pem
GAME_TLS_CERT_PATH=/etc/letsencrypt/live/game.example.com/fullchain.pem
```

Production sẽ từ chối khởi động TCP nếu thiếu chứng thư TLS. Client dùng xác minh chứng thư hệ điều hành; không tắt xác minh TLS.

## Supabase RLS

Các policy dưới đây là mẫu theo schema hiện tại (ID hồ sơ là chuỗi chứa UUID). Kiểm tra policy đang có trước khi áp dụng và không xóa policy đang dùng cho các chức năng khác. Server cần quyền đọc username/avatar của thành viên cùng phòng; chỉ các trường hồ sơ công khai nên được cấp quyền đọc.

```sql
-- Cho người chơi đã đăng nhập đọc danh tính hiển thị và danh sách/phòng.
create policy "authenticated read public profiles"
on public.profiles for select to authenticated using (true);

create policy "authenticated read rooms"
on public.rooms for select to authenticated using (true);

create policy "authenticated read room players"
on public.room_players for select to authenticated using (true);

create policy "users create own rooms"
on public.rooms for insert to authenticated
with check (host_id = (select auth.uid())::text);

create policy "hosts update own rooms"
on public.rooms for update to authenticated
using (host_id = (select auth.uid())::text)
with check (host_id = (select auth.uid())::text);

create policy "hosts delete own rooms"
on public.rooms for delete to authenticated
using (host_id = (select auth.uid())::text);

create policy "users add themselves to rooms"
on public.room_players for insert to authenticated
with check (player_id = (select auth.uid())::text);

create policy "users update own room membership"
on public.room_players for update to authenticated
using (player_id = (select auth.uid())::text)
with check (player_id = (select auth.uid())::text);

create policy "users leave own rooms"
on public.room_players for delete to authenticated
using (player_id = (select auth.uid())::text);
```

Bật RLS cho các bảng nếu dự án yêu cầu RLS. Bảo đảm `rooms.room_code` có unique index và `room_players` có primary key/unique constraint trên `(room_id, player_id)`. Các ràng buộc này ngăn mã phòng trùng và thành viên trùng ở tầng DB.

## Chạy và kiểm thử

1. Trên máy chủ/VPS có IP public hoặc DNS, cài Node.js và dependencies, cấu hình `.env`, rồi chạy `npm run build` và `npm start`. Lệnh này khởi chạy cả HTTP API và TCP listener.
2. Mở cổng TCP `GAME_TCP_PORT` trong firewall/security group. Nếu dùng firewall trên VPS Ubuntu, ví dụ `sudo ufw allow 6000/tcp`. Không mở cổng Supabase/PostgreSQL ra Internet cho client.
3. Đặt API sau HTTPS và cấu hình `API_BASE_URL`; đặt `GAME_TCP_HOST` thành DNS/IP public của TCP server, cùng cổng và TLS tương ứng.
4. Trên cả hai máy, cài ứng dụng và cấu hình cùng `API_BASE_URL`, `GAME_TCP_HOST`, `GAME_TCP_PORT`, `GAME_TCP_TLS`. Đăng nhập hai tài khoản khác nhau.
5. Máy 1 tạo phòng, chia sẻ mã phòng; máy 2 nhập mã trong sảnh và chọn **Tham gia phòng**. Máy 2 chọn **Sẵn sàng**, chủ phòng bấm **Bắt đầu ván**.
6. Kiểm tra từ hai mạng khác nhau (ví dụ VPS và mạng di động), không chỉ hai máy chung Wi-Fi. Theo dõi log TCP/API và xác nhận hai client nhận sự kiện tham gia, chia bài và lượt đánh.

Kiểm thử cục bộ: `npm test`; kiểm tra kiểu/build: `npm run build`. Không thể chứng minh kết nối Internet thực tế nếu chưa cấu hình VPS, DNS/chứng thư TLS và firewall public.

## Giới hạn hiện tại

- Server dùng một instance và bộ nhớ tiến trình cho trạng thái ván; restart sẽ làm mất ván đang chạy. Cơ chế reconnect 30 giây chỉ hoạt động khi cùng tiến trình còn sống.
- Hỗ trợ đấu 2 hoặc 4 người; người mất kết nối được 30 giây để vào lại và tự bỏ lượt sau 15 giây nếu đang đến lượt và nước bỏ hợp lệ. Chưa có bot, chat, voice, persist trận đấu/điểm hoặc turn timeout chung cho người đang kết nối.
- Tổ hợp bài, lượt đầu 3 Bích, quyền sở hữu bài, chặt heo cơ bản, bỏ lượt, vòng mới và chia bài được xác minh ở server.
- Bảng dữ liệu hiện không lưu tên phòng hoặc quyền riêng tư; không dùng lựa chọn này làm kiểm soát truy cập.
