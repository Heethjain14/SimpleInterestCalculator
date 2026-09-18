import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NAV_ITEMS, Screen } from '../navigation/screens';
import { colors, radii } from '../theme/tokens';

const SIDEBAR_WIDTH = 272;

interface Props {
  visible: boolean;
  activeScreen: Screen;
  onSelect: (screen: Screen) => void;
  onClose: () => void;
}

export default function Sidebar({
  visible,
  activeScreen,
  onSelect,
  onClose,
}: Props) {
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: visible ? 0 : -SIDEBAR_WIDTH,
        damping: 22,
        stiffness: 180,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: visible ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  const handleSelect = (screen: Screen) => {
    onSelect(screen);
    onClose();
  };

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 9999 }, // Ensure sidebar is above all content
      ]}
    >
      {/* Background Overlay */}
      <Pressable
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 1 }, // Overlay layer
        ]}
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: overlayOpacity,
            },
          ]}
        />
      </Pressable>

      {/* Sidebar */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [{ translateX }],
            zIndex: 2, // Sidebar layer (above overlay)
          },
        ]}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>
              Portfolio Ledger
            </Text>
            <Text style={styles.brandSubtitle}>
              Loan Portfolio Manager
            </Text>
          </View>

          {/* Navigation */}
          <View style={styles.navContainer}>
            {NAV_ITEMS.map((item) => {
              const active = activeScreen === item.key;

              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.75}
                  style={[
                    styles.navItem,
                    active && styles.navItemActive,
                  ]}
                  onPress={() => handleSelect(item.key)}
                >
                  <Text style={styles.icon}>
                    {item.icon}
                  </Text>

                  <Text
                    style={[
                      styles.navLabel,
                      active && styles.navLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>
              ‹ Hide menu
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

export const SIDEBAR_WIDTH_EXPORT = SIDEBAR_WIDTH;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,10,18,0.52)',
  },

  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,

    width: SIDEBAR_WIDTH,

    backgroundColor: colors.sidebar,

    elevation: 20,

    shadowColor: '#000',
    shadowOffset: {
      width: 5,
      height: 0,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },

  brand: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,

    borderBottomWidth: 1,
    borderBottomColor: colors.sidebarBorder,
  },

  brandTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  brandSubtitle: {
    marginTop: 5,
    fontSize: 12.5,
    color: colors.sidebarInkDim,
  },

  navContainer: {
    flex: 1,
    paddingTop: 14,
    paddingHorizontal: 10,
  },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',

    paddingVertical: 13,
    paddingHorizontal: 14,

    borderRadius: radii.md,
    marginBottom: 4,
  },

  navItemActive: {
    backgroundColor: colors.sidebarActive,
  },

  icon: {
    width: 26,
    fontSize: 18,
    textAlign: 'center',
    marginRight: 12,
  },

  navLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.sidebarInk,
  },

  navLabelActive: {
    color: '#FFFFFF',
  },

  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.sidebarBorder,

    paddingVertical: 16,
    paddingHorizontal: 18,
  },

  closeButtonText: {
    color: colors.sidebarInkDim,
    fontWeight: '700',
    fontSize: 13.5,
  },
});