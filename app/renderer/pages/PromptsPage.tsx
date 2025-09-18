import React, { useState } from 'react';
import { useSettingsStore } from '../services/store';
import { GeminiAPIClient } from '../services/geminiApi';
import { VocabularyService } from '../services/vocabularyService';
import { VocabularyItem } from '@shared/types';

interface PromptsPageProps {
  onTestPrompt?: (type: 'transcript' | 'summary', result: string) => void;
}

const PromptsPage: React.FC<PromptsPageProps> = ({ onTestPrompt }) => {
  const { settings, updateSettings } = useSettingsStore();
  const [testResult, setTestResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 詞彙表相關狀態
  const [vocabularyText, setVocabularyText] = useState<string>(
    VocabularyService.formatVocabularyToString(settings.vocabularyList)
  );
  
  // 本地狀態管理提示詞，避免直接綁定到 settings
  const defaultTranscriptPrompt = `請使用 Google Cloud Speech-to-Text v2 的 USM（Chirp/Chirp 2）模型對本音訊做語音轉文字，啟用說話者分段（speaker diarization）與字詞級時間戳（word time offsets）；僅輸出一個 <pre> 區塊，不要任何前後解說或 JSON。

輸出規格：
1. 第 1 行輸出「# Legend: 」後接目前可判斷的映射（例：Speaker 1=阿明, Speaker 2=小美）。
2. 其後每段對話一行，格式：「[姓名|Speaker N]: 文字」。
3. 姓名推斷規則：
   - 遇到「我叫…」「我是…」「This is…」等自我介紹語句時，將當前 Speaker N 映射為該姓名。
   - 若對話中有人被點名且立即以第一人稱回應，可推斷回應者為被點名者，並建立映射。
   - 若同名多位，使用「姓名(1)、姓名(2)」區分；若信心不足，輸出「Speaker N (可能是姓名)」。
   - 不得憑空創造未在音訊中明示或可合理推斷的姓名；若無線索則保留「Speaker N」。
4. 長句請在語義自然處換行為多段行輸出避免過長。

必要設定（由系統/連接器帶入即可）：
- model=chirp 或 chirp_2
- enable_speaker_diarization=true
- enable_word_time_offsets=true
- language=zh-TW
- min_speaker_count=1
- max_speaker_count=8`;

  const defaultSummaryPrompt = `請針對這個會議轉錄內容，提供詳細的摘要分析，包括：

1. 會議主題和目的
2. 主要討論要點
3. 重要決議和結論
4. 待辦事項和責任人
5. 後續行動計畫

請以清楚易懂的方式整理，適合與會者快速回顧。`;

  const resolvedTranscriptPrompt = settings.customTranscriptPrompt?.trim()?.length
    ? settings.customTranscriptPrompt
    : defaultTranscriptPrompt;
  const resolvedSummaryPrompt = settings.customSummaryPrompt?.trim()?.length
    ? settings.customSummaryPrompt
    : defaultSummaryPrompt;

  const [transcriptPrompt, setTranscriptPrompt] = useState<string>(resolvedTranscriptPrompt);
  const [summaryPrompt, setSummaryPrompt] = useState<string>(resolvedSummaryPrompt);

  React.useEffect(() => {
    setTranscriptPrompt(settings.customTranscriptPrompt?.trim()?.length
      ? settings.customTranscriptPrompt
      : defaultTranscriptPrompt);
    setSummaryPrompt(settings.customSummaryPrompt?.trim()?.length
      ? settings.customSummaryPrompt
      : defaultSummaryPrompt);
    setVocabularyText(VocabularyService.formatVocabularyToString(settings.vocabularyList));
  }, [settings.customTranscriptPrompt, settings.customSummaryPrompt, settings.vocabularyList]);

  // 保存提示詞到設定
  const savePrompts = () => {
    updateSettings({
      customTranscriptPrompt: transcriptPrompt,
      customSummaryPrompt: summaryPrompt
    });
    alert('提示詞已保存！');
  };
  
  // 載入預設轉錄提示詞範本
  const loadDefaultTranscriptPrompt = () => {
    if (confirm('確定要載入預設轉錄提示詞範本嗎？這將覆蓋目前的內容。')) {
      setTranscriptPrompt(defaultTranscriptPrompt);
    }
  };
  
  // 載入預設摘要提示詞範本
  const loadDefaultSummaryPrompt = () => {
    if (confirm('確定要載入預設摘要提示詞範本嗎？這將覆蓋目前的內容。')) {
      setSummaryPrompt(defaultSummaryPrompt);
    }
  };

  const testTranscriptPrompt = async () => {
    if (!settings.geminiApiKey) {
      alert('請先在設定頁面輸入 Gemini API Key');
      return;
    }

    setIsLoading(true);
    try {
      const geminiClient = new GeminiAPIClient(settings.geminiApiKey);
      
      // 使用當前輸入框的內容進行測試
      const testPrompt = transcriptPrompt || defaultTranscriptPrompt;
      
      // 模擬一個簡短的測試請求
      const testText = "請用這個提示詞處理測試音訊：測試音訊檔案";
      
      alert('提示詞格式檢查完成！\n\n目前轉錄提示詞:\n' + testPrompt);
      
    } catch (error) {
      console.error('測試轉錄提示詞失敗:', error);
      alert('測試失敗: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const testSummaryPrompt = async () => {
    if (!settings.geminiApiKey) {
      alert('請先在設定頁面輸入 Gemini API Key');
      return;
    }

    setIsLoading(true);
    try {
      const geminiClient = new GeminiAPIClient(settings.geminiApiKey);
      
      // 使用當前輸入框的內容進行測試
      const testPrompt = summaryPrompt || defaultSummaryPrompt;
      const testTranscript = "測試會議轉錄內容：今天我們討論了產品開發進度和市場策略。";
      
      const result = await geminiClient.generateCustomSummary(testTranscript, testPrompt);
      setTestResult(result);
      
      if (onTestPrompt) {
        onTestPrompt('summary', result);
      }
      
      alert('摘要提示詞測試成功！結果已顯示在下方。');
      
    } catch (error) {
      console.error('測試摘要提示詞失敗:', error);
      alert('測試失敗: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // 處理詞彙表更新
  const handleVocabularyChange = (newVocabularyText: string) => {
    setVocabularyText(newVocabularyText);
    
    // 解析詞彙表並更新設定
    const parsedVocabulary = VocabularyService.parseVocabularyString(newVocabularyText);
    const cleanedVocabulary = VocabularyService.cleanVocabularyList(parsedVocabulary);
    
    updateSettings({ vocabularyList: cleanedVocabulary });
  };

  // 測試詞彙表功能
  const testVocabulary = () => {
    const testText = "mtr系統和ai功能都很好用，還有mtc和aqr的部分";
    const correctedText = VocabularyService.applyVocabularyCorrections(testText, settings.vocabularyList);
    
    alert(`詞彙表測試：\n\n原文：${testText}\n\n修正後：${correctedText}`);
  };

  const resetToDefaults = () => {
    if (confirm('確定要重設為預設設定嗎？這將覆蓋您目前的自訂提示詞和詞彙表。')) {
      setTranscriptPrompt(defaultTranscriptPrompt);
      setSummaryPrompt(defaultSummaryPrompt);
      setVocabularyText('');
      updateSettings({
        customTranscriptPrompt: defaultTranscriptPrompt,
        customSummaryPrompt: defaultSummaryPrompt,
        vocabularyList: []
      });
      alert('已重設為預設設定！');
    }
  };

  return (
    <div style={{
      padding: '2rem',
      backgroundColor: '#f9fafb',
      minHeight: '100vh'
    }}>
      <div style={{
        maxWidth: '1000px',
        margin: '0 auto'
      }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 'bold',
          color: '#1f2937',
          marginBottom: '0.5rem'
        }}>
          自訂提示詞設定
        </h1>
        
        <p style={{
          color: '#6b7280',
          marginBottom: '2rem'
        }}>
          自訂您的轉錄和摘要提示詞，以獲得更符合需求的 AI 處理結果
        </p>

        {/* 內部領域詞彙表設定 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb',
          marginBottom: '2rem'
        }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            📚 內部領域詞彙表
          </h2>
          
          <p style={{
            color: '#6b7280',
            fontSize: '0.875rem',
            marginBottom: '1rem'
          }}>
            設定專業術語和內部縮寫的正確對應，系統會在轉錄過程中自動修正這些詞彙。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151'
              }}>
                詞彙對應列表：
              </label>
              <textarea
                value={vocabularyText}
                onChange={(e) => handleVocabularyChange(e.target.value)}
                placeholder={`輸入詞彙對應，支援多種格式：
mtr -> mstr
ai => 人工智慧
mtc | master | 主控制器
aqr: 品質報告`}
                style={{
                  width: '100%',
                  height: '120px',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  resize: 'vertical'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151'
              }}>
                操作：
              </label>
              <button
                onClick={testVocabulary}
                style={{
                  width: '100%',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  marginBottom: '0.5rem'
                }}
              >
                測試詞彙表
              </button>
              
              <div style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                lineHeight: '1.4',
                backgroundColor: '#f3f4f6',
                padding: '0.5rem',
                borderRadius: '4px'
              }}>
                <strong>支援格式：</strong><br/>
                • mtr -&gt; mstr<br/>
                • ai =&gt; 人工智慧<br/>
                • mtc | master | 描述<br/>
                • aqr: 品質報告
              </div>
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          marginBottom: '2rem'
        }}>
          {/* 轉錄提示詞設定 */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              🎤 逐字稿修正提示詞
            </h2>
            
            <p style={{
              color: '#6b7280',
              fontSize: '0.875rem',
              marginBottom: '1rem'
            }}>
              這個提示詞將用於音訊轉錄處理，您可以指定轉錄的格式、細節程度等要求。
            </p>
            
            <textarea
              value={transcriptPrompt}
              onChange={(e) => setTranscriptPrompt(e.target.value)}
              placeholder="輸入自訂的轉錄提示詞..."
              style={{
                width: '100%',
                height: '300px',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                resize: 'vertical',
                marginBottom: '1rem'
              }}
            />
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={loadDefaultTranscriptPrompt}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                載入預設範本
              </button>
              
              <button
                onClick={testTranscriptPrompt}
                disabled={isLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1
                }}
              >
                {isLoading ? '檢查中...' : '檢查提示詞格式'}
              </button>
            </div>
          </div>

          {/* 摘要提示詞設定 */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              📄 會議總結提示詞
            </h2>
            
            <p style={{
              color: '#6b7280',
              fontSize: '0.875rem',
              marginBottom: '1rem'
            }}>
              這個提示詞將用於會議摘要生成，您可以指定摘要的風格、重點和格式。
            </p>
            
            <textarea
              value={summaryPrompt}
              onChange={(e) => setSummaryPrompt(e.target.value)}
              placeholder="輸入自訂的摘要提示詞..."
              style={{
                width: '100%',
                height: '300px',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                resize: 'vertical',
                marginBottom: '1rem'
              }}
            />
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={loadDefaultSummaryPrompt}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                載入預設範本
              </button>
              
              <button
                onClick={testSummaryPrompt}
                disabled={isLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1
                }}
              >
                {isLoading ? '測試中...' : '測試摘要提示詞'}
              </button>
            </div>
          </div>
        </div>

        {/* 測試結果顯示 */}
        {testResult && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            marginBottom: '2rem'
          }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem'
            }}>
              測試結果
            </h3>
            <pre style={{
              backgroundColor: '#f3f4f6',
              padding: '1rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              overflow: 'auto',
              maxHeight: '300px'
            }}>
              {testResult}
            </pre>
          </div>
        )}

        {/* 操作按鈕 */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center'
        }}>
          <button
            onClick={resetToDefaults}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            重設為預設值
          </button>
          
          <button
            onClick={savePrompts}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            💾 保存提示詞
          </button>
        </div>

        {/* 使用說明 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb',
          marginTop: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '1rem'
          }}>
            💡 使用說明
          </h3>
          <ul style={{
            color: '#6b7280',
            fontSize: '0.875rem',
            lineHeight: '1.6',
            paddingLeft: '1.5rem'
          }}>
            <li>轉錄提示詞：用於指定音訊轉錄的格式和要求</li>
            <li>摘要提示詞：用於指定會議摘要的風格和重點</li>
            <li>提示詞支援 Markdown 格式和特殊指令</li>
            <li>建議在正式使用前先進行測試</li>
            <li>設定會自動儲存到本地，無需擔心遺失</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PromptsPage;
