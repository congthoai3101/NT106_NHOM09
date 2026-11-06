import { supabase } from '../config/supabaseClient';

const API_PORT = process.env.PORT || 5000;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${API_PORT}/api`;

export interface CreatedRoom {
  id: string;
  roomCode: string;
  name: string;
  maxPlayers: number;
}

export class RoomService {
  static async createRoom(name: string, maxPlayers: number): Promise<CreatedRoom> {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);

    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

    const response = await fetch(`${API_BASE_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ name, maxPlayers })
    });

    const result = await response.json() as {
      success?: boolean;
      message?: string;
      data?: CreatedRoom;
    };

    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.message || 'Không thể tạo phòng.');
    }

    return result.data;
  }
}
