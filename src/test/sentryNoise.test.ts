import { describe, it, expect } from 'vitest';
import type { Event } from '@sentry/react';
import { isInAppBrowserNoise } from '@/lib/sentry';

describe('isInAppBrowserNoise', () => {
  it('drops events with an iabjs:// frame', () => {
    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'iabjs://navigation_performance_logger_android' },
              ],
            },
          },
        ],
      },
    };

    expect(isInAppBrowserNoise(event, undefined)).toBe(true);
  });

  it('drops events whose message contains "Error invoking postMessage" even without frames', () => {
    const event: Event = {};

    expect(
      isInAppBrowserNoise(event, 'Error invoking postMessage: Java object is gone'),
    ).toBe(true);
  });

  it('keeps a normal TypeError from our own assets', () => {
    const event: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'Cannot read properties of undefined',
            stacktrace: {
              frames: [{ filename: '/assets/App-xyz.js' }],
            },
          },
        ],
      },
    };

    expect(isInAppBrowserNoise(event, 'Cannot read properties of undefined')).toBe(false);
  });
});
