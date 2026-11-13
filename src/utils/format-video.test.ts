import {
  formatCount,
  formatDuration,
  formatRelativeDate,
  htmlToSegments,
  htmlToText,
} from '@/utils/format-video';

describe('htmlToText', () => {
  it.each([
    [undefined, ''],
    [null, ''],
    ['', ''],
    ['<p>Hello <strong>world</strong></p>', 'Hello world'],
    ['<p>One</p><p>Two</p>', 'One\nTwo'],
    ['Line<br>break<br/>again<br />', 'Line\nbreak\nagain'],
    ['<p>A</p>\n\n\n\n<p>B</p>', 'A\n\nB'],
    ['Tom &amp; Jerry &lt;3 &quot;hi&quot; &apos;yo&apos;&nbsp;!', 'Tom & Jerry <3 "hi" \'yo\' !'],
    ['&#169; &#x1F383; &#ab; &bogus;', '© 🎃 &#ab; &bogus;'],
    ['&#9;&#10;x&#8; &#1114111;&#1114112;', 'x&#8; \u{10FFFF}&#1114112;'],
    ['<a href="https://x.test">link</a>   \n tail', 'link\n tail'],
    ['1 < 2 <b>x</b> and 3 < 4', '1 x and 3 < 4'],
  ])('converts %p to %p', (html, expected) => {
    expect(htmlToText(html)).toBe(expected);
  });
});

describe('htmlToSegments', () => {
  it.each([
    [undefined, []],
    [null, []],
    ['', []],
    ['<p>Just text</p>', [{ text: 'Just text' }]],
    [
      '<p>Watch <a href="https://www.floatplane.com/post/abc">part 1</a> first.</p>',
      [
        { text: 'Watch ' },
        { text: 'part 1', href: 'https://www.floatplane.com/post/abc' },
        { text: ' first.' },
      ],
    ],
    [
      "<a target='_blank' href='https://x.test/?a=1&amp;b=2'><b>A &amp; B</b></a>",
      [{ text: 'A & B', href: 'https://x.test/?a=1&b=2' }],
    ],
    [
      '<a href=/post/xyz>one</a><a href="/two">two</a>',
      [
        { text: 'one', href: '/post/xyz' },
        { text: 'two', href: '/two' },
      ],
    ],
    ['<a name="top">anchor</a> <a href="">empty</a>', [{ text: 'anchor empty' }]],
    ['<abbr href="x">abbr</abbr>', [{ text: 'abbr' }]],
    [
      '<a href="x"><a href="y">nested</a> after</a>',
      [{ text: 'nested', href: 'x' }, { text: ' after' }],
    ],
    ['<a href="x">unclosed', [{ text: 'unclosed', href: 'x' }]],
    ['<a href="x"></a>text', [{ text: 'text' }]],
    ['a\u0001b\u0002c &#1;&#2;', [{ text: 'abc &#1;&#2;' }]],
  ])('splits %p into %p', (html, expected) => {
    expect(htmlToSegments(html)).toEqual(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [599.9, '9:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [36_000 + 61, '10:01:01'],
  ])('formats %p seconds as %p', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1.0K'],
    [1500, '1.5K'],
    [999_999, '1000.0K'],
    [1_000_000, '1.0M'],
    [3_400_000, '3.4M'],
  ])('formats %p as %p', (count, expected) => {
    expect(formatCount(count)).toBe(expected);
  });
});

describe('formatRelativeDate', () => {
  const now = new Date('2026-10-28T12:00:00.000Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('returns an empty string for missing or unparseable dates', () => {
    expect(formatRelativeDate(null, now)).toBe('');
    expect(formatRelativeDate('', now)).toBe('');
    expect(formatRelativeDate('not a date', now)).toBe('');
  });

  it('says "just now" for anything under a minute (including future dates)', () => {
    expect(formatRelativeDate(ago(0), now)).toBe('just now');
    expect(formatRelativeDate(ago(59 * 1000), now)).toBe('just now');
    expect(formatRelativeDate(ago(-HOUR), now)).toBe('just now');
  });

  it.each([
    [MINUTE, '1 minute ago'],
    [45 * MINUTE, '45 minutes ago'],
    [HOUR, '1 hour ago'],
    [20 * HOUR, '20 hours ago'],
    [DAY, '1 day ago'],
    [6 * DAY, '6 days ago'],
    [7 * DAY, '1 week ago'],
    [29 * DAY, '4 weeks ago'],
    [30 * DAY, '1 month ago'],
    [364 * DAY, '12 months ago'],
    [365 * DAY, '1 year ago'],
    [3 * 365 * DAY, '3 years ago'],
  ])('formats %pms ago as %p', (elapsed, expected) => {
    expect(formatRelativeDate(ago(elapsed), now)).toBe(expected);
  });

  it('defaults to the current time', () => {
    jest.useFakeTimers({ now });
    try {
      expect(formatRelativeDate(ago(2 * DAY))).toBe('2 days ago');
    } finally {
      jest.useRealTimers();
    }
  });
});
