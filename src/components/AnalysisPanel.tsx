import React, { useState } from 'react';
import {
  ArrowUpRight,
  Eraser,
  Highlighter,
  PaintBucket,
  Play,
  RotateCcw,
  Send,
  Share2,
  Square,
  Undo2,
  XCircle,
} from 'lucide-react';
import type {
  AnnotationColor,
  AnnotationsState,
  Coord,
  SimulationState,
  SquareMarkerColor,
} from '../types/game.ts';
import type { AnalysisTool } from './DraughtsBoard.tsx';

interface AnalysisPanelProps {
  isSpectator: boolean;
  analysisMode: boolean;
  analysisTool: AnalysisTool;
  activeColor: AnnotationColor;
  activeSquareColor: SquareMarkerColor;
  annotations: AnnotationsState;
  draftArrowPoints: Coord[];
  simulation: SimulationState | null;
  localSimulationActive: boolean;
  onToggleAnalysisMode: () => void;
  onSelectTool: (tool: AnalysisTool) => void;
  onSelectColor: (color: AnnotationColor) => void;
  onSelectSquareColor: (color: SquareMarkerColor) => void;
  onFinishArrow: () => void;
  onCancelArrow: () => void;
  onRemoveArrow: (arrowId: string) => void;
  onClearAnnotations: () => void;
  onSendNote: (text: string) => void;
  onStartSimulation: (shared: boolean) => void;
  onUndoSimulation: () => void;
  onResetSimulation: () => void;
  onStopSimulation: () => void;
  onToggleShareSimulation: (shared: boolean) => void;
}

const COLOR_OPTIONS: Array<{ id: AnnotationColor; label: string; dotClass: string }> = [
  { id: 'yellow', label: 'Jaune', dotClass: 'bg-yellow-400 border-yellow-600' },
  { id: 'red', label: 'Rouge', dotClass: 'bg-red-500 border-red-700' },
  { id: 'green', label: 'Vert', dotClass: 'bg-emerald-500 border-emerald-700' },
  { id: 'blue', label: 'Bleu', dotClass: 'bg-blue-500 border-blue-700' },
  { id: 'orange', label: 'Orange', dotClass: 'bg-orange-500 border-orange-700' },
];

const SQUARE_COLORS: Array<{ id: SquareMarkerColor; label: string; dotClass: string }> = [
  { id: 'red', label: 'Danger (Rouge)', dotClass: 'bg-red-500' },
  { id: 'green', label: 'Favorable (Vert)', dotClass: 'bg-emerald-500' },
  { id: 'yellow', label: 'Attention (Jaune)', dotClass: 'bg-yellow-400' },
];

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  isSpectator,
  analysisMode,
  analysisTool,
  activeColor,
  activeSquareColor,
  annotations,
  draftArrowPoints,
  simulation,
  localSimulationActive,
  onToggleAnalysisMode,
  onSelectTool,
  onSelectColor,
  onSelectSquareColor,
  onFinishArrow,
  onCancelArrow,
  onRemoveArrow,
  onClearAnnotations,
  onSendNote,
  onStartSimulation,
  onUndoSimulation,
  onResetSimulation,
  onStopSimulation,
  onToggleShareSimulation,
}) => {
  const [noteInput, setNoteInput] = useState('');

  const highlightedList = Object.entries(annotations.highlights);

  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    onSendNote(trimmed);
    setNoteInput('');
  };

  return (
    <div className="space-y-5">
      {/* En-tête du mode analyse */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Mode analyse pédagogique</h3>
            <p className="text-xs text-slate-500">
              Les annotations sont synchronisées sans jamais modifier la partie réelle.
            </p>
          </div>
          {!isSpectator && (
            <button
              type="button"
              data-testid="toggle-analysis-btn"
              onClick={onToggleAnalysisMode}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto ${
                analysisMode
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-emerald-800 text-white hover:bg-emerald-900'
              }`}
            >
              {analysisMode ? 'Quitter le mode analyse' : 'Activer le mode analyse'}
            </button>
          )}
        </div>

        {analysisMode && !isSpectator && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            {/* Sélecteur d'outils */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 p-1 rounded-lg">
              <button
                type="button"
                data-testid="tool-highlight"
                onClick={() => onSelectTool('highlight')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  analysisTool === 'highlight'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 shrink-0" />
                <span>Pions</span>
              </button>
              <button
                type="button"
                data-testid="tool-arrow"
                onClick={() => onSelectTool('arrow')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  analysisTool === 'arrow'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                <span>Flèches</span>
              </button>
              <button
                type="button"
                data-testid="tool-square"
                onClick={() => onSelectTool('square')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  analysisTool === 'square'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PaintBucket className="w-3.5 h-3.5 shrink-0" />
                <span>Cases</span>
              </button>
            </div>

            {/* Options de couleur selon l'outil actif */}
            {(analysisTool === 'highlight' || analysisTool === 'arrow') && (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-600">
                  {analysisTool === 'highlight'
                    ? 'Cliquez sur des pions pour afficher leurs coordonnées :'
                    : 'Cliquez 2 cases ou plus pour tracer une flèche :'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-testid={`color-${c.id}`}
                      aria-label={`Couleur ${c.label}`}
                      onClick={() => onSelectColor(c.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                        activeColor === c.id
                          ? 'border-slate-900 bg-white text-slate-900 shadow-xs'
                          : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full border ${c.dotClass}`} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {analysisTool === 'arrow' && draftArrowPoints.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                <span className="font-mono text-slate-700 truncate">
                  Tracé : {draftArrowPoints.join(' → ')}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {draftArrowPoints.length >= 2 && (
                    <button
                      type="button"
                      onClick={onFinishArrow}
                      className="px-2.5 py-1 bg-emerald-800 text-white rounded text-xs font-medium hover:bg-emerald-900 whitespace-nowrap"
                    >
                      Valider flèche
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onCancelArrow}
                    className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300 whitespace-nowrap"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {analysisTool === 'square' && (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-600">
                  Marquer une case sans déplacer les pièces :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SQUARE_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-testid={`square-color-${c.id}`}
                      onClick={() => onSelectSquareColor(c.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                        activeSquareColor === c.id
                          ? 'border-slate-900 bg-white text-slate-900 shadow-xs'
                          : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-xs ${c.dotClass}`} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bouton Effacer les annotations */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs text-slate-500">
              <span>
                {highlightedList.length} pion(s) · {annotations.arrows.length} flèche(s)
              </span>
              <button
                type="button"
                data-testid="clear-annotations-btn"
                onClick={onClearAnnotations}
                className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-medium whitespace-nowrap shrink-0"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Effacer les annotations</span>
              </button>
            </div>

            {annotations.arrows.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {annotations.arrows.map((arrow) => (
                  <button
                    key={arrow.id}
                    type="button"
                    onClick={() => onRemoveArrow(arrow.id)}
                    title="Supprimer cette flèche"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 rounded transition-colors"
                  >
                    <span>{arrow.points.join('→')}</span>
                    <XCircle className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mode Démonstration : Simulation de coups */}
      <div className="pt-4 border-t border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Simulation de coups</h3>
            <p className="text-xs text-slate-500">
              Testez des variantes sur une copie temporaire conforme aux règles.
            </p>
          </div>
        </div>

        {!localSimulationActive && !simulation?.active ? (
          !isSpectator && (
            <button
              type="button"
              data-testid="start-simulation-btn"
              onClick={() => onStartSimulation(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-800 text-white text-xs font-semibold rounded-lg hover:bg-sky-900 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Activer la simulation</span>
            </button>
          )
        ) : (
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-950">
                Simulation active {simulation ? `(${simulation.history.length} coup(s))` : ''}
              </span>
              {simulation?.controllerPseudo && (
                <span className="text-sky-800">Par {simulation.controllerPseudo}</span>
              )}
            </div>

            {!isSpectator && (
              <>
                <label className="flex items-center gap-2 text-xs text-sky-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simulation?.shared ?? true}
                    onChange={(e) => onToggleShareSimulation(e.target.checked)}
                    className="rounded border-sky-400 text-sky-700 focus:ring-sky-600"
                  />
                  <Share2 className="w-3.5 h-3.5 text-sky-800" />
                  <span>Partager la démonstration sur les deux écrans</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    data-testid="undo-simulation-btn"
                    onClick={onUndoSimulation}
                    disabled={!simulation || simulation.history.length === 0}
                    className="flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium bg-white border border-sky-300 text-sky-950 rounded-md hover:bg-sky-100 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Undo2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Annuler la simulation</span>
                  </button>
                  <button
                    type="button"
                    data-testid="reset-simulation-btn"
                    onClick={onResetSimulation}
                    className="flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium bg-white border border-sky-300 text-sky-950 rounded-md hover:bg-sky-100 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Réinitialiser la simulation</span>
                  </button>
                  <button
                    type="button"
                    data-testid="stop-simulation-btn"
                    onClick={onStopSimulation}
                    className="flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium bg-sky-900 text-white rounded-md hover:bg-sky-950 whitespace-nowrap"
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span>Revenir à la position réelle</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Explications textuelles synchronisées */}
      <div className="pt-4 border-t border-slate-200 space-y-2.5">
        <h3 className="text-sm font-semibold text-slate-900">Explications pédagogiques</h3>

        {annotations.notes.length === 0 ? (
          <p className="text-xs text-slate-500">
            Aucune note stratégique publiée pour le moment.
          </p>
        ) : (
          <ul className="space-y-2 max-h-44 overflow-y-auto pr-1" data-testid="notes-list">
            {annotations.notes.map((note) => (
              <li
                key={note.id}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-semibold text-slate-800">{note.authorPseudo}</span>
                  <span className="tabular-nums">
                    {new Date(note.createdAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-slate-800 leading-relaxed">{note.text}</p>
              </li>
            ))}
          </ul>
        )}

        {!isSpectator && (
          <form onSubmit={handleSubmitNote} className="space-y-2">
            <label htmlFor="pedagogical-note" className="sr-only">
              Écrire une explication stratégique
            </label>
            <textarea
              id="pedagogical-note"
              rows={2}
              maxLength={500}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Ex : Si tu bouges B5, tu peux forcer une prise..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent resize-none"
            />
            <button
              type="submit"
              data-testid="publish-note-btn"
              disabled={!noteInput.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publier l’explication</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
