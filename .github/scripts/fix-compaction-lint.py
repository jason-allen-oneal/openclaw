from pathlib import Path


semantic = Path("src/agents/agent-hooks/compaction-safeguard-semantic.ts")
text = semantic.read_text()
text = text.replace("        ].sort((a, b) => a - b)", "        ].toSorted((a, b) => a - b)")
text = text.replace(
    "      roles: members.map((message) => String(message.role)),",
    "      roles: members.map((message) => message.role),",
)
semantic.write_text(text)

active = Path("src/agents/agent-hooks/compaction-safeguard-active-curation.ts")
if active.exists():
    text = active.read_text()
    text = text.replace(
        '  let reason = "semantic-fidelity-rejected";',
        "  let reason: string;",
    )
    active.write_text(text)

tests = Path("src/agents/agent-hooks/compaction-safeguard-semantic.test.ts")
text = tests.read_text()
if "type TestJudgmentRuntime" not in text:
    text = text.replace(
        'import type { AgentMessage } from "../runtime/index.js";\n',
        'import type { AgentMessage } from "../runtime/index.js";\n\n'
        'type TestJudgmentRuntime = Omit<JudgmentRuntimeV1, "recordOutcome"> & {\n'
        '  recordOutcome: ReturnType<typeof vi.fn>;\n'
        '};\n',
    )
text = text.replace(
    "): JudgmentRuntimeV1 {",
    "): TestJudgmentRuntime {",
    1,
)
old = '''    const discretionary = snapshot.segments.filter((segment) => !segment.protected);
    const selection = await evaluateCompactionShadowCuration({
      runtime: runtimeWithChoices({ [discretionary[0]!.id]: "keep" }),
      snapshot,
      signal: new AbortController().signal,
    });'''
new = '''    const discretionary = snapshot.segments.find((segment) => !segment.protected);
    if (!discretionary) {
      throw new Error("missing discretionary test segment");
    }
    const selection = await evaluateCompactionShadowCuration({
      runtime: runtimeWithChoices({ [discretionary.id]: "keep" }),
      snapshot,
      signal: new AbortController().signal,
    });'''
text = text.replace(old, new)
tests.write_text(text)
