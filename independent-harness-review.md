# Independent v2026.11.2 harness review

A separate read-only native reviewer inspected the new proof.py, finish-current.py, shipped-reader.mjs and release-contract.json against the retained v2026.11.1 drivers. No blocking harness defect was found for this fresh, frozen-head run. No reviewer files were changed.

- Nondefault settings use supported config getters before and after migration/retirement.
- Sessions CLI and Doctor exercise the real read-only SQLite paths.
- Actual v2026.11.2 metadata declares agent schema 27; its exact shipped manifest reader admits versions 1–4, making the separate v5-refusal check valid.
- Backup hashes, controlled interruption, resume/replay and isolated HOME/TMPDIR/XDG handling are sound.

Limitations: session inspection and retained transcript data, not new conversational writes or model execution; callback fault injection, not an OS kill; older CLI refusal may occur at the shared schema gate, while the direct shipped-reader check independently establishes v5 refusal. Cached output is invalid after fixture or candidate changes; this run uses fresh outputs and unchanged candidate 556fc60f228c8a2437effe2c89926dc0ba1d0483.
