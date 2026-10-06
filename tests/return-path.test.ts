import { expect, it } from 'vitest';
import { safeReturnTo } from '../client/src/return-path.js';
it('preserves internal lesson/query/hash paths and rejects external or malformed callback state', () => {
  for (const value of [
    undefined,
    null,
    {},
    42,
    'https://attacker.invalid',
    '//attacker.invalid',
    '/\\attacker.invalid',
    '/\n/attacker.invalid',
    '\\attacker.invalid',
    'sample',
  ])
    expect(safeReturnTo(value)).toBe('/library');
  expect(safeReturnTo('/sample/lessons/lesson?from=library#quiz')).toBe(
    '/sample/lessons/lesson?from=library#quiz',
  );
  expect(safeReturnTo('/courses/one/../two')).toBe('/courses/two');
});
