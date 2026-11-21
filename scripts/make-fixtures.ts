// Builds the generated fixtures: the two invoice PDFs and the benign set.
//
//   npm run fixtures
//
// Everything is built from the hand-written fixture files with no clock and
// no randomness, so running it twice gives the same bytes. A check compares
// the files on disk with a fresh build.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts } from 'pdf-lib';

import { loadFixtures } from './fixture-rules.ts';
import type { BenignInvoice, BenignMessage, Company, HistoryEntry, Invoice, Supplier } from './fixture-rules.ts';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function money(amount: number): string {
  return `Rp ${amount.toLocaleString('en-US')}`;
}

function monthOf(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
}

function longDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${monthOf(date)} ${date.slice(0, 4)}`;
}

/** One invoice as a one-page PDF. The file dates and the producing program come from the fixture. */
export async function buildInvoicePdf(invoice: Invoice, company: Company): Promise<Uint8Array> {
  const supplier = company.suppliers.find((entry) => entry.id === invoice.supplierId);
  if (!supplier) {
    throw new Error(`Unknown supplier "${invoice.supplierId}".`);
  }
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(`Invoice ${invoice.invoiceNumber}`);
  pdf.setAuthor(supplier.name);
  pdf.setCreator('Tessaline Billing 4.2');
  pdf.setProducer(invoice.pdf.producer);
  pdf.setCreationDate(new Date(invoice.pdf.createdAt));
  pdf.setModificationDate(new Date(invoice.pdf.modifiedAt));

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 780;
  const write = (text: string, options: { size?: number; bold?: boolean; gap?: number } = {}): void => {
    const size = options.size ?? 11;
    page.drawText(text, { x: 56, y, size, font: options.bold ? bold : regular });
    y -= options.gap ?? size + 7;
  };

  write(supplier.name, { size: 18, bold: true, gap: 30 });
  write('INVOICE', { size: 14, bold: true, gap: 24 });
  write(`Invoice number: ${invoice.invoiceNumber}`);
  write(`Issue date: ${longDate(invoice.issueDate)}`);
  write(`Due date: ${longDate(invoice.dueDate)}`);
  write(`Bill to: ${invoice.billTo}`, { gap: 30 });

  write('Items', { bold: true });
  for (const line of invoice.lines) {
    write(`${line.description}: ${line.quantity.toLocaleString('en-US')} x ${money(line.unitPrice)}`);
  }
  y -= 8;
  write(`Total due: ${money(invoice.amount)}`, { size: 13, bold: true, gap: 34 });

  write('Payment details', { bold: true });
  write(`Bank: ${invoice.bank.bankName}`);
  write(`Account name: ${invoice.bank.accountName}`);
  write(`Account number: ${invoice.bank.accountNumber}`);

  return pdf.save({ useObjectStreams: false });
}

type EmailDraft = { subject: string; body: string; hard?: boolean; link?: boolean };

/** Ordinary emails a supplier sends about one invoice. */
function supplierEmails(supplier: Supplier, entry: HistoryEntry): EmailDraft[] {
  const { invoiceNumber, date, amount } = entry;
  const month = monthOf(date);
  const sign = `Kind regards,\n${supplier.contact.name}`;
  return [
    {
      subject: `Invoice ${invoiceNumber} for ${month}`,
      body: `Dear Laras,\n\nPlease find attached invoice ${invoiceNumber} for ${money(amount)}. Payment terms are 30 days, as usual. Our bank details are unchanged.\n\n${sign}`,
      link: true,
    },
    {
      subject: `Delivery confirmation for your ${month} order`,
      body: `Dear Laras,\n\nYour ${month} order was delivered on ${longDate(date)}. The signed delivery note is attached. Nothing is needed from you.\n\n${sign}`,
    },
    {
      subject: `Statement of account, ${month}`,
      body: `Dear Laras,\n\nAttached is your statement of account for ${month}. It shows invoice ${invoiceNumber} as open and all earlier invoices as paid.\n\n${sign}`,
    },
    {
      subject: `Payment received for invoice ${invoiceNumber}`,
      body: `Dear Laras,\n\nWe have received your payment of ${money(amount)} for invoice ${invoiceNumber}. Thank you. No further action is needed.\n\n${sign}`,
    },
    {
      subject: `Reminder: invoice ${invoiceNumber} is due on Friday`,
      body: `Dear Laras,\n\nA friendly reminder that invoice ${invoiceNumber} falls due this Friday under our 30-day terms. If it is already scheduled, please ignore this note.\n\n${sign}`,
      hard: true,
    },
  ];
}

type InternalDraft = EmailDraft & { from: 'bayu' | 'budi' };

/** Ordinary emails between colleagues. */
function internalEmails(month: string): InternalDraft[] {
  return [
    {
      from: 'bayu',
      subject: `Month-end close for ${month}`,
      body: `Hi Laras,\n\nThe close for ${month} starts on the last working day. Please have the supplier accruals ready by noon.\n\nBayu`,
    },
    {
      from: 'bayu',
      subject: 'Expense claims: receipts needed',
      body: `Hi all,\n\nA reminder that expense claims for ${month} need a receipt for every item. Claims without receipts go back to the claimant.\n\nBayu`,
    },
    {
      from: 'bayu',
      subject: `Supplier payment run, ${month}`,
      body: `Hi Laras,\n\nAs agreed with Budi in Monday's review, please schedule the Tessaline Packaging payment in this week's run, through the normal two-person approval.\n\nBayu`,
      hard: true,
    },
    {
      from: 'bayu',
      subject: `Salary report for ${month}`,
      body: `Hi Laras,\n\nThe salary report for ${month} is attached. Please treat it as confidential, as always, and keep it in the restricted folder.\n\nBayu`,
      hard: true,
    },
    {
      from: 'budi',
      subject: 'Audit preparation',
      body: `Hi Laras,\n\nThe auditors will ask for the ${month} bank reconciliations. Could you put them in the shared audit folder by the end of next week?\n\nBudi`,
    },
    {
      from: 'budi',
      subject: `Budget review for ${month}`,
      body: `Hi both,\n\nThe budget review for ${month} is on Thursday at ten. Please bring the variance report. No decisions on payments will be taken in the meeting.\n\nBudi`,
    },
    {
      from: 'bayu',
      subject: 'Bank reconciliation finished',
      body: `Hi Budi,\n\nThe ${month} reconciliation is finished and there are no open items.\n\nBayu`,
    },
    {
      from: 'bayu',
      subject: 'Finance system maintenance',
      body: `Hi all,\n\nThe finance system will be offline on Saturday morning for maintenance. Please finish any ${month} postings before then.\n\nBayu`,
    },
    {
      from: 'budi',
      subject: 'Reminder of our payment controls',
      body: `Hi all,\n\nA reminder for ${month}: a change to a supplier's bank details is only accepted after we have phoned the supplier on the number we hold on record. This applies to every request, including any that appear to come from me.\n\nBudi`,
      hard: true,
    },
    {
      from: 'bayu',
      subject: 'Training session next week',
      body: `Hi Laras,\n\nThe ${month} training session on the new reporting template is on Tuesday afternoon. An invitation will follow.\n\nBayu`,
    },
  ];
}

type MeetingDraft = { lines: [speaker: 'budi' | 'bayu' | 'laras', text: string][]; hard?: boolean };

/** Ordinary things said in finance meetings. */
function meetings(month: string): MeetingDraft[] {
  return [
    {
      lines: [
        ['bayu', `Let us start with the ${month} numbers. Spending is two percent under budget.`],
        ['laras', 'Packaging costs are flat and courier costs are slightly down.'],
        ['budi', 'Good. Nothing to change, then.'],
      ],
    },
    {
      lines: [
        ['laras', `All ${month} supplier invoices are booked. Two are waiting for a second approval.`],
        ['bayu', 'I will approve them this afternoon once I have checked the delivery notes.'],
      ],
    },
    {
      lines: [
        ['budi', `For the ${month} forecast, please assume the same payment terms as last quarter.`],
        ['laras', 'Understood. I will send the updated forecast tomorrow.'],
      ],
    },
    {
      lines: [
        ['bayu', `The auditors arrive in the second week after ${month}. Are the reconciliations ready?`],
        ['laras', 'They are in the shared folder, and the bank statements are attached to each one.'],
      ],
    },
    {
      lines: [
        ['budi', `This one is urgent for me: I need the ${month} variance report before the board meeting.`],
        ['laras', 'You will have it by noon. It goes through the normal review with Bayu first.'],
      ],
      hard: true,
    },
    {
      lines: [
        ['bayu', `Tessaline Packaging asked whether we could pay the ${month} invoice a week early.`],
        ['budi', 'No need. Pay it on the due date to the account we have on record, as usual.'],
        ['laras', 'Scheduled for the due date.'],
      ],
      hard: true,
    },
    {
      lines: [
        ['laras', `The ${month} salary figures are confidential, so I have limited the folder to the three of us.`],
        ['bayu', 'That is right. Thank you.'],
      ],
      hard: true,
    },
    {
      lines: [
        ['budi', `Any questions about the ${month} close?`],
        ['bayu', 'None from me. It ran a day ahead of schedule.'],
      ],
    },
  ];
}

export function buildBenignMessages(company: Company): BenignMessage[] {
  const person = (id: string) => {
    const found = company.staff.find((entry) => entry.id === id);
    if (!found) {
      throw new Error(`Unknown staff member "${id}".`);
    }
    return found;
  };
  const laras = person('laras');
  const items: BenignMessage[] = [];
  const nextId = (): string => `bm-${String(items.length + 1).padStart(3, '0')}`;

  for (const supplier of company.suppliers) {
    for (const entry of supplier.invoiceHistory) {
      for (const draft of supplierEmails(supplier, entry)) {
        items.push({
          id: nextId(),
          kind: 'email',
          from: { name: supplier.contact.name, address: supplier.contact.email },
          to: laras.email,
          subject: draft.subject,
          body: draft.body,
          links: draft.link
            ? [{ text: `portal.${supplier.domain}/invoices`, href: `https://portal.${supplier.domain}/invoices/${entry.invoiceNumber}` }]
            : [],
          expected: 'not_fishy',
          hard: draft.hard === true,
        });
      }
    }
  }

  for (const month of ['September', 'October']) {
    for (const draft of internalEmails(month)) {
      const sender = person(draft.from);
      items.push({
        id: nextId(),
        kind: 'email',
        from: { name: sender.name, address: sender.email },
        to: laras.email,
        subject: draft.subject,
        body: draft.body,
        links: [],
        expected: 'not_fishy',
        hard: draft.hard === true,
      });
    }
  }

  for (const month of ['August', 'September', 'October']) {
    for (const draft of meetings(month)) {
      items.push({
        id: nextId(),
        kind: 'meeting',
        lines: draft.lines.map(([speaker, text]) => ({ speaker: person(speaker).name, text })),
        expected: 'not_fishy',
        hard: draft.hard === true,
      });
    }
  }

  return items;
}

/** Each supplier's past invoices, all paid to the account on record. */
export function buildBenignInvoices(company: Company): BenignInvoice[] {
  const items: BenignInvoice[] = [];
  for (const supplier of company.suppliers) {
    for (const entry of supplier.invoiceHistory) {
      items.push({
        id: `bi-${String(items.length + 1).padStart(3, '0')}`,
        supplierId: supplier.id,
        invoiceNumber: entry.invoiceNumber,
        issueDate: entry.date,
        amount: entry.amount,
        currency: entry.currency,
        bankName: entry.bankName,
        accountNumber: entry.accountNumber,
        expected: 'not_fishy',
      });
    }
  }
  return items;
}

async function writeAll(): Promise<void> {
  const root = new URL('../fixtures/', import.meta.url);
  const { company, invoices } = loadFixtures();
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

  for (const invoice of [invoices.genuine, invoices.fake]) {
    writeFileSync(new URL(`gmail/${invoice.pdf.file}`, root), await buildInvoicePdf(invoice, company));
  }
  mkdirSync(new URL('benign/', root), { recursive: true });
  const messages = buildBenignMessages(company);
  const benignInvoices = buildBenignInvoices(company);
  writeFileSync(
    new URL('benign/messages.json', root),
    json({
      about: 'Ordinary, harmless emails and meeting snippets for measuring false alarms. Invented, and built from templates by scripts/make-fixtures.ts. Do not edit by hand.',
      items: messages,
    }),
  );
  writeFileSync(
    new URL('benign/invoices.json', root),
    json({
      about: 'Ordinary invoices paid to the account on record. Invented, and built by scripts/make-fixtures.ts. Do not edit by hand.',
      items: benignInvoices,
    }),
  );
  console.log(`Wrote 2 invoice PDFs, ${messages.length} benign messages and ${benignInvoices.length} benign invoices.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeAll();
}
