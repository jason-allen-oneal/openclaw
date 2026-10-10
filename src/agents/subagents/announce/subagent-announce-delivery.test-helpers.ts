import { vi } from "vitest";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import type { callGateway as runtimeCallGateway } from "../../../gateway/call.js";
const sentDeliveryStatus = { status: "sent", resultCount: 1 } as const;

export function createGatewayMock(
  response: Record<string, unknown> | Error = {},
  onCall?: () => void,
) {
  return vi.fn(async (opts: Parameters<typeof runtimeCallGateway>[0]) => {
    onCall?.();
    if (response instanceof Error) {
      throw response;
    }
    opts.onAccepted?.({ status: "accepted" });
    return response;
  }) as unknown as typeof runtimeCallGateway;
}

export function createPayloadGatewayMock(...payloads: Record<string, unknown>[]) {
  return createGatewayMock({
    result: { payloads, ...(payloads.length > 0 ? { deliveryStatus: sentDeliveryStatus } : {}) },
  });
}

/** Existing fallback-delivery fixtures exercise the explicitly opted-in behavior. */
export function withDmCompletionFallback(cfg: OpenClawConfig): OpenClawConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        subagents: { ...cfg.agents?.defaults?.subagents, dmCompletionFallback: true },
      },
    },
  };
}
