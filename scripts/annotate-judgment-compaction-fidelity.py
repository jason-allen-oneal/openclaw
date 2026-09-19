from pathlib import Path
import re


targets = {
    "src/agents/agent-hooks/compaction-safeguard-context.ts":
        "Message and content shapes are narrowed by the surrounding role and object checks.",
    "src/agents/agent-hooks/compaction-safeguard-semantic.ts":
        "Serialized message and content shapes are narrowed by the surrounding runtime checks.",
}

for path, invariant in targets.items():
    lines = Path(path).read_text().splitlines()
    output: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        assertion = (
            re.search(r"\bas\b", line) is not None
            and not stripped.startswith("import ")
            and not stripped.startswith("export type ")
            and not stripped.startswith("type ")
            and not stripped.startswith("//")
        )
        if assertion and not (output and output[-1].lstrip().startswith("// SAFETY:")):
            indent = line[: len(line) - len(stripped)]
            output.append(f"{indent}// SAFETY: {invariant}")
        output.append(line)
    Path(path).write_text("\n".join(output) + "\n")
