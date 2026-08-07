import { useCallback, useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

export interface BiometricCapability {
  isSupported: boolean;
  isEnrolled: boolean;
  type: 'faceId' | 'fingerprint' | 'none';
}

/**
 * Thin abstraction over expo-local-authentication: reports what the device
 * actually supports and exposes a single `authenticate()` call for gates
 * (scan/confirm.tsx, security PIN change, etc).
 */
export function useBiometrics() {
  const [capability, setCapability] = useState<BiometricCapability>({
    isSupported: false,
    isEnrolled: false,
    type: 'none',
  });

  useEffect(() => {
    (async () => {
      const isSupported = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

      const type = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
        ? 'faceId'
        : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
          ? 'fingerprint'
          : 'none';

      setCapability({ isSupported, isEnrolled, type });
    })();
  }, []);

  const authenticate = useCallback(async (promptMessage = 'Confirm it’s you') => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use PIN instead',
      disableDeviceFallback: true,
    });
    return result.success;
  }, []);

  return { ...capability, authenticate };
}
