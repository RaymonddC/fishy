// Adds one person to the directory, for the phone check.
//
// The phone number and the PIN are read from the environment and are never
// written to a file in this repository. Use a number you have verified with
// the phone provider, and a made-up PIN.
//
//   SEED_PROJECT_ID=your-project-id \
//   SEED_PHONE=+00000000000 \
//   SEED_PIN=0000 \
//   node functions/scripts/seed-person.ts
//
// Optional: SEED_PERSON_ID (default "budi"), SEED_NAME, SEED_ROLE.
// Needs Google application default credentials for the project.

import { randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { decideCall } from '../src/call/gate.ts';
import { hashPin, isPinFormat } from '../src/call/pin.ts';
import { maskPhone } from '../src/call/startVerification.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} first. See the comment at the top of this file.`);
    process.exit(1);
  }
  return value;
}

const projectId = required('SEED_PROJECT_ID');
const phone = required('SEED_PHONE').replace(/[\s().-]/g, '');
const pin = required('SEED_PIN');
const personId = process.env.SEED_PERSON_ID ?? 'budi';
const name = process.env.SEED_NAME ?? 'Budi Santoso';
const role = process.env.SEED_ROLE ?? 'CFO';

if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(personId)) {
  console.error('SEED_PERSON_ID must start with a letter and use only letters, digits, "-" and "_".');
  process.exit(1);
}
if (decideCall({ callsEnabled: true, callAllowlist: ['*'] }, phone).allowed !== true) {
  console.error('SEED_PHONE must be in international format, such as +00000000000.');
  process.exit(1);
}
if (!isPinFormat(pin)) {
  console.error('SEED_PIN must be four to six digits.');
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();
const record = hashPin(pin, randomBytes(16).toString('hex'));

await db.collection('directory').doc(personId).set({ name, role, maskedPhone: maskPhone(phone) });
await db.collection('directoryPrivate').doc(personId).set({ phone, pinSalt: record.salt, pinHash: record.hash });

console.log(`Saved ${name} (${role}) as "${personId}" with the number ${maskPhone(phone)}.`);
