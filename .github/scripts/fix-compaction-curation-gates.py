from pathlib import Path


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing replacement anchor: {label}")
    return text.replace(old, new)


active = Path("src/agents/agent-hooks/compaction-safeguard-active-curation.ts")
text = active.read_text()
error_import = 'import { formatErrorMessage } from "../../infra/errors.js";\n'
if error_import not in text:
    text = replace_required(
        text,
        'import { evaluateJudgment } from "../../judgments/runtime.js";\n',
        error_import + 'import { evaluateJudgment } from "../../judgments/runtime.js";\n',
        "active curation error import",
    )
wrapper = '''export type ActiveCompactionCurationDiagnostic = {
  level: "info" | "warn";
  message: string;
};

export async function prepareActiveCompactionCurationForRun(
  params: Parameters<typeof prepareActiveCompactionCuration>[0],
): Promise<ActiveCompactionCuration & { diagnostic?: ActiveCompactionCurationDiagnostic }> {
  try {
    const result = await prepareActiveCompactionCuration(params);
    if (result.applied) {
      return {
        ...result,
        diagnostic: {
          level: "info",
          message:
            "Compaction semantic curation applied: " +
            `sourceMessages=${result.applied.sourceMessages} ` +
            `selectedMessages=${result.applied.selectedMessages} ` +
            `sourceChars=${result.applied.originalChars} ` +
            `selectedChars=${result.applied.selectedChars} ` +
            `reduction=${(result.applied.reductionRatio * 100).toFixed(1)}% ` +
            `provider=${result.applied.providerId}`,
        },
      };
    }
    if (params.mode === "apply" && result.skippedReason) {
      return {
        ...result,
        diagnostic: {
          level: "info",
          message: `Compaction semantic curation skipped: ${result.skippedReason}`,
        },
      };
    }
    return result;
  } catch (error) {
    params.signal.throwIfAborted();
    return {
      messages: params.sourceMessages,
      skippedReason: "unavailable",
      diagnostic: {
        level: "warn",
        message:
          "Compaction semantic curation unavailable; using uncurated input: " +
          formatErrorMessage(error),
      },
    };
  }
}

'''
anchor = 'export function prepareCompactionSummaryInput(params: {'
if 'prepareActiveCompactionCurationForRun' not in text:
    if anchor not in text:
        raise SystemExit("active curation wrapper anchor missing")
    text = text.replace(anchor, wrapper + anchor)
active.write_text(text)

path = Path("src/agents/agent-hooks/compaction-safeguard.ts")
text = path.read_text()
text = text.replace(
    '  prepareActiveCompactionCuration,\n',
    '  prepareActiveCompactionCurationForRun,\n',
)
text = text.replace(
    '  nestRequiredSummaryHeadings,\n  wrapUntrustedInstructionBlock,\n',
    '  nestRequiredSummaryHeadings,\n',
)
text = text.replace(
    '  extractMessageText,\n  formatGeneratedSplitTurnSection,\n  formatRequiredAskContext,\n',
    '  extractMessageText,\n  formatRequiredAskContext,\n',
)
text = text.replace(
    'import {\n  buildCompactionSemanticSnapshot,\n  projectCompactionSemanticSelection,\n} from "./compaction-safeguard-semantic.js";\n',
    'import { buildCompactionSemanticSnapshot } from "./compaction-safeguard-semantic.js";\n',
)
summary_import = 'import { createCompactionSummaryAttemptRuntime } from "./compaction-safeguard-summary-attempt.js";\n'
active_import_end = '} from "./compaction-safeguard-active-curation.js";\n'
if summary_import not in text:
    if active_import_end not in text:
        raise SystemExit("active curation import anchor missing")
    text = text.replace(active_import_end, active_import_end + summary_import)

selection_start = text.index('      let activeCuration = {')
selection_end = text.index('      messagesToSummarize = activeCuration.messages;', selection_start)
selection_end += len('      messagesToSummarize = activeCuration.messages;')
selection = '''      const activeCuration = await prepareActiveCompactionCurationForRun({
        sessionManager: ctx.sessionManager,
        mode: semanticMode,
        sourceMessages: uncuratedSemanticSource,
        recentTurnsPreserve,
        identifiers,
        latestUnresolvedUserRequest,
        latestUserAsk,
        signal: semanticSignal,
        timeoutMs: semanticTimeoutMs,
      });
      if (activeCuration.diagnostic?.level === "warn") {
        log.warn(activeCuration.diagnostic.message);
      } else if (activeCuration.diagnostic) {
        log.info(activeCuration.diagnostic.message);
      }
      messagesToSummarize = activeCuration.messages;'''
text = text[:selection_start] + selection + text[selection_end:]

start = text.index('      const summarizePreparedInput = async (params: {')
end = text.index('      const buildUncuratedSemanticFallback = async', start)
runtime_block = '''      const summaryAttemptRuntime = createCompactionSummaryAttemptRuntime({
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
          await summarizeViaLLM({
            ...llmSummaryParams,
            headers: buildCompactionSummaryHeaders({
              model,
              messages: request.messages,
              headers: authResult.headers,
            }),
            ...request,
          }),
        finalizeSummaryText,
      });
      const {
        summarizePreparedInput,
        auditPreparedSummary,
        buildCorrectiveInstructions,
        buildUncuratedFallback,
      } = summaryAttemptRuntime;

'''
text = text[:start] + runtime_block + text[end:]

fallback_start = text.index('      const buildUncuratedSemanticFallback = async')
fallback_end = text.index('      const acceptSummary = async', fallback_start)
fallback_block = '''      const buildUncuratedSemanticFallback = async (): Promise<string | null> => {
        if (!activeCuration.uncuratedMessages) {
          return null;
        }
        const fallback = await buildUncuratedFallback({
          sourceMessages: activeCuration.uncuratedMessages,
          prepareInput: (sourceMessages) =>
            prepareCompactionSummaryInput({
              sourceMessages,
              recentTurnsPreserve,
              qualityGuardEnabled,
              latestUnresolvedUserRequest,
              latestUserAsk,
              requiredAskContext,
            }),
        });
        if (fallback.status !== "ok") {
          log.warn(`Compaction semantic uncurated fallback failed: ${fallback.reason}`);
          return null;
        }
        return fallback.summary;
      };

'''
text = text[:fallback_start] + fallback_block + text[fallback_end:]

correction_start = text.index('        const reasons = quality.reasons.join(", ");')
correction_end = text.index('\n      }\n\n      throw new Error', correction_start)
correction_block = '''        correctiveInstructions = buildCorrectiveInstructions({
          audit: quality,
          bodyBudget: finalized.bodyBudget,
        });'''
text = text[:correction_start] + correction_block + text[correction_end:]
path.write_text(text)
