import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  AppSettings, 
  MeetingJob, 
  RecordingState, 
  ToastMessage, 
  DeviceInfo 
} from '@shared/types';
import { DEFAULT_SETTINGS } from '@main/config/env';
import { initializeAPI, updateAPISettings } from './api';

// Settings Store
interface SettingsState {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const ensureSettingsDefaults = (settings: AppSettings): AppSettings => {
  const mergedGoogleStt = {
    ...(DEFAULT_SETTINGS.googleCloudSTT ?? {}),
    ...(settings.googleCloudSTT ?? {})
  };

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    transcriptionMode: settings.transcriptionMode ?? DEFAULT_SETTINGS.transcriptionMode ?? 'gemini_direct',
    googleCloudSTT: mergedGoogleStt
  };
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      
      updateSettings: (newSettings) => {
        const current = ensureSettingsDefaults(get().settings);
        const merged = ensureSettingsDefaults({
          ...current,
          ...newSettings,
          googleCloudSTT: {
            ...current.googleCloudSTT,
            ...(newSettings.googleCloudSTT ?? {})
          }
        });
        console.log('🔧 Updating settings:', merged);
        set({ settings: merged });
        
        // Update API client when settings change
        updateAPISettings(merged);
      },
      
      resetSettings: () => {
        console.log('🔄 Resetting settings to default');
        const defaults = ensureSettingsDefaults(DEFAULT_SETTINGS);
        set({ settings: defaults });
        updateAPISettings(defaults);
      }
    }),
    {
      name: 'meeting-recorder-settings',
      version: 3,
      migrate: (persisted, version) => {
        const coerce = (base: AppSettings): AppSettings => ensureSettingsDefaults({ ...DEFAULT_SETTINGS, ...base });
        if (!persisted) return { settings: ensureSettingsDefaults(DEFAULT_SETTINGS) };
        const prev = (persisted as { settings?: AppSettings }).settings;
        if (!prev) return { settings: ensureSettingsDefaults(DEFAULT_SETTINGS) };

        // v3: 預設切換為 chirp_3 + cmn-Hans-CN，開啟 diarization 與 offsets；保留使用者的 projectId/recognizerId/keyFilePath
        if (version < 3) {
          const stt = prev.googleCloudSTT ?? {};
          const migrated: AppSettings = {
            ...prev,
            googleCloudSTT: {
              ...stt,
              location: 'us',
              recognizerId: stt.recognizerId && stt.recognizerId.trim() ? stt.recognizerId : '_',
              enabled: true,
              languageCode: 'cmn-Hans-CN',
              model: 'chirp_3',
              enableWordTimeOffsets: true,
              enableSpeakerDiarization: true,
              minSpeakerCount: Math.min(6, Math.max(1, typeof stt.minSpeakerCount === 'number' ? stt.minSpeakerCount : 1)),
              maxSpeakerCount: Math.min(6, Math.max(1, typeof stt.maxSpeakerCount === 'number' ? stt.maxSpeakerCount : 6))
            }
          } as AppSettings;
          return { settings: coerce(migrated) };
        }

        return { settings: coerce(prev) };
      },
      onRehydrateStorage: () => (state) => {
        console.log('💾 Rehydrating settings from localStorage:', state);
        if (state && state.settings) {
          const merged = ensureSettingsDefaults(state.settings as AppSettings);
          state.settings = merged;
          console.log('✅ Settings restored:', {
            hasGeminiKey: !!merged.geminiApiKey,
            transcriptionMode: merged.transcriptionMode
          });
          updateAPISettings(merged);
        } else {
          console.log('⚠️ No settings found in localStorage, using defaults');
          updateAPISettings(DEFAULT_SETTINGS);
        }
      },
      skipHydration: false,
      partialize: (state) => ({ settings: state.settings })
    }
  )
);

// Recording Store
interface RecordingStore {
  state: RecordingState;
  availableDevices: DeviceInfo[];
  selectedDeviceId: string | null;
  
  // Actions
  setRecording: (isRecording: boolean) => void;
  setDuration: (duration: number | ((prev: number) => number)) => void;
  setVolume: (volume: number) => void;
  setAudioFile: (filePath: string | undefined) => void;
  setDevices: (devices: DeviceInfo[]) => void;
  selectDevice: (deviceId: string) => void;
  resetRecording: () => void;
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  state: {
    isRecording: false,
    duration: 0,
    volume: 0,
    audioFile: undefined,
    deviceId: undefined
  },
  availableDevices: [],
  selectedDeviceId: null,
  
  setRecording: (isRecording) => 
    set({ state: { ...get().state, isRecording } }),
    
  setDuration: (duration) => {
    const currentDuration = typeof duration === 'function' ? duration(get().state.duration) : duration;
    set({ state: { ...get().state, duration: currentDuration } });
  },
    
  setVolume: (volume) => 
    set({ state: { ...get().state, volume } }),
    
  setAudioFile: (audioFile) => 
    set({ state: { ...get().state, audioFile } }),
    
  setDevices: (devices) => {
    const current = get();
    set({ 
      availableDevices: devices,
      selectedDeviceId: current.selectedDeviceId || (devices[0]?.deviceId ?? null)
    });
  },
  
  selectDevice: (deviceId) => {
    set({ 
      selectedDeviceId: deviceId,
      state: { ...get().state, deviceId }
    });
  },
  
  resetRecording: () => 
    set({
      state: {
        isRecording: false,
        duration: 0,
        volume: 0,
        audioFile: undefined,
        deviceId: get().selectedDeviceId || undefined
      }
    })
}));

// Jobs Store
interface JobsState {
  jobs: MeetingJob[];
  currentJob: MeetingJob | null;
  
  // Actions
  addJob: (job: MeetingJob) => void;
  updateJob: (id: string, updates: Partial<MeetingJob>) => void;
  removeJob: (id: string) => void;
  setCurrentJob: (job: MeetingJob | null) => void;
  clearJobs: () => void;
}

export const useJobsStore = create<JobsState>()(
  persist(
    (set, get) => ({
      jobs: [],
      currentJob: null,
      
      addJob: (job) => {
        const jobs = [job, ...get().jobs];
        set({ jobs, currentJob: job });
      },
      
      updateJob: (id, updates) => {
        const jobs = get().jobs.map(job => 
          job.id === id ? { ...job, ...updates } : job
        );
        set({ jobs });
        
        // Update current job if it's the one being updated
        const current = get().currentJob;
        if (current && current.id === id) {
          set({ currentJob: { ...current, ...updates } });
        }
      },
      
      removeJob: (id) => {
        const jobs = get().jobs.filter(job => job.id !== id);
        set({ jobs });
        
        // Clear current job if it was removed
        const current = get().currentJob;
        if (current && current.id === id) {
          set({ currentJob: null });
        }
      },
      
      setCurrentJob: (job) => set({ currentJob: job }),
      
      clearJobs: () => set({ jobs: [], currentJob: null })
    }),
    {
      name: 'meeting-recorder-jobs',
      partialize: (state) => ({
        jobs: state.jobs,
        currentJob: state.currentJob
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const jobs = (state as JobsState).jobs ?? [];
          const currentJob = (state as JobsState).currentJob ?? null;
          if (currentJob) {
            // 只在 currentJob 在 jobs 列表中存在時才更新
            const matched = jobs.find(job => job.id === currentJob.id);
            if (matched) {
              (state as JobsState).currentJob = matched;
            }
            // 如果 currentJob 不在列表中，保持原樣，不要重設為 jobs[0]
          }
          // 移除自動設定為 jobs[0] 的邏輯，避免覆蓋用戶的當前工作
        }
      }
    }
  )
);

// Recordings Store
interface RecordingItem {
  id: string;
  filename: string;
  blob: Blob;
  timestamp: string;
  duration: number;
  size: number;
}

interface RecordingsState {
  recordings: RecordingItem[];
  
  // Actions
  addRecording: (recording: RecordingItem) => void;
  removeRecording: (id: string) => void;
  clearRecordings: () => void;
}

export const useRecordingsStore = create<RecordingsState>()(
  persist(
    (set, get) => ({
      recordings: [],
      
      addRecording: (recording) => {
        const recordings = [recording, ...get().recordings];
        set({ recordings });
      },
      
      removeRecording: (id) => {
        const recordings = get().recordings.filter(rec => rec.id !== id);
        set({ recordings });
      },
      
      clearRecordings: () => set({ recordings: [] })
    }),
    {
      name: 'meeting-recorder-recordings',
      // 不持久化Blob數據，因為Blob無法序列化
      partialize: (state) => ({
        recordings: state.recordings.map(rec => ({
          ...rec,
          blob: undefined // 不保存blob數據
        }))
      })
    }
  )
);

// Toast/Notification Store
interface ToastState {
  toasts: ToastMessage[];
  
  // Actions
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = Date.now().toString();
    const newToast: ToastMessage = { ...toast, id };
    
    set({ toasts: [...get().toasts, newToast] });
    
    // Auto-remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
  },
  
  removeToast: (id) => 
    set({ toasts: get().toasts.filter(toast => toast.id !== id) }),
    
  clearToasts: () => set({ toasts: [] })
}));

// UI State Store
interface UIState {
  currentPage: 'record' | 'result' | 'prompts' | 'settings' | 'stt' | 'sttDebug';
  isLoading: boolean;
  sidebarCollapsed: boolean;
  
  // Actions
  setCurrentPage: (page: UIState['currentPage']) => void;
  setLoading: (loading: boolean) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      currentPage: 'record',
      isLoading: false,
      sidebarCollapsed: false,
      
      setCurrentPage: (page) => set({ currentPage: page }),
      setLoading: (loading) => set({ isLoading: loading }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed })
    }),
    {
      name: 'meeting-recorder-ui'
    }
  )
);

// Initialize API when settings are loaded
export const initializeStores = () => {
  // Wait for hydration to complete
  const unsubscribe = useSettingsStore.persist.onFinishHydration(() => {
    const settings = useSettingsStore.getState().settings;
    console.log('Store hydrated, initializing API with settings:', settings);
    initializeAPI(settings);
    unsubscribe();
  });
};

// Utility hooks
export const useToastActions = () => {
  const { addToast } = useToastStore();
  
  return {
    showSuccess: (message: string) => addToast({ type: 'success', message }),
    showError: (message: string) => addToast({ type: 'error', message }),
    showInfo: (message: string) => addToast({ type: 'info', message })
  };
};
