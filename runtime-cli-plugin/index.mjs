export default {
  id: "delivery-reset-proof",
  name: "Isolated delivery/reset proof",
  register(api) {
    api.registerCliBackend({
      id: "delivery-cli", modelProvider: "delivery-cli",
      config: {
        command: process.execPath,
        args: [new URL("./cli.mjs", import.meta.url).pathname],
        input: "stdin", output: "text", sessionMode: "none", serialize: false,
        env: { PROOF_CLI_GATE_URL: process.env.PROOF_CLI_GATE_URL, PROOF_REAL_MODEL_URL: process.env.PROOF_REAL_MODEL_URL },
      },
    });
    api.registerGatewayMethod("delivery-reset-proof.dispatch", async ({ params, respond }) => {
      try {
        const result = await api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
          cfg: api.config,
          ctx: {
            AgentId: "main", Body: `Reply with exactly this text, without explanation or tools: ${params.text}`, CommandAuthorized: true,
            Provider: "webchat", Surface: "webchat", ChatType: "direct",
            From: "proof-user", To: "proof-user", SessionKey: params.sessionKey,
            MessageSid: params.messageId, InboundAccessAuthorized: true,
          },
          dispatcherOptions: {
            deliver: async (payload) => {
              const response = await fetch(params.receiver, { method: "POST", body: payload.text });
              if (response.status !== 200) throw new Error(`Transport returned ${response.status}`);
              const receipt = await response.json();
              if (receipt.messageId !== params.messageId) throw new Error("Receipt identity mismatch");
              return { visibleReplySent: true };
            },
          },
        });
        respond(true, result);
      } catch (error) {
        respond(false, undefined, { code: "INTERNAL_ERROR", message: String(error) });
      }
    }, { scope: "operator.admin" });
  },
};
