// Writes remoteconfig.template.json from the built-in scam patterns, so the
// two cannot drift apart. A test compares them.
//
//   npm run remoteconfig

import { writeFileSync } from 'node:fs';

import { DEFAULT_RULES } from '../extension/src/core/rules/defaults.ts';

const template = {
  parameters: {
    scam_patterns: {
      defaultValue: { value: JSON.stringify(DEFAULT_RULES) },
      description:
        'The scam patterns the rules engine applies to signals. Edit to block a new scam shape without a release. A set that is not valid is ignored and the built-in patterns are used.',
      valueType: 'JSON',
    },
  },
};

writeFileSync(new URL('../remoteconfig.template.json', import.meta.url), `${JSON.stringify(template, null, 2)}\n`);
console.log(`Wrote remoteconfig.template.json with ${DEFAULT_RULES.patterns.length} patterns.`);
