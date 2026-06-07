import { Modal, View, Text, Linking, TouchableOpacity } from "react-native";
import { styles } from "@/styles/theme";
import { useNavigation } from "@react-navigation/native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function HelpSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const navigation = useNavigation<any>();
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const primaryActionText = scheme === 'dark' ? colors.primaryDark : 'white';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 24
        }}>
          <Text style={[styles.textH3, { color: colors.text, marginBottom: 12 }]}>
            If you{"'"}re in crisis
          </Text>
          <Text style={[styles.textMuted, { color: colors.muted, marginBottom: 16 }]}>
            This app is not for emergencies. Please use your local helplines below or contact emergency services.
          </Text>

          <TouchableOpacity
            onPress={() => { onClose(); navigation.navigate('CrisisHelp'); }}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 12,
              marginBottom: 12
            }}
          >
            <Text style={{ color: primaryActionText, textAlign: 'center', fontWeight: '600' }}>View Helplines</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL("tel:112")}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 12
            }}
          >
            <Text style={{ color: colors.text, textAlign: 'center' }}>Call Emergency (112)</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
