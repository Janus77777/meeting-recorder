import { AppSettings } from '@shared/types';

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

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // 測試 API 連接（帶重試機制）
  async testConnection(): Promise<boolean> {
    const maxRetries = 3;
    const baseDelay = 10000; // 10秒 - 避免過於頻繁的請求

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 測試 Gemini API 連接... (第 ${attempt}/${maxRetries} 次嘗試)`);
        
        const testUrl = `${this.baseURL}/models/gemini-2.5-pro:generateContent?key=${this.apiKey}`;
        
        const testResponse = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "Hello, just testing connection"
              }]
            }]
          })
        });

        console.log(`📡 API 連接測試回應狀態: ${testResponse.status} (嘗試 ${attempt})`);
        
        if (testResponse.ok) {
          console.log('✅ API 連接測試成功');
          return true;
        } else if (testResponse.status === 503) {
          // 503 服務過載 - 需要重試
          const errorText = await testResponse.text();
          console.log(`⏳ API 服務過載 (503)，第 ${attempt}/${maxRetries} 次嘗試失敗`);
          
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1); // 指數退避：10s, 20s, 40s
            console.log(`⏱️ 等待 ${Math.round(delay/1000)}秒後重試...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            console.error('❌ API 服務持續過載，請稍後再試');
            return false;
          }
        } else {
          // 其他錯誤不重試
          const errorText = await testResponse.text();
          console.error('❌ API 連接測試失敗:', testResponse.status, errorText);
          return false;
        }
        
      } catch (error) {
        console.error(`❌ API 連接測試錯誤 (嘗試 ${attempt}):`, error);
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏱️ 網路錯誤，等待 ${Math.round(delay/1000)}秒後重試...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          return false;
        }
      }
    }

    return false;
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

  // 等待檔案處理完成
  private async waitForFileProcessing(fileInfo: GeminiFileUploadResponse, maxAttempts: number = 10): Promise<GeminiFileUploadResponse> {
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

  // 重試機制輔助函數
  private async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>, 
    maxRetries: number = 3, 
    baseDelay: number = 15000 // 15秒 - 轉錄請求需要更長間隔
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // 檢查是否是 503 錯誤
        if (error.message && error.message.includes('503')) {
          console.log(`API 過載 (503)，第 ${attempt + 1}/${maxRetries + 1} 次嘗試失敗`);
          
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt); // 指數退避：15s, 30s, 60s
            console.log(`等待 ${Math.round(delay/1000)}秒後重試...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // 檢查是否是 429 配額超出錯誤
        if (error.message && error.message.includes('429')) {
          console.log(`API 配額超出 (429)，第 ${attempt + 1}/${maxRetries + 1} 次嘗試失敗`);
          
          if (attempt < maxRetries) {
            const delay = Math.max(baseDelay * Math.pow(2, attempt), 40000); // 至少等待40秒
            console.log(`配額限制，等待 ${Math.round(delay/1000)}秒後重試...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // 對於非 503/429 錯誤直接停止重試
        if (!error.message || (!error.message.includes('503') && !error.message.includes('429'))) {
          throw lastError;
        }

        if (attempt >= maxRetries) {
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

  // 生成轉錄內容
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
    const generateUrl = `${this.baseURL}/models/gemini-2.5-pro:generateContent?key=${this.apiKey}`;

    // 引入詞彙表服務
    const { VocabularyService } = await import('./vocabularyService');

    // 構建參與者名單提示
    let participantsPrompt = '';

    const defaultPrompt = `請使用 Google Cloud Speech-to-Text v2 的 USM（Chirp/Chirp 2）模型對本音訊做語音轉文字，啟用說話者分段（speaker diarization）與字詞級時間戳（word time offsets）；僅輸出一個 <pre> 區塊，不要任何前後解說或 JSON。

輸出規格：
1. 第 1 行輸出「# Legend: 」後接目前可判斷的映射（例：Speaker 1=阿明, Speaker 2=小美）。
2. 其後每段對話一行，格式：「[姓名|Speaker N]: 文字」。
3. 姓名推斷規則：
   - 遇到「自我介紹」語句（如「我是/我叫/我的名字是/This is/I'm + 名字」）時，將當前 Speaker N 映射為該姓名。
   - 若對話出現點名呼喚（如「阿明你看…」）且緊接的回覆為第一人稱陳述，將該回覆的 Speaker N 映射為被呼喚的姓名。
   - 持續沿用已建立的映射，除非出現明確更正（如「不是我，是小美說的」）。
   - 若同名多位，請使用「姓名(1)、姓名(2)」區分。
   - 若信心不足，輸出「Speaker N (可能是姓名)」。
   - 不得憑空創造未在音訊中明示或可合理推斷的姓名；若無線索則保留「Speaker N」。
4. 長句請在語義自然處換行為多段行輸出避免過長。${participantsPrompt}

必要設定（由系統/連接器帶入即可）：
- model=chirp 或 chirp_2
- enable_speaker_diarization=true
- enable_word_time_offsets=true
- language=zh-TW
- min_speaker_count=1
- max_speaker_count=8`;

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
      console.log('向 Gemini 發送轉錄請求...', fileUri);
      
      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini 轉錄請求失敗:', response.status, errorText);
        throw new Error(`Gemini API 請求失敗: ${response.status}`);
      }

      const result: GeminiGenerateContentResponse = await response.json();
      console.log('Gemini 轉錄回應:', result);

      const transcriptText = this.extractTextFromResponse(result, '轉錄');
      return transcriptText;
    });
  }

  // 生成自訂摘要
  async generateCustomSummary(transcriptText: string, customPrompt: string): Promise<string> {
    const generateUrl = `${this.baseURL}/models/gemini-2.5-pro:generateContent?key=${this.apiKey}`;
    
    const fullPrompt = `以下是會議的轉錄內容：

${transcriptText}

請根據以下要求處理這個轉錄內容：

${customPrompt}`;

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
      console.log('向 Gemini 發送自訂摘要請求...');
      
      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini 自訂摘要請求失敗:', response.status, errorText);
        throw new Error(`Gemini API 請求失敗: ${response.status}`);
      }

      const result: GeminiGenerateContentResponse = await response.json();
      console.log('Gemini 自訂摘要回應:', result);

      const summaryText = this.extractTextFromResponse(result, '自訂摘要');
      return summaryText;
    });
  }

  // 解析 Gemini 回應（支援 JSON 和純文字格式）
  parseTranscriptionResult(responseText: string) {
    try {
      // 嘗試解析為 JSON（向後相容性）
      const parsed = JSON.parse(responseText);

      return {
        transcript: {
          segments: parsed.transcript?.segments || [],
          fullText: parsed.transcript?.fullText || parsed.transcript?.segments?.map((s: any) => s.text).join('\n') || '',
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
      let cleanText = responseText.trim();

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
          minutesMd: `# 會議記錄\n\n${cleanText}`
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
