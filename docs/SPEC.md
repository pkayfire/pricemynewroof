# Roof Cost Calculator: Implementation Spec

Oct 3, 2026. Owner: Peter

## Overview

Build a roof replacement cost calculator that works for any US address, earns revenue by routing homeowners to a lead buyer (Service Direct), and is the landing page for a ChatGPT Ads test. Brand: **Price My New Roof**, at **pricemynewroof.com** (use it in copy, metadata, emails and the ad account).

**Goal of v1:** measure whether ChatGPT ad clicks convert into qualified calls or leads for less than the payout (about $50 per qualified lead). Everything in v1 serves that measurement.

**User flow:** enter address → roof measured from satellite data → price ranges for 2–3 roof options with a plain-language explanation → call or request quotes (only where the buyer has coverage).

**Principles**

- One engine for every address. Location-specific inputs come from data tables, never hard-coded places.
- Deterministic and versioned. The same address and config version always produce the same estimate; every estimate records its config version.
- Degrade gracefully. Missing metro wage data falls back to state, then national; no Solar API coverage falls back to home-size questions. Every fallback widens the range and lowers stated confidence.
- Live external calls only at estimate time (Google). Government data is fetched by scheduled jobs into a config file, never at request time.
- The LLM never produces prices. It only writes the explanation from computed facts.
- Honest by construction: general estimate, not a quote; referral service, not a contractor; no contact details collected where we can't route them.

**Out of scope for v1:** per-city permit fee schedules, local quote data, a ChatGPT plugin, selling leads directly to roofers, the SEO cost-guide pages.

**Design reference:** the v2 mockups in `docs/design/` (landing, roof and estimate, phone estimate) and the Design section below. Earlier v1 mockups are superseded.

## Architecture and stack

```
ChatGPT ad click ──> Next.js app ──────────────> Estimate API (pure engine, versioned config)
(oppref, ad group)   (landing, estimate, form)     │  live calls ──> Google Places + Solar API
                       │            │              │
                       │            │              └── reads config-vN.json <── Config build job
                       v            v                                          (BLS wages, PPI, HUD ZIPs)
              Explanation      Lead and call routing ──> Service Direct
              service (LLM)    (coverage, consent,
                               forwarding)
                                    │
                                    v
                           Event log (Postgres) ──> OpenAI Conversions API
```

The app calls one Estimate API, which makes the only live external calls (Google) and reads government data solely from the config build's versioned file; leads, calls and events flow to the event log and back to OpenAI.

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router), TypeScript, server-rendered landing content |
| Hosting | Vercel Pro: Next.js site and API routes (serverless functions), Vercel Cron for scheduled jobs. No separate server (no Render needed) |
| Database | Supabase Pro (Postgres), including a queue table for lead-forwarding retries |
| Maps and address | Google Maps JavaScript API (satellite) + Places Autocomplete |
| Roof data | Google Solar API, `buildingInsights:findClosest` |
| Government data | BLS Public Data API v2 (PPI), BLS OEWS bulk file (wages), HUD USPS ZIP crosswalk |
| Explanation | A small, fast LLM (e.g. Claude Haiku), 1.5 s timeout, template fallback |
| Tests | Vitest, recorded API fixtures, no live calls in CI |
| Measurement | Own events table + OpenAI Pixel and Conversions API |

## Configuration data pipeline

A build job merges government data and hand-researched base costs into one versioned file, `config-vN.json`. The estimate engine reads only that file, never a live government API.

| Table | Source | Refresh | Notes |
| --- | --- | --- | --- |
| ZIP → metro area (CBSA) | HUD USPS ZIP crosswalk API (free token) or Census relationship files | Quarterly | ZIPs spanning several metros: pick the highest residential ratio. Non-metro ZIPs map to the state's nonmetropolitan area |
| Roofer wage by area | BLS OEWS annual bulk file (all areas) | Yearly (May data) | Occupation 47-2181, median hourly wage. Fallback: metro → state → national. Suppressed values are marked in the file |
| Material price trend | BLS Public Data API v2, PPI series for asphalt roofing products and concrete products | Monthly | Free key (500 queries/day, 50 series/query); renew yearly. Look up series IDs in BLS Data Finder |
| National base per square | Hand-researched cost guides (see Estimate engine) | When re-researched | Low/high per option, each with source URL and date |
| Tile-common states | Static list: CA, AZ, FL, NV, TX, NM, HI | Rarely | Controls default options |
| Permit estimate | Static: percent of job value with min/max | Yearly review | Labeled "varies by city" in UI |
| Buyer coverage | Service Direct covered ZIPs (list or API) | Weekly | Drives call/form vs no-coverage UI. Stored in the database, not the config file |

**Repo layout**

```
config/
  sources/          one JSON file per input: value, low/high, source URL, retrieved date
  fetchers/         hud_crosswalk.ts, bls_oews.ts, bls_ppi.ts
  manual/           base_costs.json, tile_states.json, permit.json (each with reviewedAt)
  build.ts          merges, validates, writes config/dist/config-vN.json
```

**Build checks (fail the build if any fails)**

- Every ZIP in the crosswalk resolves to a wage through the fallback chain.
- No value moves more than 15% from the previous version without an explicit override flag.
- No manual input is past its review date.
- PPI base-date values exist for every material series used.

**Notes for implementation**

- BLS bulk downloads reject requests without a descriptive User-Agent header with contact info; set one.
- Store the BLS API key and HUD token as secrets, never in the repo.
- The engine imports a config by version; deploys pin the version. Rolling back = repointing the version.

## Estimate engine

The engine is a pure function: `(measurements, locationFactors, config) → estimate`. All network calls (Places, Solar API, config load) happen before it in the request handler. Most tests target this function.

**Request flow for `POST /api/estimate`**

1. Resolve location: Google Places `placeId` → lat/lng, ZIP, city, state. ZIP → CBSA → wage via config.
2. Measure: Solar API `buildingInsights:findClosest` (lat/lng).
   - Coverage OK: sum `roofSegmentStats[].stats.areaMeters2`, keep each segment's `pitchDegrees`, `azimuthDegrees` and center. Record imagery quality and date.
   - Low imagery quality: use it, but widen the range.
   - No coverage (404 / no building): return `needsFallback: true`; the UI asks home size, stories, roof shape (see Frontend).
   - Sanity bounds: squares < 8 or > 60 → treat as wrong building, ask user to confirm or use fallback.
3. Location factors:
   - `laborRatio = areaWage / nationalWage`, clamped to [0.75, 1.6].
   - `materialRatio = ppiNow / ppiAtBaseDate` (per material family).
4. Price each option (below), then compute drivers.

**Measurement math**

- `squares = sumAreaM2 × 10.764 / 100`
- Pitch per segment as x/12: `12 × tan(pitchDegrees)`
- `waste = 0.10` if segments ≤ 4, `0.12` if 5–10, `0.15` if > 10
- `steepSquares` = squares in segments steeper than 6/12; adder per steep square from config
- Fallback squares from home size: `footprint = homeSqft / stories`, `squares = footprint × 1.15 (overhang + typical pitch) × shapeFactor / 100`, shapeFactor 1.0 / 1.1 / 1.25 for simple / average / complex. Widen range ±20%.

**Pricing formula (per option, computed separately for low and high)**

```
perSq  = base[option] × ( labor_share × laborRatio
                        + material_share × materialRatio
                        + other_share )
price  = squares × (1 + waste) × perSq
       + steepSquares × steepAdder
       + permit(price)            // percent of job value, min/max from config
widen  if imageryQuality is MEDIUM/LOW or fallback used
round  low down / high up to nearest $500
```

**Cost shares (for the breakdown bar and drivers)**

Shares describe the first option shown only (see Options shown), computed at the midpoint of its low and high before rounding:

- `labor` = squares × (1 + waste) × base × labor_share × laborRatio
- `materials` = squares × (1 + waste) × base × material_share × materialRatio
- `other` = squares × (1 + waste) × base × other_share + steepSquares × steepAdder + permit

Each is divided by the option's total price. Round labor and materials to two decimals and set `other = 1 − labor − materials`, so the shares always sum to 1. The steep adder and the permit belong to `other`; there is no separate permit slice.

**Initial base costs (national, per square, installed, base date 2026-08)**

| Option | Low | High | Labor / material / other | Confidence |
| --- | --- | --- | --- | --- |
| Architectural shingle | $550 | $900 | 0.55 / 0.30 / 0.15 | Medium |
| New concrete tile | $1,000 | $1,800 | 0.55 / 0.30 / 0.15 | Medium |
| Tile lift and relay | $550 | $900 | 0.65 / 0.20 / 0.15 | Low |

These figures are treated as all-in (including tear-off); do not add a separate tear-off line in v1 or it double counts. Shingle low is kept at $550, between the sources below; lift-and-relay low was raised from $400 to $550 because no source goes below $600 and the only one is Florida, a high-cost market. Lift and relay has no solid national source; calibrate it with real quotes before scaling.

**Base cost sources (retrieved 2026-10-03; converted to per square)**

| Option | Source | Published range | Page date |
| --- | --- | --- | --- |
| Architectural shingle | [Modernize cost calculator](https://modernize.com/roof/cost-calculator) | $600–$900 | Updated 2026-08-21 |
| Architectural shingle | [HomeAdvisor: roof replacement](https://www.homeadvisor.com/cost/roofing/install-a-roof/) | $400–$600 | Updated 2026-06-17 |
| Architectural shingle | [The Roofing Brief: 2026 Roofing Cost Report](https://theroofingbrief.com/2026-roofing-cost-report/) | $500–$800 | Published 2026-06-17, reviewed 2026-09 |
| New concrete tile | [Modernize cost calculator](https://modernize.com/roof/cost-calculator) | $1,000–$1,800 | Updated 2026-08-21 |
| New concrete tile | [HomeAdvisor: tile roof](https://www.homeadvisor.com/cost/roofing/install-replace-tile-roof/) | $900–$1,800 | Updated 2026-06-19 |
| New concrete tile | [The Roofing Brief: 2026 Roofing Cost Report](https://theroofingbrief.com/2026-roofing-cost-report/) | $700–$1,900 | Published 2026-06-17, reviewed 2026-09 |
| Tile lift and relay | [RoofCost Florida: tile re-underlayment](https://roofcostflorida.com/tile-re-underlayment) | $600–$1,170 (Florida, all-in) | Updated 2026-09-26 |

Notes: RoofCost Florida is an independent pricing guide, not a roofer; no South Florida roofer found publishes per-square lift-and-relay pricing. Of these sources, only RoofCost Florida states its figures are all-in; the others don't say whether tear-off is included.

**Options shown**

- Current roof is tile, or state is in the tile list: lift and relay, new concrete tile, architectural shingle.
- Otherwise: architectural shingle first, concrete tile as an option.

**Drivers object (returned with every estimate)**

```json
{
  "squares": 20.4, "sections": 9, "complexity": "above average",
  "steepShare": 0.30, "maxPitch": "8/12",
  "areaName": "Phoenix", "wageSource": "metro",
  "laborVsNational": -0.08, "materialTrendSinceBase": 0.03,
  "sharesOption": "lift_and_relay",
  "shares": {"labor": 0.59, "materials": 0.20, "other": 0.21},
  "confidence": "high", "fallbacks": []
}
```

The same object drives the cost-breakdown bar and the explanation, so they can never disagree. `sharesOption` is the id of the first option shown; the UI labels the bar with that option's name.

Worked example for the shares above (Arizona is a tile state, so lift and relay is shown first). It uses the midpoint steep adder ($100 per square) and a 2% permit (see Build decisions). 20.4 squares × 1.12 waste = 22.85; midpoint base $725; 30% of squares steep = 6.12.

| Part | Calculation | Dollars |
| --- | --- | --- |
| Labor | 22.85 × 725 × 0.65 × 0.92 | 9,906 |
| Materials | 22.85 × 725 × 0.20 × 1.03 | 3,412 |
| Other: base | 22.85 × 725 × 0.15 | 2,485 |
| Other: steep adder | 6.12 × 100 | 612 |
| Other: permit | 2% of 16,415 | 328 |
| Total | | 16,743 |

Labor 9,906 / 16,743 = 0.59; materials 3,412 / 16,743 = 0.20; other = 1 − 0.59 − 0.20 = 0.21.

## Explanation service

The "Why this price" text is written by a small, fast LLM from the drivers object only. It never sees or produces prices beyond what the drivers contain.

**Endpoint:** `GET /api/explanation/:estimateId`. The page renders the estimate first, then fetches this.

**Prompt contract**

- Input: the drivers JSON (no address, no personal data).
- Output: 2–3 plain sentences naming the two or three biggest drivers, in the homeowner's terms. No numbers that aren't in the drivers. No promises, no "exact", no "guaranteed".
- Area naming: use `areaName`; when `wageSource` is `state` or `national`, say so plainly.

**Validation (all must pass, else use the template)**

1. Every number in the output matches a value in the drivers (allow rounding and percent formatting).
2. Length ≤ 400 characters, 2–3 sentences.
3. No banned terms: guaranteed, exact, promise, best price, cheapest.
4. Response within 1.5 seconds.

**Template fallback (deterministic)**

"Your roof is about {squares} squares across {sections} sections. {steepSentence} Roofing labor in the {areaName} area runs about {laborPct}% {above/below} the national average."

**Caching and review**

- Cache by SHA-256 of the canonicalized drivers object; identical drivers reuse the text.
- Log every explanation with drivers, model, latency, and whether the template was used.
- Track template rate; alert if > 20% over a day. Review a sample of 20 explanations weekly.
- The UI labels the box "Written automatically from your roof's measurements."

## Coverage, leads and calls

We only collect contact details where someone will act on them: in v1, Peter forwards each request by hand; later, Service Direct. Coverage decides what the result screen offers.

**Buyer mode (v1 starts without Service Direct):** config `buyerMode: "none" | "manual" | "service_direct"` and `primaryCta: "form" | "call"`. v1 ships with `buyerMode: "manual"` and `primaryCta: "form"`: "Request quotes from local roofers" is the primary button, every submission is saved to the Supabase `leads` table, and the call button is hidden unless a tracking number exists. Switching to Service Direct later is a config change plus the integration, not a UI rewrite.

**Coverage:** `GET /api/coverage?zip=` → `{ covered, trackingNumber?, leadTypes }`. In `none`/`manual` mode, coverage comes from a launch allowlist of ZIPs or metros in config; in `service_direct` mode, from the `coverage` table synced weekly from Service Direct. Outside coverage, show the no-coverage result.

- Covered: primary CTA per `primaryCta` (v1: request quotes, opening the quote form); secondary "Call for exact quotes" only when a tracking number exists.
- Not covered: estimate stays; panel says no partner roofers yet; optional "email me this estimate" plus opt-in "tell me when roofers are available." Nothing is shared with roofers.

**Lead intake:** `POST /api/lead`

1. Validate name, phone (E.164), email, ZIP covered, consent checkbox true.
2. Dedupe: same phone within 30 days → accept but don't re-forward; return success to the user.
3. Persist with consent record: exact consent text version, timestamp, IP, user agent, page URL, and a consent certificate ID if the buyer requires one (e.g. TrustedForm).
4. Forward according to `buyerMode`. `manual` (v1): save with `forward_status = "manual_pending"`, list it in a password-protected `/admin/leads` page with CSV export, and Peter forwards it by hand within one business day, then marks it forwarded. `none`: save with `forward_status = "held"` (development and testing only; never run ads in this mode, because the form promises quotes). `service_direct`: forward via their API with exponential backoff up to 24 hours; alert after 3 consecutive failures. Copy and consent text must always describe what actually happens to the request in the active mode.
5. Attach estimate measurements (squares, pitch, current roof) if the buyer accepts them.

**Call results:** `POST /api/webhooks/calls` receives Service Direct call outcomes (qualified flag, duration) if they offer postbacks; link to the session by tracking number + timestamp or a passed-through ID. Verify a shared secret on every webhook.

**Open questions for Service Direct**

- [ ] Payout definition: per qualified call or per form lead, and the qualifying call duration
- [ ] ZIP coverage list or API, and update frequency
- [ ] Per-campaign tracking numbers or call-outcome postbacks
- [ ] Lead intake method (API, email, form post) and required fields
- [ ] Required consent language and certificate provider
- [ ] Written approval of ChatGPT Ads as a traffic source

## Frontend

Next.js (App Router, TypeScript) with server-rendered landing content, so OpenAI's ad crawler (OAI-AdsBot) sees the explanation, disclosures and links without running JavaScript.

| Screen | Desktop | Phone | Key states |
| --- | --- | --- | --- |
| Landing | Headline + address field beside a sample satellite view with plane markers; "What your estimate is built from" title block; referral note; footer | Same, stacked | Autocomplete loading, invalid address |
| Roof + estimate | Satellite map with plane markers, measurement table, current-roof select; estimate sheet with options, "Why this price" and breakdown bar, quote CTA | One column, same order | Imagery quality note, low-confidence range |
| Fallback | Home size, stories, roof shape, current roof | Same | Shown when `needsFallback` |
| No coverage | Estimate + email-me panel | Same | No call/form CTAs |
| Quote form | Name, phone, email, timing, consent | Same | Validation, duplicate, success |

**Maps and data display**

- Google Maps JavaScript API satellite view and Places Autocomplete (keeps Solar API data on a Google map, per Maps Platform terms). Show required Google attribution.
- Show roof planes as markers at each Solar API segment center (see Design: plane markers). Never draw plane outlines or hip lines in v1; the API doesn't provide plane geometry.

**Copy rules**

- Location text is always generated: "For the {areaName} area." Never hard-code a city.
- Every result shows: "A general estimate, not a quote," the sources line, and the satellite limitation.
- Referral disclosure on landing, result and form: referral service, not a contractor; partner roofers pay for referrals.
- No unverified claims (no "lowest price," no fake counters, no badges).

**Performance and abuse**

- Landing page LCP under 2.5 s on mobile; map loads after the hero.
- Rate-limit `/api/estimate` per IP and session (e.g. 10/hour) to cap Google spend. Never block the landing page itself from crawlers; robots.txt allows OAI-AdsBot and OAI-SearchBot.
- Accessibility: real labels, 44 px touch targets, 4.5:1 text contrast, visible keyboard focus.

## Design

The look comes from the roofing trade, not a generic web template. One signature element carries it: **plane markers on the satellite view of the homeowner's roof**, the way a roofer's measurement report labels each plane. Everything around it stays plain and disciplined.

**Color**

| Name | Hex | Use |
| --- | --- | --- |
| Concrete | `#EFF1F0` | Page background |
| Surface | `#FFFFFF` | Panels, estimate sheet, table, header |
| Asphalt | `#22262A` | Text, primary buttons, heavy rules, footer |
| Slate | `#4A5259` | Secondary text |
| Galvanized | `#8C969D` | Input borders, "other" segment in the breakdown bar |
| Rule | `#CDD3D6` / `#E1E5E7` | Borders / row dividers |
| Chalk blue | `#2F6FD0` | Measurements only: pitch values, marker outlines, the brand mark's pitch triangle, materials segment. Never buttons or decoration |

**Type**

- Barlow (400, 500, 600) for body and UI; Barlow Semi Condensed (500, 600, 700) for headings, prices and plane letters. Both from Google Fonts.
- Scale: landing h1 3.6rem / line-height 0.98; estimate h1 2.5rem; section h2 2rem; sheet heading 1.6rem; body 17px / 1.5; small 15px; fine print 12.5–13px.
- Tabular numerals for every measurement and price.
- Sentence case everywhere. No all-caps labels, no arrows in button text, no middle-dot metadata strings, no single highlighted word in headlines.

**Shape and layout**

- Radius 4px on inputs, buttons and panels; 2px on the estimate sheet and title block. No shadows, no gradients.
- Content max width 1180px, side padding 28px (18px on phones).
- Desktop estimate: two columns, map and measurement table left, estimate sheet right. Phone: one column in the same order.
- Left-aligned text throughout.

**Components**

- **Brand mark:** a roof line with a small chalk-blue pitch triangle, plus "Price My New Roof" in Barlow Semi Condensed 700.
- **Plane markers:** white pill (about 96×30px), 1.5px chalk-blue outline; plane letter in Barlow Semi Condensed 700, pitch in chalk blue, and an arrow pointing downhill, rotated by the segment's azimuth. Placed at each segment's center on the Google satellite map. Segments under 50 sq ft get no marker and are grouped as "Other" in the table. Letters A, B, C… ordered by area, largest first.
- **Measurement table:** columns Plane, Pitch, Slopes toward (nearest of 8 compass directions from azimuth), Area; an "Other" row; total row with a 2px asphalt top rule; caption with the imagery date and what the markers mean.
- **Estimate sheet:** 2px asphalt border; heading plus "For the {areaName} area. A general estimate, not a quote."; options as line items with the range right-aligned; "Why this price" with the breakdown bar for the first option shown, labeled "Cost breakdown for {option name}" (labor asphalt, materials chalk blue, other galvanized, legend text "Tear-off, overhead, steep-roof work and permit") and a text legend; the quote CTA and the referral sentence.
- **Title block (landing):** "What your estimate is built from" as a definition list with a 2px asphalt border and a 180px term column, including a row for what the estimate can't see.
- **Buttons:** primary is asphalt with white text, 54–56px tall. Links are underlined asphalt.
- **Inputs:** the landing address field has a 2px asphalt border and 56px height; other inputs have a 1px galvanized border.

**Landing hero visual:** a static sample satellite image with the same plane markers and a caption saying it's a sample. It's an illustration, not Solar data.

**Copy for key actions:** "Measure my roof", "Request quotes from local roofers", "Not your house? Change the address", "How we estimate".

**Screens not yet mocked in v2** (fallback, no coverage, quote form, thank-you, admin) use the same tokens and components. Keep the v2 mockup HTML in `docs/design/` for reference.

## API contracts and data model

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/estimate` | `{ placeId, currentRoof?, fallback?: { homeSqft, stories, shape } }` | `{ estimateId, needsFallback, measurements, options[], drivers, configVersion, coverage }` |
| `GET /api/explanation/:estimateId` | — | `{ text, source }`, where source is `llm` or `template` |
| `GET /api/coverage?zip=` | — | `{ covered, trackingNumber?, leadTypes[] }` |
| `POST /api/lead` | `{ estimateId, name, phone, email, timing, consentVersion, consentCertId? }` | `{ ok, leadId }` |
| `POST /api/email-estimate` | `{ estimateId, email, notifyWhenCovered }` | `{ ok }` |
| `POST /api/events` | `{ sessionId, name, props }` | `204` |
| `POST /api/webhooks/calls` | Service Direct payload (shared secret) | `200` |

`options[]` item: `{ id, name, low, high, note }`, prices as integers in dollars. `measurements.segments[]` item: `{ letter, pitch, azimuth, compass, areaSqft, center }`.

**Postgres tables**

- `estimates`: id, created_at, place_id, zip, cbsa, state, measurements_json (expires_at = created_at + 30 days, nulled by a job), options_json, drivers_json, config_version, session_id, client.
- `leads`: id, estimate_id, name, phone, email, timing, consent_version, consent_text_hash, consent_cert_id, ip, user_agent, attribution_json, forward_status, forwarded_at, buyer_ref.
- `events`: append-only; id, session_id, name, ts, attribution_json, props_json.
- `explanations`: drivers_hash (PK), text, model, latency_ms, source.
- `coverage`: zip (PK), covered, tracking_number, lead_types, synced_at.
- `email_signups`: id, estimate_id, email, notify_when_covered, consent_ts.
- `config_versions`: version, built_at, checksum.

**Data retention:** Solar-derived measurements are purged after 30 days (Google caching limit); keep the computed options and drivers only if the Maps Platform terms allow it, otherwise purge those with the measurements. Lead PII retention follows the privacy policy.

## Routes

**Public pages**

| Route | What it shows | Notes |
| --- | --- | --- |
| `/` | Landing: headline, address field, sample satellite view with markers, title block, referral note, footer | Server-rendered for OAI-AdsBot |
| `/estimate/[id]` | Roof and estimate: map with plane markers, measurement table, "Why this price", options, quote CTA. Also renders the fallback state (home size questions) and the no-coverage state | `noindex`, unguessable ID, excluded from sitemap (contains a home address) |
| `/estimate/[id]/quote` | Quote form: name, phone, email, timing, consent | `noindex` |
| `/estimate/[id]/thanks` | Confirmation and what happens next; in `manual` mode says a person forwards the request within one business day | `noindex` |
| `/how-we-estimate` | Method, data sources, limitations | Linked from every result's sources line |
| `/privacy` | Privacy policy | Required |
| `/terms` | Terms of use | Required |
| `/do-not-sell` | California "Do not sell or share my personal information" request form | Required |

**API routes**

| Route | Purpose |
| --- | --- |
| `POST /api/estimate` | Address in; measurements, options, drivers out |
| `GET /api/explanation/[id]` | "Why this price" text (LLM or template) |
| `GET /api/coverage?zip=` | Coverage per `buyerMode` (v1: launch allowlist) |
| `POST /api/lead` | Validate and save quote request with consent record to Supabase |
| `POST /api/email-estimate` | Email the estimate (no-coverage areas) |
| `POST /api/events` | Funnel events from the browser |
| `POST /api/do-not-sell` | Record a California opt-out request |

**Admin (Supabase Auth, single user)**

| Route | Purpose |
| --- | --- |
| `/admin/login` | Sign in |
| `/admin/leads` | View of the `leads` table: pending and forwarded leads (no separate storage) |
| `GET /api/admin/leads/export` | CSV download of the same data |
| `POST /api/admin/leads/[id]/forwarded` | Set `forward_status = "forwarded"` and `forwarded_at` on the existing row |

**Scheduled jobs (Vercel Cron; each route checks `CRON_SECRET`)**

| Route | Schedule | What it does | Active |
| --- | --- | --- | --- |
| `/api/cron/ppi` | Monthly | Fetches latest BLS PPI values for roofing materials and publishes an updated config version | v1 |
| `/api/cron/purge-measurements` | Daily | Clears Solar-derived measurements older than 30 days (Google caching limit); keeps estimate records, leads and events | v1 |
| `/api/cron/coverage-sync` | Weekly | Pulls Service Direct's covered ZIPs into the `coverage` table | `service_direct` mode only |
| `/api/cron/lead-retry` | Every 15 min | Resends failed lead deliveries with backoff up to 24 h; alerts after 3 failures | `service_direct` mode only |

Wage (OEWS) and ZIP crosswalk rebuilds run in the GitHub Action, not as routes.

**Later**

- `POST /api/webhooks/calls`: when Service Direct pay-per-call is connected.
- `/roof-costs` and metro cost-index pages: if the AEO research pieces are included (open question).
- MCP endpoint: Phase 2.

**Not routes, but part of the site:** `robots.txt` (allows OAI-AdsBot, OAI-SearchBot and search crawlers), `sitemap.xml` (public pages only), and middleware for AI crawler logging, attribution capture and admin auth.

## Tracking and attribution

The test only succeeds if every qualified call or lead traces back to an ad group, so attribution is a launch blocker, not a nice-to-have.

**On landing:** read `oppref`, `ad_group_id`, and UTM params from the URL; store in a first-party cookie (30 days) and in `sessionStorage`; attach to every event, estimate, and lead.

**Event names (in funnel order)**

1. `page_view`
2. `address_entered`
3. `measured` or `fallback_shown`
4. `estimate_shown`
5. `explanation_shown`
6. `call_click` or `form_submit` (or `email_estimate` where not covered)
7. `lead_forwarded`
8. `call_qualified` (from the webhook)

**OpenAI measurement:** OpenAI Pixel on the page for page and step events; Conversions API from the server for `lead_forwarded` and `call_qualified`, so ad bidding optimizes toward real leads.

**Daily report (by ad group and metro):** spend, clicks, CPC, step-by-step completion rates, leads, qualified calls, cost per qualified lead vs payout. A simple SQL view plus a scheduled email is enough for v1.

## Compliance and platform terms

These are launch requirements; get legal review of the consent and privacy pieces before scaling spend.

| Area | Requirement | Where it shows up |
| --- | --- | --- |
| OpenAI Ad Policies | Truthful identity and affiliation; landing page matches advertiser and offer; no unfounded pricing claims; no deceptive collection of personal info; accurate service area; page reachable by OAI-AdsBot | Ad copy, landing page, robots.txt, ad geo targeting limited to covered metros |
| Referral disclosure | Referral service, not a contractor; partner roofers licensed where their state requires; partners pay for referrals | Landing, result, form, footer |
| Estimate honesty | "A general estimate, not a quote"; sources line; satellite limitation | Every result |
| Consent (TCPA) | Buyer's exact consent text, versioned; checkbox unchecked by default; certificate if required | Form, `leads` table |
| Privacy | Multi-state privacy policy; California "Do not sell or share" link; honor opt-outs | Footer, privacy page |
| Google Maps Platform | Display Solar API data on Google maps; attribution; 30-day caching limit; confirm roofing estimates are a permitted Solar API use | Map component, retention job |
| BLS / HUD data | Public data; credit sources | "How we estimate" page |

OpenAI's Ad Policies don't mention lead generation explicitly; ask OpenAI ads support in writing whether an independent referral service is eligible before launch.

## Testing, operations and milestones

**Tests**

- Unit tests on the pure engine with fixtures: simple roof, complex roof (> 10 segments), steep roof, no-coverage fallback, non-metro ZIP, suppressed metro wage (state fallback), wage ratio clamping, rounding, small-segment grouping.
- Explanation validator tests: numbers not in drivers rejected, banned terms rejected, timeout → template.
- Contract tests with recorded Solar API and Places responses (no live calls in CI).
- Manual review of 20 real addresses across regions (Tustin CA, Dallas TX, Phoenix AZ, rural Ohio, Bozeman MT) before launch: ranges must look plausible.

**Operations**

- Scheduled jobs: PPI monthly, OEWS yearly, HUD crosswalk quarterly, coverage weekly, measurement purge daily.
- Alerts: Solar API error rate > 5%, fallback rate spike, explanation template rate > 20%, lead forwarding failures, Google spend over a daily cap.
- Hosting: Vercel + Supabase (see Hosting, deployment and handoff). Secrets live in Vercel and Supabase environment settings.

**Milestones**

1. Week 1: config pipeline (crosswalk, OEWS, PPI, base costs, checks); `config-v1.json` builds.
2. Week 2: estimate engine, Solar API integration, fallbacks, unit tests; 20 test addresses look sensible.
3. Week 3: frontend (desktop and phone), maps and plane markers, explanation service.
4. Week 4: coverage, lead routing (manual mode), consent capture, admin leads page, events, OpenAI Pixel and Conversions API; one test lead flows end to end with attribution.
5. Week 5: compliance pages, alerts, ad account approved, crawler verified.
6. Week 6: launch 3–5 ad groups in launch metros; target ~250 clicks with clean funnel data.

**Open questions (owner: Peter)**

- [x] Brand name and domain: Price My New Roof, pricemynewroof.com (confirm registration and trademark search)
- [ ] Business entity: sole proprietorship during build; LLC before collecting real leads or running ads
- [ ] Launch ZIP or metro allowlist for v1
- [ ] Include AEO research pieces in v1 (citation tracker, experiment registry, metro cost-index page)?
- [ ] Service Direct answers (see Coverage section)
- [ ] OpenAI ads support: is an independent referral service eligible?
- [ ] Confirm Solar API terms allow roofing estimates and storing derived results
- [ ] Employment agreement check before launch

## Hosting, deployment and handoff

Everything runs on Vercel and Supabase; there is no always-on server. Every background task is a scheduled function or a GitHub Action.

| Piece | Where it runs | Notes |
| --- | --- | --- |
| Next.js site and pages | Vercel | Server-rendered landing content for the ad crawler |
| API routes (estimate, explanation, coverage, lead, email-estimate, events, webhooks) | Vercel serverless functions | Next.js route handlers under `app/api/` |
| Database | Supabase Postgres | All tables in the data model; row-level security on, server-only access with the service role key |
| Scheduled jobs (PPI monthly, coverage weekly, measurement purge daily, lead retry every 15 min) | Vercel Cron | One cron entry per job in `vercel.json`, each calling a protected route |
| Config build (HUD, OEWS, PPI, checks) | GitHub Action | Runs on schedule and on demand; commits `config/dist/config-vN.json` via pull request for review |
| Lead forwarding retries | Supabase queue table + the retry cron | No separate worker process |
| AI crawler logging | Next.js middleware | Matches AI user agents (OAI-SearchBot, OAI-AdsBot, ChatGPT-User, PerplexityBot, Claude agents, Googlebot) and writes an `events` row; ignore other traffic |

**Plans and expected cost (verify current pricing)**

- Vercel Pro, about $20/month: the free Hobby plan is non-commercial only, and this site earns lead revenue.
- Supabase Pro, about $25/month: free projects pause after about a week of inactivity, which would break a live campaign.
- Google Maps, Places and Solar API: likely within free monthly allowances at test volume; set a daily budget cap in Google Cloud.
- LLM explanations: a few dollars a month with caching.

**Environments:** `development` (local + a Supabase dev project), `preview` (Vercel preview deployments against the dev database), `production`. Never point previews at the production database.

**Secrets (environment variables, never committed):** `GOOGLE_MAPS_API_KEY` (browser, referrer-restricted), `GOOGLE_SERVER_API_KEY` (Solar API, server only), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BLS_API_KEY`, `HUD_API_TOKEN`, `LLM_API_KEY`, `SERVICE_DIRECT_*`, `OPENAI_PIXEL_ID`, `OPENAI_CAPI_TOKEN`, `CRON_SECRET`, `WEBHOOK_SECRET`.

**Handoff to Claude Code**

1. Save this file in the repo at `docs/SPEC.md`, and the v2 mockups in `docs/design/`.
2. Add `CLAUDE.md` at the repo root with the rules below.
3. Build one milestone at a time, in the order in Milestones. Review and merge each before starting the next; don't hand over the whole spec as a single task.
4. Build Service Direct integration points (coverage sync, lead intake, call webhook) as clearly marked stubs behind an interface until Service Direct's answers arrive.

**Contents of `CLAUDE.md`**

```
# Project rules
- Stack: Next.js (App Router) + TypeScript on Vercel; Supabase Postgres. No other hosting.
- Spec: docs/SPEC.md is the source of truth. Ask before deviating.
- Design: follow the Design section of docs/SPEC.md; docs/design/ holds the reference mockups.
- The estimate engine is a pure function with no network calls. Every change needs unit tests.
- The LLM never produces prices. Explanations use only the drivers object and must pass the validator.
- Never commit secrets. Read keys from environment variables only.
- Google data (Solar API, Places) is displayed only on Google maps; respect the 30-day caching limit.
- Roof planes are shown as markers at segment centers; never draw plane outlines in v1.
- No live external API calls in tests; use recorded fixtures.
- Location text is always generated from data; never hard-code a city.
- Copy rules: general estimate, not a quote; referral service, not a contractor; no unverified claims.
- Brand: Price My New Roof (pricemynewroof.com).
```

## Build decisions (Oct 3, 2026)

Answers to pre-build questions. These override anything above that they contradict.

**Config pipeline (Milestone 1)**

- Repo: git, with a private GitHub repo for the config-build Action. Tooling: pnpm, Node 22.
- Steep adder: $75 (low) to $125 (high) per steep square.
- Permit: 2% of job value, min $250, max $1,500, labeled "varies by city".
- PPI series per option: shingle → asphalt roofing products; new tile → concrete products; lift and relay → asphalt roofing products (underlayment).
- BLS API key and HUD token: Peter registers them; until then the fetchers run against recorded fixtures.
- The 15% change check is skipped when there is no previous config version.
- PPI base month is 2026-08 (2026-09 was not yet published at build time). Series: WPU1361 (prepared asphalt and tar roofing and siding products) and WPU133 (concrete products).
- Non-metro ZIPs map to their specific OEWS nonmetropolitan area through the ZIP's county (HUD ZIP→county crosswalk plus the OEWS area definitions). CBSAs that OEWS doesn't publish (mostly micropolitan) fall back to the state wage. A nonmetro area counts as `wageSource: "metro"`, so its own name is used ("For the Eastern Montana area.").
- Multi-CBSA ZIP tie-break: highest residential ratio, then highest total ratio, then a real CBSA over 99999, then the lowest code.
- The built config carries `productionReady` and `sampleInputs`; the engine refuses a config with `productionReady: false` in production. A config built from sample inputs is never committed.
- The config-build Action runs monthly on the 20th and fetches all sources each time; unchanged inputs produce no new version.

**Estimate engine (Milestone 2)**

- Range widening: ±10% for MEDIUM imagery, ±20% for LOW imagery (same as the home-size fallback).
- Confidence: `high` = HIGH imagery and metro wage; `medium` = one fallback; `low` = two or more fallbacks, or lift and relay is the first option shown.
- `sections` counts only planes of 50 sq ft or more (matches the measurement table). Waste still counts every segment.
- `laborVsNational` is reported after the [0.75, 1.6] clamp.
- Area wording: metro → "For the {areaName} area."; state → "For homes in {stateName}."; national → "Based on national averages."

**Frontend and explanation (Milestone 3)**

- Store the formatted address on the estimate; purge it at 30 days with the measurements, then show the ZIP only.
- After the purge, `/estimate/[id]` shows "This estimate has expired" with a button to measure again.
- Changing "What's on the roof now" calls `POST /api/estimate` again with the same place, reusing the stored measurements instead of calling the Solar API again.
- The explanation validator treats spelled-out numbers ("six") as numbers; they must match a drivers value.
- Mockup fixes carried into the build: plane letters strictly largest first; phone layout gets the footer and "Not your house? Change the address".

**Leads (Milestone 4)**

- Referral copy depends on `buyerMode`. `manual`: "We'll pass your request to a local roofer within one business day." Mention payment ("they pay us for the referral") only once a paying buyer is confirmed.
- Timing options: "As soon as possible", "Within 3 months", "3–12 months", "Just researching".
- Rate limiting uses a Supabase table.
- Still open: launch ZIP or metro allowlist.

## Phase 2: agent access (MCP)

Not built in v1, but v1 must not block it. Goal: let AI assistants (ChatGPT plugins, Claude connectors, other MCP clients) call the estimate engine directly.

**Design for it now**

- Keep the estimate engine callable without the UI: `POST /api/estimate` must work from a plain HTTP client with only an address (or placeId), no browser session required.
- Responses carry everything an agent needs to present the result honestly: `confidence`, `fallbacks`, a `methodUrl` ("How we estimate" page) and a `detailsUrl` for the estimate page.
- Keep personal data out of estimate endpoints entirely; contact details only ever enter through the consent flow.
- Log a `client` field on estimates (`web`, later `chatgpt`, `claude`, `api`) so agent traffic can be measured as its own channel.

**Planned MCP tools**

| Tool | Purpose |
| --- | --- |
| `estimate_roof_replacement` | Address in; measurements, options with low/high, drivers, confidence, method and details URLs out |
| `check_quote_availability` | ZIP in; whether partner roofers cover it |
| `request_quotes` | Later. Must hand off to a consent screen the homeowner sees; an agent never submits contact details on its own |

**Blockers to resolve before building**

- [ ] Google Maps Platform terms: may Solar-derived measurements or prices be returned to third-party clients without a Google map? If not, use a different measurement source for agent calls.
- [ ] Plugin and connector directory policies on lead collection.
- [ ] Any paid per-call API for other businesses: check employment agreement first.
