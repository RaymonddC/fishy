// The "Invoice" card: choose or drop an invoice PDF, and see how it compares
// with what the company knows about that supplier. The file is read on the
// laptop and never sent anywhere.

import { checkInvoice, extractInvoiceFields, findSupplier } from '../core/checks/invoice.ts';
import type { InvoiceCheck, SupplierRecord } from '../core/checks/invoice.ts';
import { pdfLibrary } from '../core/checks/pdf-browser.ts';
import { readPdf } from '../core/checks/pdf.ts';
import { describeSignal } from '../core/rules/engine.ts';
import { flagItem } from './flags.ts';

export interface InvoicePanelElements {
  card: HTMLElement;
  status: HTMLElement;
  file: HTMLInputElement;
  fields: HTMLElement;
  flags: HTMLElement;
  notes: HTMLElement;
}

export interface InvoicePanelDeps {
  /** The suppliers with their past invoices, or null if they cannot be read. */
  suppliers(): Promise<SupplierRecord[] | null>;
}

const NO_HISTORY = 'The suppliers’ past invoices could not be read, so the bank account was not compared.';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function startInvoicePanel(ui: InvoicePanelElements, deps: InvoicePanelDeps): void {
  let run = 0;

  function row(label: string, value: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'status-row';
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    wrapper.append(term, description);
    return wrapper;
  }

  function show(fileName: string, result: InvoiceCheck, historyAvailable: boolean): void {
    const { fields, supplier, signals } = result;
    const rows: HTMLElement[] = [row('File', fileName)];
    if (supplier) rows.push(row('Supplier', supplier.name));
    if (fields.invoiceNumber) rows.push(row('Invoice', fields.invoiceNumber));
    if (fields.total !== undefined) rows.push(row('Total', fields.total.toLocaleString('en-US')));
    if (fields.bankName) rows.push(row('Bank', fields.bankName));
    if (fields.accountName) rows.push(row('Account name', fields.accountName));
    if (fields.accountNumber) rows.push(row('Account', fields.accountNumber));
    ui.fields.replaceChildren(...rows);
    ui.fields.hidden = false;

    ui.flags.replaceChildren(...signals.map((signal) => flagItem(describeSignal(signal.type), signal.detail)));
    ui.flags.hidden = signals.length === 0;

    const notes = historyAvailable ? result.notes : [NO_HISTORY];
    ui.notes.textContent = notes.join(' ');
    ui.notes.hidden = notes.length === 0;

    if (signals.length > 0) {
      ui.status.textContent = `${signals.length === 1 ? '1 red flag' : `${signals.length} red flags`} in this invoice`;
    } else if (supplier && fields.accountNumber) {
      ui.status.textContent = 'The bank account matches the one on record for this supplier';
    } else {
      ui.status.textContent = 'This invoice could not be compared with past invoices';
    }
  }

  async function check(file: File): Promise<void> {
    run += 1;
    const thisRun = run;
    ui.fields.hidden = true;
    ui.flags.hidden = true;
    ui.notes.hidden = true;
    if (!isPdf(file)) {
      ui.status.textContent = 'That is not a PDF. Choose the invoice as a PDF file';
      return;
    }
    ui.status.textContent = 'Reading the invoice on this laptop';
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [pdf, suppliers] = await Promise.all([readPdf(await pdfLibrary(), bytes), deps.suppliers()]);
      if (thisRun !== run) {
        return;
      }
      const fields = extractInvoiceFields(pdf.lines);
      const supplier = suppliers ? findSupplier(pdf.text, suppliers) : null;
      show(file.name, checkInvoice(fields, pdf, supplier), suppliers !== null);
    } catch (error) {
      if (thisRun === run) {
        ui.status.textContent = describe(error);
      }
    }
  }

  ui.file.addEventListener('change', () => {
    const [file] = ui.file.files ?? [];
    if (file) {
      void check(file);
    }
    // So that choosing the same file again runs the check again.
    ui.file.value = '';
  });

  ui.card.addEventListener('dragover', (event) => {
    event.preventDefault();
    ui.card.dataset.dragging = 'true';
  });
  ui.card.addEventListener('dragleave', () => {
    delete ui.card.dataset.dragging;
  });
  ui.card.addEventListener('drop', (event) => {
    event.preventDefault();
    delete ui.card.dataset.dragging;
    const [file] = event.dataTransfer?.files ?? [];
    if (file) {
      void check(file);
    }
  });
}
