import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';

import EditScreenInfo from '@/components/EditScreenInfo';
import { supabase } from '../../lib/supabase';
import { ThemedGradient } from '@/components/ThemedGradient';
import { useTheme } from '@/contexts/ThemeContext';
import Colors from '@/constants/Colors';

export default function TabOneScreen() {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <ThemedGradient style={styles.container}>
      <View style={[styles.content, { backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.title, { color: colors.text }]}>Welcome to SkedAI</Text>
        <View style={[styles.separator, { backgroundColor: colors.borderColor }]} />
        <EditScreenInfo path="app/(tabs)/index.tsx" />
        
        <TouchableOpacity style={[styles.signOutButton, { backgroundColor: colors.tint }]} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ThemedGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  signOutButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '600',
  },
});
