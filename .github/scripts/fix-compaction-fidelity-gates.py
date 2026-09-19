from pathlib import Path


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing replacement anchor: {label}")
    return text.replace(old, new)


context = Path("src/agents/agent-hooks/compaction-safeguard-context.ts")
text = context.read_text()
record_import = 'import { asOptionalRecord } from "@openclaw/normalization-core/record-coerce";\n'
if record_import not in text:
    text = replace_required(
        text,
        'import { sliceUtf16Safe, truncateUtf16Safe } from "@openclaw/normalization-core/utf16-slice";\n',
        record_import
        + 'import { sliceUtf16Safe, truncateUtf16Safe } from "@openclaw/normalization-core/utf16-slice";\n',
        "context record import",
    )
text = replace_required(
    text,
    '  const content = (message as { content?: unknown }).content;',
    '  const content = asOptionalRecord(message)?.content;',
    "message content",
)
text = replace_required(
    text,
    '          const text =\n            block && typeof block === "object" ? (block as { text?: unknown }).text : undefined;',
    '          const text = asOptionalRecord(block)?.text;',
    "content block text",
)
text = replace_required(
    text,
    '    const typeRaw = (block as { type?: unknown }).type;',
    '    const typeRaw = asOptionalRecord(block)?.type;',
    "content block type",
)
text = replace_required(
    text,
    '    const toolName = (message as { toolName?: unknown }).toolName;',
    '    const toolName = asOptionalRecord(message)?.toolName;',
    "tool result name",
)
text = replace_required(
    text,
    '    formatNonTextPlaceholder((message as { content?: unknown }).content),',
    '    formatNonTextPlaceholder(asOptionalRecord(message)?.content),',
    "placeholder content",
)
context.write_text(text)

semantic = Path("src/agents/agent-hooks/compaction-safeguard-semantic.ts")
text = semantic.read_text()
if record_import not in text:
    text = replace_required(
        text,
        'import { createHash } from "node:crypto";\n',
        'import { createHash } from "node:crypto";\n' + record_import,
        "semantic record import",
    )
text = replace_required(
    text,
    '    const type = (block as { type?: unknown }).type;',
    '    const type = asOptionalRecord(block)?.type;',
    "semantic content type",
)
text = replace_required(
    text,
    '      const record = block as Record<string, unknown>;',
    '      const record = asOptionalRecord(block);\n      if (!record) {\n        return [];\n      }',
    "semantic block record",
)
text = replace_required(
    text,
    '''  const role = typeof message.role === "string" ? message.role : "unknown";
  const toolName =
    message.role === "toolResult" &&
    typeof (message as { toolName?: unknown }).toolName === "string"
      ? String((message as { toolName?: unknown }).toolName)
      : "";
  const rawContent = (message as { content?: unknown }).content;''',
    '''  const role = typeof message.role === "string" ? message.role : "unknown";
  const messageRecord = asOptionalRecord(message);
  const rawToolName = messageRecord?.toolName;
  const toolName =
    message.role === "toolResult" && typeof rawToolName === "string" ? rawToolName : "";
  const rawContent = messageRecord?.content;''',
    "semantic render record",
)
text = replace_required(
    text,
    '''    messages.map((message) => ({
      role: message.role,
      timestamp: (message as { timestamp?: unknown }).timestamp,
      content: (message as { content?: unknown }).content,
      toolCallId: (message as { toolCallId?: unknown }).toolCallId,
      toolUseId: (message as { toolUseId?: unknown }).toolUseId,
      toolName: (message as { toolName?: unknown }).toolName,
      isError: (message as { isError?: unknown }).isError,
      details: (message as { details?: unknown }).details,
    })),''',
    '''    messages.map((message) => {
      const record = asOptionalRecord(message);
      return {
        role: message.role,
        timestamp: record?.timestamp,
        content: record?.content,
        toolCallId: record?.toolCallId,
        toolUseId: record?.toolUseId,
        toolName: record?.toolName,
        isError: record?.isError,
        details: record?.details,
      };
    }),''',
    "semantic fingerprint record",
)
semantic.write_text(text)

safeguard = Path("src/agents/agent-hooks/compaction-safeguard.ts")
text = safeguard.read_text()
text = text.replace(
    'import { evaluateJudgment } from "../../judgments/runtime.js";',
    'import { evaluateJudgment, recordJudgmentOutcome } from "../../judgments/runtime.js";',
)
text = text.replace(
    'runtime: { evaluate: evaluateJudgment },',
    'runtime: { evaluate: evaluateJudgment, recordOutcome: recordJudgmentOutcome },',
)
safeguard.write_text(text)

tests = Path("src/agents/agent-hooks/compaction-safeguard-semantic.test.ts")
text = tests.read_text()
shadow_anchor = '    expect(snapshot.segments).toHaveLength(3);\n  });'
if 'expect(runtime.recordOutcome).toHaveBeenCalledWith("accepted")' not in text:
    text = replace_required(
        text,
        shadow_anchor,
        '    expect(snapshot.segments).toHaveLength(3);\n'
        '    expect(runtime.recordOutcome).toHaveBeenCalledWith("accepted");\n'
        '  });',
        "shadow outcome assertion",
    )
fidelity_anchor = '''    expect(result.assessments).toEqual([
      expect.objectContaining({
        obligationId,
        classification: "preserved",
      }),
    ]);'''
if 'expect(runtime.recordOutcome).toHaveBeenCalledWith("no-change")' not in text:
    text = replace_required(
        text,
        fidelity_anchor,
        fidelity_anchor
        + '\n    expect(runtime.recordOutcome).toHaveBeenCalledWith("no-change");',
        "fidelity outcome assertion",
    )
tests.write_text(text)
