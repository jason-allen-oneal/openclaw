from pathlib import Path


def replace_if_needed(
    path: Path,
    *,
    old: str,
    new: str,
    marker: str,
    label: str,
) -> None:
    text = path.read_text()
    if marker in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    path.write_text(text.replace(old, new, 1))


replace_if_needed(
    Path("src/agents/agent-hooks/compaction-safeguard-semantic-judgments.ts"),
    old="  const assessments = params.snapshot.obligations.map((obligation) => {",
    new='''  const assessments: Extract<
    CompactionFidelityResult,
    { status: "ok" }
  >["assessments"] = params.snapshot.obligations.map((obligation) => {''',
    marker="const assessments: Extract<",
    label="assessment declaration",
)

safeguard = Path("src/agents/agent-hooks/compaction-safeguard.ts")
text = safeguard.read_text()
unused = '''function nestMarkdownHeadings(text: string): string {
  return text.replace(/^##(?=[ \\t]+\\S)/gmu, "###");
}

'''
count = text.count(unused)
if count > 1:
    raise SystemExit(f"unused heading helper: expected at most one match, found {count}")
if count == 1:
    safeguard.write_text(text.replace(unused, "", 1))


test_file = Path("src/agents/agent-hooks/compaction-safeguard-semantic.test.ts")
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
replace_if_needed(
    test_file,
    old=old,
    new=new,
    marker='const evaluate: JudgmentRuntimeV1["evaluate"]',
    label="typed judgment fixture",
)
