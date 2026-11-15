import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { AppProviders } from '@/components/app-providers';
import { ErrorScreen } from '@/components/error-screen';
import { forgetTakes } from '@/features/audio/audio-engine';
import { projectKeys } from '@/features/projects/queries';
import { purgeExpired } from '@/features/projects/trash-repo';
import { initAppearance } from '@/features/settings/appearance-store';
import { queryClient } from '@/lib/query-client';

// One-time app startup work belongs here, at module scope (runs once before the first render).
initAppearance();

/** Catches render errors in any route below the root. */
export const ErrorBoundary = ErrorScreen;

export const unstable_settings = {
  // Deep links that land on a non-tab route still get the tabs underneath to go back to.
  anchor: '(tabs)',
};

export default function RootLayout() {
  // Recently Deleted (T41): items older than 30 days are deleted for good at launch.
  useEffect(() => {
    purgeExpired()
      .then((takePaths) => {
        if (takePaths.length === 0) return;
        forgetTakes(takePaths);
        return queryClient.invalidateQueries({ queryKey: projectKeys.all });
      })
      .catch(() => {});
  }, []);

  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="project/[id]"
          options={{ headerShown: true, title: '', headerBackButtonDisplayMode: 'minimal' }}
        />
        <Stack.Screen
          name="track/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.4],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="idea-settings/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.9],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="new-section"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 0.9],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="section-notes/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 0.9],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="clip-options/[id]"
          options={{
            presentation: 'formSheet',
            // Low enough that the clip being edited stays in view above it.
            sheetAllowedDetents: [0.55, 0.9],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="idea-notes/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 0.9],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="pitch-keyboard"
          options={{
            presentation: 'formSheet',
            // Short, so the timeline stays in view to play along with playback.
            sheetAllowedDetents: [0.45],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="move-to"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 0.9],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
      </Stack>
    </AppProviders>
  );
}
