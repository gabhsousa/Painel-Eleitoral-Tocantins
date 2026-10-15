const paletteStops: [number, [number, number, number]][] = [
  [0, [31, 72, 180]],
  [0.25, [31, 167, 211]],
  [0.48, [69, 190, 112]],
  [0.68, [247, 226, 71]],
  [0.84, [255, 126, 34]],
  [1, [204, 28, 25]],
];
export const heatPalette = (() => {
  const result = new Uint8ClampedArray(256 * 3);
  for (let index = 0; index < 256; index++) {
    const value = index / 255;
    let upper = paletteStops.findIndex((stop) => stop[0] >= value);
    if (upper <= 0) upper = 1;
    const [fromAt, from] = paletteStops[upper - 1],
      [toAt, to] = paletteStops[upper];
    const mix = (value - fromAt) / (toAt - fromAt);
    for (let channel = 0; channel < 3; channel++)
      result[index * 3 + channel] = Math.round(from[channel] + (to[channel] - from[channel]) * mix);
  }
  return result;
})();
