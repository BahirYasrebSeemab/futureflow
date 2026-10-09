export const signed = (n: number): string => (n < 0 ? `- ${-n}` : `+ ${n}`);

/** Formats p·x + q the way a textbook would: "3x - 2", "-x", "x + 4", "5". */
export function formatLinear(p: number, q: number, symbol = 'x'): string {
  if (p === 0) return String(q);
  const coefficient = p === 1 ? '' : p === -1 ? '-' : String(p);
  const lead = `${coefficient}${symbol}`;
  return q === 0 ? lead : `${lead} ${signed(q)}`;
}
