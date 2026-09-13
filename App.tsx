import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView,
} from 'react-native';
import Constants from 'expo-constants';
import { StorageProvider } from './src/context/StorageContext';
import Sidebar from './src/components/Sidebar';
import Dashboard from './src/screens/Dashboard';
import DuePaymentsList from './src/screens/DuePaymentsList';
import SimpleInterestCalculator from './src/screens/SimpleInterestCalculator';
import EmiCalculator from './src/screens/EmiCalculator';
import BorrowerList from './src/screens/BorrowerList';
import { Screen, SCREEN_SUBTITLES, NAV_ITEMS } from './src/navigation/screens';

// Re-export for ShareResultCard backward compatibility
export type { CalculationResult } from './src/screens/SimpleInterestCalculator';

const _extra = (Constants as any).expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {};
(globalThis as any).SHEETS_WEBAPP_URL = _extra.sheetsWebappUrl ?? (globalThis as any).SHEETS_WEBAPP_URL ?? '';

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
    <StorageProvider>
      <AppShell />
    </StorageProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  contentContainer: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 4,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuIcon: { fontSize: 20, color: '#334155', fontWeight: '700' },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  content: { flex: 1 },
});
