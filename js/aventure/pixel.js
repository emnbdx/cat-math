/**
 * Petit moteur de pixel-art : tout est dessiné à la main sur des canvas 16×16,
 * aucune image à héberger.
 *
 * Une « grille » est un tableau de chaînes, un caractère = un pixel. Le
 * caractère est une clé dans une palette ; `.` et l'espace sont transparents.
 */

export const TILE = 16;

/** Canvas hors écran, rendu net (pas de lissage). */
export function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { cv, ctx };
}

/** Dessine une grille de pixels. `flip` retourne horizontalement. */
export function drawGrid(ctx, grid, palette, x = 0, y = 0, flip = false) {
  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (!color) continue;
      const px = flip ? line.length - 1 - col : col;
      ctx.fillStyle = color;
      ctx.fillRect(x + px, y + row, 1, 1);
    }
  }
}

/** Duplique en miroir la moitié gauche d'un sprite symétrique. */
export function mirror(halfGrid) {
  return halfGrid.map((line) => line + [...line].reverse().join(''));
}

/**
 * Bruit déterministe : deux tuiles de mêmes coordonnées auront toujours le
 * même décor, sans avoir à mémoriser quoi que ce soit.
 */
export function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
