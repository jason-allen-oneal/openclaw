/**
 * Optional Playwright AI module loader.
 *
 * Lazily imports the Playwright-backed browser helpers while allowing routes to
 * soft-fail when the dependency is unavailable in a gateway build.
 */
import { extractErrorCode, formatErrorMessage } from "openclaw/plugin-sdk/security-runtime";

/** Type of the Playwright-backed browser helper module. */
export type PwAiModule = (typeof import("./pw-ai.js"))["pwAi"];

type PwAiLoadMode = "soft" | "strict";

let pwAiModuleSoft: Promise<PwAiModule | null> | null = null;
let pwAiModuleStrict: Promise<PwAiModule | null> | null = null;
let loadedPwAiModule: PwAiModule | null | undefined;

function applyCdpDefaults(pw: PwAiModule | null, noDefaults: boolean): PwAiModule | null {
  if (!pw || !noDefaults) {
    return pw;
  }
  return new Proxy(pw, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (typeof method !== "function") {
        return method;
      }
      return (...args: unknown[]) => {
        const options = args[0];
        if (!options || typeof options !== "object" || !("cdpUrl" in options)) {
          return Reflect.apply(method, target, args);
        }
        return Reflect.apply(method, target, [{ ...options, noDefaults: true }, ...args.slice(1)]);
      };
    },
  });
}

function isModuleNotFoundError(err: unknown): boolean {
  const code = extractErrorCode(err);
  if (code === "ERR_MODULE_NOT_FOUND") {
    return true;
  }
  const msg = formatErrorMessage(err);
  return (
    msg.includes("Cannot find module") ||
    msg.includes("Cannot find package") ||
    msg.includes("Failed to resolve import") ||
    msg.includes("Failed to resolve entry for package") ||
    msg.includes("Failed to load url")
  );
}

async function loadPwAiModule(mode: PwAiLoadMode): Promise<PwAiModule | null> {
  try {
    const { pwAi } = await import("./pw-ai.js");
    loadedPwAiModule = pwAi;
    return pwAi;
  } catch (err) {
    if (mode === "soft") {
      loadedPwAiModule = null;
      return null;
    }
    if (isModuleNotFoundError(err)) {
      loadedPwAiModule = null;
      return null;
    }
    throw err;
  }
}

/** Return the already-resolved module without yielding during lifecycle invalidation. */
export function getLoadedPwAiModule(noDefaults = false): PwAiModule | null | undefined {
  if (loadedPwAiModule === undefined) {
    return undefined;
  }
  return applyCdpDefaults(loadedPwAiModule, noDefaults);
}

/** Load the Playwright AI helper module in soft or strict mode. */
export async function getPwAiModule(opts?: {
  mode?: PwAiLoadMode;
  noDefaults?: boolean;
}): Promise<PwAiModule | null> {
  const mode: PwAiLoadMode = opts?.mode ?? "soft";
  if (mode === "soft") {
    if (!pwAiModuleSoft) {
      pwAiModuleSoft = loadPwAiModule("soft");
    }
    return applyCdpDefaults(await pwAiModuleSoft, opts?.noDefaults ?? false);
  }
  if (!pwAiModuleStrict) {
    pwAiModuleStrict = loadPwAiModule("strict");
  }
  return applyCdpDefaults(await pwAiModuleStrict, opts?.noDefaults ?? false);
}
