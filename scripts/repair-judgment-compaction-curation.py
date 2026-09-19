from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one regex match, found {count}")
    return updated


active_path = "src/agents/agent-hooks/compaction-safeguard-active-curation.ts"
text = read(active_path)
text = text.replace(
    'import { evaluateJudgment } from "../../judgments/runtime.js";',
    'import { evaluateJudgment, recordJudgmentOutcome } from "../../judgments/runtime.js";',
)
runtime_call = "runtime: { evaluate: evaluateJudgment },"
if text.count(runtime_call) != 2:
    raise SystemExit(f"active judgment runtime: expected two matches, found {text.count(runtime_call)}")
text = text.replace(
    runtime_call,
    "runtime: { evaluate: evaluateJudgment, recordOutcome: recordJudgmentOutcome },",
)
resolution_anchor = "export type CuratedCandidateResolution =\n"
single_attempt = '''export function createSingleAttemptFallback<T>(
  build: () => Promise<T | null>,
): () => Promise<T | null> {
  let attempted = false;
  return async () => {
    if (attempted) {
      return null;
    }
    attempted = true;
    return await build();
  };
}

'''
text = replace_once(
    text,
    resolution_anchor,
    single_attempt + resolution_anchor,
    "insert single-attempt fallback helper",
)
write(active_path, text)

main_path = "src/agents/agent-hooks/compaction-safeguard.ts"
text = read(main_path)
text = text.replace(
    'import { evaluateJudgment } from "../../judgments/runtime.js";',
    'import { evaluateJudgment, recordJudgmentOutcome } from "../../judgments/runtime.js";',
)
text = text.replace(
    '''import {
  prepareActiveCompactionCuration,
  prepareCompactionSummaryInput,
  resolveCuratedCompactionCandidate,
} from "./compaction-safeguard-active-curation.js";
''',
    '''import {
  type ActiveCompactionCuration,
  createSingleAttemptFallback,
  prepareActiveCompactionCuration,
  prepareCompactionSummaryInput,
  resolveCuratedCompactionCandidate,
} from "./compaction-safeguard-active-curation.js";
''',
)
summary_import = '''import { createCompactionSummaryAttemptRuntime } from "./compaction-safeguard-summary-attempt.js";
'''
if summary_import not in text:
    active_import_end = '} from "./compaction-safeguard-active-curation.js";\n'
    text = replace_once(
        text,
        active_import_end,
        active_import_end + summary_import,
        "insert summary-attempt runtime import",
    )
for unused in [
    "  appendSummarySection,\n",
    "  auditSummaryQuality,\n",
    "  wrapUntrustedInstructionBlock,\n",
    "  type CompactionLoss,\n",
    "  type ContextSection,\n",
    "  formatGeneratedSplitTurnSection,\n",
]:
    text = text.replace(unused, "")
text = sub_once(
    text,
    r'import \{\n\s*buildCompactionSemanticSnapshot,\n(?:\s*projectCompactionSemanticSelection,\n)?\} from "\./compaction-safeguard-semantic\.js";',
    '''import {
  buildCompactionSemanticSnapshot,
  fingerprint,
  fingerprintCompactionMessages,
} from "./compaction-safeguard-semantic.js";''',
    "normalize semantic imports",
)
text = replace_once(
    text,
    '''      let activeCuration = {
        messages: uncuratedSemanticSource,
      } as Awaited<ReturnType<typeof prepareActiveCompactionCuration>>;
''',
    '''      let activeCuration: ActiveCompactionCuration = {
        messages: uncuratedSemanticSource,
      };
''',
    "remove active curation assertion",
)

replacement = '''      const summaryAttemptRuntime = createCompactionSummaryAttemptRuntime({
        signal,
        contextWindowTokens,
        turnPrefixMessages,
        isSplitTurn: preparation.isSplitTurn,
        customInstructions,
        structuredInstructions,
        qualityGuardEnabled,
        effectivePreviousSummary,
        identifiers,
        latestUserAsk,
        splitUserAsk,
        latestUnresolvedUserRequest,
        requiredAskContext,
        identifierPolicy,
        summarize: async (request) =>
          summarizeViaLLM({
            ...llmSummaryParams,
            ...request,
            headers: buildCompactionSummaryHeaders({
              model,
              messages: request.messages,
              headers: authResult.headers,
            }),
          }),
        finalizeSummaryText,
      });
      const {
        summarizePreparedInput,
        auditPreparedSummary,
        buildCorrectiveInstructions,
        buildUncuratedFallback,
      } = summaryAttemptRuntime;

      const prepareUncuratedInput = (sourceMessages: AgentMessage[]) =>
        prepareCompactionSummaryInput({
          sourceMessages,
          recentTurnsPreserve,
          qualityGuardEnabled,
          latestUnresolvedUserRequest,
          latestUserAsk,
          requiredAskContext,
        });

      const buildUncuratedSemanticFallback = createSingleAttemptFallback(async () => {
        if (!activeCuration.uncuratedMessages) {
          return null;
        }
        const fallback = await buildUncuratedFallback({
          sourceMessages: activeCuration.uncuratedMessages,
          prepareInput: prepareUncuratedInput,
        });
        if (fallback.status === "ok") {
          log.warn("Compaction semantic curation fell back to the uncurated summary input.");
          return fallback.summary;
        }
        log.warn(
          `Compaction semantic uncurated fallback failed: reason=${fallback.reason}`,
        );
        return null;
      });

      const resolveCuratedFailure = async (reason: string) => {
        const fallback = await buildUncuratedSemanticFallback();
        if (fallback) {
          log.warn(`Compaction semantic curation used uncurated fallback: reason=${reason}`);
          return compactionResult(fallback);
        }
        setCompactionSafeguardCancellation(
          ctx.sessionManager,
          `Compaction semantic curation failed and uncurated fallback was unavailable: ${reason}`,
        );
        return { cancel: true as const };
      };

      const acceptSummary = async'''
text = sub_once(
    text,
    r'      const summarizePreparedInput = async \(params: \{.*?\n      const acceptSummary = async',
    replacement,
    "replace duplicated summary-attempt implementation",
)

catch_anchor = '''        } catch (attemptError) {
          if (signal?.aborted) {
            signal.throwIfAborted();
          }
          if (attempt > 0) {
'''
catch_replacement = '''        } catch (attemptError) {
          if (signal?.aborted) {
            signal.throwIfAborted();
          }
          if (activeCuration.snapshot) {
            return await resolveCuratedFailure(
              `generation:${formatErrorMessage(attemptError)}`,
            );
          }
          if (attempt > 0) {
'''
text = replace_once(text, catch_anchor, catch_replacement, "route curated generation failure")

retention_anchor = '''        if (finalized.qualityRetentionInfeasible) {
          log.warn(
            "Compaction safeguard: required quality facts exceed finalized artifact budget; " +
              `requiredChars>${MAX_COMPACTION_SUMMARY_CHARS} identifierCount=${identifiers.length}`,
          );
'''
retention_replacement = retention_anchor + '''          if (activeCuration.snapshot) {
            return await resolveCuratedFailure("quality-retention-infeasible");
          }
'''
text = replace_once(
    text,
    retention_anchor,
    retention_replacement,
    "route curated retention failure",
)

quality_anchor = '''        if (!canRegenerate || attempt >= totalAttempts - 1) {
          const reasonCodes = [
            ...new Set(quality.reasons.map((reason) => reason.split(":", 1)[0])),
          ];
'''
quality_replacement = quality_anchor + '''          if (activeCuration.snapshot) {
            return await resolveCuratedFailure(
              `deterministic-quality:${reasonCodes.join(",")}`,
            );
          }
'''
text = replace_once(
    text,
    quality_anchor,
    quality_replacement,
    "route curated deterministic quality failure",
)

text = sub_once(
    text,
    r'''        const reasons = quality\.reasons\.join\(", "\);\n        const qualityFeedbackInstruction =.*?\n        correctiveInstructions = qualityFeedbackReasons\n          \? `\$\{qualityFeedbackInstruction\}\\n\$\{budgetInstruction\}\\n\\n\$\{qualityFeedbackReasons\}`\n          : `\$\{qualityFeedbackInstruction\}\\n\$\{budgetInstruction\}`;''',
    '''        correctiveInstructions = buildCorrectiveInstructions({
          audit: quality,
          bodyBudget: finalized.bodyBudget,
        });''',
    "delegate corrective instruction building",
)
write(main_path, text)

test_path = "src/agents/agent-hooks/compaction-safeguard-semantic.test.ts"
text = read(test_path)
active_import = '''import { createSingleAttemptFallback } from "./compaction-safeguard-active-curation.js";
'''
if active_import not in text:
    anchor = 'import type { AgentMessage } from "../runtime/index.js";\n'
    text = replace_once(text, anchor, anchor + active_import, "import fallback helper test")
judgments_anchor = 'describe("compaction semantic judgments", () => {\n'
fallback_test = '''describe("active compaction curation", () => {
  it("runs the uncurated fallback at most once", async () => {
    const build = vi.fn(async () => "uncurated-summary");
    const fallback = createSingleAttemptFallback(build);

    await expect(fallback()).resolves.toBe("uncurated-summary");
    await expect(fallback()).resolves.toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
  });
});

'''
if fallback_test not in text:
    text = replace_once(
        text,
        judgments_anchor,
        fallback_test + judgments_anchor,
        "add single-attempt fallback test",
    )
write(test_path, text)
