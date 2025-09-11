# 會議轉錄工具

一個 Windows 桌面應用程式，能夠錄音、自動轉錄並生成會議摘要。

## 功能特色

### MVP 功能（已實作）
- ✅ **麥克風錄音**：高品質音訊錄製
- ✅ **檔案上傳**：整檔上傳至後端服務
- ✅ **即時狀態追蹤**：任務狀態輪詢與顯示
- ✅ **語音轉錄顯示**：包含發言人識別的逐字稿
- ✅ **智能摘要**：重點摘要、時間軸、待辦事項
- ✅ **Mock/Real API 切換**：支援測試和正式環境
- ✅ **Markdown 匯出**：一鍵複製摘要為 Markdown 格式

### 即將推出的功能
- 🔄 **系統音錄製**：透過 WASAPI 錄製系統播放音訊
- 🔄 **分段上傳**：支援大檔案斷點續傳
- 🔄 **品質驗收**：顯示詞錯率和人名校正建議
- 🔄 **進階匯出**：PDF 和 DOCX 格式匯出
- 🔄 **自動寄信**：完成後透過 n8n 自動發送結果

## 技術架構

- **前端**：Electron + React + TypeScript + Tailwind CSS
- **狀態管理**：Zustand
- **打包工具**：Webpack + electron-builder
- **音訊處理**：MediaRecorder API
- **樣式**：Tailwind CSS

## 快速開始

### 系統需求
- Windows 10/11
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
   
   生成的安裝檔位於 `release/` 目錄

## 使用說明

### 基本流程

1. **設定 API**
   - 前往「設定」頁面
   - 選擇環境（dev/stg/prod）
   - 輸入 API 基礎網址和金鑰
   - 或開啟 Mock 模式進行測試

2. **開始錄音**
   - 在「錄音」頁面填寫會議標題和參與者
   - 選擇錄音設備（預設為系統麥克風）
   - 點擊錄音按鈕開始錄製
   - 錄音完成後點擊「開始處理」上傳

3. **查看進度**
   - 在「任務」頁面查看處理狀態
   - 狀態包括：排隊中 → 轉錄中 → 摘要中 → 完成

4. **查看結果**
   - 完成後點擊「查看結果」
   - 可切換「摘要」和「逐字稿」視圖
   - 支援一鍵複製 Markdown 格式

### Mock 模式

開發和測試時可啟用 Mock 模式：
- 不需要真實的 API 服務
- 使用預設的模擬資料
- 模擬完整的處理流程

## API 合約

### 後端 API 端點

```
POST /api/meetings
POST /api/meetings/:id/audio
POST /api/meetings/:id/complete
GET  /api/meetings/:id/status
GET  /api/meetings/:id/result
```

詳細 API 規格請參考程式碼中的型別定義：`app/shared/types.ts`

### 回應格式範例

**轉錄結果**
```json
{
  "transcript": {
    "segments": [
      {
        "start": 0,
        "end": 5.2,
        "speaker": "張經理",
        "text": "好，我們今天來討論一下新產品的規劃方向。"
      }
    ]
  },
  "summary": {
    "highlights": ["確定三階段開發流程"],
    "todos": [
      {
        "owner": "王設計師",
        "task": "準備用戶訪談結果資料",
        "due": "2025-09-11"
      }
    ]
  }
}
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
  SYSTEM_AUDIO: false,   // 系統音錄製
  AUTO_EMAIL: false,     // 自動寄信
  ADV_EXPORT: false,     // 進階匯出
  QUALITY_GATE: false,   // 品質驗收
  CHUNK_UPLOAD: false    // 分段上傳
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
- 檢查 API 基礎網址格式
- 驗證 API 金鑰有效性
- 嘗試切換到 Mock 模式測試

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
- 確保在 Mock 模式下可正常測試

## 授權

此專案採用 MIT 授權條款。

## 聯絡方式

如有問題或建議，歡迎建立 Issue 或聯絡開發團隊。

---

## Demo 腳本

### 基本示範流程

1. **啟動應用程式**
   ```bash
   npm run dev
   ```

2. **Mock 模式示範**
   - 前往「設定」頁面
   - 確認已開啟 Mock 模式
   - 返回「錄音」頁面

3. **錄音示範**
   - 輸入會議標題：「產品規劃會議」
   - 輸入參與者：「張經理, 李工程師, 王設計師」
   - 開始錄音 10 秒
   - 停止錄音並上傳

4. **查看結果**
   - 前往「任務」頁面查看處理狀態
   - 等待狀態變更為「完成」
   - 點擊「查看結果」
   - 展示摘要和逐字稿功能
   - 測試 Markdown 複製功能

此 MVP 版本提供了完整的會議錄音轉錄解決方案核心功能，後續版本將逐步加入更多進階功能。