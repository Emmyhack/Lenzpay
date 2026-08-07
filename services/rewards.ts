import { api } from './api';
import { delay } from '@/mock/delay';
import { Config } from '@/constants/config';
import type { Redemption, RedemptionMethod } from '@/types/rewards';

export async function redeemPoints(method: RedemptionMethod, points: number): Promise<Redemption> {
  if (Config.useMockData) {
    await delay(500, 900);
    return {
      id: `rdm_${Date.now()}`,
      method,
      pointsSpent: points,
      valueNGN: Math.floor(points / 2), // 2 pts = ₦1
      timestamp: new Date(),
      status: 'completed',
    };
  }
  const { data } = await api.post<Redemption>('/rewards/redeem', { method, points });
  return data;
}
