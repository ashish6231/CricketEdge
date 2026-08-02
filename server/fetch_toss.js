const fetch = require('node-fetch');
fetch('http://localhost:5000/api/cricket/toss/match/33420067') // We need a valid matchId, or we can just fetch all toss matches and pick one
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
