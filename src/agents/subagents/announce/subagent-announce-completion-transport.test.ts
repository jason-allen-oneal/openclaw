import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { setActivePluginRegistry } from "../../../plugins/runtime.js";
import {
  createOutboundTestPlugin,
  createTestRegistry,
} from "../../../test-utils/channel-plugins.js";
import { taskCompletionEvents } from "../../subagent-test-fixtures.test-helpers.js";
import { deliverCompletionDirect } from "./subagent-announce-completion-delivery.js";

afterEach(() => setActivePluginRegistry(createTestRegistry()));

// Exercise the shared owner and real outbound pipeline with actual transport I/O,
// without loading a bundled channel or requiring an external account/service.
async function withTransport(
  channel: string,
  run: (fixture: {
    requests: { to: string; text: string }[];
    deliver: (
      enabled?: boolean,
      overrides?: Partial<Parameters<typeof deliverCompletionDirect>[0]>,
    ) => ReturnType<typeof deliverCompletionDirect>;
    prepare: (callback: () => Promise<void>) => void;
  }) => Promise<void>,
) {
  const requests: { to: string; text: string }[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      let body = "";
      for await (const chunk of request) {
        body += String(chunk);
      }
      requests.push(JSON.parse(body));
      response.writeHead(200).end("delivered");
    })().catch(() => response.writeHead(500).end("invalid request"));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a loopback transport address");
  }
  let prepare = async () => {};
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: channel,
        source: "test",
        plugin: createOutboundTestPlugin({
          id: channel,
          outbound: {
            deliveryMode: "direct",
            sendText: async ({ to, text, onPlatformSendDispatch }) => {
              await prepare();
              // The plugin's final effect uses the same shared dispatch authority
              // contract as production adapters, after asynchronous preparation.
              await onPlatformSendDispatch?.();
              const response = await fetch(`http://127.0.0.1:${address.port}/completion`, {
                method: "POST",
                body: JSON.stringify({ to, text }),
              });
              await response.text();
              if (!response.ok) {
                throw new Error("Transport rejected completion");
              }
              return { channel, messageId: `receipt-${requests.length}` };
            },
          },
        }),
      },
    ]),
  );
  try {
    await run({
      requests,
      prepare: (callback) => {
        prepare = callback;
      },
      deliver: (enabled, overrides = {}) =>
        deliverCompletionDirect({
          cfg: { agents: { defaults: { subagents: { dmCompletionFallback: enabled } } } },
          requesterSessionKey: `agent:main:${channel}:direct:recipient`,
          directIdempotencyKey: `universal-completion-${channel}`,
          deliveryTarget: { deliver: true, channel, to: "recipient" },
          internalEvents: taskCompletionEvents({ result: "Synthetic child result" }),
          contentKind: "completed_result",
          ...overrides,
        }),
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe.each(["completion-proof-alpha", "completion-proof-beta"])(
  "universal completion policy through %s",
  (channel) => {
    it.each([undefined, false, true])(
      "gates physical transport with opt-in %s",
      async (enabled) => {
        await withTransport(channel, async ({ deliver, requests }) => {
          const result = await deliver(enabled);
          if (enabled === true) {
            expect(result).toMatchObject({ delivered: true, path: "direct" });
            expect(requests).toEqual([{ to: "recipient", text: "Synthetic child result" }]);
          } else {
            expect(result).toBeUndefined();
            expect(requests).toEqual([]);
          }
        });
      },
    );

    it.each([undefined, false, true])("gates failure notices with opt-in %s", async (enabled) => {
      await withTransport(channel, async ({ deliver, requests }) => {
        const result = await deliver(enabled, { contentKind: "failed_notice" });
        if (enabled === true) {
          expect(result).toMatchObject({ delivered: true, path: "direct" });
          expect(requests).toEqual([
            {
              to: "recipient",
              text: "A delegated task failed before it could report a result. Please retry the task.",
            },
          ]);
        } else {
          expect(result).toBeUndefined();
          expect(requests).toEqual([]);
        }
      });
    });

    it.each(["before preparation", "after preparation"])(
      "blocks retired source authority %s before physical I/O",
      async (stage) => {
        await withTransport(channel, async ({ deliver, requests, prepare }) => {
          let current = stage !== "before preparation";
          prepare(async () => {
            await Promise.resolve();
            current = false;
          });
          await expect(
            deliver(true, { isSourceSessionEffectsAllowed: () => current }),
          ).resolves.toMatchObject({
            delivered: false,
            reason: "source_owner_changed",
            terminal: true,
          });
          expect(requests).toEqual([]);
        });
      },
    );

    it("blocks cancellation after preparation before physical I/O", async () => {
      await withTransport(channel, async ({ deliver, requests, prepare }) => {
        const controller = new AbortController();
        prepare(async () => {
          await Promise.resolve();
          controller.abort();
        });
        await expect(deliver(true, { signal: controller.signal })).resolves.toMatchObject({
          delivered: false,
        });
        expect(requests).toEqual([]);
      });
    });

    it("does not authorize a conflicting requester agent", async () => {
      await withTransport(channel, async ({ deliver, requests }) => {
        await expect(deliver(true, { requesterAgentId: "replacement" })).resolves.toBeUndefined();
        expect(requests).toEqual([]);
      });
    });
  },
);
