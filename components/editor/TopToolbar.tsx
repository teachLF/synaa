'use client';

import React from 'react';
import {
  Download,
  FileAudio,
  Film,
  FolderPlus,
  Redo2,
  Scissors,
  Undo2,
} from 'lucide-react';
import type { AspectRatio } from '@/lib/editor/types';

interface TopToolbarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  aspectRatio: AspectRatio;
  onImportClick: () => void;
  onSplitClick: () => void;
  canSplit: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenAudioExtract: () => void;
  onOpenExport: () => void;
  isTranscoding: boolean;
}

export default function TopToolbar({
  projectName,
  onProjectNameChange,
  aspectRatio,
  onImportClick,
  onSplitClick,
  canSplit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenAudioExtract,
  onOpenExport,
  isTranscoding,
}: TopToolbarProps) {
  return (
    <header className="h-14 shrink-0 bg-[#10141D] border-b border-white/10 px-4 flex items-center justify-between gap-4">
      {/* Zone 1: Brand & Project Title */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <Film className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <span className="font-display text-base font-bold tracking-tight text-white">
            سينا ستوديو
          </span>
        </div>
        <span className="text-slate-600 select-none hidden sm:inline" aria-hidden="true">
          /
        </span>
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          aria-label="اسم المشروع"
          className="hidden sm:block bg-transparent text-sm text-slate-200 font-medium border border-transparent hover:border-white/10 focus:border-amber-500/60 focus:bg-[#171D29] rounded px-2 py-1 outline-none w-44 truncate transition-colors"
        />
        <span
          dir="ltr"
          className="hidden lg:inline text-xs font-mono text-slate-400 whitespace-nowrap shrink-0"
        >
          {aspectRatio} · 4K UHD
        </span>
      </div>

      {/* Zone 2: Primary Editing & Conversion Tools */}
      <nav aria-label="أدوات التحرير السريعة" className="flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={onImportClick}
          disabled={isTranscoding}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-[#19202D] hover:bg-[#222B3C] border border-white/10 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <FolderPlus className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <span>{isTranscoding ? 'جاري التحويل...' : 'استيراد وسائط'}</span>
        </button>

        <button
          type="button"
          onClick={onSplitClick}
          disabled={!canSplit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#19202D] hover:bg-[#222B3C] border border-white/10 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-40"
        >
          <Scissors className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <span className="hidden md:inline">تقسيم عند المؤشر</span>
        </button>

        <div className="flex items-center border border-white/10 rounded-md overflow-hidden shrink-0">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="تراجع"
            title="تراجع (Ctrl+Z)"
            className="p-1.5 text-slate-300 hover:bg-[#1E2636] disabled:opacity-35 transition-colors"
          >
            <Undo2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="إعادة"
            title="إعادة (Ctrl+Y)"
            className="p-1.5 text-slate-300 hover:bg-[#1E2636] border-r border-white/10 disabled:opacity-35 transition-colors"
          >
            <Redo2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenAudioExtract}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-200 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <FileAudio className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>تحويل الفيديو إلى صوت</span>
        </button>
      </nav>

      {/* Zone 3: 4K Export CTA */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>تصدير 4K</span>
        </button>
      </div>
    </header>
  );
}
