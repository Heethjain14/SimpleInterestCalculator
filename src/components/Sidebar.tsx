import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native';

import { NAV_ITEMS, Screen } from '../navigation/screens';

const SIDEBAR_WIDTH = 260;

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
              Interest Calculator
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
              ← Hide Menu
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,

    width: SIDEBAR_WIDTH,

    backgroundColor: '#1E293B',

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
    borderBottomColor: '#334155',
  },

  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  brandSubtitle: {
    marginTop: 5,
    fontSize: 13,
    color: '#94A3B8',
  },

  navContainer: {
    flex: 1,
    paddingTop: 14,
    paddingHorizontal: 10,
  },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',

    paddingVertical: 14,
    paddingHorizontal: 14,

    borderRadius: 12,
    marginBottom: 6,
  },

  navItemActive: {
    backgroundColor: '#007AFF',
  },

  icon: {
    width: 28,
    fontSize: 20,
    textAlign: 'center',
    marginRight: 14,
  },

  navLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
  },

  navLabelActive: {
    color: '#FFFFFF',
  },

  closeButton: {
    borderTopWidth: 1,
    borderTopColor: '#334155',

    paddingVertical: 16,
    paddingHorizontal: 18,
  },

  closeButtonText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 15,
  },
});