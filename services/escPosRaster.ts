import { Buffer } from 'buffer';
import { PNG } from 'pngjs/browser';

const GS = 0x1d;

type RasterOptions = {
  threshold?: number;
};

export function rasterizePngToEscPos(pngBase64: string, options?: RasterOptions): Uint8Array {
  const threshold = options?.threshold ?? 180;
  const png = PNG.sync.read(Buffer.from(pngBase64, 'base64'));
  const { width, height, data } = png;
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  const header = [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH];
  const imageBytes: number[] = new Array(widthBytes * height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const alpha = a / 255;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const isBlack = alpha > 0.05 && luminance < threshold;

      if (isBlack) {
        const byteIndex = y * widthBytes + (x >> 3);
        imageBytes[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }

  return new Uint8Array([...header, ...imageBytes]);
}
