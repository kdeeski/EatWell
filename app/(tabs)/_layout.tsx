import { Tabs } from 'expo-router';

// Tab bar icons use simple text labels for now — replace with icons in next sprint
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3B7A57',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          paddingBottom: 8,
          paddingTop: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarLabel: 'Today' }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: 'This Week', tabBarLabel: 'This Week' }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ title: 'Shopping', tabBarLabel: 'Shopping' }}
      />
      <Tabs.Screen
        name="garden"
        options={{ title: 'Garden', tabBarLabel: 'Garden' }}
      />
    </Tabs>
  );
}
