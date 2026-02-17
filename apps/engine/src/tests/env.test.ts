import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';

describe('env validation', () => {
  it('fails when VANGUARD_TOKEN is missing', () => {
    expect(() => loadEnv({})).toThrowError(/VANGUARD_TOKEN/);
  });

  it('applies safe defaults', () => {
    const env = loadEnv({ VANGUARD_TOKEN: 'token-value' });

    expect(env.DRY_RUN).toBe(true);
    expect(env.KILL_SWITCH).toBe(true);
    expect(env.ARMED).toBe(false);
    expect(env.OPS_HOST).toBe('127.0.0.1');
    expect(env.OPS_PORT).toBe(3077);
  });
});
