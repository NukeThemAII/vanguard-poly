import { describe, expect, it } from 'vitest';
import { GeminiProvider } from '../providers/gemini-provider';

type FetchCall = {
  url: string;
  init: RequestInit;
};

const buildResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

describe('GeminiProvider', () => {
  it('parses structured analysis response', async () => {
    const calls: FetchCall[] = [];

    const fetchFn = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return buildResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"sentiment":-0.2,"confidence":0.76,"fairProbability":0.35,"rationale":"Momentum drift and weak liquidity imply cautious no bias."}',
                },
              ],
            },
          },
        ],
      });
    };

    const provider = new GeminiProvider({
      apiKey: 'gemini-key',
      fetchFn,
      minIntervalMs: 1,
      baseUrl: 'https://gemini.local/v1beta',
      model: 'gemini-test-model',
    });

    const result = await provider.analyze({ prompt: 'analyze orderbook imbalance' });

    expect(result.analysis.sentiment).toBe(-0.2);
    expect(result.analysis.fairProbability).toBe(0.35);
    expect(result.metadata.provider).toBe('gemini');
    expect(calls[0]?.url).toBe(
      'https://gemini.local/v1beta/models/gemini-test-model:generateContent?key=gemini-key',
    );
  });

  it('rate-limits burst calls via queue spacing', async () => {
    let nowMs = 0;
    const startTimes: number[] = [];

    const fetchFn = async () => {
      startTimes.push(nowMs);
      return buildResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"sentiment":0,"confidence":0.9,"fairProbability":0.5,"rationale":"stable"}',
                },
              ],
            },
          },
        ],
      });
    };

    const provider = new GeminiProvider({
      apiKey: 'gemini-key',
      fetchFn,
      minIntervalMs: 200,
      queueOptions: {
        now: () => nowMs,
        sleep: async (ms: number) => {
          nowMs += ms;
        },
      },
    });

    await Promise.all([
      provider.analyze({ prompt: 'a' }),
      provider.analyze({ prompt: 'b' }),
      provider.analyze({ prompt: 'c' }),
    ]);

    expect(startTimes).toEqual([0, 200, 400]);
  });
});
