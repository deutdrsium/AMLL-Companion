import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable=path.resolve(process.env.NATIVE_EXECUTABLE||'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe');
const folder=path.join(process.env.LOCALAPPDATA,'AMLL Companion','Logs');
const files=async()=>{try{return (await readdir(folder)).filter(f=>f.startsWith('debug-'));}catch(e){if(e.code==='ENOENT')return [];throw e;}};
for(const enabled of [false,true]){
 const before=new Set(await files());
 const host=spawn(executable,['--automation',...(enabled?['--debug']:[])],{windowsHide:true});
 const exited=once(host,'exit');let browser;
 try{
  let ready=false;
  for(let i=0;i<100;i++){
   assert.equal(host.exitCode,null,'Native host must stay running');
   try{ready=(await fetch('http://127.0.0.1:9223/json/version')).ok;}catch{}
   if(ready)break;await new Promise(r=>setTimeout(r,150));
  }
  assert.ok(ready,'Debugging endpoint must start');
  browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page=browser.contexts()[0].pages()[0];
  await page.waitForFunction(()=>!!window.companion);
  assert.equal(await page.evaluate(()=>window.companion.debug),enabled);
  await page.evaluate(()=>{
   window.companion.diagnosticLog({event:'test.marker',atMs:performance.now(),data:{enabled:true}});
   setTimeout(()=>{const until=performance.now()+300;while(performance.now()<until){}},50);
  });
  await page.waitForTimeout(enabled?11000:1000);
  const created=(await files()).filter(f=>!before.has(f));
  if(enabled){
   assert.equal(created.length,1,'Debug mode creates one session log');
   const entries=(await readFile(path.join(folder,created[0]),'utf8')).trim().split('\n').map(JSON.parse);
   assert.ok(entries.some(e=>e.event==='session.start'));
   const samples=entries.filter(e=>e.event==='native.sample');
   assert.ok(samples.length>=2,'Native resource sampling is periodic');
   assert.ok(samples.some(e=>e.data.processes.some(p=>p.kind==='host'&&p.cpuPercent!==null)));
   assert.ok(samples.some(e=>e.data.processes.some(p=>p.kind!=='host')),'WebView child processes must be included');
   const renderer=entries.filter(e=>e.event==='renderer').map(e=>e.data);
   assert.ok(renderer.some(e=>e.event==='test.marker'));
   assert.ok(renderer.some(e=>e.event==='renderer.start'));
   assert.ok(renderer.some(e=>e.event==='renderer.sample'&&e.data.longTasks.some(t=>t.durationMs>=250)),'Injected stall must appear in diagnostics');
   console.log('PASS --debug:',path.join(folder,created[0]));
  }else{assert.deepEqual(created,[]);console.log('PASS normal mode: no diagnostic log');}
  await page.evaluate(()=>{void window.companion.window('close');});
  const result=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(Error('Host did not close')),10000).unref())]);
  assert.equal(result[0],0);
  if(enabled){const log=await readFile(path.join(folder,created[0]),'utf8');assert.ok(log.includes('session.end'),'Exit drains the log queue');}
 }finally{if(host.exitCode===null)host.kill();await browser?.close();}
}
