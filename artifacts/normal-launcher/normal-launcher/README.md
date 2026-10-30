# Normal candidate CLI launcher proof

**PASS.** The normal `pnpm openclaw` launcher built the candidate runtime, exposed the new cleanup flags, and then executed the complete isolated retirement/replay scenario. These commands did not substitute a command handler or source entrypoint.

- [Build/help terminal receipt](launcher-help-receipt.json), [build log](launcher-help.stderr), [help output](launcher-help.stdout). Build completed in 2m38.2s. Existing bundler warnings are retained.
- [Scenario summary](run-au_ze1k2/summary.json), [exact argv and exits](run-au_ze1k2/commands.json), [orchestration](proof.py).
- Each product command uses `pnpm --silent openclaw`. Setup alone uses production import APIs through a source fixture helper; SQLite snapshots use an independent database reader.
- Ordinary `--yes` refuses both unavailable import proof and changed identity. Explicit dry-run changes no state-file bytes. Explicit consent retires two files (320 bytes); replay removes zero and changes no persisted state-file bytes. Doctor reports zero issues before and after.
- Active SQLite: one session, three events, 667648 bytes; unchanged SHA-256 `1f34a3d4cde60bfa7c0678812817b630f7a190e3a9d9599e7ab7c410c3091352`. All ten independent raw-backup file hashes remain unchanged.
- Receipts become version 5 and preserve original import evidence. This run does not claim stable-origin state; see the separate upgrade proof.

The fixture is synthetic, not the reporter's private installation. This tests the normal built source-checkout launcher, not an npm-installed candidate package. No live Gateway or external model was used.

`run-8xg_cded` and `proof-console-setup-failed.log` preserve an initial harness failure: the copied fixture's isolation assertion still named its former scratch root. The assertion was updated to the new exact scratch prefix, not removed, and a fresh isolated run was used. No product commands ran in that failed fixture.
