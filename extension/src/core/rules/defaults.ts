// The scam patterns that ship with the extension. Remote Config can replace
// them without a release; if the remote set is missing or not valid, these
// are used.
//
// Red means a known scam shape. Amber means something worth a check. A single
// ordinary sign, such as "please pay by Friday", matches nothing. Nor does a
// file that was changed after it was made: plenty of honest documents are, so
// that only counts in support of something else.

import type { RuleSet } from './engine.ts';

export const DEFAULT_RULES: RuleSet = {
  version: 1,
  patterns: [
    {
      id: 'vendor_bank_change',
      name: 'Vendor bank change',
      verdict: 'red',
      all: ['bank_account_changed'],
      any: [
        'payment_details_change',
        'sender_lookalike_domain',
        'link_text_mismatch',
        'link_lookalike_domain',
        'document_edited',
        'invoice_amount_unusual',
        'tactic_urgency',
        'tactic_secrecy',
      ],
    },
    {
      id: 'known_bad_detail',
      name: 'Known scam detail',
      verdict: 'red',
      all: [],
      any: ['known_bad_account', 'known_bad_domain', 'known_bad_number'],
    },
    {
      id: 'executive_secret_transfer',
      name: 'Secret transfer ordered by an executive',
      verdict: 'red',
      all: ['money_request', 'tactic_authority', 'tactic_secrecy'],
    },
    {
      id: 'lookalike_payment_request',
      name: 'Payment request from a lookalike sender',
      verdict: 'red',
      all: ['money_request', 'sender_lookalike_domain'],
    },
    {
      id: 'new_account_under_pressure',
      name: 'New account under pressure',
      verdict: 'red',
      all: ['money_request', 'payment_details_change'],
      any: ['tactic_urgency', 'tactic_secrecy'],
    },
    {
      id: 'unsafe_link',
      name: 'Unsafe link',
      verdict: 'red',
      all: ['link_unsafe'],
    },
    {
      id: 'bank_details_changed',
      name: 'Changed bank details',
      verdict: 'amber',
      all: ['bank_account_changed'],
    },
    {
      id: 'new_account_requested',
      name: 'Request to pay a new account',
      verdict: 'amber',
      all: ['money_request', 'payment_details_change'],
    },
    {
      id: 'pressure_to_pay',
      name: 'Pressure to pay',
      verdict: 'amber',
      all: ['money_request'],
      any: ['tactic_authority', 'tactic_urgency', 'tactic_secrecy'],
      minAny: 2,
    },
    {
      id: 'lookalike_sender',
      name: 'Lookalike sender',
      verdict: 'amber',
      all: ['sender_lookalike_domain'],
    },
    {
      id: 'lookalike_link',
      name: 'Link to a lookalike domain',
      verdict: 'amber',
      all: ['link_lookalike_domain'],
    },
    {
      id: 'misleading_link',
      name: 'Misleading link',
      verdict: 'amber',
      all: ['link_text_mismatch'],
    },
    {
      id: 'unusual_amount',
      name: 'Unusual amount',
      verdict: 'amber',
      all: ['invoice_amount_unusual'],
    },
    {
      id: 'name_and_address_differ',
      name: 'Sender name and address differ',
      verdict: 'amber',
      all: ['money_request', 'sender_name_mismatch'],
    },
  ],
};
