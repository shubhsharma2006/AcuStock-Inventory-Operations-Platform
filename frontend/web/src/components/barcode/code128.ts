/**
 * Zero-dependency pure TypeScript Code 128 (Subset B) SVG generator.
 * Encodes alphanumeric text into crisp, scalable vector barcode SVGs.
 */

// Code 128 patterns (widths of alternating bars and spaces, 6 digits summing to 11)
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Encodes text into Code 128B binary bar array (1 = bar, 0 = space)
 */
export function encodeCode128B(text: string): number[] {
  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const value = charCode - 32; // Code 128B ASCII mapping
    if (value >= 0 && value <= 95) {
      codes.push(value);
      checksum += value * (i + 1);
    }
  }

  codes.push(checksum % 103);
  codes.push(STOP_CODE);

  // Convert pattern strings to binary bits
  const bits: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // quiet zone
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    let isBar = 1;
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      for (let w = 0; w < width; w++) {
        bits.push(isBar);
      }
      isBar = isBar === 1 ? 0 : 1;
    }
  }
  bits.push(1, 1); // stop bar extension
  for (let q = 0; q < 10; q++) bits.push(0); // trailing quiet zone

  return bits;
}

/**
 * Generates an SVG string or data URL for Code 128
 */
export function generateCode128Svg(text: string, options: { height?: number; barWidth?: number; showText?: boolean } = {}): string {
  const { height = 50, barWidth = 2, showText = true } = options;
  const bits = encodeCode128B(text);
  const totalWidth = bits.length * barWidth;
  const svgHeight = showText ? height + 18 : height;

  const rects: string[] = [];
  let currentRun = 0;
  let runStart = 0;

  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 1) {
      if (currentRun === 0) runStart = i;
      currentRun++;
    } else if (currentRun > 0) {
      rects.push(`<rect x="${runStart * barWidth}" y="0" width="${currentRun * barWidth}" height="${height}" fill="currentColor" />`);
      currentRun = 0;
    }
  }
  if (currentRun > 0) {
    rects.push(`<rect x="${runStart * barWidth}" y="0" width="${currentRun * barWidth}" height="${height}" fill="currentColor" />`);
  }

  const textElement = showText
    ? `<text x="${totalWidth / 2}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="600" fill="currentColor">${text}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${svgHeight}" width="${totalWidth}" height="${svgHeight}" class="select-none">
    ${rects.join("")}
    ${textElement}
  </svg>`;
}
