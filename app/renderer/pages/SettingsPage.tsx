import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSettingsStore, useToastActions, useUIStore } from '../services/store';
// Google STT 詳細設定走獨立頁（透過 setCurrentPage('stt') 切換）
import { validateSettings, checkAPIHealth } from '../utils/validators';
import { DEFAULT_SETTINGS, BUILTIN_GOOGLE_STT_KEY } from '@main/config/env';
import { getEnabledFeatures, getDisabledFeatures, FEATURE_DESCRIPTIONS } from '@shared/flags';
import { GeminiAPIClient } from '../services/geminiApi';
import { AppSettings, GoogleCloudSTTSettings } from '@shared/types';

const containerStyle: CSSProperties = {
  maxWidth: '960px',
  margin: '0 auto',
  padding: '10px 24px 16px', // 進一步縮小頂部內距，讓內容上移
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const headerStyle: CSSProperties = {
  textAlign: 'center'
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '28px',
  fontWeight: 700,
  color: '#1f2937'
};

const subtitleStyle: CSSProperties = {
  margin: '8px 0 0',
  color: '#6b7280',
  fontSize: '15px'
};

const unsavedWarningStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: '#fef3c7',
  border: '1px solid #fcd34d',
  color: '#92400e',
  borderRadius: '12px',
  padding: '14px 18px'
};

const layoutStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '24px'
};

const columnStyle: CSSProperties = {
  flex: '1 1 420px',
  minWidth: '320px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px'
};

const cardStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px'
};

const sectionTitleStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: '#1f2937',
  margin: 0
};

const fieldBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const labelStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#374151'
};

const baseInputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#111827',
  backgroundColor: '#ffffff',
  outline: 'none'
};

const errorInputStyle: CSSProperties = {
  borderColor: '#f87171',
  boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.15)'
};

const helperTextStyle: CSSProperties = {
  fontSize: '12px',
  color: '#6b7280'
};

const modeButtonsWrapperStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px'
};

const modeButtonBase: CSSProperties = {
  flex: '1 1 200px',
  padding: '11px 14px',
  borderRadius: '10px',
  border: '1px solid #d1d5db',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  backgroundColor: '#ffffff',
  color: '#4b5563',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px'
};

const buttonPalette = {
  blue: {
    background: '#2563eb',
    border: '#1d4ed8',
    hover: '#1d4ed8',
    shadow: 'rgba(37, 99, 235, 0.28)'
  },
  amber: {
    background: '#f59e0b',
    border: '#d97706',
    hover: '#d97706',
    shadow: 'rgba(245, 158, 11, 0.26)'
  },
  green: {
    background: '#10b981',
    border: '#0f766e',
    hover: '#047857',
    shadow: 'rgba(16, 185, 129, 0.24)'
  },
  gray: {
    background: '#6b7280',
    border: '#4b5563',
    hover: '#4b5563',
    shadow: 'rgba(107, 114, 128, 0.2)'
  }
} as const;

const resolveGeminiKey = (settings: AppSettings): string | undefined => {
  if (settings.geminiApiKey && settings.geminiApiKey.trim()) {
    return settings.geminiApiKey;
  }
  if (settings.apiKey && settings.apiKey.trim()) {
    return settings.apiKey;
  }
  return undefined;
};

const fullWidthButtonBase: CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  border: 'none',
  fontSize: '15px',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const twoColumnGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '12px'
};

const featureItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb'
};

const applicationInfoGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '16px',
  fontSize: '14px'
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '16px',
  flexWrap: 'wrap'
};


const mergeStyles = (...styles: Array<CSSProperties | undefined>) => {
  const result: CSSProperties = {};
  for (const style of styles) {
    Object.assign(result, style);
  }
  return result;
};

const modeButtonStyle = (active: boolean, variant: 'gemini' | 'stt'): CSSProperties => {
  if (!active) {
    return modeButtonBase;
  }
  const palette = variant === 'gemini' ? buttonPalette.blue : buttonPalette.amber;
  return {
    ...modeButtonBase,
    backgroundColor: palette.background,
    borderColor: palette.border,
    color: '#ffffff',
    boxShadow: `0 10px 22px ${palette.shadow}`
  };
};

const buildFilledButtonStyle = (variant: keyof typeof buttonPalette, disabled?: boolean): CSSProperties => {
  const palette = buttonPalette[variant];
  return {
    ...fullWidthButtonBase,
    backgroundColor: disabled ? '#9ca3af' : palette.background,
    boxShadow: disabled ? 'none' : `0 8px 18px ${palette.shadow}`,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: '#ffffff'
  };
};

const secondaryButtonStyle: CSSProperties = {
  padding: '12px 24px',
  borderRadius: '10px',
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#374151',
  fontWeight: 600,
  fontSize: '15px',
  cursor: 'pointer'
};

const featureIcon = (color: string) => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: color
});

export const SettingsPage: React.FC = () => {
  // 以縮放自適應可視高度，避免出現頁面滾動或被裁切
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { showError, showSuccess, showInfo } = useToastActions();
  // 詳細設定改為獨立頁面顯示，避免本頁滾輪問題
  const { setCurrentPage } = useUIStore();

  const mergeSettingsWithDefaults = useMemo(() => {
    const defaults = DEFAULT_SETTINGS.googleCloudSTT ?? {
      enabled: false,
      projectId: '',
      location: 'global',
      recognizerId: '',
      keyFilePath: BUILTIN_GOOGLE_STT_KEY,
      languageCode: 'zh-TW',
      model: 'latest_long',
      enableSpeakerDiarization: true,
      minSpeakerCount: 1,
      maxSpeakerCount: 6
    };

    return (source: AppSettings): AppSettings => ({
      ...source,
      transcriptionMode: source.transcriptionMode ?? 'gemini_direct',
      googleCloudSTT: {
        ...defaults,
        ...(source.googleCloudSTT ?? {})
      }
    });
  }, []);

  const [formData, setFormData] = useState<AppSettings>(mergeSettingsWithDefaults(settings));
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [showAdvancedGeminiSettings, setShowAdvancedGeminiSettings] = useState(false);
  const [isTestingSTT, setIsTestingSTT] = useState(false);
  const [sttTestResult, setSttTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'stt' | 'gemini' | 'about'>('basic');
  
  useEffect(() => {
    const updateScale = () => {
      const el = rootRef.current;
      if (!el) return;
      // 找到可用高度（父層 app-main__content 高度）
      const parent = el.parentElement || document.querySelector('.app-main__content') as HTMLElement | null;
      if (!parent) return;
      const available = parent.clientHeight - 8; // 留少量安全邊
      const needed = el.scrollHeight;
      if (needed > 0 && available > 0) {
        const s = Math.min(1, (available / needed));
        // 允許更小比例以保證完整顯示（Chromium 支援 zoom）
        setScale(Number.isFinite(s) && s > 0 ? s : 1);
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [activeTab, showAdvancedGeminiSettings]);

  useEffect(() => {
    setFormData(mergeSettingsWithDefaults(settings));
    setHasUnsavedChanges(false);
  }, [settings, mergeSettingsWithDefaults]);

  useEffect(() => {
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(settings);
    setHasUnsavedChanges(hasChanges);
  }, [formData, settings]);

  useEffect(() => {
    if (validationErrors.baseURL && formData.baseURL !== settings.baseURL) {
      setValidationErrors(prev => ({ ...prev, baseURL: '' }));
    }
    if (validationErrors.apiKey && formData.apiKey !== settings.apiKey) {
      setValidationErrors(prev => ({ ...prev, apiKey: '' }));
    }
  }, [formData.baseURL, formData.apiKey, settings.baseURL, settings.apiKey, validationErrors]);

  const handleInputChange = (field: keyof AppSettings, value: any) => {
    if (field === 'transcriptionMode') {
      const mode = value as AppSettings['transcriptionMode'];
      setFormData(prev => ({
        ...prev,
        transcriptionMode: mode,
        useGemini: true,
        googleCloudSTT: {
          ...(prev.googleCloudSTT ?? defaultGoogleStt),
          enabled: mode === 'hybrid_stt'
        }
      }));
      setValidationErrors(prev => ({ ...prev, transcriptionMode: '' }));
      setSttTestResult(null);
      return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGoogleSttChange = (field: keyof GoogleCloudSTTSettings, value: any) => {
    setFormData(prev => ({
      ...prev,
      googleCloudSTT: {
        ...(prev.googleCloudSTT ?? defaultGoogleStt),
        [field]: value
      }
    }));
    const errorKey = `googleCloudSTT.${field}`;
    setValidationErrors(prev => ({ ...prev, [errorKey]: '' }));
  };

  const validateForm = (): boolean => {
    const validation = validateSettings(formData);
    setValidationErrors(validation.errors);
    return validation.isValid;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      const dataToSave: AppSettings = {
        ...formData,
        transcriptionMode: formData.transcriptionMode ?? 'gemini_direct',
        googleCloudSTT: {
          ...(formData.googleCloudSTT ?? mergeSettingsWithDefaults(settings).googleCloudSTT),
          enabled: (formData.transcriptionMode ?? 'gemini_direct') === 'hybrid_stt'
        }
      };

      updateSettings(dataToSave);
      showSuccess('設定已保存');
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      showError('保存設定失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('確定要重置所有設定嗎？這將清除所有自定義配置。')) {
      resetSettings();
      showInfo('設定已重置為默認值');
    }
  };

  const handleTestConnection = async () => {
    if (formData.transcriptionMode === 'hybrid_stt') {
      await handleTestGoogleSTT();
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsTestingConnection(true);
    setDiagnosticResult(null);

    try {
      const geminiKey = resolveGeminiKey(formData);
      if (formData.useGemini && geminiKey) {
        const geminiClient = new GeminiAPIClient(geminiKey, {
          preferredModel: formData.geminiPreferredModel,
          enableFallback: formData.geminiEnableFallback,
          retryConfig: formData.geminiRetryConfig,
          diagnosticMode: formData.geminiDiagnosticMode
        });

        const result = await geminiClient.testConnection();
        setDiagnosticResult(result);

        if (result.success) {
          showSuccess(`✅ Gemini API 連接成功 (回應時間: ${result.details.responseTime}ms)`);
        } else {
          const errorMsg = result.details.errorMessage || '未知錯誤';
          showError(`❌ Gemini API 連接失敗: ${errorMsg}`);
        }
      } else {
        const isHealthy = await checkAPIHealth(formData);

        if (isHealthy) {
          showSuccess('API 連接測試成功');
        } else {
          showError('API 連接測試失敗，請檢查 URL 和金鑰');
        }
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      showError('連接測試失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
      setDiagnosticResult({
        success: false,
        details: {
          apiKeyValid: false,
          modelAccessible: false,
          responseTime: 0,
          errorMessage: error instanceof Error ? error.message : '未知錯誤',
          suggestedActions: ['檢查網路連接', '確認 API 金鑰正確']
        }
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleTestModelAvailability = async () => {
    if (formData.transcriptionMode === 'hybrid_stt') {
      showInfo('混合模式下仍會使用 Gemini 做摘要，請在上方填寫 API 金鑰後改用「診斷 API 連接」按鈕即可。');
      return;
    }

    const geminiKey = resolveGeminiKey(formData);
    if (!geminiKey) {
      showError('請先輸入 API 金鑰');
      return;
    }

    setIsTestingConnection(true);
    try {
      const geminiClient = new GeminiAPIClient(geminiKey, {
        diagnosticMode: formData.geminiDiagnosticMode
      });

      const availableModel = await geminiClient.findAvailableModel();

      if (availableModel) {
        showSuccess(`找到可用模型: ${availableModel}`);
        handleInputChange('geminiPreferredModel', availableModel);
      } else {
        showError('沒有找到可用的模型');
      }
    } catch (error) {
      console.error('Model test failed:', error);
      showError('模型測試失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
    } finally {
      setIsTestingConnection(false);
    }
  };

  const enabledFeatures = getEnabledFeatures();
  const disabledFeatures = getDisabledFeatures();
  const transcriptionMode = formData.transcriptionMode ?? 'gemini_direct';

  const defaultGoogleStt = useMemo<GoogleCloudSTTSettings>(() => {
    const merged = mergeSettingsWithDefaults(DEFAULT_SETTINGS);
    return (merged.googleCloudSTT ?? {
      enabled: false,
      projectId: '',
      location: 'global',
      recognizerId: '',
      keyFilePath: '',
      languageCode: 'zh-TW',
      model: 'latest_long',
      enableSpeakerDiarization: true,
      minSpeakerCount: 1,
      maxSpeakerCount: 6
    }) as GoogleCloudSTTSettings;
  }, [mergeSettingsWithDefaults]);

  const googleSttSettings = useMemo<GoogleCloudSTTSettings>(() => ({
    ...defaultGoogleStt,
    ...(formData.googleCloudSTT ?? {})
  }), [defaultGoogleStt, formData.googleCloudSTT]);

  const handleTestGoogleSTT = async () => {
    if (!window?.electronAPI?.stt) {
      showError('目前無法進行 Google STT 測試，請確認應用已載入最新版本');
      return;
    }

    try {
      setIsTestingSTT(true);
      setSttTestResult(null);

      const result = await window.electronAPI.stt.initialize({
        projectId: googleSttSettings.projectId ?? '',
        location: googleSttSettings.location ?? '',
        recognizerId: googleSttSettings.recognizerId ?? '',
        keyFilePath: googleSttSettings.keyFilePath ?? ''
      });

      if (result.success) {
        setSttTestResult({ success: true, message: 'Google STT 初始化成功' });
        showSuccess('Google STT 初始化成功');
      } else {
        const message = result.error || '初始化失敗，請檢查設定';
        setSttTestResult({ success: false, message });
        showError(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google STT 測試失敗';
      setSttTestResult({ success: false, message });
      showError(message);
    } finally {
      setIsTestingSTT(false);
    }
  };

  const renderValidationMessage = (key: string) => {
    if (!validationErrors[key]) {
      return null;
    }
    return (
      <span style={{ fontSize: '12px', color: '#dc2626' }}>{validationErrors[key]}</span>
    );
  };

  const renderDiagnosticResult = () => {
    if (transcriptionMode !== 'gemini_direct' || !diagnosticResult) {
      return null;
    }

    const success = Boolean(diagnosticResult.success);
    return (
      <div
        style={mergeStyles(
          cardStyle,
          {
            borderColor: success ? '#bbf7d0' : '#fecaca',
            backgroundColor: success ? '#ecfdf5' : '#fef2f2',
            gap: '12px'
          }
        )}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: success ? '#047857' : '#b91c1c' }}>
          <span>{success ? '✅ 診斷結果正常' : '⚠️ 診斷結果異常'}</span>
        </div>

        <div style={twoColumnGridStyle}>
          <div style={{ fontSize: '13px', color: '#374151' }}>
            <span>API Key：</span>
            <strong style={{ marginLeft: '8px', color: diagnosticResult.details.apiKeyValid ? '#047857' : '#b91c1c' }}>
              {diagnosticResult.details.apiKeyValid ? '有效' : '無效'}
            </strong>
          </div>
          <div style={{ fontSize: '13px', color: '#374151' }}>
            <span>模型訪問：</span>
            <strong style={{ marginLeft: '8px', color: diagnosticResult.details.modelAccessible ? '#047857' : '#b91c1c' }}>
              {diagnosticResult.details.modelAccessible ? '可用' : '不可用'}
            </strong>
          </div>
          {diagnosticResult.details.responseTime > 0 && (
            <div style={{ fontSize: '13px', color: '#1d4ed8' }}>
              回應時間：{diagnosticResult.details.responseTime}ms
            </div>
          )}
        </div>

        {diagnosticResult.details.errorMessage && (
          <div style={{ fontSize: '12px', color: '#b91c1c', backgroundColor: '#fee2e2', borderRadius: '8px', padding: '8px 10px' }}>
            {diagnosticResult.details.errorMessage}
          </div>
        )}

        {diagnosticResult.details.suggestedActions && diagnosticResult.details.suggestedActions.length > 0 && (
          <div>
            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>建議操作：</div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#4b5563' }}>
              {diagnosticResult.details.suggestedActions.map((action: string, index: number) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderFeatureList = () => (
    <div style={cardStyle}>
      <h2 style={sectionTitleStyle}>功能狀態</h2>
      {enabledFeatures.length > 0 && (
        <div>
          <h3 style={{ fontSize: '15px', color: '#047857', marginBottom: '12px' }}>已啟用功能</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {enabledFeatures.map(flag => (
              <div key={flag} style={mergeStyles(featureItemStyle, { borderColor: '#bbf7d0', backgroundColor: '#ecfdf5', color: '#047857' })}>
                <div style={featureIcon('#047857')} />
                <span style={{ flex: 1, fontSize: '13px' }}>{FEATURE_DESCRIPTIONS[flag]}</span>
                <span>✅</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {disabledFeatures.length > 0 && (
        <div>
          <h3 style={{ fontSize: '15px', color: '#6b7280', margin: '16px 0 12px' }}>即將推出</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {disabledFeatures.map(flag => (
              <div key={flag} style={mergeStyles(featureItemStyle, { opacity: 0.75 })}>
                <div style={featureIcon('#9ca3af')} />
                <span style={{ flex: 1, fontSize: '13px', color: '#4b5563' }}>{FEATURE_DESCRIPTIONS[flag]}</span>
                <span>🔒</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderApplicationInfo = () => {
    const modeLabel = transcriptionMode === 'hybrid_stt' ? 'Google STT + Gemini' : 'Gemini 直接轉錄';
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>應用程式資訊</h2>
        <div style={applicationInfoGridStyle}>
          <div>
            <div style={{ color: '#6b7280', marginBottom: '4px' }}>版本</div>
            <div style={{ fontWeight: 600 }}>1.1.6</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', marginBottom: '4px' }}>API 基礎網址</div>
            <div style={{ fontWeight: 600 }}>{formData.baseURL || '未設定'}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', marginBottom: '4px' }}>轉錄模式</div>
            <div style={{ fontWeight: 600 }}>{modeLabel}</div>
          </div>
          {formData.geminiPreferredModel && (
            <div>
              <div style={{ color: '#6b7280', marginBottom: '4px' }}>Gemini 模型</div>
              <div style={{ fontWeight: 600 }}>{formData.geminiPreferredModel}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      style={{
        ...containerStyle,
        // Electron/Chromium 支援 zoom，會參與版面計算；transform 作為後備
        // 避免裁切和捲軸
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        zoom: scale
      } as any}
    >
      {/* 移除頁內大標題，騰出垂直空間 */}

      {hasUnsavedChanges && (
        <div style={unsavedWarningStyle}>
          <span style={{ fontWeight: 700 }}>!</span>
          <span>您有未保存的變更</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {activeTab === 'basic' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={sectionTitleStyle}>API 與轉錄設定</h2>
              {transcriptionMode === 'hybrid_stt' && (
                <button
                  type="button"
                  onClick={() => setCurrentPage('stt')}
                  style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  ⚙️ Google STT 詳細設定
                </button>
              )}
            </div>

          <div style={fieldBlockStyle}>
            <span style={labelStyle}>轉錄模式</span>
            <div style={modeButtonsWrapperStyle}>
                <button
                  type="button"
                  onClick={() => handleInputChange('transcriptionMode', 'gemini_direct')}
                  style={modeButtonStyle(transcriptionMode === 'gemini_direct', 'gemini')}
                >
                  Gemini 直接轉錄
                </button>
                <button
                  type="button"
                  onClick={() => handleInputChange('transcriptionMode', 'hybrid_stt')}
                  style={modeButtonStyle(transcriptionMode === 'hybrid_stt', 'stt')}
                >
                  Google STT + Gemini
                </button>
              </div>
              <p style={helperTextStyle}>
                Gemini 直接轉錄：使用 Google Gemini 2.5 Pro 完成逐字稿與摘要。<br />
                Google STT + Gemini：先以 Google Speech-to-Text 取得逐字稿，再交由 Gemini 生成摘要。
              </p>
            </div>

            <div style={fieldBlockStyle}>
              <span style={labelStyle}>API 基礎網址</span>
              <input
                type="url"
                value={formData.baseURL}
                onChange={(e) => handleInputChange('baseURL', e.target.value)}
                placeholder="https://api.example.com"
                style={mergeStyles(baseInputStyle, validationErrors.baseURL ? errorInputStyle : undefined)}
              />
              {renderValidationMessage('baseURL')}
            </div>

            <div style={fieldBlockStyle}>
              <span style={labelStyle}>API 金鑰</span>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                placeholder="請輸入 API 金鑰"
                style={mergeStyles(baseInputStyle, validationErrors.apiKey ? errorInputStyle : undefined)}
              />
              {renderValidationMessage('apiKey')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={transcriptionMode === 'hybrid_stt' ? isTestingSTT : isTestingConnection}
                style={buildFilledButtonStyle(transcriptionMode === 'hybrid_stt' ? 'amber' : 'blue', transcriptionMode === 'hybrid_stt' ? isTestingSTT : isTestingConnection)}
              >
                {transcriptionMode === 'hybrid_stt'
                  ? (isTestingSTT ? '測試中…' : '🔍 測試 Google STT 設定')
                  : (isTestingConnection ? '診斷中…' : '🔍 診斷 Gemini API 連接')}
              </button>

              {transcriptionMode === 'gemini_direct' && resolveGeminiKey(formData) && (
                <button
                  type="button"
                  onClick={handleTestModelAvailability}
                  disabled={isTestingConnection}
                  style={buildFilledButtonStyle('green', isTestingConnection)}
                >
                  🧪 測試可用模型
                </button>
              )}
            </div>

            {transcriptionMode === 'hybrid_stt' && sttTestResult && (
              <div style={{ fontSize: '13px', color: sttTestResult.success ? '#047857' : '#b45309' }}>
                {sttTestResult.message}
              </div>
            )}
            
            {/* 詳細設定改為獨立頁顯示 */}

            {renderDiagnosticResult()}
          </div>
        )}


        {activeTab === 'gemini' && formData.useGemini && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={sectionTitleStyle}>Gemini 進階設定</h2>
              <button
                type="button"
                onClick={() => setShowAdvancedGeminiSettings(!showAdvancedGeminiSettings)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
              >
                {showAdvancedGeminiSettings ? '隱藏進階選項' : '顯示進階選項'}
              </button>
            </div>
            {showAdvancedGeminiSettings && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={fieldBlockStyle}>
                  <span style={labelStyle}>偏好模型</span>
                  <select
                    value={formData.geminiPreferredModel || 'gemini-2.5-pro'}
                    onChange={(e) => handleInputChange('geminiPreferredModel', e.target.value)}
                    style={baseInputStyle}
                  >
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (推薦)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (備用)</option>
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={formData.geminiEnableFallback ?? true}
                    onChange={(e) => handleInputChange('geminiEnableFallback', e.target.checked)}
                  />
                  啟用模型 Fallback
                </label>
                <span style={helperTextStyle}>當主要模型不可用時自動嘗試其他模型</span>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={formData.geminiDiagnosticMode ?? false}
                    onChange={(e) => handleInputChange('geminiDiagnosticMode', e.target.checked)}
                  />
                  診斷模式
                </label>
                <span style={helperTextStyle}>啟用詳細的日誌記錄以便問題排查</span>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={formData.geminiHealthCheckEnabled ?? true}
                    onChange={(e) => handleInputChange('geminiHealthCheckEnabled', e.target.checked)}
                  />
                  啟用 API 健康檢查
                </label>

                <div>
                  <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '8px' }}>重試配置</div>
                  <div style={twoColumnGridStyle}>
                    <div style={fieldBlockStyle}>
                      <span style={labelStyle}>最大重試次數</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={formData.geminiRetryConfig?.maxRetries ?? 5}
                        onChange={(e) => handleInputChange('geminiRetryConfig', {
                          ...formData.geminiRetryConfig,
                          maxRetries: parseInt(e.target.value, 10)
                        })}
                        style={baseInputStyle}
                      />
                    </div>

                    <div style={fieldBlockStyle}>
                      <span style={labelStyle}>基礎延遲 (毫秒)</span>
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={formData.geminiRetryConfig?.baseDelay ?? 30000}
                        onChange={(e) => handleInputChange('geminiRetryConfig', {
                          ...formData.geminiRetryConfig,
                          baseDelay: parseInt(e.target.value, 10)
                        })}
                        style={baseInputStyle}
                      />
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', marginTop: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.geminiRetryConfig?.enableJitter ?? true}
                      onChange={(e) => handleInputChange('geminiRetryConfig', {
                        ...formData.geminiRetryConfig,
                        enableJitter: e.target.checked
                      })}
                    />
                    隨機抖動
                  </label>
                  <span style={helperTextStyle}>配置請求失敗時的重試行為</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab === 'about' && renderFeatureList()}
      {activeTab === 'about' && renderApplicationInfo()}

      <div style={actionRowStyle}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !hasUnsavedChanges}
          style={{
            ...buildFilledButtonStyle('blue', isSaving || !hasUnsavedChanges),
            width: '220px'
          }}
        >
          {isSaving ? '保存中…' : '保存設定'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          style={secondaryButtonStyle}
        >
          重置設定
        </button>
      </div>
    </div>
  );
};
