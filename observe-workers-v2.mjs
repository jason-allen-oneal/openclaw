import fs from 'node:fs';
import threads from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
const output = process.env.OPENCLAW_PROOF_WORKER_TRACE;
const record = (entry) => output && fs.appendFileSync(output, JSON.stringify({time:Date.now(),...entry})+'\n');
const relevant = (url) => /session-accessor.sqlite-archive|session-transcript-reconcile/.test(url);
if (threads.isMainThread && output) {
  const BaseWorker = threads.Worker;
  threads.Worker = class ObservedWorker extends BaseWorker {
    constructor(filename, options) {
      super(filename, options);
      this.proofThreadId=this.threadId;
      this.proofUrl=String(filename);
      record({event:'worker-created',pid:process.pid,threadId:this.proofThreadId,url:this.proofUrl});
      if (relevant(this.proofUrl)) this.on('message',(message)=>{
        if(message.type==='archive-temporary-file') record({event:'worker-temporary-file',threadId:this.proofThreadId,...message});
      });
      this.once('exit',(code)=>record({event:'worker-exit',pid:process.pid,threadId:this.proofThreadId,code,url:this.proofUrl}));
    }
    postMessage(message, ...rest) {
      if (relevant(this.proofUrl)) {
        record({event:'worker-dispatch',threadId:this.proofThreadId,url:this.proofUrl,type:message.type,input:message.input?.input ?? message.input ?? message.value?.input});
      }
      return super.postMessage(message,...rest);
    }
    terminate() {
      record({event:'worker-terminate-request',pid:process.pid,threadId:this.proofThreadId,url:this.proofUrl});
      return super.terminate();
    }
  };
  syncBuiltinESMExports();
} else if (output && String(process.argv[1]).includes('session-transcript-reconcile.worker')) {
  // Observation-only name makes the native read fault target this worker rather than
  // relying on Node's truncated platform-dependent [worker N] name prefix.
  fs.writeFileSync('/proc/thread-self/comm','openclaw-rc');
  record({event:'reconcile-native-thread',pid:process.pid,threadId:threads.threadId,tid:Number(fs.readlinkSync('/proc/thread-self').split('/').at(-1)),name:fs.readFileSync('/proc/thread-self/comm','utf8').trim()});
}
