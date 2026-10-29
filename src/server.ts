import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// 1. CẤU HÌNH BIẾN MÔI TRƯỜNG & KHỞI TẠO BACKEND SUPABASE CLIENT
// ============================================================================
dotenv.config();  

const PORT = process.env.PORT || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[CẢNH BÁO]: Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env!');
}

// Khởi tạo Supabase Client phía Backend Web API
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // Backend là Stateless (không lưu session trong bộ nhớ đĩa như client)
    autoRefreshToken: false
  }
});

// ============================================================================
// 2. KHỞI TẠO EXPRESS APP VÀ CÁC MIDDLEWARE CƠ BẢN
// ============================================================================
const app = express();

// Cho phép các Client khác domain (như Electron Desktop hoặc Web Browser) gửi request
app.use(cors());

// Middleware đọc định dạng JSON gửi lên từ Client và gán vào req.body
app.use(express.json());

// Middleware ghi log request để quan sát khi demo (Rất trực quan cho môn Mạng)
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${timestamp}] 📡 [${req.method}] ${req.originalUrl}`);
  next();
});

// ============================================================================
// 3. MIDDLEWARE XÁC THỰC JWT BEARER TOKEN (Dành cho các route cần bảo vệ)
// ============================================================================
interface AuthenticatedRequest extends Request {
  user?: any;
}

const verifyJwtToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  // 1. Kiểm tra xem Client có gửi kèm Header "Authorization: Bearer <token>" không
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Lỗi xác thực: Thiếu Access Token hoặc sai định dạng Bearer'
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. Gửi token sang Supabase Auth để giải mã và kiểm tra tính hợp lệ
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        success: false,
        message: 'Lỗi xác thực: Access Token không hợp lệ hoặc đã hết hạn',
        error: error?.message
      });
      return;
    }

    // 3. Gắn thông tin người dùng đã xác thực vào request để các hàm phía sau dùng
    req.user = user;
    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi xác thực token',
      error: err.message
    });
  }
};

// ============================================================================
// 4. ĐỊNH NGHĨA CÁC ENDPOINT (ROUTES)
// ============================================================================

/**
 * [GET] /
 * Kiểm tra trạng thái hoạt động của Web API (Health Check)
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'Tiến Lên Miền Nam - Authentication Web API Gateway',
    timestamp: new Date().toISOString()
  });
});

/**
 * [POST] /api/auth/register
 * Đăng ký tài khoản người chơi mới
 * Body: { email, password, username, avatarUrl? }
 */
app.post('/api/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username, avatarUrl } = req.body;

    // Bước 1: Validate dữ liệu đầu vào
    if (!email || !password || !username) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ email, mật khẩu và tên hiển thị'
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự'
      });
      return;
    }

    // Bước 2: Gọi Supabase Auth để tạo tài khoản mới (lưu trong bảng auth.users)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: username,
          avatar_url: avatarUrl || 'avatar_chibi_boy'
        }
      }
    });

    if (authError || !authData.user) {
      res.status(400).json({
        success: false,
        message: authError?.message || 'Đăng ký tài khoản thất bại',
        error: authError
      });
      return;
    }

    const userId = authData.user.id;

    // Bước 3: Lưu hồ sơ người chơi vào bảng public.profiles trong PostgreSQL
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        username: username,
        avatar_url: avatarUrl || 'avatar_chibi_boy',
        created_at: new Date().toISOString()
      });

    if (profileError) {
      console.warn('[Warning]: Lỗi lưu profile người chơi:', profileError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      data: {
        userId: authData.user.id,
        email: authData.user.email,
        username: username,
        session: authData.session
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi đăng ký',
      error: error.message
    });
  }
});

/**
 * [POST] /api/auth/login
 * Đăng nhập và nhận JWT Access Token
 * Body: { email, password }
 */
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ email và mật khẩu'
      });
      return;
    }

    // Bước 1: Gọi Supabase Auth để xác thực mật khẩu
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.session) {
      res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác',
        error: error?.message
      });
      return;
    }

    // Bước 2: Truy vấn thông tin profile người chơi từ PostgreSQL
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    // Bước 3: Trả về JWT Access Token và thông tin cơ bản cho Client
    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        token_type: 'Bearer',
        user: {
          id: data.user.id,
          email: data.user.email,
          username: profile?.username || data.user.user_metadata?.display_name || 'Người chơi',
          avatarUrl: profile?.avatar_url || data.user.user_metadata?.avatar_url || 'avatar_chibi_boy'
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi đăng nhập',
      error: error.message
    });
  }
});

/**
 * [GET] /api/profile/me (Protected Route - Cần JWT Bearer Token)
 * Lấy thông tin người chơi hiện tại sau khi đã xác thực
 * Header: Authorization: Bearer <access_token>
 */
app.get('/api/profile/me', verifyJwtToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    // Truy vấn dữ liệu người chơi từ PostgreSQL Supabase
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ người chơi',
        error: error.message
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Lấy thông tin hồ sơ thành công',
      data: {
        id: profile.id,
        username: profile.username,
        avatarUrl: profile.avatar_url,
        email: req.user.email,
        createdAt: profile.created_at
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy thông tin hồ sơ',
      error: error.message
    });
  }
});

// ============================================================================
// 5. KHỞI CHẠY HTTP SERVER VÀ LẮNG NGHE PORT
// ============================================================================
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 [BACKEND WEB API] Đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 [HEALTH CHECK] : http://localhost:${PORT}/`);
  console.log(`🔑 [REGISTER]     : POST http://localhost:${PORT}/api/auth/register`);
  console.log(`🔓 [LOGIN]        : POST http://localhost:${PORT}/api/auth/login`);
  console.log(`🛡️ [PROFILE ME]   : GET  http://localhost:${PORT}/api/profile/me`);
  console.log(`====================================================`);
});

