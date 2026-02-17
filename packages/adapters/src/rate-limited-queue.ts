export type RateLimitedQueueOptions = {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class RateLimitedQueue {
  private readonly minIntervalMs: number;

  private readonly now: () => number;

  private readonly sleep: (ms: number) => Promise<void>;

  private tail: Promise<void> = Promise.resolve();

  private hasStarted = false;

  private lastStartAtMs = 0;

  constructor({ minIntervalMs, now = Date.now, sleep = defaultSleep }: RateLimitedQueueOptions) {
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleep = sleep;
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const runTask = async (): Promise<T> => {
      if (this.hasStarted) {
        const elapsedMs = this.now() - this.lastStartAtMs;
        const waitMs = Math.max(0, this.minIntervalMs - elapsedMs);

        if (waitMs > 0) {
          await this.sleep(waitMs);
        }
      }

      this.lastStartAtMs = this.now();
      this.hasStarted = true;

      return task();
    };

    const taskPromise = this.tail.then(runTask, runTask);
    this.tail = taskPromise.then(
      () => undefined,
      () => undefined,
    );

    return taskPromise;
  }
}
