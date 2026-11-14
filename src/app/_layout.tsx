import { Stack } from 'expo-router';

import { AppProviders } from '@/components/app-providers';
import { ErrorScreen } from '@/components/error-screen';
import { initAppearance } from '@/features/settings/appearance-store';

// One-time app startup work belongs here, at module scope (runs once before the first render).
initAppearance();

/** Catches render errors in any route below the root. */
export const ErrorBoundary = ErrorScreen;

export const unstable_settings = {
  // Deep links that land on a non-tab route still get the tabs underneath to go back to.
  anchor: '(tabs)',
};

export default function RootLayout() {
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
        <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
      </Stack>
    </AppProviders>
  );
}
