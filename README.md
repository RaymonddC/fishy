# FISHY

**Don't take the bait. Make the call.**

FISHY is a Chrome extension with a side panel, built for finance teams. When someone asks for money to move, in a video meeting or by email, FISHY reads the request, checks the evidence on the laptop, matches it against known scams, and then phones the real person on a number that is already on record. A fake can look and sound real, but it cannot answer the real phone.

This is an entry for the Firebase #BuildHybridAI 2026 hackathon.

## Status

Planning. Nothing is built yet. The build runs from 22 to 30 November 2026, and this README is updated as each piece lands.

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

Setup steps are added here with the first task that needs them, and are kept current after that.

## Data and privacy

- All demo data is synthetic: one fictional company, its staff and its suppliers.
- No message text is stored. The team sees a summary only.
- This repository contains no keys, secrets or personal data. Configuration is read from local files that are not committed; a template will be provided as `.env.example`.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
