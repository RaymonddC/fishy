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

This runs the type check, the unit tests and the build. Unit tests alone are `npm test`; they need nothing installed beyond Node.js.

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

## Data and privacy

- All demo data is synthetic: one fictional company, its staff and its suppliers.
- No message text is stored. The team sees a summary only.
- This repository contains no keys, secrets or personal data. Configuration is read from local files that are not committed; a template will be provided as `.env.example`.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
