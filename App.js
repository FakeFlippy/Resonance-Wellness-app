import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import BreathingScreen from './components/BreathingScreen';
import DataScreen from './components/DataScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('dashboard');

  const navigateToScreen = (screen) => {
    setCurrentScreen(screen);
  };

  const navigateToDashboard = () => {
    setCurrentScreen('dashboard');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'breathing':
        return <BreathingScreen onBack={navigateToDashboard} />;
      case 'data':
        return <DataScreen onBack={navigateToDashboard} />;
      default:
        return <Dashboard onNavigate={navigateToScreen} />;
    }
  };

  return renderScreen();
}
