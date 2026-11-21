// What the side panel says about a phone check.
//
// A plain function of the verification record. Anything short of "pressed 1
// and entered the right PIN" is not a confirmation, and the banner says so.

export type CheckStatus = 'waiting' | 'awaiting_pin' | 'confirmed' | 'denied' | 'pin_failed' | 'unreached';

export interface CheckView {
  status: CheckStatus;
  pinVerified: boolean;
  callPlaced: boolean;
  callSkippedReason: string | null;
}

export type BannerTone = 'amber' | 'red' | 'green';

export interface Banner {
  tone: BannerTone;
  title: string;
  detail: string;
}

const NOT_VERIFIED = 'Not verified. Do not pay';

const WHY_NO_CALL: Record<string, string> = {
  calls_disabled: 'Calls are switched off on the server',
  not_on_allowlist: 'The number on record is not on the list of numbers that may be called',
  invalid_number: 'The number on record is not a valid international number',
  daily_cap_reached: 'The daily limit for calls has been reached',
  provider_error: 'The phone service could not place the call',
};

function whyNoCall(reason: string | null): string {
  return (reason && WHY_NO_CALL[reason]) || 'No call could be placed';
}

export function bannerFor(check: CheckView, person: { name: string; maskedPhone: string }): Banner {
  const { name } = person;
  switch (check.status) {
    case 'confirmed':
      return {
        tone: 'green',
        title: `Confirmed by ${name}`,
        detail: 'They pressed 1 and entered the right PIN.',
      };
    case 'denied':
      return {
        tone: 'red',
        title: NOT_VERIFIED,
        detail: check.pinVerified
          ? `${name} pressed 2 and confirmed with their PIN: this request is not theirs.`
          : `${name} pressed 2: this request is not theirs.`,
      };
    case 'pin_failed':
      return {
        tone: 'red',
        title: NOT_VERIFIED,
        detail: `Someone pressed 1 on ${name}’s phone but did not enter the right PIN.`,
      };
    case 'unreached':
      return {
        tone: 'red',
        title: NOT_VERIFIED,
        detail: check.callPlaced
          ? `${name} did not answer. Hold the payment until they confirm.`
          : `${whyNoCall(check.callSkippedReason)}, so ${name} has not been asked. Hold the payment.`,
      };
    case 'awaiting_pin':
      return {
        tone: 'amber',
        title: 'Waiting for the PIN',
        detail: `${name} pressed 1. The request is not confirmed until the PIN is entered.`,
      };
    case 'waiting':
      return {
        tone: 'amber',
        title: `Asking ${name}`,
        detail: check.callPlaced
          ? `Calling the number on record (${person.maskedPhone}). Hold the payment until they answer.`
          : `${whyNoCall(check.callSkippedReason)}. Waiting for an answer on the approval page. Hold the payment.`,
      };
  }
}
