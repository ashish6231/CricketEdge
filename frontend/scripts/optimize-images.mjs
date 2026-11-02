import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
await Promise.all([48, 96].flatMap(size => ['webp', 'avif'].map(format =>
  sharp(`${publicDir}favicon-${size}x${size}.png`)
    .toFormat(format, { quality: 75, effort: format === 'avif' ? 4 : 4 })
    .toFile(`${publicDir}brand-${size}.${format}`))))
