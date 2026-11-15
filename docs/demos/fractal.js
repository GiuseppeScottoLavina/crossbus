// Mandelbrot tile renderer shared by the Workers and the main-thread mode.

const STOPS = [
    [0.00, [11, 22, 34]],
    [0.18, [47, 91, 255]],
    [0.42, [14, 159, 118]],
    [0.64, [232, 178, 58]],
    [0.82, [243, 245, 246]],
    [1.00, [11, 22, 34]]
];

/** 1,024-entry RGB lookup table, cycled by the smooth iteration count. */
export function buildPalette(size = 1024) {
    const lut = new Uint8ClampedArray(size * 3);
    for (let i = 0; i < size; i++) {
        const t = i / size;
        let k = 0;
        while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
        const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1];
        const f = (t - t0) / (t1 - t0);
        const e = f * f * (3 - 2 * f);
        for (let ch = 0; ch < 3; ch++) lut[i * 3 + ch] = c0[ch] + (c1[ch] - c0[ch]) * e;
    }
    return lut;
}

/**
 * Renders one tile. Pixel (px, py) of the full image maps to
 * (cx + (px - width / 2) * scale, cy + (py - height / 2) * scale).
 * @returns {{ x: number, y: number, w: number, h: number, pixels: Uint8ClampedArray }}
 */
export function renderTile({ x, y, w, h, width, height, cx, cy, scale, maxIter }, palette) {
    const pixels = new Uint8ClampedArray(w * h * 4);
    const size = palette.length / 3;
    const log2 = Math.log(2);
    let offset = 0;
    for (let py = 0; py < h; py++) {
        const ci = cy + (y + py - height / 2) * scale;
        for (let px = 0; px < w; px++) {
            const cr = cx + (x + px - width / 2) * scale;
            let zr = 0, zi = 0, zr2 = 0, zi2 = 0, n = 0;
            // Skip the main cardioid and period-2 bulb, which never escape.
            const q = (cr - 0.25) * (cr - 0.25) + ci * ci;
            if (q * (q + (cr - 0.25)) <= 0.25 * ci * ci || (cr + 1) * (cr + 1) + ci * ci <= 0.0625) n = maxIter;
            while (n < maxIter && zr2 + zi2 <= 256) {
                zi = 2 * zr * zi + ci;
                zr = zr2 - zi2 + cr;
                zr2 = zr * zr;
                zi2 = zi * zi;
                n++;
            }
            if (n >= maxIter) {
                pixels[offset] = 8; pixels[offset + 1] = 14; pixels[offset + 2] = 20;
            } else {
                const mu = n + 1 - Math.log(Math.log(zr2 + zi2) / 2 / log2) / log2;
                const index = (Math.floor(mu * 22) % size + size) % size * 3;
                pixels[offset] = palette[index]; pixels[offset + 1] = palette[index + 1]; pixels[offset + 2] = palette[index + 2];
            }
            pixels[offset + 3] = 255;
            offset += 4;
        }
    }
    return { x, y, w, h, pixels };
}
