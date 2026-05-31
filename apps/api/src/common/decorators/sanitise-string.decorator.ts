import { Transform } from 'class-transformer';

const HTML_CHAR_MAP: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#x27;',
  '"': '&quot;',
};

function sanitise(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/[<>'"]/g, (c) => HTML_CHAR_MAP[c] ?? c); // escape remaining chars
}

export function SanitiseString() {
  return Transform(({ value }: { value: unknown }) => sanitise(value));
}
