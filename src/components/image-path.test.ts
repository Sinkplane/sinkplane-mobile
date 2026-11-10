import { imagePath } from '@/components/image-path';

describe('imagePath', () => {
  it('returns the path of an image', () => {
    expect(imagePath({ path: 'https://example.com/a.jpg' })).toBe('https://example.com/a.jpg');
  });

  it('returns undefined for a missing image or path', () => {
    expect(imagePath(undefined)).toBeUndefined();
    expect(imagePath(null)).toBeUndefined();
    expect(imagePath({ path: null })).toBeUndefined();
    expect(imagePath({})).toBeUndefined();
    expect(imagePath({ path: '' })).toBeUndefined();
  });
});
