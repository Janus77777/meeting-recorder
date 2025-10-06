import React, { useMemo, useState } from 'react';
import { useSettingsStore, useToastActions, useUIStore } from '../services/store';
import { GoogleCloudSTTSettings } from '@shared/types';

const label: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#374151' };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 };
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 };

export const GoogleSTTSettingsPage: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const { settings, updateSettings } = useSettingsStore();
  const stt = useMemo<GoogleCloudSTTSettings>(() => ({
    ...(settings.googleCloudSTT ?? {})
  }), [settings.googleCloudSTT]);
  const [form, setForm] = useState<GoogleCloudSTTSettings>(stt);
  const { showError, showSuccess } = useToastActions();
  const { setCurrentPage } = useUIStore();
  const [isTesting, setIsTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const save = () => {
    updateSettings({ googleCloudSTT: form });
    showSuccess('Google STT 設定已保存');
  };

  const testInit = async () => {
    if (isTesting) return;
    setIsTesting(true);
    setTestMsg(null);
    try {
      const res = await window.electronAPI.stt.initialize({
        projectId: form.projectId || '',
        location: form.location || 'global',
        recognizerId: form.recognizerId || '',
        keyFilePath: form.keyFilePath || '',
        model: form.model
      });
      if (res.success) {
        const ok = 'Google STT 初始化成功';
        setTestMsg({ type: 'success', text: ok });
        showSuccess(ok);
      } else {
        const msg = res.error || '初始化失敗';
        setTestMsg({ type: 'error', text: msg });
        showError(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '初始化失敗';
      setTestMsg({ type: 'error', text: msg });
      showError(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const bind = (k: keyof GoogleCloudSTTSettings) => ({
    value: (form[k] as any) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }))
  });

  return (
    <div style={{ width: '100%', maxWidth: embedded ? '100%' : 960, margin: embedded ? '0' : '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>Google STT 詳細設定</h2>
          <button className="btn btn--surface" onClick={() => setCurrentPage('settings')}>← 返回</button>
        </div>
      )}

      <div style={card}>
        <div style={row}>
          <div>
            <div style={label}>Project ID</div>
            <input style={input} placeholder="your-gcp-project" {...bind('projectId')} />
          </div>
          <div>
            <div style={label}>Location</div>
            <input style={input} placeholder="asia-southeast1 / us / eu" {...bind('location')} />
          </div>
        </div>

        <div style={row}>
          <div>
            <div style={label}>Recognizer ID</div>
            <input style={input} placeholder="例如 chirp_3_xxx 或 latest_long_xxx" {...bind('recognizerId')} />
          </div>
          <div>
            <div style={label}>Model</div>
            <input style={input} placeholder="chirp_3 / chirp_2 / latest_long" {...bind('model')} />
          </div>
        </div>

        <div>
          <div style={label}>Service Account 金鑰路徑</div>
          <input style={input} placeholder="/path/to/google-stt.json 或 @builtin/google-stt.json" {...bind('keyFilePath')} />
        </div>

        <div style={row}>
          <div>
            <div style={label}>語言代碼</div>
            <input style={input} placeholder="zh-TW / cmn-Hans-CN / en-US" {...bind('languageCode')} />
          </div>
          <div>
            <div style={label}>字詞時間戳 (Word Offsets)</div>
            <select style={input as any} value={String(form.enableWordTimeOffsets ?? true)} onChange={(e) => setForm(prev => ({ ...prev, enableWordTimeOffsets: e.target.value === 'true' }))}>
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          </div>
        </div>

        <div style={row}>
          <div>
            <div style={label}>說話者分段 (Diarization)</div>
            <select style={input as any} value={String(form.enableSpeakerDiarization ?? false)} onChange={(e) => setForm(prev => ({ ...prev, enableSpeakerDiarization: e.target.value === 'true' }))}>
              <option value="false">停用</option>
              <option value="true">啟用（僅 chirp_3 + cmn-Hans-CN）</option>
            </select>
          </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={label}>最少說話者</div>
              <input type="number" min={1} max={6} style={input} value={Math.min(6, Math.max(1, form.minSpeakerCount ?? 1))} onChange={(e) => setForm(prev => ({ ...prev, minSpeakerCount: Math.min(6, Math.max(1, parseInt(e.target.value || '1', 10))) }))} />
              </div>
              <div>
                <div style={label}>最多說話者</div>
              <input type="number" min={1} max={6} style={input} value={Math.min(6, Math.max(1, form.maxSpeakerCount ?? 6))} onChange={(e) => setForm(prev => ({ ...prev, maxSpeakerCount: Math.min(6, Math.max(1, parseInt(e.target.value || '6', 10))) }))} />
              </div>
            </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
          <button className="btn btn--surface" onClick={testInit} disabled={isTesting}>
            {isTesting ? '測試中…' : '🔍 測試初始化'}
          </button>
          <button className="btn btn--primary" onClick={save} disabled={isTesting}>保存設定</button>
        </div>

        {testMsg && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: testMsg.type === 'success' ? '#047857' : '#b91c1c' }}>
            {testMsg.text}
          </div>
        )}

        <div style={{ fontSize: 12, color: '#6b7280' }}>
          提示：若需啟用說話者分段（Diarization），請將模型設為 <b>chirp_3</b> 並使用語言 <b>cmn-Hans-CN</b>；輸出會自動轉為繁體。
        </div>
      </div>
    </div>
  );
};

export default GoogleSTTSettingsPage;
