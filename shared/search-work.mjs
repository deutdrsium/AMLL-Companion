// Share requests only within one track lookup, so corrected aliases reuse raw search responses.
export function memoizeSearchRequest(request){
  const pending=new Map();
  return (...args)=>{
    const signal=args.at(-1);signal.throwIfAborted();
    const key=JSON.stringify(args.slice(0,-1));
    if(!pending.has(key)){
      const promise=Promise.resolve().then(()=>request(...args));
      pending.set(key,promise);
      promise.catch(()=>{if(pending.get(key)===promise)pending.delete(key);});
    }
    return pending.get(key);
  };
}
export async function eachSearchQuery(queries,signal,work){
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,queries.length)},async()=>{
    while(cursor<queries.length){signal.throwIfAborted();await work(queries[cursor++]);}
  }));
  signal.throwIfAborted();
}
