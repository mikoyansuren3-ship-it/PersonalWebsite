/**
 * Bitmap letterforms for the mosaic headline.
 *
 * Each glyph is a grid seven rows tall (cap height = 7 rows, x-height = rows 2–6).
 * A lit cell holds its pen-stroke index (1–9, then a–z for 10+), which sets the
 * order the intro lands that letter's tiles in, so every letter visibly "draws itself".
 * "." marks an empty cell.
 */

const GLYPHS: Record<string, string[]> = {
  M: [
    "7...c",
    "68.bd",
    "5.9.e",
    "4.a.f",
    "3...g",
    "2...h",
    "1...i",
  ],
  e: [
    "....",
    "....",
    ".76.",
    "8..5",
    "1234",
    "9...",
    ".abc",
  ],
  t: [
    "...",
    ".1.",
    "829",
    ".3.",
    ".4.",
    ".5.",
    ".67",
  ],
  S: [
    ".432.",
    "5...1",
    "6....",
    ".789.",
    "....a",
    "f...b",
    ".edc.",
  ],
  u: [
    "....",
    "....",
    "1..b",
    "2..a",
    "3..9",
    "4..8",
    ".567",
  ],
  r: [
    "....",
    "....",
    "1.78",
    "26..",
    "3...",
    "4...",
    "5...",
  ],
  n: [
    "....",
    "....",
    "167.",
    "2..8",
    "3..9",
    "4..a",
    "5..b",
  ],
};

export const GLYPH_HEIGHT = 7;
/** Empty rows between the two lines of the board. */
const LINE_LEADING = 2;
/** Empty columns between letters. */
const LETTER_GAP = 1;

export type BoardCell = {
  /** Index in landing order (0-based). */
  order: number;
  /** Top-left cell column/row on the board (0-based). */
  col: number;
  row: number;
  /** 1 for a normal tile, 2 for the 2×2 full stop. */
  span: 1 | 2;
  /** Which glyph (0-based, reading order, spaces excluded) the cell belongs to. */
  glyph: number;
  /** Which line (0 or 1) the cell sits on. */
  line: number;
  /** Position of this cell within its glyph's pen order (0-based). */
  stroke: number;
  /** Number of cells in this cell's glyph. */
  glyphSize: number;
};

export type Board = {
  cols: number;
  rows: number;
  cells: BoardCell[];
  /** Number of glyphs (letters + full stop). */
  glyphCount: number;
  /** Index of the first glyph on the second line. */
  secondLineStart: number;
  /** Column where each line's text ends (exclusive). */
  lineWidths: number[];
};

function strokeValue(ch: string): number {
  if (ch >= "1" && ch <= "9") return ch.charCodeAt(0) - 48;
  return ch.charCodeAt(0) - 87; // "a" -> 10
}

/**
 * Lay the headline out as a two-line board: the first word on line one, the rest on
 * line two. A trailing "." becomes a 2×2 tile sitting on the baseline.
 */
export function buildBoard(headline: string): Board {
  const words = headline.trim().split(/\s+/);
  if (words.length < 2) throw new Error(`Mosaic headline needs two words, got "${headline}"`);
  const lines = [words[0], words.slice(1).join("")];

  const cells: Omit<BoardCell, "order">[] = [];
  const lineWidths: number[] = [];
  let glyph = 0;
  let secondLineStart = 0;

  lines.forEach((text, line) => {
    if (line === 1) secondLineStart = glyph;
    const top = line * (GLYPH_HEIGHT + LINE_LEADING);
    let x = 0;
    for (const ch of text) {
      if (ch === ".") {
        cells.push({ col: x, row: top + GLYPH_HEIGHT - 2, span: 2, glyph, line, stroke: 0, glyphSize: 1 });
        x += 2 + LETTER_GAP;
        glyph++;
        continue;
      }
      const rows = GLYPHS[ch];
      if (!rows) throw new Error(`No mosaic glyph for "${ch}". Add one in src/lib/mosaic/glyphs.ts.`);
      const lit: { col: number; row: number; stroke: number }[] = [];
      rows.forEach((rowStr, r) => {
        [...rowStr].forEach((c, cIdx) => {
          if (c !== ".") lit.push({ col: x + cIdx, row: top + r, stroke: strokeValue(c) });
        });
      });
      lit.sort((a, b) => a.stroke - b.stroke);
      lit.forEach((cell, i) => {
        if (cell.stroke !== i + 1) throw new Error(`Glyph "${ch}" has a gap or duplicate in its pen order`);
        cells.push({ col: cell.col, row: cell.row, span: 1, glyph, line, stroke: i, glyphSize: lit.length });
      });
      x += rows[0].length + LETTER_GAP;
      glyph++;
    }
    lineWidths.push(x - LETTER_GAP);
  });

  return {
    cols: Math.max(...lineWidths),
    rows: GLYPH_HEIGHT * 2 + LINE_LEADING,
    cells: cells.map((c, order) => ({ ...c, order })),
    glyphCount: glyph,
    secondLineStart,
    lineWidths,
  };
}
