const { getCricketFullData, warmup } = require('./server/services/scraper');
(async () => {
  await warmup();
  const data = await getCricketFullData(true);
  console.log(JSON.stringify(data.matches[0], null, 2));
})();
