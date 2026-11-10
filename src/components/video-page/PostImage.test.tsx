import { render, screen } from '@testing-library/react-native';

import {
  isTextOnly,
  PostImage,
  postImageUri,
  type MediaPost,
} from '@/components/video-page/PostImage';

const picturePost: MediaPost = {
  title: 'Gallery',
  thumbnail: { path: 'https://cdn.test/thumb.jpg' },
  pictureAttachments: [{ thumbnail: { path: 'https://cdn.test/picture.jpg' } }],
  videoAttachments: [],
};

const textPost: MediaPost = {
  title: 'Just words',
  thumbnail: null,
  pictureAttachments: [],
  videoAttachments: [],
};

describe('postImageUri', () => {
  it('prefers the first picture attachment', () => {
    expect(postImageUri(picturePost)).toBe('https://cdn.test/picture.jpg');
  });

  it('falls back to the post thumbnail', () => {
    expect(
      postImageUri({ title: 'Cover only', thumbnail: { path: 'https://cdn.test/thumb.jpg' } }),
    ).toBe('https://cdn.test/thumb.jpg');
  });

  it('is undefined without any image', () => {
    expect(postImageUri(textPost)).toBeUndefined();
  });
});

describe('isTextOnly', () => {
  it('is false while the post is loading', () => {
    expect(isTextOnly(undefined)).toBe(false);
  });

  it('is false for video and picture posts', () => {
    expect(isTextOnly({ ...textPost, videoAttachments: [{}] })).toBe(false);
    expect(isTextOnly(picturePost)).toBe(false);
  });

  it('is true without a video or picture', () => {
    expect(isTextOnly(textPost)).toBe(true);
    expect(isTextOnly({ title: 'Bare' })).toBe(true);
  });
});

describe('PostImage', () => {
  it('shows the post picture, labelled with the title', async () => {
    await render(<PostImage post={picturePost} />);

    expect(screen.getByTestId('post-image')).toBeTruthy();
    expect(screen.getByLabelText('Gallery')).toBeTruthy();
  });

  it('renders nothing for a text-only post', async () => {
    await render(<PostImage post={textPost} />);

    expect(screen.queryByTestId('post-image')).toBeNull();
  });
});
