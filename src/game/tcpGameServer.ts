import { createServer, Server, Socket } from 'node:net';
import { createServer as createTlsServer } from 'node:tls';
import { readFileSync } from 'node:fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  buildPlayerCounts,
  createGame,
  forfeitDisconnectedPlayer,
  GamePlayer,
  GameRuleError,
  passTurn,
  playCards,
  TienLenGame
} from './tienLenGame';
import { encodeFrame, FrameDecoder, Opcode } from './tcpProtocol';
import { getRoomJoinError, getStaleMembershipIds, isSupabaseJwtToken } from './roomRules';

interface RoomRow {
  id: string;
  room_code: string;
  host_id: string;
  mode: string;
  max_players: number;
  status: string;
}

interface RoomMember extends GamePlayer {
  avatarUrl: string | null;
  isReady: boolean;
}

interface ClientSession {
  socket: Socket;
  decoder: FrameDecoder;
  token?: string;
  userId?: string;
  username?: string;
  avatarUrl?: string | null;
  supabase?: SupabaseClient;
  roomId?: string;
  closed: boolean;
}

interface RoomRuntime {
  room: RoomRow;
  members: Map<string, RoomMember>;
  sessions: Map<string, ClientSession>;
  hostSupabase?: SupabaseClient;
  game?: TienLenGame;
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
  turnTimer?: ReturnType<typeof setTimeout>;
}

const HEARTBEAT_TIMEOUT_MS = 15_000;
const RECONNECT_GRACE_MS = 30_000;
const rooms = new Map<string, RoomRuntime>();
const activeSessions = new Map<string, ClientSession>();
const roomLocks = new Map<string, Promise<void>>();

function createSupabase(token?: string): SupabaseClient {
  return createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '', {
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function withRoomLock<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
  const previous = roomLocks.get(roomId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  roomLocks.set(roomId, current);
  return previous.then(operation).finally(() => {
    release();
    if (roomLocks.get(roomId) === current) roomLocks.delete(roomId);
  });
}

function send(session: ClientSession, opcode: number, payload: unknown): void {
  if (!session.closed && !session.socket.destroyed) session.socket.write(encodeFrame(opcode, payload));
}

function reply(session: ClientSession, opcode: number, request: Record<string, unknown>, payload: object): void {
  send(session, opcode, {
    ...payload,
    ...(typeof request.requestId === 'string' ? { requestId: request.requestId } : {})
  });
}

function sendError(session: ClientSession, errorCode: number, message: string, requestId?: unknown): void {
  send(session, Opcode.SYSTEM_ERROR_NOTIFY, {
    errorCode,
    message,
    ...(typeof requestId === 'string' ? { requestId } : {})
  });
}

function broadcast(room: RoomRuntime, opcode: number, payload: unknown, exceptPlayerId?: string): void {
  for (const [playerId, session] of room.sessions) {
    if (playerId !== exceptPlayerId) send(session, opcode, payload);
  }
}

async function loadMembers(client: SupabaseClient, roomId: string): Promise<RoomMember[]> {
  const { data: memberships, error: membershipsError } = await client
    .from('room_players')
    .select('player_id,is_ready,joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (membershipsError) throw new Error(membershipsError.message);

  const playerIds = (memberships || []).map((member) => member.player_id as string);
  if (!playerIds.length) return [];

  const { data: profiles, error: profilesError } = await client
    .from('profiles')
    .select('id,username,avatar_url')
    .in('id', playerIds);
  if (profilesError) throw new Error(profilesError.message);

  const profileMap = new Map((profiles || []).map((profile) => [profile.id as string, profile]));
  return (memberships || []).flatMap((membership) => {
    const profile = profileMap.get(membership.player_id as string);
    if (!profile) return [];
    return [{
      id: membership.player_id as string,
      username: profile.username as string,
      avatarUrl: (profile.avatar_url as string | null) ?? null,
      isReady: Boolean(membership.is_ready)
    }];
  });
}

function roomSnapshot(room: RoomRuntime): object {
  return {
    id: room.room.id,
    roomCode: room.room.room_code,
    hostId: room.room.host_id,
    mode: room.room.max_players === 2 ? 'PVP_TWO' : 'PVP_FOUR',
    maxPlayers: room.room.max_players,
    status: room.room.status.toUpperCase(),
    players: [...room.members.values()].map((player) => ({
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      isReady: player.isReady,
      isHost: player.id === room.room.host_id,
      connected: room.sessions.has(player.id)
    }))
  };
}

async function getActiveMembershipIds(
  client: SupabaseClient,
  playerId: string,
  preserveRoomId?: string
): Promise<string[]> {
  const { data: memberships, error: membershipError } = await client
    .from('room_players')
    .select('room_id')
    .eq('player_id', playerId);
  if (membershipError) throw new Error(membershipError.message);
  const roomIds = (memberships || []).map((membership) => membership.room_id as string);
  if (!roomIds.length) return [];

  const { data: activeRooms, error: roomsError } = await client
    .from('rooms')
    .select('id')
    .in('id', roomIds)
    .in('status', ['waiting', 'playing']);
  if (roomsError) throw new Error(roomsError.message);
  const activeRoomIds = (activeRooms || []).map((room) => room.id as string);
  const liveRoomIds = activeRoomIds.filter((roomId) => {
    const runtime = rooms.get(roomId);
    return Boolean(
      runtime?.sessions.has(playerId) ||
      runtime?.graceTimers.has(playerId)
    );
  });
  const staleRoomIds = getStaleMembershipIds(activeRoomIds, liveRoomIds, preserveRoomId);

  for (const roomId of staleRoomIds) {
    const { error } = await client.from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('player_id', playerId);
    if (error) throw new Error(`Không thể dọn thành viên phòng cũ ${roomId}: ${error.message}`);

    const runtime = rooms.get(roomId);
    if (runtime && !runtime.game && runtime.members.delete(playerId)) {
      broadcast(runtime, Opcode.ROOM_USER_LEFT_BC, {
        playerId,
        currentCount: runtime.sessions.size,
        disconnected: false
      });
    }
  }

  return liveRoomIds;
}

async function authenticate(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const token = payload.token;
  if (!isSupabaseJwtToken(token)) {
    send(session, Opcode.AUTH_TOKEN_RES, { success: false, errorCode: 1001, message: 'Access token không hợp lệ.' });
    session.socket.end();
    return;
  }

  const authClient = createSupabase();
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    send(session, Opcode.AUTH_TOKEN_RES, { success: false, errorCode: 1001, message: 'Access token không hợp lệ hoặc đã hết hạn.' });
    session.socket.end();
    return;
  }

  const userClient = createSupabase(token);
  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('id,username,avatar_url')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    send(session, Opcode.AUTH_TOKEN_RES, { success: false, errorCode: 1001, message: 'Không thể tải hồ sơ người chơi.' });
    session.socket.end();
    return;
  }

  const previous = activeSessions.get(authData.user.id);
  if (previous && !previous.closed && previous !== session) {
    send(session, Opcode.AUTH_TOKEN_RES, { success: false, errorCode: 1002, message: 'Tài khoản đang có kết nối khác.' });
    session.socket.end();
    return;
  }

  session.token = token;
  session.userId = authData.user.id;
  session.username = profile.username as string;
  session.avatarUrl = (profile.avatar_url as string | null) ?? null;
  session.supabase = userClient;
  activeSessions.set(session.userId, session);
  send(session, Opcode.AUTH_TOKEN_RES, {
    success: true,
    profile: { id: session.userId, username: session.username, avatarUrl: session.avatarUrl }
  });
}

async function createRoom(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const maxPlayers = payload.maxPlayers;
  if (maxPlayers !== 2 && maxPlayers !== 4) {
    sendError(session, 2004, 'Số người chơi chỉ được là 2 hoặc 4.', payload.requestId);
    reply(session, Opcode.CREATE_ROOM_RES, payload, { success: false, errorCode: 2004, message: 'Số người chơi không hợp lệ.' });
    return;
  }

  const client = session.supabase!;
  if ((await getActiveMembershipIds(client, session.userId!)).length) {
    reply(session, Opcode.CREATE_ROOM_RES, payload, {
      success: false,
      errorCode: 2005,
      message: 'Bạn đang ở trong một phòng khác.'
    });
    return;
  }
  const roomId = randomUUID();
  const roomCode = randomBytes(4).toString('hex').toUpperCase();
  const now = new Date().toISOString();
  const { error: roomError } = await client.from('rooms').insert({
    id: roomId,
    room_code: roomCode,
    host_id: session.userId,
    mode: maxPlayers === 2 ? '2p' : '4p',
    max_players: maxPlayers,
    status: 'waiting',
    created_at: now
  });
  if (roomError) {
    reply(session, Opcode.CREATE_ROOM_RES, payload, { success: false, errorCode: 5000, message: roomError.message });
    return;
  }

  const { error: memberError } = await client.from('room_players').insert({
    room_id: roomId, player_id: session.userId, joined_at: now, is_ready: true
  });
  if (memberError) {
    const { error: rollbackError } = await client.from('rooms').delete().eq('id', roomId);
    if (rollbackError) console.error('[TCP Room Rollback Error]:', rollbackError.message);
    reply(session, Opcode.CREATE_ROOM_RES, payload, { success: false, errorCode: 5000, message: memberError.message });
    return;
  }

  reply(session, Opcode.CREATE_ROOM_RES, payload, {
    success: true,
    room: { id: roomId, roomCode, hostId: session.userId, mode: maxPlayers === 2 ? 'PVP_TWO' : 'PVP_FOUR', maxPlayers, status: 'WAITING' }
  });
}

async function joinRoom(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const roomCode = typeof payload.roomCode === 'string' ? payload.roomCode.trim().toUpperCase() : '';
  if (!roomCode) {
    reply(session, Opcode.JOIN_ROOM_RES, payload, { success: false, errorCode: 2001, message: 'Vui lòng nhập mã phòng.' });
    return;
  }

  const client = session.supabase!;
  const { data: roomRow, error: roomError } = await client
    .from('rooms')
    .select('id,room_code,host_id,mode,max_players,status')
    .eq('room_code', roomCode)
    .maybeSingle();
  if (roomError || !roomRow) {
    reply(session, Opcode.JOIN_ROOM_RES, payload, { success: false, errorCode: 2001, message: 'Không tìm thấy phòng chơi.' });
    return;
  }

  const room = roomRow as RoomRow;
  await withRoomLock(`player:${session.userId}`, () =>
    withRoomLock(room.id, async () => {
        if (session.roomId && session.roomId !== room.id) {
          reply(session, Opcode.JOIN_ROOM_RES, payload, { success: false, errorCode: 2005, message: 'Bạn đang ở trong một phòng khác.' });
          return;
        }

        let runtime = rooms.get(room.id);
        if (runtime?.game || room.status !== 'waiting') {
          reply(session, Opcode.JOIN_ROOM_RES, payload, { success: false, errorCode: 2001, message: 'Ván đấu đã bắt đầu; hãy dùng khôi phục phiên.' });
          return;
        }

        const activeMemberships = await getActiveMembershipIds(client, session.userId!, room.id);
        const existingMembers = await loadMembers(client, room.id);
        const alreadyMember = existingMembers.some((member) => member.id === session.userId);
        const joinError = getRoomJoinError({
          roomExists: true,
          roomStatus: room.status,
          maxPlayers: room.max_players,
          memberIds: existingMembers.map((member) => member.id),
          playerId: session.userId!,
        activeOtherRoom: activeMemberships.some((roomId) => roomId !== room.id)
        });
        if (joinError) {
          reply(session, Opcode.JOIN_ROOM_RES, payload, { success: false, ...joinError });
          return;
        }

        if (!alreadyMember) {
          const { error: insertError } = await client.from('room_players').insert({
            room_id: room.id,
            player_id: session.userId,
            joined_at: new Date().toISOString(),
            is_ready: false
          });
          if (insertError) {
            reply(session, Opcode.JOIN_ROOM_RES, payload, { success: false, errorCode: 5000, message: insertError.message });
            return;
          }
        }

        const members = alreadyMember
          ? existingMembers
          : await loadMembers(client, room.id);
        const wasConnected = runtime?.sessions.has(session.userId!) ?? false;
        if (!runtime) {
          runtime = { room, members: new Map(), sessions: new Map(), graceTimers: new Map() };
          rooms.set(room.id, runtime);
        }
        runtime.room = room;
        runtime.members = new Map(members.map((member) => [member.id, member]));
        runtime.sessions.set(session.userId!, session);
        if (session.userId === room.host_id) runtime.hostSupabase = session.supabase;
        session.roomId = room.id;

        reply(session, Opcode.JOIN_ROOM_RES, payload, { success: true, room: roomSnapshot(runtime) });
        if (!wasConnected) {
          const joinedMember = runtime.members.get(session.userId!);
          broadcast(runtime, Opcode.ROOM_USER_JOINED_BC, {
            player: {
              id: joinedMember?.id || session.userId,
              username: joinedMember?.username || session.username,
              avatarUrl: joinedMember?.avatarUrl ?? session.avatarUrl,
              isReady: joinedMember?.isReady ?? false,
              isHost: session.userId === room.host_id,
              connected: true
            },
            currentCount: runtime.members.size,
            maxPlayers: room.max_players
          }, session.userId);
        }
    })
  );
}

async function setReady(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const room = session.roomId ? rooms.get(session.roomId) : undefined;
  if (!room) {
    reply(session, Opcode.PLAYER_READY_BC, payload, { success: false, message: 'Bạn chưa ở trong phòng.' });
    return;
  }
  const member = room.members.get(session.userId!);
  if (!member) return;
  const requestedReady = payload.isReady === true;
  const { data: updatedMember, error } = await session.supabase!.from('room_players')
    .update({ is_ready: requestedReady })
    .eq('room_id', room.room.id)
    .eq('player_id', session.userId)
    .select('is_ready')
    .maybeSingle();
  if (error || !updatedMember) {
    reply(session, Opcode.PLAYER_READY_BC, payload, {
      success: false,
      message: error?.message || 'Không tìm thấy thành viên trong phòng để cập nhật trạng thái.'
    });
    return;
  }
  member.isReady = Boolean(updatedMember.is_ready);
  reply(session, Opcode.PLAYER_READY_BC, payload, { success: true, playerId: session.userId, isReady: member.isReady });
  broadcast(room, Opcode.PLAYER_READY_BC, { playerId: session.userId, isReady: member.isReady }, session.userId);
}

function sendTurn(room: RoomRuntime): void {
  if (!room.game) return;
  if (room.turnTimer) clearTimeout(room.turnTimer);
  const playerId = room.game.players[room.game.turnIndex].id;
  broadcast(room, Opcode.GAME_TURN_NOTIFY_BC, { playerId, timeLimitSeconds: 15 });
  if (room.sessions.has(playerId)) {
    room.turnTimer = undefined;
    return;
  }

  const timer = setTimeout(() => {
    void withRoomLock(room.room.id, async () => {
      if (room.turnTimer !== timer) return;
      room.turnTimer = undefined;
      if (!room.game || room.sessions.has(playerId) ||
          room.game.players[room.game.turnIndex].id !== playerId) return;

      try {
        const result = passTurn(room.game, playerId);
        if (result.roundReset) {
          broadcast(room, Opcode.ROUND_RESET_BC, {
            leaderPlayerId: result.nextTurnPlayerId,
            message: 'Người chơi mất kết nối đã hết thời gian lượt và bỏ lượt.'
          });
        } else {
          broadcast(room, Opcode.PASS_TURN_BC, {
            playerId,
            nextTurnPlayerId: result.nextTurnPlayerId,
            timeLimitSeconds: 15,
            automatic: true
          });
        }
        sendTurn(room);
      } catch (error) {
        if (!(error instanceof GameRuleError)) throw error;
      }
    }).catch((error) => console.error('[TCP Turn Timeout Error]:', error));
  }, 15_000);
  room.turnTimer = timer;
}

function scheduleForfeit(room: RoomRuntime, playerId: string): void {
  const previous = room.graceTimers.get(playerId);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(() => {
    void withRoomLock(room.room.id, async () => {
      if (room.graceTimers.get(playerId) !== timer) return;
      room.graceTimers.delete(playerId);
      if (!room.game) return;

      const gameFinished = forfeitDisconnectedPlayer(room.game, playerId);
      broadcast(room, Opcode.SYSTEM_ERROR_NOTIFY, {
        errorCode: 1003,
        message: `Hết thời gian kết nối lại cho người chơi ${playerId}; người chơi bị xử thua.`
      });
      if (gameFinished) await finishGame(room);
      else sendTurn(room);
    }).catch((error) => console.error('[TCP Forfeit Error]:', error));
  }, RECONNECT_GRACE_MS);
  room.graceTimers.set(playerId, timer);
}

async function finishGame(room: RoomRuntime): Promise<void> {
  const game = room.game;
  if (!game) return;
  const standings = game.players.map((player) => ({
    playerId: player.id,
    placement: game.standings.indexOf(player.id) + 1,
    title: ['Nhất', 'Nhì', 'Ba', 'Bét'][game.standings.indexOf(player.id)] || 'Bét',
    pointsEarned: 0,
    remainingCards: game.hands.get(player.id) || []
  }));
  broadcast(room, Opcode.GAME_OVER_BC, { matchId: game.matchId, endedAt: new Date().toISOString(), standings });
  for (const timer of room.graceTimers.values()) clearTimeout(timer);
  room.graceTimers.clear();
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = undefined;
  room.game = undefined;
  room.room.status = 'finished';
  if (room.hostSupabase) {
    const { error } = await room.hostSupabase.from('rooms')
      .update({ status: 'finished' })
      .eq('id', room.room.id)
      .eq('status', 'playing');
    if (error) console.error('[TCP Room Finish Persist Error]:', error.message);
  }
}

async function startGame(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const room = session.roomId ? rooms.get(session.roomId) : undefined;
  if (!room) {
    reply(session, Opcode.START_GAME_RES, payload, { success: false, errorCode: 2004, message: 'Bạn chưa ở trong phòng.' });
    return;
  }
  if (session.userId !== room.room.host_id) {
    reply(session, Opcode.START_GAME_RES, payload, { success: false, errorCode: 2003, message: 'Chỉ chủ phòng mới được bắt đầu.' });
    return;
  }
  if (room.game || room.room.status !== 'waiting') {
    reply(session, Opcode.START_GAME_RES, payload, { success: false, errorCode: 2004, message: 'Phòng không ở trạng thái chờ.' });
    return;
  }
  const members = await loadMembers(session.supabase!, room.room.id);
  const notReady = members.filter((member) => !member.isReady);
  const disconnected = members.filter((member) => !room.sessions.has(member.id));
  if (members.length !== room.room.max_players || notReady.length || disconnected.length) {
    const reasons = [
      members.length !== room.room.max_players ? `Cần đủ ${room.room.max_players} người chơi` : '',
      notReady.length ? `Chưa sẵn sàng: ${notReady.map((member) => member.username).join(', ')}` : '',
      disconnected.length ? `Mất kết nối: ${disconnected.map((member) => member.username).join(', ')}` : ''
    ].filter(Boolean);
    reply(session, Opcode.START_GAME_RES, payload, {
      success: false,
      errorCode: 2004,
      message: `${reasons.join('. ')}.`
    });
    return;
  }

  const players = members.map(({ id, username }) => ({ id, username }));
  const game = createGame(players);
  const { data: startedRoom, error } = await session.supabase!.from('rooms')
    .update({ status: 'playing' })
    .eq('id', room.room.id)
    .eq('host_id', session.userId)
    .eq('status', 'waiting')
    .select('id')
    .maybeSingle();
  if (error || !startedRoom) {
    reply(session, Opcode.START_GAME_RES, payload, {
      success: false,
      errorCode: error ? 5000 : 2004,
      message: error?.message || 'Phòng đã được bắt đầu hoặc không còn ở trạng thái chờ.'
    });
    return;
  }

  room.game = game;
  room.room.status = 'playing';
  room.members = new Map(members.map((member) => [member.id, member]));
  room.hostSupabase = session.supabase;
  reply(session, Opcode.START_GAME_RES, payload, { success: true, matchId: game.matchId });
  for (const player of players) {
    const playerSession = room.sessions.get(player.id);
    if (playerSession) {
      send(playerSession, Opcode.GAME_DEAL_CARDS_BC, {
        matchId: game.matchId,
        firstTurnPlayerId: game.players[game.turnIndex].id,
        reason: 'Người sở hữu lá 3 Bích (CardID: 0) đi trước.',
        myCards: game.hands.get(player.id),
        playerCardCounts: buildPlayerCounts(game)
      });
    }
  }
  sendTurn(room);
}

function sendSnapshot(room: RoomRuntime, session: ClientSession, request: Record<string, unknown>): void {
  const game = room.game!;
  send(session, Opcode.RECONNECT_RES, {
    success: true,
    matchId: game.matchId,
    roomCode: room.room.room_code,
    currentTurnPlayerId: game.players[game.turnIndex].id,
    myCards: game.hands.get(session.userId!),
    tableCards: game.lastPlay?.combination.cards || [],
    lastCombination: game.lastPlay?.combination.type || null,
    passedPlayerIds: [...game.passedPlayerIds],
    playerCardCounts: buildPlayerCounts(game),
    room: roomSnapshot(room),
    ...(typeof request.requestId === 'string' ? { requestId: request.requestId } : {})
  });
}

async function reconnect(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const playerId = session.userId!;
  const roomCode = typeof payload.roomCode === 'string' ? payload.roomCode.trim().toUpperCase() : '';
  const room = [...rooms.values()].find((entry) => entry.room.room_code === roomCode);
  if (!room) {
    reply(session, Opcode.RECONNECT_RES, payload, { success: false, errorCode: 1003, message: 'Không tìm thấy phiên chơi để khôi phục.' });
    return;
  }

  await withRoomLock(room.room.id, async () => {
    if (!room.game || !room.members.has(playerId)) {
      reply(session, Opcode.RECONNECT_RES, payload, { success: false, errorCode: 1003, message: 'Không tìm thấy phiên chơi để khôi phục.' });
      return;
    }

    const graceTimer = room.graceTimers.get(playerId);
    if (!graceTimer) {
      reply(session, Opcode.RECONNECT_RES, payload, { success: false, errorCode: 1003, message: 'Thời gian khôi phục phiên đã hết.' });
      return;
    }
    clearTimeout(graceTimer);
    room.graceTimers.delete(playerId);
    room.sessions.set(playerId, session);
    session.roomId = room.room.id;
    sendSnapshot(room, session, payload);
    broadcast(room, Opcode.ROOM_USER_JOINED_BC, {
      player: { ...room.members.get(playerId), isHost: playerId === room.room.host_id },
      currentCount: room.sessions.size,
      maxPlayers: room.room.max_players
    }, playerId);
    sendTurn(room);
  });
}

async function handlePlay(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const room = session.roomId ? rooms.get(session.roomId) : undefined;
  if (!room?.game || !Array.isArray(payload.cards) || !payload.cards.every((card) => Number.isInteger(card))) {
    reply(session, Opcode.PLAY_CARDS_RES, payload, { success: false, errorCode: 3003, message: 'Yêu cầu đánh bài không hợp lệ.' });
    return;
  }
  try {
    const result = playCards(room.game, session.userId!, payload.cards as number[]);
    reply(session, Opcode.PLAY_CARDS_RES, payload, { success: true });
    if (result.finished) {
      await finishGame(room);
      return;
    }
    broadcast(room, Opcode.PLAY_CARDS_BC, {
      playerId: session.userId,
      cards: result.combination.cards,
      combination: result.combination.type,
      remainingCardCount: room.game.hands.get(session.userId!)?.length || 0,
      nextTurnPlayerId: result.nextTurnPlayerId,
      playerCardCounts: buildPlayerCounts(room.game),
      timeLimitSeconds: 15
    });
    sendTurn(room);
  } catch (error) {
    if (error instanceof GameRuleError) {
      reply(session, Opcode.PLAY_CARDS_RES, payload, { success: false, errorCode: error.errorCode, message: error.message });
    } else {
      throw error;
    }
  }
}

function handlePass(session: ClientSession, payload: Record<string, unknown>): void {
  const room = session.roomId ? rooms.get(session.roomId) : undefined;
  if (!room?.game) {
    reply(session, Opcode.PASS_TURN_RES, payload, { success: false, errorCode: 3001, message: 'Ván đấu chưa bắt đầu.' });
    return;
  }
  try {
    const result = passTurn(room.game, session.userId!);
    reply(session, Opcode.PASS_TURN_RES, payload, { success: true });
    if (result.roundReset) {
      broadcast(room, Opcode.ROUND_RESET_BC, {
        leaderPlayerId: result.nextTurnPlayerId,
        message: 'Tất cả đối thủ đã bỏ lượt. Vòng mới bắt đầu!'
      });
    } else {
      broadcast(room, Opcode.PASS_TURN_BC, {
        playerId: session.userId,
        nextTurnPlayerId: result.nextTurnPlayerId,
        timeLimitSeconds: 15
      });
    }
    sendTurn(room);
  } catch (error) {
    if (error instanceof GameRuleError) {
      reply(session, Opcode.PASS_TURN_RES, payload, { success: false, errorCode: error.errorCode, message: error.message });
      return;
    }
    throw error;
  }
}

async function closeRoom(room: RoomRuntime, reason: string): Promise<void> {
  rooms.delete(room.room.id);
  for (const timer of room.graceTimers.values()) clearTimeout(timer);
  room.graceTimers.clear();
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = undefined; }
  // Broadcast trước khi dọn sessions để các client còn kết nối nhận được thông báo
  broadcast(room, Opcode.ROOM_CLOSED_BC, { roomId: room.room.id, reason });
  for (const [pid, s] of room.sessions) {
    s.roomId = undefined;
    room.sessions.delete(pid);
  }
  const supabase = room.hostSupabase;
  if (supabase) {
    const { error } = await supabase.from('room_players').delete().eq('room_id', room.room.id);
    if (error) console.error('[TCP Room Close - delete members error]:', error.message);
    const { error: roomError } = await supabase.from('rooms')
      .update({ status: 'closed' })
      .eq('id', room.room.id);
    if (roomError) console.error('[TCP Room Close - update status error]:', roomError.message);
  }
}async function leaveRoom(session: ClientSession, payload: Record<string, unknown>): Promise<void> {
  const room = session.roomId ? rooms.get(session.roomId) : undefined;
  if (!room) {
    reply(session, Opcode.LEAVE_ROOM_RES, payload, { success: true });
    return;
  }
  const playerId = session.userId!;
  const isHost = playerId === room.room.host_id;

  // Nếu chủ phòng rời và chưa có game → đóng phòng
  if (isHost && !room.game) {
    room.sessions.delete(playerId);
    session.roomId = undefined;
    reply(session, Opcode.LEAVE_ROOM_RES, payload, { success: true });
    await closeRoom(room, 'Chủ phòng đã đóng phòng.');
    return;
  }

  room.sessions.delete(playerId);
  session.roomId = undefined;

  if (!room.game) {
    const { error } = await session.supabase!.from('room_players')
      .delete()
      .eq('room_id', room.room.id)
      .eq('player_id', playerId);
    if (error) {
      room.sessions.set(playerId, session);
      session.roomId = room.room.id;
      reply(session, Opcode.LEAVE_ROOM_RES, payload, { success: false, message: error.message });
      return;
    }
    room.members.delete(playerId);
  } else {
    scheduleForfeit(room, playerId);
  }

  reply(session, Opcode.LEAVE_ROOM_RES, payload, { success: true });
  broadcast(room, Opcode.ROOM_USER_LEFT_BC, {
    playerId,
    currentCount: room.sessions.size,
    disconnected: false
  });
  if (room.game) sendTurn(room);
}

async function handleFrame(session: ClientSession, opcode: number, payload: Record<string, unknown>): Promise<void> {
  if (opcode === Opcode.AUTH_TOKEN_REQ && !session.userId) {
    await authenticate(session, payload);
    return;
  }
  if (!session.userId || !session.supabase) {
    sendError(session, 1001, 'Socket chưa được xác thực.', payload.requestId);
    session.socket.end();
    return;
  }

  switch (opcode) {
    case Opcode.HEARTBEAT_PING:
      send(session, Opcode.HEARTBEAT_PONG, { timestamp: Date.now() });
      break;
    case Opcode.CREATE_ROOM_REQ:
      await withRoomLock(`player:${session.userId}`, () => createRoom(session, payload));
      break;
    case Opcode.JOIN_ROOM_REQ:
      await joinRoom(session, payload);
      break;
    case Opcode.RECONNECT_REQ:
      await reconnect(session, payload);
      break;
    case Opcode.PLAYER_READY_REQ:
      if (session.roomId) await withRoomLock(session.roomId, () => setReady(session, payload));
      else await setReady(session, payload);
      break;
    case Opcode.START_GAME_REQ:
      if (session.roomId) await withRoomLock(session.roomId, () => startGame(session, payload));
      else await startGame(session, payload);
      break;
    case Opcode.PLAY_CARDS_REQ:
      if (session.roomId) await withRoomLock(session.roomId, () => handlePlay(session, payload));
      else await handlePlay(session, payload);
      break;
    case Opcode.PASS_TURN_REQ:
      if (session.roomId) await withRoomLock(session.roomId, async () => handlePass(session, payload));
      else handlePass(session, payload);
      break;
    case Opcode.LEAVE_ROOM_REQ:
      if (session.roomId) await withRoomLock(session.roomId, () => leaveRoom(session, payload));
      else await leaveRoom(session, payload);
      break;
    default:
      sendError(session, 5000, `Opcode không được hỗ trợ: ${opcode}.`, payload.requestId);
  }
}

function attachSocket(socket: Socket): void {
  const session: ClientSession = { socket, decoder: new FrameDecoder(), closed: false };
  socket.setNoDelay(true);
  socket.setTimeout(HEARTBEAT_TIMEOUT_MS);
  socket.on('timeout', () => socket.destroy(new Error('Heartbeat timeout.')));
  socket.on('data', (chunk) => {
    try {
      for (const frame of session.decoder.push(chunk)) {
        void handleFrame(session, frame.opcode, frame.payload as Record<string, unknown>).catch((error) => {
          console.error('[TCP Request Error]:', error);
          sendError(session, 5000, 'Lỗi nội bộ game server.', (frame.payload as Record<string, unknown>).requestId);
        });
      }
    } catch (error) {
      console.warn('[TCP Protocol Error]:', error);
      sendError(session, 5000, 'Khung TCP không hợp lệ.');
      socket.destroy();
    }
  });
  socket.on('error', (error) => console.warn('[TCP Socket Error]:', error.message));
  socket.on('close', () => {
    session.closed = true;
    if (session.userId && activeSessions.get(session.userId) === session) activeSessions.delete(session.userId);
    const room = session.roomId ? rooms.get(session.roomId) : undefined;
    if (!room || !session.userId || room.sessions.get(session.userId) !== session) return;
    const disconnectedUserId = session.userId;
    const isHost = disconnectedUserId === room.room.host_id;
    room.sessions.delete(disconnectedUserId);
    session.roomId = undefined;

    // Nếu chủ phòng ngắt kết nối mà chưa bắt đầu game → đóng phòng
    if (isHost && !room.game) {
      void withRoomLock(room.room.id, () => closeRoom(room, 'Chủ phòng đã mất kết nối.'))
        .catch((error) => console.error('[TCP Room Close on Disconnect Error]:', error));
      return;
    }

    broadcast(room, Opcode.ROOM_USER_LEFT_BC, {
      playerId: disconnectedUserId,
      currentCount: room.sessions.size,
      disconnected: true
    });
    if (room.game) {
      scheduleForfeit(room, disconnectedUserId);
      sendTurn(room);
    }
  });

  const authTimeout = setTimeout(() => {
    if (!session.userId) socket.destroy(new Error('Authentication timeout.'));
  }, 10_000);
  socket.once('close', () => clearTimeout(authTimeout));
}

export function startTcpGameServer(): Server | null {
  const port = Number(process.env.GAME_TCP_PORT || 6000);
  const host = process.env.GAME_TCP_BIND_HOST || '0.0.0.0';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[TCP Game Server] Không khởi chạy: cần cấu hình SUPABASE_URL và SUPABASE_ANON_KEY.');
    return null;
  }

  let server: Server;
  const keyPath = process.env.GAME_TLS_KEY_PATH;
  const certPath = process.env.GAME_TLS_CERT_PATH;
  if ((keyPath && !certPath) || (!keyPath && certPath)) {
    throw new Error('Cần cấu hình đồng thời GAME_TLS_KEY_PATH và GAME_TLS_CERT_PATH.');
  }
  if (process.env.NODE_ENV === 'production' && (!keyPath || !certPath)) {
    throw new Error('Bắt buộc cấu hình TLS certificate/key cho TCP game server ở production.');
  }

  if (keyPath && certPath) {
    server = createTlsServer({
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
      minVersion: 'TLSv1.2'
    }, attachSocket);
  } else {
    server = createServer(attachSocket);
  }

  server.on('error', (error) => console.error('[TCP Game Server Error]:', error));
  server.listen(port, host, () => {
    console.log(`[TCP Game Server] Đang lắng nghe ${host}:${port}`);
  });
  return server;
}
