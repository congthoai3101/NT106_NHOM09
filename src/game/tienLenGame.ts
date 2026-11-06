import { randomInt, randomUUID } from 'node:crypto';

export type CombinationType =
  | 'SINGLE'
  | 'PAIR'
  | 'TRIPLE'
  | 'STRAIGHT'
  | 'FOUR_OF_A_KIND'
  | 'THREE_PAIRS_CHAIN'
  | 'FOUR_PAIRS_CHAIN';

export interface GamePlayer {
  id: string;
  username: string;
}

export interface Combination {
  type: CombinationType;
  cards: number[];
  strength: number;
}

export interface TienLenGame {
  matchId: string;
  players: GamePlayer[];
  hands: Map<string, number[]>;
  turnIndex: number;
  leaderIndex: number;
  lastPlay: { playerId: string; combination: Combination } | null;
  passedPlayerIds: Set<string>;
  standings: string[];
  firstPlay: boolean;
}

export class GameRuleError extends Error {
  constructor(public readonly errorCode: number, message: string) {
    super(message);
    this.name = 'GameRuleError';
  }
}

function cardRank(card: number): number {
  return Math.floor(card / 4);
}

function cardSuit(card: number): number {
  return card % 4;
}

export function classifyCards(cards: number[]): Combination | null {
  if (!cards.length || cards.length > 13 ||
      cards.some((card) => !Number.isInteger(card) || card < 0 || card > 51) ||
      new Set(cards).size !== cards.length) return null;

  const sorted = [...cards].sort((a, b) => a - b);
  const ranks = sorted.map(cardRank);
  const counts = new Map<number, number>();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) || 0) + 1));
  const uniqueRanks = [...counts.keys()].sort((a, b) => a - b);
  const strength = (rank: number): number =>
    rank * 4 + Math.max(...sorted.filter((card) => cardRank(card) === rank).map(cardSuit));

  if (sorted.length === 1) return { type: 'SINGLE', cards: sorted, strength: sorted[0] };
  if (counts.size === 1) {
    const rank = uniqueRanks[0];
    if (sorted.length === 2) return { type: 'PAIR', cards: sorted, strength: strength(rank) };
    if (sorted.length === 3) return { type: 'TRIPLE', cards: sorted, strength: strength(rank) };
    if (sorted.length === 4) return { type: 'FOUR_OF_A_KIND', cards: sorted, strength: strength(rank) };
    return null;
  }

  if (sorted.length >= 3 && uniqueRanks.length === sorted.length &&
      uniqueRanks[uniqueRanks.length - 1] < 12 &&
      uniqueRanks.every((rank, index) => index === 0 || rank === uniqueRanks[index - 1] + 1)) {
    const highRank = uniqueRanks[uniqueRanks.length - 1];
    return { type: 'STRAIGHT', cards: sorted, strength: strength(highRank) };
  }

  if ((sorted.length === 6 || sorted.length === 8) &&
      [...counts.values()].every((count) => count === 2) &&
      uniqueRanks.every((rank, index) => index === 0 || rank === uniqueRanks[index - 1] + 1)) {
    const highRank = uniqueRanks[uniqueRanks.length - 1];
    return {
      type: sorted.length === 6 ? 'THREE_PAIRS_CHAIN' : 'FOUR_PAIRS_CHAIN',
      cards: sorted,
      strength: strength(highRank)
    };
  }
  return null;
}

export function combinationBeats(candidate: Combination, previous: Combination): boolean {
  if (candidate.type === previous.type && candidate.cards.length === previous.cards.length) {
    return candidate.strength > previous.strength;
  }
  if (previous.type === 'SINGLE' && cardRank(previous.cards[0]) === 12) {
    return candidate.type === 'FOUR_OF_A_KIND' || candidate.type === 'THREE_PAIRS_CHAIN' ||
      candidate.type === 'FOUR_PAIRS_CHAIN';
  }
  if (previous.type === 'PAIR' && cardRank(previous.cards[0]) === 12) {
    return candidate.type === 'FOUR_PAIRS_CHAIN';
  }
  return false;
}

function shuffledDeck(): number[] {
  const cards = Array.from({ length: 52 }, (_, card) => card);
  for (let index = cards.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}

export function createGame(players: GamePlayer[], deck = shuffledDeck()): TienLenGame {
  if (players.length < 2 || players.length > 4) throw new Error('A game requires two to four players.');
  const hands = new Map<string, number[]>();
  players.forEach((player, index) => {
    hands.set(player.id, [...deck.slice(index * 13, index * 13 + 13)].sort((a, b) => a - b));
  });
  const firstPlayer = players.findIndex((player) => hands.get(player.id)?.includes(0));
  if (firstPlayer < 0) throw new Error('The deck must contain the three of spades.');

  return {
    matchId: randomUUID(),
    players: [...players],
    hands,
    turnIndex: firstPlayer,
    leaderIndex: firstPlayer,
    lastPlay: null,
    passedPlayerIds: new Set(),
    standings: [],
    firstPlay: true
  };
}

function nextActiveIndex(game: TienLenGame, fromIndex: number): number {
  for (let offset = 1; offset <= game.players.length; offset++) {
    const index = (fromIndex + offset) % game.players.length;
    if (!game.standings.includes(game.players[index].id)) return index;
  }
  return fromIndex;
}

function finishIfComplete(game: TienLenGame): boolean {
  const activePlayers = game.players.filter((player) => !game.standings.includes(player.id));
  if (activePlayers.length <= 1) {
    if (activePlayers.length === 1) game.standings.push(activePlayers[0].id);
    return true;
  }
  return false;
}

export function playCards(game: TienLenGame, playerId: string, cards: number[]): {
  combination: Combination;
  finished: boolean;
  nextTurnPlayerId: string | null;
} {
  const player = game.players[game.turnIndex];
  if (!player || player.id !== playerId) throw new GameRuleError(3001, 'Chưa đến lượt của bạn.');

  const hand = game.hands.get(playerId);
  if (!hand || cards.some((card) => !hand.includes(card))) {
    throw new GameRuleError(3002, 'Bạn không sở hữu một hoặc nhiều lá bài đã chọn.');
  }

  const combination = classifyCards(cards);
  if (!combination) throw new GameRuleError(3003, 'Tổ hợp bài không hợp lệ.');
  if (game.firstPlay && !cards.includes(0)) {
    throw new GameRuleError(3005, 'Lượt đầu tiên phải đánh lá 3 Bích.');
  }
  if (game.lastPlay && !combinationBeats(combination, game.lastPlay.combination)) {
    throw new GameRuleError(3004, 'Tổ hợp bài không đè được bài trước.');
  }

  game.hands.set(playerId, hand.filter((card) => !cards.includes(card)));
  game.lastPlay = { playerId, combination };
  game.passedPlayerIds.clear();
  game.firstPlay = false;

  if (game.hands.get(playerId)?.length === 0 && !game.standings.includes(playerId)) {
    game.standings.push(playerId);
  }

  const finished = finishIfComplete(game);
  if (finished) return { combination, finished, nextTurnPlayerId: null };
  game.turnIndex = nextActiveIndex(game, game.turnIndex);
  return { combination, finished, nextTurnPlayerId: game.players[game.turnIndex].id };
}

export function passTurn(game: TienLenGame, playerId: string): {
  roundReset: boolean;
  nextTurnPlayerId: string;
} {
  const player = game.players[game.turnIndex];
  if (!player || player.id !== playerId) throw new GameRuleError(3001, 'Chưa đến lượt của bạn.');
  if (!game.lastPlay || game.lastPlay.playerId === playerId) {
    throw new GameRuleError(3006, 'Người mở vòng mới không được bỏ lượt.');
  }

  game.passedPlayerIds.add(playerId);
  const nextIndex = nextActiveIndex(game, game.turnIndex);
  const activeOpponents = game.players.filter((entry) =>
    entry.id !== game.lastPlay?.playerId && !game.standings.includes(entry.id)
  );
  const everyonePassed = activeOpponents.every((entry) => game.passedPlayerIds.has(entry.id));

  if (everyonePassed) {
    game.turnIndex = game.players.findIndex((entry) => entry.id === game.lastPlay?.playerId);
    game.leaderIndex = game.turnIndex;
    game.lastPlay = null;
    game.passedPlayerIds.clear();
    return { roundReset: true, nextTurnPlayerId: game.players[game.turnIndex].id };
  }

  game.turnIndex = nextIndex;
  return { roundReset: false, nextTurnPlayerId: game.players[nextIndex].id };
}

export function forfeitDisconnectedPlayer(game: TienLenGame, playerId: string): boolean {
  const playerIndex = game.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0 || game.standings.includes(playerId)) return finishIfComplete(game);

  if (game.players.length === 2) {
    const winner = game.players.find((player) => player.id !== playerId && !game.standings.includes(player.id));
    if (winner) game.standings.push(winner.id);
    game.standings.push(playerId);
    return true;
  }

  if (game.firstPlay && game.hands.get(playerId)?.includes(0)) game.firstPlay = false;
  game.standings.push(playerId);
  if (game.players[game.turnIndex].id === playerId) {
    game.turnIndex = nextActiveIndex(game, playerIndex);
    game.leaderIndex = game.turnIndex;
  }
  return finishIfComplete(game);
}

export function buildPlayerCounts(game: TienLenGame): Record<string, number> {
  return Object.fromEntries(game.players.map((player) => [player.id, game.hands.get(player.id)?.length || 0]));
}
