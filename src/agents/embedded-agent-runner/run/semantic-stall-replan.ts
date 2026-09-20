import type {
  AgentContext,
  AgentLoopTurnUpdate,
  PrepareNextTurnContext,
} from "../../runtime/index.js";
import type { SemanticNoProgressObserver } from "../../semantic-no-progress.js";

/** Fixed internal guidance; it never contains user text or tool data. */
export const SEMANTIC_STALL_REPLAN_INSTRUCTION =
  "The recent tool trajectory is strongly stalled. Reassess the active task and take one materially different, safe next step; do not repeat the stalled action.";

/** One budget shared by all attempts belonging to one logical run. */
export type SemanticStallReplanState = {
  observer: SemanticNoProgressObserver;
  assertActive: () => void;
  used: boolean;
};

function appendReplanInstruction(systemPrompt: string): string {
  return systemPrompt
    ? `${systemPrompt}\n\n${SEMANTIC_STALL_REPLAN_INSTRUCTION}`
    : SEMANTIC_STALL_REPLAN_INSTRUCTION;
}

function currentContext(
  update: AgentLoopTurnUpdate | undefined,
  turn: PrepareNextTurnContext | undefined,
): AgentContext | undefined {
  return update?.context ?? turn?.context;
}

/**
 * Consume the single strong-stall replan opportunity at the core turn boundary.
 * The update remains a context replacement only: no transcript message, tool,
 * goal state, or critical-loop termination is changed here.
 */
export function maybeInjectSemanticStallReplan(
  update: AgentLoopTurnUpdate | undefined,
  state: SemanticStallReplanState | undefined,
  signal?: AbortSignal,
  turn?: PrepareNextTurnContext,
): AgentLoopTurnUpdate | undefined {
  if (!state || state.used) {
    return update;
  }
  const observation = state.observer.snapshot();
  const judgment = observation.latestJudgment;
  if (
    !judgment ||
    judgment.trajectoryVersion !== observation.trajectoryVersion ||
    judgment.verdict !== "stalled" ||
    judgment.probability === undefined ||
    judgment.probability < 0.95
  ) {
    return update;
  }
  signal?.throwIfAborted();
  state.assertActive();
  const context = currentContext(update, turn);
  if (!context) {
    return update;
  }
  state.used = true;
  return {
    ...update,
    context: {
      ...context,
      systemPrompt: appendReplanInstruction(context.systemPrompt),
    },
  };
}
