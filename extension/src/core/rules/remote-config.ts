// Reads the scam patterns from Firebase Remote Config, so a new scam shape
// can be blocked without a new release.
//
// Whatever goes wrong here, the extension still has rules: an unreachable
// service or a broken pattern set both end with the built-in patterns.

import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';

import { getFirebaseApp } from '../firebase/app.ts';
import { chooseRules } from './validate.ts';
import type { ChosenRules } from './validate.ts';

export const PATTERNS_KEY = 'scam_patterns';
const REFRESH_MS = 5 * 60 * 1000;

export async function loadRules(): Promise<ChosenRules> {
  try {
    const remoteConfig = getRemoteConfig(getFirebaseApp());
    remoteConfig.settings.minimumFetchIntervalMillis = REFRESH_MS;
    await fetchAndActivate(remoteConfig);
    return chooseRules(getValue(remoteConfig, PATTERNS_KEY).asString());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ...chooseRules(null), problem: `Remote Config could not be read. ${reason}` };
  }
}
