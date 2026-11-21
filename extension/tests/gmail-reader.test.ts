// Reading the opened email from the mail page.
//
// "Opened messages only": the reader looks at the message that is open on the
// screen and nothing else. It never reads the inbox list, and it has no way
// to reach the network (last test).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { JSDOM } from 'jsdom';

import { emailSignature, readOpenEmail } from '../src/content/gmail-reader.ts';
import { checkLinks } from '../src/core/checks/links.ts';
import { checkSender } from '../src/core/checks/sender.ts';
import { isEmailUpdate } from '../src/core/email/messages.ts';

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8')) as T;

const FIXTURE = readFileSync(new URL('../../fixtures/gmail/message-dom.html', import.meta.url), 'utf8');
const fake = read<{ from: { name: string; address: string }; subject: string; links: { text: string; href: string }[] }>(
  'gmail/invoice-email.json',
);
const company = read<{
  company: { domain: string };
  staff: { name: string }[];
  suppliers: { name: string; domain: string; contact: { name: string } }[];
}>('company.json');

function page(html: string = FIXTURE): Document {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}

test('reads the sender, subject, text, links and attachment of the open message', () => {
  const email = readOpenEmail(page());

  assert.ok(email);
  assert.deepEqual(email.sender, fake.from);
  assert.equal(email.subject, fake.subject);
  assert.ok(email.bodyText.includes('Our new account number is 9920584416'));
  assert.deepEqual(email.links, fake.links);
  assert.deepEqual(email.attachments, [
    {
      filename: 'invoice-TP-2026-047.pdf',
      mimeType: 'application/pdf',
      downloadUrl: 'https://mail.example/attachments/18c0a2/0.1',
    },
  ]);
});

test('in a thread, it reads the last open message, not an earlier one', () => {
  const email = readOpenEmail(page());

  assert.equal(email?.id, '#msg-f:1002');
  assert.ok(!email?.bodyText.includes('TP-2026-046'));
});

test('a link is read as its visible text and its real address, exactly as written', () => {
  const email = readOpenEmail(page());
  const [link] = email?.links ?? [];

  assert.equal(link?.text, 'portal.tessaline-packaging.example/invoices');
  assert.equal(link?.href, 'https://portal.tessaline-packagings.example/invoices/TP-2026-047');
});

test('links in the attachment area are not mixed in with the links of the message', () => {
  const email = readOpenEmail(page());

  assert.equal(email?.links.length, 1);
});

test('with no message open, nothing is read', () => {
  const inbox = '<table class="F cf zt"><tr class="zA"><td><span email="someone@city-water-utility.example">Someone</span></td></tr></table>';

  assert.equal(readOpenEmail(page(inbox)), null);
});

test('an open message with no sender address is not read', () => {
  const broken = FIXTURE.replace(/ email="[^"]*"/g, '');

  assert.equal(readOpenEmail(page(broken)), null);
});

test('an open message with no text still gives its sender', () => {
  const noBody = FIXTURE.replace(/class="a3s aiL"/g, 'class="other"');
  const email = readOpenEmail(page(noBody));

  assert.equal(email?.sender.address, fake.from.address);
  assert.equal(email?.bodyText, '');
  assert.deepEqual(email?.links, []);
});

test('what is read from the page gives the fake email its red flags', () => {
  const email = readOpenEmail(page());
  assert.ok(email);
  const known = {
    companyDomain: company.company.domain,
    staffNames: company.staff.map((person) => person.name),
    suppliers: company.suppliers.map((supplier) => ({
      name: supplier.name,
      domain: supplier.domain,
      contactName: supplier.contact.name,
    })),
  };
  const genuine = [known.companyDomain, ...known.suppliers.map((supplier) => supplier.domain)];

  const found = [...checkSender(email.sender, known), ...checkLinks(email.links, genuine).signals].map((signal) => signal.type);

  assert.deepEqual(found.sort(), [
    'link_lookalike_domain',
    'link_text_mismatch',
    'sender_lookalike_domain',
    'sender_name_mismatch',
  ]);
});

test('the signature is the same for the same message and changes when the message changes', () => {
  const document = page();
  const first = readOpenEmail(document);
  const again = readOpenEmail(document);
  assert.ok(first && again);
  assert.equal(emailSignature(first), emailSignature(again));

  const bodies = document.querySelectorAll('.a3s');
  bodies[bodies.length - 1]?.append(' One more line.');
  const changed = readOpenEmail(document);
  assert.ok(changed);
  assert.notEqual(emailSignature(changed), emailSignature(first));
  assert.equal(emailSignature(null), '');
});

test('the message format between the page and the side panel accepts what the reader produces', () => {
  const email = readOpenEmail(page());

  assert.equal(isEmailUpdate({ type: 'fishy/email-update', email }), true);
  assert.equal(isEmailUpdate({ type: 'fishy/email-update', email: null }), true);
  assert.equal(isEmailUpdate({ type: 'fishy/email-update', email: { ...email, sender: 'someone' } }), false);
  assert.equal(isEmailUpdate({ type: 'fishy/email-update', email: { ...email, links: [{ text: 1, href: 2 }] } }), false);
  assert.equal(isEmailUpdate({ type: 'something-else', email }), false);
});

test('the email reader has no way to reach the network', () => {
  const files = [
    '../src/content/gmail-open-email.ts',
    '../src/content/gmail-reader.ts',
    '../src/content/gmail-selectors.ts',
    '../src/core/email/messages.ts',
  ];
  const forbidden = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|\bimport\s*\(|navigator\.connection/;

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!forbidden.test(source), `${file} must not use a network API`);
    for (const [, from] of source.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(from?.startsWith('.'), `${file} may only import local files, not "${from}"`);
    }
  }
});
