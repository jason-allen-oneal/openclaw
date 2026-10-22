import fs from 'node:fs';
import threads from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
const output = process.env.OPENCLAW_PROOF_WORKER_TRACE;
if (threads.isMainThread && output) {
  const BaseWorker = threads.Worker;
  const record = (entry) => fs.appendFileSync(output, JSON.stringify({time:Date.now(),...entry})+'\n');
  threads.Worker = class ObservedWorker extends BaseWorker {
    constructor(filename, options) {
      super(filename, String(filename).includes('session-transcript-reconcile') ? {...options,name:'rc'} : options);
      this.proofThreadId=this.threadId;
      this.proofUrl=String(filename);
      record({event:'worker-created',pid:process.pid,threadId:this.proofThreadId,url:this.proofUrl});
      this.once('exit',(code)=>record({event:'worker-exit',pid:process.pid,threadId:this.proofThreadId,code,url:this.proofUrl}));
    }
    terminate() {
      record({event:'worker-terminate-request',pid:process.pid,threadId:this.proofThreadId,url:this.proofUrl});
      return super.terminate();
    }
  };
  syncBuiltinESMExports();
}
