import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Nạp biến môi trường từ file .env
dotenv.config();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    frame: false, // Bật chế độ Custom Frameless Window (không dùng viền OS)
    backgroundColor: '#080C14',
    title: 'Tiến Lên Miền Nam - UIT NT106',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // Cho phép preload truy cập Supabase client an toàn
    }
  });

  // Tải file giao diện đăng nhập (ưu tiên load trực tiếp từ src trong dev mode để live-edit)
  const devHtmlPath = path.resolve(process.cwd(), 'src/client/views/auth/auth.html');
  const prodHtmlPath = path.join(__dirname, '../views/auth/auth.html');

  mainWindow.loadFile(devHtmlPath).catch(() => {
    mainWindow?.loadFile(prodHtmlPath);
  });

  // Đóng cửa sổ và giải phóng bộ nhớ
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Khởi chạy Electron khi ứng dụng sẵn sàng
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Đóng ứng dụng khi tất cả các cửa sổ đã đóng (ngoại trừ macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC: Xử lý các thao tác điều khiển cửa sổ Frameless từ Renderer
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

