import { useEffect, useRef } from 'react';

/**
 * Hook that clears all offline-related data from localStorage, IndexedDB, and caches
 * Runs once on app initialization to ensure clean online-only state
 */
export function useClearOfflineData() {
  const hasCleared = useRef(false);

  useEffect(() => {
    if (hasCleared.current) return;
    hasCleared.current = true;

    console.log('[ClearOfflineData] Cleaning up offline storage...');

    // Keys to remove from localStorage
    const offlineKeys = [
      'offline_clients_cache',
      'offline_clients_last_sync',
      'offline_renewals_queue',
      'offline_message_queue',
      'pwa_cache_timestamp',
      'sw_cache_version',
      'offline_data_cache',
      'pending_sync_items',
    ];

    // Clear specific localStorage keys
    offlineKeys.forEach(key => {
      try {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
          console.log(`[ClearOfflineData] Removed localStorage key: ${key}`);
        }
      } catch (e) {
        // Ignore errors
      }
    });

    // Clear all caches via Cache API
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName);
          console.log(`[ClearOfflineData] Deleted cache: ${cacheName}`);
        });
      }).catch(() => {
        // Ignore errors
      });
    }

    // Clear IndexedDB databases related to caching
    if ('indexedDB' in window) {
      const dbsToDelete = ['workbox-expiration', 'keyval-store', 'offline-cache'];
      dbsToDelete.forEach(dbName => {
        try {
          indexedDB.deleteDatabase(dbName);
          console.log(`[ClearOfflineData] Deleted IndexedDB: ${dbName}`);
        } catch (e) {
          // Ignore errors
        }
      });
    }

    // Tell service worker to clear its caches
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
    }

    console.log('[ClearOfflineData] Cleanup complete');
  }, []);
}
