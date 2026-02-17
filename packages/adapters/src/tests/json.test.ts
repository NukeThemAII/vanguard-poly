import { describe, expect, it } from 'vitest';
import { LLMResponseParseError, parseLLMAnalysisFromText } from '../json';

describe('parseLLMAnalysisFromText', () => {
  it('parses valid direct JSON', () => {
    const result = parseLLMAnalysisFromText(
      JSON.stringify({
        sentiment: 0.2,
        confidence: 0.91,
        fairProbability: 0.63,
        rationale: 'Liquidity and sentiment alignment support a mild yes bias.',
      }),
    );

    expect(result.sentiment).toBe(0.2);
    expect(result.confidence).toBe(0.91);
    expect(result.fairProbability).toBe(0.63);
  });

  it('parses fenced JSON blocks', () => {
    const result = parseLLMAnalysisFromText(
      `\n\`\`\`json\n{"sentiment":-0.1,"confidence":0.8,"fairProbability":0.41,"rationale":"Event drift."}\n\`\`\``,
    );

    expect(result.sentiment).toBe(-0.1);
    expect(result.fairProbability).toBe(0.41);
  });

  it('rejects malformed JSON payload', () => {
    expect(() => parseLLMAnalysisFromText('analysis: definitely bullish')).toThrowError(
      LLMResponseParseError,
    );
  });

  it('rejects JSON that violates schema', () => {
    expect(() =>
      parseLLMAnalysisFromText(
        JSON.stringify({
          sentiment: 0.2,
          confidence: 1.7,
          fairProbability: 0.5,
          rationale: 'Invalid confidence range',
        }),
      ),
    ).toThrowError(LLMResponseParseError);
  });
});
