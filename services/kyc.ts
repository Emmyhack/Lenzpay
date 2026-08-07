import { api } from './api';
import { delay } from '@/mock/delay';
import { Config } from '@/constants/config';
import type { KYCStatus } from '@/types/user';

export interface KYCSubmission {
  bvn: string;
  idType: 'NIN' | 'Passport' | 'DriversLicense';
  idPhotoUri: string;
  selfiePhotoUri: string;
}

export async function submitKYC(submission: KYCSubmission): Promise<{ status: KYCStatus }> {
  if (Config.useMockData) {
    await delay(600, 1000);
    return { status: 'pending' };
  }
  const { data } = await api.post<{ status: KYCStatus }>('/kyc', submission);
  return data;
}

let mockPollCount = 0;

export async function fetchKYCStatus(): Promise<{ status: KYCStatus }> {
  if (Config.useMockData) {
    await delay(200, 400);
    mockPollCount += 1;
    // Resolve to verified after a few polls so kyc-pending.tsx has somewhere to go.
    return { status: mockPollCount >= 3 ? 'verified' : 'pending' };
  }
  const { data } = await api.get<{ status: KYCStatus }>('/kyc/status');
  return data;
}
