// Reuses catalogReply's JSON/SSE shape from models-catalog-fixture.test-support.ts.
// Synthetic, loopback-only, fixed reply; never logs prompts or credentials.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

const {values: args} = parseArgs({options: {
  out: {type: 'string'}, port: {type: 'string', default: '20095'},
  seconds: {type: 'string', default: '240'},
}});
if (!args.out) throw new Error('--out is required');
const root = path.resolve(args.out), port = Number(args.port), seconds = Number(args.seconds);
if (port !== 20095 || !Number.isInteger(seconds) || seconds < 30 || seconds > 720) {
  throw new Error('Fixture is restricted to port 20095 and 30..720 seconds');
}
fs.mkdirSync(root, {recursive: true, mode: 0o700});
const trace = path.join(root, 'inference-requests.jsonl');
fs.closeSync(fs.openSync(trace, 'wx', 0o600));
const marker = 'NATIVE_CATALOG_TURN_OK';
let requests = 0, completed = 0, rejected = 0, closing = false;
const startedAt = Date.now();
const record = row => fs.appendFileSync(trace, JSON.stringify({timestampMs: Date.now(), ...row}) + '\n');
const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify({ready: true, requests, completed, rejected, fixedReply: marker})); return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404).end(); return;
  }
  const sequence = ++requests, began = Date.now();
  if (sequence > 100 || request.headers.authorization !== 'Bearer synthetic-only-key') {
    rejected++; record({sequence, rejected: true, reason: sequence > 100 ? 'request-cap' : 'auth'});
    response.writeHead(sequence > 100 ? 429 : 401).end(); return;
  }
  try {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 8 * 1024 * 1024) throw new Error('body-limit');
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body.model !== 'model-0') throw new Error('unexpected-model');
    const id = `chatcmpl-native-natural-${sequence}`;
    const usage = {prompt_tokens: 11, completion_tokens: 7, total_tokens: 18};
    if (body.stream === true) {
      response.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache'});
      response.end(`data: ${JSON.stringify({id, object: 'chat.completion.chunk', created: 0,
        model: body.model, choices: [{index: 0, delta: {role: 'assistant', content: marker}, finish_reason: 'stop'}], usage})}\n\ndata: [DONE]\n\n`);
    } else {
      response.writeHead(200, {'content-type': 'application/json'});
      response.end(JSON.stringify({id, object: 'chat.completion', created: 0, model: body.model,
        choices: [{index: 0, message: {role: 'assistant', content: marker}, finish_reason: 'stop'}], usage}));
    }
    completed++;
    record({sequence, completed: true, model: body.model, stream: body.stream === true, requestBytes: bytes, elapsedMs: Date.now() - began});
  } catch (error) {
    rejected++; record({sequence, rejected: true, reason: error.message === 'body-limit' ? 'body-limit' : 'invalid-request'});
    response.writeHead(400, {'content-type': 'application/json'}).end(JSON.stringify({error: {message: 'Synthetic fixture rejected request', type: 'invalid_request_error'}}));
  }
});
server.requestTimeout = 15000;
const stop = reason => {
  if (closing) return; closing = true; clearTimeout(deadline);
  fs.writeFileSync(path.join(root, 'inference-close.json'), JSON.stringify({pid: process.pid, reason, startedAt, finishedAt: Date.now(), requests, completed, rejected, paidInference: false}, null, 2), {mode: 0o600});
  server.close(() => process.exit(0));
  setTimeout(() => {server.closeAllConnections(); process.exit(1);}, 5000).unref();
};
const deadline = setTimeout(() => stop('bounded-lifetime'), seconds * 1000);
process.on('SIGTERM', () => stop('parent-stop'));
process.on('SIGINT', () => stop('parent-stop'));
server.listen(port, '127.0.0.1', () => {
  fs.writeFileSync(path.join(root, 'inference-ready.json'), JSON.stringify({pid: process.pid, port, startedAt, marker, paidInference: false}), {mode: 0o600});
  console.log(JSON.stringify({ready: true, pid: process.pid, port, paidInference: false}));
});
