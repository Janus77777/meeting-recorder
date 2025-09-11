// Feature Flags - Control which features are enabled
export const FLAGS = {
  // System audio recording via WASAPI loopback (Windows)
  SYSTEM_AUDIO: false,
  
  // Automatic email sending via n8n integration
  AUTO_EMAIL: false,
  
  // Advanced export options (PDF/DOCX)
  ADV_EXPORT: false,
  
  // Quality gate with WER display and name correction
  QUALITY_GATE: false,
  
  // Chunked upload with resume capability
  CHUNK_UPLOAD: false,
  
  // Audio device enumeration and selection
  DEVICE_SELECTION: true,
  
  // Real-time volume visualization
  VOLUME_VISUALIZATION: true,
  
  // Toast notifications
  NOTIFICATIONS: true,
  
  // Local job history persistence
  JOB_HISTORY: true,
  
  // Markdown copy functionality
  MARKDOWN_COPY: true
} as const;

export type FeatureFlag = keyof typeof FLAGS;

// Helper function to check if a feature is enabled
export const isFeatureEnabled = (flag: FeatureFlag): boolean => {
  return FLAGS[flag];
};

// Feature descriptions for UI display
export const FEATURE_DESCRIPTIONS: Record<FeatureFlag, string> = {
  SYSTEM_AUDIO: '系統音錄製 - 錄製電腦播放的音訊',
  AUTO_EMAIL: '自動寄信 - 完成後自動發送結果到指定信箱',
  ADV_EXPORT: '進階匯出 - 支援 PDF 和 DOCX 格式匯出',
  QUALITY_GATE: '品質驗收 - 顯示識別準確率和人名校正建議',
  CHUNK_UPLOAD: '分段上傳 - 支援大檔案分段上傳和斷點續傳',
  DEVICE_SELECTION: '裝置選擇 - 選擇錄音裝置',
  VOLUME_VISUALIZATION: '音量視覺化 - 即時顯示錄音音量',
  NOTIFICATIONS: '通知提醒 - 顯示操作結果和錯誤訊息',
  JOB_HISTORY: '任務歷史 - 本地儲存任務記錄',
  MARKDOWN_COPY: 'Markdown 複製 - 一鍵複製摘要為 Markdown 格式'
};

// Get enabled features for display
export const getEnabledFeatures = (): FeatureFlag[] => {
  return Object.entries(FLAGS)
    .filter(([, enabled]) => enabled)
    .map(([flag]) => flag as FeatureFlag);
};

// Get disabled features for display
export const getDisabledFeatures = (): FeatureFlag[] => {
  return Object.entries(FLAGS)
    .filter(([, enabled]) => !enabled)
    .map(([flag]) => flag as FeatureFlag);
};