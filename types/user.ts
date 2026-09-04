export type KYCStatus = 'unstarted' | 'pending' | 'verified' | 'rejected';

export type BiometricPref = 'faceId' | 'fingerprint' | 'none';

/** How this account was created. Phone stays the payment identity either way. */
export type AuthProviderKind = 'phone' | 'google';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  /**
   * Whether the email has actually been proven, as opposed to merely typed.
   * Google asserts this; a self-entered address has not been verified and must
   * not be treated as though it has.
   */
  emailVerified?: boolean;
  /** Google's stable user id, when the account was created that way. */
  googleId?: string;
  authProvider?: AuthProviderKind;
  avatarInitials: string;
  kycStatus: KYCStatus;
  biometricPref: BiometricPref;
  referralCode: string;
  createdAt: Date;
}

export interface AuthSession {
  user: User | null;
  isAuthenticated: boolean;
  hasPIN: boolean;
  hasCompletedOnboarding: boolean;
}
