import { requireOptionalNativeModule } from "expo";

export type NativeCapabilities = { speech: boolean; llm: boolean; reason: string };

type FlowIntelligenceNative = {
  capabilities(): Promise<NativeCapabilities>;
  transcribe(audioUri: string, locale: string | null): Promise<string>;
  /** Returns the shape JSON string (same schema as the processor server). */
  shapeThought(text: string, context: string | null): Promise<string>;
  /** The intake: returns the plan JSON string ({ items }). */
  planThought?(text: string, context: string | null): Promise<string>;
};

/** null in Expo Go, web, Android and tests: callers fall back safely. */
export const FlowIntelligence =
  requireOptionalNativeModule<FlowIntelligenceNative>("FlowIntelligence");
