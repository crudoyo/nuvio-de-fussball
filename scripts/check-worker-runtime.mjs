// A dry-run bundles code but does not validate the actual Worker export table.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {VERSION} from '../src/worker.js';
import {checkConfiguration} from './check-configuration.mjs';
const port=8791;
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--env','public','--local','--ip','127.0.0.1',
  '--port',String(port),'--log-level','error','--show-interactive-dev-session','false'],{
  cwd:new URL('../',import.meta.url),stdio:['ignore','pipe','pipe'],windowsHide:true
});
let log='',exited=false;
child.stdout.on('data',data=>{log=(log+data).slice(-6000);});
child.stderr.on('data',data=>{log=(log+data).slice(-6000);});
child.on('exit',()=>{exited=true;});
try{
  let health;
  for(let attempt=0;attempt<40&&!exited;attempt++){
    try{
      const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)});
      if(response.ok){health=await response.json();break;}
    }catch{}
    await delay(500);
  }
  if(health?.version!==VERSION||!health?.nativePlayback?.packedSegments||!health?.nativePlayback?.providerTokenRenewal)
    throw new Error('Worker runtime failed to start with the expected HLS adapter: '+log);
  console.log(JSON.stringify({workerRuntime:'started',version:health.version,packedSegments:true,providerTokenRenewal:true}));
  await checkConfiguration(`http://127.0.0.1:${port}`,VERSION);
}finally{child.kill('SIGTERM');}
