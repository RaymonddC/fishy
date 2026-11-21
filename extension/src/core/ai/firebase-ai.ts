// The two Firebase AI Logic models the router chooses between.
//
// Each one is pinned to a single side. The on-device model can only run
// Gemini Nano in Chrome; the cloud model can only run Gemini in the cloud.
// Neither uses a mode that switches sides by itself, because that switch
// resends the same prompt, and the router must redact before anything is
// sent to the cloud. A test reads this file to keep it that way.

import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import type { GenerativeModel } from 'firebase/ai';

import { getFirebaseApp } from '../firebase/app.ts';
import { onDeviceCreateOptions } from './device.ts';
import type { TextModel } from './router.ts';

interface Models {
  onDevice: TextModel;
  inCloud: TextModel;
  /** Starts the Gemini Nano download. Chrome requires a click first. */
  downloadDeviceModel(onProgress: (fraction: number) => void): Promise<void>;
}

function asTextModel(model: GenerativeModel, beforeFirstCall?: () => Promise<void>): TextModel {
  return {
    async generate(prompt) {
      if (beforeFirstCall) {
        await beforeFirstCall();
      }
      const result = await model.generateContent(prompt);
      return { text: result.response.text(), source: result.response.inferenceSource };
    },
  };
}

let models: Models | undefined;

/** Created on first use, after App Check has been started. */
export function aiModels(): Models {
  if (models) {
    return models;
  }
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });

  const deviceModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: onDeviceCreateOptions() },
  });

  // The SDK asks for the device model to be initialised once, after a click
  // and before the first request. A failed attempt is forgotten so that the
  // next request tries again.
  let ready: Promise<void> | undefined;
  const prepareDeviceModel = (onProgress?: (fraction: number) => void): Promise<void> => {
    ready ??= deviceModel.initializeDeviceModel(onProgress).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };

  // Without a name the SDK uses its own default cloud model for hybrid apps.
  const cloudModelName = import.meta.env.VITE_CLOUD_MODEL;
  const cloudModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    ...(cloudModelName ? { inCloudParams: { model: cloudModelName } } : {}),
  });

  models = {
    onDevice: asTextModel(deviceModel, () => prepareDeviceModel()),
    inCloud: asTextModel(cloudModel),
    downloadDeviceModel: (onProgress) => prepareDeviceModel(onProgress),
  };
  return models;
}
