import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCards, createGame, forfeitDisconnectedPlayer, passTurn, playCards, GameRuleError } from '../src/game/tienLenGame';
import { getRoomJoinError, getStaleMembershipIds, isSupabaseJwtToken } from '../src/game/roomRules';

const players = [
  { id: 'p1', username: 'one' },
  { id: 'p2', username: 'two' }
];

test('classifies singles, pairs, straights, and pair chains', () => {
  assert.equal(classifyCards([0])?.type, 'SINGLE');
  assert.equal(classifyCards([4, 5])?.type, 'PAIR');
  assert.equal(classifyCards([0, 4, 8])?.type, 'STRAIGHT');
  assert.equal(classifyCards([0, 1, 4, 5, 8, 9])?.type, 'THREE_PAIRS_CHAIN');
  assert.equal(classifyCards([0, 0]), null);
});

test('only the 3 of spades holder starts and cannot pass the opening play', () => {
  const deck = Array.from({ length: 52 }, (_, card) => card);
  const game = createGame(players, deck);
  const first = game.players[game.turnIndex].id;
  assert.equal(game.hands.get(first)?.includes(0), true);
  assert.throws(() => playCards(game, first, [4]), (error) =>
    error instanceof GameRuleError && error.errorCode === 3005);
  assert.throws(() => passTurn(game, first), (error) =>
    error instanceof GameRuleError && error.errorCode === 3006);
  assert.throws(() => playCards(game, 'other', [0]), (error) =>
    error instanceof GameRuleError && error.errorCode === 3001);
});

test('accepts legal turns and resets the round after all opponents pass', () => {
  const deck = Array.from({ length: 52 }, (_, card) => card);
  const game = createGame(players, deck);
  const first = game.players[game.turnIndex].id;
  const second = game.players[(game.turnIndex + 1) % 2].id;
  playCards(game, first, [0]);
  assert.equal(game.players[game.turnIndex].id, second);
  const passed = passTurn(game, second);
  assert.equal(passed.roundReset, true);
  assert.equal(passed.nextTurnPlayerId, first);
});

test('a disconnect in a two-player game ends the match with the connected player first', () => {
  const game = createGame(players, Array.from({ length: 52 }, (_, card) => card));
  const disconnected = game.players[game.turnIndex].id;
  const connected = game.players.find((player) => player.id !== disconnected)!.id;
  assert.equal(forfeitDisconnectedPlayer(game, disconnected), true);
  assert.deepEqual(game.standings, [connected, disconnected]);
});

test('validates room not found, full room, other membership, and duplicate joins', () => {
  assert.equal(getRoomJoinError({ roomExists: false, playerId: 'p3' })?.errorCode, 2001);
  assert.equal(getRoomJoinError({
    roomExists: true, roomStatus: 'waiting', maxPlayers: 2, memberIds: ['p1', 'p2'], playerId: 'p3'
  })?.errorCode, 2002);
  assert.equal(getRoomJoinError({
    roomExists: true, roomStatus: 'waiting', maxPlayers: 4, memberIds: ['p1'], playerId: 'p2', activeOtherRoom: true
  })?.errorCode, 2005);
  assert.equal(getRoomJoinError({
    roomExists: true, roomStatus: 'waiting', maxPlayers: 2, memberIds: ['p1', 'p2'], playerId: 'p1'
  }), null);
});

test('identifies stale room memberships while preserving a room being joined', () => {
  assert.deepEqual(
    getStaleMembershipIds(['old-waiting', 'current-room', 'live-game'], ['live-game'], 'current-room'),
    ['old-waiting']
  );
});

test('rejects missing and malformed auth tokens before Supabase verification', () => {
  assert.equal(isSupabaseJwtToken(undefined), false);
  assert.equal(isSupabaseJwtToken('not-a-jwt'), false);
  assert.equal(isSupabaseJwtToken('header.payload.signature'), true);
});
