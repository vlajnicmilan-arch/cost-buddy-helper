import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export const useNativeShare = () => {
  const isNative = Capacitor.isNativePlatform();

  const share = useCallback(async (options: {
    title?: string;
    text?: string;
    url?: string;
    dialogTitle?: string;
  }) => {
    try {
      if (isNative) {
        const { Share } = await import('@capacitor/share');
        await Share.share(options);
        return true;
      }
      // Web fallback
      if (navigator.share) {
        await navigator.share(options);
        return true;
      }
      // Copy to clipboard as last resort
      const shareText = [options.title, options.text, options.url].filter(Boolean).join('\n');
      await navigator.clipboard.writeText(shareText);
      return true;
    } catch (e: any) {
      if (e?.message?.includes('cancel') || e?.message?.includes('abort')) return false;
      console.error('Share error:', e);
      return false;
    }
  }, [isNative]);

  const shareTransaction = useCallback(async (description: string, amount: string, date: string) => {
    return share({
      title: 'V&M Balance',
      text: `${description} • ${amount} • ${date}`,
      dialogTitle: 'Podijeli transakciju',
    });
  }, [share]);

  const shareInviteLink = useCallback(async (link: string, groupName: string) => {
    return share({
      title: `Pozivnica za ${groupName}`,
      text: `Pridruži se grupi "${groupName}" na V&M Balance!`,
      url: link,
      dialogTitle: 'Podijeli pozivnicu',
    });
  }, [share]);

  const shareApp = useCallback(async (userId: string) => {
    return share({
      title: 'V&M Balance',
      text: 'Isprobaj V&M Balance - aplikaciju za praćenje financija!',
      url: `https://vmbalance.com?ref=${userId}`,
      dialogTitle: 'Podijeli aplikaciju',
    });
  }, [share]);

  return { share, shareTransaction, shareInviteLink, shareApp, isNative };
};
