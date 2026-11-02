const session=require('express-session');

class RedisSessionStore extends session.Store {
  constructor(client){super();this.client=client}
  key(id){return `http-session:${id}`}
  ttl(value){return Math.max(1,Math.ceil((value.cookie?.maxAge ?? 86400000)/1000))}
  get(id,done){this.client.get(this.key(id)).then(value=>done(null,value?JSON.parse(value):null)).catch(done)}
  set(id,value,done=()=>{}){this.client.set(this.key(id),JSON.stringify(value),'EX',this.ttl(value)).then(()=>done()).catch(done)}
  destroy(id,done=()=>{}){this.client.del(this.key(id)).then(()=>done()).catch(done)}
  touch(id,value,done=()=>{}){this.client.expire(this.key(id),this.ttl(value)).then(()=>done()).catch(done)}
}
module.exports={RedisSessionStore};
