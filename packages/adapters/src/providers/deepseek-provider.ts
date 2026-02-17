import { parseLLMAnalysisFromText } from '../json';
import type { AnalysisRequest, AnalysisResult, ILLMProvider } from '../types';

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;

type DeepSeekMessage = {
  role: 'system' | 'user';
  content: string;
};

type DeepSeekRequestBody = {
  model: string;
  temperature: number;
  response_format: {
    type: 'json_object';
  };
  messages: DeepSeekMessage[];
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const defaultFetch: FetchLike = async (url, init) => fetch(url, init);

export type DeepSeekProviderOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
};

const buildSystemPrompt = (): string =>
  'Return only JSON with keys sentiment, confidence, fairProbability, rationale. No extra prose.';

export class DeepSeekProvider implements ILLMProvider {
  readonly providerName = 'deepseek';

  readonly model: string;

  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly timeoutMs: number;

  private readonly fetchFn: FetchLike;

  constructor({
    apiKey,
    model = 'deepseek-chat',
    baseUrl = 'https://api.deepseek.com/v1',
    timeoutMs = 10_000,
    fetchFn = defaultFetch,
  }: DeepSeekProviderOptions) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const startedAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const body: DeepSeekRequestBody = {
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: request.systemPrompt ?? buildSystemPrompt(),
          },
          {
            role: 'user',
            content: request.prompt,
          },
        ],
      };

      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error (${response.status}): ${errorText.slice(0, 500)}`);
      }

      const payload = (await response.json()) as DeepSeekResponse;
      const rawText = payload.choices?.[0]?.message?.content;

      if (!rawText || typeof rawText !== 'string') {
        throw new Error('DeepSeek response missing choices[0].message.content');
      }

      const analysis = parseLLMAnalysisFromText(rawText);

      return {
        analysis,
        rawText,
        metadata: {
          provider: this.providerName,
          model: this.model,
          latencyMs: Date.now() - startedAt,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
