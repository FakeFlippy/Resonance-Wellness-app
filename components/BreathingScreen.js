import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';

const { width, height } = Dimensions.get('window');

export default function BreathingScreen({ onBack }) {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState('inhale'); // 'inhale', 'hold', 'exhale'
  const [seconds, setSeconds] = useState(0);
  const [cycle, setCycle] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  
  // Customizable breathing times (default 5-5, no hold)
  const [inhaleTime, setInhaleTime] = useState(5);
  const [holdTime, setHoldTime] = useState(0); // 0 means no hold phase
  const [exhaleTime, setExhaleTime] = useState(5);
  const totalCycleTime = inhaleTime + holdTime + exhaleTime;
  
  // Animation values
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    let interval = null;
    
    if (isActive) {
      interval = setInterval(() => {
        setSeconds(seconds => seconds + 1);
      }, 1000);
    } else if (!isActive && seconds !== 0) {
      clearInterval(interval);
    }
    
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  useEffect(() => {
    if (isActive) {
      const cyclePosition = seconds % totalCycleTime;
      
      if (cyclePosition < inhaleTime) {
        // Inhale phase
        if (phase !== 'inhale') {
          setPhase('inhale');
          animateInhale();
        }
      } else if (holdTime > 0 && cyclePosition < inhaleTime + holdTime) {
        // Hold phase (only if holdTime > 0)
        if (phase !== 'hold') {
          setPhase('hold');
          animateHold();
        }
      } else {
        // Exhale phase
        if (phase !== 'exhale') {
          setPhase('exhale');
          animateExhale();
        }
      }
      
      // Update cycle count
      const newCycle = Math.floor(seconds / totalCycleTime) + 1;
      if (newCycle !== cycle) {
        setCycle(newCycle);
      }
    }
  }, [seconds, isActive]);

  const animateInhale = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: inhaleTime * 1000,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.9,
        duration: inhaleTime * 1000,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateHold = () => {
    // Keep current scale and opacity during hold - no animation change
  };

  const animateExhale = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.5,
        duration: exhaleTime * 1000,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.7,
        duration: exhaleTime * 1000,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const startBreathing = () => {
    setIsActive(true);
    setSeconds(0);
    setCycle(1);
    setPhase('inhale');
    animateInhale();
  };

  const stopBreathing = () => {
    setIsActive(false);
    setPhase('inhale');
    // Reset animation to initial state
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.5,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.7,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const reset = () => {
    setIsActive(false);
    setSeconds(0);
    setCycle(1);
    setPhase('inhale');
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.5,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.7,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const setPreset = (inhale, exhale, hold = 0) => {
    setInhaleTime(inhale);
    setExhaleTime(exhale);
    setHoldTime(hold);
    if (isActive) {
      reset(); // Reset if currently active to apply new timing
    }
  };

  const handleSliderPress = (event, type) => {
    const { locationX } = event.nativeEvent;
    const sliderWidth = 200; // Match the slider width from styles
    const percentage = Math.max(0, Math.min(1, locationX / sliderWidth));
    
    let value;
    if (type === 'hold') {
      value = Math.round(percentage * 10); // 0-10 second range for hold
    } else {
      value = Math.round(2 + (percentage * 8)); // 2-10 second range for inhale/exhale
    }
    
    if (type === 'inhale') {
      setInhaleTime(value);
    } else if (type === 'hold') {
      setHoldTime(value);
    } else {
      setExhaleTime(value);
    }
    
    if (isActive) {
      reset(); // Reset if currently active to apply new timing
    }
  };

  const incrementValue = (type, increment) => {
    if (type === 'inhale') {
      const newValue = Math.max(2, Math.min(10, inhaleTime + increment));
      setInhaleTime(newValue);
    } else if (type === 'hold') {
      const newValue = Math.max(0, Math.min(10, holdTime + increment));
      setHoldTime(newValue);
    } else {
      const newValue = Math.max(2, Math.min(10, exhaleTime + increment));
      setExhaleTime(newValue);
    }
    
    if (isActive) {
      reset(); // Reset if currently active to apply new timing
    }
  };

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseText = () => {
    switch (phase) {
      case 'inhale':
        return 'Breathe In';
      case 'hold':
        return 'Hold';
      case 'exhale':
        return 'Breathe Out';
      default:
        return 'Ready';
    }
  };

  const getPhaseColor = () => {
    switch (phase) {
      case 'inhale':
        return '#4CAF50'; // Green
      case 'hold':
        return '#FF9800'; // Orange
      case 'exhale':
        return '#2196F3'; // Blue
      default:
        return '#9C27B0'; // Purple
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Resonance Breath</Text>
        <Text style={styles.subtitle}>{holdTime > 0 ? `${inhaleTime}-${holdTime}-${exhaleTime}` : `${inhaleTime}-${exhaleTime}`} Pattern ({(1 / totalCycleTime).toFixed(2)} Hz)</Text>
      </View>

      <View style={styles.timerContainer}>
        <Text style={styles.timer}>{formatTime(seconds)}</Text>
        <Text style={styles.cycle}>Cycle {cycle}</Text>
      </View>

      <View style={styles.animationContainer}>
        <Animated.View
          style={[
            styles.breathingCircle,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
              backgroundColor: getPhaseColor(),
            },
          ]}
        />
        <Text style={[styles.phaseText, { color: getPhaseColor() }]}>
          {getPhaseText()}
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.startButton]}
          onPress={isActive ? stopBreathing : startBreathing}
        >
          <Text style={styles.buttonText}>
            {isActive ? 'Stop' : 'Start'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.resetButton]}
          onPress={reset}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.settingsButton]}
          onPress={() => setShowSettings(!showSettings)}
        >
          <Text style={styles.buttonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {showSettings && (
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsModal}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Breathing Settings</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowSettings(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.settingsContent}>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Inhale: {inhaleTime}s</Text>
                <View style={styles.controlContainer}>
                  <TouchableOpacity
                    style={styles.incrementButton}
                    onPress={() => incrementValue('inhale', -1)}
                  >
                    <Text style={styles.incrementText}>−</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderValue}>2</Text>
                    <TouchableOpacity
                      style={styles.slider}
                      onPress={(e) => handleSliderPress(e, 'inhale')}
                      activeOpacity={1}
                    >
                      <View
                        style={[
                          styles.sliderButton,
                          { left: ((inhaleTime - 2) / 8) * 180 - 12.5 } // 180 is slider track width minus button width
                        ]}
                      />
                    </TouchableOpacity>
                    <Text style={styles.sliderValue}>10</Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.incrementButton}
                    onPress={() => incrementValue('inhale', 1)}
                  >
                    <Text style={styles.incrementText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Hold: {holdTime}s</Text>
                <View style={styles.controlContainer}>
                  <TouchableOpacity
                    style={styles.incrementButton}
                    onPress={() => incrementValue('hold', -1)}
                  >
                    <Text style={styles.incrementText}>−</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderValue}>0</Text>
                    <TouchableOpacity
                      style={styles.slider}
                      onPress={(e) => handleSliderPress(e, 'hold')}
                      activeOpacity={1}
                    >
                      <View
                        style={[
                          styles.sliderButton,
                          { left: (holdTime / 10) * 180 - 12.5 } // 180 is slider track width minus button width
                        ]}
                      />
                    </TouchableOpacity>
                    <Text style={styles.sliderValue}>10</Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.incrementButton}
                    onPress={() => incrementValue('hold', 1)}
                  >
                    <Text style={styles.incrementText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Exhale: {exhaleTime}s</Text>
                <View style={styles.controlContainer}>
                  <TouchableOpacity
                    style={styles.incrementButton}
                    onPress={() => incrementValue('exhale', -1)}
                  >
                    <Text style={styles.incrementText}>−</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderValue}>2</Text>
                    <TouchableOpacity
                      style={styles.slider}
                      onPress={(e) => handleSliderPress(e, 'exhale')}
                      activeOpacity={1}
                    >
                      <View
                        style={[
                          styles.sliderButton,
                          { left: ((exhaleTime - 2) / 8) * 180 - 12.5 } // 180 is slider track width minus button width
                        ]}
                      />
                    </TouchableOpacity>
                    <Text style={styles.sliderValue}>10</Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.incrementButton}
                    onPress={() => incrementValue('exhale', 1)}
                  >
                    <Text style={styles.incrementText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.presetSection}>
                <Text style={styles.presetSectionTitle}>Quick Presets</Text>
                <View style={styles.presetButtons}>
                  <TouchableOpacity
                    style={styles.presetButton}
                    onPress={() => setPreset(4, 4, 4)}
                  >
                    <Text style={styles.presetText}>4-4-4 Traditional</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetButton, styles.activePreset]}
                    onPress={() => setPreset(5, 5)}
                  >
                    <Text style={styles.presetText}>5-5 Classic</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetButton}
                    onPress={() => setPreset(4, 6)}
                  >
                    <Text style={styles.presetText}>4-6 Calming</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          </View>
        </View>
      )}


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 50,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    position: 'relative',
    width: '100%',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: -25,
    padding: 10,
  },
  backButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    textAlignVertical: 'center',
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
  },
  timerContainer: {
    alignItems: 'center',
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  cycle: {
    fontSize: 18,
    color: '#cccccc',
    marginTop: 5,
  },
  animationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 300,
  },
  breathingCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    marginBottom: 30,
  },
  phaseText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: 15,
  },
  button: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  resetButton: {
    backgroundColor: '#f44336',
  },
  settingsButton: {
    backgroundColor: '#9C27B0',
    minWidth: 60,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructions: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  instructionText: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 3,
  },
  settingsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  settingsModal: {
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  settingsTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  settingsContent: {
    padding: 20,
  },
  settingRow: {
    marginBottom: 25,
  },
  settingLabel: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  controlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
  },
  incrementButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  incrementText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  slider: {
    width: 180,
    height: 30,
    backgroundColor: '#1a1a2e',
    borderRadius: 15,
    position: 'relative',
    justifyContent: 'center',
  },
  sliderButton: {
    width: 25,
    height: 25,
    backgroundColor: '#4CAF50',
    borderRadius: 12.5,
    position: 'absolute',
    top: 2.5,
  },
  sliderValue: {
    color: '#cccccc',
    fontSize: 14,
    minWidth: 20,
    textAlign: 'center',
  },
  presetSection: {
    marginTop: 30,
  },
  presetSectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  presetButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 80,
  },
  activePreset: {
    backgroundColor: '#4CAF50',
  },
  presetText: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  futureSettingsSpace: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    alignItems: 'center',
  },
  futureSettingsText: {
    color: '#888888',
    fontSize: 14,
    fontStyle: 'italic',
  },
});
