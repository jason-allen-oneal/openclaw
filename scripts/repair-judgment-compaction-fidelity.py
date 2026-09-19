from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


context_path = "src/agents/agent-hooks/compaction-safeguard-context.ts"
text = read(context_path)
text = replace_once(
    text,
    'import { nestRequiredSummaryHeadings } from "./compaction-safeguard-quality.js";\n',
    "",
    "remove canonical-only nesting import",
)
anchor = "export function formatGeneratedSplitTurnSection(\n"
helper = '''function nestMarkdownHeadings(text: string): string {
  return text.replace(/^##(?=[ \\t]+\\S)/gmu, "###");
}

'''
text = replace_once(text, anchor, helper + anchor, "insert generic heading nesting")
text = replace_once(
    text,
    "  const nestedSummary = nestRequiredSummaryHeadings(summary);",
    "  const nestedSummary = nestMarkdownHeadings(summary);",
    "restore all H2 heading nesting",
)
write(context_path, text)

semantic_path = "src/agents/agent-hooks/compaction-safeguard-semantic.ts"
text = read(semantic_path)
text = replace_once(
    text,
    '  | "recent-turn"\n  | "turn-prefix"',
    '  | "recent-turn"\n  | "user-source"\n  | "turn-prefix"',
    "add user-source protection reason",
)
anchor = '''    if (members.some((message) => params.protectedMessages.has(message))) {
      protectionReasons.add("recent-turn");
    }
    if (members.some((message) => params.turnPrefixMessages.has(message))) {
'''
replacement = '''    if (members.some((message) => params.protectedMessages.has(message))) {
      protectionReasons.add("recent-turn");
    }
    if (members.some((message) => message.role === "user")) {
      protectionReasons.add("user-source");
    }
    if (members.some((message) => params.turnPrefixMessages.has(message))) {
'''
text = replace_once(text, anchor, replacement, "protect every user segment")
write(semantic_path, text)

judgments_path = "src/agents/agent-hooks/compaction-safeguard-semantic-judgments.ts"
text = read(judgments_path)
old = '''  const questions = Object.fromEntries(
    params.snapshot.obligations.map((obligation) => [
      obligation.id,
      {
        type: "choice" as const,
        instructions: { obligationId: obligation.id },
        criteria: {
          preserved:
            "The retained context preserves this obligation's meaning, scope, and unresolved state.",
          missing:
            "The retained context omits material information required to continue this obligation correctly.",
          contradicted:
            "The retained context conflicts with the source-backed obligation.",
          uncertain:
            "The supplied source and retained context do not support a reliable classification.",
        },
      },
    ]),
  );
'''
new = '''  const eligibleObligations = params.snapshot.obligations.filter(
    (obligation) => obligation.complete && Boolean(obligation.sourceSegmentId),
  );
  if (eligibleObligations.length === 0) {
    await params.runtime.recordOutcome("no-change");
    return {
      status: "skipped",
      sourceFingerprint: params.snapshot.sourceFingerprint,
      candidateFingerprint,
      reason: "no-complete-source-backed-obligations",
    };
  }
  const questions = Object.fromEntries(
    eligibleObligations.map((obligation) => [
      obligation.id,
      {
        type: "choice" as const,
        instructions: { obligationId: obligation.id },
        criteria: {
          preserved:
            "The retained context preserves this obligation's meaning, scope, and unresolved state.",
          missing:
            "The retained context omits material information required to continue this obligation correctly.",
          contradicted:
            "The retained context conflicts with the source-backed obligation.",
          uncertain:
            "The supplied source and retained context do not support a reliable classification.",
        },
      },
    ]),
  );
'''
text = replace_once(text, old, new, "filter incomplete fidelity questions")
old = '''  const assessments = params.snapshot.obligations.map((obligation) => {
    const answer = asChoiceAnswer(outcome.result.answers[obligation.id]);
    return {
      obligationId: obligation.id,
      classification:
        answer?.choice === "preserved" ||
        answer?.choice === "missing" ||
        answer?.choice === "contradicted"
          ? answer.choice
          : ("uncertain" as const),
      probabilities: answer?.probabilities ?? {},
    };
  });
'''
new = '''  const assessments = params.snapshot.obligations.map((obligation) => {
    if (!obligation.complete || !obligation.sourceSegmentId) {
      return {
        obligationId: obligation.id,
        classification: "uncertain" as const,
        probabilities: {},
      };
    }
    const answer = asChoiceAnswer(outcome.result.answers[obligation.id]);
    return {
      obligationId: obligation.id,
      classification:
        answer?.choice === "preserved" ||
        answer?.choice === "missing" ||
        answer?.choice === "contradicted"
          ? answer.choice
          : ("uncertain" as const),
      probabilities: answer?.probabilities ?? {},
    };
  });
'''
text = replace_once(text, old, new, "force incomplete obligations uncertain")
write(judgments_path, text)

safeguard_path = "src/agents/agent-hooks/compaction-safeguard.ts"
text = read(safeguard_path)
text = replace_once(
    text,
    'import { evaluateJudgment } from "../../judgments/runtime.js";',
    'import { evaluateJudgment, recordJudgmentOutcome } from "../../judgments/runtime.js";',
    "import outcome recorder",
)
old = "runtime: { evaluate: evaluateJudgment },"
count = text.count(old)
if count != 2:
    raise SystemExit(f"wire production runtime: expected two matches, found {count}")
text = text.replace(
    old,
    "runtime: { evaluate: evaluateJudgment, recordOutcome: recordJudgmentOutcome },",
)
write(safeguard_path, text)

test_path = "src/agents/agent-hooks/compaction-safeguard-semantic.test.ts"
text = read(test_path)
text = replace_once(
    text,
    'import type { AgentMessage } from "../runtime/index.js";\n',
    'import type { AgentMessage } from "../runtime/index.js";\nimport { formatGeneratedSplitTurnSection } from "./compaction-safeguard-context.js";\n',
    "import split-turn formatter",
)
snapshot_close = '''  it("protects unsupported non-text source and marks coverage incomplete", () => {
    const image = message({
      role: "user",
      content: [{ type: "image", mimeType: "image/png", data: "synthetic" }],
    });
    const snapshot = buildCompactionSemanticSnapshot({ messages: [image] });

    expect(snapshot.segments[0]?.protected).toBe(true);
    expect(snapshot.segments[0]?.protectionReasons).toContain("unsupported-content");
    expect(snapshot.complete).toBe(false);
  });
'''
user_test = snapshot_close + '''
  it("protects older user-authored requirements outside the latest obligation", () => {
    const olderUser = message({
      role: "user",
      content: [{ type: "text", text: "Never remove the rollback step." }],
    });
    const assistant = message({
      role: "assistant",
      content: [{ type: "text", text: "The deployment is prepared." }],
    });
    const latestUser = message({
      role: "user",
      content: [{ type: "text", text: "Deploy now." }],
    });
    const snapshot = buildCompactionSemanticSnapshot({
      messages: [olderUser, assistant, latestUser],
      latestUserAsk: "Deploy now.",
    });
    const olderSegment = snapshot.segments.find((segment) => segment.sourceIndexes.includes(0));

    expect(olderSegment?.protected).toBe(true);
    expect(olderSegment?.protectionReasons).toContain("user-source");
  });
'''
text = replace_once(text, snapshot_close, user_test, "add user protection test")
judgments_anchor = 'describe("compaction semantic judgments", () => {\n'
context_test = '''describe("compaction safeguard context", () => {
  it("nests every generated H2 heading under the split-turn section", () => {
    const rendered = formatGeneratedSplitTurnSection(
      "## Original Request\\nKeep context.\\n\\n## Context for Suffix\\nPreserve this.",
    );

    expect(rendered).toContain("### Original Request");
    expect(rendered).toContain("### Context for Suffix");
    expect(rendered).not.toContain("\\n## Context for Suffix");
  });
});

'''
text = replace_once(text, judgments_anchor, context_test + judgments_anchor, "add nesting regression")
final_anchor = '  it("classifies finalized context against source-backed obligations", async () => {\n'
incomplete_test = '''  it("skips definitive fidelity classification for incomplete obligations", async () => {
    const request = "x".repeat(7_000);
    const user = message({
      role: "user",
      content: [{ type: "text", text: request }],
    });
    const snapshot = buildCompactionSemanticSnapshot({
      messages: [user],
      latestUnresolvedUserRequest: request,
    });
    const runtime = runtimeWithChoices({
      [snapshot.obligations[0]!.id]: "preserved",
    });

    const result = await evaluateCompactionFidelity({
      runtime,
      snapshot,
      candidateSummary: request.slice(0, 6_000),
      signal: new AbortController().signal,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "no-complete-source-backed-obligations",
      }),
    );
    expect(runtime.evaluate).not.toHaveBeenCalled();
  });

'''
text = replace_once(text, final_anchor, incomplete_test + final_anchor, "add incomplete obligation test")
write(test_path, text)
