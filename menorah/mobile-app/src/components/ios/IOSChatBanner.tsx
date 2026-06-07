import {
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { useIOSTheme } from './iosTheme';

type IOSChatBannerProps = {
  title: string;
  subtitle: string;
  onPress: () => void;
  iconSource?: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
};

export default function IOSChatBanner({
  title,
  subtitle,
  onPress,
  iconSource = require('../../../assets/brand/chat-logo.jpeg'),
  style,
}: IOSChatBannerProps) {
  const iosTheme = useIOSTheme();
  const logoGreen = iosTheme.colors.chatBanner;
  const circleSize = 108;
  const innerCircleSize = 84;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      style={[
        {
          height: 100,
          borderRadius: 20,
          backgroundColor: logoGreen,
          paddingLeft: 24,
          paddingRight: 110,
          justifyContent: 'center',
          position: 'relative',
          overflow: 'visible',
          borderWidth: 1,
          borderColor: iosTheme.colors.chatBannerBorder,
        },
        iosTheme.shadows.card,
        style,
      ]}
    >
      <View style={{ maxWidth: '100%' }}>
        <Text
          style={{
            color: iosTheme.colors.inverseText,
            fontSize: 31,
            lineHeight: 35,
            fontWeight: '900',
            marginBottom: 7,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={{
            color: iosTheme.colors.inverseTextSecondary,
            fontSize: 12,
            lineHeight: 15,
            fontWeight: '700',
          }}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>

      <View
        style={{
          position: 'absolute',
          right: -26,
          top: '50%',
          width: circleSize,
          height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: iosTheme.colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: -circleSize / 2 }],
        }}
      >
        <View
          style={{
            width: innerCircleSize,
            height: innerCircleSize,
            borderRadius: innerCircleSize / 2,
            backgroundColor: logoGreen,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Image source={iconSource} style={{ width: 128, height: 128 }} contentFit="cover" />
        </View>
      </View>
    </TouchableOpacity>
  );
}
