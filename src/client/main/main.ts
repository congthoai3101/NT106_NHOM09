import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { GameTcpClient } from './gameTcpClient';

// Nạp biến môi trường từ file .env
dotenv.config();

let mainWindow: BrowserWindow | null = null;
let gameClient: GameTcpClient | null = null;

function isTrustedSender(sender: Electron.WebContents): boolean {
  return sender === mainWindow?.webContents;
}

function getGameClient(): GameTcpClient {
  if (!gameClient) {
    const host = process.env.GAME_TCP_HOST || '127.0.0.1';
    const port = Number(process.env.GAME_TCP_PORT || 6000);
    gameClient = new GameTcpClient(host, port, process.env.GAME_TCP_TLS === 'true');
    gameClient.on('game-event', (event) => mainWindow?.webContents.send('game:event', event));
    gameClient.on('disconnected', () => mainWindow?.webContents.send('game:event', {
      opcode: 0,
      payload: { type: 'disconnected', message: 'Mất kết nối game server, đang thử kết nối lại...' }
    }));
    gameClient.on('reconnected', (payload) => mainWindow?.webContents.send('game:event', {
      opcode: 1006,
      payload
    }));
    gameClient.on('reconnect-expired', () => mainWindow?.webContents.send('game:event', {
      opcode: 0,
      payload: { type: 'reconnect-expired', message: 'Đã hết thời gian kết nối lại.' }
    }));
    gameClient.on('connection-error', (message) => mainWindow?.webContents.send('game:event', {
      opcode: 0,
      payload: { type: 'connection-error', message }
    }));
  }
  return gameClient;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    frame: false, // Bật chế độ Custom Frameless Window (không dùng viền OS)
    backgroundColor: '#06120E',
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
  gameClient?.close();
  gameClient = null;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  gameClient?.close();
  gameClient = null;
});

ipcMain.handle('game:join-room', async (event, roomCode: unknown, accessToken: unknown) => {
  if (!isTrustedSender(event.sender)) throw new Error('Untrusted IPC sender.');
  if (typeof roomCode !== 'string' || typeof accessToken !== 'string') throw new Error('Dữ liệu tham gia phòng không hợp lệ.');
  return getGameClient().joinRoom(roomCode, accessToken);
});

ipcMain.handle('game:update-token', (event, accessToken: unknown) => {
  if (!isTrustedSender(event.sender)) throw new Error('Untrusted IPC sender.');
  if (typeof accessToken !== 'string') throw new Error('Access token không hợp lệ.');
  getGameClient().updateAccessToken(accessToken);
});

ipcMain.handle('game:ready', async (event, isReady: unknown) => {
  if (!isTrustedSender(event.sender)) throw new Error('Untrusted IPC sender.');
  if (typeof isReady !== 'boolean') throw new Error('Trạng thái sẵn sàng không hợp lệ.');
  return getGameClient().ready(isReady);
});

ipcMain.handle('game:start', async (event) => {
  if (!isTrustedSender(event.sender)) throw new Error('Untrusted IPC sender.');
  return getGameClient().startGame();
});

ipcMain.handle('game:play-cards', async (event, cards: unknown) => {
  if (!isTrustedSender(event.sender)) throw new Error('Untrusted IPC sender.');
  if (!Array.isArray(cards) || !cards.every((card) => Number.isInteger(card) && card >= 0 && card <= 51)) {
    throw new Error('Danh sách lá bài không hợp lệ.');
  }
  return getGameClient().playCards(cards as number[]);
});

ipcMain.handle('game:pass', async (event) => {
  if (!isTrustedSender(event.sender)) throw new Error('Untrusted IPC sender.');
  return getGameClient().passTurn();
});

ipcMain.handle('game:leave', async (event) => {
  if (!isTrustedSender(event.sender)) throw new Error('Untrusted IPC sender.');
  if (gameClient) await gameClient.leaveRoom();
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
