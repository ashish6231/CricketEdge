require('dotenv').config();
if(!process.env.REDIS_URL)throw new Error('The standalone capture worker requires REDIS_URL');
process.env.ADMIN_JOB_WORKER_ENABLED='true';
require('../lib/tracing');
const {getAdminJobs,closeAdminJobs}=require('../services/adminJobs');
getAdminJobs();
async function stop(){await closeAdminJobs();await require('../lib/tracing').shutdown();process.exit(0)}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
