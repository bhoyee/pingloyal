import { IsInt, Max, Min } from 'class-validator';

export class WalletTopupDto {
  @IsInt({ message: 'Amount must be a whole number (no decimals)' })
  @Min(1000, { message: 'Minimum top-up is ₦1,000' })
  @Max(10_000_000, { message: 'Maximum single top-up is ₦10,000,000' })
  amount: number;
}
