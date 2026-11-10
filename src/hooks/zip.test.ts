import { zip } from '@/hooks/zip';

describe('zip', () => {
  it('pairs items by index', () => {
    expect(zip(['a', 'b'], [1, 2])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('stops at the shorter list', () => {
    expect(zip(['a', 'b'], [1])).toEqual([['a', 1]]);
    expect(zip(['a'], [1, 2])).toEqual([['a', 1]]);
  });
});
