import { describe, expect, it } from 'vitest';
import { RateLimitedQueue } from '../rate-limited-queue';

describe('RateLimitedQueue', () => {
  it('enforces minimum spacing between queued task start times', async () => {
    let nowMs = 0;
    const waits: number[] = [];
    const startedAt: number[] = [];

    const queue = new RateLimitedQueue({
      minIntervalMs: 100,
      now: () => nowMs,
      sleep: async (ms: number) => {
        waits.push(ms);
        nowMs += ms;
      },
    });

    const results = await Promise.all([
      queue.enqueue(async () => {
        startedAt.push(nowMs);
        nowMs += 5;
        return 'first';
      }),
      queue.enqueue(async () => {
        startedAt.push(nowMs);
        return 'second';
      }),
      queue.enqueue(async () => {
        startedAt.push(nowMs);
        return 'third';
      }),
    ]);

    expect(results).toEqual(['first', 'second', 'third']);
    expect(waits).toEqual([95, 100]);
    expect(startedAt).toEqual([0, 100, 200]);
  });
});
