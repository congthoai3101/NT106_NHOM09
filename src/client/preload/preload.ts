import { contextBridge, ipcRenderer } from 'electron';
import { authStore } from '../state/authStore';
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
  logout: (): Promise<void> => authStore.logout(),
  getState: (): AuthState => authStore.getState(),
  subscribe: (callback: (state: AuthState) => void) => {
    return authStore.subscribe(callback);
  }
});
