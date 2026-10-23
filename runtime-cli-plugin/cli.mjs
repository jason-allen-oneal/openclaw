import assert from 'node:assert/strict';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const prompt = Buffer.concat(chunks).toString('utf8');
const marker = [...prompt.matchAll(/CLI-REPLY-[a-z-]+-ONLY/g)].at(-1)?.[0];
assert.ok(marker, 'synthetic proof marker found in actual CLI prompt');
const response = await fetch(process.env.PROOF_REAL_MODEL_URL + '/api/chat', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'qwen3:0.6b', messages: [{ role: 'user', content: `Reply with exactly this text and nothing else: ${marker}` }], stream: false, think: false, options: { num_predict: 128, num_ctx: 16384 } }),
});
assert.ok(response.ok);
const result = await response.json();
assert.equal(result.message.content.trim(), marker);
const gate = await fetch(process.env.PROOF_CLI_GATE_URL + '/cli-ready', {
  method: 'POST', body: JSON.stringify({ marker, pid: process.pid, promptBytes: Buffer.byteLength(prompt), model: result.model, output: result.message.content, promptEvalCount: result.prompt_eval_count, evalCount: result.eval_count }),
});
assert.ok(gate.ok);
await gate.text();
process.stdout.write(result.message.content.trim() + '\n');
