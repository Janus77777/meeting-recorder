import { ChevronLeft, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { getDisplayName, normalizeName } from '@renderer/utils/filename';

interface KitResultHeaderProps {
  fileName: string;
  completedTime?: string;
  currentMode: 'summary' | 'transcript';
  onModeChange: (mode: 'summary' | 'transcript') => void;
  files?: Array<{ id: string; label: string }>;
  onSelectFile?: (id: string) => void;
  onBack?: () => void;
  showProgress?: boolean;
  progressValue?: number;
  estimatedTime?: string;
}

export function KitResultHeader({ fileName, completedTime, currentMode, onModeChange, files = [], onSelectFile, onBack, showProgress = false, progressValue = 0, estimatedTime = '00:00' }: KitResultHeaderProps) {
  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border border-[#E2E8F0] rounded-2xl shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] mb-3">
      <div className="px-6 py-3 space-y-1.5">
        {/* 第 1 列：返回 | 檔名 | 檔案選單 */}
        <div className="flex items-center">
          <div className="w-[240px] flex justify-start">
            <Button variant="outline" className="rounded-xl h-10 px-4 border-[#E2E8F0]" onClick={onBack}>
              <ChevronLeft className="h-5 w-5 mr-2" />
              返回清單
            </Button>
          </div>
          <div className="flex-1 text-center px-4 overflow-hidden">
            {files.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex items-center gap-2 max-w-[620px] px-3 py-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors truncate"
                    title={normalizeName(fileName)}
                  >
                    <span className="text-[#0F172A] font-semibold text-lg truncate">{getDisplayName(fileName, 'short')}</span>
                    <ChevronDown className="h-4 w-4 text-[#64748B]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-white overflow-hidden max-h-[420px] w-[min(92vw,420px)] rounded-xl shadow-lg border border-[#E2E8F0]">
                  {files.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      className="px-4 py-3 rounded-lg w-full whitespace-nowrap overflow-hidden text-ellipsis text-[15px]"
                      onClick={() => onSelectFile?.(f.id)}
                    >
                      <span className="truncate block w-full" title={normalizeName(f.label)}>{getDisplayName(f.label, 'medium')}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="text-[#0F172A] font-semibold text-lg truncate" title={normalizeName(fileName)}>{getDisplayName(fileName, 'short')}</div>
            )}
          </div>
          <div className="w-[240px]" />
        </div>

        {/* 第 2 列：完成時間（置中） | 模式切換（右） */}
        <div className="flex items-center">
          <div className="w-[240px]" />
          <div className="flex-1 text-center text-[#64748B] text-sm truncate">
            {completedTime ? `完成時間：${completedTime}` : ''}
          </div>
          <div className="w-[240px] flex justify-end">
            <div className="flex bg-[#F1F5F9] rounded-xl p-1.5 shadow-inner">
              <button onClick={() => onModeChange('summary')} className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${currentMode === 'summary' ? 'bg-white text-[#0F172A] shadow-md shadow-slate-200/60' : 'text-[#64748B] hover:text-[#374151] hover:bg-white/50'}`}>摘要</button>
              <button onClick={() => onModeChange('transcript')} className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${currentMode === 'transcript' ? 'bg-white text-[#0F172A] shadow-md shadow-slate-200/60' : 'text-[#64748B] hover:text-[#374151] hover:bg-white/50'}`}>逐字稿</button>
            </div>
          </div>
        </div>
      </div>

      {showProgress && (
        <div className="px-6 pb-5">
          <div className="bg-[#F8FAFC] rounded-xl p-4 mb-2 border border-[#E2E8F0] text-[#64748B] text-sm font-medium">
            語音轉文字處理中 · {progressValue}%（預估剩餘 {estimatedTime}）
          </div>
          <div className="w-full bg-[#E2E8F0] rounded-full h-2">
            <div className="bg-gradient-to-r from-[#2563EB] to-[#3B82F6] h-2 rounded-full transition-all" style={{ width: `${progressValue}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default KitResultHeader;
