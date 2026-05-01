import { useColorScheme } from 'react-native';

export function useTheme() {
  const colorScheme = useColorScheme();
  
  return {
    isDark: colorScheme === 'dark',
    isLight: colorScheme === 'light',
    colorScheme,
  };
}
