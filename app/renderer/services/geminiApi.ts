import { AppSettings } from '@shared/types';
import {
  DEFAULT_GEMINI_TRANSCRIPT_PROMPT,
  DEFAULT_TRANSCRIPT_CLEANUP_PROMPT
} from '@shared/defaultPrompts';

// Gemini API 類型定義
interface GeminiFileUploadResponse {
  name: string;
  displayName: string;
  mimeType: string;
  sizeBytes: string;
  createTime: string;
  updateTime: string;
  expirationTime: string;
  sha256Hash: string;
  uri: string;
}

interface GeminiContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  fileData?: {
    mimeType?: string;
    fileUri: string;
  };
}

interface GeminiCandidateContent {
  parts?: GeminiContentPart[];
  role?: string;
}

interface GeminiCandidate {
  content?: GeminiCandidateContent;
  finishReason?: string;
  index?: number;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
      severity?: string;
    }>;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    totalTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    promptTokensDetails?: Array<{
      modality?: string;
      tokenCount?: number;
    }>;
    candidatesTokensDetails?: Array<{
      modality?: string;
      tokenCount?: number;
    }>;
  };
}

class GeminiAPIClient {
  private apiKey: string;
  private baseURL = 'https://generativelanguage.googleapis.com/v1beta';
  private uploadURL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

  // 可用的 Gemini 模型列表（按優先級排序）
  private availableModels = [
    'gemini-2.5-pro',     // 優先使用最新的 2.5 Pro
    'gemini-2.5-flash'    // 降級到 2.5 Flash
  ];

  private currentModel = 'gemini-2.5-pro'; // 預設使用最新模型
  private enableFallback = true;
  private retryConfig = {
    maxRetries: 5,
    baseDelay: 30000,
    enableJitter: true
  };
  private diagnosticMode = false;

  constructor(
    apiKey: string,
    settings?: {
      preferredModel?: string;
      enableFallback?: boolean;
      retryConfig?: {
        maxRetries?: number;
        baseDelay?: number;
        enableJitter?: boolean;
      };
      diagnosticMode?: boolean;
    }
  ) {
    this.apiKey = apiKey;

    if (settings?.preferredModel && this.availableModels.includes(settings.preferredModel)) {
      this.currentModel = settings.preferredModel;
    }

    if (settings?.enableFallback !== undefined) {
      this.enableFallback = settings.enableFallback;
    }

    if (settings?.retryConfig) {
      this.retryConfig = {
        ...this.retryConfig,
        ...settings.retryConfig
      };
    }

    if (settings?.diagnosticMode !== undefined) {
      this.diagnosticMode = settings.diagnosticMode;
    }

    if (this.diagnosticMode) {
      console.log('🔧 GeminiAPIClient 初始化:', {
        model: this.currentModel,
        enableFallback: this.enableFallback,
        retryConfig: this.retryConfig,
        diagnosticMode: this.diagnosticMode
      });
    }
  }

  // 增強的 API 連接測試 - 提供詳細診斷信息
  async testConnection(): Promise<{
    success: boolean;
    details: {
      apiKeyValid: boolean;
      modelAccessible: boolean;
      responseTime: number;
      errorMessage?: string;
      statusCode?: number;
      suggestedActions?: string[];
    };
  }> {
    const startTime = Date.now();

    try {
      console.log('🔍 開始 Gemini API 完整診斷...');

      // 使用新的重試機制測試API連接
      const result = await this.retryWithExponentialBackoff(async () => {
        const testUrl = `${this.baseURL}/models/gemini-2.5-pro:generateContent?key=${this.apiKey}`;

        console.log('📡 測試 API 端點:', testUrl.replace(this.apiKey, 'API_KEY_HIDDEN'));

        const testResponse = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "API連接測試"
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 10
            }
          })
        });

        const responseTime = Date.now() - startTime;
        console.log(`⏱️ API 回應時間: ${responseTime}ms, 狀態: ${testResponse.status}`);

        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          throw new Error(`API 請求失敗: ${testResponse.status} - ${errorText}`);
        }

        const responseData = await testResponse.json();
        console.log('✅ API 連接測試成功，模型回應正常');

        return {
          success: true,
          details: {
            apiKeyValid: true,
            modelAccessible: true,
            responseTime,
            suggestedActions: ['API 連接正常，可以開始轉錄']
          }
        };
      }, 2, 20000); // 降低測試重試次數和間隔

      return result;

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.message || '未知錯誤';

      console.error('❌ API 連接測試失敗:', errorMessage);

      // 解析錯誤類型並提供建議
      const suggestions: string[] = [];
      let apiKeyValid = true;
      let statusCode: number | undefined;

      if (errorMessage.includes('401') || errorMessage.includes('Invalid API key')) {
        apiKeyValid = false;
        statusCode = 401;
        suggestions.push('檢查 API Key 是否正確');
        suggestions.push('確認 API Key 是否已啟用');
      } else if (errorMessage.includes('403')) {
        statusCode = 403;
        suggestions.push('檢查 API Key 權限設定');
        suggestions.push('確認已啟用 Generative Language API');
      } else if (errorMessage.includes('503')) {
        statusCode = 503;
        suggestions.push('Google API 服務目前過載');
        suggestions.push('請稍等幾分鐘後再試');
        suggestions.push('考慮在非高峰時段使用');
      } else if (errorMessage.includes('429')) {
        statusCode = 429;
        suggestions.push('已達到 API 使用配額限制');
        suggestions.push('檢查 Google Cloud Console 的配額設定');
        suggestions.push('等待配額重置或升級方案');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
        suggestions.push('檢查網路連接');
        suggestions.push('確認防火牆或代理設定');
        suggestions.push('嘗試使用不同網路');
      } else {
        suggestions.push('檢查 Google API 服務狀態');
        suggestions.push('確認 API 端點 URL 正確');
        suggestions.push('聯繫技術支援');
      }

      return {
        success: false,
        details: {
          apiKeyValid,
          modelAccessible: false,
          responseTime,
          errorMessage,
          statusCode,
          suggestedActions: suggestions
        }
      };
    }
  }

  // 簡化版連接測試（保持向後相容性）
  async testConnectionSimple(): Promise<boolean> {
    const result = await this.testConnection();
    return result.success;
  }

  // 測試並找到可用的模型
  async findAvailableModel(): Promise<string | null> {
    console.log('🔍 開始檢測可用的 Gemini 模型...');

    for (const model of this.availableModels) {
      try {
        console.log(`🧪 測試模型: ${model}`);

        const testUrl = `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`;

        const testResponse = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "測試模型可用性"
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 10
            }
          })
        });

        if (testResponse.ok) {
          console.log(`✅ 模型 ${model} 可用`);
          this.currentModel = model;
          return model;
        } else if (testResponse.status === 404) {
          console.log(`❌ 模型 ${model} 不存在或不可用`);
          continue;
        } else if (testResponse.status === 503) {
          console.log(`⏳ 模型 ${model} 暫時過載，嘗試下一個模型`);
          continue;
        } else {
          const errorText = await testResponse.text();
          console.log(`⚠️ 模型 ${model} 測試失敗: ${testResponse.status} - ${errorText}`);
          continue;
        }
      } catch (error) {
        console.log(`⚠️ 測試模型 ${model} 時發生錯誤:`, error);
        continue;
      }
    }

    console.log('❌ 沒有找到可用的模型');
    return null;
  }

  // 使用 Fallback 機制執行操作
  private async executeWithFallback<T>(
    operation: (model: string) => Promise<T>,
    context: string = '操作'
  ): Promise<T> {
    let lastError: any;

    // 首先嘗試當前模型
    try {
      if (this.diagnosticMode) {
        console.log(`🎯 使用模型 ${this.currentModel} 執行${context}`);
      }
      return await operation(this.currentModel);
    } catch (error: any) {
      lastError = error;
      console.log(`⚠️ 模型 ${this.currentModel} 執行${context}失敗:`, error.message);

      // 檢查是否啟用了 fallback 機制
      if (!this.enableFallback) {
        console.log('❌ Fallback 機制已停用，不嘗試其他模型');
        throw lastError;
      }

      // 如果是503錯誤，嘗試其他模型
      if (error.message && error.message.includes('503')) {
        console.log('🔄 嘗試使用其他可用模型...');

        // 嘗試其他模型（優先2.5-pro，降級到2.5-flash）
        for (const model of this.availableModels) {
          if (model === this.currentModel) continue; // 跳過已經失敗的模型

          try {
            console.log(`🔄 API過載，嘗試降級到模型 ${model} 執行${context}`);
            const result = await operation(model);

            console.log(`✅ 降級模型 ${model} 執行${context}成功，暫時切換為主要模型`);
            this.currentModel = model; // 切換到成功的模型
            return result;
          } catch (fallbackError: any) {
            if (this.diagnosticMode) {
              console.log(`⚠️ 降級模型 ${model} 也失敗:`, fallbackError.message);
            }
            lastError = fallbackError;
            continue;
          }
        }
      }
    }

    // 所有模型都失敗了
    console.log(`❌ Gemini 2.5 Pro 和 2.5 Flash 都無法執行${context}`);
    throw lastError;
  }

  // 使用正確的 Resumable Upload 方法上傳音訊檔案到 Gemini
  async uploadFile(audioBlob: Blob, displayName: string): Promise<GeminiFileUploadResponse> {
    console.log('開始上傳檔案到 Gemini:', displayName, audioBlob.size, 'bytes');
    
    try {
      // 步驟 1: 開始 Resumable Upload
      const startResponse = await this.startResumableUpload(audioBlob, displayName);
      const uploadUrl = startResponse.uploadUrl;
      
      // 步驟 2: 上傳實際檔案數據
      const uploadResponse = await this.uploadFileData(uploadUrl, audioBlob);
      
      // 步驟 3: 等待檔案處理完成
      const fileResult = await this.waitForFileProcessing(uploadResponse);
      
      console.log('Gemini 檔案上傳並處理完成:', fileResult);
      return fileResult;
      
    } catch (error) {
      console.error('上傳到 Gemini 時發生錯誤:', error);
      throw error;
    }
  }

  // 開始 Resumable Upload
  private async startResumableUpload(audioBlob: Blob, displayName: string): Promise<{uploadUrl: string}> {
    const mimeType = audioBlob.type || 'audio/webm';
    const fileSize = audioBlob.size;
    
    const metadata = {
      file: {
        display_name: displayName
      }
    };

    console.log('開始 Resumable Upload 請求:');
    console.log('URL:', `${this.uploadURL}?key=${this.apiKey.substring(0, 10)}...`);
    console.log('檔案大小:', fileSize, 'bytes');
    console.log('MIME 類型:', mimeType);
    console.log('元數據:', metadata);

    try {
      const response = await fetch(`${this.uploadURL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      console.log('Resumable Upload 開始回應狀態:', response.status);
      console.log('回應標頭:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('開始 Resumable Upload 失敗:', response.status, response.statusText, errorText);
        throw new Error(`開始上傳失敗: ${response.status} ${response.statusText}\n詳細錯誤: ${errorText}`);
      }

      const uploadUrl = response.headers.get('X-Goog-Upload-URL');
      if (!uploadUrl) {
        console.error('回應標頭中缺少 X-Goog-Upload-URL');
        throw new Error('無法獲取上傳 URL');
      }

      console.log('獲得上傳 URL:', uploadUrl.substring(0, 50) + '...');
      return { uploadUrl };
      
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('網路連線錯誤:', error);
        throw new Error('無法連接到 Gemini API。請檢查網路連線和 API 金鑰是否正確。');
      }
      throw error;
    }
  }

  // 上傳檔案數據
  private async uploadFileData(uploadUrl: string, audioBlob: Blob): Promise<GeminiFileUploadResponse> {
    console.log('開始上傳檔案數據到:', uploadUrl.substring(0, 50) + '...');
    
    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Length': audioBlob.size.toString(),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: audioBlob
      });

      console.log('檔案數據上傳回應狀態:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('檔案數據上傳失敗:', response.status, response.statusText, errorText);
        throw new Error(`檔案上傳失敗: ${response.status} ${response.statusText}\n詳細錯誤: ${errorText}`);
      }

      const result = await response.json();
      console.log('檔案上傳結果:', result);
      return result.file || result;
      
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('檔案上傳網路連線錯誤:', error);
        throw new Error('檔案上傳時網路連線失敗。請檢查網路連線。');
      }
      throw error;
    }
  }

  // 等待檔案處理完成 (影片檔案需要更長時間)
  private async waitForFileProcessing(fileInfo: GeminiFileUploadResponse, maxAttempts: number = 180): Promise<GeminiFileUploadResponse> {
    let attempts = 0;
    
    console.log('檔案資訊:', fileInfo);
    console.log('檔案名稱:', fileInfo.name);
    
    while (attempts < maxAttempts) {
      // fileInfo.name 已經包含 "files/" 前綴，所以直接使用
      const checkUrl = `${this.baseURL}/${fileInfo.name}?key=${this.apiKey}`;
      console.log('檢查檔案狀態 URL:', checkUrl);
      
      const response = await fetch(checkUrl, {
        method: 'GET'
      });

      if (!response.ok) {
        if (response.status === 500) {
          throw new Error(`Google API 伺服器錯誤 (${response.status})。可能原因：檔案太大或格式不支援。建議嘗試較小的檔案或稍後重試。`);
        }
        throw new Error(`檢查檔案狀態失敗: ${response.status}`);
      }

      const fileStatus = await response.json();
      console.log('檔案處理狀態:', fileStatus.state);

      if (fileStatus.state === 'ACTIVE') {
        return fileStatus;
      } else if (fileStatus.state === 'FAILED') {
        throw new Error('檔案處理失敗');
      }

      // 等待 2 秒後再檢查
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error('檔案處理超時');
  }

  // 重試機制輔助函數 - 針對API過載問題進行優化，使用動態配置
  private async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries?: number, // 如不提供則使用設定值
    baseDelay?: number, // 如不提供則使用設定值
    jitterEnabled?: boolean // 如不提供則使用設定值
  ): Promise<T> {
    // 使用配置中的值或提供的參數
    const actualMaxRetries = maxRetries ?? this.retryConfig.maxRetries;
    const actualBaseDelay = baseDelay ?? this.retryConfig.baseDelay;
    const actualJitterEnabled = jitterEnabled ?? this.retryConfig.enableJitter;

    if (this.diagnosticMode) {
      console.log('🔄 開始重試機制:', {
        maxRetries: actualMaxRetries,
        baseDelay: actualBaseDelay,
        jitterEnabled: actualJitterEnabled
      });
    }
    let lastError: any;

    for (let attempt = 0; attempt <= actualMaxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // 檢查是否是 503 錯誤 - 改進處理邏輯
        if (error.message && error.message.includes('503')) {
          console.log(`🔄 API 過載 (503)，第 ${attempt + 1}/${actualMaxRetries + 1} 次嘗試失敗`);
          if (this.diagnosticMode) {
            console.log(`📊 錯誤詳情: ${error.message}`);
          }

          if (attempt < actualMaxRetries) {
            // 更保守的指數退避：30s, 60s, 120s, 300s, 600s
            let delay = actualBaseDelay * Math.pow(2, attempt);

            // 對503錯誤使用更長的延遲
            if (attempt >= 2) {
              delay = Math.max(delay, 120000); // 至少2分鐘
            }
            if (attempt >= 3) {
              delay = Math.max(delay, 300000); // 至少5分鐘
            }

            // 添加隨機抖動避免多個請求同時重試
            if (actualJitterEnabled) {
              const jitter = Math.random() * 0.3 * delay; // 0-30%的隨機變化
              delay = delay + jitter;
            }

            const delayMinutes = Math.round(delay/60000 * 10) / 10;
            console.log(`⏳ API持續過載，等待 ${delayMinutes} 分鐘後重試...`);
            console.log(`💡 建議: 如果問題持續，請稍後再試或檢查Google API狀態`);

            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // 檢查是否是 429 配額超出錯誤
        if (error.message && error.message.includes('429')) {
          console.log(`📈 API 配額超出 (429)，第 ${attempt + 1}/${actualMaxRetries + 1} 次嘗試失敗`);

          if (attempt < actualMaxRetries) {
            // 429錯誤需要更長的等待時間
            let delay = Math.max(actualBaseDelay * Math.pow(2, attempt), 60000); // 至少1分鐘

            if (actualJitterEnabled) {
              const jitter = Math.random() * 0.5 * delay; // 0-50%的隨機變化
              delay = delay + jitter;
            }

            const delayMinutes = Math.round(delay/60000 * 10) / 10;
            console.log(`⏱️ 配額限制，等待 ${delayMinutes} 分鐘後重試...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // 檢查是否是網路連線錯誤
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('网络'))) {
          console.log(`🌐 網路連線錯誤，第 ${attempt + 1}/${actualMaxRetries + 1} 次嘗試失敗`);

          if (attempt < actualMaxRetries) {
            const delay = Math.min(actualBaseDelay * Math.pow(1.5, attempt), 60000); // 網路錯誤用較短間隔
            console.log(`🔌 網路問題，等待 ${Math.round(delay/1000)} 秒後重試...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // 對於其他錯誤（4xx客戶端錯誤等）直接停止重試
        if (!error.message || (!error.message.includes('503') && !error.message.includes('429') && !error.message.includes('Failed to fetch'))) {
          if (this.diagnosticMode) {
            console.log(`❌ 遇到不可重試的錯誤: ${error.message}`);
          }
          throw lastError;
        }

        if (attempt >= actualMaxRetries) {
          console.log(`⛔ 已達到最大重試次數 (${actualMaxRetries + 1})，放棄請求`);
          throw lastError;
        }
      }
    }

    throw lastError;
  }

  private extractTextFromResponse(result: GeminiGenerateContentResponse, context: string): string {
    if (!result) {
      throw new Error(`Gemini ${context} 回傳為空`);
    }

    if (result.promptFeedback?.blockReason) {
      const ratings = result.promptFeedback.safetyRatings
        ?.map(rating => `${rating.category}:${rating.probability}`)
        .join(', ');
      const details = ratings ? `（安全等級：${ratings}）` : '';
      throw new Error(`Gemini ${context} 被安全性機制阻擋：${result.promptFeedback.blockReason}${details}`);
    }

    const candidates = result.candidates ?? [];
    if (!candidates.length) {
      throw new Error(`Gemini ${context} 回傳空的候選內容`);
    }

    const candidateWithText = candidates.find(candidate =>
      candidate?.content?.parts?.some(part => typeof part?.text === 'string' && part.text.trim().length > 0)
    );

    if (!candidateWithText) {
      const cappedCandidate = candidates.find(candidate => candidate.finishReason === 'MAX_TOKENS');
      if (cappedCandidate) {
        const promptTokens = result.usageMetadata?.promptTokenCount;
        const totalTokens = result.usageMetadata?.totalTokenCount;
        const details: string[] = [];
        if (typeof promptTokens === 'number') {
          details.push(`提示耗用 ${promptTokens} tokens`);
        }
        if (typeof totalTokens === 'number') {
          details.push(`總計 ${totalTokens} tokens`);
        }
        const detailText = details.length ? `（${details.join('，')}）` : '';
        throw new Error(`Gemini ${context} 輸出超過模型上限（finishReason=MAX_TOKENS）${detailText}，請縮短音訊長度或調整提示詞降低輸出需求。`);
      }

      const finishReasons = candidates
        .map(candidate => candidate.finishReason)
        .filter(Boolean)
        .join(', ') || '未知';

      console.warn(`Gemini ${context} 回應未包含文字內容:`, JSON.stringify(result, null, 2));
      throw new Error(`Gemini ${context} 回應未包含文字內容（finishReason: ${finishReasons}）`);
    }

    if (candidateWithText.finishReason && candidateWithText.finishReason !== 'STOP') {
      console.warn(`Gemini ${context} finishReason: ${candidateWithText.finishReason}`);
    }

    const textParts = candidateWithText.content?.parts
      ?.map(part => (typeof part?.text === 'string' ? part.text.trim() : ''))
      .filter(part => part.length > 0);

    if (!textParts || textParts.length === 0) {
      console.warn(`Gemini ${context} 候選內容不包含文字部分:`, JSON.stringify(candidateWithText, null, 2));
      throw new Error(`Gemini ${context} 回應的文字部分為空`);
    }

    return textParts.join('\n').trim();
  }

  // 生成轉錄內容 - 支援模型 Fallback
  async generateTranscription(
    fileUri: string,
    mimeType?: string,
    customPrompt?: string,
    vocabularyList?: any[],
    segmentContext?: {
      index: number;
      total: number;
      startTime: number;
      endTime: number;
    }
  ): Promise<string> {
    // 引入詞彙表服務
    const { VocabularyService } = await import('./vocabularyService');

    // 構建參與者名單提示
    let participantsPrompt = '';

    const defaultPrompt = DEFAULT_GEMINI_TRANSCRIPT_PROMPT;

    // 構建最終提示詞，包含詞彙表
    let finalPrompt = customPrompt || defaultPrompt;
    if (participantsPrompt) {
      finalPrompt += participantsPrompt;
    }

    // 如果有詞彙表，將其加入提示詞中
    if (vocabularyList && vocabularyList.length > 0) {
      const vocabularyPrompt = VocabularyService.formatVocabularyForPrompt(vocabularyList);
      finalPrompt = finalPrompt + vocabularyPrompt;
    }

    if (segmentContext && segmentContext.total > 1) {
      const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      };
      finalPrompt += `\n\n【重要】此音訊為整場會議的第 ${segmentContext.index + 1}/${segmentContext.total} 段，時間約 ${formatTime(segmentContext.startTime)} 至 ${formatTime(segmentContext.endTime)}。請延續同一份會議的說話人標記，不要重複前一段內容，也不要摘要其他段落。`;
    }

    const prompt = finalPrompt;

    // 使用 Fallback 機制執行轉錄
    return this.executeWithFallback(async (model: string) => {
      const generateUrl = `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                fileData: {
                  mimeType: mimeType || "audio/webm",
                  fileUri: fileUri
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
          responseMimeType: "text/plain"
        }
      };

      // 使用重試機制執行轉錄請求
      return this.retryWithExponentialBackoff(async () => {
        console.log(`向 Gemini 發送轉錄請求... (模型: ${model}, 檔案: ${fileUri})`);

        const response = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini 轉錄請求失敗 (模型: ${model}):`, response.status, errorText);
          throw new Error(`Gemini API 請求失敗: ${response.status}`);
        }

        const result: GeminiGenerateContentResponse = await response.json();
        console.log(`Gemini 轉錄回應 (模型: ${model}):`, result);

        const transcriptText = this.extractTextFromResponse(result, '轉錄');
        return transcriptText;
      });
    }, '轉錄');
  }

  // 使用 Gemini 對 Google STT 的結果進行逐字稿整稿與格式化
  async cleanupTranscript(transcriptText: string, customPrompt?: string): Promise<string> {
    const basePrompt = customPrompt && customPrompt.trim().length > 0
      ? customPrompt
      : DEFAULT_TRANSCRIPT_CLEANUP_PROMPT;

    const fullPrompt = `${basePrompt}\n\n原始逐字稿：\n${transcriptText}`;

    const rawOutput = await this.executeWithFallback(async (model: string) => {
      const generateUrl = `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: fullPrompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 8192,
          responseMimeType: 'text/plain'
        }
      };

      return this.retryWithExponentialBackoff(async () => {
        console.log(`向 Gemini 發送逐字稿修正請求... (模型: ${model})`);

        const response = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini 逐字稿修正請求失敗 (模型: ${model}):`, response.status, errorText);
          throw new Error(`Gemini API 請求失敗: ${response.status}`);
        }

        const result: GeminiGenerateContentResponse = await response.json();
        console.log(`Gemini 逐字稿修正回應 (模型: ${model}):`, result);

        const cleanedText = this.extractTextFromResponse(result, '逐字稿修正');
        return cleanedText;
      });
    }, '逐字稿修正');

    return this.stripPreformattedBlock(rawOutput);
  }

  // 生成自訂摘要 - 支援模型 Fallback
  async generateCustomSummary(transcriptText: string, customPrompt: string): Promise<string> {
    const fullPrompt = `以下是會議的轉錄內容：

${transcriptText}

請根據以下要求處理這個轉錄內容：

${customPrompt}`;

    // 使用 Fallback 機制執行自訂摘要
    return this.executeWithFallback(async (model: string) => {
      const generateUrl = `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: fullPrompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
          responseMimeType: "text/plain"
        }
      };

      // 使用重試機制執行自訂摘要請求
      return this.retryWithExponentialBackoff(async () => {
        console.log(`向 Gemini 發送自訂摘要請求... (模型: ${model})`);

        const response = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini 自訂摘要請求失敗 (模型: ${model}):`, response.status, errorText);
          throw new Error(`Gemini API 請求失敗: ${response.status}`);
        }

        const result: GeminiGenerateContentResponse = await response.json();
        console.log(`Gemini 自訂摘要回應 (模型: ${model}):`, result);

        const summaryText = this.extractTextFromResponse(result, '自訂摘要');
        return summaryText;
      });
    }, '自訂摘要');
  }

  async generateStructuredSummaryFromTranscript(transcriptText: string, customPrompt?: string) {
    const defaultPrompt = `請閱讀以下會議逐字稿，並以 Markdown 產出結構化的會議摘要。格式與標記必須嚴格遵守；若某區段沒有內容請輸出「- 無」。

# 會議摘要
## 概要
- 用 4–8 句完整句子總結重點，避免過長。

## 主要重點
- 每條「行首必須是且僅能是」下列三種之一："[高] ", "[中] ", "[低] "（半形方括號＋一個空格），禁止使用其他括號或符號。
- 依影響面與緊迫性自行判斷高/中/低；無法判定時用「[中]」。
- 至少 6 條，以「高 → 中 → 低」排序；內容避免重複與贅字。

## 決議與結論
- 精煉列點，描述清楚，不要太長。

## 待辦事項
- 每條包含：事項、負責人、期限、狀態（待處理/進行中/完成）。
- 推薦格式："事項：…｜負責人：…｜期限：MM/DD｜狀態：進行中"（請使用半形直線｜作為分隔）。

## 其他備註
- 其他重要補充。

注意事項：
- 僅輸出上述 Markdown，不要輸出 JSON 或額外說明。
- 分節標題必須為「概要／主要重點／決議與結論／待辦事項／其他備註」。`;

    const fullPrompt = `${customPrompt || defaultPrompt}

逐字稿內容：
${transcriptText}`;

    return this.executeWithFallback(async (model: string) => {
      const generateUrl = `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: fullPrompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 4096,
          responseMimeType: 'text/plain'
        }
      };

      const markdownSummary = await this.retryWithExponentialBackoff(async () => {
        console.log(`向 Gemini 請求 Markdown 摘要... (模型: ${model})`);
        const response = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini 文字摘要請求失敗 (模型: ${model}):`, response.status, errorText);
          throw new Error(`Gemini API 請求失敗: ${response.status}`);
        }

        const result: GeminiGenerateContentResponse = await response.json();
        console.log(`Gemini Markdown 摘要回應 (模型: ${model}):`, result);

        return this.extractTextFromResponse(result, '摘要');
      });
      const minutesMd = markdownSummary.trim();

      const overviewMatch = minutesMd.match(/##\s*概要\s*\n([\s\S]*?)(\n##|$)/);
      const overallSummary = overviewMatch ? overviewMatch[1].replace(/^-\s*/gm, '').trim() : minutesMd.split('\n').slice(0, 5).join(' ').trim();

      return {
        overallSummary,
        highlights: [],
        keyDecisions: [],
        actionItems: [],
        timeline: [],
        todos: [],
        bySpeaker: [],
        minutesMd
      };
    }, '摘要');
  }

  // 產生「標題式大綱 + 時間軸」：
  // 輸入為已整理的逐字稿分段（含數字秒數 start/end 與文字 text），輸出嚴格 JSON 陣列：
  // [{ "time": "MM:SS", "item": "段落標題", "desc": "一句話摘要" }, ...]
  async generateTimelineOutline(segments: Array<{ start: number | string; end?: number | string; text: string }>) {
    // 將分段壓縮為帶時間標記的純文字，避免超長
    const toTs = (v?: number | string) => {
      if (typeof v === 'number') {
        const mm = Math.floor(v / 60);
        const ss = Math.floor(v % 60);
        return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      }
      if (!v) return '00:00';
      return String(v);
    };
    const MAX_ITEMS = 180; // 安全上限
    const slim = segments.slice(0, MAX_ITEMS).map(s => `[${toTs(s.start)}] ${s.text?.slice(0, 240)}`);

    const prompt = `你是一個專業的逐字稿編輯。請根據帶時間標記的分段資料，產生「可點擊的時間軸」標題式大綱。

嚴格輸出規格（務必遵守）：
- 僅輸出一個 JSON 陣列，且陣列長度 6–12。
- 陣列每個元素為物件，必含欄位：
  {"time":"MM:SS","item":"標題","desc":"一句話摘要"}
- time 必須是 MM:SS（取該節點對應段落的起始時間）。不得輸出文字、括號、中文字串，亦不得缺欄位。
- item 與 desc 為純文字，不得含 Markdown、HTML、換行或多餘符號。
- 嚴禁在 JSON 之外輸出任何說明文字或標點。

參考分段（[MM:SS] 文字，最多 ${MAX_ITEMS} 行）：\n${slim.join('\n')}`;

    return this.executeWithFallback(async (model: string) => {
      const generateUrl = `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`;
      const requestBody = {
        contents: [
          { parts: [{ text: prompt }] }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      };

      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini 時間軸請求失敗: ${response.status} ${errorText}`);
      }
      const result = await response.json();
      const text = this.extractTextFromResponse(result, '時間軸');
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) return arr;
      } catch {}
      // 後備：嘗試在文字中擷取第一個 JSON 陣列
      const m = text.match(/\[[\s\S]*\]/);
      if (m) {
        try { const arr = JSON.parse(m[0]); if (Array.isArray(arr)) return arr; } catch {}
      }
      return [];
    }, '時間軸');
  }

  private stripPreformattedBlock(text: string): string {
    if (!text) {
      return '';
    }

    const match = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    const content = match ? match[1] : text;

    const unescaped = content
      .replace(/<br\s*\/?\>/gi, '\n')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    const withoutCodeFence = unescaped
      .replace(/^```[a-z0-9]*\s*/i, '')
      .replace(/```$/i, '');

    return withoutCodeFence.trim();
  }

  // 解析 Gemini 回應（支援 JSON 和純文字格式）
  parseTranscriptionResult(responseText: string) {
    const strippedResponse = this.stripPreformattedBlock(responseText);
    const sanitizedForJson = strippedResponse
      .replace(/^```(?:json|html)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      // 嘗試解析為 JSON（向後相容性）
      const parsed = JSON.parse(sanitizedForJson);

      return {
        transcript: {
          segments: parsed.transcript?.segments || [],
          fullText:
            parsed.transcript?.fullText ||
            parsed.transcript?.segments?.map((s: any) => s.text).join('\n') ||
            strippedResponse,
          corrections: parsed.transcript?.corrections || []
        },
        summary: {
          highlights: parsed.summary?.highlights || [],
          keyDecisions: parsed.summary?.key_decisions || [],
          actionItems: parsed.summary?.action_items || [],
          overallSummary: parsed.summary?.overall_summary || '',
          minutesMd: this.generateMarkdownSummary(parsed)
        }
      };
    } catch (error) {
      // JSON 解析失敗，當作純文字處理
      console.log('處理純文字格式轉錄結果');

      // 處理純文字格式，正確解析換行
      let cleanText = sanitizedForJson || strippedResponse.trim();

      // 將 \n 轉換為實際換行，並清理格式
      cleanText = cleanText
        .replace(/\\n/g, '\n')  // 處理轉義的換行符
        .replace(/\n\s*\n/g, '\n\n')  // 清理多餘空行
        .replace(/\n/g, '\n\n');  // 確保段落間有空行

      return {
        transcript: {
          segments: [],
          fullText: cleanText,
          corrections: []
        },
        summary: {
          highlights: [],
          keyDecisions: [],
          actionItems: [],
          overallSummary: '',
          minutesMd: '' // 純文字模式下不提供摘要，需要透過自訂摘要功能生成
        }
      };
    }
  }

  // 生成 Markdown 格式的會議記錄
  private generateMarkdownSummary(parsed: any): string {
    let markdown = '# 會議記錄\n\n';
    
    if (parsed.summary?.overall_summary) {
      markdown += '## 會議摘要\n';
      markdown += `${parsed.summary.overall_summary}\n\n`;
    }
    
    if (parsed.summary?.highlights && parsed.summary.highlights.length > 0) {
      markdown += '## 重點摘要\n';
      parsed.summary.highlights.forEach((highlight: string, index: number) => {
        markdown += `${index + 1}. ${highlight}\n`;
      });
      markdown += '\n';
    }
    
    if (parsed.summary?.key_decisions && parsed.summary.key_decisions.length > 0) {
      markdown += '## 重要決議\n';
      parsed.summary.key_decisions.forEach((decision: string, index: number) => {
        markdown += `${index + 1}. ${decision}\n`;
      });
      markdown += '\n';
    }
    
    if (parsed.summary?.action_items && parsed.summary.action_items.length > 0) {
      markdown += '## 待辦事項\n';
      parsed.summary.action_items.forEach((item: string, index: number) => {
        markdown += `- [ ] ${item}\n`;
      });
      markdown += '\n';
    }
    
    return markdown;
  }
}

export { GeminiAPIClient };
export type { GeminiFileUploadResponse, GeminiGenerateContentResponse };
