# Content reconciliation

## Sources and decisions

Compared the original nested checkout's HEAD (`13a55801116fe2eef099ffafce76c36b360d38d3`) with its working-tree changes and reconciled checkout HEAD (`af0bd47fcbcb27cc7a3c75e3468c7836ac226d07`). This was a semantic three-way reconciliation; the old policy file was not copied over the newer file.

- Preserved the reconciled policy's expanded country host list and existing URL-policy behavior.
- Retained the local two-minute `DEFAULT_TIMEOUT_MS` declaration. It was unused in the original local edit and remains unused: this does not change request timeouts. Wiring it into workers requires a separately reviewed change.
- Preserved the local Iceland intent by retaining the newer explicit `mast.is` and `www.mast.is` entries, plus the newer Iceland host entries. The old `.is` entry was not restored.
- Did not explicitly add the local `mast.gov` candidate. Its official ownership and relevance to Iceland have not been verified. The inherited broad `.gov` fallback still accepts this hostname; acceptance by this function is not evidence that a source is official or destination-relevant. Review that broad fallback separately before treating this as a source-trust boundary.
- Applied the previously prepared missing airline policy link state. Empty and whitespace-only links show an unavailable message instead of a link. Existing carrier field mappings remain unchanged.
- No country template, travel requirement, database schema, or record was changed. Origin-specific rendering remains a separate task requiring data review.

## Validation

- `node --check utils/regs-agent/policy.mjs`: passed.
- Full airline EJS template compilation: passed.
- Policy-link rendering for missing, empty, whitespace-only, and valid URL values: passed.
- Policy regression checks: explicit Iceland and expanded Australia hosts accepted; unrelated `.is` host and invalid URL rejected. Confirmed `mast.gov` is still accepted by the inherited broad fallback; it remains unverified.

No commit, push, or deployment was performed by this reconciliation task.
