import { supabase } from '../config/supabaseClient';
import {
  LoginFormInput,
  RegisterFormInput,
  UserProfile,
  AuthResponse
} from '../../shared/types/auth.types';

// Cổng Web API Gateway (Lấy từ .env hoặc mặc định 5000 / 20000)
const API_PORT = process.env.PORT || 5000;
const API_BASE_URL = `http://localhost:${API_PORT}/api`;

/**
 * AuthService - Giao tiếp với Web API Gateway (src/server.ts)
 * Tuân thủ mô hình 3 lớp (3-tier Architecture) đúng theo Slide báo cáo:
 * Desktop Client -> Node.js Express Web API -> Supabase Auth & PostgreSQL
 */
export class AuthService {
  /**
   * 1. Đăng ký tài khoản qua Web API Gateway: POST /api/auth/register
   */
  static async register(input: RegisterFormInput & { avatar_url?: string }): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          username: input.username,
          avatarUrl: input.avatar_url || 'avatar_chibi_boy'
        })
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(this.formatErrorMessage(resJson.message || 'Đăng ký thất bại'));
      }

      // Tự động đồng bộ session vào Supabase Client trên Desktop nếu có session
      if (resJson.data?.session) {
        await supabase.auth.setSession(resJson.data.session);
      }

      return {
        success: true,
        message: resJson.message || 'Đăng ký tài khoản thành công!',
        data: resJson.data
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể kết nối đến Web API Gateway.',
        error: err
      };
    }
  }

  /**
   * 2. Đăng nhập qua Web API Gateway: POST /api/auth/login
   * Trả về JWT Access Token & Refresh Token
   */
  static async login(input: LoginFormInput): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: input.email,
          password: input.password
        })
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(this.formatErrorMessage(resJson.message || 'Đăng nhập thất bại'));
      }

      // Lưu trữ token và đồng bộ phiên đăng nhập vào Supabase client
      if (resJson.data?.access_token && resJson.data?.refresh_token) {
        await supabase.auth.setSession({
          access_token: resJson.data.access_token,
          refresh_token: resJson.data.refresh_token
        });
      }

      return {
        success: true,
        message: resJson.message || 'Đăng nhập thành công!',
        data: resJson.data
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể kết nối đến Web API Gateway.',
        error: err
      };
    }
  }

  /**
   * 3. Gửi email yêu cầu đặt lại mật khẩu
   */
  static async forgotPassword(email: string): Promise<AuthResponse> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

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
   * 4. Cập nhật mật khẩu mới
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
    try {
      await supabase.auth.signOut();
    } catch (error: any) {
      console.error('[Logout Error]:', error.message);
    }
  }

  /**
   * 6. Lấy profile bảo mật qua Header Authorization: Bearer <token>
   * GET /api/profile/me
   */
  static async fetchProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (token) {
        // Gọi Web API có kèm Bearer Token
        const response = await fetch(`${API_BASE_URL}/profile/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (response.ok) {
          const resJson = await response.json();
          if (resJson.success && resJson.data) {
            return {
              id: resJson.data.id,
              username: resJson.data.username,
              avatarUrl: resJson.data.avatarUrl,
              createdAt: resJson.data.createdAt
            };
          }
        }
      }

      // Dự phòng truy vấn trực tiếp từ bảng profiles nếu chưa có token
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) return null;

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
   * Dịch thông điệp lỗi tiếng Anh của Supabase / Server sang tiếng Việt
   */
  public static formatErrorMessage(msg: string): string {
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('sai email')) {
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
    return msg;
  }
}
