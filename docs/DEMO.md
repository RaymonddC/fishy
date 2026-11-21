# Demo runbook

How to stage the two demo stories. Everything in them is invented: the company, the people, the supplier, the bank and the accounts.

## The cast

| Name | Role | In the demo |
|---|---|---|
| Ombakura Freight | The company | Where the finance team works |
| Laras Pramesti | Finance officer | The person with the side panel open |
| Budi Prakoso | CFO | The person the scammer pretends to be. The real Budi answers the phone |
| Bayu Wicaksana | Finance manager | The next approver if Budi does not answer |
| Tessaline Packaging | Supplier | The supplier the scammer pretends to be |

The data is in `fixtures/`. Load it into Firestore with the seed script described in the README.

## Story 1: the fake CFO in a meeting

The script is in [`fixtures/meet/cfo-script.md`](../fixtures/meet/cfo-script.md).

1. Start a video meeting from the demonstrator's account. Load the extension first, then open the meeting tab.
2. A second person joins under the display name **Budi Prakoso**, from a second account or a second device.
3. The demonstrator turns captions on (press C) with the caption language set to English, and opens the side panel.
4. The second person reads Budi's lines. The demonstrator reads Laras's lines.
5. The **Live captions** card fills in. Choose **Check these captions**. The result lists the pressure tactics and shows where the text was read.
6. In the **Phone check** card, choose Budi Prakoso and **Call to confirm**. The banner turns amber.
7. The real Budi's phone rings. He presses 2, then his PIN. The banner turns red: not verified, do not pay.

If captions do not appear, paste the lines from the script into **Pasted text** and carry on from step 5.

Do not use a real person's face or voice for the fake CFO. A colleague reading the lines is enough: the point of the story is that the request looked normal and the phone check caught it.

## Story 2: the fake supplier invoice by email

The email is in [`fixtures/gmail/invoice-email.json`](../fixtures/gmail/invoice-email.json) and the two invoices are in the same folder: `invoice-genuine.pdf` and `invoice-fake.pdf`.

What is wrong with the fake:

- The sender's domain has one extra letter: `tessaline-packagings.example` instead of `tessaline-packaging.example`.
- The link text shows the genuine domain, but the link goes to the lookalike.
- The invoice names a new bank and a new account. The supplier's last six invoices all used the account on record.
- The amount is more than ten times the usual one, and payment is asked for within two days.
- The PDF was modified after it was created, with a different program.
- The new account is already on the known-bad list, seen twice.

Staging it in a real inbox needs a sending domain the team controls, because the example domains cannot send mail. Until that is decided, this story is shown through the side panel's demo replay (plan task 13), which loads the same fixture.

## Before recording

- Use the fixture names only. No real names, numbers or companies on screen.
- Keep other tabs, bookmarks and notifications out of the frame.
- Product names may be spoken or shown as plain text. No third-party logos in the side panel, the repository images or the video; crop the browser window where a logo would otherwise be in frame.
- The phone provider's log records the keys pressed during a call, so use a demo PIN.
