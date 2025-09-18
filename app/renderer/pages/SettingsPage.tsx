import React, { useState, useEffect } from 'react';
import { useSettingsStore, useToastActions } from '../services/store';
import { FlagGuard } from '../components/FlagGuard';
import { validateSettings, checkAPIHealth } from '../utils/validators';
import { ENV_CONFIGS } from '@main/config/env';
import { FLAGS, getEnabledFeatures, getDisabledFeatures, FEATURE_DESCRIPTIONS } from '@shared/flags';
import { GeminiAPIClient } from '../services/geminiApi';

export const SettingsPage: React.FC = () => {
  // Store hooks
  const { settings, updateSettings, resetSettings } = useSettingsStore();
  const { showError, showSuccess, showInfo } = useToastActions();

  // Local state
  const [formData, setFormData] = useState(settings);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [showAdvancedGeminiSettings, setShowAdvancedGeminiSettings] = useState(false);

  // Update form data when settings change
  useEffect(() => {
    setFormData(settings);
    setHasUnsavedChanges(false);
  }, [settings]);

  // Check for unsaved changes
  useEffect(() => {
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(settings);
    setHasUnsavedChanges(hasChanges);
  }, [formData, settings]);

  // Clear validation errors when inputs change
  useEffect(() => {
    if (validationErrors.baseURL && formData.baseURL !== settings.baseURL) {
      setValidationErrors(prev => ({ ...prev, baseURL: '' }));
    }
    if (validationErrors.apiKey && formData.apiKey !== settings.apiKey) {
      setValidationErrors(prev => ({ ...prev, apiKey: '' }));
    }
    if (validationErrors.openRouterModel && formData.openRouterModel !== settings.openRouterModel) {
      setValidationErrors(prev => ({ ...prev, openRouterModel: '' }));
    }
  }, [formData.baseURL, formData.apiKey, formData.openRouterModel, settings.baseURL, settings.apiKey, settings.openRouterModel, validationErrors]);

  // Handle form input changes
  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Validate form data
  const validateForm = (): boolean => {
    const validation = validateSettings(formData);
    setValidationErrors(validation.errors);
    return validation.isValid;
  };

  // Save settings
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      const dataToSave = { ...formData };

      if (dataToSave.useGemini === false) {
        const baseURL = (dataToSave.openRouterBaseURL || dataToSave.baseURL || '').trim();
        const apiKey = (dataToSave.openRouterApiKey || dataToSave.apiKey || '').trim();

        dataToSave.openRouterBaseURL = baseURL;
        dataToSave.baseURL = baseURL;
        dataToSave.openRouterApiKey = apiKey;
        dataToSave.apiKey = apiKey;
      }

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

  // Reset settings to default
  const handleReset = () => {
    if (confirm('確定要重置所有設定嗎？這將清除所有自定義配置。')) {
      resetSettings();
      showInfo('設定已重置為默認值');
    }
  };

  // Enhanced API connection test with diagnostics
  const handleTestConnection = async () => {
    if (!validateForm()) {
      return;
    }

    setIsTestingConnection(true);
    setDiagnosticResult(null);

    try {
      if (formData.useGemini && formData.geminiApiKey) {
        // 使用增強的 Gemini API 診斷
        const geminiClient = new GeminiAPIClient(formData.geminiApiKey, {
          preferredModel: formData.geminiPreferredModel,
          enableFallback: formData.geminiEnableFallback,
          retryConfig: formData.geminiRetryConfig,
          diagnosticMode: formData.geminiDiagnosticMode
        });

        const diagnosticResult = await geminiClient.testConnection();
        setDiagnosticResult(diagnosticResult);

        if (diagnosticResult.success) {
          showSuccess(`✅ Gemini API 連接成功 (回應時間: ${diagnosticResult.details.responseTime}ms)`);
        } else {
          const errorMsg = diagnosticResult.details.errorMessage || '未知錯誤';
          showError(`❌ Gemini API 連接失敗: ${errorMsg}`);
        }
      } else {
        // 使用原有的通用 API 健康檢查
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

  // Test model availability
  const handleTestModelAvailability = async () => {
    if (!formData.geminiApiKey) {
      showError('請先輸入 Gemini API Key');
      return;
    }

    setIsTestingConnection(true);
    try {
      const geminiClient = new GeminiAPIClient(formData.geminiApiKey, {
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

  const openRouterBaseURL = formData.openRouterBaseURL ?? formData.baseURL ?? '';
  const openRouterApiKey = formData.openRouterApiKey ?? formData.apiKey ?? '';
  const openRouterModel = formData.openRouterModel ?? '';
  const openRouterFallbackModels = formData.openRouterFallbackModels ?? '';
  const openRouterReferer = formData.openRouterReferer ?? '';
  const openRouterTitle = formData.openRouterTitle ?? '';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">應用設定</h1>
        <p className="text-gray-600">配置 API 連接和應用程式偏好設定</p>
      </div>

      {/* Unsaved Changes Warning */}
      {hasUnsavedChanges && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L4.064 12.5C3.294 14.333 4.256 16 5.794 16z" />
            </svg>
            <span className="text-yellow-700">您有未保存的變更</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Settings */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">API 設定</h2>
          
          {/* Environment Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              環境
            </label>
            <select
              value={formData.environment}
              onChange={(e) => handleInputChange('environment', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(ENV_CONFIGS).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.name} ({config.baseURL})
                </option>
              ))}
            </select>
          </div>

          {/* Base URL */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {formData.useGemini ? 'API 基礎網址' : 'OpenRouter API 基礎網址'}
            </label>
            <input
              type="url"
              value={formData.useGemini ? formData.baseURL : openRouterBaseURL}
              onChange={(e) => {
              handleInputChange('baseURL', e.target.value);
              handleInputChange('openRouterBaseURL', e.target.value);
            }}
              placeholder={formData.useGemini ? "https://api.example.com" : "https://openrouter.ai/api/v1"}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                validationErrors.baseURL
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {validationErrors.baseURL && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.baseURL}</p>
            )}
          </div>

          {/* API Key */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {formData.useGemini ? 'API 金鑰' : 'OpenRouter API Key'}
              {formData.useMock && (
                <span className="ml-2 text-xs text-gray-500">(Mock 模式下可選)</span>
              )}
            </label>
            <input
              type="password"
              value={formData.useGemini ? formData.apiKey : openRouterApiKey}
              onChange={(e) => {
              handleInputChange('apiKey', e.target.value);
              handleInputChange('openRouterApiKey', e.target.value);
            }}
              placeholder={formData.useGemini ? "請輸入 API 金鑰" : "請輸入 OpenRouter API Key"}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                validationErrors.apiKey
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {validationErrors.apiKey && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.apiKey}</p>
            )}
          </div>

          {/* Mock Mode Toggle */}
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.useMock}
                onChange={(e) => handleInputChange('useMock', e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm font-medium text-gray-700">
                使用 Mock 模式 (測試用)
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              啟用後將使用模擬資料，不會發送實際 API 請求
            </p>
          </div>

          {/* Test Connection Button */}
          {!formData.useMock && (
            <div className="space-y-3">
              <button
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isTestingConnection ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    測試中...
                  </div>
                ) : (
                  '🔍 診斷 API 連接'
                )}
              </button>

              {/* Gemini Model Test Button */}
              {formData.useGemini && formData.geminiApiKey && (
                <button
                  onClick={handleTestModelAvailability}
                  disabled={isTestingConnection}
                  className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  🧪 測試可用模型
                </button>
              )}
            </div>
          )}

          {/* Diagnostic Results */}
          {diagnosticResult && (
            <div className={`mt-4 p-4 rounded-lg border ${
              diagnosticResult.success
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center mb-2">
                {diagnosticResult.success ? (
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className={`font-medium ${
                  diagnosticResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  診斷結果
                </span>
              </div>

              <div className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-600">API Key:</span>
                    <span className={`ml-2 ${
                      diagnosticResult.details.apiKeyValid ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {diagnosticResult.details.apiKeyValid ? '有效' : '無效'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">模型訪問:</span>
                    <span className={`ml-2 ${
                      diagnosticResult.details.modelAccessible ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {diagnosticResult.details.modelAccessible ? '可用' : '不可用'}
                    </span>
                  </div>
                </div>

                {diagnosticResult.details.responseTime > 0 && (
                  <div>
                    <span className="text-gray-600">回應時間:</span>
                    <span className="ml-2 text-blue-600">{diagnosticResult.details.responseTime}ms</span>
                  </div>
                )}

                {diagnosticResult.details.errorMessage && (
                  <div>
                    <span className="text-gray-600">錯誤信息:</span>
                    <div className="text-red-600 text-xs mt-1 bg-red-100 p-2 rounded">
                      {diagnosticResult.details.errorMessage}
                    </div>
                  </div>
                )}

                {diagnosticResult.details.suggestedActions && diagnosticResult.details.suggestedActions.length > 0 && (
                  <div>
                    <span className="text-gray-600">建議操作:</span>
                    <ul className="mt-1 space-y-1">
                      {diagnosticResult.details.suggestedActions.map((action: string, index: number) => (
                        <li key={index} className="text-xs text-gray-700 flex items-start">
                          <span className="mr-1">•</span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Gemini Advanced Settings */}
        {formData.useGemini && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Gemini 進階設定</h2>
              <button
                onClick={() => setShowAdvancedGeminiSettings(!showAdvancedGeminiSettings)}
                className="text-blue-500 hover:text-blue-700 text-sm font-medium"
              >
                {showAdvancedGeminiSettings ? '隱藏' : '顯示'} 進階選項
              </button>
            </div>

            {showAdvancedGeminiSettings && (
              <div className="space-y-4">
                {/* Preferred Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    偏好模型
                  </label>
                  <select
                    value={formData.geminiPreferredModel || 'gemini-2.5-pro'}
                    onChange={(e) => handleInputChange('geminiPreferredModel', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (推薦)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (備用)</option>
                  </select>
                </div>

                {/* Enable Fallback */}
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.geminiEnableFallback ?? true}
                      onChange={(e) => handleInputChange('geminiEnableFallback', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">
                      啟用模型 Fallback
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    當主要模型不可用時自動嘗試其他模型
                  </p>
                </div>

                {/* Diagnostic Mode */}
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.geminiDiagnosticMode ?? false}
                      onChange={(e) => handleInputChange('geminiDiagnosticMode', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">
                      診斷模式
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    啟用詳細的日誌記錄以便問題排查
                  </p>
                </div>

                {/* Health Check */}
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.geminiHealthCheckEnabled ?? true}
                      onChange={(e) => handleInputChange('geminiHealthCheckEnabled', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">
                      啟用 API 健康檢查
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    在開始轉錄前檢查 API 是否可用
                  </p>
                </div>

                {/* Retry Configuration */}
                <div className="border-t pt-4">
                  <h3 className="text-md font-medium text-gray-700 mb-3">重試配置</h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        最大重試次數
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={formData.geminiRetryConfig?.maxRetries ?? 5}
                        onChange={(e) => handleInputChange('geminiRetryConfig', {
                          ...formData.geminiRetryConfig,
                          maxRetries: parseInt(e.target.value)
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        基礎延遲 (秒)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={(formData.geminiRetryConfig?.baseDelay ?? 30000) / 1000}
                        onChange={(e) => handleInputChange('geminiRetryConfig', {
                          ...formData.geminiRetryConfig,
                          baseDelay: parseInt(e.target.value) * 1000
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.geminiRetryConfig?.enableJitter ?? true}
                          onChange={(e) => handleInputChange('geminiRetryConfig', {
                            ...formData.geminiRetryConfig,
                            enableJitter: e.target.checked
                          })}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700">
                          隨機抖動
                        </span>
                      </label>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    配置 API 請求失敗時的重試行為
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feature Flags */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">功能狀態</h2>
          
          {/* Enabled Features */}
          {enabledFeatures.length > 0 && (
            <div className="mb-6">
              <h3 className="text-md font-medium text-gray-700 mb-3">已啟用功能</h3>
              <div className="space-y-2">
                {enabledFeatures.map(flag => (
                  <div key={flag} className="flex items-center p-3 bg-green-50 border border-green-200 rounded">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-green-800">{FEATURE_DESCRIPTIONS[flag]}</div>
                    </div>
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disabled Features */}
          {disabledFeatures.length > 0 && (
            <div>
              <h3 className="text-md font-medium text-gray-700 mb-3">即將推出</h3>
              <div className="space-y-2">
                {disabledFeatures.map(flag => (
                  <div key={flag} className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mr-3"></div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-600">{FEATURE_DESCRIPTIONS[flag]}</div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Application Info */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">應用程式資訊</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">版本</span>
            <div className="font-medium">1.0.0</div>
          </div>
          <div>
            <span className="text-gray-500">平台</span>
            <div className="font-medium">Windows</div>
          </div>
          <div>
            <span className="text-gray-500">環境</span>
            <div className="font-medium capitalize">{formData.environment}</div>
          </div>
          <div>
            <span className="text-gray-500">模式</span>
            <div className="font-medium">{formData.useMock ? 'Mock' : 'Production'}</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={handleSave}
          disabled={isSaving || !hasUnsavedChanges}
          className="px-8 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? '保存中...' : '保存設定'}
        </button>

        <button
          onClick={handleReset}
          className="px-8 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
        >
          重置設定
        </button>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <h3 className="font-medium mb-2">設定說明：</h3>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong>Mock 模式</strong>：使用模擬資料進行測試，不會發送實際 API 請求</li>
          <li><strong>環境切換</strong>：選擇不同的 API 環境（開發、測試、正式）</li>
          <li><strong>API 金鑰</strong>：用於身份驗證的密鑰，請妥善保管</li>
          <li><strong>功能狀態</strong>：顯示當前版本可用和即將推出的功能</li>
        </ul>
      </div>
    </div>
  );
};
