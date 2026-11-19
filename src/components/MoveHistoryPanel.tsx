import React from 'react';
import { Crown, Eye, RotateCcw } from 'lucide-react';
import type { MoveRecord } from '../types/game.ts';

interface MoveHistoryPanelProps {
  moves: MoveRecord[];
  previewPly: number | null;
  onSelectPreviewPly: (ply: number | null) => void;
}

export const MoveHistoryPanel: React.FC<MoveHistoryPanelProps> = ({
  moves,
  previewPly,
  onSelectPreviewPly,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Historique des coups ({moves.length})
        </h3>
        {previewPly !== null && (
          <button
            type="button"
            data-testid="exit-history-preview-btn"
            onClick={() => onSelectPreviewPly(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded-md hover:bg-amber-200 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Revenir au direct</span>
          </button>
        )}
      </div>

      {moves.length === 0 ? (
        <p className="text-xs text-slate-500">
          Aucun coup joué pour le moment. Les Blancs ouvrent la partie.
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
          <button
            type="button"
            onClick={() => onSelectPreviewPly(previewPly === 0 ? null : 0)}
            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
              previewPly === 0 ? 'bg-amber-50 text-amber-950 font-semibold' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <span>0. Position initiale</span>
            <Eye className="w-3.5 h-3.5 opacity-60" />
          </button>

          {moves.map((m) => {
            const isActive = previewPly === m.ply;
            return (
              <button
                key={m.id}
                type="button"
                data-testid={`history-ply-${m.ply}`}
                onClick={() => onSelectPreviewPly(isActive ? null : m.ply)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                  isActive
                    ? 'bg-amber-50 text-amber-950 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-slate-400 tabular-nums w-6 shrink-0">
                    {m.ply}.
                  </span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full border shrink-0 ${
                      m.color === 'white'
                        ? 'bg-[#FAF8F2] border-slate-400'
                        : 'bg-slate-900 border-slate-950'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">{m.pseudo}</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                    {m.from}
                    {m.captured.length > 0 ? '×' : '–'}
                    {m.to}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-slate-500">
                  {m.captured.length > 0 && (
                    <span className="font-mono text-[11px] text-red-700 tabular-nums">
                      -{m.captured.join(',')}
                    </span>
                  )}
                  {m.promoted && (
                    <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold" title="Promotion en dame">
                      <Crown className="w-3 h-3" />
                      <span>Dame</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
