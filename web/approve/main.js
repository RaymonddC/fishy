// @ts-check
// The web approval page: the phone menu as a page, for judges who cannot
// receive a trial call. Press 1 or 2, then the PIN.
//
// The link token is read from the part of the address after "#", which the
// browser never sends to a server, and travels only in the body of requests.

const params = new URLSearchParams(location.search);
const check = params.get('v') ?? '';
const token = new URLSearchParams(location.hash.slice(1)).get('t') ?? '';

/** @param {string} id */
function el(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing #${id}`);
  }
  return node;
}

const sections = ['loading', 'invalid', 'choice', 'pin', 'done'];

/** @param {string} name */
function show(name) {
  for (const id of sections) {
    el(id).hidden = id !== name;
  }
}

/** @param {string} text */
function problem(text) {
  const node = el('problem');
  node.textContent = text;
  node.hidden = text === '';
}

/**
 * @param {Record<string, string>} body
 * @returns {Promise<{ step: string, result: string | null, person?: { name: string, role: string } } | null>}
 */
async function send(body) {
  const response = await fetch('/api/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ v: check, t: token, ...body }),
  });
  if (response.status === 403) {
    show('invalid');
    return null;
  }
  if (!response.ok) {
    throw new Error(`The server answered ${response.status}.`);
  }
  return response.json();
}

const DONE = {
  confirmed: ['Confirmed', 'Thank you. The request is confirmed.'],
  denied: ['Recorded: not you', 'Thank you. The request is marked as not yours, and the payment is being held.'],
  pin_failed: ['Not confirmed', 'The PIN was wrong three times. The request is not confirmed.'],
  unreached: ['This check is closed', 'Start a new check from the side panel.'],
};

/** @param {{ step: string, result: string | null }} view */
function render(view) {
  problem('');
  if (view.step === 'choice') {
    show('choice');
    return;
  }
  if (view.step === 'pin') {
    const denied = view.result === 'denied';
    el('pin-title').textContent = denied ? 'Recorded: not you' : 'Enter your PIN';
    el('pin-lead').textContent = denied
      ? 'The request is marked as not yours. Enter your PIN to confirm it is you answering.'
      : 'The request is not confirmed until you enter your PIN.';
    show('pin');
    /** @type {HTMLInputElement} */ (el('pin-input')).focus();
    return;
  }
  const [title, text] = DONE[/** @type {keyof typeof DONE} */ (view.result ?? 'unreached')] ?? DONE.unreached;
  el('done-title').textContent = title;
  el('done-text').textContent = text;
  show('done');
}

/** @param {string} digit */
async function choose(digit) {
  try {
    const view = await send({ action: 'choice', digit });
    if (view) {
      render(view);
    }
  } catch (error) {
    problem(`Could not send your answer. ${error instanceof Error ? error.message : ''}`);
  }
}

el('yes').addEventListener('click', () => void choose('1'));
el('no').addEventListener('click', () => void choose('2'));

el('pin-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = /** @type {HTMLInputElement} */ (el('pin-input'));
  const pin = input.value;
  input.value = '';
  void (async () => {
    try {
      const view = await send({ action: 'pin', pin });
      if (!view) {
        return;
      }
      const stillAsking = view.step === 'pin';
      render(view);
      const pinError = el('pin-error');
      pinError.hidden = !stillAsking;
      pinError.textContent = stillAsking ? 'That PIN is not right. Try again.' : '';
    } catch (error) {
      problem(`Could not send the PIN. ${error instanceof Error ? error.message : ''}`);
    }
  })();
});

void (async () => {
  if (check === '' || token === '') {
    show('invalid');
    return;
  }
  try {
    const view = await send({ action: 'open' });
    if (!view) {
      return;
    }
    const person = view.person;
    el('who').textContent = person ? `${person.name}, ${person.role}` : 'you';
    render(view);
  } catch (error) {
    show('invalid');
    problem(`Could not open the check. ${error instanceof Error ? error.message : ''}`);
  }
})();
