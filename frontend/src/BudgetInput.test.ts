import { describe, expect, it } from 'vitest';
import { budgetCaret, formatBudget, readBudget } from './BudgetInput';

describe('readable budget input', () => {
 it.each([['1000000', '1 000 000'], ['500000', '500 000'], ['1000', '1 000'], ['999', '999'], ['', '']])('groups %s as %s', (digits, expected) => expect(formatBudget(digits)).toBe(expected));
 it('accepts pasted ordinary and nonbreaking separators without changing amount', () => {
  expect(readBudget('1 000\u00a0000')).toBe('1000000');
  expect(readBudget('1\u202f000')).toBe('1000');
 });
 it.each(['-1000', '1.5', '1e6', '500₸'])('does not silently change invalid amount %s', value => expect(readBudget(value)).toBeNull());
 it('keeps the caret next to the edited digit when grouping shifts', () => {
  expect(budgetCaret('12 345 678', 3)).toBe(4);
  expect(budgetCaret('1 000 000', 0)).toBe(0);
  expect(budgetCaret('1 000 000', 7)).toBe(9);
 });
});
