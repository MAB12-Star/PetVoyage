# Independent PetVoyage QA

Owner requested a separate QA agent on November 6, 2026. The coordinator uses independent_qa as a read-only reviewer of each proposed release and its live result. QA does not edit the app, deploy, spend, accept location permission or modify customer data. Passing source checks is not proof of live availability, complete policy coverage or authenticated workflows. Report PASS, FAIL and UNVERIFIED with evidence and scope; resolve confirmed critical regressions before claiming completion.

## Required acceptance cases
- Country-only planning works without a departure city or airport. Optional details refine results.
- Known airline choice is visible. Selected airline rules use its actual record. A flight-number note is not a verified schedule or operating-carrier resolver.
- Country/city/airport route matching is exact where supplied. Explicit airport codes take precedence over stale city text. OAK is not SFO; PVR is not MEX.
- Flight cards appear once beneath destination requirements, remain compact, and provide logos and actual regulation links.
- Budget/network/no-result cases are explicit and provide a labelled search option rather than invented airline inventory.
- Existing to-do board and saved data remain accessible and unchanged; do not infer authenticated save/task actions passed from guest HTTP checks.
- Use varied existing photos and illustrations; inspect assets and preserve owner choices.
- Verify responsive layout, links and deployment provenance without new paid calls unless separately authorized.

## November 6 restoration evidence
Application source release: fad87f1f09cbeadfc98c1f081d6ab1e39a3b36ae. Independent live HTTP QA passed: homepage200, optional departure city, visible airline and flight-number fields, visible My to-do, original /toDoList200, Oakland airport fullname to Mexico City renders the verified Volaris OAK-MEX card with December1/30 dates, and explicit JFK with stale Los Angeles text produces no LAX card. Candidate pure tests also passed country-only US-Mexico gateway options, OAK/SFO separation, PVR/MEX separation and known-airline discovery suppression.

No paid API calls, GPS disclosure or customer-data changes were used for this restoration. Airline research remains at its existing 5-attempt pilot safety cap; no cap reset. The five attempts are budget reservations, not evidence of $5 invoiced usage.

UNVERIFIED/NOT IMPLEMENTED: real-device location, authenticated save/create/move task actions, worldwide airline and state/local regulation completeness, live fare inventory and ticket purchasing. Optional flight number is a supplied reference only.

Local recovery-drive reads/writes stalled during the session; original local edits were preserved. The coordinator prepared and tested an isolated AWS source artifact, confirmed live and GitHub baseline a09dc59, recorded rollback-20261106-before-planner-restoration, committed and pushed the reviewed files, restarted PM2, and obtained independent public HTTP verification. Local reconciliation must preserve any partial pending local edits before a later pull; do not force-reset the local checkout.
