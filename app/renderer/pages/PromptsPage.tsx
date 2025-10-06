import React, { useState } from 'react';
import { useSettingsStore } from '../services/store';
import { VocabularyService } from '../services/vocabularyService';
import {
  DEFAULT_GEMINI_TRANSCRIPT_PROMPT,
  DEFAULT_TRANSCRIPT_CLEANUP_PROMPT,
  DEFAULT_SUMMARY_PROMPT
} from '@shared/defaultPrompts';

const PromptsPage: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  
  // 詞彙表相關狀態
  const [vocabularyText, setVocabularyText] = useState<string>(
    VocabularyService.formatVocabularyToString(settings.vocabularyList)
  );
  
  // 本地狀態管理提示詞，避免直接綁定到 settings
  const defaultTranscriptPrompt = DEFAULT_GEMINI_TRANSCRIPT_PROMPT;
  const defaultTranscriptCleanupPrompt = DEFAULT_TRANSCRIPT_CLEANUP_PROMPT;
  const defaultSummaryPrompt = DEFAULT_SUMMARY_PROMPT;

  const resolvedTranscriptPrompt = settings.customTranscriptPrompt?.trim()?.length
    ? settings.customTranscriptPrompt
    : defaultTranscriptPrompt;
  const resolvedTranscriptCleanupPrompt = settings.customTranscriptCleanupPrompt?.trim()?.length
    ? settings.customTranscriptCleanupPrompt
    : defaultTranscriptCleanupPrompt;
  const resolvedSummaryPrompt = settings.customSummaryPrompt?.trim()?.length
    ? settings.customSummaryPrompt
    : defaultSummaryPrompt;

  const [transcriptPrompt, setTranscriptPrompt] = useState<string>(resolvedTranscriptPrompt);
  const [transcriptCleanupPrompt, setTranscriptCleanupPrompt] = useState<string>(resolvedTranscriptCleanupPrompt);
  const [summaryPrompt, setSummaryPrompt] = useState<string>(resolvedSummaryPrompt);

  React.useEffect(() => {
    setTranscriptPrompt(settings.customTranscriptPrompt?.trim()?.length
      ? settings.customTranscriptPrompt
      : defaultTranscriptPrompt);
    setTranscriptCleanupPrompt(settings.customTranscriptCleanupPrompt?.trim()?.length
      ? settings.customTranscriptCleanupPrompt
      : defaultTranscriptCleanupPrompt);
    setSummaryPrompt(settings.customSummaryPrompt?.trim()?.length
      ? settings.customSummaryPrompt
      : defaultSummaryPrompt);
    setVocabularyText(VocabularyService.formatVocabularyToString(settings.vocabularyList));
  }, [
    settings.customTranscriptPrompt,
    settings.customTranscriptCleanupPrompt,
    settings.customSummaryPrompt,
    settings.vocabularyList
  ]);

  // 保存所有內容（提示詞 + 詞彙表）
  const saveAll = () => {
    const parsedVocabulary = VocabularyService.parseVocabularyString(vocabularyText);
    const cleanedVocabulary = VocabularyService.cleanVocabularyList(parsedVocabulary);
    updateSettings({
      customTranscriptPrompt: transcriptPrompt,
      customTranscriptCleanupPrompt: transcriptCleanupPrompt,
      customSummaryPrompt: summaryPrompt,
      vocabularyList: cleanedVocabulary
    });
    alert('設定已保存！');
  };
  
  // 載入預設轉錄提示詞範本
  const loadDefaultTranscriptPrompt = () => {
    if (confirm('確定要載入預設轉錄提示詞範本嗎？這將覆蓋目前的內容。')) {
      setTranscriptPrompt(defaultTranscriptPrompt);
    }
  };

  const loadDefaultTranscriptCleanupPrompt = () => {
    if (confirm('確定要載入預設逐字稿修正提示詞範本嗎？這將覆蓋目前的內容。')) {
      setTranscriptCleanupPrompt(defaultTranscriptCleanupPrompt);
    }
  };
  
  // 載入預設摘要提示詞範本
  const loadDefaultSummaryPrompt = () => {
    if (confirm('確定要載入預設摘要提示詞範本嗎？這將覆蓋目前的內容。')) {
      setSummaryPrompt(defaultSummaryPrompt);
    }
  };

  // 測試/檢查提示詞按鈕已移除，簡化操作

  

  

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

  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'cleanup' | 'vocab'>('summary');

  const TabButton: React.FC<{id: typeof activeTab; label: string}> = ({ id, label }) => (
    <button type="button" className={`pill ${activeTab === id ? 'is-active' : ''}`} onClick={() => setActiveTab(id)}>
      {label}
    </button>
  );

  return (
    <div className="page page--prompts" style={{ gap: 16, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <header style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="pill-group">
          <TabButton id="summary" label="摘要" />
          <TabButton id="transcript" label="轉錄" />
          <TabButton id="cleanup" label="逐字稿修正" />
          <TabButton id="vocab" label="詞彙表" />
        </div>
      </header>

      <section className="card-modern" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeTab === 'summary' && (
          <>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>會議總結提示詞</h2>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={summaryPrompt}
                onChange={(e) => setSummaryPrompt(e.target.value)}
                placeholder="輸入自訂的摘要提示詞..."
                style={{ width: '100%', height: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.875rem', fontFamily: 'monospace', resize: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={loadDefaultSummaryPrompt} className="btn btn--surface">載入預設範本</button>
              <button onClick={saveAll} className="btn btn--primary">保存</button>
            </div>
          </>
        )}

        {activeTab === 'transcript' && (
          <>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Gemini 直接轉錄提示詞</h2>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={transcriptPrompt}
                onChange={(e) => setTranscriptPrompt(e.target.value)}
                placeholder="輸入自訂的轉錄提示詞..."
                style={{ width: '100%', height: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.875rem', fontFamily: 'monospace', resize: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={loadDefaultTranscriptPrompt} className="btn btn--surface">載入預設範本</button>
              <button onClick={saveAll} className="btn btn--primary">保存</button>
            </div>
          </>
        )}

        {activeTab === 'cleanup' && (
          <>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>逐字稿修正提示詞（Google STT）</h2>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={transcriptCleanupPrompt}
                onChange={(e) => setTranscriptCleanupPrompt(e.target.value)}
                placeholder="輸入自訂的逐字稿修正提示詞..."
                style={{ width: '100%', height: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.875rem', fontFamily: 'monospace', resize: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={loadDefaultTranscriptCleanupPrompt} className="btn btn--surface">載入預設範本</button>
              <button onClick={saveAll} className="btn btn--primary">保存</button>
            </div>
          </>
        )}

        {activeTab === 'vocab' && (
          <>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>📚 內部領域詞彙表</h2>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={vocabularyText}
                onChange={(e) => handleVocabularyChange(e.target.value)}
                placeholder={`輸入詞彙對應（例）\nmtr -> mstr\nai => 人工智慧\nmtc | master | 主控制器\naqr: 品質報告`}
                style={{ width: '100%', height: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.875rem', fontFamily: 'monospace', resize: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => { setVocabularyText(''); updateSettings({ vocabularyList: [] }); }} className="btn btn--surface">載入預設範本</button>
              <button onClick={saveAll} className="btn btn--primary">保存</button>
            </div>
          </>
        )}

      </section>
    </div>
  );
};

export default PromptsPage;
