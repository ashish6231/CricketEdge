const { randomUUID } = require('node:crypto');

function createLocalJobQueue(handlers,{maxJobs=50,ttl=900000}={}) {
  const jobs=new Map(),waiting=[];
  let running=false;
  function sweep() {
    for(const [id,job] of jobs)if(job.finishedAt && Date.now()-job.finishedAt>ttl)jobs.delete(id);
  }
  async function drain() {
    if(running)return;
    running=true;
    while(waiting.length) {
      const job=waiting.shift();job.state='active';
      try{job.data=await handlers[job.type]();job.state='completed'}
      catch{job.state='failed';job.message='Capture failed; check server logs'}
      job.finishedAt=Date.now();
    }
    running=false;
  }
  return {
    async add(type) {
      if(!handlers[type])throw new Error('Unknown job type');
      sweep();
      const existing=[...jobs.values()].find(job=>job.type===type && ['waiting','active'].includes(job.state));
      if(existing)return existing;
      if(jobs.size>=maxJobs) {
        const finished=[...jobs.values()].find(job=>job.finishedAt);
        if(finished)jobs.delete(finished.id);
        else throw Object.assign(new Error('Job queue is busy'),{status:503});
      }
      const job={id:randomUUID(),type,state:'waiting'};
      jobs.set(job.id,job);waiting.push(job);setImmediate(drain);
      return {...job};
    },
    async get(id){sweep();const job=jobs.get(id);return job?{...job}:null},
  };
}

let service;
function getAdminJobs() {
  if(service)return service;
  const handlers={toss:()=>require('./tossCaptureWorker').runTossCaptureNow(),
    match:()=>require('./matchCaptureWorker').runMatchCaptureNow()};
  if(!process.env.REDIS_URL)return service=createLocalJobQueue(handlers);
  const {Queue,Worker}=require('bullmq');
  const {getRedisClient,getCacheRedisClient}=require('../shared/redis');
  const name='cricedge-admin-captures';
  const queue=new Queue(name,{connection:getCacheRedisClient(),defaultJobOptions:{
    attempts:1,removeOnComplete:{age:900,count:100},removeOnFail:{age:900,count:100}}});
  const worker=process.env.ADMIN_JOB_WORKER_ENABLED==='false' ? null
    : new Worker(name,job=>handlers[job.name](),{connection:getRedisClient(),concurrency:1});
  worker?.on('error',error=>console.warn('Capture queue:',error.message));
  worker?.on('failed',(_job,error)=>console.warn('Capture failed:',error.message));
  service={
    async add(type) {
      if(!handlers[type])throw new Error('Unknown job type');
      const job=await queue.add(type,{}, {deduplication:{id:type}});
      return {id:job.id,state:'waiting'};
    },
    async get(id) {
      const job=await queue.getJob(id);if(!job)return null;
      const state=await job.getState();
      return {id:job.id,state,data:state==='completed'?job.returnvalue:undefined,
        message:state==='failed'?'Capture failed; check server logs':undefined};
    },
    async close(){await worker?.close();await queue.close()},
  };
  return service;
}
async function closeAdminJobs(){await service?.close?.()}
module.exports={createLocalJobQueue,getAdminJobs,closeAdminJobs};
