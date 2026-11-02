const path = require('node:path');
function setStaticCacheHeaders(res, filePath) {
  const hashed = filePath.split(path.sep).includes('assets') && /[.-][\w-]{8,}\.(?:js|css|woff2?|avif|webp)$/.test(path.basename(filePath));
  res.setHeader('Cache-Control', path.extname(filePath)==='.html' ? 'no-cache'
    : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
}
module.exports={setStaticCacheHeaders};
