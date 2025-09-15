import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';
import { setupRecordingIPC } from './ipc/recording';
import { setupSystemAudioIPC } from './ipc/system-audio';
import { initMain } from 'electron-audio-loopback';

class MeetingRecorderApp {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    // Initialize electron-audio-loopback before app is ready
    initMain();
    
    this.initializeApp();
    this.setupAutoUpdater();
  }

  private initializeApp(): void {
    // Handle app ready
    app.whenReady().then(() => {
      this.createWindow();
      this.setupIPC();
    });

    // Handle window closed
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle activate (macOS)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    // Security: Prevent new window creation but allow external requests
    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(() => {
        return { action: 'deny' };
      });
      
      // Allow requests to Gemini API
      contents.session.webRequest.onBeforeSendHeaders((details, callback) => {
        if (details.url.includes('generativelanguage.googleapis.com')) {
          callback({ requestHeaders: details.requestHeaders });
        } else {
          callback({});
        }
      });
    });
  }

  private createWindow(): void {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: false, // 允許外部 API 請求
        allowRunningInsecureContent: true,
        experimentalFeatures: true
      },
      show: false, // Don't show until ready
      titleBarStyle: 'default',
      icon: path.join(__dirname, '../../assets/icon.png'), // Optional icon
    });

    // Handle permissions for display-capture (needed for system audio)
    this.mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      console.log('Permission request:', permission);
      if (permission === 'media') {
        callback(true); // Allow media permissions for audio/video capture
      } else {
        callback(false);
      }
    });

    // 設置音頻捕捉權限
    this.mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      console.log('Permission check:', permission, 'from:', requestingOrigin);
      return permission === 'media';
    });

    // Load the app
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:3000');
      // this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      // 預設不開啟開發者工具
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        
        // Focus window
        if (process.env.NODE_ENV === 'development') {
          this.mainWindow.focus();
        }
      }
    });

    // 添加快捷鍵支援開發者工具
    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        if (this.mainWindow?.webContents.isDevToolsOpened()) {
          this.mainWindow.webContents.closeDevTools();
        } else {
          this.mainWindow?.webContents.openDevTools();
        }
      }
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupIPC(): void {
    // Setup recording IPC handlers
    setupRecordingIPC();
    
    // Setup system audio IPC handlers (placeholder for future)
    setupSystemAudioIPC();
    
    // Setup auto-updater IPC handlers
    this.setupUpdaterIPC();

    // Basic IPC handlers
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('app:getPlatform', () => {
      return process.platform;
    });

    ipcMain.handle('app:getPath', (event, name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads') => {
      return app.getPath(name);
    });

    // Window controls
    ipcMain.handle('window:minimize', () => {
      if (this.mainWindow) {
        this.mainWindow.minimize();
      }
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
      }
    });

    ipcMain.handle('window:close', () => {
      if (this.mainWindow) {
        this.mainWindow.close();
      }
    });

    // Desktop capturer for system audio
    ipcMain.handle('desktopCapturer:getAudioSources', async () => {
      try {
        const { desktopCapturer } = require('electron');
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 1, height: 1 },
          fetchWindowIcons: false
        });
        
        console.log('🎵 找到的音訊源:', sources.map((s: any) => ({ id: s.id, name: s.name })));
        return sources;
      } catch (error) {
        console.error('❌ 獲取音訊源失敗:', error);
        throw error;
      }
    });

    // Loopback audio stream in main process
    ipcMain.handle('loopback:getAudioStream', async () => {
      try {
        console.log('🎵 Main process: 獲取 loopback 音訊流...');
        const { getLoopbackAudioMediaStream } = require('electron-audio-loopback');
        const stream = await getLoopbackAudioMediaStream();
        
        console.log('🔍 Main process loopbackStream:', stream);
        console.log('🔍 Main process loopbackStream 類型:', typeof stream);
        console.log('🔍 Main process loopbackStream constructor:', stream?.constructor?.name);
        
        if (stream && typeof stream.getAudioTracks === 'function') {
          const tracks = stream.getAudioTracks();
          console.log('✅ Main process: 成功獲取音訊軌道數:', tracks.length);
          
          // 序列化 MediaStream 數據供 renderer 使用
          const serializedStream = {
            id: stream.id,
            active: stream.active,
            tracks: tracks.map((track: MediaStreamTrack) => ({
              id: track.id,
              kind: track.kind,
              label: track.label,
              enabled: track.enabled,
              settings: track.getSettings()
            }))
          };
          
          return { success: true, stream: serializedStream };
        } else {
          console.error('❌ Main process: loopback 返回無效對象');
          return { success: false, error: '無效的 MediaStream' };
        }
      } catch (error) {
        console.error('❌ Main process loopback 錯誤:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Development helpers
    if (process.env.NODE_ENV === 'development') {
      ipcMain.handle('dev:openDevTools', () => {
        if (this.mainWindow) {
          this.mainWindow.webContents.openDevTools();
        }
      });

      ipcMain.handle('dev:reload', () => {
        if (this.mainWindow) {
          this.mainWindow.reload();
        }
      });
    }
  }

  private setupAutoUpdater(): void {
    // 配置更新伺服器
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'Janus77777',
      repo: 'meeting-recorder',
      private: false
    });

    // 自動更新事件處理
    autoUpdater.on('checking-for-update', () => {
      console.log('正在檢查更新...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('發現新版本:', info.version);
      
      // 通知 renderer process
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-available', {
          version: info.version,
          releaseNotes: info.releaseNotes
        });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('當前已是最新版本:', info.version);
    });

    autoUpdater.on('error', (err) => {
      console.error('自動更新錯誤:', err);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const log = `下載速度: ${progressObj.bytesPerSecond} - 已下載: ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      console.log(log);
      
      // 通知 renderer process 更新進度
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-progress', {
          percent: progressObj.percent,
          transferred: progressObj.transferred,
          total: progressObj.total,
          bytesPerSecond: progressObj.bytesPerSecond
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('更新下載完成:', info.version);
      
      // 詢問用戶是否立即重啟安裝更新
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: '更新就緒',
        message: `新版本 ${info.version} 已下載完成`,
        detail: '點擊「立即重啟」安裝更新，或稍後手動重啟應用程式。',
        buttons: ['稍後重啟', '立即重啟'],
        defaultId: 1
      }).then((result) => {
        if (result.response === 1) {
          autoUpdater.quitAndInstall();
        }
      });
    });

    // 在開發環境不檢查更新
    if (process.env.NODE_ENV !== 'development') {
      // 啟動後5秒檢查更新
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
      }, 5000);
    }
  }

  private setupUpdaterIPC(): void {
    // 手動檢查更新
    ipcMain.handle('updater:checkForUpdates', async () => {
      if (process.env.NODE_ENV === 'development') {
        return { available: false, message: '開發環境不支援自動更新' };
      }
      
      try {
        const result = await autoUpdater.checkForUpdates();
        return { 
          available: !!result?.updateInfo,
          version: result?.updateInfo?.version,
          releaseDate: result?.updateInfo?.releaseDate 
        };
      } catch (error) {
        console.error('檢查更新失敗:', error);
        return { available: false, error: (error as Error).message };
      }
    });

    // 手動下載更新
    ipcMain.handle('updater:downloadUpdate', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        console.error('下載更新失敗:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // 立即安裝更新
    ipcMain.handle('updater:installUpdate', () => {
      autoUpdater.quitAndInstall();
    });
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}

// Initialize the app
new MeetingRecorderApp();

// Handle squirrel events on Windows
if (require('electron-squirrel-startup')) {
  app.quit();
}