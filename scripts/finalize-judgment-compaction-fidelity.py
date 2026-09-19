from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


judgments = Path("src/agents/agent-hooks/compaction-safeguard-semantic-judgments.ts")
text = judgments.read_text()
text = replace_once(
    text,
    "  const assessments = params.snapshot.obligations.map((obligation) => {",
    '''  const assessments: Extract<
    CompactionFidelityResult,
    { status: "ok" }
  >["assessments"] = params.snapshot.obligations.map((obligation) => {''',
    "assessment declaration",
)
judgments.write_text(text)

safeguard = Path("src/agents/agent-hooks/compaction-safeguard.ts")
text = safeguard.read_text()
text = replace_once(
    text,
    '''function nestMarkdownHeadings(text: string): string {
  return text.replace(/^##(?=[ \\t]+\\S)/gmu, "###");
}

''',
    "",
    "unused heading helper",
)
safeguard.write_text(text)

test_file = Path("src/agents/agent-hooks/compaction-safeguard-semantic.test.ts")
text = test_file.read_text()
old = '''function runtimeWithChoices(
  choices: Record<string, string>,
): JudgmentRuntimeV1 {
  return {
    recordOutcome: vi.fn(async () => {}),
    evaluate: vi.fn(async (batch, options) => {
      options.signal.throwIfAborted();
      const answers = Object.fromEntries(
        Object.entries(batch.questions).map(([id, question]) => {
          if (question.type !== "choice") {
            throw new Error("expected choice question");
          }
          const labels = Object.keys(question.criteria);
          const selected = choices[id] ?? labels[0];
          return [
            id,
            {
              type: "choice" as const,
              choice: selected,
              probabilities: Object.fromEntries(
                labels.map((label) => [label, label === selected ? 1 : 0]),
              ),
            },
          ];
        }),
      );
      return {
        status: "ok" as const,
        result: {
          model: "test-judgment",
          answers,
          usage: { inputTokens: 10, outputTokens: 2 },
        },
        provenance: {
          providerId: "test",
          rubricVersion: "test",
          runtimeGeneration: "generation-1",
        },
      };
    }),
  };
}
'''
new = '''function runtimeWithChoices(
  choices: Record<string, string>,
): JudgmentRuntimeV1 {
  const evaluate: JudgmentRuntimeV1["evaluate"] = async (batch, options) => {
    options.signal.throwIfAborted();
    const answers = Object.fromEntries(
      Object.entries(batch.questions).map(([id, question]) => {
        if (question.type !== "choice") {
          throw new Error("expected choice question");
        }
        const labels = Object.keys(question.criteria);
        const selected = choices[id] ?? labels[0];
        if (!selected) {
          throw new Error(`missing choice label for ${id}`);
        }
        return [
          id,
          {
            type: "choice" as const,
            choice: selected,
            probabilities: Object.fromEntries(
              labels.map((label) => [label, label === selected ? 1 : 0]),
            ),
          },
        ];
      }),
    );
    return {
      status: "ok" as const,
      result: {
        model: "test-judgment",
        answers,
        usage: { inputTokens: 10, outputTokens: 2 },
      },
      provenance: {
        providerId: "test",
        rubricVersion: "test",
        runtimeGeneration: "generation-1",
      },
    };
  };
  return {
    recordOutcome: vi.fn(async () => {}),
    evaluate: vi.fn(evaluate),
  };
}
'''
text = replace_once(text, old, new, "typed judgment fixture")
test_file.write_text(text)
