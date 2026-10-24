const fs = require('node:fs');
const path = require('node:path');
const { threadId } = require('node:worker_threads');
const { getCachedLiveCatalogValue } = require('openclaw/plugin-sdk/provider-catalog-shared');
const root = path.dirname(__dirname);
const settings = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
const record = value => fs.appendFileSync(path.join(root, 'provider.jsonl'), JSON.stringify({time: Date.now(), pid: process.pid, threadId, ...value}) + '\n');
const row = (i) => ({id: `model-${i}`, name: `Normal TTL model ${i}`, reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}});
let serial = 0;
module.exports = Array.from({length: 64}, (_, index) => {
  const id = `api-${String(index).padStart(2, '0')}`;
  return {
    id, label: `Normal TTL provider ${index}`, auth: [],
    catalog: {async run() {
      const call = `${process.pid}:${threadId}:${++serial}:${id}`;
      let observedNow, cacheLoaded = false, injectedFailure = false;
      record({kind: 'catalog-start', call, provider: id, defaultTtlMs: 30000, loadDelayMs: settings.loadDelayMs});
      try {
        const value = await getCachedLiveCatalogValue({
        keyParts: ['normal-ttl-feedback', settings.name, id],
        // Deliberately omit ttlMs: exercise the official SDK's unmodified default.
        now: () => {observedNow = Date.now(); record({kind: 'cache-clock', call, provider: id, observedNow}); return observedNow;},
        load: async () => {
          cacheLoaded = true;
          record({kind: 'cache-load-start', call, provider: id});
          if (settings.loadDelayMs) await new Promise(resolve => setTimeout(resolve, settings.loadDelayMs));
          // The observer arms this only after all 64 good seed returns and natural publication.
          // Check inside the real cache loader: a mere catalog-hook call/cache hit cannot fail.
          const warningFile = path.join(root, 'warning-arm.json');
          const warning = settings.warningOnFirstExpired && fs.existsSync(warningFile)
            ? JSON.parse(fs.readFileSync(warningFile, 'utf8')) : undefined;
          if (warning?.provider === id) {
            injectedFailure = true;
            record({kind: 'warning-injected', call, provider: id, armedAt: warning.armedAt});
            throw new Error('Synthetic provider catalog unavailable');
          }
          record({kind: 'cache-load-complete', call, provider: id});
          return {provider: {api: 'openai-completions', baseUrl: 'http://127.0.0.1:20095/v1', models: Array.from({length: index < 28 ? 12 : 11}, (_, i) => row(i))}};
        },
      });
      const inferredFreshDeadline = cacheLoaded ? observedNow + 30000 : null;
      // No post-cache delay. Any aged inventory comes from subsequent providers/publication work.
      record({kind: 'catalog-return', call, provider: id, inferredFreshDeadline});
        return value;
      } catch (error) {
        record({kind: 'catalog-error', call, provider: id, injectedFailure, error: error instanceof Error ? error.message : String(error)});
        throw error;
      }
    }},
  };
});
