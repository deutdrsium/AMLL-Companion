import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lrclibRows } from '../shared/lyrics-http.mjs';
const signal = () => new AbortController().signal;
const ok = rows => ({ok:true, json:async()=>rows});
const unavailable = {ok:false,status:503};
test('browser 503 recovers through native HTTP without repeating the failing transport', async () => {
  let nativeCalls=0, browserCalls=0;
  const rows=await lrclibRows('test',signal(),async()=>{browserCalls++;return unavailable;}, {
    nativeSearch:async title=>{assert.equal(title,'test');nativeCalls++;return {status:200,rows:[{id:1}]};},
  });
  assert.deepEqual(rows,[{id:1}]);assert.equal(browserCalls,1);assert.equal(nativeCalls,1);
});
test('503 retries with backoff, then caches success across requests', async () => {
  let calls=0, saved; const delays=[];
  const options={sleep:async ms=>delays.push(ms), storage:{getItem:()=>saved,setItem:(_,v)=>saved=v}};
  const fetcher=async()=>++calls<3?unavailable:ok([{id:1}]);
  assert.deepEqual(await lrclibRows('七里香',signal(),fetcher,options),[{id:1}]);
  assert.deepEqual(delays,[1000,2000]);
  assert.equal(calls,3);
  assert.deepEqual(await lrclibRows('七里香',signal(),async()=>{throw Error('offline');},options),[{id:1}]);
});
test('persistent 503 is reported accurately and never cached', async () => {
  let calls=0, writes=0;
  await assert.rejects(lrclibRows('test',signal(),async()=>{calls++;return unavailable;},
    {sleep:async()=>{},storage:{setItem:()=>writes++}}), /503.*3 次/);
  assert.equal(calls,3); assert.equal(writes,0);
});
test('nontransient errors do not retry; track switch cancels pending retry', async () => {
  let calls=0;
  await assert.rejects(lrclibRows('test',signal(),async()=>{calls++;return {ok:false,status:400};}),/400/);
  assert.equal(calls,1);
  const controller=new AbortController(); calls=0;
  await assert.rejects(lrclibRows('test',controller.signal,async()=>{calls++;return unavailable;},
    {sleep:async()=>controller.abort()}),{name:'AbortError'});
  assert.equal(calls,1);
});
