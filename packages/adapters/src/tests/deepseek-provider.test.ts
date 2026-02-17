import { describe, expect, it } from 'vitest';
import { DeepSeekProvider } from '../providers/deepseek-provider';

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

describe('DeepSeekProvider', () => {
  it('parses structured analysis response', async () => {
    const calls: FetchCall[] = [];

    const fetchFn = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return buildResponse({
        choices: [
          {
            message: {
              content:
                '{"sentiment":0.3,"confidence":0.88,"fairProbability":0.67,"rationale":"Order flow and event timing support a yes edge."}',
            },
          },
        ],
      });
    };

    const provider = new DeepSeekProvider({
      apiKey: 'test-key',
      fetchFn,
      baseUrl: 'https://deepseek.local/v1',
    });

    const result = await provider.analyze({ prompt: 'analyze market structure' });

    expect(result.analysis.sentiment).toBe(0.3);
    expect(result.analysis.confidence).toBe(0.88);
    expect(result.metadata.provider).toBe('deepseek');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://deepseek.local/v1/chat/completions');
  });
});
