from pathlib import Path

path = Path("src/agents/agent-hooks/compaction-safeguard-semantic.ts")
text = path.read_text()
for name in (
    "CompactionSemanticMode",
    "CompactionSemanticObligation",
    "CompactionSemanticProtectionReason",
    "CompactionSemanticSegment",
):
    text = text.replace(f"export type {name}", f"type {name}")
path.write_text(text)
