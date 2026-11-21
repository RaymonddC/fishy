// Decides where a message is read.
//
// The rule: raw message text may only reach the on-device model. The cloud
// model may only ever see text that was redacted on the laptop first.
//
// Firebase AI Logic can fall back to the cloud by itself, but it does so by
// resending the same prompt. That would send raw text off the laptop, so the
// choice is made here instead, and each Firebase model is pinned to one side.

import type { DeviceStatus } from './device.ts';
import type { Redaction } from '../redact/redact.ts';

export type InferenceSource = 'on_device' | 'in_cloud';

export interface ModelReply {
  text: string;
  /** Where the model says it ran. Undefined if it did not say. */
  source: InferenceSource | undefined;
}

export interface TextModel {
  generate(prompt: string): Promise<ModelReply>;
}

export interface RouterDeps {
  deviceStatus(): Promise<DeviceStatus>;
  /** Pinned to the device. The only model that may receive raw text. */
  onDevice: TextModel;
  /** Pinned to the cloud. Only ever receives redacted text. */
  inCloud: TextModel;
  redact(text: string): Redaction;
  buildPrompt(message: string): string;
}

export interface Analysis {
  answer: string;
  /** Where the answer was produced. Drives the badge in the side panel. */
  source: InferenceSource;
  deviceStatus: DeviceStatus;
  /** What was sent to the cloud. Null when nothing left the laptop. */
  redaction: Redaction | null;
  /** Set when the on-device model was ready but its call failed. */
  onDeviceError?: string;
}

/** The on-device call could not be confirmed to have stayed on the device. */
export class LeakGuardError extends Error {
  override name = 'LeakGuardError';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function analyse(message: string, deps: RouterDeps): Promise<Analysis> {
  const deviceStatus = await deps.deviceStatus();
  let onDeviceError: string | undefined;

  if (deviceStatus === 'available') {
    let reply: ModelReply | undefined;
    try {
      reply = await deps.onDevice.generate(deps.buildPrompt(message));
    } catch (error) {
      // The on-device model was ready but its call failed. The message has
      // not left the laptop, so the redacted cloud path below is still safe.
      onDeviceError = describe(error);
    }
    if (reply) {
      if (reply.source !== 'on_device') {
        // Never show an "on device" badge for a call that did not prove it
        // stayed on the device, and never quietly retry it in the cloud.
        throw new LeakGuardError(
          `The on-device call reported "${reply.source ?? 'no source'}" instead of "on_device".`,
        );
      }
      return { answer: reply.text, source: 'on_device', deviceStatus, redaction: null };
    }
  }

  const redaction = deps.redact(message);
  const reply = await deps.inCloud.generate(deps.buildPrompt(redaction.text));
  if (reply.source !== 'in_cloud') {
    throw new Error(`The cloud call reported "${reply.source ?? 'no source'}" instead of "in_cloud".`);
  }
  const analysis: Analysis = { answer: reply.text, source: 'in_cloud', deviceStatus, redaction };
  if (onDeviceError !== undefined) {
    analysis.onDeviceError = onDeviceError;
  }
  return analysis;
}
