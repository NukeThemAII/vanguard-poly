export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type CircuitBreakerOptions = {
  failureThreshold: number;
  resetTimeoutMs: number;
  now?: () => number;
};

export type CircuitSnapshot = {
  state: CircuitState;
  consecutiveFailures: number;
  openedAtMs: number | null;
};

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private readonly failureThreshold: number;

  private readonly resetTimeoutMs: number;

  private readonly now: () => number;

  private state: CircuitState = 'CLOSED';

  private consecutiveFailures = 0;

  private openedAtMs: number | null = null;

  constructor({ failureThreshold, resetTimeoutMs, now = Date.now }: CircuitBreakerOptions) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.now = now;
  }

  private transitionToOpen(): void {
    this.state = 'OPEN';
    this.openedAtMs = this.now();
  }

  private transitionToClosed(): void {
    this.state = 'CLOSED';
    this.openedAtMs = null;
    this.consecutiveFailures = 0;
  }

  private maybeHalfOpen(): void {
    if (this.state !== 'OPEN' || this.openedAtMs === null) {
      return;
    }

    const elapsedMs = this.now() - this.openedAtMs;

    if (elapsedMs >= this.resetTimeoutMs) {
      this.state = 'HALF_OPEN';
    }
  }

  snapshot(): CircuitSnapshot {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAtMs: this.openedAtMs,
    };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen();

    if (this.state === 'OPEN') {
      throw new CircuitBreakerOpenError('Circuit breaker is open');
    }

    try {
      const result = await task();
      this.transitionToClosed();
      return result;
    } catch (error: unknown) {
      this.consecutiveFailures += 1;

      if (this.consecutiveFailures >= this.failureThreshold) {
        this.transitionToOpen();
      } else if (this.state === 'HALF_OPEN') {
        this.transitionToOpen();
      }

      throw error;
    }
  }
}
