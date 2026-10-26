import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Tự động nạp file .env khi chạy trong môi trường Node.js / Electron Desktop
if (typeof process !== 'undefined' && process.env) {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey || supabaseAnonKey === 'your-anon-key-here') {
  console.warn(
    '[Supabase Config Warning]: Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY hợp lệ trong file .env!\n' +
    'Vui lòng copy mã anon key từ Supabase Dashboard (Project Settings -> API) và dán vào file .env.'
  );
}

/**
 * Singleton instance của Supabase Client dùng chung cho toàn bộ Client Desktop
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,    // Ghi nhớ phiên đăng nhập trên thiết bị (Auto-login)
    autoRefreshToken: true,  // Tự động gia hạn Access Token chạy ngầm
    detectSessionInUrl: true // Nhận diện mã token từ link email đổi mật khẩu
  }
});

