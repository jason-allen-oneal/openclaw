# Retained migration audit

**Verified:** the stopped fixture was migrated and resumed with its existing Android pairing, session identity, and conversation history. This is a recovered upgrade, not an uninterrupted first-attempt success.

- **Initial upgrade:** failed before readiness (Gateway exit 78), requiring retained schema-23 migration. Its failed receipt remains intact.
- **Doctor:** `doctor --fix --non-interactive --no-workspace-suggestions`, target `a7f5cc2`, exited 0. The optional `OPENCLAW_SERVICE_REPAIR_POLICY=external` variable was **not set**. Service checks were logged; no service mutation was recorded. Do not describe them as policy-disabled.
- **Migration:** agent schema 23 → 31; shared-state primary schema 30. Two completed manifests, no failed manifests, three validated backup artifacts with matching hashes. Final canonical-validation queue is empty; one canonical-ready row.
- **Logical continuity:** one session node and one session window retained without rebinding/rekeying. All six baseline transcript events remain payload-identical; five newer events were appended. Cold entry fields moved into two snapshot rows, so whole-entry byte equality is not required.
- **Config and filesystem:** Doctor changed config bytes, adding 16 leaf paths while retaining all original leaf values. All 23 workspace files remained byte-identical; home/state/workspace/plugin directory identities stayed unchanged. Upgrade receipts record no reseed, setup, or data copy.
- **Android:** identical application and instrumentation APK hashes (`7a5e0bd` source), unchanged persisted app state across the upgrade boundary, and successful node/operator connections with identical signed device/public-key hashes. No app clear or setup-code request.
- **Native history:** identical session-key and session-ID hashes; both prior message hashes were returned before the new upgraded send. The auditor also inspected the screenshot showing the retained prior exchange.
- **Cleanup:** recovered Gateway exited 0; all owned runtime children stopped and fixture ports 20094/20095 are free. Both completed native captures passed.

The companion [JSON audit](retained-migration-audit.json) contains hash-only evidence bindings and comparison details. It does not expose raw configuration values, credentials, or conversation contents. Schema advancement and file hashes alone were not treated as proof of semantic retention.
