import { Session, Subscription } from '@supabase/supabase-js';
import { supabase } from '../config/supabaseClient';
import { AuthService } from '../services/authService';
import {
  AuthState,
  LoginFormInput,
  RegisterFormInput,
  ForgotPasswordFormInput,
  AuthResponse,
  ResetPasswordFormInput
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
  private sessionRevision = 0;

  constructor() {
    this.init();
  }

  /**
   * Khởi tạo store: Đọc session lưu trữ từ trước và lắng nghe biến động phiên
   */
  private async init(): Promise<void> {
    try {
      // Do not call Supabase APIs inside onAuthStateChange; that can deadlock its auth lock.
      const { data: authListener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          console.log(`[Supabase Auth Event]: ${event}`);
          const revision = ++this.sessionRevision;
          setTimeout(() => {
            void this.handleSessionUpdate(session, revision).catch((err) => {
              console.error('[AuthStore Session Update Error]:', err);
              if (revision === this.sessionRevision) this.updateState({ isLoading: false });
            });
          }, 0);
        }
      );

      this.authSubscription = authListener.subscription;

      // Restore the persisted session after the listener is registered so auth changes
      // during restoration cannot leave the store with stale user data.
      const revision = this.sessionRevision;
      const { data, error } = await supabase.auth.getSession();
      if (revision !== this.sessionRevision) return;
      if (error) console.warn('[AuthStore Session Restore Warning]:', error.message);
      await this.handleSessionUpdate(data?.session ?? null, revision);
    } catch (err) {
      console.warn('[AuthStore Init Error]:', err);
      this.updateState({ isLoading: false });
    }
  }

  /**
   * Cập nhật trạng thái người dùng và nạp hồ sơ từ CSDL
   */
  private async handleSessionUpdate(session: Session | null, revision: number): Promise<void> {
    if (session?.user) {
      const profile = await AuthService.fetchProfile(session.user.id, session.access_token);
      if (revision !== this.sessionRevision) return;

      this.updateState({
        user: session.user,
        session: session,
        profile: profile,
        isAuthenticated: true,
        isLoading: false
      });
    } else {
      if (revision !== this.sessionRevision) return;
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
   * Yêu cầu reset mật khẩu
   */ 
  public async resetPassword(input: ResetPasswordFormInput): Promise<AuthResponse>{
    return AuthService.resetPassword(input);
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
