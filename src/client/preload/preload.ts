import { contextBridge, ipcRenderer } from 'electron';
import { authStore } from '../state/authStore';
import { RoomService } from '../services/roomService';
import { LoginFormInput, RegisterFormInput, ForgotPasswordFormInput, AuthState, AuthResponse } from '../../shared/types/auth.types';

// Expose các API điều khiển cửa sổ Frameless an toàn cho Renderer
contextBridge.exposeInMainWorld('electronWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized')
});

// Expose các API Xác thực và Quản lý phiên tài khoản cho Renderer
contextBridge.exposeInMainWorld('electronAuth', {
  login: (input: LoginFormInput): Promise<AuthResponse> => authStore.login(input),
  register: (input: RegisterFormInput): Promise<AuthResponse> => authStore.register(input),
  forgotPassword: (input: ForgotPasswordFormInput): Promise<AuthResponse> => authStore.forgotPassword(input),
  logout: async (): Promise<void> => {
    await ipcRenderer.invoke('game:leave');
    await authStore.logout();
  },
  createRoom: (name: string, maxPlayers: number) => RoomService.createRoom(name, maxPlayers),
  joinGameRoom: (roomCode: string) => {
    const accessToken = authStore.getState().session?.access_token;
    if (!accessToken) return Promise.reject(new Error('Phiên đăng nhập đã hết hạn.'));
    return ipcRenderer.invoke('game:join-room', roomCode, accessToken);
  },
  updateGameToken: (accessToken: string) => ipcRenderer.invoke('game:update-token', accessToken),
  setGameReady: (isReady: boolean) => ipcRenderer.invoke('game:ready', isReady),
  startGame: () => ipcRenderer.invoke('game:start'),
  playCards: (cards: number[]) => ipcRenderer.invoke('game:play-cards', cards),
  passTurn: () => ipcRenderer.invoke('game:pass'),
  leaveGameRoom: () => ipcRenderer.invoke('game:leave'),
  onGameEvent: (callback: (event: { opcode: number; payload: Record<string, unknown> }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { opcode: number; payload: Record<string, unknown> }) => callback(data);
    ipcRenderer.on('game:event', listener);
    return () => ipcRenderer.removeListener('game:event', listener);
  },
  getState: (): AuthState => authStore.getState(),
  subscribe: (callback: (state: AuthState) => void) => {
    return authStore.subscribe(callback);
  }
});
