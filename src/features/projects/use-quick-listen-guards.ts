import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { stopQuickListen, useQuickListenStore } from './quick-listen';

/**
 * When quick listen (T48) must stop, for a screen that shows idea rows: the screen loses focus
 * (opening an idea, a folder, a sheet, another tab) or unmounts, the app leaves the foreground,
 * select mode starts, or the playing idea is gone from `ideaIds` (deleted). Interruptions are the
 * engine's, handled in `quick-listen.ts`. `ideaIds` is every live idea (`undefined` while loading).
 */
export function useQuickListenGuards(ideaIds: readonly string[] | undefined, selecting: boolean) {
  useFocusEffect(
    useCallback(
      () => () => {
        stopQuickListen();
      },
      [],
    ),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopQuickListen();
    });
    return () => subscription.remove();
  }, []);

  const playing = useQuickListenStore((state) => state.ideaId);
  const gone = playing !== null && !!ideaIds && !ideaIds.includes(playing);
  useEffect(() => {
    if (selecting || gone) stopQuickListen();
  }, [selecting, gone]);
}
