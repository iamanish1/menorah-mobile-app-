import { useEffect, useRef } from 'react';
import {
  Animated,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdate } from '@/hooks/useAppUpdate';

export default function UpdateBanner() {
  const { updateState, applyUpdate } = useAppUpdate();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const visible = updateState === 'ready';

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -100,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [visible]);

  if (updateState === 'idle' || updateState === 'checking') return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { top: insets.top + 8, transform: [{ translateY }] },
      ]}
    >
      {updateState === 'downloading' ? (
        <View style={styles.row}>
          <View style={styles.dot} />
          <Text style={styles.text}>Downloading update...</Text>
        </View>
      ) : (
        // updateState === 'ready'
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: '#4ADE80' }]} />
          <Text style={styles.text}>Update ready!</Text>
          <TouchableOpacity onPress={applyUpdate} style={styles.button}>
            <Text style={styles.buttonText}>Restart</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#1C2B1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    marginRight: 10,
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#314830',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4ADE80',
  },
  buttonText: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '700',
  },
});
