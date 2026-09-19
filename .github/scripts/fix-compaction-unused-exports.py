import re
from pathlib import Path

path = Path("src/agents/agent-hooks/compaction-safeguard-semantic.ts")
text = path.read_text()
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
path.write_text(text)
