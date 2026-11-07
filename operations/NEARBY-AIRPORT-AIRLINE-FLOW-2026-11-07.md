# Nearby airport and known-airline flow release — November 7, 2026
Owner requested complete nearby airport choice, Edinburgh airline options and known-airline policy beside destination requirements.

Airport picker: defaults100straight-line miles with50/100/200 choices. Same pinned OurAirports4008scheduled-service IATA catalog enriched with coordinates from original source commit c483a76d30ee903114b777bf099de0fae1761294. https://ourairports.com/help/data-dictionary.html . Browser permission-based location stays in browser; no airport Places search or reverse-geocoding request. Nearest airport country is only an editable suggestion, not pet residence/history. Airports shown name/code/distance; selectedrealcode submitted. Manual city/code edits protected from late results.

Synthetic Oakland center test: OAK6mi/SFO14mi/SJC36mi within100mi; other scheduled-service airports also shown. Browser mocks passed initialcountry/OAK, SFOselection,manualcity preservation, radius retention; UnitedStates/Mexico normalization passed afterQA correction. Syntax7JS/EJS3templates passed.

Research coverage expanded from7to14 official carrier domains (KLM/BritishAirways/AirFrance/Lufthansa/AerLingus/Icelandair/VirginAtlantic added), retaining same-carrier/exactendpoint citation gates. No new paid tests, budgetincrease or provider enabled.

Verified primary-source published itinerary: https://www.klm.com/en-us/flights-from-san-francisco-to-edinburgh . Route page appeared in official KLM search result; direct automated retrieval403. No fares,travel dates,nonstop service,operating airlines or pet acceptance verified. Curated SFO→EDI KLM card valid reviewNov7–Dec7. OAK/SJC→EDI receives explicit nearby-SFO alternative, never fabricated OAKservice. User must choose SFO. Official policy slug verified from /airlines publiccatalog. Ordinary pet entry toGB mayrequire separatecargo arrangements; carddoesnotclaimcabinacceptance.

Knownairline: no researchwrapper rendered when airlineIdselected; selectedairline AIguidance in rightcolumn beside destination, above questions. Packing remains belowdestination. Savedtasks/productfeatures preserved.

Independent QA passed radius,exactroute,selectedairline flow and raised normalization issue; corrected and separatelytested. No realGPS,paidAI or customerDBwrites. Prior baseline d7d0081 preserved via rollback-20261107-before-airport-flow. Publication/liveverification recorded after deployment.

PUBLISHED 31706ebad0f495881d8ba14f1399a9b420c809af plus b48e7fe country-label refinement. Live HTTP200 verified homepage50/100/200selector, nearbyJS,4008coordinatecatalog; OAK→EDI explicit SFOalternative; SFO→EDI KLMroute; selectedKLM noflightresearchwrapper; airlinecard right-column JS served. Smoke tests used actual Scotland (Great Britain) label. No paid requests/GPS/customerwrites.
