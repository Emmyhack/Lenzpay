export interface FraudAlert {
  id: string;
  amountNGN: number;
  payeeName: string;
  occurredAt: Date;
  reasons: string[];
  blocked: boolean;
}

