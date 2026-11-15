import { Stack } from 'expo-router';

export default function HomeStackLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true }}>
      <Stack.Screen name="index" options={{ title: 'Ideas' }} />
      {/* Titles come from the screen: the folder's name, "Favorites". */}
      <Stack.Screen name="folder/[id]" options={{ title: '' }} />
      <Stack.Screen name="favorites" options={{ title: 'Favorites' }} />
    </Stack>
  );
}
