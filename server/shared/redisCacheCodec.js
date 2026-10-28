const {gzipSync,gunzipSync,constants}=require('node:zlib');

const PREFIX='cricedge:gzip:v1:';
const isCacheKey=key=>/^(?:matches:|match:|crex:overview$)/.test(String(key));

function encodeCacheValue(value){
  if(typeof value!=='string'||Buffer.byteLength(value)<2048)return value;
  const compressed=PREFIX+gzipSync(value,{level:constants.Z_BEST_SPEED}).toString('base64');
  return Buffer.byteLength(compressed)<Buffer.byteLength(value)?compressed:value;
}
function decodeCacheValue(value){
  if(typeof value!=='string'||!value.startsWith(PREFIX))return value;
  return gunzipSync(Buffer.from(value.slice(PREFIX.length),'base64')).toString('utf8');
}

/** Only application snapshot/list keys. BullMQ, auth cookies and locks stay untouched. */
function installCacheCompression(client){
  const originalSet=client.set.bind(client),originalGet=client.get.bind(client);
  client.set=function(key,value,...args){
    return originalSet(key,isCacheKey(key)?encodeCacheValue(value):value,...args);
  };
  client.get=async function(key){
    const value=await originalGet(key);
    return isCacheKey(key)?decodeCacheValue(value):value;
  };
  return client;
}
module.exports={encodeCacheValue,decodeCacheValue,installCacheCompression};
