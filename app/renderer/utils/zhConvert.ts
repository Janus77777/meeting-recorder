let _converterPromise: Promise<((s: string) => string)> | null = null;

async function getConverter(): Promise<(s: string) => string> {
  if (_converterPromise) return _converterPromise;
  _converterPromise = (async () => {
    try {
      // 以套件根匯入，避免子路徑型別缺失
      const OpenCC: any = await import('opencc-js');
      // 簡體（中國） -> 繁體（台灣標準）
      const conv = OpenCC.ConverterFactory(OpenCC.Locale.from.cn, OpenCC.Locale.to.tw);
      return (s: string) => conv(s || '');
    } catch (e) {
      // 後備：若 opencc-js 載入失敗，嘗試使用全域 opencc（若有）
      try {
        const anyWin: any = (globalThis as any);
        if (anyWin && anyWin.opencc && typeof anyWin.opencc.convert === 'function') {
          return (s: string) => anyWin.opencc.convert(s || '', 's2tw');
        }
      } catch {}
      // 最終後備：不做轉換
      return (s: string) => s || '';
    }
  })();
  return _converterPromise;
}

export async function toTW(text: string): Promise<string> {
  const converter = await getConverter();
  return converter(text);
}
