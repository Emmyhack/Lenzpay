import { useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'lenzpay_pin_hash';

// Lightweight non-cryptographic hash — good enough to avoid storing the raw
// PIN at rest. Swap for a proper bcrypt/argon2 call once a native module or
// backend endpoint is wired in; expo-secure-store itself is already
// hardware-backed on both platforms.
function hashPIN(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = (hash << 5) - hash + pin.charCodeAt(i);
    hash |= 0;
  }
  return `h${hash}`;
}

export function usePIN() {
  const createPIN = useCallback(async (pin: string) => {
    await SecureStore.setItemAsync(PIN_KEY, hashPIN(pin));
  }, []);

  const verifyPIN = useCallback(async (pin: string) => {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    return stored === hashPIN(pin);
  }, []);

  const changePIN = useCallback(async (currentPin: string, newPin: string) => {
    const isValid = await verifyPIN(currentPin);
    if (!isValid) return false;
    await SecureStore.setItemAsync(PIN_KEY, hashPIN(newPin));
    return true;
  }, [verifyPIN]);

  const hasPIN = useCallback(async () => {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    return stored !== null;
  }, []);

  return { createPIN, verifyPIN, changePIN, hasPIN };
}
