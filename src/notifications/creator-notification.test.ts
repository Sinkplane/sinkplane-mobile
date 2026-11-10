import {
  notificationForPost,
  parseCreatorNotification,
  POST_RELEASE_EVENT,
} from '@/notifications/creator-notification';

describe('parseCreatorNotification', () => {
  const release = {
    eventType: POST_RELEASE_EVENT,
    title: 'New post from LTT',
    message: 'A video',
    creator: 'creator-1',
  };

  it('maps a post release to a notification that opens the post', () => {
    expect(parseCreatorNotification({ ...release, id: 'srv-1', content: 'post-1' })).toEqual({
      id: 'post:post-1',
      title: 'New post from LTT',
      body: 'A video',
      creatorId: 'creator-1',
      postId: 'post-1',
    });
  });

  it('finds the post id in the post object or the target URL', () => {
    expect(parseCreatorNotification({ ...release, post: { id: 'post-2' } })?.postId).toBe('post-2');
    expect(
      parseCreatorNotification({
        ...release,
        target: { url: 'https://www.floatplane.com/post/Ab3_x-Z' },
      })?.postId,
    ).toBe('Ab3_x-Z');
    expect(
      parseCreatorNotification({ ...release, target: { url: '/channel/ltt/home' }, id: 'srv-3' })
        ?.postId,
    ).toBeNull();
  });

  it('keeps other event types as plain notifications', () => {
    expect(
      parseCreatorNotification({
        eventType: 'CONTENT_LIVESTREAM_START',
        id: 'live-1',
        title: 'Live now',
        content: 'x',
      }),
    ).toEqual({
      id: 'live-1',
      title: 'Live now',
      body: '',
      creatorId: null,
      postId: null,
    });
  });

  it('falls back to the post title and a generic title', () => {
    expect(
      parseCreatorNotification({
        ...release,
        title: '  ',
        message: undefined,
        post: { id: 'p', title: 'Post Title' },
      }),
    ).toMatchObject({
      title: 'Floatplane',
      body: 'Post Title',
    });
  });

  it('rejects payloads with nothing to show or no id', () => {
    expect(parseCreatorNotification(null)).toBeNull();
    expect(parseCreatorNotification('nope')).toBeNull();
    expect(parseCreatorNotification({ eventType: POST_RELEASE_EVENT, content: 'p' })).toBeNull();
    expect(parseCreatorNotification({ eventType: 'OTHER', title: 'No id' })).toBeNull();
    expect(
      parseCreatorNotification({ ...release, target: { url: 42 as unknown as string } }),
    ).toBeNull();
  });
});

describe('notificationForPost', () => {
  it('builds the same id a live notification would', () => {
    expect(notificationForPost({ id: 'post-1', title: 'A video' }, 'LTT', 'creator-1')).toEqual({
      id: 'post:post-1',
      title: 'New post from LTT',
      body: 'A video',
      creatorId: 'creator-1',
      postId: 'post-1',
    });
    expect(
      notificationForPost({ id: 'post-1', title: 'A video' }, undefined, 'creator-1').title,
    ).toBe('New post');
  });
});
