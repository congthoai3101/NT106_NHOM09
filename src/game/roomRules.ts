export function isSupabaseJwtToken(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= 8192 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

export function getStaleMembershipIds(
  membershipRoomIds: string[],
  liveRoomIds: string[],
  preserveRoomId?: string
): string[] {
  const liveRooms = new Set(liveRoomIds);
  return membershipRoomIds.filter((roomId) =>
    roomId !== preserveRoomId && !liveRooms.has(roomId)
  );
}

export function getRoomJoinError(input: {
  roomExists: boolean;
  roomStatus?: string;
  maxPlayers?: number;
  memberIds?: string[];
  playerId: string;
  activeOtherRoom?: boolean;
}): { errorCode: number; message: string } | null {
  if (!input.roomExists) return { errorCode: 2001, message: 'Không tìm thấy phòng chơi.' };
  if (input.activeOtherRoom) return { errorCode: 2005, message: 'Bạn đang ở trong một phòng khác.' };
  if (input.roomStatus !== 'waiting') return { errorCode: 2001, message: 'Phòng không còn nhận người chơi.' };
  const memberIds = input.memberIds || [];
  if (memberIds.includes(input.playerId)) return null;
  if (memberIds.length >= (input.maxPlayers || 0)) {
    return { errorCode: 2002, message: 'Phòng đã đủ số lượng người chơi.' };
  }
  return null;
}
