import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const require: any;

/**
 * Sessiya tokeni uchun xavfsiz saqlash:
 *  - iOS/Android: Keychain / Android Keystore (expo-secure-store)
 *  - Web: brauzerda shifrlangan saqlash imkoni yo'q, shuning uchun AsyncStorage (localStorage) ishlatiladi.
 *    Web uchun server tomonida qat'iy CSP va qisqa muddatli token tavsiya etiladi.
 */
let SecureStore: any = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch {
    SecureStore = null;
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (SecureStore) return SecureStore.getItemAsync(key);
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (SecureStore) return SecureStore.setItemAsync(key, value);
    return AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (SecureStore) await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key); // eski (v1.0) ochiq saqlangan tokenni ham tozalaydi
  },
};
