export const FRAME_MAGIC = 0x544c;
export const FRAME_HEADER_BYTES = 8;
export const MAX_FRAME_BYTES = 65_536;

export const Opcode = {
  AUTH_TOKEN_REQ: 1001,
  AUTH_TOKEN_RES: 1002,
  HEARTBEAT_PING: 1003,
  HEARTBEAT_PONG: 1004,
  RECONNECT_REQ: 1005,
  RECONNECT_RES: 1006,
  CREATE_ROOM_REQ: 2001,
  CREATE_ROOM_RES: 2002,
  JOIN_ROOM_REQ: 2003,
  JOIN_ROOM_RES: 2004,
  ROOM_USER_JOINED_BC: 2005,
  LEAVE_ROOM_REQ: 2007,
  LEAVE_ROOM_RES: 2008,
  ROOM_USER_LEFT_BC: 2009,
  PLAYER_READY_REQ: 2011,
  PLAYER_READY_BC: 2012,
  START_GAME_REQ: 2013,
  START_GAME_RES: 2014,
  GAME_DEAL_CARDS_BC: 3001,
  GAME_TURN_NOTIFY_BC: 3003,
  PLAY_CARDS_REQ: 3005,
  PLAY_CARDS_RES: 3006,
  PLAY_CARDS_BC: 3007,
  PASS_TURN_REQ: 3009,
  PASS_TURN_RES: 3010,
  PASS_TURN_BC: 3011,
  ROUND_RESET_BC: 3013,
  GAME_OVER_BC: 3017,
  SYSTEM_ERROR_NOTIFY: 4999
} as const;

export interface TcpFrame<T = unknown> {
  opcode: number;
  payload: T;
}

export class FrameDecoder {
  private buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  push(chunk: Buffer): TcpFrame[] {
    this.buffered = this.buffered.length ? Buffer.concat([this.buffered, chunk]) : chunk;
    const frames: TcpFrame[] = [];

    while (this.buffered.length >= FRAME_HEADER_BYTES) {
      const magic = this.buffered.readUInt16BE(0);
      if (magic !== FRAME_MAGIC) throw new Error('Invalid TCP frame magic.');

      const opcode = this.buffered.readUInt16BE(2);
      const payloadLength = this.buffered.readUInt32BE(4);
      if (payloadLength > MAX_FRAME_BYTES) throw new Error('TCP frame exceeds the maximum payload size.');

      const frameLength = FRAME_HEADER_BYTES + payloadLength;
      if (this.buffered.length < frameLength) break;

      const payloadBytes = this.buffered.subarray(FRAME_HEADER_BYTES, frameLength);
      let payload: unknown;
      try {
        payload = JSON.parse(payloadBytes.toString('utf8'));
      } catch {
        throw new Error('TCP frame contains invalid JSON.');
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('TCP frame payload must be a JSON object.');
      }

      frames.push({ opcode, payload });
      this.buffered = this.buffered.subarray(frameLength);
    }

    return frames;
  }

  get bufferedBytes(): number {
    return this.buffered.length;
  }
}

export function encodeFrame(opcode: number, payload: unknown): Buffer {
  if (!Number.isInteger(opcode) || opcode < 0 || opcode > 0xffff) {
    throw new Error('Opcode must be an unsigned 16-bit integer.');
  }

  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  if (json.length > MAX_FRAME_BYTES) throw new Error('TCP frame exceeds the maximum payload size.');

  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + json.length);
  frame.writeUInt16BE(FRAME_MAGIC, 0);
  frame.writeUInt16BE(opcode, 2);
  frame.writeUInt32BE(json.length, 4);
  json.copy(frame, FRAME_HEADER_BYTES);
  return frame;
}
