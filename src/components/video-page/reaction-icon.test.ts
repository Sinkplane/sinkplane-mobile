import { reactionIcon } from '@/components/video-page/reaction-icon';

describe('reactionIcon', () => {
  it('fills the icon of the active reaction', () => {
    expect(reactionIcon('like', true)).toEqual({
      ios: 'hand.thumbsup.fill',
      android: 'thumb_up',
      web: 'thumb_up',
    });
    expect(reactionIcon('dislike', true)).toEqual({
      ios: 'hand.thumbsdown.fill',
      android: 'thumb_down',
      web: 'thumb_down',
    });
  });

  it('outlines the icon of an inactive reaction', () => {
    expect(reactionIcon('like', false)).toEqual({
      ios: 'hand.thumbsup',
      android: 'thumb_up',
      web: 'thumb_up',
    });
    expect(reactionIcon('dislike', false)).toEqual({
      ios: 'hand.thumbsdown',
      android: 'thumb_down',
      web: 'thumb_down',
    });
  });
});
