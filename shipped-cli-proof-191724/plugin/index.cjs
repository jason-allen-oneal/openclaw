// Deterministic public-contract fixture. No SDK internals, network, or credentials.
const fs = require("node:fs");
const path = require("node:path");
const provider = "readonly-proof";
function record(event) {
  fs.appendFileSync(path.join(process.env.PROOF_RUN_DIR, "provider-events.jsonl"),
    JSON.stringify(event) + "\n");
}
function message(model, text) {
  return { role: "assistant", api: model.api, provider: model.provider, model: model.id,
    content: [{ type: "text", text }], stopReason: "stop", timestamp: 1,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}
module.exports = {
  id: provider,
  register(api) {
    api.registerProvider({
      id: provider, label: "Deterministic read-only proof", auth: [],
      createStreamFn() {
        return (model) => {
          const terminal = message(model, "TERMINAL-ORIGINAL");
          const repaired = message(model, "RESULT-REPAIRED");
          const scenario = model.id;
          const source = {
            async *[Symbol.asyncIterator]() {
              record({ event: "terminal", text: terminal.content[0].text, scenario });
              yield { type: "done", reason: "stop", message: terminal };
            },
            async result() {
              if (scenario === "result-error") {
                record({ event: "result-rejected", message: "SYNTHETIC-RESULT-ERROR" });
                throw new Error("SYNTHETIC-RESULT-ERROR");
              }
              record({ event: "result-resolved", text: repaired.content[0].text, scenario,
                distinctObject: terminal !== repaired });
              return repaired;
            },
          };
          record({ event: "factory", scenario, synchronous: scenario !== "async-repaired",
            push: typeof source.push, end: typeof source.end });
          return scenario === "async-repaired" ? Promise.resolve(source) : source;
        };
      },
    });
  },
};
