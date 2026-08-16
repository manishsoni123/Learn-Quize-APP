/**
 * Ludo board geometry and rules.
 *
 * Two things live here, and it matters which is which.
 *
 * **Geometry** is the client's alone. The server does not care where square 34
 * is on screen; it only knows a token is on square 34.
 *
 * **Rules** are a *mirror* of `20260817090200_ludo_engine.sql`, kept so the
 * board can light up the tokens a roll can move without a round trip. The
 * server re-derives the legal set inside `ludo_move()` and rejects anything
 * outside it, so a drift between the two files makes the UI wrong, never the
 * game. That is deliberate: one ruleset with two implementations is a real
 * risk, and this is the copy that is allowed to be wrong.
 *
 * The board is a 15x15 grid, addressed in cell units from the top-left. A cell
 * of 1 is one square; fractional values are centres.
 */

export const GRID = 15;
export const TRACK = 52;
export const HOME = 57;

/** Seat entry points on the shared track. Must match public.ludo_abs(). */
export const START = [0, 13, 26, 39] as const;

/** Coloured starts plus the four stars. Must match public.ludo_is_safe(). */
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47] as const;

export const SEATS = ['red', 'green', 'yellow', 'blue'] as const;
export type Seat = 0 | 1 | 2 | 3;

/**
 * Ludo's colours are not ours to choose — a red token that is not red stops
 * being a Ludo board. They sit alongside the Arcade palette as player
 * identity, the way track colours already do.
 */
export const SEAT_COLOR = ['#E0533F', '#3FA96B', '#E8B23C', '#3D7BD6'] as const;
export const SEAT_DIM = ['#3A1712', '#0F2E1D', '#3A2C0F', '#0F2039'] as const;

/**
 * The 52 track squares in play order, clockwise from red's entry.
 *
 * Built as [col, row]. Red leaves its top-left yard onto the left arm heading
 * right, and the loop is the usual cross: five along an arm, three around each
 * corner, repeat. Seats sit exactly 13 apart, which is what makes START work.
 */
export const PATH: ReadonlyArray<readonly [number, number]> = [
  // left arm, heading right along row 6
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  // up the left side of the top arm
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1],
  // over the top
  [6, 0], [7, 0], [8, 0],
  // down the right side of the top arm
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  // right arm, heading right along row 6
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6],
  // around the right point
  [14, 6], [14, 7], [14, 8],
  // back along row 8
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  // down the right side of the bottom arm
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13],
  // around the bottom
  [8, 14], [7, 14], [6, 14],
  // up the left side of the bottom arm
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  // back along row 8 to the left point
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8],
  [0, 8], [0, 7], [0, 6],
];

/**
 * The five private squares each seat runs down after a full lap, ending at the
 * centre. Every one points inward along the middle row or column.
 */
export const HOME_PATH: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],       // red, rightward
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],       // green, downward
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],   // yellow, leftward
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],   // blue, upward
];

/** The 6x6 corner each seat parks in, as [col, row] of its top-left cell. */
export const YARD_ORIGIN: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [9, 0], [9, 9], [0, 9],
];

/** Where the four idle tokens sit inside a yard, as centres. */
const YARD_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5],
];

/** Finished tokens, fanned around the centre so four do not stack into one. */
const HOME_SPOT: ReadonlyArray<readonly [number, number]> = [
  [6.6, 7.5], [7.5, 6.6], [8.4, 7.5], [7.5, 8.4],
];

/** Absolute track square, or -1 when off the shared track. */
export function absSquare(seat: Seat, pos: number): number {
  return pos >= 0 && pos <= 51 ? (START[seat] + pos) % TRACK : -1;
}

export function isSafe(abs: number): boolean {
  return SAFE.includes(abs as (typeof SAFE)[number]);
}

/** Screen position of a token, in cell units, as a centre point. */
export function tokenCell(
  seat: Seat,
  pos: number,
  tokenIndex: number,
): { x: number; y: number } {
  if (pos === -1) {
    const [ox, oy] = YARD_ORIGIN[seat];
    const [sx, sy] = YARD_SLOTS[tokenIndex];
    return { x: ox + sx, y: oy + sy };
  }

  if (pos === HOME) {
    const [x, y] = HOME_SPOT[seat];
    return { x, y };
  }

  if (pos >= TRACK) {
    const [x, y] = HOME_PATH[seat][pos - TRACK];
    return { x: x + 0.5, y: y + 0.5 };
  }

  const [x, y] = PATH[absSquare(seat, pos)];
  return { x: x + 0.5, y: y + 0.5 };
}

/* ------------------------------------------------------------------- rules */

export interface LudoPlayer {
  seat: Seat;
  kind: 'human' | 'bot';
  name?: string;
  accuracy?: number;
  tokens: number[];
}

export interface LudoState {
  slug: 'ludo';
  turn: number;
  pending_roll: number | null;
  sixes: number;
  winner: number | null;
  players: LudoPlayer[];
}

export interface LudoMove {
  token: number;
  from: number;
  to: number;
  capture: { seat: number; token: number } | null;
}

/**
 * Advisory mirror of `public.ludo_legal_moves`. Used only to decide which
 * tokens are tappable — the server decides what actually happens.
 */
export function legalMoves(state: LudoState, seat: Seat, roll: number): LudoMove[] {
  const tokens = state.players[seat]?.tokens ?? [];
  const moves: LudoMove[] = [];

  tokens.forEach((pos, token) => {
    let to: number;

    if (pos === HOME) return;
    if (pos === -1) {
      if (roll !== 6) return;      // a six is the only way out
      to = 0;
    } else {
      to = pos + roll;
      if (to > HOME) return;       // home must be hit exactly, never overshot
    }

    moves.push({ token, from: pos, to, capture: captureAt(state, seat, to) });
  });

  return moves;
}

function captureAt(
  state: LudoState,
  seat: Seat,
  to: number,
): { seat: number; token: number } | null {
  if (to > 51) return null;        // the home column is private

  const abs = absSquare(seat, to);
  if (isSafe(abs)) return null;

  for (let s = 0; s < 4; s++) {
    if (s === seat) continue;
    const tokens = state.players[s]?.tokens ?? [];
    for (let t = 0; t < tokens.length; t++) {
      const p = tokens[t];
      if (p >= 0 && p <= 51 && absSquare(s as Seat, p) === abs) {
        return { seat: s, token: t };
      }
    }
  }
  return null;
}

/** How far round a seat is, for the progress readout beside each name. */
export function seatProgress(player: LudoPlayer): { home: number; out: number } {
  return {
    home: player.tokens.filter((p) => p === HOME).length,
    out: player.tokens.filter((p) => p >= 0 && p < HOME).length,
  };
}
