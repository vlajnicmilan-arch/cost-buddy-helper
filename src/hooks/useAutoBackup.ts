import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useExpenses } from './useExpenses';
import { useStorage } from '@/contexts/StorageContext';
import { 
  createAutoBackup, 
  getBackupSettings, 
  saveBackupSettings,
  BackupSettings,
  initBackupDB
} from '@/lib/storage/autoBackup';
import { showSuccess } from '@/hooks/useStatusFeedback';

export const useAutoBackup = () => {
  const { expenses } = useExpenses();
  const { storageMode } = useStorage();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastBackupCountRef = useRef<number>(0);

  const performBackup = useCallback(async (silent = true) => {
    if (expenses.length === 0) return;
    
    // Only backup if data has changed
    if (expenses.length === lastBackupCountRef.current) return;

    try {
      await createAutoBackup(expenses);
      lastBackupCountRef.current = expenses.length;
      
      const settings = await getBackupSettings();
      await saveBackupSettings({
        ...settings,
        lastBackupAt: new Date().toISOString()
      });

      if (!silent) {
        showSuccess(t('toasts.autoBackupSaved'));
      }
    } catch (error) {
      console.error('Auto backup failed:', error);
    }
  }, [expenses]);

  const startAutoBackup = useCallback(async () => {
    try {
      await initBackupDB();
      const settings = await getBackupSettings();
      
      if (!settings.enabled) return;

      // Clear existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Set up new interval
      const intervalMs = settings.intervalMinutes * 60 * 1000;
      intervalRef.current = setInterval(() => {
        performBackup(true);
      }, intervalMs);

      // Perform initial backup after 30 seconds if data exists
      setTimeout(() => {
        performBackup(true);
      }, 30000);

    } catch (error) {
      console.error('Failed to start auto backup:', error);
    }
  }, [performBackup]);

  const stopAutoBackup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Only run auto backup in local mode
    if (storageMode === 'local') {
      startAutoBackup();
    }

    return () => {
      stopAutoBackup();
    };
  }, [storageMode, startAutoBackup, stopAutoBackup]);

  // Backup on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (storageMode === 'local' && expenses.length > 0) {
        // Sync backup on page close
        createAutoBackup(expenses).catch(console.error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [expenses, storageMode]);

  return {
    performBackup: () => performBackup(false),
    startAutoBackup,
    stopAutoBackup
  };
};
