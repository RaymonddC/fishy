// Where the opened email lives on the mail page.
//
// The page is not ours and its markup changes. Everything that depends on
// that markup is in this one file. These values were taken on 21 November
// 2026 from what maintained open-source mail libraries read; they have not
// yet been confirmed against a live inbox.
//
// If emails stop being read: open a message, inspect it, and update the
// values below.

export const GMAIL_SELECTORS = {
  /** One per open message in the thread. The last one is the message being read. */
  message: 'div.adn[data-message-id]',
  /** Carries the message's ID. */
  messageIdAttribute: 'data-message-id',
  /** The sender, inside a message. Tried in order. The address and name are attributes. */
  sender: ['span.gD[email]', 'td.gF span[email]', 'span[email]'],
  senderAddressAttribute: 'email',
  senderNameAttribute: 'name',
  /** The text of the message, inside a message. */
  body: 'div.a3s',
  /** The subject of the thread, anywhere on the page. */
  subject: 'h2.hP',
  /** One per attachment, inside a message. Its attribute holds "type:file name:address". */
  attachment: '.aQH span.aZo[download_url]',
  attachmentAttribute: 'download_url',
} as const;
