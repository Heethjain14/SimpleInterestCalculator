/**
 * Device-only storage for PAN numbers, backed by the OS secure store (iOS Keychain /
 * Android Keystore). PANs are never written to AsyncStorage or Firestore. Not available
 * on web, where callers must fall back to not persisting PANs.
 */
import * as SecureStore from 'expo-secure-store';

// THIS_DEVICE_ONLY keeps items out of iCloud/device-migration backups.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const keyFor = (id: string) => `pan_${id}`;

export async function isAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Returns the stored PAN, or null if none / unreadable. Never logs the value. */
export async function getPan(id: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(keyFor(id), OPTIONS);
  } catch {
    return null;
  }
}

/** True when a PAN is stored for this id (without needing to unlock anything). */
export async function hasPan(id: string): Promise<boolean> {
  return (await getPan(id)) !== null;
}

export async function setPan(id: string, pan: string): Promise<void> {
  await SecureStore.setItemAsync(keyFor(id), pan, OPTIONS);
}

export async function deletePan(id: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(keyFor(id), OPTIONS);
  } catch {
    // Nothing stored, or store unavailable; either way there is nothing left to remove.
  }
}
