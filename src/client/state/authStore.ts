import { Session, Subscription } from '@supabase/supabase-js';
import { supabase } from '../config/supabaseClient';
import { AuthService } from '../services/authService';
import {
  AuthState,
  LoginFormInput,
  RegisterFormInput,
  ForgotPasswordFormInput,
  AuthResponse
} from '../../shared/types/auth.types';

export type StateListener = (state: AuthState) => void;

/**
 * Global Auth Store quản lý trạng thái phiên đăng nhập tập trung (Singleton)
 * Áp dụng Observer Pattern (Pub/Sub) để thông báo cho toàn bộ UI tự động re-render
 */
class AuthStore { 
  private state: AuthState = {
    user: null,
    session: null,
    profile: null,
    isAuthenticated: false,
    isLoading: true
  };

  private listeners: StateListener[] = [];
  private authSubscription: Subscription | null = null;

  constructor() {
    this.init();
  }

  /**
   * Khởi tạo store: Đọc session lưu trữ từ trước và lắng nghe biến động phiên
   */
  private async init(): Promise<void> {
    try {
      // 1. Phục hồi phiên đăng nhập đã lưu trong máy tính (Auto-login khi mở app)
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session) {
        await this.handleSessionUpdate(data.session);
      } else {
        this.updateState({
          user: null,
          session: null,
          profile: null,
          isAuthenticated: false,
          isLoading: false
        });
      }

      // 2. Lắng nghe trực tiếp các sự kiện từ Supabase Auth Server:
      // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY
      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log(`[Supabase Auth Event]: ${event}`);
          await this.handleSessionUpdate(session);
        }
      );

      this.authSubscription = authListener.subscription;
    } catch (err) {
      console.warn('[AuthStore Init Error]:', err);
      this.updateState({ isLoading: false });
    }
  }

  /**
   * Cập nhật trạng thái người dùng và nạp hồ sơ từ CSDL
   */
  private async handleSessionUpdate(session: Session | null): Promise<void> {
    if (session?.user) {
      // Đã có phiên đăng nhập hợp lệ
      const profile = await AuthService.fetchProfile(session.user.id);

      this.updateState({
        user: session.user,
        session: session,
        profile: profile,
        isAuthenticated: true,
        isLoading: false
      });
    } else {
      // Chưa đăng nhập hoặc vừa đăng xuất
      this.updateState({
        user: null,
        session: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  }

  /**
   * Cập nhật nội bộ state và phát thông báo tới tất cả UI components
   */
  private updateState(partialState: Partial<AuthState>): void {
    this.state = { ...this.state, ...partialState };
    this.notify();
  }

  /**
   * Lấy snapshot trạng thái hiện tại
   */
  public getState(): AuthState {
    return this.state;
  }

  /**
   * Đăng ký lắng nghe biến động trạng thái (dành cho UI Components)
   * Trả về hàm hủy đăng ký (unsubscribe) để dọn dẹp bộ nhớ
   */
  public subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    // Bắn state hiện tại ngay lập tức cho component vừa đăng ký
    listener(this.state);

    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Thông báo tới toàn bộ listeners đang theo dõi
   */
  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[AuthStore Listener Error]:', err);
      }
    }
  }

  // ==========================================
  // CÁC HÀNH ĐỘNG (ACTIONS) CHO UI COMPONENTS GỌI
  // ==========================================

  /**
   * Thực hiện đăng nhập tài khoản
   */
  public async login(input: LoginFormInput): Promise<AuthResponse> {
    this.updateState({ isLoading: true });
    try {
      const res = await AuthService.login(input);
      if (!res.success) {
        this.updateState({ isLoading: false });
      }
      return res;
    } catch (err: any) {
      this.updateState({ isLoading: false });
      return {
        success: false,
        message: err.message || 'Đăng nhập thất bại.'
      };
    }
  }

  /**
   * Thực hiện đăng ký tài khoản mới
   */
  public async register(input: RegisterFormInput): Promise<AuthResponse> {
    this.updateState({ isLoading: true });
    try {
      const res = await AuthService.register(input);
      this.updateState({ isLoading: false });
      return res;
    } catch (err: any) {
      this.updateState({ isLoading: false });
      return {
        success: false,
        message: err.message || 'Đăng ký thất bại.'
      };
    }
  }

  /**
   * Yêu cầu gửi email khôi phục mật khẩu
   */
  public async forgotPassword(input: ForgotPasswordFormInput): Promise<AuthResponse> {
    return AuthService.forgotPassword(input.email);
  }

  /**
   * Thực hiện đăng xuất khỏi hệ thống
   */
  public async logout(): Promise<void> {
    this.updateState({ isLoading: true });
    try {
      await AuthService.logout();
    } finally {
      this.updateState({
        user: null,
        session: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  }

  /**
   * Hủy theo dõi sự kiện của Supabase khi đóng ứng dụng
   */
  public destroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
      this.authSubscription = null;
    }
    this.listeners = [];
  }
}

/**
 * Xuất Singleton instance của AuthStore
 */
export const authStore = new AuthStore();

