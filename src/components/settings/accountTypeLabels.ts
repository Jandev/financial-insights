import type { PersonalAccount } from '@/types/personalAccount'

export const ACCOUNT_TYPE_LABELS: Record<PersonalAccount['type'], string> = {
  payment: 'Payment',
  savings: 'Savings',
  joint: 'Joint',
  other: 'Other',
}
