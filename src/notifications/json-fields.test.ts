import {
  arrayField,
  booleanField,
  isJsonObject,
  numberField,
  objectField,
  stringField,
} from '@/notifications/json-fields';

const OBJECT = { obj: { a: 1 }, list: [1, 'x'], str: 's', num: 3, bool: false, nil: null };

describe('isJsonObject', () => {
  it('accepts objects (and arrays) but not null or primitives', () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject([])).toBe(true);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject('x')).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
  });
});

describe('field readers', () => {
  it('return the field when it has the expected type', () => {
    expect(objectField(OBJECT, 'obj')).toEqual({ a: 1 });
    expect(arrayField(OBJECT, 'list')).toEqual([1, 'x']);
    expect(stringField(OBJECT, 'str')).toBe('s');
    expect(numberField(OBJECT, 'num')).toBe(3);
    expect(booleanField(OBJECT, 'bool')).toBe(false);
  });

  it('fall back when the field is missing or has another type', () => {
    expect(objectField(OBJECT, 'nil')).toEqual({});
    expect(objectField(OBJECT, 'missing')).toEqual({});
    expect(arrayField(OBJECT, 'obj')).toEqual([]);
    expect(stringField(OBJECT, 'num')).toBeUndefined();
    expect(numberField(OBJECT, 'str')).toBeUndefined();
    expect(booleanField(OBJECT, 'nil')).toBeUndefined();
  });
});
