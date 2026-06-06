import { Text, TouchableOpacity, View } from 'react-native';
import { iosTheme } from './iosTheme';

type IOSSectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
};

export default function IOSSectionHeader({ title, actionLabel, onPress }: IOSSectionHeaderProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: iosTheme.spacing.xxl,
        marginBottom: iosTheme.spacing.md,
      }}
    >
      <Text style={iosTheme.typography.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8} disabled={!onPress}>
          <Text style={{ color: iosTheme.colors.primaryMuted, fontSize: 14, fontWeight: '800' }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
