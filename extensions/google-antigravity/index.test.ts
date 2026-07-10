import type { ProviderAuthContext } from "openclaw/plugin-sdk/plugin-entry";
import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it, vi } from "vitest";
import plugin, {
  buildGoogleAntigravityProvider,
  GOOGLE_ANTIGRAVITY_AUTH_MARKER,
} from "./index.js";

describe("google-antigravity plugin", () => {
  it("registers one provider and one CLI backend", () => {
    const captured = capturePluginRegistration(plugin);

    expect(captured.providers.map((provider) => provider.id)).toEqual([
      "google-antigravity",
    ]);
    expect(captured.cliBackends.map((backend) => backend.id)).toEqual([
      "google-antigravity",
    ]);
  });

  it("uses non-secret synthetic auth for the local runtime", () => {
    const provider = buildGoogleAntigravityProvider();

    expect(
      provider.resolveSyntheticAuth?.({
        provider: "google-antigravity",
        config: {},
        providerConfig: {},
      }),
    ).toEqual({
      apiKey: GOOGLE_ANTIGRAVITY_AUTH_MARKER,
      source: "local agy runtime",
      mode: "token",
    });
  });

  it("configures the runtime only after the agy probe succeeds", async () => {
    const probe = vi.fn(() => ({
      ok: true as const,
      helpText: "--print --model --print-timeout",
    }));
    const provider = buildGoogleAntigravityProvider({ probe });
    const auth = provider.auth?.[0];
    const note = vi.fn(async () => undefined);
    const confirm = vi.fn(async () => true);

    const result = await auth?.run?.({
      prompter: { note, confirm },
    } as unknown as ProviderAuthContext);

    expect(probe).toHaveBeenCalledOnce();
    expect(result).toEqual(
      expect.objectContaining({
        profiles: [],
        defaultModel: "google-antigravity/gemini-3-flash",
        configPatch: {
          agents: {
            defaults: {
              models: {
                "google-antigravity/gemini-3-flash": {
                  agentRuntime: { id: "google-antigravity" },
                },
              },
            },
          },
        },
      }),
    );
  });

  it("fails setup when the installed agy contract is incompatible", async () => {
    const provider = buildGoogleAntigravityProvider({
      probe: () => ({ ok: false, reason: "missing --print" }),
    });
    const auth = provider.auth?.[0];

    await expect(
      auth?.run?.({
        prompter: {
          note: vi.fn(async () => undefined),
          confirm: vi.fn(async () => true),
        },
      } as unknown as ProviderAuthContext),
    ).rejects.toThrow("missing --print");
  });
});
