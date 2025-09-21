# 會議轉錄工具

一個支援 Windows 與 macOS 的桌面應用程式，能夠錄製音訊、自動轉錄並生成會議摘要。支援麥克風錄音與系統音訊擷取（Windows 建議搭配虛擬音訊設備，macOS 透過螢幕錄製權限擷取系統聲音）。

## 功能特色

### 核心功能（已實作）
- ✅ **麥克風錄音**：高品質音訊錄製
- ✅ **系統音訊偵測**：自動偵測虛擬音訊設備（如 VB-Audio Cable）
- ✅ **檔案上傳**：整檔上傳至 Gemini 2.5 Pro API
- ✅ **即時狀態追蹤**：任務狀態輪詢與顯示
- ✅ **語音轉錄顯示**：包含發言人識別的逐字稿
- ✅ **智能摘要**：重點摘要、時間軸、待辦事項
- ✅ **Markdown 匯出**：一鍵複製摘要為 Markdown 格式
- ✅ **音量視覺化**：即時顯示錄音音量
- ✅ **裝置選擇**：選擇不同的錄音裝置
- ✅ **通知系統**：操作結果和錯誤提醒
- ✅ **任務歷史**：本地儲存任務記錄

### 開發中功能
- 🔄 **分段上傳**：支援大檔案斷點續傳
- 🔄 **品質驗收**：顯示詞錯率和人名校正建議
- 🔄 **進階匯出**：PDF 和 DOCX 格式匯出
- 🔄 **自動寄信**：完成後透過 n8n 自動發送結果

## 版本歷史

- **v1.1.5（最新）**：導入 Google Cloud STT + Gemini 混合轉錄流程，支援自動切段、格式轉換與 Chirp 模型容錯；逐字稿顯示回復正常，並預設內建公司帳號的憑證設定。
- **v1.1.4（commit 0c26fd7）**：Gemini 503 錯誤容錯與摘要修正，未包含 STT 介面更新。對應的發行檔維持在 `release/` 根目錄。
- **v1.1.3（舊版）**：僅包含自動更新相關修正，所有打包檔已歸檔至 `release/(舊版)/`，僅供備查。

> 與其他協作者（例如 Claude Code）同步時，請引用上述版本歷史，避免再使用舊版檔案或混淆開發基準。

## 技術架構

- **前端**：Electron + React + TypeScript + Tailwind CSS
- **狀態管理**：Zustand
- **打包工具**：Webpack + electron-builder
- **音訊處理**：MediaRecorder API + Web Audio API
- **系統音訊**：macOS 透過螢幕錄製取得系統音訊、Windows 透過虛擬音訊設備或立體聲混音
- **樣式**：Tailwind CSS
- **API 服務**：Google Gemini 2.5 Pro

## 快速開始

### 系統需求
- Windows 10/11（建議搭配 VB Cable / 立體聲混音）
- macOS 13+（需授權螢幕錄製與麥克風權限）
- Node.js 16+
- npm 或 yarn

### 安裝與開發

1. **克隆專案**
   ```bash
   git clone <repository-url>
   cd meeting-recorder
   ```

2. **安裝依賴**
   ```bash
   npm install
   ```

3. **開發模式**
   ```bash
   npm run dev
   ```
   
   這會同時啟動：
   - Webpack Dev Server（渲染進程熱更新）
   - Electron 主進程監控

4. **生產建置**
   ```bash
   npm run build
   ```

5. **打包安裝檔**
 ```bash
  npm run dist
  ```
  
  生成的安裝檔位於 `release/` 目錄。macOS 使用者亦可執行 `npm run dist:mac` 產生 DMG 安裝檔。

## 使用說明

### 基本流程

1. **設定 API**
   - 前往「設定」頁面
   - 選擇 API 模式（Gemini / 自訂 API）
   - 若使用 Gemini：輸入 Google Gemini API Key
   - 若使用自訂 API：設定服務的基礎網址、API Key 與對應環境（dev/stg/prod）

2. **系統音訊錄製設定（可選）**
   - 安裝 VB-Audio Virtual Cable 或類似虛擬音訊設備
   - 應用程式會自動偵測並優先使用虛擬音訊設備
   - 若無虛擬設備則使用預設麥克風

3. **開始錄音**
   - 在「錄音」頁面填寬會議標題和參與者
   - 選擇錄音設備（支援麥克風和系統音訊）
   - 點擊錄音按鈕開始錄製
   - 可即時查看音量視覺化效果
   - 錄音完成後點擊「開始處理」上傳

4. **查看進度**
   - 在「任務」頁面查看處理狀態
   - 狀態包括：上傳中 → 轉錄中 → 摘要中 → 完成
   - 支援任務重試機制

5. **查看結果**
   - 完成後點擊「查看結果」
   - 可切換「摘要」和「逐字稿」視圖
   - 支援一鍵複製 Markdown 格式
   - 本地保存任務歷史記錄

### 系統音訊錄製說明

應用程式支援兩種錄音模式：
- **麥克風錄音**：錄製麥克風輸入
- **系統音訊錄音**：錄製電腦播放的音訊（Windows 建議配置虛擬音訊設備，macOS 會透過螢幕錄製權限擷取系統聲音）

macOS 系統音訊錄製注意事項：
1. 第一次啟動錄音時，系統會要求授權「螢幕錄製」與「麥克風」權限，請於「設定 → 隱私權與安全性」中允許。
2. 錄製系統音訊時會彈出「分享螢幕」提示，只需選擇任一螢幕即可（實際不會保存畫面）。
3. 若要同時錄製麥克風與系統音訊，請選擇「系統聲音 + 麥克風」模式，應用程式會自動混音。

Windows 推薦虛擬音訊設備：
- VB-Audio Virtual Cable
- Voicemeeter
- 其他支援 Stereo Mix 功能的音訊設備

## API 整合

### Gemini 2.5 Pro API

應用程式使用 Google Gemini 2.5 Pro API 進行語音轉錄和摘要生成：

```typescript
// API 端點配置
const API_ENDPOINTS = {
  uploadFile: '/v1beta/files',
  generateContent: '/v1beta/models/gemini-2.5-pro:generateContent',
  getFile: '/v1beta/files/{name}'
}
```

### API 重試機制

- 實作指數退避重試邏輯
- 最大重試次數：3 次
- 支援 429（Too Many Requests）和 503（Service Unavailable）錯誤重試
- 自動處理 API 限流

詳細 API 規格請參考程式碼中的型別定義：`app/shared/types.ts`

### 回應格式範例

**轉錄結果（輸出為 `<pre>` 區塊）**
```
# Legend: Speaker 1=張經理, Speaker 2=王設計師
[張經理|Speaker 1]: 好，我們今天來討論一下新產品的規劃方向。
[王設計師|Speaker 2]: 沒問題，我這邊先報告使用者訪談的結論…
```

## 開發指南

### 專案結構
```
meeting-recorder/
├── app/
│   ├── main/           # Electron 主進程
│   │   ├── main.ts
│   │   ├── preload.ts
│   │   └── ipc/        # IPC 處理程式
│   ├── renderer/       # React 前端
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   └── shared/         # 共用型別和設定
├── assets/             # 應用程式資源
└── release/           # 打包輸出
```

### 核心組件
- **RecorderPanel**：錄音控制面板
- **JobCard**：任務狀態卡片
- **TranscriptView**：轉錄內容顯示
- **SummaryView**：摘要內容顯示
- **FlagGuard**：功能開關守衛

### 狀態管理
使用 Zustand 管理全域狀態：
- **SettingsStore**：應用程式設定
- **RecordingStore**：錄音狀態
- **JobsStore**：任務管理
- **ToastStore**：通知訊息
- **UIStore**：介面狀態

### Feature Flags
在 `app/shared/flags.ts` 中管理功能開關：
```typescript
export const FLAGS = {
  SYSTEM_AUDIO: false,           // 系統音錄製（開發中）
  AUTO_EMAIL: false,             // 自動寄信（開發中）
  ADV_EXPORT: false,             // 進階匯出（開發中）
  QUALITY_GATE: false,           // 品質驗收（開發中）
  CHUNK_UPLOAD: false,           // 分段上傳（開發中）
  DEVICE_SELECTION: true,        // 裝置選擇（已啟用）
  VOLUME_VISUALIZATION: true,    // 音量視覺化（已啟用）
  NOTIFICATIONS: true,           // 通知系統（已啟用）
  JOB_HISTORY: true,             // 任務歷史（已啟用）
  MARKDOWN_COPY: true            // Markdown 複製（已啟用）
}
```

## 建置和部署

### 開發建置
```bash
npm run dev          # 開發模式（熱更新）
npm run build:main   # 建置主進程
npm run build:renderer # 建置渲染進程
```

### 生產建置
```bash
npm run build        # 完整建置
npm run dist         # 打包 Windows 安裝檔
```

### 建置輸出
- `dist/main/`：主進程編譯結果
- `dist/renderer/`：前端編譯結果
- `release/`：Windows 安裝檔

## 故障排除

### 常見問題

**1. 錄音無法開始**
- 檢查麥克風權限
- 確認瀏覽器允許音訊存取
- 檢查裝置是否被其他程式佔用

**2. API 連接失敗**
- 確認網路連接正常
- 檢查 Gemini API 基礎網址格式
- 驗證 Gemini API 金鑰有效性
- 檢查 API 配額和限流設定

**3. 上傳失敗**
- 檢查檔案大小（限制 500MB）
- 確認網路穩定性
- 查看錯誤訊息並重試

**4. 應用程式無法啟動**
- 確認 Node.js 版本 >= 16
- 重新安裝依賴：`rm -rf node_modules && npm install`
- 檢查 Windows 版本兼容性

### 日誌查看
- 開發模式：在 DevTools Console 查看
- 生產模式：在 Windows 事件檢視器查看
- Electron 日誌：`%APPDATA%/會議轉錄工具/logs/`

## 貢獻指南

1. Fork 專案
2. 建立功能分支：`git checkout -b feature/amazing-feature`
3. 提交變更：`git commit -m 'Add some AmazingFeature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 建立 Pull Request

### 開發規範
- 遵循 TypeScript 嚴格模式
- 使用 ESLint 和 Prettier
- 新功能需加入適當的 Feature Flag
- 確保錯誤處理和重試機制完善
- 音訊功能需在多種設備上測試

## 授權

此專案採用 MIT 授權條款。

## 聯絡方式

如有問題或建議，歡迎建立 Issue 或聯絡開發團隊。

---

## Demo 流程

### 基本示範流程

1. **啟動應用程式**
   ```bash
   npm run dev
   ```

2. **設定 API**
   - 前往「設定」頁面
   - 輸入 Gemini API 金鑰和端點
   - 確認連線狀態

3. **錄音示範**
   - 輸入會議標題：「產品規劃會議」
   - 輸入參與者：「張經理, 李工程師, 王設計師」
   - 選擇錄音設備（麥克風或系統音訊）
   - 觀察音量視覺化效果
   - 開始錄音 10-30 秒
   - 停止錄音並上傳

4. **查看結果**
   - 前往「任務」頁面查看處理狀態
   - 觀察狀態變更：上傳中 → 轉錄中 → 摘要中 → 完成
   - 點擊「查看結果」
   - 展示摘要和逐字稿功能
   - 測試 Markdown 複製功能
   - 查看任務歷史記錄

### 系統音訊錄製示範

1. **安裝虛擬音訊設備**（可選）
   - 下載並安裝 VB-Audio Virtual Cable
   - 重新啟動應用程式

2. **測試系統音訊錄製**
   - 播放音樂或影片
   - 應用程式會自動偵測虛擬音訊設備
   - 進行錄音測試，確認可錄製系統播放的音訊

此版本提供了完整的會議錄音轉錄解決方案，整合 Gemini 2.5 Pro API 進行高品質轉錄和摘要，後續版本將持續優化系統音訊錄製功能並加入更多進階功能。
