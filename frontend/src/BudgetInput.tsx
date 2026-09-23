import type { ChangeEvent, KeyboardEvent } from 'react';

export const formatBudget = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export function readBudget(value: string): string | null {
 return /^[\d\s]*$/.test(value) ? value.replace(/\s/g, '') : null;
}
export function budgetCaret(formatted: string, digitsBefore: number): number {
 if (!digitsBefore) return 0;
 let count = 0;
 for (let i = 0; i < formatted.length; i++) if (/\d/.test(formatted[i]) && ++count === digitsBefore) return i + 1;
 return formatted.length;
}

export function BudgetInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
 function commit(input: HTMLInputElement, digits: string, before: number) {
  onChange(digits);
  requestAnimationFrame(() => { if (document.activeElement === input) { const caret = budgetCaret(formatBudget(digits), before); input.setSelectionRange(caret, caret); } });
 }
 function change(event: ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  const digits = readBudget(input.value);
  if (digits === null) return;
  commit(input, digits, input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length);
 }
 function keyDown(event: KeyboardEvent<HTMLInputElement>) {
  const input = event.currentTarget, cursor = input.selectionStart;
  if (cursor === null || cursor !== input.selectionEnd) return;
  const backwards = event.key === 'Backspace' && input.value[cursor - 1] === ' ';
  const forwards = event.key === 'Delete' && input.value[cursor] === ' ';
  if (!backwards && !forwards) return;
  event.preventDefault();
  const before = input.value.slice(0, cursor).replace(/\D/g, '').length;
  const remove = backwards ? before - 1 : before;
  commit(input, value.slice(0, remove) + value.slice(remove + 1), backwards ? before - 1 : before);
 }
 return <input id="budget" type="text" inputMode="numeric" autoComplete="off" required value={formatBudget(value)} onChange={change} onKeyDown={keyDown}/>;
}
