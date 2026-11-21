// The "Phone check" card: pick who the request claims to come from, ask them
// on the number on record, and show the answer as a banner.

import { bannerFor } from '../core/call/banner.ts';
import type { CheckView } from '../core/call/banner.ts';
import { listPeople, startPhoneCheck, watchCheck } from '../core/call/verify.ts';
import type { DirectoryPerson } from '../core/call/verify.ts';

export interface PhonePanelElements {
  person: HTMLSelectElement;
  start: HTMLButtonElement;
  hint: HTMLElement;
  banner: HTMLElement;
  bannerTitle: HTMLElement;
  bannerDetail: HTMLElement;
  approval: HTMLAnchorElement;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startPhonePanel(ui: PhonePanelElements): Promise<void> {
  let people: DirectoryPerson[] = [];
  let stopWatching: (() => void) | null = null;

  function show(check: CheckView, person: DirectoryPerson): void {
    const banner = bannerFor(check, person);
    ui.banner.dataset.tone = banner.tone;
    ui.bannerTitle.textContent = banner.title;
    ui.bannerDetail.textContent = banner.detail;
    ui.banner.hidden = false;
    const answered = check.status !== 'waiting' && check.status !== 'awaiting_pin';
    if (answered) {
      ui.approval.hidden = true;
    }
  }

  ui.start.addEventListener('click', () => {
    void (async () => {
      const person = people.find((entry) => entry.id === ui.person.value);
      if (!person) {
        return;
      }
      stopWatching?.();
      stopWatching = null;
      ui.start.disabled = true;
      ui.banner.hidden = true;
      ui.approval.hidden = true;
      ui.hint.textContent = `Asking the server to check with ${person.name}`;
      try {
        const started = await startPhoneCheck(person.id);
        ui.hint.textContent = '';
        if (started.approvalUrl?.startsWith('https://')) {
          ui.approval.href = started.approvalUrl;
          ui.approval.hidden = false;
        }
        stopWatching = watchCheck(
          started.verificationId,
          (check) => show(check, started.person),
          (error) => {
            ui.hint.textContent = `Lost the connection to the check. ${error.message}`;
          },
        );
      } catch (error) {
        ui.hint.textContent = `Could not start the check. ${describe(error)}`;
      } finally {
        ui.start.disabled = false;
      }
    })();
  });

  try {
    people = await listPeople();
  } catch (error) {
    ui.hint.textContent = `Could not read the directory. ${describe(error)}`;
    return;
  }
  if (people.length === 0) {
    ui.hint.textContent = 'The directory is empty. See the README to add the demo person';
    return;
  }
  ui.person.replaceChildren(
    ...people.map((person) => {
      const option = document.createElement('option');
      option.value = person.id;
      option.textContent = `${person.name}, ${person.role} (${person.maskedPhone})`;
      return option;
    }),
  );
  ui.person.disabled = false;
  ui.start.disabled = false;
  ui.hint.textContent = 'The call goes to the number on record, never to a number from the message';
}
