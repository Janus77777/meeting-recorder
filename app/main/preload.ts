import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer process
export interface ElectronAPI {
  // App methods
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    getPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads') => Promise<string>;
  };

  // Window controls
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };

  // Recording methods
  recording: {
    getDevices: () => Promise<any>;
    start: (params: { deviceId: string }) => Promise<any>;
    stop: () => Promise<any>;
    getStatus: () => Promise<any>;
    saveBlob: (filePath: string, buffer: ArrayBuffer) => Promise<any>;
    cleanup: (filePaths: string[]) => Promise<any>;
    getTempDir: () => Promise<any>;
  };

  // System audio methods (placeholder)
  systemAudio: {
    isEnabled: () => Promise<boolean>;
    getDevices: () => Promise<any>;
    start: (deviceId: string) => Promise<any>;
    stop: () => Promise<any>;
    getStatus: () => Promise<any>;
    testCapabilities: () => Promise<any>;
  };

  // Auto-updater methods
  updater: {
    checkForUpdates: () => Promise<{
      available: boolean;
      version?: string;
      releaseDate?: string;
      message?: string;
      error?: string;
    }>;
    downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
    installUpdate: () => Promise<void>;
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => void;
    onUpdateProgress: (callback: (progress: {
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }) => void) => void;
  };

  // Development helpers (only in development)
  dev?: {
    openDevTools: () => Promise<void>;
    reload: () => Promise<void>;
  };
}

// Create the API object
const electronAPI: ElectronAPI = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getPath: (name) => ipcRenderer.invoke('app:getPath', name)
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },

  recording: {
    getDevices: () => ipcRenderer.invoke('recording:getDevices'),
    start: (params) => ipcRenderer.invoke('recording:start', params),
    stop: () => ipcRenderer.invoke('recording:stop'),
    getStatus: () => ipcRenderer.invoke('recording:getStatus'),
    saveBlob: (filePath, buffer) => ipcRenderer.invoke('recording:saveBlob', filePath, buffer),
    cleanup: (filePaths) => ipcRenderer.invoke('recording:cleanup', filePaths),
    getTempDir: () => ipcRenderer.invoke('recording:getTempDir')
  },

  systemAudio: {
    isEnabled: () => ipcRenderer.invoke('system-audio:isEnabled'),
    getDevices: () => ipcRenderer.invoke('system-audio:getDevices'),
    start: (deviceId) => ipcRenderer.invoke('system-audio:start', deviceId),
    stop: () => ipcRenderer.invoke('system-audio:stop'),
    getStatus: () => ipcRenderer.invoke('system-audio:getStatus'),
    testCapabilities: () => ipcRenderer.invoke('system-audio:testCapabilities')
  },

  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('updater:installUpdate'),
    onUpdateAvailable: (callback) => {
      ipcRenderer.removeAllListeners('update-available');
      ipcRenderer.on('update-available', (event, info) => callback(info));
    },
    onUpdateProgress: (callback) => {
      ipcRenderer.removeAllListeners('update-progress');
      ipcRenderer.on('update-progress', (event, progress) => callback(progress));
    }
  }
};

// Add development helpers in development mode
if (process.env.NODE_ENV === 'development') {
  electronAPI.dev = {
    openDevTools: () => ipcRenderer.invoke('dev:openDevTools'),
    reload: () => ipcRenderer.invoke('dev:reload')
  };
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for TypeScript support in renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}