import React, { useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, View, TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import { StorageProvider } from './src/context/StorageContext';
import { PanVaultProvider } from './src/context/PanVaultContext';
import Sidebar from './src/components/Sidebar';
import Dashboard from './src/screens/Dashboard';
import DuePaymentsList from './src/screens/DuePaymentsList';
import SimpleInterestCalculator from './src/screens/SimpleInterestCalculator';
import EmiCalculator from './src/screens/EmiCalculator';
import BorrowerList from './src/screens/BorrowerList';
import { Screen, SCREEN_SUBTITLES, NAV_ITEMS } from './src/navigation/screens';
import { colors, radii } from './src/theme/tokens';
import { installWebAlert } from './src/utils/webAlert';

installWebAlert();

// Re-export for ShareResultCard backward compatibility
export type { CalculationResult } from './src/screens/SimpleInterestCalculator';

function AppShell() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const activeNav = NAV_ITEMS.find(n => n.key === screen);

  const handleOpenClient = (borrowerId: string) => {
    setSelectedClientId(borrowerId);
    setScreen('clients');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':
        return <Dashboard />;
      case 'due':
        return <DuePaymentsList onOpenClient={handleOpenClient} />;
      case 'simple':
        return <SimpleInterestCalculator />;
      case 'emi':
        return <EmiCalculator />;
      case 'clients':
        return (
          <BorrowerList
            initialSelectedId={selectedClientId}
            onSelectedClientHandled={() => setSelectedClientId(null)}
          />
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <SafeAreaView style={[
      styles.container,
      { position: 'relative' }, // Establish positioning context for absolute children
    ]}>
      {/* Main content - renders behind sidebar when open */}
      <View style={styles.contentContainer}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{activeNav?.label ?? 'Interest Calculator'}</Text>
            <Text style={styles.subtitle}>{SCREEN_SUBTITLES[screen]}</Text>
          </View>
        </View>

        <View style={styles.content}>
          {renderScreen()}
        </View>
      </View>

      {/* Sidebar - overlays content when open */}
      <Sidebar
        visible={sidebarOpen}
        activeScreen={screen}
        onSelect={setScreen}
        onClose={() => setSidebarOpen(false)}
      />
    </SafeAreaView>
  );
}

/** Root app with sliding sidebar navigation and shared storage context. */
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/** Shows the login screen until a user is signed in, then mounts storage scoped to that user. */
function AuthGate() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <StorageProvider key={user.uid} uid={user.uid}>
      <PanVaultProvider>
        <AppShell />
      </PanVaultProvider>
    </StorageProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  contentContainer: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuIcon: { fontSize: 16, color: colors.ink2, fontWeight: '700' },
  headerText: { flex: 1 },
  title: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, color: colors.ink2, marginTop: 1 },
  content: { flex: 1 },
});
