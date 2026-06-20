import { Platform, Share } from 'react-native';

export async function shareOrCopy(text: string): Promise<'shared' | 'copied'> {
  if (Platform.OS !== 'web') {
    await Share.share({ message: text });
    return 'shared';
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return 'copied';
  }

  throw new Error('Sharing is not supported on this browser.');
}
