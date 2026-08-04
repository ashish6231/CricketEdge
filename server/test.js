const axios = require('axios');
axios.get('https://tennisliveload.com/api/toss/matches').then(res => {
  const matchId = res.data[0].matchId;
  console.log("MatchId:", matchId);
  return axios.get(`https://tennisliveload.com/api/toss/snapshot?matchId=${matchId}`);
}).then(res => {
  console.log(JSON.stringify(res.data, null, 2).slice(0, 1000));
}).catch(console.error);
