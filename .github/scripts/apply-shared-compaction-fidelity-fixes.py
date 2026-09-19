from pathlib import Path


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing replacement anchor: {label}")
    return text.replace(old, new)


record_import = 'import { asOptionalRecord } from "@openclaw/normalization-core/record-coerce";\n'

context = Path("src/agents/agent-hooks/compaction-safeguard-context.ts")
text = context.read_text()
if record_import not in text:
    text = replace_required(
        text,
        'import { sliceUtf16Safe, truncateUtf16Safe } from "@openclaw/normalization-core/utf16-slice";\n',
        record_import
        + 'import { sliceUtf16Safe, truncateUtf16Safe } from "@openclaw/normalization-core/utf16-slice";\n',
        "context record import",
    )
text = text.replace(
    '  const content = (message as { content?: unknown }).content;',
    '  const content = asOptionalRecord(message)?.content;',
)
text = text.replace(
    '          const text =\n            block && typeof block === "object" ? (block as { text?: unknown }).text : undefined;',
    '          const text = asOptionalRecord(block)?.text;',
)
text = text.replace(
    '    const typeRaw = (block as { type?: unknown }).type;',
    '    const typeRaw = asOptionalRecord(block)?.type;',
)
text = text.replace(
    '    const toolName = (message as { toolName?: unknown }).toolName;',
    '    const toolName = asOptionalRecord(message)?.toolName;',
)
text = text.replace(
    '    formatNonTextPlaceholder((message as { content?: unknown }).content),',
    '    formatNonTextPlaceholder(asOptionalRecord(message)?.content),',
)
context.write_text(text)

semantic = Path("src/agents/agent-hooks/compaction-safeguard-semantic.ts")
text = semantic.read_text()
if record_import not in text:
    text = replace_required(
        text,
        'import { createHash } from "node:crypto";\n',
        'import { createHash } from "node:crypto";\n' + record_import,
        "semantic record import",
    )
if '  | "user-source"\n' not in text:
    text = replace_required(
        text,
        '  | "recent-turn"\n',
        '  | "recent-turn"\n  | "user-source"\n',
        "user source protection type",
    )
text = text.replace(
    '    const type = (block as { type?: unknown }).type;',
    '    const type = asOptionalRecord(block)?.type;',
)
text = text.replace(
    '      const record = block as Record<string, unknown>;',
    '      const record = asOptionalRecord(block);\n      if (!record) {\n        return [];\n      }',
)
old_render = '''  const role = typeof message.role === "string" ? message.role : "unknown";
  const toolName =
    message.role === "toolResult" &&
    typeof (message as { toolName?: unknown }).toolName === "string"
      ? String((message as { toolName?: unknown }).toolName)
      : "";
  const rawContent = (message as { content?: unknown }).content;'''
new_render = '''  const role = typeof message.role === "string" ? message.role : "unknown";
  const messageRecord = asOptionalRecord(message);
  const rawToolName = messageRecord?.toolName;
  const toolName =
    message.role === "toolResult" && typeof rawToolName === "string" ? rawToolName : "";
  const rawContent = messageRecord?.content;'''
text = text.replace(old_render, new_render)
protection_anchor = '    const protectionReasons = new Set<CompactionSemanticProtectionReason>();\n'
if 'protectionReasons.add("user-source")' not in text:
    text = replace_required(
        text,
        protection_anchor,
        protection_anchor
        + '    if (members.some((message) => message.role === "user")) {\n'
        + '      protectionReasons.add("user-source");\n'
        + '    }\n',
        "protect user source",
    )
old_fingerprint = '''    messages.map((message) => ({
      role: message.role,
      timestamp: (message as { timestamp?: unknown }).timestamp,
      content: (message as { content?: unknown }).content,
      toolCallId: (message as { toolCallId?: unknown }).toolCallId,
      toolUseId: (message as { toolUseId?: unknown }).toolUseId,
      toolName: (message as { toolName?: unknown }).toolName,
      isError: (message as { isError?: unknown }).isError,
      details: (message as { details?: unknown }).details,
    })),'''
new_fingerprint = '''    messages.map((message) => {
      const record = asOptionalRecord(message);
      return {
        role: message.role,
        timestamp: record?.timestamp,
        content: record?.content,
        toolCallId: record?.toolCallId,
        toolUseId: record?.toolUseId,
        toolName: record?.toolName,
        isError: record?.isError,
        details: record?.details,
      };
    }),'''
text = text.replace(old_fingerprint, new_fingerprint)
semantic.write_text(text)

judgments = Path("src/agents/agent-hooks/compaction-safeguard-semantic-judgments.ts")
text = judgments.read_text()
if 'type CompactionJudgmentRuntime = Pick<' not in text:
    text = replace_required(
        text,
        'const MAX_SEMANTIC_TIMEOUT_MS = 5_000;\n',
        'const MAX_SEMANTIC_TIMEOUT_MS = 5_000;\n\n'
        'type CompactionJudgmentRuntime = Pick<\n'
        '  JudgmentRuntimeV1,\n'
        '  "evaluate" | "recordOutcome"\n'
        '>;\n',
        "judgment runtime type",
    )
text = text.replace(
    'runtime: Pick<JudgmentRuntimeV1, "evaluate">;',
    'runtime: CompactionJudgmentRuntime;',
)
choice_anchor = '''function asChoiceAnswer(answer: JudgmentAnswer | undefined):
  | Extract<JudgmentAnswer, { type: "choice" }>
  | undefined {
  return answer?.type === "choice" ? answer : undefined;
}
'''
classification_helper = '''
type FidelityClassification = Extract<
  CompactionFidelityResult,
  { status: "ok" }
>["assessments"][number]["classification"];

function classifyFidelityAnswer(
  answer: JudgmentAnswer | undefined,
): FidelityClassification {
  if (answer?.type !== "choice") {
    return "uncertain";
  }
  switch (answer.choice) {
    case "preserved":
    case "missing":
    case "contradicted":
      return answer.choice;
    default:
      return "uncertain";
  }
}
'''
if 'function classifyFidelityAnswer' not in text:
    text = replace_required(
        text,
        choice_anchor,
        choice_anchor + classification_helper,
        "fidelity classification helper",
    )
text = text.replace(
    '''      classification:
        answer?.choice === "preserved" ||
        answer?.choice === "missing" ||
        answer?.choice === "contradicted"
          ? answer.choice
          : ("uncertain" as const),''',
    '      classification: classifyFidelityAnswer(answer),',
)
if 'await params.runtime.recordOutcome("no-change");\n    return allRetainedResult' not in text:
    text = text.replace(
        '  if (eligible.length === 0) {\n    return allRetainedResult',
        '  if (eligible.length === 0) {\n    await params.runtime.recordOutcome("no-change");\n    return allRetainedResult',
    )
    text = text.replace(
        '  if (params.snapshot.obligations.length === 0) {\n    return allRetainedResult',
        '  if (params.snapshot.obligations.length === 0) {\n    await params.runtime.recordOutcome("no-change");\n    return allRetainedResult',
        1,
    )
if 'await params.runtime.recordOutcome("fallback");\n    return allRetainedResult' not in text:
    text = text.replace(
        '  if (outcome.status !== "ok") {\n    return allRetainedResult',
        '  if (outcome.status !== "ok") {\n    await params.runtime.recordOutcome("fallback");\n    return allRetainedResult',
        1,
    )
if 'await params.runtime.recordOutcome(excluded.size > 0 ? "accepted" : "no-change");' not in text:
    text = text.replace(
        '  return {\n    status: "ok",\n    sourceFingerprint: params.snapshot.sourceFingerprint,\n    selectedSegmentIds,',
        '  await params.runtime.recordOutcome(excluded.size > 0 ? "accepted" : "no-change");\n  return {\n    status: "ok",\n    sourceFingerprint: params.snapshot.sourceFingerprint,\n    selectedSegmentIds,',
        1,
    )
second_obligation = '  if (params.snapshot.obligations.length === 0) {\n    return {\n      status: "skipped",'
if second_obligation in text:
    text = text.replace(
        second_obligation,
        '  if (params.snapshot.obligations.length === 0) {\n    await params.runtime.recordOutcome("no-change");\n    return {\n      status: "skipped",',
        1,
    )
second_unavailable = '  if (outcome.status !== "ok") {\n    return {\n      status: "unavailable",'
if second_unavailable in text:
    text = text.replace(
        second_unavailable,
        '  if (outcome.status !== "ok") {\n    await params.runtime.recordOutcome("fallback");\n    return {\n      status: "unavailable",',
        1,
    )
if 'assessments.every((assessment) => assessment.classification === "preserved")' not in text:
    text = text.replace(
        '  return {\n    status: "ok",\n    sourceFingerprint: params.snapshot.sourceFingerprint,\n    candidateFingerprint,\n    assessments,',
        '  await params.runtime.recordOutcome(\n'
        '    assessments.every((assessment) => assessment.classification === "preserved")\n'
        '      ? "no-change"\n'
        '      : "accepted",\n'
        '  );\n'
        '  return {\n    status: "ok",\n    sourceFingerprint: params.snapshot.sourceFingerprint,\n    candidateFingerprint,\n    assessments,',
        1,
    )
judgments.write_text(text)

safeguard = Path("src/agents/agent-hooks/compaction-safeguard.ts")
text = safeguard.read_text()
text = text.replace(
    'import { evaluateJudgment } from "../../judgments/runtime.js";',
    'import { evaluateJudgment, recordJudgmentOutcome } from "../../judgments/runtime.js";',
)
text = text.replace(
    'runtime: { evaluate: evaluateJudgment },',
    'runtime: { evaluate: evaluateJudgment, recordOutcome: recordJudgmentOutcome },',
)
text = text.replace(
    'function nestMarkdownHeadings(text: string): string {\n'
    '  return text.replace(/^##(?=[ \\t]+\\S)/gmu, "###");\n'
    '}\n\n',
    '',
)
old_semantic_import = 'import { buildCompactionSemanticSnapshot } from "./compaction-safeguard-semantic.js";'
new_semantic_import = '''import {
  buildCompactionSemanticSnapshot,
  fingerprint,
  fingerprintCompactionMessages,
} from "./compaction-safeguard-semantic.js";'''
text = text.replace(old_semantic_import, new_semantic_import)
safeguard.write_text(text)

active = Path("src/agents/agent-hooks/compaction-safeguard-active-curation.ts")
text = active.read_text()
text = text.replace(
    'import { evaluateJudgment } from "../../judgments/runtime.js";',
    'import { evaluateJudgment, recordJudgmentOutcome } from "../../judgments/runtime.js";',
)
text = text.replace(
    'runtime: { evaluate: evaluateJudgment },',
    'runtime: { evaluate: evaluateJudgment, recordOutcome: recordJudgmentOutcome },',
)
active.write_text(text)

tests = Path("src/agents/agent-hooks/compaction-safeguard-semantic.test.ts")
text = tests.read_text()
if 'expect(runtime.recordOutcome).toHaveBeenCalledWith("accepted")' not in text:
    text = text.replace(
        '    expect(snapshot.segments).toHaveLength(3);\n  });',
        '    expect(snapshot.segments).toHaveLength(3);\n'
        '    expect(runtime.recordOutcome).toHaveBeenCalledWith("accepted");\n'
        '  });',
        1,
    )
if 'expect(runtime.recordOutcome).toHaveBeenCalledWith("no-change")' not in text:
    fidelity_anchor = '''    expect(result.assessments).toEqual([
      expect.objectContaining({
        obligationId,
        classification: "preserved",
      }),
    ]);'''
    text = replace_required(
        text,
        fidelity_anchor,
        fidelity_anchor
        + '\n    expect(runtime.recordOutcome).toHaveBeenCalledWith("no-change");',
        "fidelity outcome assertion",
    )
user_source_test = '''
  it("protects all user-authored source from semantic exclusion", () => {
    const oldUser = message({
      role: "user",
      content: [{ type: "text", text: "Keep the old deployment constraint." }],
    });
    const latestUser = message({
      role: "user",
      content: [{ type: "text", text: "Finish the deployment." }],
    });
    const snapshot = buildCompactionSemanticSnapshot({
      messages: [oldUser, latestUser],
      latestUserAsk: "Finish the deployment.",
    });

    expect(snapshot.segments[0]?.protectionReasons).toContain("user-source");
    expect(snapshot.segments[0]?.protected).toBe(true);
  });
'''
anchor = '\n});\n\ndescribe("compaction semantic judgments", () => {'
if 'protects all user-authored source from semantic exclusion' not in text:
    text = replace_required(text, anchor, user_source_test + anchor, "user source test")
tests.write_text(text)
