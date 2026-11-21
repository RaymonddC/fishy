// The side panel for task 1: paste a message, see which pressure tactics the
// model finds, and see where it was read. All text is set with textContent,
// so nothing from a message or a model can run as markup.

import { readDeviceStatus } from '../core/ai/device.ts';
import type { DeviceStatus } from '../core/ai/device.ts';
import { aiModels } from '../core/ai/firebase-ai.ts';
import { tacticPrompt } from '../core/ai/prompt.ts';
import { analyse, LeakGuardError } from '../core/ai/router.ts';
import type { Analysis } from '../core/ai/router.ts';
import { checkAppCheck, startAppCheck } from '../core/firebase/app-check.ts';
import { missingFirebaseConfig } from '../core/firebase/app.ts';
import { signIn } from '../core/firebase/auth.ts';
import { redact } from '../core/redact/redact.ts';

type State = 'ok' | 'warn' | 'bad';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`The side panel is missing #${id}.`);
  }
  return node as T;
}

const ui = {
  firebase: element('status-firebase'),
  appCheck: element('status-appcheck'),
  auth: element('status-auth'),
  model: element('status-model'),
  download: element<HTMLButtonElement>('download'),
  downloadProgress: element('download-progress'),
  message: element<HTMLTextAreaElement>('message'),
  check: element<HTMLButtonElement>('check'),
  result: element('result'),
  badge: element('badge'),
  answer: element('answer'),
  where: element('where'),
  sent: element<HTMLDetailsElement>('sent'),
  sentText: element('sent-text'),
  error: element('error'),
};

const MODEL_TEXT: Record<DeviceStatus, { text: string; state: State }> = {
  available: { text: 'Ready. Messages are read on this laptop', state: 'ok' },
  downloadable: { text: 'Not downloaded yet. Until then, messages are redacted and read in the cloud', state: 'warn' },
  downloading: { text: 'Downloading. Until it finishes, messages are redacted and read in the cloud', state: 'warn' },
  unavailable: { text: 'This computer cannot run it. Messages are redacted and read in the cloud', state: 'warn' },
  missing: { text: 'This browser does not have it. Messages are redacted and read in the cloud', state: 'warn' },
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setStatus(node: HTMLElement, text: string, state: State): void {
  node.textContent = text;
  node.dataset.state = state;
}

function showError(text: string): void {
  ui.error.textContent = text;
  ui.error.hidden = false;
}

function clearError(): void {
  ui.error.hidden = true;
  ui.error.textContent = '';
}

async function refreshModelStatus(): Promise<DeviceStatus> {
  const status = await readDeviceStatus();
  const { text, state } = MODEL_TEXT[status];
  setStatus(ui.model, text, state);
  ui.download.hidden = status !== 'downloadable' && status !== 'downloading';
  return status;
}

function showResult(result: Analysis): void {
  ui.badge.textContent = result.source === 'on_device' ? 'On device' : 'Cloud';
  ui.badge.dataset.source = result.source;
  ui.answer.textContent = result.answer.trim() || 'No answer';

  if (result.redaction === null) {
    ui.where.textContent = 'Read by Gemini Nano on this laptop. Nothing was sent anywhere.';
    ui.sent.hidden = true;
    ui.sentText.textContent = '';
  } else {
    const removed = result.redaction.total;
    const details = removed === 1 ? '1 detail was' : `${removed} details were`;
    const failed = result.onDeviceError ? ` The on-device model failed first: ${result.onDeviceError}` : '';
    ui.where.textContent = `Read in the cloud after ${details} removed on this laptop.${failed}`;
    ui.sentText.textContent = result.redaction.text;
    ui.sent.hidden = false;
  }
  ui.result.hidden = false;
}

async function checkMessage(): Promise<void> {
  clearError();
  const text = ui.message.value.trim();
  if (!text) {
    showError('Paste a message first.');
    return;
  }
  ui.check.disabled = true;
  ui.check.textContent = 'Checking';
  try {
    const models = aiModels();
    const result = await analyse(text, {
      deviceStatus: () => readDeviceStatus(),
      onDevice: models.onDevice,
      inCloud: models.inCloud,
      redact: (message) => redact(message),
      buildPrompt: tacticPrompt,
    });
    showResult(result);
  } catch (error) {
    ui.result.hidden = true;
    if (error instanceof LeakGuardError) {
      showError(`Stopped. The on-device call could not be confirmed to have stayed on this laptop. ${error.message}`);
    } else {
      showError(`Could not check the message. ${describe(error)}`);
    }
  } finally {
    ui.check.disabled = false;
    ui.check.textContent = 'Check message';
    void refreshModelStatus();
  }
}

async function downloadModel(): Promise<void> {
  clearError();
  ui.download.disabled = true;
  ui.downloadProgress.hidden = false;
  ui.downloadProgress.textContent = 'Starting the download';
  try {
    await aiModels().downloadDeviceModel((fraction) => {
      ui.downloadProgress.textContent = `Downloaded ${Math.round(fraction * 100)}%`;
    });
    ui.downloadProgress.textContent = 'Download finished';
  } catch (error) {
    ui.downloadProgress.hidden = true;
    showError(`Could not download the on-device model. ${describe(error)}`);
  } finally {
    ui.download.disabled = false;
    void refreshModelStatus();
  }
}

async function start(): Promise<void> {
  ui.check.addEventListener('click', () => void checkMessage());
  ui.download.addEventListener('click', () => void downloadModel());
  void refreshModelStatus();

  const missing = missingFirebaseConfig();
  if (missing.length > 0) {
    setStatus(ui.firebase, `Not set up. Missing ${missing.join(', ')}. See the README`, 'bad');
    setStatus(ui.appCheck, 'Waiting for Firebase', 'warn');
    setStatus(ui.auth, 'Waiting for Firebase', 'warn');
    ui.check.disabled = true;
    return;
  }
  setStatus(ui.firebase, 'Configured', 'ok');

  if (startAppCheck() === 'off') {
    setStatus(ui.appCheck, 'Off. No debug token is set, so cloud calls will be refused', 'bad');
  } else {
    try {
      await checkAppCheck();
      setStatus(ui.appCheck, 'On. Token received', 'ok');
    } catch (error) {
      setStatus(ui.appCheck, `Token refused. ${describe(error)}`, 'bad');
    }
  }

  try {
    await signIn();
    setStatus(ui.auth, 'Signed in anonymously', 'ok');
  } catch (error) {
    setStatus(ui.auth, `Failed. ${describe(error)}`, 'bad');
  }
}

void start();
