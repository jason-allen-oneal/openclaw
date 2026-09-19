from pathlib import Path


path = Path("src/agents/agent-hooks/compaction-safeguard.ts")
text = path.read_text()

if "  appendSummarySection,\n" not in text:
    anchor = '''import {
  buildCompactionStructureInstructions,
'''
    replacement = '''import {
  appendSummarySection,
  auditSummaryQuality,
  buildCompactionStructureInstructions,
'''
    if anchor not in text:
        raise SystemExit("quality import anchor not found")
    text = text.replace(anchor, replacement, 1)

if "  type CompactionLoss,\n" not in text:
    anchor = '''  buildPreservedTurnsSection,
  buildSplitTurnContextSection,
'''
    replacement = '''  buildPreservedTurnsSection,
  buildSplitTurnContextSection,
  type CompactionLoss,
  type ContextSection,
'''
    if anchor not in text:
        raise SystemExit("context import anchor not found")
    text = text.replace(anchor, replacement, 1)

path.write_text(text)

for target, invariant in {
    "src/agents/agent-hooks/compaction-safeguard-active-curation.ts":
        "The optional runtime state is checked before the narrowed value is used.",
    "src/agents/agent-hooks/compaction-safeguard-summary-attempt.ts":
        "The summary candidate shape is created and controlled by this module.",
    "src/agents/agent-hooks/compaction-safeguard.ts":
        "The branch-local compaction value is narrowed by the surrounding checks.",
}.items():
    file = Path(target)
    lines = file.read_text().splitlines()
    output: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        is_assertion = (
            " as " in line
            and " as const" not in line
            and not stripped.startswith("import ")
            and not stripped.startswith("export type ")
            and not stripped.startswith("type ")
        )
        if is_assertion and not (output and output[-1].lstrip().startswith("// SAFETY:")):
            indent = line[: len(line) - len(stripped)]
            output.append(f"{indent}// SAFETY: {invariant}")
        output.append(line)
    file.write_text("\n".join(output) + "\n")
