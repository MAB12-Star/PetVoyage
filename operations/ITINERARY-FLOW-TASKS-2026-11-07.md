# Itinerary flow and task integration — November 7, 2026
Owner requested independent column flow, contextual vet assistance and generated My To-Do tasks on save. UI specialist reviewed the existing workflow.

Prepared changes: independent left requirements/packing/airline/timeline and right flights/questions/vet/actions stacks remove shared-row whitespace. Responsive order remains explicit. Existing /findAVet map is linked from contextual certificate card; no automatic paid maps lookup or extra location request is added.

Authenticated explicit new itinerary save atomically stores itinerary and appends escaped timeline actions, unresolved checks and vet preparation to existing To-Do. Preserves user-created, in-progress and completed tasks. Dedupe checks all columns; repeated saved-plan requests do not append again. Route/city/airport/species/date labels distinguish trips. Workspace timestamp guard returns a retry message on concurrent edits. No migration or backfill of existing saved plans. Generated items remain editable and are guidance, not verified new requirements.

Validation: JS syntax, task preservation, escaping, dedupe and independent column source checks. Independent QA requested. No paid AI, GPS, production customer writes, order or Shopify mutations during testing. Production signed-in end-to-end save not exercised using a customer account.

Baseline b0bd92e98e39f635786c088f130b5a0e3ce9f992. Rollback via prior release. Publication to be verified after deployment. Duffel and actual dated flight inventory remain Phase 2.

Published a0953b25b902ff11f343c1b577c2d3d261203b31 to GitHub master and AWS PM2. Live HTTP checks: CSS, planner JS and /findAVet all 200; independent-column, save CTA, vet card and existing map/filter markers verified. Actual save handler passed isolated mocked atomic-write/session/preservation/repeat-save checks. Authenticated production save and map provider results remain unexercised. Rollback branch rollback-20261107-before-flow-tasks retained.

Owner-requested followup: Save & open My To-Do now opens /toDoList after the successful itinerary+task save; duplicate saves return same board destination. Existing saved itineraries have Open My To-Do primary action. Existing itinerary URL retained in response/My trips. No customer data writes or paid calls during validation. JS syntax checked. Baseline b2246b740e95dedb6366f8d414ceeb996bf499fa; rollback-20261107-before-todo-redirect.
