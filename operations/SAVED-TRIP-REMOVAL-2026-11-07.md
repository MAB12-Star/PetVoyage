# Saved trip removal — 2026-11-07

Owner requested quick X controls for saved trip plans and saved AI itineraries.
Prepared and validated: account-scoped POST removal/restoration with strict kind/ID/action validation and existing same-origin request guard. Embedded deletedAt enables recovery in My trips > View removed trips. No records are purged. Profile hides removed itineraries. Resaving same generated itinerary restores it without duplicating tasks. No task, order, credential or policy changes.
Validation: syntax and diff checks; synthetic handler checks for auth, cross-site, invalid input, ownership predicates, both arrays and restore; EJS active/removed rendering; schema persistence of deletedAt; removed-result resave regression. User model mocked, no customer database writes. Independent QA cleared after two findings corrected.
Rollback: rollback-20261107-before-saved-trip-removal at aaca1d61488a137bd97f9709a46ffbd2a73466d9. Reverting code makes hidden items visible again; no customer data removed.
Release status: candidate validated, production deployment initiated; live HTTP verification recorded by coordinator after restart.
