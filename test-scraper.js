const scraper = require('./server/services/scraper');
scraper.getAllTossMatches().then(res => console.log(JSON.stringify(res, null, 2)));
