interface RoomPlayerView {
  id: string;
  username: string;
  avatarUrl: string | null;
  isReady: boolean;
  isHost: boolean;
  connected?: boolean;
}

interface RoomView {
  id: string;
  roomCode: string;
  hostId: string;
  maxPlayers: number;
  status: string;
  players: RoomPlayerView[];
}

interface PlayerRoomView {
  id: string;
  roomCode: string;
  hostId: string;
  maxPlayers: number;
  status: string;
  playerCount: number;
  isMember: boolean;
}

const cardRanks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const cardSuits = ['♠', '♣', '♦', '♥'];

document.addEventListener('DOMContentLoaded', () => {
  const toast = document.getElementById('toast') as HTMLDivElement;
  const friendSearch = document.getElementById('friendSearch') as HTMLInputElement;
  const roomGrid = document.getElementById('roomGrid')!;
  const emptyState = document.getElementById('emptyState')!;
  const filters = Array.from(document.querySelectorAll<HTMLButtonElement>('.filter-chip'));
  const featureStage = document.getElementById('featureStage') as HTMLDivElement;
  const mainContent = document.querySelector<HTMLElement>('.main-content')!;
  const roomCapacity = document.getElementById('roomCapacity') as HTMLSelectElement;
  const roomModeDescription = document.getElementById('roomModeDescription') as HTMLElement;
  const waitingSeats = document.querySelector<HTMLElement>('.waiting-seats');
  const featureScreens = Array.from(document.querySelectorAll<HTMLElement>('[data-screen]'));
  let activeFilter = 'all';
  let playerRooms: PlayerRoomView[] = [];
  let currentRoom: RoomView | null = null;
  let currentUserId = '';
  let roomListLoadedFor = '';
  let myCards: number[] = [];
  let selectedCards = new Set<number>();
  let currentTurnPlayerId = '';
  let playerCardCounts: Record<string, number> = {};
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function redirectToLogin(): void {
    window.location.replace('../auth/auth.html');
  }

  if (!window.electronAuth) {
    redirectToLogin();
    return;
  }

  function showToast(message: string): void {
    toast.textContent = message;
    toast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function showScreen(screenName?: string): void {
    if (!screenName) {
      featureStage.hidden = true;
      mainContent.hidden = false;
      if (currentUserId) void refreshMyRooms();
      return;
    }

    mainContent.hidden = true;
    featureStage.hidden = false;
    featureScreens.forEach((screen) => {
      screen.hidden = screen.dataset.screen !== screenName;
    });

    const activeNav = screenName === 'leaderboard' ? 'Bảng xếp hạng' : 'Sảnh chơi';
    document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.nav === activeNav);
    });
  }

  function updateRoomModePreview(): void {
    const capacity = Number(roomCapacity.value);
    roomModeDescription.textContent = `Đấu ${capacity} người · 13 lá mỗi người · Chặt heo theo luật chuẩn`;
    document.querySelectorAll<HTMLElement>('[data-room-seat]').forEach((seat) => {
      seat.hidden = Number(seat.dataset.roomSeat) > capacity;
    });
    waitingSeats?.classList.toggle('duel-mode', capacity === 2);
  }

  roomCapacity.addEventListener('change', updateRoomModePreview);
  updateRoomModePreview();

  function setPlayerName(name: string, avatarUrl: string | null): void {
    const firstName = name.trim().split(/\s+/).pop() || name;
    document.getElementById('welcomeName')!.textContent = firstName;
    document.getElementById('headerName')!.textContent = name;
    const avatar = document.getElementById('headerAvatar') as HTMLImageElement;
    const localAvatars: Record<string, string> = {
      avatar_chibi_boy: '../../assets/avatars/avatar_chibi_boy.jpg',
      avatar_chibi_girl: '../../assets/avatars/avatar_chibi_girl.jpg',
      avatar_chibi_ace: '../../assets/avatars/avatar_chibi_ace.jpg',
      avatar_lucky_cat: '../../assets/avatars/avatar_lucky_cat.jpg'
    };
    const resolvedAvatar = avatarUrl && (avatarUrl.includes('/') || avatarUrl.startsWith('data:'))
      ? avatarUrl
      : avatarUrl ? localAvatars[avatarUrl] : undefined;
    if (resolvedAvatar) {
      avatar.src = resolvedAvatar;
      avatar.hidden = false;
    } else {
      avatar.hidden = true;
    }

    document.getElementById('tableSelfName')!.textContent = name;
    for (const id of ['tableSelfAvatar']) {
      const avatarSlot = document.getElementById(id)!;
      avatarSlot.replaceChildren();
      if (resolvedAvatar) {
        const image = document.createElement('img');
        image.src = resolvedAvatar;
        image.alt = '';
        avatarSlot.append(image);
      } else {
        avatarSlot.textContent = firstName.slice(0, 1).toLocaleUpperCase('vi');
      }
    }
  }

  function renderRoomSeats(): void {
    if (!currentRoom) return;
    const waitingSeatsElement = document.getElementById('waitingSeats')!;
    waitingSeatsElement.replaceChildren();
    waitingSeatsElement.classList.toggle('duel-mode', currentRoom.maxPlayers === 2);

    for (let index = 0; index < currentRoom.maxPlayers; index++) {
      const player = currentRoom.players[index];
      const seat = document.createElement('div');
      seat.className = `waiting-seat${player?.id === currentRoom.hostId ? ' host-seat' : ''}`;
      const avatar = document.createElement('div');
      avatar.className = 'waiting-avatar';
      if (player?.avatarUrl) {
        const image = document.createElement('img');
        image.src = player.avatarUrl;
        image.alt = '';
        avatar.append(image);
      } else {
        avatar.textContent = player ? player.username.slice(0, 1).toLocaleUpperCase('vi') : '＋';
      }
      const name = document.createElement('strong');
      name.textContent = player?.username || 'Đang chờ';
      const detail = document.createElement('small');
      detail.textContent = player
        ? player.connected === false ? 'MẤT KẾT NỐI'
          : player.id === currentRoom.hostId ? 'CHỦ PHÒNG' : player.isReady ? 'SẴN SÀNG' : 'ĐANG CHỜ'
        : `VỊ TRÍ ${String(index + 1).padStart(2, '0')}`;
      seat.append(avatar, name, detail);
      if (player?.id === currentRoom.hostId) {
        const check = document.createElement('span');
        check.className = 'seat-check';
        check.textContent = '✓';
        seat.append(check);
      }
      waitingSeatsElement.append(seat);
    }

    document.getElementById('previewRoomName')!.textContent = currentRoom.roomCode;
    document.getElementById('roomCodeText')!.textContent = currentRoom.roomCode;
    document.getElementById('roomStatusText')!.textContent = currentRoom.status === 'PLAYING'
      ? 'ĐANG CHƠI'
      : currentRoom.status === 'FINISHED' ? 'ĐÃ KẾT THÚC' : 'ĐANG CHỜ';
    document.getElementById('roomWaitingHint')!.textContent =
      `${currentRoom.players.length}/${currentRoom.maxPlayers} người chơi · Chia sẻ mã phòng để mời bạn`;
    const readyButton = document.getElementById('readyButton') as HTMLButtonElement;
    const myPlayer = currentRoom.players.find((player) => player.id === currentUserId);
    readyButton.hidden = currentRoom.status !== 'WAITING' || !myPlayer;
    readyButton.textContent = myPlayer?.isReady ? 'Hủy sẵn sàng' : 'Sẵn sàng';
    const startButton = document.getElementById('startGameButton') as HTMLButtonElement;
    startButton.hidden = currentRoom.status !== 'WAITING' || currentRoom.hostId !== currentUserId;
    startButton.disabled = currentRoom.players.length !== currentRoom.maxPlayers ||
      currentRoom.players.some((player) => !player.isReady || player.connected === false);

    renderTableSeats();
  }

  function renderTableSeats(): void {
    const room = currentRoom;
    if (!room) return;
    const felt = document.querySelector<HTMLElement>('.table-felt');
    if (!felt) return;
    felt.querySelectorAll<HTMLElement>('.table-seat:not(.table-seat-bottom)').forEach((seat) => seat.remove());
    const opponents = room.players.filter((player) => player.id !== currentUserId);
    const positions = ['table-seat-top', 'table-seat-left', 'table-seat-right'];
    opponents.forEach((player, index) => {
      const seat = document.createElement('div');
      seat.className = `table-seat ${positions[index]}`;
      const avatar = document.createElement('span');
      avatar.className = 'table-avatar';
      avatar.textContent = player.username.slice(0, 1).toLocaleUpperCase('vi');
      const name = document.createElement('strong');
      name.textContent = player.username;
      const detail = document.createElement('small');
      detail.textContent = `${room.status === 'PLAYING' ? `BÀI CÒN ${playerCardCounts[player.id] ?? 13} · ` : ''}${player.id === currentTurnPlayerId ? 'ĐẾN LƯỢT' : 'ĐỐI THỦ'}`;
      seat.append(avatar, name, detail);
      felt.append(seat);
    });
  }

  function applyRoom(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const payload = value as Record<string, unknown>;
    const roomData = (payload.room && typeof payload.room === 'object' ? payload.room : payload) as Partial<RoomView>;
    if (typeof roomData.roomCode !== 'string' || typeof roomData.hostId !== 'string') return;
    currentRoom = {
      id: typeof roomData.id === 'string' ? roomData.id : '',
      roomCode: roomData.roomCode,
      hostId: roomData.hostId,
      maxPlayers: roomData.maxPlayers === 2 ? 2 : 4,
      status: typeof roomData.status === 'string' ? roomData.status : 'WAITING',
      players: Array.isArray(roomData.players) ? roomData.players as RoomPlayerView[] : []
    };
    localStorage.setItem('currentRoomCode', currentRoom.roomCode);
    renderRooms();
    renderRoomSeats();
    showScreen('waiting-room');
  }

  function updateGameControls(): void {
    const isMyTurn = Boolean(currentUserId && currentTurnPlayerId === currentUserId);
    const playButton = document.getElementById('playCardsButton') as HTMLButtonElement;
    const passButton = document.getElementById('passTurnButton') as HTMLButtonElement;
    playButton.disabled = !isMyTurn || selectedCards.size === 0;
    passButton.disabled = !isMyTurn;
    document.getElementById('handStatus')!.textContent = isMyTurn ? 'Lượt của bạn' : 'Đang chờ lượt';
    document.getElementById('gameStatusText')!.textContent = isMyTurn ? 'LƯỢT CỦA BẠN' : 'ĐANG ĐẤU';
    renderTableSeats();
  }

  function renderHand(): void {
    const handContainer = document.getElementById('handCards')!;
    handContainer.replaceChildren();
    handContainer.hidden = false;
    document.getElementById('handPlaceholder')!.hidden = true;
    for (const card of myCards) {
      const cardButton = document.createElement('button');
      const suit = cardSuits[card % 4];
      cardButton.type = 'button';
      cardButton.className = `playing-card${card % 4 >= 2 ? ' red-card' : ''}${selectedCards.has(card) ? ' selected' : ''}`;
      cardButton.textContent = `${cardRanks[Math.floor(card / 4)]}${suit}`;
      cardButton.setAttribute('aria-pressed', String(selectedCards.has(card)));
      cardButton.addEventListener('click', () => {
        if (selectedCards.has(card)) selectedCards.delete(card);
        else selectedCards.add(card);
        renderHand();
        updateGameControls();
      });
      handContainer.append(cardButton);
    }
    updateGameControls();
  }

  function handleGameEvent(event: { opcode: number; payload: Record<string, unknown> }): void {
    const { opcode, payload } = event;
    if (opcode === 2005 && currentRoom && payload.player && typeof payload.player === 'object') {
      const player = payload.player as RoomPlayerView;
      const existingIndex = currentRoom.players.findIndex((entry) => entry.id === player.id);
      if (existingIndex < 0) currentRoom.players.push(player);
      else currentRoom.players[existingIndex] = { ...currentRoom.players[existingIndex], ...player, connected: true };
      renderRoomSeats();
    } else if (opcode === 2009 && currentRoom && typeof payload.playerId === 'string') {
      if (payload.disconnected === true) {
        currentRoom.players = currentRoom.players.map((player) =>
          player.id === payload.playerId ? { ...player, connected: false } : player
        );
      } else {
        currentRoom.players = currentRoom.players.filter((player) => player.id !== payload.playerId);
      }
      renderRoomSeats();
    } else if (opcode === 2012 && currentRoom && typeof payload.playerId === 'string') {
      currentRoom.players = currentRoom.players.map((player) => player.id === payload.playerId
        ? { ...player, isReady: payload.isReady === true }
        : player);
      renderRoomSeats();
    } else if (opcode === 3001 && Array.isArray(payload.myCards)) {
      myCards = payload.myCards.filter((card): card is number => Number.isInteger(card));
      playerCardCounts = payload.playerCardCounts && typeof payload.playerCardCounts === 'object'
        ? payload.playerCardCounts as Record<string, number>
        : {};
      selectedCards.clear();
      currentTurnPlayerId = String(payload.firstTurnPlayerId || '');
      if (currentRoom) currentRoom.status = 'PLAYING';
      renderRoomSeats();
      showScreen('table');
      renderHand();
    } else if (opcode === 3003 && typeof payload.playerId === 'string') {
      currentTurnPlayerId = payload.playerId;
      updateGameControls();
    } else if (opcode === 3007 && Array.isArray(payload.cards)) {
      if (payload.playerId === currentUserId) {
        const played = payload.cards as number[];
        myCards = myCards.filter((card) => !played.includes(card));
        selectedCards.clear();
        renderHand();
      }
      if (payload.playerCardCounts && typeof payload.playerCardCounts === 'object') {
        playerCardCounts = payload.playerCardCounts as Record<string, number>;
      }
      document.getElementById('gameTableCards')!.textContent = `${String(payload.combination || 'BÀI')} · ${Array.from(payload.cards as number[], (card) => `${cardRanks[Math.floor(card / 4)]}${cardSuits[card % 4]}`).join(' ')}`;
      if (typeof payload.nextTurnPlayerId === 'string') currentTurnPlayerId = payload.nextTurnPlayerId;
      updateGameControls();
    } else if (opcode === 3011 && typeof payload.playerId === 'string') {
      document.getElementById('gameTableCards')!.textContent = 'Người chơi đã bỏ lượt';
      if (typeof payload.nextTurnPlayerId === 'string') currentTurnPlayerId = payload.nextTurnPlayerId;
      updateGameControls();
    } else if (opcode === 3013 && typeof payload.leaderPlayerId === 'string') {
      currentTurnPlayerId = payload.leaderPlayerId;
      document.getElementById('gameTableCards')!.textContent = 'Vòng mới — bài giữa bàn đã được bỏ';
      updateGameControls();
    } else if (opcode === 3017) {
      if (currentRoom) {
        currentRoom.status = 'FINISHED';
        renderRoomSeats();
      }
      currentTurnPlayerId = '';
      updateGameControls();
      document.getElementById('gameStatusText')!.textContent = 'VÁN ĐẤU KẾT THÚC';
      document.getElementById('handStatus')!.textContent = 'Ván đấu đã kết thúc';
      showToast('Ván đấu đã kết thúc.');
    } else if (opcode === 1006 && payload.success === true) {
      applyRoom(payload.room);
      if (Array.isArray(payload.myCards)) {
        myCards = payload.myCards.filter((card): card is number => Number.isInteger(card));
        currentTurnPlayerId = String(payload.currentTurnPlayerId || '');
        playerCardCounts = payload.playerCardCounts && typeof payload.playerCardCounts === 'object'
          ? payload.playerCardCounts as Record<string, number>
          : {};
        const tableCards = Array.isArray(payload.tableCards)
          ? payload.tableCards.filter((card): card is number => Number.isInteger(card) && card >= 0 && card <= 51)
          : [];
        document.getElementById('gameTableCards')!.textContent = tableCards.length
          ? `${String(payload.lastCombination || 'BÀI')} · ${tableCards.map((card) => `${cardRanks[Math.floor(card / 4)]}${cardSuits[card % 4]}`).join(' ')}`
          : 'Chưa có bài trên bàn';
        showScreen('table');
        void refreshMyRooms();
        renderHand();
      }
    } else if (opcode === 3006 || opcode === 3010 || opcode === 2014) {
      if (payload.success === false) showToast(String(payload.message || 'Thao tác không thành công.'));
    } else if (opcode === 4999 || (payload.type && typeof payload.message === 'string')) {
      showToast(String(payload.message));
    }
  }

  window.electronAuth.subscribe((state) => {
    if (state.isLoading) return;
    if (!state.isAuthenticated || !state.user || !state.profile || state.profile.id !== state.user.id) {
      redirectToLogin();
      return;
    }

    currentUserId = state.user.id;
    if (state.session?.access_token) void window.electronAuth!.updateGameToken(state.session.access_token);
    if (roomListLoadedFor !== currentUserId) {
      roomListLoadedFor = currentUserId;
      void refreshMyRooms();
    }
    setPlayerName(state.profile.username, state.profile.avatarUrl);
    document.body.classList.remove('auth-pending');
    document.getElementById('authGuard')?.remove();
    if (currentRoom) renderRoomSeats();
    const savedRoomCode = localStorage.getItem('currentRoomCode');
    if (savedRoomCode && !currentRoom) {
      void window.electronAuth!.joinGameRoom(savedRoomCode)
        .then((result) => applyRoom(result))
        .catch((error) => {
          localStorage.removeItem('currentRoomCode');
          showToast(error instanceof Error ? error.message : 'Không thể khôi phục phòng.');
        });
    }
  });

  window.electronAuth.onGameEvent(handleGameEvent);

  function renderRooms(): void {
    roomGrid.replaceChildren();
    const filterCounts = { all: playerRooms.length, open: 0, playing: 0, full: 0 };
    const visibleRooms = playerRooms.filter((room) => {
      const isFull = room.playerCount >= room.maxPlayers;
      if (room.status === 'PLAYING') filterCounts.playing++;
      else if (isFull) filterCounts.full++;
      else filterCounts.open++;
      return activeFilter === 'all' ||
        (activeFilter === 'playing' && room.status === 'PLAYING') ||
        (activeFilter === 'full' && isFull) ||
        (activeFilter === 'open' && room.status !== 'PLAYING' && !isFull);
    });

    for (const [filter, count] of Object.entries(filterCounts)) {
      const countElement = document.querySelector<HTMLElement>(`.filter-chip[data-filter="${filter}"] span`);
      if (countElement) countElement.textContent = String(count);
    }

    for (const room of visibleRooms) {
      const card = document.createElement('article');
      card.className = `room-card${room.playerCount >= room.maxPlayers ? ' room-full' : ''}`;
      card.dataset.status = room.status === 'PLAYING'
        ? 'playing'
        : room.playerCount >= room.maxPlayers ? 'full' : 'open';
      card.style.setProperty('--room-accent', room.status === 'PLAYING' ? '#d9ac58' : '#39ff88');

      const art = document.createElement('div');
      art.className = 'room-art art-forest';
      const shade = document.createElement('div');
      shade.className = 'room-shade';
      const topLine = document.createElement('div');
      topLine.className = 'room-topline';
      const titleGroup = document.createElement('div');
      titleGroup.className = 'room-title-group';
      const crest = document.createElement('span');
      crest.className = 'room-crest';
      crest.textContent = '♠';
      const titleCopy = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = `Phòng ${room.roomCode}`;
      const subtitle = document.createElement('p');
      subtitle.textContent = `${room.hostId === currentUserId ? 'Chủ phòng' : 'Thành viên'} · ${room.maxPlayers} người`;
      titleCopy.append(title, subtitle);
      titleGroup.append(crest, titleCopy);
      const status = document.createElement('span');
      status.className = 'room-status';
      const statusDot = document.createElement('i');
      const statusText = document.createElement('span');
      statusText.textContent = room.status === 'PLAYING'
        ? 'ĐANG CHƠI'
        : room.playerCount >= room.maxPlayers ? 'ĐÃ ĐẦY' : 'ĐANG CHỜ';
      status.append(statusDot, statusText);
      topLine.append(titleGroup, status);

      const seats = document.createElement('div');
      seats.className = 'room-seats';
      for (let index = 0; index < room.maxPlayers; index++) {
        const seat = document.createElement('div');
        seat.className = index < room.playerCount ? 'seat' : 'seat empty';
        const avatar = document.createElement('span');
        avatar.textContent = index < room.playerCount ? '♙' : '＋';
        const label = document.createElement('small');
        label.textContent = index < room.playerCount ? 'Đã vào' : 'Còn trống';
        seat.append(avatar, label);
        seats.append(seat);
      }

      const bottom = document.createElement('div');
      bottom.className = 'room-bottom';
      const count = document.createElement('span');
      count.className = 'player-count';
      count.textContent = `${room.playerCount}/${room.maxPlayers} người chơi`;
      const joinButton = document.createElement('button');
      joinButton.type = 'button';
      joinButton.className = 'join-button';
      joinButton.textContent = currentRoom?.id === room.id ? 'Mở phòng' : 'Vào phòng';
      joinButton.disabled = (room.status !== 'WAITING' && currentRoom?.id !== room.id) ||
        (room.playerCount >= room.maxPlayers && !room.isMember);
      joinButton.addEventListener('click', () => {
        if (currentRoom?.id === room.id) {
          showScreen(currentRoom.status === 'PLAYING' ? 'table' : 'waiting-room');
          return;
        }
        void openRoom(room.roomCode, joinButton);
      });
      bottom.append(count, joinButton);
      card.append(art, shade, topLine, seats, bottom);
      roomGrid.append(card);
    }

    emptyState.classList.toggle('visible', visibleRooms.length === 0);
    if (visibleRooms.length === 0) {
      emptyState.textContent = playerRooms.length
        ? 'Không có phòng nào phù hợp với bộ lọc.'
        : 'Bạn chưa tạo hoặc tham gia phòng nào.';
    }
  }

  async function refreshMyRooms(): Promise<void> {
    try {
      playerRooms = await window.electronAuth!.listMyRooms();
      renderRooms();
    } catch (error) {
      console.error('[My Rooms Error]:', error);
      emptyState.textContent = 'Không thể tải danh sách phòng. Vui lòng thử tải lại sau.';
      emptyState.classList.add('visible');
      showToast(error instanceof Error ? error.message : 'Không thể tải danh sách phòng.');
    }
  }

  async function openRoom(roomCode: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const result = await window.electronAuth!.joinGameRoom(roomCode);
      applyRoom(result.room);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể vào phòng.');
    } finally {
      button.disabled = false;
    }
  }

  filters.forEach((filter) => {
    filter.addEventListener('click', () => {
      activeFilter = filter.dataset.filter || 'all';
      filters.forEach((item) => item.classList.toggle('selected', item === filter));
      renderRooms();
    });
  });

  friendSearch.addEventListener('input', () => {
    const query = friendSearch.value.trim().toLocaleLowerCase('vi');
    document.querySelectorAll<HTMLElement>('.friend-row').forEach((row) => {
      row.classList.toggle('filtered-out', !row.dataset.name?.toLocaleLowerCase('vi').includes(query));
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.action-card').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.action === 'Nhập mã phòng') {
        showScreen('join-room');
        (document.getElementById('joinRoomCodeInput') as HTMLInputElement).focus();
      } else {
        showScreen('create-room');
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
      if (button.dataset.nav === 'Bảng xếp hạng') {
        showScreen('leaderboard');
      } else if (button.dataset.nav === 'Sảnh chơi') {
        showScreen();
      } else {
        showToast('Cơ sở dữ liệu chưa có tính năng bạn bè.');
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-screen-target]').forEach((button) => {
    button.addEventListener('click', () => showScreen(button.dataset.screenTarget));
  });

  document.querySelectorAll<HTMLButtonElement>('[data-screen-back]').forEach((button) => {
    button.addEventListener('click', () => {
      const activeScreen = featureScreens.find((screen) => !screen.hidden)?.dataset.screen;
      if (activeScreen) showScreen();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-unavailable]').forEach((button) => {
    button.addEventListener('click', () => showToast('Thao tác sẽ khả dụng khi có dữ liệu phòng trên máy chủ.'));
  });

  const roomSettingsForm = document.getElementById('roomSettingsForm') as HTMLFormElement;
  roomSettingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = roomSettingsForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const nameInput = document.getElementById('roomNameInput') as HTMLInputElement;
    const roomName = nameInput.value.trim();
    const maxPlayers = Number(roomCapacity.value);

    if (!roomName) {
      nameInput.focus();
      showToast('Vui lòng nhập tên phòng.');
      return;
    }

    if (submitButton) submitButton.disabled = true;
    try {
      const room = await window.electronAuth!.createRoom(roomName, maxPlayers);
      const joined = await window.electronAuth!.joinGameRoom(room.roomCode);
      applyRoom(joined.room);
      void refreshMyRooms();
      document.getElementById('previewRoomName')!.textContent = room.name;
      showToast(`Đã tạo phòng ${room.roomCode}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo phòng. Vui lòng thử lại.');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  const joinRoomForm = document.getElementById('joinRoomForm') as HTMLFormElement;
  joinRoomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const codeInput = document.getElementById('joinRoomCodeInput') as HTMLInputElement;
    const code = codeInput.value.trim().toUpperCase();
    const button = joinRoomForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!code) return;
    if (button) button.disabled = true;
    try {
      const result = await window.electronAuth!.joinGameRoom(code);
      applyRoom(result.room);
      showToast(`Đã vào phòng ${code}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tham gia phòng.');
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById('readyButton')?.addEventListener('click', async () => {
    const myPlayer = currentRoom?.players.find((player) => player.id === currentUserId);
    try {
      const result = await window.electronAuth!.setGameReady(!myPlayer?.isReady);
      if (result.success === false) showToast(String(result.message || 'Không thể đổi trạng thái sẵn sàng.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể kết nối game server.');
    }
  });

  document.getElementById('startGameButton')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAuth!.startGame();
      if (result.success === false) showToast(String(result.message || 'Chưa thể bắt đầu ván.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể bắt đầu ván.');
    }
  });

  document.getElementById('playCardsButton')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAuth!.playCards([...selectedCards]);
      if (result.success === false) showToast(String(result.message || 'Bài đánh không hợp lệ.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể đánh bài.');
    }
  });

  document.getElementById('passTurnButton')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAuth!.passTurn();
      if (result.success === false) showToast(String(result.message || 'Không thể bỏ lượt.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể bỏ lượt.');
    }
  });

  document.getElementById('copyRoomCodeButton')?.addEventListener('click', async () => {
    if (!currentRoom) return;
    try {
      await navigator.clipboard.writeText(currentRoom.roomCode);
      showToast('Đã sao chép mã phòng.');
    } catch {
      showToast(`Mã phòng: ${currentRoom.roomCode}`);
    }
  });

  async function leaveRoom(): Promise<void> {
    let leftRoom = false;
    try {
      await window.electronAuth!.leaveGameRoom();
      leftRoom = true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể rời phòng.');
    }
    if (!leftRoom) return;
    currentRoom = null;
    myCards = [];
    selectedCards.clear();
    playerCardCounts = {};
    currentTurnPlayerId = '';
    localStorage.removeItem('currentRoomCode');
    showScreen();
  }

  document.getElementById('leaveWaitingRoomButton')?.addEventListener('click', () => void leaveRoom());
  document.getElementById('leaveTableButton')?.addEventListener('click', () => void leaveRoom());
  document.getElementById('returnToLobbyFromTableButton')?.addEventListener('click', () => showScreen());

  document.querySelectorAll<HTMLButtonElement>('.period-button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.period-button').forEach((item) => item.classList.toggle('selected', item === button));
      showToast('Chưa có lịch sử trận đấu để tính thứ hạng.');
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.friend-message').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.closest<HTMLElement>('.friend-row')?.dataset.name;
      showToast(`Mở trò chuyện với ${name || 'bạn bè'}...`);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.friend-more').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.closest<HTMLElement>('.friend-row')?.dataset.name;
      showToast(`Tùy chọn của ${name || 'bạn bè'}`);
    });
  });

  document.getElementById('notificationButton')?.addEventListener('click', () => showToast('Cơ sở dữ liệu chưa có dữ liệu thông báo.'));
  document.getElementById('profileButton')?.addEventListener('click', () => showToast('Hồ sơ người chơi'));
  document.getElementById('addFriendButton')?.addEventListener('click', () => showToast('Tính năng thêm bạn sẽ sớm có mặt!'));

  document.getElementById('logoutButton')?.addEventListener('click', async () => {
    try {
      await window.electronAuth?.logout();
      redirectToLogin();
    } catch {
      showToast('Không thể đăng xuất lúc này. Vui lòng thử lại.');
    }
  });

  document.getElementById('btnMinimize')?.addEventListener('click', () => window.electronWindow?.minimize());
  document.getElementById('btnMaximize')?.addEventListener('click', () => window.electronWindow?.maximize());
  document.getElementById('btnClose')?.addEventListener('click', () => window.electronWindow?.close());

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      friendSearch.focus();
    }
  });
});

export {};
