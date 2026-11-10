import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { WIDESCREEN_ASPECT_RATIO } from '@/components/aspect-ratio';
import { imagePath, type ApiImage } from '@/components/image-path';

/** What the media slot reads from a post; the API can omit attachments and images. */
export interface MediaPost {
  readonly title: string;
  readonly thumbnail?: ApiImage | null;
  readonly pictureAttachments?: readonly { readonly thumbnail?: ApiImage | null }[] | null;
  readonly videoAttachments?: readonly unknown[] | null;
}

/** The first picture attachment's image, else the post thumbnail. */
export function postImageUri(post: MediaPost): string | undefined {
  const picture = post.pictureAttachments?.[0];
  return imagePath(picture?.thumbnail) ?? imagePath(post.thumbnail);
}

/** A loaded post with neither a video nor a picture: nothing to put in the player slot. */
export function isTextOnly(post: MediaPost | undefined): boolean {
  if (post === undefined) {
    return false;
  }
  return post.videoAttachments?.[0] === undefined && postImageUri(post) === undefined;
}

/** Media slot for posts without a video: picture posts show their image, text-only posts show nothing. */
export function PostImage({ post }: Readonly<{ post: MediaPost }>): ReactElement | null {
  const uri = postImageUri(post);
  if (uri === undefined) {
    return null;
  }
  return (
    <View testID="post-image" style={styles.postImage}>
      <Image
        source={uri}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        accessibilityLabel={post.title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  postImage: {
    width: '100%',
    aspectRatio: WIDESCREEN_ASPECT_RATIO,
    backgroundColor: '#000',
  },
});
