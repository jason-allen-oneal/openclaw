import { rewriteUpdateFlagArgv } from "../infra/cli-root-options.js";
import { resolveCliArgvInvocation } from "./argv-invocation.js";
import { parseCliContainerArgs } from "./container-target.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";
import {
  isUpdateAdmissionInvocation,
  tryRunUpdateAdmissionBeforeStartup,
} from "./run-main-update-admission.js";

type Invocation = ReturnType<typeof resolveCliArgvInvocation>;

export function isPassiveUpdateInvocation(invocation: Invocation): boolean {
  invocation = resolveCliArgvInvocation(rewriteUpdateFlagArgv(invocation.argv));
  return (
    isUpdateAdmissionInvocation(invocation) ||
    (invocation.commandPath.length === 2 &&
      invocation.commandPath[0] === "update" &&
      invocation.commandPath[1] === "plan")
  );
}

/** Passive planning must precede package lifecycle, runtime repair, and diagnostic writes. */
export async function tryRunPassiveUpdateBeforeStartup(invocation: Invocation): Promise<boolean> {
  invocation = resolveCliArgvInvocation(rewriteUpdateFlagArgv(invocation.argv));
  if (isUpdateAdmissionInvocation(invocation)) {
    return tryRunUpdateAdmissionBeforeStartup(invocation);
  }
  if (!isPassiveUpdateInvocation(invocation)) {
    return false;
  }
  const profile = parseCliProfileArgs(invocation.argv);
  if (!profile.ok) {
    console.error(profile.error);
    process.exitCode = 2;
    return true;
  }
  const container = parseCliContainerArgs(profile.argv);
  if (!container.ok || container.container) {
    console.error(
      !container.ok
        ? container.error
        : "Passive update planning does not support --container; run the planner inside that installation.",
    );
    process.exitCode = 2;
    return true;
  }
  if (profile.profile) {
    applyCliProfileEnv({ profile: profile.profile });
  }
  const [{ Command, CommanderError }, { registerUpdateCli }] = await Promise.all([
    import("commander"),
    import("./update-cli.js"),
  ]);
  // Reuse the public command grammar, but deliberately do not install startup preactions.
  const program = new Command()
    .name("openclaw")
    .option("--no-color", "Disable ANSI colors")
    .option("--log-level <level>", "Set diagnostic verbosity")
    .exitOverride();
  registerUpdateCli(program);
  try {
    await program.parseAsync(profile.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
  return true;
}
