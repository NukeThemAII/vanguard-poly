export type AnalysisRequest = {
  prompt: string;
  systemPrompt?: string;
  marketId?: string;
};

export type LLMAnalysis = {
  sentiment: number;
  confidence: number;
  fairProbability: number;
  rationale: string;
};

export type ProviderMetadata = {
  provider: string;
  model: string;
  latencyMs: number;
};

export type AnalysisResult = {
  analysis: LLMAnalysis;
  rawText: string;
  metadata: ProviderMetadata;
};

export interface ILLMProvider {
  readonly providerName: string;
  readonly model: string;
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}
