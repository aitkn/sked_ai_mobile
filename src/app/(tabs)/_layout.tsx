import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedIcon from '@/components/ThemedIcon';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  const { actualTheme } = useTheme();
  
  return (
    <View style={{
      backgroundColor: actualTheme === 'dark' 
        ? 'rgba(255, 255, 255, 0.05)' 
        : 'rgba(0, 0, 0, 0.02)',
      borderRadius: 8,
      padding: 4,
    }}>
      <FontAwesome 
        size={28} 
        style={{ 
          marginBottom: -3,
          opacity: 0.9,
          textShadowColor: actualTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 2,
        }} 
        {...props} 
      />
    </View>
  );
}

export default function TabLayout() {
  const { actualTheme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[actualTheme].tint,
        tabBarInactiveTintColor: Colors[actualTheme].tabIconDefault,
        tabBarStyle: {
          backgroundColor: actualTheme === 'dark' ? 'rgba(20, 20, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderTopColor: Colors[actualTheme].borderColor,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerStyle: {
          backgroundColor: 'transparent',
        },
        headerTintColor: Colors[actualTheme].text,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <ThemedIcon
                    name="info-circle"
                    size={25}
                    color={Colors[actualTheme].text}
                    glassIntensity="light"
                    containerStyle={{ 
                      marginRight: 15, 
                      opacity: pressed ? 0.5 : 1,
                      padding: 6
                    }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Task View',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scheduled-tasks"
        options={{
          title: "Today's Tasks",
          tabBarIcon: ({ color }) => <TabBarIcon name="check-square-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="dev"
        options={{
          title: 'Dev',
          tabBarIcon: ({ color }) => <TabBarIcon name="wrench" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
    </Tabs>
  );
}
