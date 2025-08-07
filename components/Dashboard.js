import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

export default function Dashboard({ onNavigate }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Resonance Wellness</Text>
        <Text style={styles.subtitle}>Your Complete Wellness Dashboard</Text>
      </View>

      <View style={styles.cardContainer}>
        <TouchableOpacity
          style={[styles.card, styles.breathingCard]}
          onPress={() => onNavigate('breathing')}
        >
          <View style={styles.cardIcon}>
            <Text style={styles.iconText}>🧘‍♀️</Text>
          </View>
          <Text style={styles.cardTitle}>Breathing Exercises</Text>
          <Text style={styles.cardDescription}>
            Guided breathing with customizable patterns
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.dataCard]}
          onPress={() => onNavigate('data')}
        >
          <View style={styles.cardIcon}>
            <Text style={styles.iconText}>📊</Text>
          </View>
          <Text style={styles.cardTitle}>Data Analysis</Text>
          <Text style={styles.cardDescription}>
            Import and analyze Excel files
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Combine breathing exercises with data insights for optimal wellness
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#cccccc',
    textAlign: 'center',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 25,
  },
  card: {
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  breathingCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  dataCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  cardIcon: {
    marginBottom: 15,
  },
  iconText: {
    fontSize: 48,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 16,
    color: '#cccccc',
    textAlign: 'center',
    marginBottom: 15,
  },
  cardSubtext: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 3,
  },
  footer: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
