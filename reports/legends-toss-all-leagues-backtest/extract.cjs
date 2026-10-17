// Read-only extraction: no store initialization, captures, migrations or updates.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
require('../../server/node_modules/dotenv').config({ path: path.join(__dirname, '../../server/.env'), quiet: true });
const prisma = require('../../server/db/prisma');

async function main() {
  const rows = await prisma.$queryRawUnsafe('SELECT recordKey, payload FROM PredictionRecord WHERE datasetKey = ? ORDER BY recordKey', 'tosses');
  const records = rows.map(row => {
    const r = JSON.parse(row.payload);
    return {
      matchId: String(r.matchId), matchName: r.matchName, competitionName: r.competitionName,
      status: r.status, actualWinner: r.actualWinner ?? null,
      predictedWinner: r.predictedWinner ?? null, predictorVersion: r.predictorVersion ?? null,
      startTime: r.startTime ?? null, capturedAt: r.capturedAt ?? null,
      resultVerification: r.resultVerification ? {
        verification: r.resultVerification.verification ?? null,
        sourceStartTime: r.resultVerification.sourceStartTime ?? null,
      } : null,
      snapshot: {
        teamNames: r.snapshot?.teamNames ?? null,
        preMatchVolume: r.snapshot?.preMatchVolume ?? null,
        preMatchTotalBets: r.snapshot?.preMatchTotalBets ?? null,
      },
    };
  });
  const dataset = {
    queriedAt: new Date().toISOString(), source: 'Configured PredictionRecord database, datasetKey=tosses; read-only SELECT.',
    rawPayloadSha256: crypto.createHash('sha256').update(rows.map(r => `${r.recordKey}\0${r.payload}`).join('\n')).digest('hex'),
    records,
  };
  fs.writeFileSync(path.join(__dirname, 'inputs.json'), JSON.stringify(dataset, null, 2) + '\n');
  console.log(JSON.stringify({ records: records.length, statuses: records.reduce((a,r) => ({...a,[r.status]:(a[r.status]||0)+1}),{}), leagues: [...new Set(records.map(r=>r.competitionName))].length }));
}
main().then(() => prisma.$disconnect()).then(() => process.exit(0)).catch(async error => {
  console.error(error.code || error.message);
  await prisma.$disconnect();
  process.exit(1);
});
