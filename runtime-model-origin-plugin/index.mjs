export default {
  id: "delivery-reset-proof",
  name: "Isolated delivery/reset proof",
  register(api) {
    api.registerChannel({ plugin: {
      id: "delivery-proof",
      meta: { id: "delivery-proof", label: "Isolated proof transport", selectionLabel: "Proof", docsPath: "/proof", blurb: "Task-local loopback transport" },
      capabilities: { chatTypes: ["direct"] },
      config: {
        listAccountIds: () => ["default"],
        resolveAccount: () => ({ accountId: "default", enabled: true, configured: true }),
        isEnabled: () => true, isConfigured: () => true,
      },
      outbound: {
        deliveryMode: "direct",
        resolveTarget: ({ to }) => ({ ok: true, to }),
        sendText: async ({ to, text, onPlatformSendDispatch }) => {
          await onPlatformSendDispatch?.();
          const response = await fetch(to, { method: "POST", body: text });
          if (response.status !== 200) throw new Error(`Transport returned ${response.status}`);
          const receipt = await response.json();
          return { channel: "delivery-proof", messageId: receipt.messageId };
        },
      },
    } });
    api.registerGatewayMethod("delivery-reset-proof.dispatch", async ({ params, respond }) => {
      try {
        const result = await api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
          cfg: api.config,
          ctx: {
            AgentId: "main", Body: `Reply with exactly this text, without explanation or tools: ${params.text}`, CommandAuthorized: true,
            Provider: "webchat", Surface: "webchat", ChatType: "direct",
            From: "proof-user", To: "proof-user", SessionKey: params.sessionKey,
            ExplicitDeliverRoute: true, OriginatingChannel: "delivery-proof", OriginatingTo: params.receiver,
            MessageSid: params.messageId, InboundAccessAuthorized: true,
          },
          dispatcherOptions: {
            deliver: async () => { throw new Error("Expected originating-channel route; direct dispatcher is forbidden in this lane"); },
          },
        });
        respond(true, result);
      } catch (error) {
        respond(false, undefined, { code: "INTERNAL_ERROR", message: String(error) });
      }
    }, { scope: "operator.admin" });
  },
};
