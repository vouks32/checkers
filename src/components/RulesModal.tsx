import React from 'react';
import { X } from 'lucide-react';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="rules-modal-title" className="text-xl font-semibold text-slate-900">
            Règles officielles des dames internationales (10×10)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les règles du jeu"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-700 leading-relaxed">
          <section className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">
              1. Le plateau et les coordonnées
            </h3>
            <p>
              Le jeu se déroule sur un damier de 100 cases (10 colonnes A à J, 10 rangées 1 à 10).
              Seules les 50 cases foncées sont jouables. Les Blancs commencent la partie avec
              20 pions sur les rangées 1 à 4, et les Noirs disposent de 20 pions sur les rangées 7 à 10.
              L’orientation reste fixe pour les deux joueurs.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">
              2. Déplacement des pions ordinaires
            </h3>
            <p>
              Un pion ordinaire avance d’une seule case en diagonale vers l’avant, sur une case
              foncée libre. Il ne peut jamais reculer lors d’un déplacement simple.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">
              3. Prise obligatoire et prise majoritaire
            </h3>
            <p>
              Lorsqu’une capture est possible, elle est strictement obligatoire. Un pion peut
              capturer en avant comme en arrière en sautant par-dessus un pion adverse adjacent vers
              la case libre immédiatement derrière.
            </p>
            <p>
              S’il existe plusieurs enchaînements de prises possibles, le joueur doit impérativement
              choisir la séquence qui capture le plus grand nombre de pièces adverses (prise
              majoritaire). Une pièce capturée ne peut pas être sautée une seconde fois durant le
              même coup et n’est retirée du plateau qu’à la fin complète de la rafle.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">
              4. La dame volante et la promotion différée
            </h3>
            <p>
              Un pion qui termine son tour sur la dernière rangée adverse (rangée 10 pour les Blancs,
              rangée 1 pour les Noirs) est promu en dame. Si un pion traverse la dernière rangée au
              milieu d’une prise multiple et poursuit sa rafle ailleurs, il reste un pion ordinaire
              jusqu’à la fin du coup.
            </p>
            <p>
              Une dame se déplace et capture à distance sur toute la longueur des diagonales libres,
              en avant comme en arrière, et peut atterrir sur n’importe quelle case libre située
              derrière la pièce capturée.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">
              5. Fin de partie et match nul
            </h3>
            <p>
              Un joueur gagne lorsqu’il capture toutes les pièces adverses ou lorsque l’adversaire
              n’a plus aucun coup légal. Le match nul survient en cas de triple répétition d’une
              même position, de 25 coups consécutifs de dames sans prise ni mouvement de pion, ou
              selon les règles officielles de finale réduite (5 coups ou 16 coups).
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">
              6. Mode analyse et simulation pédagogique
            </h3>
            <p>
              Activez le mode analyse à tout moment (même pendant le tour adverse) pour surligner
              plusieurs pions avec leurs coordonnées, tracer des flèches de combinaison, colorer des
              cases et envoyer des explications synchronisées sans jamais modifier la partie réelle.
              Utilisez la simulation pour tester des variantes sur une copie temporaire du plateau.
            </p>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-emerald-800 text-white text-sm font-medium rounded-lg hover:bg-emerald-900 transition-colors whitespace-nowrap shrink-0"
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
};
