# Itinerary layout and AI spinner — November7,2026

Owner scope: destination requirements left, flight options right, Prepare your bag below destination requirements; visible AI loading. Duffel/live booking and eventual passenger+pet reservation flow deferred to Phase2. No provider activation, new charges or paid tests in this release.

Desktop CSS areas and mobile logical reading order are explicit. The existing flight wrapper moves once, preserving results/listeners without repeatrequests. Loading rings show while main itinerary/flight research waits; busy flags clear on success, error, policy fallback, saved/cached rendering and202pending response. Reduced-motion preference disables rotation.

Accuracy: route suggestions are explicitly date-unverified. Generic pet-policy citations cannot support a flight route; the same airline source URL must identify both route endpoints. This applies to new, cached and older session results. Explicit airport codes are parsed without confusing SanFrancisco/SFO with SanDiego/SAN or LosAngeles/LAX with Lagos/LOS. A new research-format version avoids reusing cards admitted under the older gate.

Independent QA passed desktop/mobile placement, no duplicate wrapper/fetch on saved rerender, spinner busy/success/error/pending paths, reduced motion, generic-pet URL rejection, same-carrier route sources, cached/session revalidation and airport-code separation. Root syntax/source tests also passed.

Date availability is NOT implemented: current research does not query bookable inventory. A manual GoogleFlights search for OAK–PVR Nov30–Dec31 showed Southwest/Alaska and mixed-carrier options; an American-related result was mixed Alaska+American, not proof of an American-only itinerary or pet space. AA's own exact-date booking page hit CAPTCHA in QA. Snapshot is not a persisted liveoffer; no booking/payment was performed. Phase2 live inventory must revalidate offers, operating carriers, price expiry and actual pet confirmation before presenting tickets/petspace as available.

Status: candidate verified; publication/live check recorded in release history.
