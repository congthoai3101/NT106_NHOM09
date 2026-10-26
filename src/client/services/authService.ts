import { supabase } from '../config/supabaseClient';
import {
  LoginFormInput,
  RegisterFormInput,
  UserProfile,
  AuthResponse
} from '../../shared/types/auth.types';

/**
 * Service đóng gói toàn bộ các thao tác giao tiếp với Supabase Auth SDK
 * Xử lý nghiệp vụ, liên kết bảng profiles và chuẩn hóa thông báo lỗi tiếng Việt
 */
export class AuthService {
  /**
   * 1. Đăng ký tài khoản mới kèm Tên hiển thị (username)
   * Tự động sinh avatar hoạt hình thông qua DiceBear API
   */
  static async register(input: RegisterFormInput): Promise<AuthResponse> {
    try {
      const defaultAvatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        input.username
      )}`;

      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            username: input.username,
            avatar_url: defaultAvatarUrl
          }
        }
      });

      if (error) {
        throw new Error(this.formatErrorMessage(error.message));
      }

      // Đảm bảo tạo bản ghi trong bảng public.profiles nếu chưa có trigger
      if (data.user) {
        await this.upsertProfile({
          id: data.user.id,
          username: input.username,
          avatarUrl: defaultAvatarUrl,
          createdAt: new Date().toISOString()
        });
      }

      return {
        success: true,
        message: 'Đăng ký tài khoản thành công!',
        data
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Đăng ký thất bại.',
        error: err
      };
    }
  }

  /**
   * 2. Đăng nhập bằng Email và Mật khẩu
   */
  static async login(input: LoginFormInput): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password
      });

      if (error) {
        throw new Error(this.formatErrorMessage(error.message));
      }

      return {
        success: true,
        message: 'Đăng nhập thành công!',
        data
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Đăng nhập thất bại.',
        error: err
      };
    }
  }

  /**
   * 3. Gửi email yêu cầu đặt lại mật khẩu
   */
  static async forgotPassword(email: string): Promise<AuthResponse> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'http://localhost:3000/reset-password'
      });

      if (error) {
        throw new Error(this.formatErrorMessage(error.message));
      }

      return {
        success: true,
        message: 'Đã gửi hướng dẫn khôi phục mật khẩu vào hòm thư của bạn!'
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể gửi email khôi phục.',
        error: err
      };
    }
  }

  /**
   * 4. Cập nhật mật khẩu mới (khi người dùng đã xác nhận từ link email)
   */
  static async resetPassword(newPassword: string): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw new Error(this.formatErrorMessage(error.message));
      }

      return {
        success: true,
        message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.',
        data
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Đổi mật khẩu thất bại.',
        error: err
      };
    }
  }

  /**
   * 5. Đăng xuất khỏi hệ thống
   */
  static async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Supabase Logout Error]:', error.message);
      throw error;
    }
  }

  /**
   * 6. Truy vấn thông tin hồ sơ chi tiết từ bảng public.profiles
   */
  static async fetchProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return {
        id: data.id,
        username: data.username,
        avatarUrl: data.avatar_url,
        createdAt: data.created_at
      };
    } catch (err) {
      console.warn('[Fetch Profile Warning]:', err);
      return null;
    }
  }

  /**
   * Chèn hoặc cập nhật hồ sơ vào bảng public.profiles
   */
  private static async upsertProfile(profile: UserProfile): Promise<void> {
    try {
      await supabase.from('profiles').upsert({
        id: profile.id,
        username: profile.username,
        avatar_url: profile.avatarUrl,
        created_at: profile.createdAt
      });
    } catch (err) {
      console.warn('[Upsert Profile Warning]:', err);
    }
  }

  /**
   * Dịch thông điệp lỗi tiếng Anh của Supabase sang tiếng Việt
   */
  public static formatErrorMessage(msg: string): string {
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login credentials')) {
      return 'Email hoặc mật khẩu không chính xác.';
    }
    if (lower.includes('user already registered') || lower.includes('already exists')) {
      return 'Email này đã được sử dụng cho một tài khoản khác.';
    }
    if (lower.includes('password should be at least')) {
      return 'Mật khẩu phải có độ dài từ 6 ký tự trở lên.';
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'Bạn thao tác quá nhanh. Vui lòng chờ ít phút rồi thử lại.';
    }
    if (lower.includes('email not confirmed')) {
      return 'Tài khoản chưa được kích hoạt email. Vui lòng kiểm tra hòm thư.';
    }
    return msg;
  }
}

