import { User, Session, AuthError } from '@supabase/supabase-js';

/**
 * Cấu trúc thông tin hồ sơ người chơi (khớp với bảng profiles trong CSDL)
 */
export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
}

/**
 * Trạng thái phiên làm việc và người dùng hiện tại
 */
export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Dữ liệu đầu vào cho Form Đăng ký tài khoản
 */
export interface RegisterFormInput {
  email: string;
  password: string;
  confirmPassword: string;
  username: string;
}

/**
 * Dữ liệu đầu vào cho Form Đăng nhập
 */
export interface LoginFormInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Dữ liệu đầu vào cho Form Quên mật khẩu
 */
export interface ForgotPasswordFormInput {
  email: string;
}

/**
 * Dữ liệu đầu vào cho Form Đặt lại mật khẩu mới
 */
export interface ResetPasswordFormInput {
  newPassword: string;
  confirmNewPassword: string;
}

/**
 * Kết quả trả về sau các thao tác xác thực
 */
export interface AuthResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: AuthError | Error | null;
}

