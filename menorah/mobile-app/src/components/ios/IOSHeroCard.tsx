import { Text, TouchableOpacity, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useIOSTheme } from './iosTheme';

type IOSHeroCardProps = {
  source: ImageProps['source'];
  title: string;
  subtitle?: string;
  eyebrow?: string;
  height?: number;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
};

export default function IOSHeroCard({
  source,
  title,
  subtitle,
  eyebrow,
  height = 250,
  onPress,
  style,
}: IOSHeroCardProps) {
  const iosTheme = useIOSTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.9}
      style={[
        {
          height,
          borderRadius: 30,
          overflow: 'hidden',
          backgroundColor: iosTheme.colors.primaryDeep,
        },
        iosTheme.shadows.card,
        style,
      ]}
    >
      <Image source={source} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      <LinearGradient
        colors={[
          iosTheme.colors.heroOverlayStart,
          iosTheme.colors.heroOverlayMiddle,
          iosTheme.colors.heroOverlayEnd,
        ]}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View
        style={{
          position: 'absolute',
          left: iosTheme.spacing.lg,
          right: iosTheme.spacing.lg,
          bottom: iosTheme.spacing.xl,
          alignItems: 'center',
        }}
      >
        {eyebrow ? (
          <Text
            style={{
              color: iosTheme.colors.inverseTextMuted,
              fontSize: 12,
              lineHeight: 16,
              fontWeight: '800',
              textTransform: 'uppercase',
              marginBottom: iosTheme.spacing.sm,
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          style={{
            color: iosTheme.colors.inverseText,
            fontSize: 29,
            lineHeight: 35,
            fontWeight: '900',
            textAlign: 'center',
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: iosTheme.colors.inverseTextSecondary,
              fontSize: 14,
              lineHeight: 21,
              textAlign: 'center',
              marginTop: iosTheme.spacing.sm,
              fontWeight: '600',
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
