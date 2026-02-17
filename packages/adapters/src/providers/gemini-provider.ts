import { parseLLMAnalysisFromText } from '../json';
import { RateLimitedQueue, type RateLimitedQueueOptions } from '../rate-limited-queue';
import type { AnalysisRequest, AnalysisResult, ILLMProvider } from '../types';

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;

type GeminiRequestBody = {
  contents: Array<{
    role: 'user';
    parts: Array<{ text: string }>;
  }>;
  generationConfig: {
    temperature: number;
    responseMimeType: 'application/json';
  };
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const defaultFetch: FetchLike = async (url, init) => fetch(url, init);

export type GeminiProviderOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  queueOptions?: Omit<RateLimitedQueueOptions, 'minIntervalMs'>;
};

const buildSystemPrompt = (): string =>
  'Return only JSON with keys sentiment, confidence, fairProbability, rationale. No extra prose.';

export class GeminiProvider implements ILLMProvider {
  readonly providerName = 'gemini';

  readonly model: string;

  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly timeoutMs: number;

  private readonly fetchFn: FetchLike;

  private readonly queue: RateLimitedQueue;

  constructor({
    apiKey,
    model = 'gemini-1.5-flash',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
    minIntervalMs = 1_500,
    timeoutMs = 10_000,
    fetchFn = defaultFetch,
    queueOptions,
  }: GeminiProviderOptions) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
    this.queue = new RateLimitedQueue({
      minIntervalMs,
      ...queueOptions,
    });
  }

  analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    return this.queue.enqueue(async () => {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        const body: GeminiRequestBody = {
          contents: [
            {
              role: 'user',
              parts: [{ text: request.prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
          systemInstruction: {
            parts: [{ text: request.systemPrompt ?? buildSystemPrompt() }],
          },
        };

        const endpoint = `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

        const response = await this.fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error (${response.status}): ${errorText.slice(0, 500)}`);
        }

        const payload = (await response.json()) as GeminiResponse;
        const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText || typeof rawText !== 'string') {
          throw new Error('Gemini response missing candidates[0].content.parts[0].text');
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
    });
  }
}
