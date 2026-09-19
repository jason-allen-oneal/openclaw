import re
from pathlib import Path

semantic = Path("src/agents/agent-hooks/compaction-safeguard-semantic.ts")
text = semantic.read_text()
text = re.sub(
    r'(?:export )?type CompactionSemanticMode = "off" \| "shadow"(?: \| "apply")?;\n\n',
    "",
    text,
    count=1,
)
for name in (
    "CompactionSemanticObligation",
    "CompactionSemanticProtectionReason",
    "CompactionSemanticSegment",
):
    text = text.replace(f"export type {name}", f"type {name}")
semantic.write_text(text)

runtime = Path("src/agents/agent-hooks/compaction-safeguard-runtime.ts")
runtime_text = runtime.read_text().replace(
    "export type CompactionSafeguardRuntimeValue = {",
    "type CompactionSafeguardRuntimeValue = {",
)
runtime.write_text(runtime_text)
