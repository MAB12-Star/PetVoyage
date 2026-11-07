# Destination airport dropdown — November 6, 2026

Status: QA-reviewed candidate; live verification pending.

Main planner and flight search have one optional destination-airport select. Choices are filtered by country and ranked by entered city; choosing an airport fills its municipality and submits its IATA code. Country-only planning remains available. Saved selections are retained, while manual clears/city edits/country changes win over late loads. Airport-country and exact explicit-code matching are validated server-side. This is airport metadata, not live routes, schedules, fares or pet-space inventory.

Data: OurAirports public-domain snapshot, primary source https://github.com/davidmegginson/ourairports-data , commit c483a76d30ee903114b777bf099de0fae1761294, fetched 2026-11-07T01:49:08.215844+00:00. Includes 4008 scheduled-service airports with IATA codes; closed/nonpassenger/non-IATA facilities excluded. The list is hosted locally and makes no paid lookup requests or user-location disclosures. No new provider credentials or dependencies.

Independent QA passed: PVR/MEX/NLU/TIJ/MEL/SYD separation, wrong-country and unknown-code rejection, country-only blank selection, saved PVR, manual/async clear, city edits, country-away/back race, MEX selection city update, and closed TXL exclusion. Browser behavior was checked using a DOM fixture; actual device/GPS was not exercised.

Preserves country requirements, known airline/flight reference fields, to-do board, current route sources, customer data and the exhausted airline-research pilot cap. Local D-drive access remains unreliable; source was prepared in an isolated AWS artifact and original local edits were not overwritten.
