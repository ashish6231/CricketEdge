require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const fs = require('node:fs/promises');
const { captureWomensSpring, DEFAULT_SPRING_SERIES_URL } = require('../services/womensSpringCapture');
const { parseCrexSeriesMatches } = require('../services/crexService');
const { startWomensSpringWorker } = require('../services/womensSpringWorker');

async function main() {
  const scraper = process.argv.includes('--market-feed')
    ? require('../services/cachedMarketFeed').createCachedMarketFeed()
    : { getCricketMatches: () => ({ matches: [], feedStatus: 'not-requested' }) };
  const options = { scraper };
  const htmlIndex = process.argv.indexOf('--series-html');
  if (htmlIndex >= 0) {
    if (!process.argv[htmlIndex + 1]) throw new Error('--series-html requires a file');
    const html = await fs.readFile(process.argv[htmlIndex + 1], 'utf8');
    options.fetchSeries = async url => parseCrexSeriesMatches(html, url);
    options.seriesUrls = [DEFAULT_SPRING_SERIES_URL];
  }
  const capture = async () => console.log(JSON.stringify(await captureWomensSpring(options)));
  if (!process.argv.includes('--watch')) return capture();
  const worker = startWomensSpringWorker({ capture });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { worker.stop(); process.exit(0); });
}
main().then(() => { if (!process.argv.includes('--watch')) process.exit(0); })
  .catch(error => { console.error(error.message); process.exit(1); });
