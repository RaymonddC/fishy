// Asks Chrome whether Gemini Nano can run right now.
//
// The router relies on this answer to decide whether raw text may be read at
// all, so it fails closed: no API, an unknown answer or an error all mean the
// on-device model is not used.

/** `missing` means the browser has no on-device model API at all. */
export type DeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'missing';

export interface ExpectedLanguage {
  type: 'text';
  languages: string[];
}

export interface OnDeviceCreateOptions {
  expectedInputs: ExpectedLanguage[];
  expectedOutputs: ExpectedLanguage[];
}

/**
 * The options every on-device call is created with. The availability check
 * must ask about exactly these, or it can report a model that the real call
 * then cannot use.
 */
export function onDeviceCreateOptions(): OnDeviceCreateOptions {
  return {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
}

interface LanguageModelApi {
  availability(options?: unknown): Promise<string>;
}

export interface ModelScope {
  LanguageModel?: LanguageModelApi;
}

const KNOWN: readonly string[] = ['available', 'downloadable', 'downloading', 'unavailable'];

export async function readDeviceStatus(scope: ModelScope = globalThis as ModelScope): Promise<DeviceStatus> {
  const api = scope.LanguageModel;
  if (!api || typeof api.availability !== 'function') {
    return 'missing';
  }
  try {
    const answer = await api.availability(onDeviceCreateOptions());
    return KNOWN.includes(answer) ? (answer as DeviceStatus) : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
