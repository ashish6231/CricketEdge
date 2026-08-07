/** Public API base URL — Railway custom domain or *.up.railway.app */
function getApiPublicUrl() {
  if (process.env.API_PUBLIC_URL) {
    return process.env.API_PUBLIC_URL.replace(/\/$/, '');
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return `http://localhost:${process.env.PORT || 5000}`;
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://www.cricedge.in').replace(/\/$/, '');
}

function getAllowedOrigins() {
  const defaults = [
    'https://www.cricedge.in',
    'https://cricedge.in',
    'https://cricketedge-production.up.railway.app',
    'https://cricketedge.app',
    'https://cricket-edge-online.vercel.app',
  ];
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const dev = process.env.NODE_ENV !== 'production'
    ? ['http://localhost:5173', 'http://localhost:3000']
    : [];
  return [...new Set([...defaults, ...fromEnv, ...dev])];
}

module.exports = { getApiPublicUrl, getFrontendUrl, getAllowedOrigins };
