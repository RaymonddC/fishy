// Loads the fictional company into Firestore: the directory, the suppliers
// with their invoice history, and the starting known-bad list.
//
// Phone numbers and the PIN are read from the environment, never from a file
// in this repository. Use numbers you have verified with the phone provider
// and a made-up PIN.
//
//   SEED_PROJECT_ID=your-project-id \
//   SEED_PHONES='{"budi":"+00000000000","bayu":"+00000000000"}' \
//   SEED_PIN=0000 \
//   npm run seed
//
// Add --dry-run to see what would be written, with numbers masked.
// Needs Google application default credentials for the project.

import { randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { loadFixtures } from './fixture-rules.ts';
import { buildSeed } from './seed-data.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} first. See the comment at the top of scripts/seed.ts.`);
    process.exit(1);
  }
  return value;
}

function readPhones(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(required('SEED_PHONES'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    const phones: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error('not a string');
      }
      phones[id] = value;
    }
    return phones;
  } catch {
    console.error('SEED_PHONES must be JSON such as {"budi":"+00000000000"}.');
    process.exit(1);
  }
}

const dryRun = process.argv.includes('--dry-run');
const { company, knownBad } = loadFixtures();

let seed;
try {
  seed = buildSeed({
    company,
    knownBad,
    phones: readPhones(),
    pin: required('SEED_PIN'),
    saltFor: () => randomBytes(16).toString('hex'),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const summary = [
  `Directory: ${Object.values(seed.directory).map((person) => `${person.name} (${person.maskedPhone})`).join(', ') || 'nobody'}`,
  `Left out, no number given: ${seed.skipped.join(', ') || 'nobody'}`,
  `Suppliers: ${Object.values(seed.suppliers).map((supplier) => supplier.name).join(', ')}`,
  `Known-bad entries: ${seed.knownBadEntries.length}`,
];

if (dryRun) {
  console.log(['Dry run. Nothing was written.', ...summary].join('\n'));
  process.exit(0);
}

initializeApp({ projectId: required('SEED_PROJECT_ID') });
const db = getFirestore();
const batch = db.batch();
for (const [id, person] of Object.entries(seed.directory)) {
  batch.set(db.collection('directory').doc(id), person);
}
for (const [id, secret] of Object.entries(seed.directoryPrivate)) {
  batch.set(db.collection('directoryPrivate').doc(id), secret);
}
batch.set(db.collection('company').doc('profile'), seed.companyProfile);
for (const [id, supplier] of Object.entries(seed.suppliers)) {
  batch.set(db.collection('suppliers').doc(id), supplier);
}
for (const entry of seed.knownBadEntries) {
  batch.set(db.collection('knownBad').doc(`${entry.type}:${entry.value}`), entry);
}
await batch.commit();
console.log([`Written to ${required('SEED_PROJECT_ID')}.`, ...summary].join('\n'));
