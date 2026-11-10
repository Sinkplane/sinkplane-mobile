import { isNonEmpty } from '@/hooks/is-non-empty';

describe('isNonEmpty', () => {
  it('accepts a non-empty string', () => {
    expect(isNonEmpty('tok')).toBe(true);
  });

  it.each([undefined, null, ''])('rejects %p', (value) => {
    expect(isNonEmpty(value)).toBe(false);
  });
});
