# FISHY

**Don't take the bait. Make the call.**

FISHY is a Chrome extension with a side panel, built for finance teams. When someone asks for money to move, in a video meeting or by email, FISHY reads the request, checks the evidence on the laptop, matches it against known scams, and then phones the real person on a number that is already on record. A fake can look and sound real, but it cannot answer the real phone.

This is an entry for the Firebase #BuildHybridAI 2026 hackathon.

## Status

In progress. The build runs from 22 to 30 November 2026, and this README is updated as each piece lands. The plan is in [docs/PLAN.md](docs/PLAN.md).

| Piece | State |
|---|---|
| Task 1: a message is read by Gemini Nano in the side panel, or in the cloud after redaction | Code and automated tests done. Not yet confirmed on a real laptop |
| Task 2: live meeting captions reach the side panel, with pasted text as the fallback | Code and automated tests done. Not yet confirmed in a real meeting |
| Task 3: a Cloud Function phones the number on record (press 1 or 2, then a PIN), with a web approval page for judges | Code and automated tests done. Not yet deployed or tried on a real phone |
| Task 4: demo fixtures for one fictional company, and a seed script | Done. The checks run with the unit tests |
| Task 6: the rules engine that turns signals into a green, amber or red verdict, with patterns in Remote Config | Done and tested. Not yet connected to the side panel |
| Everything else | Not started |

## How it works

Every request goes through the same four steps.

1. **Read.** Gemini Nano, running in Chrome on the laptop, tags pressure tactics such as urgency, secrecy and appeals to authority in meeting captions and opened emails.
2. **Check.** The extension tests the evidence: the sender and lookalike domains, the links, and the bank details on an invoice compared with that supplier's history.
3. **Match.** Fixed rules decide the verdict, and known bad accounts, numbers and domains are matched on the laptop.
4. **Call.** A phone menu rings the real person on the number on record: press 1 or 2, then a PIN. FISHY never calls a number taken from the message.

On a computer without Gemini Nano, the same steps run in the cloud, and only after the text has been redacted on the laptop. A badge on each step shows whether it ran on the device or in the cloud.

## Built with

TypeScript, Vite, the Chrome extension side panel, Firebase AI Logic with Gemini Nano, Firebase App Check, Authentication, Firestore, Remote Config, Cloud Functions and Cloud Messaging, pdf.js, Web Risk, and Twilio Voice.

## Setup

You need Node.js 22.18 or newer and desktop Chrome 138 or newer.

### 1. Firebase project

1. Create a Firebase project and add a **Web app** to it. Keep the configuration values it shows.
2. Open **AI Logic**, choose **Get started**, and pick the **Gemini Developer API**.
3. Open **Authentication**, then **Sign-in method**, and enable **Anonymous**.
4. Open **App Check**, find the web app, and add a **debug token** from its menu. Keep the token private.

The free Spark plan is enough for this step.

### 2. Local configuration

```bash
npm ci
```

```bash
cp extension/.env.example extension/.env.local
```

Fill in `extension/.env.local` with the web app configuration and the debug token. This file is ignored by git. Never commit it.

### 3. Build and load the extension

```bash
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select the `extension/dist` folder.
3. Click the FISHY button in the toolbar. The side panel opens.

After a code change, run the build again and press the reload button on the extension's card.

### 4. Run the checks

```bash
npm run check
```

This runs the type checks, the unit tests, the fixture checks and the builds. The generated fixtures (two invoice PDFs and the benign set) are rebuilt with `npm run fixtures`; a check fails if they are out of date.

## Checking that it works

### Reading a message

The side panel shows four readiness lines: Firebase, App Check, Sign-in and On-device model. Paste a message into **Pasted text**, choose **Check pasted text**, and read the badge on the result.

**On a laptop that can run Gemini Nano** (22 GB of free disk, and either a GPU with more than 4 GB of video memory or 16 GB of RAM with 4 cores):

1. If the model line says it is not downloaded, choose **Download on-device model** and wait.
2. Right-click the side panel, choose **Inspect**, and open the **Network** tab.
3. Check a message. The badge must say **On device**, and the Network tab must show no new request.

**Without Gemini Nano** (for example a new Chrome profile, before the model is downloaded):

1. Check the same message. The badge must say **Cloud**.
2. Open **What was sent to the cloud**. Names, amounts, account numbers, phone numbers, email addresses and links must appear only as placeholders such as `[NAME_1]`.

Use made-up messages only.

### Live captions in a meeting

The extension reads captions from the meeting page and shows them in the **Live captions** card. It only reads: it does not turn captions on, record audio, or store anything.

1. Load the extension first, then open or reload the meeting tab.
2. Join a call with a second person or a second account, and turn captions on in the meeting (press C). Set the caption language to English.
3. Open the side panel and speak. Each turn must appear once, under the speaker's name, within about 2 seconds. A sentence still being spoken is shown in a lighter colour until it is finished.
4. Choose **Check these captions** to run the same check as for pasted text.

If the card says captions are on but nothing has been read for a minute, the meeting page's markup has changed. Paste the conversation into **Pasted text** instead, one line per speaker in the form `Name: what they said`. Then update `extension/src/content/meet-selectors.ts`, which is the only file that depends on the page's markup.

The meeting page has no public interface for live captions, so this reader can break when the page changes. The paste box always works.

### The phone check

This part needs the Blaze plan, because it uses Cloud Functions. Set a budget alert first.

**What it does.** The side panel asks the server to check with a person from the directory. The server looks up that person's number, places the call, and records the answer: press 1 for "I made this request" or 2 for "not me", then a PIN. The side panel shows the result as a banner. The request carries a person ID only. A phone number can never be supplied, and the extension never sees one.

**Two locks on real calls.** Calls are off by default. A call is placed only if `CALLS_ENABLED` is `true` and the number is on `CALL_ALLOWLIST`. Both are settings on the server, not controls in the interface. There is also a daily cap.

**The approval page.** A trial phone account can only call a few verified numbers, so judges get a web page with the same menu. It is a demo device and is off unless `APPROVAL_PAGE_ENABLED` is `true`.

Set it up once:

```bash
npx firebase-tools login
```

```bash
npx firebase-tools use --add
```

```bash
cp functions/.env.example functions/.env.YOUR_PROJECT_ID
```

Fill in `functions/.env.YOUR_PROJECT_ID`. Then store the two phone-provider secrets. If you are only using the approval page, enter any placeholder text for both.

```bash
npx firebase-tools functions:secrets:set TWILIO_ACCOUNT_SID
```

```bash
npx firebase-tools functions:secrets:set TWILIO_AUTH_TOKEN
```

Deploy the Functions, the Firestore rules and the approval page:

```bash
npx firebase-tools deploy --only functions,firestore:rules,hosting
```

Load the fictional company: the directory, the suppliers and the known-bad list. Phone numbers and the PIN are read from the environment and are not written to any file here. Use numbers you have verified with the phone provider and a made-up PIN. This needs Google application default credentials for the project.

```bash
SEED_PROJECT_ID=YOUR_PROJECT_ID SEED_PHONES='{"budi":"+00000000000","bayu":"+00000000000"}' SEED_PIN=0000 npm run seed
```

Add `-- --dry-run` to see what would be written, with the numbers masked. Staff with no number given are left out of the directory.

Then check it, in this order:

1. **Approval page only.** Set `APPROVAL_PAGE_ENABLED=true`, leave `CALLS_ENABLED=false`, and deploy. In the side panel choose the person and **Call to confirm**. The banner turns amber and a link to the approval page appears. On that page choose **2**: the banner must turn red within about 3 seconds.
2. **Wrong PIN.** Start a new check, choose **1**, and enter a wrong PIN three times. The banner must turn red, never green.
3. **Right PIN.** Start a new check, choose **1**, and enter the right PIN. The banner turns green.
4. **A real call.** Set `CALLS_ENABLED=true` and put the verified number on `CALL_ALLOWLIST`, then deploy. Start a check. The phone must ring and the menu must play. Press 2: the banner must turn red.

The phone provider's call log records the keys that were pressed, including the PIN, so use a demo PIN only.

### Scam patterns

The verdict is decided by fixed rules, never by a model. Checks and models produce signals, such as "the sender's domain is a lookalike" or "the message asks for secrecy", and the rules engine applies patterns to them. The same signals always give the same verdict.

The patterns ship with the extension in `extension/src/core/rules/defaults.ts`. To change them without a release, publish them to Remote Config:

```bash
npx firebase-tools deploy --only remoteconfig
```

Then edit the `scam_patterns` value in the Firebase console. A pattern set that is not valid is ignored and the built-in patterns are used. After changing the built-in patterns, run `npm run remoteconfig` to rebuild the template; a check fails if the two differ.

## Data and privacy

- All demo data is synthetic: one fictional company, its staff and its suppliers. It lives in `fixtures/`, and the checks refuse any domain that is not reserved for examples and any phone number outside the range reserved for fiction. The demo stories are described in [docs/DEMO.md](docs/DEMO.md).
- No message text is stored. The team sees a summary only.
- This repository contains no keys, secrets or personal data. Configuration is read from local files that are not committed; a template will be provided as `.env.example`.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
