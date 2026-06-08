import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>App Error</Text>
          <Text style={styles.subtitle}>Please screenshot this and send to support:</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.message}>{this.state.error.message}</Text>
            <Text style={styles.stack}>{this.state.error.stack}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 24, paddingTop: 60 },
  title: { color: '#ff4444', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#aaaaaa', fontSize: 13, marginBottom: 16 },
  scroll: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, marginBottom: 16 },
  message: { color: '#ffcc00', fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  stack: { color: '#cccccc', fontSize: 11, fontFamily: 'monospace' },
  button: { backgroundColor: '#333', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
