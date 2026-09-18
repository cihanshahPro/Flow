// Replace these boundaries with verified integrations in a development build.
// No fake successful purchases, entitlement grants, or transcription results.
export const capabilities = {
  transcription: {
    available: false,
    reason:
      "Native transcription is not connected. Recordings remain available to play and share.",
  },
  purchases: {
    available: false,
    reason: "Purchases are not enabled in this starter.",
  },
  cloudSync: {
    available: false,
    reason:
      "This mobile workspace stays on this device and is separate from the web app.",
  },
} as const;
export interface BillingService {
  getEntitlements(): Promise<{ premium: boolean }>;
  purchase(productId: string): Promise<void>;
  restore(): Promise<void>;
}
export interface TranscriptionService {
  transcribe(localAudioUri: string): Promise<string>;
}
