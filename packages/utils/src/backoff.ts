export type BackoffOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
};

const DEFAULT_OPTIONS: BackoffOptions = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
  jitter: true,
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const computeDelay = (attempt: number, options: BackoffOptions): number => {
  const exponential = options.baseDelayMs * Math.pow(2, attempt - 1);
  const bounded = Math.min(exponential, options.maxDelayMs);

  if (!options.jitter) {
    return bounded;
  }

  const jitterRatio = 0.2;
  const jittered = bounded * (1 - jitterRatio + Math.random() * jitterRatio * 2);
  return Math.max(0, Math.round(jittered));
};

export const retryWithBackoff = async <T>(
  task: () => Promise<T>,
  shouldRetry: (error: unknown, attempt: number) => boolean = () => true,
  overrides: Partial<BackoffOptions> = {},
): Promise<T> => {
  const options: BackoffOptions = { ...DEFAULT_OPTIONS, ...overrides };

  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error: unknown) {
      lastError = error;
      const retryable = shouldRetry(error, attempt);
      const terminalAttempt = attempt >= options.maxAttempts;

      if (!retryable || terminalAttempt) {
        throw error;
      }

      const delay = computeDelay(attempt, options);
      await sleep(delay);
    }
  }

  throw lastError;
};
