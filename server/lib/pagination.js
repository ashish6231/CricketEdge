function pagination(query = {}, defaultLimit = 20, maxLimit = 100) {
  const integer = (value,fallback,max) => {
    const number=Number(value);
    return Number.isSafeInteger(number) && number>0 ? Math.min(number,max) : fallback;
  };
  const page=integer(query.page,1,1000000),limit=integer(query.limit,defaultLimit,maxLimit);
  return {page,limit,skip:(page-1)*limit};
}

// Full feeds remain compatible with Socket.IO. HTTP clients can request bounded pages.
function paginateMatches(payload,query={}) {
  if(query.page==null && query.limit==null)return payload;
  const {page,limit,skip}=pagination(query,50,100);
  const search=String(query.search||'').trim().toLowerCase().slice(0,120);
  const matches=(payload.matches||[]).filter(match=>!search
    || `${match.matchName||''} ${match.competitionName||''}`.toLowerCase().includes(search));
  return {...payload,total:matches.length,matches:matches.slice(skip,skip+limit),
    pagination:{page,limit,total:matches.length,pages:Math.ceil(matches.length/limit)}};
}
module.exports={pagination,paginateMatches};
