import type { CSSProperties } from "react";
import { site } from "@/content/site";
import { buildTiles } from "@/lib/mosaic/assign";
import type { Board } from "@/lib/mosaic/glyphs";

/**
 * The finished headline: a CSS grid of photo tiles spelling the headline.
 * Server-rendered so the final layout exists before any script runs; the intro
 * measures these tiles and flies its prints into exactly these positions.
 */
export default function Mosaic({ board }: { board: Board }) {
  const tiles = buildTiles(board, site.mosaic.images, site.mosaic.periodImage);
  const period = board.cells.find((c) => c.span === 2);

  return (
    <span
      className="mosaic"
      aria-hidden="true"
      style={
        {
          "--pcx": period ? period.col + 1 : board.cols,
          "--pcy": period ? period.row + 1 : board.rows,
        } as CSSProperties
      }
    >
      {tiles.map((t) => (
        <span
          key={t.order}
          className={t.span === 2 ? "tile tile--period" : "tile"}
          data-i={t.order}
          data-glyph={t.glyph}
          style={
            {
              gridColumn: `${t.col + 1} / span ${t.span}`,
              gridRow: `${t.row + 1} / span ${t.span}`,
              "--o": t.order,
              "--d": Number(t.rippleDistance.toFixed(2)),
            } as CSSProperties
          }
        >
          {/* Plain <img>: the intro needs exact box control and decode(), and 24 files are shared by 108 tiles. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.image.src}
            alt=""
            decoding="async"
            draggable={false}
            style={t.image.focal ? { objectPosition: t.image.focal } : undefined}
          />
        </span>
      ))}
      <span className="mosaic-fx">
        <span className="mosaic-ripple" />
        <span className="mosaic-sheen">
          <span />
        </span>
      </span>
    </span>
  );
}