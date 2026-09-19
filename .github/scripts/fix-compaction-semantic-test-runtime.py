from pathlib import Path

path = Path("src/agents/agent-hooks/compaction-safeguard-semantic.test.ts")
text = path.read_text()
start = text.index("function runtimeWithChoices(")
end = text.index('\n\ndescribe("compaction semantic snapshot"', start)
replacement = '''function runtimeWithChoices(choices: Record<string, string>): JudgmentRuntimeV1 {
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
          throw new Error(`choice question ${id} has no criteria`);
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
      status: "ok",
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
    evaluate,
  };
}'''
path.write_text(text[:start] + replacement + text[end:])
