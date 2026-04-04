import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

const REVIEW_COUNT_KEY = 'vm-review-tx-count';
const REVIEW_LAST_KEY = 'vm-review-last-shown';
const REVIEW_THRESHOLD = 20;
const REVIEW_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export const useInAppReview = () => {
  const maybeRequestReview = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const count = parseInt(localStorage.getItem(REVIEW_COUNT_KEY) || '0', 10) + 1;
      localStorage.setItem(REVIEW_COUNT_KEY, String(count));

      if (count < REVIEW_THRESHOLD) return;

      const lastShown = parseInt(localStorage.getItem(REVIEW_LAST_KEY) || '0', 10);
      if (Date.now() - lastShown < REVIEW_COOLDOWN_MS) return;

      // Dynamic import to avoid bundling on web
      const { RateApp } = await import('capacitor-rate-app');
      await RateApp.requestReview();
      localStorage.setItem(REVIEW_LAST_KEY, String(Date.now()));
      // Reset counter after showing
      localStorage.setItem(REVIEW_COUNT_KEY, '0');
    } catch (e) {
      console.error('[InAppReview] Error:', e);
    }
  }, []);

  return { maybeRequestReview };
};
