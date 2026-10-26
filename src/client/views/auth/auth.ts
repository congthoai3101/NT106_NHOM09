/**
 * auth.ts - Logic xử lý giao diện Xác thực game Tiến Lên Miền Nam
 * Phong cách: Bàn đánh bài làm mờ bokeh & Bộ sưu tập Avatar đa dạng
 * Chuẩn: UI/UX Pro Max (Không Emoji, Micro-interactions 200-300ms, Focus rings, Shake error)
 */

interface ElectronWindowAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
}

interface ElectronAuthAPI {
  login: (input: any) => Promise<any>;
  register: (input: any) => Promise<any>;
  forgotPassword: (input: any) => Promise<any>;
  logout: () => Promise<any>;
  getState: () => any;
  subscribe: (callback: (state: any) => void) => () => void;
}

declare global {
  interface Window {
    electronWindow?: ElectronWindowAPI;
    electronAuth?: ElectronAuthAPI;
  }
}

interface AvatarPreset {
  name: string;
  url: string;
}

const AVATAR_PRESETS: AvatarPreset[] = [
  { name: 'Thần Bài Nhí', url: '../../assets/avatars/avatar_chibi_boy.jpg' },
  { name: 'Nữ Hoàng Áo Dài', url: '../../assets/avatars/avatar_chibi_girl.jpg' },
  { name: 'Mèo Thần Tài Á Bích', url: '../../assets/avatars/avatar_lucky_cat.jpg' },
  { name: 'Hiệp Sĩ Á Bích', url: '../../assets/avatars/avatar_chibi_ace.jpg' },
  { name: 'Robot Bài Thủ', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=CyberAce' },
  { name: 'Vua Điện Tử', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=KingCard' },
  { name: 'Phượng Hoàng Lửa', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=PhoenixVIP' },
  { name: 'Long Thần Tài', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=DragonGold' }
];

document.addEventListener('DOMContentLoaded', () => {
  // 1. Tham chiếu các phần tử DOM
  const btnMinimize = document.getElementById('btnMinimize') as HTMLButtonElement;
  const btnMaximize = document.getElementById('btnMaximize') as HTMLButtonElement;
  const btnClose = document.getElementById('btnClose') as HTMLButtonElement;

  const mainCard = document.getElementById('mainCard') as HTMLDivElement;
  const tabLogin = document.getElementById('tabLogin') as HTMLButtonElement;
  const tabRegister = document.getElementById('tabRegister') as HTMLButtonElement;
  const switchAuthBtn = document.getElementById('switchAuthBtn') as HTMLSpanElement;

  const btnPrevAvatar = document.getElementById('btnPrevAvatar') as HTMLButtonElement;
  const btnNextAvatar = document.getElementById('btnNextAvatar') as HTMLButtonElement;
  const avatarWrapper = document.getElementById('avatarWrapper') as HTMLDivElement;
  const avatarImg = document.getElementById('avatarImg') as HTMLImageElement;
  const avatarCaption = document.getElementById('avatarCaption') as HTMLSpanElement;

  const authForm = document.getElementById('authForm') as HTMLFormElement;
  const accountInput = document.getElementById('accountInput') as HTMLInputElement;
  const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
  const confirmPasswordInput = document.getElementById('confirmPasswordInput') as HTMLInputElement;
  const regUsernameInput = document.getElementById('regUsernameInput') as HTMLInputElement;
  const togglePasswordBtn = document.getElementById('togglePassword') as HTMLButtonElement;
  const rememberMe = document.getElementById('rememberMe') as HTMLInputElement;
  const linkForgotPassword = document.getElementById('linkForgotPassword') as HTMLAnchorElement;

  const btnAction = document.getElementById('btnAction') as HTMLButtonElement;
  const btnActionText = document.getElementById('btnActionText') as HTMLSpanElement;
  const toastNotice = document.getElementById('toastNotice') as HTMLDivElement;
  const toastMsg = document.getElementById('toastMsg') as HTMLSpanElement;

  let isRegisterMode = false;
  let toastTimer: any = null;
  let currentAvatarIdx = 0;

  // 2. Avatar Carousel Logic (8 Avatar phong phú)
  function updateAvatarDisplay(index: number): void {
    currentAvatarIdx = (index + AVATAR_PRESETS.length) % AVATAR_PRESETS.length;
    const current = AVATAR_PRESETS[currentAvatarIdx];

    avatarImg.style.opacity = '0.4';
    avatarImg.style.transform = 'scale(0.85)';

    setTimeout(() => {
      avatarImg.src = current.url;
      avatarCaption.textContent = `${current.name} (${currentAvatarIdx + 1}/${AVATAR_PRESETS.length})`;
      avatarImg.style.opacity = '1';
      avatarImg.style.transform = 'scale(1)';
    }, 150);
  }

  btnPrevAvatar?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateAvatarDisplay(currentAvatarIdx - 1);
  });

  btnNextAvatar?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateAvatarDisplay(currentAvatarIdx + 1);
  });

  avatarWrapper?.addEventListener('click', () => {
    updateAvatarDisplay(currentAvatarIdx + 1);
  });

  avatarCaption?.addEventListener('click', () => {
    updateAvatarDisplay(currentAvatarIdx + 1);
  });

  // 3. Hiển thị thông báo Toast chuẩn UI/UX
  function showToast(type: 'success' | 'error' | 'info', message: string): void {
    if (toastTimer) clearTimeout(toastTimer);

    toastMsg.textContent = message;
    if (type === 'success') {
      toastNotice.style.borderLeftColor = 'var(--color-success)';
    } else if (type === 'error') {
      toastNotice.style.borderLeftColor = 'var(--color-error)';
    } else {
      toastNotice.style.borderLeftColor = 'var(--gold-primary)';
    }

    toastNotice.classList.add('show');
    toastTimer = setTimeout(() => {
      toastNotice.classList.remove('show');
    }, 3500);
  }

  // 4. Hiệu ứng Rung Lắc (Shake Animation) khi lỗi nhập liệu
  function triggerCardShake(errorMessage?: string): void {
    mainCard.classList.remove('shake');
    // Kích hoạt browser reflow để re-trigger animation
    void mainCard.offsetWidth;
    mainCard.classList.add('shake');

    if (errorMessage) {
      showToast('error', errorMessage);
    }
  }

  // 5. Chuyển đổi giữa Chế độ Đăng nhập và Đăng ký
  function setMode(registerMode: boolean): void {
    isRegisterMode = registerMode;

    if (isRegisterMode) {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      mainCard.classList.add('mode-register');
      btnActionText.textContent = 'ĐĂNG KÝ NGAY';
      switchAuthBtn.textContent = 'Đã có tài khoản? Đăng nhập ngay';
      if (regUsernameInput) regUsernameInput.required = true;
      if (confirmPasswordInput) confirmPasswordInput.required = true;
    } else {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      mainCard.classList.remove('mode-register');
      btnActionText.textContent = 'VÀO SÒNG';
      switchAuthBtn.textContent = 'Chưa có tài khoản? Đăng ký ngay';
      if (regUsernameInput) regUsernameInput.required = false;
      if (confirmPasswordInput) confirmPasswordInput.required = false;
    }
  }

  tabLogin?.addEventListener('click', () => setMode(false));
  tabRegister?.addEventListener('click', () => setMode(true));
  switchAuthBtn?.addEventListener('click', () => setMode(!isRegisterMode));

  // 6. Ẩn / Hiện Mật khẩu (Toggle Password)
  togglePasswordBtn?.addEventListener('click', () => {
    const isPass = passwordInput.type === 'password';
    passwordInput.type = isPass ? 'text' : 'password';
    if (confirmPasswordInput) confirmPasswordInput.type = isPass ? 'text' : 'password';
    togglePasswordBtn.textContent = isPass ? 'Ẩn' : 'Hiện';
  });

  // 7. Xử lý nút điều khiển cửa sổ Electron Frameless
  if (window.electronWindow) {
    btnMinimize?.addEventListener('click', () => window.electronWindow?.minimize());
    btnMaximize?.addEventListener('click', () => window.electronWindow?.maximize());
    btnClose?.addEventListener('click', () => window.electronWindow?.close());
  }

  // 8. Quên mật khẩu
  linkForgotPassword?.addEventListener('click', async () => {
    const email = accountInput.value.trim();
    if (!email) {
      triggerCardShake('Vui lòng nhập Email vào ô tài khoản để khôi phục.');
      accountInput.focus();
      return;
    }

    try {
      if (window.electronAuth) {
        const res = await window.electronAuth.forgotPassword({ email });
        if (res.success) {
          showToast('info', 'Đã gửi hướng dẫn khôi phục mật khẩu vào Email của bạn!');
        } else {
          triggerCardShake(res.error || 'Không gửi được email khôi phục.');
        }
      } else {
        showToast('info', 'Đã gửi email khôi phục mô phỏng.');
      }
    } catch (err: any) {
      triggerCardShake(err.message || 'Lỗi gửi yêu cầu khôi phục.');
    }
  });

  // 9. Xử lý Submit Form (Đăng nhập / Đăng ký)
  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const account = accountInput.value.trim();
    const password = passwordInput.value;

    if (!account || !password) {
      triggerCardShake('Vui lòng nhập đầy đủ Tài khoản và Mật khẩu.');
      return;
    }

    // Nếu ở chế độ Đăng Ký
    if (isRegisterMode) {
      const confirmPass = confirmPasswordInput.value;
      const username = regUsernameInput.value.trim() || account.split('@')[0];

      if (password !== confirmPass) {
        triggerCardShake('Mật khẩu xác nhận không trùng khớp!');
        confirmPasswordInput.focus();
        return;
      }

      if (password.length < 6) {
        triggerCardShake('Mật khẩu phải có tối thiểu 6 ký tự.');
        passwordInput.focus();
        return;
      }

      // Bật trạng thái Loading
      btnAction.disabled = true;
      btnAction.classList.add('loading');

      try {
        if (window.electronAuth) {
          const selectedAvatar = AVATAR_PRESETS[currentAvatarIdx].url;
          const res = await window.electronAuth.register({
            email: account,
            password: password,
            username: username,
            avatar_url: selectedAvatar
          });

          if (res.success) {
            showToast('success', 'Đăng ký thành công! Hãy vào sòng ngay.');
            setMode(false);
          } else {
            triggerCardShake(res.error || 'Đăng ký không thành công.');
          }
        } else {
          showToast('success', 'Đăng ký mô phỏng thành công!');
          setMode(false);
        }
      } catch (err: any) {
        triggerCardShake(err.message || 'Lỗi kết nối khi đăng ký.');
      } finally {
        btnAction.disabled = false;
        btnAction.classList.remove('loading');
      }

      return;
    }

    // Nếu ở chế độ Đăng Nhập
    btnAction.disabled = true;
    btnAction.classList.add('loading');

    try {
      if (window.electronAuth) {
        const res = await window.electronAuth.login({
          email: account,
          password: password,
          rememberMe: rememberMe.checked
        });

        if (res.success) {
          showToast('success', `Chào mừng ${res.profile?.username || 'bạn'} đã vào sòng!`);
          document.body.style.transition = 'opacity 0.5s ease';
          document.body.style.opacity = '0.7';
        } else {
          triggerCardShake(res.error || 'Tài khoản hoặc mật khẩu không chính xác.');
        }
      } else {
        showToast('success', 'Vào sòng thành công!');
      }
    } catch (err: any) {
      triggerCardShake(err.message || 'Lỗi đăng nhập vào sòng.');
    } finally {
      btnAction.disabled = false;
      btnAction.classList.remove('loading');
    }
  });

  // 10. Tự động kiểm tra trạng thái phiên cũ khi vừa mở
  if (window.electronAuth) {
    const curState = window.electronAuth.getState();
    if (curState?.isAuthenticated && curState.user) {
      showToast('success', `Đã nhận diện: ${curState.profile?.username || curState.user.email}`);
    }
  }
});

export {};
