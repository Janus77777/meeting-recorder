import { contextBridge, ipcRenderer } from 'electron';
import {
  STTInitializeRequest,
  STTPrepareAudioRequest,
  STTPrepareAudioResponse,
  STTTranscriptionRequest,
  STTTranscriptionResponse,
  STTStatusResponse,
  STTProgressEvent
} from '@shared/types';

// Define the API that will be exposed to the renderer process
export interface ElectronAPI {
  // App methods
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    getPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads') => Promise<string>;
  };

  // Simple key-value storage persisted under app.getPath('userData')
  storage?: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
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
    copyFile: (srcPath: string, destPath: string) => Promise<any>;
    cleanup: (filePaths: string[]) => Promise<any>;
    getTempDir: () => Promise<any>;
    fileExists: (filePath: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
    readFile: (filePath: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; size?: number; error?: string }>;
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

  // Desktop capturer for system audio
  getAudioSources: () => Promise<any>;

  dialog: {
    openFile: () => Promise<{ canceled: boolean; filePath?: string }>;
    openDirectory: () => Promise<{ canceled: boolean; directoryPath?: string }>;
    message?: (type: 'none'|'info'|'error'|'warning'|'question', title: string, message: string, buttons?: string[]) => Promise<{ response: number }>;
  };

  // Clipboard methods
  clipboard: {
    writeText: (text: string) => Promise<{ success: boolean; error?: string }>;
  };

  permissions?: {
    openSystemPreference: (target: 'microphone' | 'screen') => Promise<boolean>;
    getMediaStatus?: (media: 'microphone') => Promise<string>;
    requestMediaAccess?: (media: 'microphone') => Promise<boolean>;
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
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
  };

  stt: {
    initialize: (payload: STTInitializeRequest) => Promise<{ success: boolean; error?: string; status?: STTStatusResponse }>;
    getStatus: () => Promise<STTStatusResponse>;
    prepareAudio: (payload: STTPrepareAudioRequest) => Promise<STTPrepareAudioResponse>;
    transcribe: (payload: STTTranscriptionRequest) => Promise<STTTranscriptionResponse>;
    onProgress: (callback: (event: STTProgressEvent) => void) => void;
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

  storage: {
    getItem: (key) => ipcRenderer.invoke('storage:get', key),
    setItem: (key, value) => ipcRenderer.invoke('storage:set', key, value),
    removeItem: (key) => ipcRenderer.invoke('storage:remove', key)
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
    copyFile: (srcPath, destPath) => ipcRenderer.invoke('recording:copyFile', srcPath, destPath),
    cleanup: (filePaths) => ipcRenderer.invoke('recording:cleanup', filePaths),
    getTempDir: () => ipcRenderer.invoke('recording:getTempDir'),
    fileExists: (filePath: string) => ipcRenderer.invoke('recording:fileExists', filePath),
    readFile: (filePath: string) => ipcRenderer.invoke('recording:readFile', filePath)
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
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.removeAllListeners('update-downloaded');
      ipcRenderer.on('update-downloaded', (event, info) => callback(info));
    }
  },

  stt: {
    initialize: (payload) => ipcRenderer.invoke('stt:initialize', payload),
    getStatus: () => ipcRenderer.invoke('stt:getStatus'),
    prepareAudio: (payload) => ipcRenderer.invoke('stt:prepareAudio', payload),
    transcribe: (payload) => ipcRenderer.invoke('stt:transcribe', payload),
    onProgress: (callback) => {
      ipcRenderer.removeAllListeners('stt:progress');
      ipcRenderer.on('stt:progress', (_event, progress: STTProgressEvent) => callback(progress));
    }
  },

  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text)
  },

  permissions: {
    openSystemPreference: (target) => ipcRenderer.invoke('permissions:open', target),
    getMediaStatus: (media) => ipcRenderer.invoke('permissions:getMediaStatus', media),
    requestMediaAccess: (media) => ipcRenderer.invoke('permissions:requestMediaAccess', media)
  },

  getAudioSources: () => ipcRenderer.invoke('desktopCapturer:getAudioSources'),
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    message: (type: 'none'|'info'|'error'|'warning'|'question', title: string, message: string, buttons?: string[]) =>
      ipcRenderer.invoke('dialog:message', { type, title, message, buttons })
  },

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
