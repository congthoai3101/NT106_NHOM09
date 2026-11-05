document.addEventListener('DOMContentLoaded', () => {
  const toast = document.getElementById('toast') as HTMLDivElement;
  const friendSearch = document.getElementById('friendSearch') as HTMLInputElement;
  const roomCards = Array.from(document.querySelectorAll<HTMLElement>('.room-card'));
  const filters = Array.from(document.querySelectorAll<HTMLButtonElement>('.filter-chip'));
  const featureStage = document.getElementById('featureStage') as HTMLDivElement;
  const mainContent = document.querySelector<HTMLElement>('.main-content')!;
  const featureScreens = Array.from(document.querySelectorAll<HTMLElement>('[data-screen]'));
  let activeFilter = 'all';
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

    document.getElementById('waitingPlayerName')!.textContent = name;
    document.getElementById('tableSelfName')!.textContent = name;
    for (const id of ['waitingAvatar', 'tableSelfAvatar']) {
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

  window.electronAuth.subscribe((state) => {
    if (state.isLoading) return;
    if (!state.isAuthenticated || !state.user || !state.profile || state.profile.id !== state.user.id) {
      redirectToLogin();
      return;
    }

    setPlayerName(state.profile.username, state.profile.avatarUrl);
    document.body.classList.remove('auth-pending');
    document.getElementById('authGuard')?.remove();
  });

  function updateRooms(): void {
    const visibleCards = roomCards.filter((card) => {
      const matchesStatus = activeFilter === 'all' || card.dataset.status === activeFilter;
      card.classList.toggle('filtered-out', !matchesStatus);
      return matchesStatus;
    });
    document.getElementById('emptyState')?.classList.toggle('visible', visibleCards.length === 0);
  }

  filters.forEach((filter) => {
    filter.addEventListener('click', () => {
      activeFilter = filter.dataset.filter || 'all';
      filters.forEach((item) => item.classList.toggle('selected', item === filter));
      updateRooms();
    });
  });

  friendSearch.addEventListener('input', () => {
    const query = friendSearch.value.trim().toLocaleLowerCase('vi');
    document.querySelectorAll<HTMLElement>('.friend-row').forEach((row) => {
      row.classList.toggle('filtered-out', !row.dataset.name?.toLocaleLowerCase('vi').includes(query));
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.join-button:not(:disabled)').forEach((button) => {
    button.addEventListener('click', () => {
      const roomName = button.closest('.room-card')?.querySelector('h3')?.textContent;
      showToast(`Đang kết nối vào phòng ${roomName || 'đã chọn'}...`);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.action-card').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action || 'Thao tác';
      if (action === 'Tạo phòng') {
        showScreen('create-room');
      } else if (action === 'Bảng xếp hạng') {
        showScreen('leaderboard');
      } else {
        showToast('Chưa có phòng trong cơ sở dữ liệu để tham gia nhanh.');
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
    button.addEventListener('click', () => showScreen());
  });

  document.querySelectorAll<HTMLButtonElement>('[data-unavailable]').forEach((button) => {
    button.addEventListener('click', () => showToast('Thao tác sẽ khả dụng khi có dữ liệu phòng trên máy chủ.'));
  });

  document.getElementById('roomSettingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    showToast('Chưa thể tạo phòng: máy chủ chưa có API và bảng dữ liệu phòng.');
  });

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
