import { get } from 'lodash';

export interface FieldMapping {
  phone: string;
  amount: string;
  customerName?: string;
  categorySlug?: string;
  transactionId?: string;
  occurredAt?: string;
}

export interface NormalisedTransaction {
  phone: string;
  amount: string;
  customerName: string;
  categorySlug: string;
  externalTransactionId: string;
  occurredAt: string;
}

export function getStr(obj: Record<string, unknown>, path: string): string {
  const val = path ? get(obj, path) : undefined;
  if (val === null || val === undefined || typeof val === 'object') return '';
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(val);
}

export function applyMapping(
  rawPayload: Record<string, unknown>,
  fieldMapping: FieldMapping,
): NormalisedTransaction {
  return {
    phone: getStr(rawPayload, fieldMapping.phone),
    amount: getStr(rawPayload, fieldMapping.amount),
    customerName: getStr(rawPayload, fieldMapping.customerName ?? ''),
    categorySlug: getStr(rawPayload, fieldMapping.categorySlug ?? ''),
    externalTransactionId: getStr(rawPayload, fieldMapping.transactionId ?? ''),
    occurredAt: getStr(rawPayload, fieldMapping.occurredAt ?? ''),
  };
}

export function extractTransactions(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === 'object') {
    const keys = [
      'transactions',
      'data',
      'items',
      'results',
      'records',
    ] as const;
    for (const key of keys) {
      const val = (body as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  return [];
}
