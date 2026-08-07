export type KYCStatus = 'unstarted' | 'pending' | 'verified' | 'rejected';

export type BiometricPref = 'faceId' | 'fingerprint' | 'none';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
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
