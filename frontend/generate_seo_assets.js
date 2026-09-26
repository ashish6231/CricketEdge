import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const assetsDir = path.join(__dirname, 'src', 'assets');

// Source user-uploaded logo
const sourceLogoPath = '/Users/ashish/.gemini/antigravity-ide/brain/418face2-b02b-4191-a6e8-f6d5419eba25/.user_uploaded/media_1790435710800.jpg';

// Helper to assemble standard multi-size PNG-compressed ICO file
function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // count

  let currentOffset = 6 + count * 16;
  const directoryEntries = [];

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // image size
    entry.writeUInt32LE(currentOffset, 12); // image offset

    directoryEntries.push(entry);
    currentOffset += item.buffer.length;
  }

  return Buffer.concat([
    header,
    ...directoryEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);
}

async function main() {
  console.log('Processing CricEdge user logo for all website icons...');

  if (!fs.existsSync(sourceLogoPath)) {
    throw new Error('Source logo not found at: ' + sourceLogoPath);
  }

  // 1. Copy original high-res logo to public & assets
  const masterBuffer = await sharp(sourceLogoPath)
    .png({ quality: 95, compressionLevel: 8 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, 'logo.png'), masterBuffer);
  fs.writeFileSync(path.join(assetsDir, 'cricedge-logo.png'), masterBuffer);
  console.log('Saved public/logo.png & src/assets/cricedge-logo.png');

  // 2. Generate standard icon sizes
  const sizes = [16, 32, 48, 96, 144, 180, 192, 512];
  const pngResults = {};

  for (const size of sizes) {
    const buf = await sharp(masterBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 5, g: 7, b: 12, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    pngResults[size] = buf;

    if (size === 48) {
      fs.writeFileSync(path.join(publicDir, 'favicon-48x48.png'), buf);
      console.log('Saved favicon-48x48.png (Google search requirement)');
    }
    if (size === 96) {
      fs.writeFileSync(path.join(publicDir, 'favicon-96x96.png'), buf);
      console.log('Saved favicon-96x96.png');
    }
    if (size === 180) {
      fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), buf);
      console.log('Saved apple-touch-icon.png (180x180)');
    }
    if (size === 192) {
      fs.writeFileSync(path.join(publicDir, 'favicon-192x192.png'), buf);
      fs.writeFileSync(path.join(publicDir, 'icon-192x192.png'), buf);
      console.log('Saved favicon-192x192.png & icon-192x192.png');
    }
    if (size === 512) {
      fs.writeFileSync(path.join(publicDir, 'favicon-512x512.png'), buf);
      fs.writeFileSync(path.join(publicDir, 'icon-512x512.png'), buf);
      console.log('Saved favicon-512x512.png & icon-512x512.png');
    }
  }

  // 3. Multi-resolution favicon.ico (16, 32, 48)
  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: pngResults[16] },
    { width: 32, height: 32, buffer: pngResults[32] },
    { width: 48, height: 48, buffer: pngResults[48] }
  ]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Saved multi-resolution favicon.ico');

  // 4. SVG Favicon wrapping the high-res 512 logo
  const base64Png = pngResults[512].toString('base64');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/png;base64,${base64Png}" x="0" y="0" width="512" height="512" />
</svg>`;
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
  console.log('Saved favicon.svg');

  // 5. OpenGraph preview image (1200x630) using the actual logo
  const logoSquare380 = await sharp(masterBuffer)
    .resize(380, 380, { fit: 'contain' })
    .png()
    .toBuffer();

  const ogComposite = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 5, g: 7, b: 12, alpha: 1 }
    }
  })
    .composite([
      { input: logoSquare380, top: 125, left: 80 }
    ])
    .png()
    .toBuffer();

  // Add stylish graphic elements & text to OG image
  const ogSvgOverlay = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <!-- Subtle glow behind logo -->
    <circle cx="270" cy="315" r="220" fill="#dc2626" opacity="0.18" filter="blur(60px)" />
    <circle cx="270" cy="315" r="160" fill="#f59e0b" opacity="0.12" filter="blur(40px)" />

    <!-- Typography on Right -->
    <g transform="translate(520, 200)">
      <!-- Live Line Badge -->
      <rect x="0" y="-30" width="140" height="34" rx="17" fill="rgba(220, 38, 38, 0.25)" stroke="#dc2626" stroke-width="1.5" />
      <circle cx="20" cy="-13" r="5" fill="#ef4444" />
      <text x="36" y="-7" fill="#fca5a5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" letter-spacing="1.5">LIVE CRICKET</text>

      <!-- Main Title -->
      <text x="0" y="65" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" letter-spacing="-1">CRIC<tspan fill="#f59e0b">EDGE</tspan></text>

      <!-- Taglines -->
      <text x="0" y="125" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700">Live Cricket Analytics &amp; Toss Predictions</text>
      <text x="0" y="165" fill="#9ca3af" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="500">Fast Ball-by-Ball Scores • Match Odds • Deep Stats</text>

      <!-- Domain Badge -->
      <g transform="translate(0, 210)">
        <rect x="0" y="0" width="220" height="44" rx="10" fill="#111827" stroke="#f59e0b" stroke-width="1.5" />
        <text x="24" y="28" fill="#fbbf24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="800">www.cricedge.in</text>
      </g>
    </g>
  </svg>`;

  const finalOgBuffer = await sharp(ogComposite)
    .composite([{ input: Buffer.from(ogSvgOverlay), top: 0, left: 0 }])
    .png({ quality: 90, compressionLevel: 8 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, 'og-image.png'), finalOgBuffer);
  console.log('Saved og-image.png with new logo!');

  console.log('All icons and SEO assets generated with the new CricEdge logo!');
}

main().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
