import { llmAnalysisSchema } from './schema';
import type { LLMAnalysis } from './types';

const fencedJsonPattern = /```(?:json)?\s*([\s\S]*?)```/i;

const tryParse = (candidate: string): unknown | null => {
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

export class LLMResponseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMResponseParseError';
  }
}

export const extractJsonPayload = (text: string): unknown => {
  const trimmed = text.trim();

  const candidates = new Set<string>();
  candidates.add(trimmed);

  const fencedMatch = trimmed.match(fencedJsonPattern);
  if (fencedMatch && fencedMatch[1]) {
    candidates.add(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  throw new LLMResponseParseError('Unable to extract JSON object from provider response');
};

export const parseLLMAnalysisFromText = (text: string): LLMAnalysis => {
  const payload = extractJsonPayload(text);

  try {
    return llmAnalysisSchema.parse(payload);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'unknown parse error';
    throw new LLMResponseParseError(`Provider JSON did not satisfy analysis schema: ${reason}`);
  }
};
