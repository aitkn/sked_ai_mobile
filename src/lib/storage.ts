import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Safe storage wrapper that handles corrupted storage errors gracefully.
 * This is particularly important for iOS simulators where storage directories
 * can become corrupted (e.g., @anonymous file/directory conflicts).
 */
class SafeStorage {
  private static instance: SafeStorage;
  private errorCount = 0;
  private readonly MAX_ERRORS = 3;

  static getInstance(): SafeStorage {
    if (!SafeStorage.instance) {
      SafeStorage.instance = new SafeStorage();
    }
    return SafeStorage.instance;
  }

  /**
   * Check if error is a storage corruption error
   */
  private isStorageCorruptionError(error: any): boolean {
    if (!error) return false;
    
    const errorString = error.toString?.() || '';
    const message = error.message || errorString;
    
    return (
      message.includes('Not a directory') ||
      message.includes('NSPOSIXErrorDomain Code=20') ||
      message.includes('NSCocoaErrorDomain Code=512') ||
      message.includes('Failed to create storage directory') ||
      message.includes('@anonymous') ||
      message.includes('ExponentExperienceData')
    );
  }

  /**
   * Attempt to clear corrupted storage keys
   */
  private async attemptStorageRecovery(): Promise<void> {
    try {
      // Try to clear all AsyncStorage keys as a last resort
      if (Platform.OS !== 'web') {
        const allKeys = await AsyncStorage.getAllKeys();
        if (allKeys.length > 0) {
          console.warn('[Storage] Attempting to clear corrupted storage...');
          await AsyncStorage.multiRemove(allKeys);
          console.log('[Storage] Cleared storage, app will use defaults');
        }
      }
    } catch (recoveryError) {
      console.error('[Storage] Recovery attempt failed:', recoveryError);
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      if (this.isStorageCorruptionError(error)) {
        this.errorCount++;
        console.error(`[Storage] Corrupted storage detected (${this.errorCount}/${this.MAX_ERRORS}):`, error);
        
        if (this.errorCount >= this.MAX_ERRORS) {
          console.warn('[Storage] Too many storage errors, attempting recovery...');
          await this.attemptStorageRecovery();
          this.errorCount = 0; // Reset after recovery attempt
        }
      } else {
        console.error('[Storage] Error getting item:', error);
      }
      // Return null on error - app will use defaults
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
      // Reset error count on successful write
      if (this.errorCount > 0) {
        this.errorCount = 0;
      }
    } catch (error) {
      if (this.isStorageCorruptionError(error)) {
        this.errorCount++;
        console.error(`[Storage] Corrupted storage detected (${this.errorCount}/${this.MAX_ERRORS}):`, error);
        
        if (this.errorCount >= this.MAX_ERRORS) {
          console.warn('[Storage] Too many storage errors, attempting recovery...');
          await this.attemptStorageRecovery();
          this.errorCount = 0;
        }
      } else {
        console.error('[Storage] Error setting item:', error);
      }
      // Silently fail - app will continue without persisting this value
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      if (this.isStorageCorruptionError(error)) {
        console.error('[Storage] Corrupted storage detected during remove:', error);
      } else {
        console.error('[Storage] Error removing item:', error);
      }
      // Silently fail
    }
  }

  async getAllKeys(): Promise<readonly string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      if (this.isStorageCorruptionError(error)) {
        console.error('[Storage] Corrupted storage detected during getAllKeys:', error);
      } else {
        console.error('[Storage] Error getting all keys:', error);
      }
      return [];
    }
  }

  async multiRemove(keys: string[]): Promise<void> {
    try {
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      if (this.isStorageCorruptionError(error)) {
        console.error('[Storage] Corrupted storage detected during multiRemove:', error);
      } else {
        console.error('[Storage] Error in multiRemove:', error);
      }
      // Silently fail
    }
  }

  /**
   * Clear all storage (useful for recovery)
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
      this.errorCount = 0;
      console.log('[Storage] Storage cleared successfully');
    } catch (error) {
      console.error('[Storage] Error clearing storage:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const safeStorage = SafeStorage.getInstance();

// Export as default for compatibility
export default safeStorage;
