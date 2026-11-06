import { EventEmitter } from 'node:events';
import { Socket, createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { randomUUID } from 'node:crypto';
import { encodeFrame, FrameDecoder, Opcode } from '../../game/tcpProtocol';

interface PendingRequest {
  expectedOpcode: number;
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class GameTcpClient extends EventEmitter {
  private socket: Socket | null = null;
  private decoder: FrameDecoder | null = null;
  private pending = new Map<string, PendingRequest>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private authWaiter: PendingRequest | null = null;
  private roomCode: string | null = null;
  private token: string | null = null;
  private intentionalClose = false;
  private authenticated = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectUntil = 0;
  private connecting: Promise<void> | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly useTls: boolean
  ) {
    super();
  }

  async joinRoom(roomCode: string, token: string): Promise<Record<string, unknown>> {
    this.roomCode = roomCode.trim().toUpperCase();
    this.token = token;
    this.intentionalClose = false;
    this.reconnectUntil = 0;
    try {
      await this.connectAndAuthenticate();

      const restored = await this.request(Opcode.RECONNECT_REQ, { roomCode: this.roomCode }, Opcode.RECONNECT_RES);
      if (restored.success === true) return restored;

      const joined = await this.request(Opcode.JOIN_ROOM_REQ, { roomCode: this.roomCode }, Opcode.JOIN_ROOM_RES);
      if (joined.success !== true) throw new Error(String(joined.message || 'Không thể tham gia phòng.'));
      this.reconnectUntil = 0;
      return joined;
    } catch (error) {
      this.roomCode = null;
      throw error;
    }
  }

  updateAccessToken(token: string): void {
    this.token = token;
  }

  ready(isReady: boolean): Promise<Record<string, unknown>> {
    return this.request(Opcode.PLAYER_READY_REQ, { isReady }, Opcode.PLAYER_READY_BC);
  }

  startGame(): Promise<Record<string, unknown>> {
    return this.request(Opcode.START_GAME_REQ, {}, Opcode.START_GAME_RES);
  }

  playCards(cards: number[]): Promise<Record<string, unknown>> {
    return this.request(Opcode.PLAY_CARDS_REQ, { cards }, Opcode.PLAY_CARDS_RES);
  }

  passTurn(): Promise<Record<string, unknown>> {
    return this.request(Opcode.PASS_TURN_REQ, {}, Opcode.PASS_TURN_RES);
  }

  async leaveRoom(): Promise<void> {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (!this.socket || this.socket.destroyed) {
      this.roomCode = null;
      return;
    }
    try {
      const result = await this.request(Opcode.LEAVE_ROOM_REQ, {}, Opcode.LEAVE_ROOM_RES);
      if (result.success !== true) {
        throw new Error(String(result.message || 'Không thể rời phòng.'));
      }
      this.roomCode = null;
      this.closeSocket();
    } catch (error) {
      this.intentionalClose = false;
      throw error;
    }
  }

  close(): void {
    this.intentionalClose = true;
    this.roomCode = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.closeSocket();
  }

  private connectAndAuthenticate(): Promise<void> {
    if (this.socket && !this.socket.destroyed && this.authenticated) return Promise.resolve();
    if (this.socket && !this.socket.destroyed && this.connecting) return this.connecting;
    if (!this.token) return Promise.reject(new Error('Chưa có phiên đăng nhập để kết nối game server.'));

    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = this.useTls
        ? tlsConnect({ host: this.host, port: this.port, minVersion: 'TLSv1.2' })
        : createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      this.decoder = new FrameDecoder();
      socket.setNoDelay(true);
      socket.setTimeout(15_000);
      this.authWaiter = {
        expectedOpcode: Opcode.AUTH_TOKEN_RES,
        resolve: (payload) => {
          if (payload.success !== true) {
            reject(new Error(String(payload.message || 'Xác thực game server thất bại.')));
            return;
          }
          this.authenticated = true;
          resolve();
        },
        reject,
        timeout: setTimeout(() => {
          reject(new Error('Game server không phản hồi xác thực.'));
          socket.destroy();
        }, 12_000)
      };

      socket.once('connect', () => {
        socket.write(encodeFrame(Opcode.AUTH_TOKEN_REQ, { token: this.token }));
      });
      socket.on('data', (chunk) => {
        try {
          for (const frame of this.decoder?.push(chunk) || []) {
            this.receive(frame.opcode, frame.payload as Record<string, unknown>);
          }
        } catch (error) {
          socket.destroy(error instanceof Error ? error : new Error('Dữ liệu TCP không hợp lệ.'));
        }
      });
      socket.on('timeout', () => socket.destroy(new Error('Hết thời gian chờ game server.')));
      socket.on('error', (error) => {
        this.emit('connection-error', error.message);
        this.rejectPending(error);
      });
      socket.on('close', () => {
        this.rejectPending(new Error('Kết nối game server đã đóng.'));
        if (this.socket === socket) {
          this.socket = null;
          this.decoder = null;
          this.authenticated = false;
          this.connecting = null;
          this.stopHeartbeat();
          this.emit('disconnected');
          this.scheduleReconnect();
        }
      });
    }).finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  private request(opcode: number, payload: object, expectedOpcode: number): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.reject(new Error('Chưa kết nối game server.'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Game server không phản hồi yêu cầu.'));
      }, 12_000);
      this.pending.set(requestId, { expectedOpcode, resolve, reject, timeout });
      socket.write(encodeFrame(opcode, { ...payload, requestId }));
    });
  }

  private receive(opcode: number, payload: Record<string, unknown>): void {
    if (opcode === Opcode.AUTH_TOKEN_RES && this.authWaiter) {
      clearTimeout(this.authWaiter.timeout);
      const waiter = this.authWaiter;
      this.authWaiter = null;
      waiter.resolve(payload);
      if (payload.success === true) this.startHeartbeat();
      return;
    }

    const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
    const pending = requestId ? this.pending.get(requestId) : undefined;
    if (pending && pending.expectedOpcode === opcode) {
      clearTimeout(pending.timeout);
      this.pending.delete(requestId);
      pending.resolve(payload);
    } else if (opcode === Opcode.SYSTEM_ERROR_NOTIFY && pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(requestId);
      pending.reject(new Error(String(payload.message || 'Game server báo lỗi.')));
    }

    this.emit('game-event', { opcode, payload });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.socket && !this.socket.destroyed) {
        this.socket.write(encodeFrame(Opcode.HEARTBEAT_PING, {}));
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private rejectPending(error: Error): void {
    if (this.authWaiter) {
      clearTimeout(this.authWaiter.timeout);
      this.authWaiter.reject(error);
      this.authWaiter = null;
    }
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private closeSocket(): void {
    this.stopHeartbeat();
    this.rejectPending(new Error('Kết nối đã đóng.'));
    this.socket?.destroy();
    this.socket = null;
    this.decoder = null;
    this.authenticated = false;
    this.connecting = null;
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.roomCode || !this.token) return;
    if (!this.reconnectUntil) this.reconnectUntil = Date.now() + 30_000;
    if (Date.now() >= this.reconnectUntil) {
      this.emit('reconnect-expired');
      this.roomCode = null;
      this.reconnectUntil = 0;
      return;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connectAndAuthenticate();
        const result = await this.request(Opcode.RECONNECT_REQ, { roomCode: this.roomCode }, Opcode.RECONNECT_RES);
        if (result.success !== true) throw new Error(String(result.message || 'Không thể khôi phục phiên.'));
        this.reconnectUntil = 0;
        this.emit('reconnected', result);
      } catch {
        this.scheduleReconnect();
      }
    }, 2000);
  }
}
