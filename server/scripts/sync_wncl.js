require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});
const { captureWNCL } = require('../services/wnclCapture');
const { DEFAULT_WNCL_SERIES_URL } = require('../services/wnclCapture');
const { getCrexOverview, parseCrexSeriesMatches } = require('../services/crexService');
const fs = require('node:fs/promises');
async function main() {
  let scraper = {getCrexOverview,getCricketMatches:()=>({matches:[],feedStatus:'not-requested'})};
  if (process.argv.includes('--market-feed')) {
    const session = require('../services/scraper-tennisliveload/session');
    if (!await session.loadSavedSession()) throw new Error('Market feed session unavailable');
    const Adapter = require('../services/scraper-tennisliveload/adapter');
    const adapter = new Adapter();
    scraper = {getCrexOverview,getCricketMatches:()=>adapter._request('/api/cricket/matches'),
      getCricketSnapshot:id=>adapter.getSnapshot(id),getTossSnapshot:id=>adapter.getTossSnapshot(id)};
  }
  const options = {scraper};
  const fileIndex = process.argv.indexOf('--series-html');
  if (fileIndex !== -1) {
    if (!process.argv[fileIndex + 1]) throw new Error('--series-html requires a downloaded CREX series HTML file');
    const html = await fs.readFile(process.argv[fileIndex + 1], 'utf8');
    options.seriesUrls = [DEFAULT_WNCL_SERIES_URL];
    options.fetchSeries = async url => parseCrexSeriesMatches(html, url);
    options.initialFixtures = [];
  }
  console.log(JSON.stringify(await captureWNCL(options),null,2));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error.message);process.exit(1)});
