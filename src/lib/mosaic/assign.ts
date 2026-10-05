import type { MosaicImage } from "@/content/site";
import type { Board } from "./glyphs";

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks an image for every letter cell so that identical photos sit as far apart as
 * possible and every photo is used about equally. Depends only on the board geometry
 * and the number of images, so replacing one image's `src` swaps exactly its tiles.
 * Returns an image index per cell (in board order); the full stop is excluded (-1).
 */
export function assignImages(board: Board, imageCount: number, seed = 7): number[] {
  if (imageCount < 4) throw new Error("The mosaic needs at least 4 images");
  const rand = rng(seed);
  const uses = new Array<number>(imageCount).fill(0);
  const placed: { col: number; row: number }[][] = Array.from({ length: imageCount }, () => []);
  const result = new Array<number>(board.cells.length).fill(-1);

  for (const cell of board.cells) {
    if (cell.span === 2) continue;
    let best = -1;
    let bestKey: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < imageCount; i++) {
      let dist = 8;
      for (const q of placed[i]) {
        dist = Math.min(dist, Math.max(Math.abs(q.col - cell.col), Math.abs(q.row - cell.row)));
      }
      const key: [number, number, number] = [dist, -uses[i], rand()];
      if (
        key[0] > bestKey[0] ||
        (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))
      ) {
        best = i;
        bestKey = key;
      }
    }
    result[cell.order] = best;
    uses[best]++;
    placed[best].push({ col: cell.col, row: cell.row });
  }
  return result;
}

export type MosaicTile = {
  order: number;
  col: number;
  row: number;
  span: 1 | 2;
  glyph: number;
  image: MosaicImage;
  /** Distance (in cells) from the full stop, used by the landing ripple. */
  rippleDistance: number;
};

export function buildTiles(board: Board, images: MosaicImage[], periodImage: MosaicImage): MosaicTile[] {
  const picks = assignImages(board, images.length);
  const period = board.cells.find((c) => c.span === 2);
  const pcx = period ? period.col + 1 : board.cols;
  const pcy = period ? period.row + 1 : board.rows;
  return board.cells.map((cell) => ({
    order: cell.order,
    col: cell.col,
    row: cell.row,
    span: cell.span,
    glyph: cell.glyph,
    image: cell.span === 2 ? periodImage : images[picks[cell.order]],
    rippleDistance: Math.hypot(cell.col + 0.5 - pcx, cell.row + 0.5 - pcy),
  }));
}