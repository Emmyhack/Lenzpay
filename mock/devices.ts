import type { IconName } from '@/components/ui/Icon';

export interface TrustedDevice {
  id: string;
  name: string;
  location: string;
  lastActive: Date;
  isCurrent: boolean;
  icon: IconName;
}

export const MOCK_DEVICES: TrustedDevice[] = [
  {
    id: 'dev_001',
    name: 'iPhone 15 Pro',
    location: 'Lagos, NG',
    lastActive: new Date(),
    isCurrent: true,
    icon: 'phone-portrait-outline',
  },
  {
    id: 'dev_002',
    name: 'MacBook Pro',
    location: 'Lagos, NG',
    lastActive: new Date(Date.now() - 2 * 86_400_000),
    isCurrent: false,
    icon: 'laptop-outline',
  },
  {
    id: 'dev_003',
    name: 'Unknown Android device',
    location: 'Abuja, NG',
    lastActive: new Date(Date.now() - 3 * 3_600_000),
    isCurrent: false,
    icon: 'help-circle-outline',
  },
];
