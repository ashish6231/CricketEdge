const { getCacheRedisClient } = require('../shared/redis');

// Only public, non-personal data belongs here. Never cache account authorization.
function createReadCache({ getRedis=getCacheRedisClient, ttl=15, maxEntries=100 }={}) {
  const local=new Map(),pending=new Map();
  async function remember(key,load) {
    const saved=local.get(key);
    if(saved && saved.until>Date.now())return saved.value;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      let value;
      try { const raw=await getRedis().get(`public:${key}`);if(raw!=null)value=JSON.parse(raw); } catch {}
      if(value===undefined) {
        value=await load();
        if(value!=null) getRedis().set(`public:${key}`,JSON.stringify(value),'EX',ttl).catch(()=>{});
      }
      if(value!=null) {
        if(local.size>=maxEntries)local.delete(local.keys().next().value);
        local.set(key,{value,until:Date.now()+ttl*1000});
      }
      return value;
    })().finally(()=>pending.delete(key));
    pending.set(key,task);return task;
  }
  return {remember,async invalidate(key){local.delete(key);try{await getRedis().del(`public:${key}`)}catch{}}};
}
module.exports={createReadCache,publicCache:createReadCache()};
