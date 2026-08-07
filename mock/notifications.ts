export type NotificationKind = 'fraud' | 'payment' | 'points';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  timestamp: Date;
}

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'ntf_001',
    kind: 'payment',
    title: 'Payment sent',
    body: '₦2,800 to Bolt Ride via Access Bank.',
    timestamp: new Date(),
  },
  {
    id: 'ntf_002',
    kind: 'points',
    title: 'Points earned',
    body: '+14 pts from your Bolt Ride payment.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: 'ntf_003',
    kind: 'fraud',
    title: 'Unusual activity flagged',
    body: 'A payment attempt from a new device was blocked.',
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000),
  },
  {
    id: 'ntf_004',
    kind: 'payment',
    title: 'Smart Split used',
    body: '₦18,400 to Shoprite Lekki across 2 sources.',
    timestamp: new Date(Date.now() - 30 * 60 * 60 * 1000),
  },
];
