import type { CliBackendPlugin } from "openclaw/plugin-sdk/cli-backend";

const ANTIGRAVITY_DEFAULT_MODEL_REF = "google-antigravity/gemini-3-flash";

const ANTIGRAVITY_MODEL_ALIASES: Record<string, string> = {
  flash: "gemini-3-flash",
  pro: "gemini-3-pro-low",
  "pro-low": "gemini-3-pro-low",
  "pro-high": "gemini-3-pro-high",
  "gemini-3.1-pro": "gemini-3-pro-low",
  "gemini-3-pro": "gemini-3-pro-low",
  "gemini-3-pro-low": "gemini-3-pro-low",
  "gemini-3-pro-high": "gemini-3-pro-high",
  "gemini-3-flash": "gemini-3-flash",
};

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeForwardedAntigravityCredential(value: unknown): { userDataDir?: string } {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    userDataDir: normalizeString(record.userDataDir),
  };
}

export function buildGoogleAntigravityCliBackend(): CliBackendPlugin {
  return {
    id: "google-antigravity",
    modelProvider: "google-antigravity",
    liveTest: {
      defaultModelRef: ANTIGRAVITY_DEFAULT_MODEL_REF,
    },
    authEpochMode: "profile-only",
    authProfileForwarding: {
      supported: true,
      providers: ["google-antigravity"],
      credentialKinds: ["oauth"],
    },
    prepareExecution: (ctx) => {
      const forwarded = normalizeForwardedAntigravityCredential(ctx.authCredential);
      const clearEnv = [
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_CLOUD_PROJECT_ID",
      ];

      if (forwarded.userDataDir) {
        return {
          env: { ANTIGRAVITY_USER_DATA_DIR: forwarded.userDataDir },
          clearEnv,
        };
      }

      return { clearEnv };
    },
    config: {
      command: "agy",
      args: ["--print", "{prompt}", "--print-timeout", "5m0s"],
      output: "text",
      input: "arg",
      maxPromptArgChars: 8000,
      modelArg: "--model",
      modelAliases: ANTIGRAVITY_MODEL_ALIASES,
      sessionMode: "none",
      serialize: true,
    },
  };
}
