import sharp from "sharp";

/**
 * Server-side fallback for rasterizing a diagram SVG to a PNG data URI when
 * the client could not produce one. librsvg ignores foreignObject content,
 * so labels rendered as HTML may be absent — the client canvas (which draws
 * them natively) is always preferred.
 */
export async function rasterizeSvgToPngDataUrl(
  svg: string,
  maxWidth = 2400,
): Promise<string | null> {
  try {
    const png = await sharp(Buffer.from(svg), { density: 192 })
      .resize({ width: maxWidth, withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
