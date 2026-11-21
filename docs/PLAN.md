# FISHY implementation plan

Status: **draft, waiting for approval.** Written 21 November 2026. Nothing is built yet.

## 1. Scope and dates

- **Deadline:** 30 November 2026, 14:00 PT, which is 1 December 05:00 WIB. Our own submit time is **30 November 18:00 WIB**, eleven hours early.
- **P0** is requirements R1 to R7. Everything above the cut line in section 6 must ship.
- **P1** is R8 and R9. They start only when P0 runs end to end, and only after the rule check in section 9.
- The non-goals on the deck's "What it is, and what it is not" slide are binding. Nothing from "next" or "later" is built.
- Three people build, in three lanes that do not touch the same files. Lanes are a suggestion, not a gate: any task can be picked up by anyone once the tasks it depends on are done.

| Lane | Area |
|---|---|
| A | On-device AI, redaction, side panel |
| B | Page readers (meeting captions, email), rules, evidence checks |
| C | Cloud Functions, phone check, approval page, fixtures and seed data |

## 2. What changes from the deck

Each row is the smallest change that keeps the demo. Sources are in section 10.

| Deck says | Problem found | What we build instead |
|---|---|---|
| One AI call that falls back to the cloud | The SDK's automatic fallback resends the same prompt to the cloud. Raw text would leave the laptop. | We route. If Gemini Nano is ready, raw text goes to Firebase AI Logic in on-device-only mode. If not, we redact on the laptop first and call Firebase AI Logic in cloud-only mode. The SDK's own hybrid mode is used only for explaining red flags from signals, which never contains message text. |
| App Check on | Firebase lists App Check as not supported in Chrome extensions, and its reCAPTCHA providers load remote script, which extensions may not do. | App Check with a custom provider and a debug token. Proven in task 1, with a fallback. |
| Phone call on a trial account, "trial credit" | The trial is now 75 minutes, 30 days, 5 verified numbers, sign-up country only. It is unclear whether a trial call can play our own menu. | Task 3 tests this first. Fallbacks: upgrade the account, or the web approval page carries the demo. |
| A test set of real invoices and meetings | Real documents cannot go in a public, synthetic-only repository. | A synthetic benign set of at least 100 items. The 1% false-alarm target is measured on it. |
| Judges install it and open the demo meeting and inbox, no sign-in | Meetings and inboxes need an account, no fake CFO is waiting in a call, and store review can take weeks. | A "Run demo" button replays the scripted captions and the fixture email through the same pipeline, with real model calls. Shipped as a release zip with "Load unpacked" steps. |
| Gemini in the cloud is free | Linking a billing account, which Cloud Functions needs, ends the free tier. | Pay as you go with a budget alert. Expected cost is cents. |
| Web Risk checks the links | It only matches known-bad lists and will not flag a fresh lookalike domain. The lookup sends the link to Google. | Our own lookalike check on the laptop satisfies R3. Web Risk is an extra signal, called through our Function with the query string removed, and shown with the line "Advisory provided by Google". |
| Email "failed check" | The inbox page does not expose sender authentication results. | Sender check is: display name against address, domain against the directory, and lookalike. Authentication results are added only if they can be read reliably during task 10. |
| "Holds the payment" | Payment holds are listed under "later". | A red "do not pay" banner. No payment system is touched. |
| The laptop looks up the number on record | Phone numbers would reach every client. | The Function looks up the number by person ID. The extension only ever sees a masked number, and the call function accepts no phone number at all. |
| Next approver after 10 minutes | The demo is 3 minutes. | The timeout comes from Remote Config: 600 seconds by default, 20 seconds in demo mode. |
| Demo content | Gemini Nano supports English, Japanese, Spanish, German and French. | Captions, emails and screens are in English. |

## 3. Before task 1: accounts and access

These are not tasks, but nothing starts without them.

- [ ] Firebase project on the Blaze plan with a budget alert at 10 USD. Firebase AI Logic enabled with the Gemini Developer API. Anonymous sign-in enabled. Firestore created.
- [ ] One App Check debug token registered in the console, kept out of the repository.
- [ ] Web Risk API enabled in the same project.
- [ ] Twilio account. Note which country it was signed up from, and verify the phone numbers of the people who will answer calls in the demo.
- [ ] One laptop that can run Gemini Nano: desktop Chrome 138 or newer, 22 GB free disk, and a GPU with more than 4 GB of video memory or 16 GB of RAM with 4 cores. Confirmed available.
- [ ] A second account for the fake CFO in the meeting.
- [ ] The official rules text for: third-party trademarks, how judges must be able to run the project, and whether all AI inference must go through Firebase AI Logic. The rules page cannot be read by automated tools.

## 4. Repository layout

```
extension/               Chrome extension (Manifest V3, Vite, TypeScript)
  manifest.json
  src/background/        service worker
  src/content/           meeting caption reader, email reader, their selectors
  src/sidepanel/         side panel screens and styles
  src/core/ai/           Firebase AI Logic models, router, tactic prompt
  src/core/redact/       redaction rules
  src/core/rules/        rules engine, default patterns, Remote Config loader
  src/core/checks/       sender, lookalike, links, invoice, PDF
  src/core/match/        known-bad list, local cache
  src/core/call/         client for the phone check
  src/core/firebase/     app, App Check, anonymous sign-in, sync
  src/demo/              demo replay
  tests/
functions/               Cloud Functions (TypeScript, Node 22)
  src/call/              start a check, phone menu webhooks, escalation, gate
  src/approve/           approval page backend
  src/webrisk/           link check
  src/learn/             known-bad list updates
  test/
web/approve/             approval page for judges (Firebase Hosting)
fixtures/                synthetic demo and test data
scripts/                 fixture generator, seed script
docs/                    this plan, demo runbook
```

One npm workspace per folder. `npm run check` at the root runs type checks, unit tests and the fixture checks. The same command runs in CI on every push, with a secret scan.

## 5. Working rules

- One task at a time per lane. Write the tests listed under "Tests first", watch them fail, build until they pass, then commit.
- Commit only when `npm run check` is green. Pull before pushing.
- A task that changes how the project is set up updates the README in the same commit.
- Checks that need a real laptop, a real call or a real meeting are written down in the commit message with the result.
- No keys, tokens, real phone numbers or real names in any commit. Configuration lives in `.env.local` files that are ignored, with `.env.example` as the template.

## 6. Tasks

| # | Task | Requirement | Lane | Days | Depends on |
|---|---|---|---|---|---|
| 1 | Spike: Firebase AI Logic call on Gemini Nano in the side panel, cloud after redaction | R1, R7 | A | 22 to 23 Nov | accounts |
| 2 | Spike: read live meeting captions, with paste fallback | R1 | B | 22 to 23 Nov | none |
| 3 | Spike: Function places the call (press 1 or 2, then PIN), plus web approval page | R6 | C | 22 to 23 Nov | accounts |
| 4 | Demo fixtures and seed data | supports R1 to R7 | C | 23 to 24 Nov | none |
| 5 | Tactic reader with JSON output | R1 | A | 24 Nov | 1, 4 |
| 6 | Rules engine, scam patterns in Remote Config | R2 | B | 24 Nov | 4 |
| 7 | Verdict panel: red flags and on-device or cloud badges | R1, R2, R7 | A | 24 to 25 Nov | 5, 6 |
| 8 | Phone check complete: number on record, PIN, escalation, red banner | R6 | C | 24 to 25 Nov | 3, 4 |
| | **Milestone 1, 25 Nov: the meeting story runs end to end on the Nano laptop** | | | | |
| 9 | Redaction and the cloud path | R7 | A | 26 Nov | 1, 5 |
| 10 | Email sender, lookalike domains, links | R3 | B | 25 to 26 Nov | 4, 6 |
| 11 | Invoice check: bank details against history, edit traces | R4 | B | 26 to 27 Nov | 4, 10 |
| 12 | Known-bad list, matched on the laptop | R5 | C | 26 to 27 Nov | 4, 8 |
| | **Milestone 2, 27 Nov: the email story runs end to end, with and without Nano** | | | | |
| 13 | "Run demo" button and the judge build | R7 | A | 28 Nov | 7 to 12 |
| 14 | False-alarm set, leak test, full rehearsal on two machines | R1 to R7 | all | 28 Nov | 13 |
| 15 | Submission pack: README, licence and secret check, video, description | all | all | 29 to 30 Nov | 14 |
| | **CUT LINE. Nothing below starts until tasks 1 to 14 are green.** | | | | |
| 16 | Side panel polish pass | none (judged on design) | A | if time | 14 |
| 17 | Team alert through Cloud Messaging, summary only | none in R1 to R7 | C | if time | 8 |
| 18 | Voice-clone score on a short clip, on click | R8 (P1) | | if time | rule check |
| 19 | Face score on video frames, on click | R9 (P1) | | if time | rule check |

### Task 1. Spike: Firebase AI Logic on Gemini Nano in the side panel, cloud after redaction (R1, R7)

**Build.** The workspace skeleton and CI. An extension that opens a side panel with a text box, a "Check" button and a "Download model" button with progress. Firebase app, anonymous sign-in, App Check with a custom provider and debug token. A router that asks Chrome whether the on-device model is available:
- available: call Firebase AI Logic in on-device-only mode with the raw text
- not available: redact (a first, minimal rule set), then call Firebase AI Logic in cloud-only mode

The panel shows the answer and a badge taken from the response's inference source.

**Files.** `package.json`, `tsconfig.base.json`, `.env.example`, `.github/workflows/ci.yml`, `extension/manifest.json`, `extension/vite.config.ts`, `extension/src/background/service-worker.ts`, `extension/src/sidepanel/index.html`, `extension/src/sidepanel/main.ts`, `extension/src/core/firebase/app.ts`, `extension/src/core/firebase/app-check.ts`, `extension/src/core/firebase/auth.ts`, `extension/src/core/ai/firebase-ai.ts`, `extension/src/core/ai/router.ts`, `extension/src/core/redact/redact.ts`, `extension/tests/router.test.ts`, `README.md`.

**Tests first.**
- R1, "No message text leaves the laptop": with the on-device model reported available, the router passes the raw text to the on-device model only, and the cloud model is never called.
- R7, "Works on a PC without Nano": with the on-device model reported unavailable or missing entirely, the router returns an answer, and the cloud model receives only redacted text.
- The router never calls any hybrid "prefer" mode with raw text.
- On the laptop: with the model ready, the network panel shows no request to the model endpoint and the badge reads "On device". In a fresh browser profile without the model, the badge reads "Cloud" and the request body shows placeholders, not the message.

**Fallbacks.**
1. On-device inference does not work from the side panel: run the same call from an extension tab or an offscreen document, which share the extension's origin.
2. It does not work from any extension page: run the model call in a small hosted web page, where Firebase documents hybrid inference as supported, and pass results to the extension by messages.
3. The debug token is not accepted from an extension page: the custom provider fetches its App Check token from a Cloud Function that mints it with the Admin SDK.
4. If none of these gives a real on-device Firebase AI Logic call by 23 November 18:00 WIB, stop and decide together. The entry depends on it.

### Task 2. Spike: read live meeting captions, with paste fallback (R1)

**Build.** A content script on the meeting page that finds the captions region, watches it for changes, and sends lines to the side panel as `{id, speaker, text, final}`. Captions are rewritten in place while a person speaks, so lines are keyed by caption block and marked final when a newer block appears or after about 4 seconds without change. All selectors live in one file. The user turns captions on. If no captions are seen for 60 seconds, the panel offers a paste box. The paste box is always available.

**Files.** `extension/src/content/meet-captions.ts`, `extension/src/content/meet-selectors.ts`, `extension/src/core/captions/buffer.ts`, `extension/src/sidepanel/screens/paste.ts`, `fixtures/meet/captions-dom.html`, `extension/tests/captions.test.ts`.

**Tests first.**
- Given the saved caption markup and a sequence of in-place edits, the buffer emits each spoken line once, with the right speaker, and no duplicates.
- Text pasted into the paste box produces the same line objects as live captions.
- R1, "No message text leaves the laptop": the content script makes no network request; lines travel only by extension messaging.
- On the laptop: in a real call with captions on, a spoken sentence appears in the side panel within 2 seconds, with the speaker's name.

**Fallback.** If the selectors cannot be made to work, or break before the deadline, the paste box is the path for the demo and the video says so. No audio capture and no other transcription route is built.

### Task 3. Spike: the Function places the call, plus the web approval page (R6)

**Build.** A callable Function `startVerification({ personId, requestId })`. It takes no phone number. It reads the number on record from a collection only Functions can read, creates a verification record, and, if the call gate allows it, places the call. The call says: press 1 if you made this request, press 2 if you did not, then enter your PIN. Webhooks check the provider's signature, then write the result: `confirmed`, `denied`, `pin_failed` or `unreached`. The same Function returns a one-time link to a hosted approval page with the same menu, for judges.

**Files.** `functions/package.json`, `functions/tsconfig.json`, `functions/src/index.ts`, `functions/src/call/gate.ts`, `functions/src/call/startVerification.ts`, `functions/src/call/webhooks.ts`, `functions/src/call/pin.ts`, `functions/src/approve/submitApproval.ts`, `web/approve/index.html`, `web/approve/main.ts`, `firebase.json`, `firestore.rules`, `functions/test/gate.test.ts`, `functions/test/webhooks.test.ts`, `functions/test/approval.test.ts`, `README.md`.

**Tests first.**
- R6, "Pressing 2 turns the banner red": a signed webhook with digit 2 sets the verification to `denied`. The approval page's "2" does the same.
- A webhook with a missing or wrong signature is rejected and changes nothing.
- A request that contains any phone number field is rejected.
- With the call gate closed, or a number that is not on the allowlist, no call is placed and only the approval link is returned.
- A wrong PIN never produces `confirmed`.
- On a real phone: a verified number rings, the menu plays, pressing 2 writes `denied` within 3 seconds.

**Fallbacks.**
1. The trial account cannot play our own menu: upgrade the account. This costs money and needs a yes from the team first.
2. Calls to the demo country do not connect or are filtered: call a verified number in the sign-up country, or use the approval page.
3. No working call by 23 November 18:00 WIB: the approval page is the demo path, shown on a phone, and the call is described as the production route.

### Task 4. Demo fixtures and seed data (P0, supports R1 to R7)

**Build.** One fictional company with staff, suppliers and a directory. Two stories.
- **Fake CFO in a meeting:** a short English script with authority, urgency and secrecy, a timed caption replay of it, and a runbook for staging it in a real call with a second account.
- **Fake supplier invoice by email:** an email from a lookalike of a supplier's domain, a link, and a PDF invoice whose bank account differs from that supplier's last six invoices and whose file shows edit traces. A matching genuine invoice for comparison.

Also: a lookalike test set of at least 30 domains, a benign set of at least 100 ordinary messages and invoices, a starting known-bad list, and a seed script for Firestore. PDFs are generated by a script so they are reproducible.

**Files.** `fixtures/company.json`, `fixtures/meet/cfo-script.md`, `fixtures/meet/captions-replay.json`, `fixtures/gmail/invoice-email.json`, `fixtures/gmail/invoice-fake.pdf`, `fixtures/gmail/invoice-genuine.pdf`, `fixtures/lookalikes.json`, `fixtures/benign/`, `fixtures/known-bad.json`, `scripts/make-fixtures.ts`, `scripts/seed.ts`, `scripts/check-fixtures.ts`, `docs/DEMO.md`.

**Tests first.**
- Every fixture validates against its schema.
- No fixture contains a real person, a real company, a real bank, or a phone number. Every domain is either reserved for examples or owned by the team.
- The benign set has at least 100 items and the lookalike set at least 30.
- The fake invoice's account differs from all six history entries; the genuine one matches.

### Task 5. Tactic reader with JSON output (R1)

**Build.** The prompt and JSON schema that turn a caption transcript or an email body into signals: whether it is a money request, and which pressure tactics are present (authority, urgency, secrecy, change of payment details). The schema is given to the on-device model as a response constraint and to the cloud model as a response schema. Short supporting phrases stay in the side panel's memory and are never written anywhere.

**Files.** `extension/src/core/ai/tactics.ts`, `extension/src/core/ai/firebase-ai.ts`, `extension/src/core/types.ts`, `extension/tests/tactics.test.ts`, `scripts/eval-tactics.ts`.

**Tests first.**
- R1, "No message text leaves the laptop": running both fixture stories with the on-device model available produces no outbound payload containing any five-word run from the fixture text.
- Model output that does not match the schema is rejected and reported, never guessed at.
- On the laptop: the CFO script returns authority, urgency and secrecy in five runs out of five.

### Task 6. Rules engine, scam patterns in Remote Config (R2)

**Build.** A pure function that takes signals and patterns and returns a verdict (green, amber or red), the list of red flags, and the matched pattern, such as "vendor bank change". Default patterns ship in the extension. Remote Config can replace them without a release; a pattern set that fails validation is ignored in favour of the defaults. A green verdict still advises a call back.

**Files.** `extension/src/core/rules/engine.ts`, `extension/src/core/rules/defaults.ts`, `extension/src/core/rules/remote-config.ts`, `remoteconfig.template.json`, `extension/tests/engine.test.ts`.

**Tests first.**
- R2, "Same signals give the same verdict": for every fixture signal set, 1,000 calls, with the signals in shuffled order, return the identical verdict and flags.
- The engine module uses no clock, no randomness and no network.
- Swapping the pattern set changes the verdict with no code change.
- An invalid remote pattern set falls back to the defaults.

### Task 7. Verdict panel: red flags and badges (R1, R2, R7)

**Build.** The side panel screens for the verdict, the tactics found, and the call status, in the deck's colours. Every step shows whether it ran on the device or in the cloud. Flags are written in plain words. The screens follow one spacing scale, one neutral colour ramp with a single accent, one icon set and plain copy from the start, so that the polish pass in task 16 is short.

**Files.** `extension/src/sidepanel/state.ts`, `extension/src/sidepanel/screens/verdict.ts`, `extension/src/sidepanel/screens/tactics.ts`, `extension/src/sidepanel/screens/call.ts`, `extension/src/sidepanel/styles.css`, `extension/tests/screens.test.ts`.

**Tests first.**
- Each fixture signal set renders the expected verdict colour and flag list.
- Every step that used a model shows exactly one badge, and it matches the inference source.
- A verification record in state `denied` renders the red banner.

### Task 8. Phone check complete (R6)

**Build.** On top of task 3: the directory with masked numbers in the panel, the PIN stored as a hash with an attempt limit, the escalation timer that calls the next approver, and the side panel listening to the verification record.

**Files.** `functions/src/call/escalate.ts`, `functions/src/call/pin.ts`, `functions/src/call/directory.ts`, `extension/src/core/call/verify.ts`, `extension/src/sidepanel/screens/directory.ts`, `extension/src/sidepanel/screens/call.ts`, `firestore.rules`, `functions/test/escalate.test.ts`, `functions/test/rules.test.ts`.

**Tests first.**
- R6, "Pressing 2 turns the banner red": start a check for the fictional CFO, deliver digit 2, and the side panel banner is red.
- Pressing 1 with the right PIN gives a green "confirmed". Pressing 1 with a wrong PIN three times gives red "not verified".
- No answer: after the configured timeout the next approver is called, and only once.
- A client cannot read a phone number or a PIN hash from Firestore.
- On a real phone: the full call, both answers.

### Task 9. Redaction and the cloud path (R7)

**Build.** The full redaction rule set: people and company names from the directory, email addresses, phone numbers, account numbers, amounts, links and domains, each replaced by a numbered placeholder. Tactic wording is kept. The cloud model reads the redacted text and returns the same signal shape as the on-device model.

**Files.** `extension/src/core/redact/redact.ts`, `extension/src/core/redact/patterns.ts`, `extension/src/core/ai/router.ts`, `extension/tests/redact.test.ts`, `extension/tests/cloud-path.test.ts`.

**Tests first.**
- R7, "Works on a PC without Nano": with the on-device model unavailable, both fixture stories reach the same verdict as on the device.
- After redaction, no name, address, number, amount or domain from any fixture remains in the text sent to the cloud.
- Redacting twice gives the same result as redacting once.
- On the laptop: a browser profile without the model completes both stories with "Cloud" badges.

### Task 10. Email sender, lookalike domains, links (R3)

**Build.** A content script that reads the opened message only: sender name and address, body, and each link's real address against its visible text. The lookalike check compares the sender's domain with the domains in the directory: one or two character edits, swapped look-alike characters, added or dropped hyphens, a changed ending. Links go to our Function, which removes the query string and asks Web Risk.

**Files.** `extension/src/content/gmail-reader.ts`, `extension/src/content/gmail-selectors.ts`, `extension/src/core/checks/sender.ts`, `extension/src/core/checks/lookalike.ts`, `extension/src/core/checks/links.ts`, `extension/src/sidepanel/screens/email.ts`, `functions/src/webrisk/checkLink.ts`, `extension/tests/lookalike.test.ts`, `extension/tests/gmail-reader.test.ts`, `functions/test/checkLink.test.ts`.

**Tests first.**
- R3, "Every lookalike in the test set is flagged": every domain in `fixtures/lookalikes.json` is flagged, and no genuine domain from the directory or the benign set is.
- A link whose visible text names one site and whose address is another is flagged.
- The Function sends no query string, and its results are never kept past their expiry time.
- With credentials: Google's official test address returns a match, and the panel shows "Advisory provided by Google".

### Task 11. Invoice check (R4)

**Build.** Read the PDF on the laptop with pdf.js, bundled with the extension. Extract the bank name, account number and beneficiary with fixed patterns. Compare with that supplier's history. Report edit traces from the file's metadata as a supporting signal. The PDF comes from the opened email's attachment; dropping a file on the side panel is the fallback.

**Files.** `extension/src/core/checks/pdf.ts`, `extension/src/core/checks/invoice.ts`, `extension/src/content/gmail-reader.ts`, `extension/src/sidepanel/screens/invoice.ts`, `extension/tests/invoice.test.ts`, `extension/tests/pdf.test.ts`.

**Tests first.**
- R4, "A changed bank account is flagged": the fake invoice is flagged against six history entries; the genuine invoice is not.
- A file modified after it was created is reported as a supporting signal, never as a verdict.
- The PDF bytes are never sent anywhere.

### Task 12. Known-bad list, matched on the laptop (R5)

**Build.** A list of confirmed bad accounts, numbers and domains for the fictional company, kept in Firestore and copied to a local cache. Matching happens against the cache. When a check ends with "not me" and the right PIN, the Function adds the request's account, number and domain to the list or raises their count.

**Files.** `extension/src/core/match/known-bad.ts`, `extension/src/core/firebase/sync.ts`, `extension/src/sidepanel/screens/known.ts`, `functions/src/learn/onDenied.ts`, `firestore.rules`, `extension/tests/known-bad.test.ts`, `functions/test/onDenied.test.ts`.

**Tests first.**
- R5, "A match shows how often it was seen": with the fake invoice's account seeded at a count of 2, the panel shows it was seen in 2 confirmed scams.
- Matching makes no network request.
- A "not me" with the right PIN raises the count to 3. A "not me" without the PIN does not change the list.
- The list holds details only, never message text.

### Task 13. "Run demo" button and the judge build (R7)

**Build.** A button that replays the caption fixture and loads the fixture email and invoice through the real pipeline, with real model calls. In the judge build the phone check never dials: it shows the approval page link. A release zip and "Load unpacked" instructions. Store submission in parallel only if a developer account already exists.

**Files.** `extension/src/demo/replay.ts`, `extension/src/sidepanel/screens/demo.ts`, `scripts/build-release.ts`, `README.md`, `docs/DEMO.md`.

**Tests first.**
- R7, "Works on a PC without Nano": on a clean browser profile, "Run demo" completes both stories to a red banner using the approval page.
- The demo path calls the same functions as the live path; no canned model output exists in the build.
- The release zip contains no `.env` file, no source maps with secrets, and no remote script.

### Task 14. False-alarm set, leak test, rehearsal (R1 to R7)

**Tests first, and these are the task.**
- The benign set produces at most 1 amber or red verdict per 100 items.
- The leak test from task 5 runs across both stories, on both paths.
- Two full rehearsals: one on the Nano laptop with a real meeting, a real email and a real call; one on a machine without Nano using "Run demo".
- Every "Done when" line for R1 to R7 is ticked with the name of the test that proves it.

### Task 15. Submission pack

README with setup steps that a stranger can follow, the licence visible, a secret scan of the full history, a video of 3 minutes or less in English, the written description, and the submission form. No third-party logos in our screens, images or video; product names appear as plain text only.

## 7. The cut line

Tasks 1 to 15 are the entry. If 27 November ends without Milestone 2, tasks 16 to 19 are dropped without discussion and the remaining days go to tasks 13 to 15.

If time is short inside P0, cut in this order, each of which still leaves a working demo:
1. Edit traces in the invoice check (keep the bank account comparison).
2. Reading the PDF from the email attachment (keep dropping the file on the panel).
3. The live email reader (keep "Run demo" for the email story).
4. The escalation timer's second call (keep the timeout message).

Never cut: the on-device call through Firebase AI Logic, the redacted cloud path, App Check, the phone or approval-page check, and the leak test.

## 8. Below the line

- **Task 16, polish pass.** One pass over the side panel for spacing, colour, type and copy, taking the direction from the deck.
- **Task 17, team alert.** A push notification to the finance manager with a summary only. It maps to no requirement in R1 to R7. If it is not built, Cloud Messaging comes out of the README's "Built with" list.
- **Tasks 18 and 19, R8 and R9.** Third-party scoring services. They start only after the official rules confirm that inference outside Firebase AI Logic is allowed.

## 9. Safety gates

- **Calls are off by default.** A master switch and an allowlist of numbers live in the Functions configuration, not in the interface and not in the repository. A daily cap applies. The judge build never dials.
- **No number from a message is ever called.** The call function takes a person ID only.
- **The PIN is a demo value.** The phone provider's call log records pressed digits in plain text.
- **Spend.** A 10 USD budget alert on the Firebase project. Upgrading the phone account needs a yes from the team first.

## 10. Open decisions

Each has a default so that nothing waits.

| Decision | Default |
|---|---|
| Upgrade the phone account if the trial cannot play our menu | Ask when task 3 shows it is needed |
| A domain the team owns, to send the lookalike email for the video | Without one, the email story is shown through "Run demo" |
| How judges' copies pass App Check | Decided in task 1: token-minting Function if it works, otherwise a debug token in the release zip only |
| Team alert in or out | Out, below the line |
| Name of the fictional company | Decided in task 4: Ombakura Freight. A search on 21 November 2026 found no company of that name |
| R8 and R9 against the rules | Not started until the rules text is read |

## 11. Facts checked on 21 November 2026

Read from current documentation and source. Nothing here has been run yet.

| Fact | Source |
|---|---|
| Hybrid inference is generally available in the Firebase web SDK; modes are prefer-on-device, only-on-device, prefer-in-cloud, only-in-cloud; the response reports its inference source | https://firebase.google.com/docs/ai-logic/hybrid/web/get-started |
| Prefer-on-device falls back to the cloud automatically | same page |
| Only-on-device can reach the cloud when the browser API is missing (open issue) | https://github.com/firebase/firebase-js-sdk/issues/10635 |
| App Check is enforced for Firebase AI Logic by default | https://firebase.google.com/docs/ai-logic/app-check |
| App Check is listed as not supported in Chrome extensions | https://firebase.google.com/docs/web/environments-js-sdk |
| Linking billing makes all Gemini Developer API use pay as you go | https://firebase.google.com/docs/ai-logic/pricing |
| The Prompt API is stable in extensions from Chrome 138; languages and hardware needs | https://developer.chrome.com/docs/ai/prompt-api |
| Extensions may not load remote script | https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code |
| No official live-caption interface for meetings | https://developers.google.com/workspace/meet/release-notes |
| Web Risk lookups: 100,000 free a month, full link sent, attribution line required | https://cloud.google.com/web-risk/pricing and https://docs.cloud.google.com/web-risk/docs/overview |
| Phone trial: 75 minutes, 30 days, 5 verified numbers, sign-up country only | https://www.twilio.com/docs/usage/trials |

Not verified: hybrid inference in a side panel specifically, a debug token from an extension page, our own menu on a trial phone account, fetching an email attachment from a content script, and the official rules text.
