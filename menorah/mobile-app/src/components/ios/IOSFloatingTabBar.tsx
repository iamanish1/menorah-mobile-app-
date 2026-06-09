import { Animated, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { discoverScrollY } from './iosScrollSignals';
import { useIOSTheme } from './iosTheme';

export default function IOSFloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const iosTheme = useIOSTheme();
  const activeGreen = iosTheme.colors.primary;
  const bottomOffset = insets.bottom > 0 ? insets.bottom + iosTheme.spacing.xs : iosTheme.spacing.lg;
  const activeRouteName = state.routes[state.index]?.name;
  const dockTranslateY =
    activeRouteName === 'Discover'
      ? discoverScrollY.interpolate({
          inputRange: [0, 80, 160],
          outputRange: [0, 12, 22],
          extrapolate: 'clamp',
        })
      : 0;
  const dockOpacity =
    activeRouteName === 'Discover'
      ? discoverScrollY.interpolate({
          inputRange: [0, 100, 180],
          outputRange: [1, 0.96, 0.9],
          extrapolate: 'clamp',
        })
      : 1;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomOffset,
        backgroundColor: 'transparent',
        paddingHorizontal: iosTheme.spacing.lg,
      }}
    >
      <Animated.View
        style={[
          {
            height: 74,
            borderRadius: 37,
            backgroundColor: iosTheme.colors.tabGlass,
            borderWidth: 1,
            borderColor: iosTheme.colors.tabGlassBorder,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            overflow: 'hidden',
            opacity: dockOpacity,
            transform: [{ translateY: dockTranslateY }],
          },
          {
            shadowColor: iosTheme.colors.shadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.1,
            shadowRadius: 24,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name;
          const color = focused ? activeGreen : iosTheme.colors.textMuted;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.78}
              style={{
                flex: 1,
                minHeight: 58,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={[
                  {
                    width: focused ? 52 : 42,
                    height: focused ? 38 : 34,
                    borderRadius: 21,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: focused ? activeGreen : 'transparent',
                    transform: [{ translateY: focused ? -9 : -2 }],
                  },
                  focused
                    ? {
                        shadowColor: activeGreen,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.18,
                        shadowRadius: 12,
                      }
                    : null,
                ]}
              >
                {options.tabBarIcon
                  ? options.tabBarIcon({
                      focused,
                      color: focused ? iosTheme.colors.onPrimary : color,
                      size: focused ? 22 : 21,
                    })
                  : null}
              </View>

              <Text
                style={{
                  color,
                  fontSize: focused ? 12 : 11,
                  lineHeight: 14,
                  fontWeight: focused ? '900' : '700',
                  marginTop: focused ? -3 : 0,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </View>
  );
}
