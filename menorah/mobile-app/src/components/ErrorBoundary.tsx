import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { reportError } from '@/lib/safeDiagnostics';

interface State {
  hasError: boolean;
  incidentReference: string | null;
}

const createIncidentReference = () =>
  `MOB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, incidentReference: null };

  static getDerivedStateFromError(): State {
    return { hasError: true, incidentReference: createIncidentReference() };
  }

  componentDidCatch(error: Error) {
    // safeDiagnostics strips message, stack, request data, and response bodies.
    reportError('ui.error_boundary', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            No health or account details were included. Try again, or share only
            this reference with support: {this.state.incidentReference}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false, incidentReference: null })}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
  },
  title: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#cccccc', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  button: { backgroundColor: '#333333', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontWeight: '600' },
});
