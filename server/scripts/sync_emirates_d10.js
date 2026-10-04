// One-shot backfill; ongoing captures run through the server's D10 worker.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const fs = require('node:fs/promises');
const { captureEmiratesD10, DEFAULT_SERIES_URL } = require('../services/emiratesD10Capture');
const { parseCrexSeriesMatches } = require('../services/crexService');

async function main() {
  const args = process.argv.slice(2);
  let scraper = { getCricketMatches: () => ({matches:[],feedStatus:'not-requested'}) };
  if (args.includes('--market-feed')) {
    const session = require('../services/scraper-tennisliveload/session');
    if (!await session.loadSavedSession()) throw new Error('Market feed session unavailable');
    const Adapter = require('../services/scraper-tennisliveload/adapter');
    const adapter = new Adapter();
    scraper = { getCricketMatches: () => adapter._request('/api/cricket/matches'),
      getCricketSnapshot: id => adapter.getSnapshot(id), getTossSnapshot: id => adapter.getTossSnapshot(id) };
  }
  const fileIndex = args.indexOf('--series-html');
  const options = { scraper };
  if (fileIndex !== -1) {
    if (!args[fileIndex + 1]) throw new Error('--series-html requires a downloaded CREX series HTML file');
    const html = await fs.readFile(args[fileIndex + 1], 'utf8');
    options.seriesUrls = [DEFAULT_SERIES_URL];
    options.fetchSeries = async url => parseCrexSeriesMatches(html, url);
  }
  const summary = await captureEmiratesD10(options);
  console.log(JSON.stringify(summary, null, 2));
}
main().then(() => process.exit(0)).catch(error => {
  console.error(error.message);
  process.exit(1);
});
