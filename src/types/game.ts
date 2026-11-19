export type PlayerColor = 'white' | 'black';
export type PieceType = 'man' | 'king';
export type Coord = string; // 'A1'..'J10'

export interface Piece {
  color: PlayerColor;
  type: PieceType;
}

export type BoardState = Record<string, Piece>;

export interface LegalMove {
  from: Coord;
  to: Coord;
  path: Coord[];
  captured: Coord[];
  promoted: boolean;
}

export type GameStatus = 'waiting' | 'confirming' | 'playing' | 'finished';

export type EndReason =
  | 'none'
  | 'no_pieces'
  | 'no_moves'
  | 'resignation'
  | 'threefold_repetition'
  | 'twenty_five_move_rule'
  | 'endgame_16_moves'
  | 'endgame_5_moves'
  | 'mutual_draw';

export type Winner = PlayerColor | 'draw' | 'none';

export interface EngineState {
  board: BoardState;
  turn: PlayerColor;
  ply: number;
  kingOnlyPlies: number;
  endgame16Plies: number;
  endgame5Plies: number;
  positionCounts: Record<string, number>;
  winner: Winner;
  endReason: EndReason;
}

export interface MoveRecord {
  id: string;
  ply: number;
  color: PlayerColor;
  pseudo: string;
  from: Coord;
  to: Coord;
  path: Coord[];
  captured: Coord[];
  promoted: boolean;
  boardAfter: BoardState;
  createdAt: string;
}

export type AnnotationColor = 'yellow' | 'red' | 'green' | 'blue' | 'orange';
export type SquareMarkerColor = 'red' | 'green' | 'yellow';

export interface PieceHighlight {
  coord: Coord;
  color: AnnotationColor;
}

export interface BoardArrow {
  id: string;
  points: Coord[]; // >= 2 coordinates for single or multi-segment arrows
  color: AnnotationColor;
}

export interface SquareMarker {
  coord: Coord;
  color: SquareMarkerColor;
}

export interface AnnotationNote {
  id: string;
  authorPseudo: string;
  authorRole: PlayerColor | 'spectator';
  text: string;
  createdAt: string;
}

export interface AnnotationsState {
  highlights: Record<string, AnnotationColor>; // coord -> color
  arrows: BoardArrow[];
  squareMarkers: Record<string, SquareMarkerColor>; // coord -> color
  notes: AnnotationNote[];
  updatedBy: string;
  updatedAt: string;
}

export interface SimulationState {
  active: boolean;
  shared: boolean;
  controllerPseudo: string;
  engine: EngineState;
  history: MoveRecord[];
}

export interface PlayerSeat {
  pseudo: string;
  color: PlayerColor;
  confirmed: boolean;
  connected: boolean;
  lastSeenAt: string;
}

export interface GameSessionView {
  id: string;
  creatorColor: PlayerColor;
  status: GameStatus;
  version: number;
  white: PlayerSeat | null;
  black: PlayerSeat | null;
  spectatorCount: number;
  engine: EngineState;
  moves: MoveRecord[];
  annotations: AnnotationsState;
  simulation: SimulationState | null;
  rematchRequestedBy: PlayerColor | null;
  rematchGameId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSeatInfo {
  role: PlayerColor | 'spectator';
  pseudo: string;
  seatToken?: string;
}
