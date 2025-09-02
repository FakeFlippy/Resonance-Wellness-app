# Resonance Wellness 🫁

A React Native wellness application that combines guided breathing exercises with advanced heart rate variability (HRV) analysis for optimal health and stress management.

## ✨ Features

### 🧘‍♀️ Guided Breathing Exercises
- **0.1 Hz Breathing Pattern**: Scientifically optimized 5-second inhale / 5-second exhale cycles
- **Customizable Settings**: Adjustable inhale, exhale, and hold durations (0-10 seconds)
- **Visual Guidance**: Smooth animated breathing circle with real-time instructions
- **Cardiovascular Resonance**: Designed to maximize heart rate variability and parasympathetic activation

### 📊 Advanced Data Analysis
- **Multi-Format Support**: Import CSV and Excel (.xlsx, .xls) files from biometric devices
- **Automatic Data Detection**: Recognizes vitals vs. secondary vitals data structures
- **Professional HRV Metrics**: 
  - RMSSD (Root Mean Square of Successive Differences)
  - SDNN (Standard Deviation of NN intervals)
  - pNN50 (Percentage of intervals >50ms different)
  - HRV Index (Normalized variability measure)

### 🌱 Wellness Insights
- **Personalized Health Interpretations**: Meaningful insights instead of raw statistics
- **Data-Driven Recommendations**: Tailored suggestions based on your biometric data
- **Stress Level Assessment**: Analysis of parasympathetic activity and recovery status
- **Actionable Guidance**: Specific recommendations for breathing exercises, sleep, and lifestyle

### 📱 User Experience
- **Clean, Modern Interface**: Dark theme optimized for mobile devices
- **Intuitive Navigation**: Simple dashboard with easy access to all features
- **Real-Time Feedback**: Immediate analysis and insights from uploaded data
- **Professional Design**: Medical-grade appearance suitable for healthcare applications

## 🎯 Use Cases

- **Stress Management**: Use 0.1 Hz breathing to activate the parasympathetic nervous system
- **HRV Training**: Monitor and improve heart rate variability over time
- **Health Monitoring**: Analyze biometric data from compatible devices
- **Wellness Tracking**: Get personalized insights about your cardiovascular health
- **Meditation Support**: Guided breathing for mindfulness and relaxation practices

## 🔬 Scientific Background

The app implements **0.1 Hz breathing frequency** (6 breaths per minute), which is scientifically proven to:
- Maximize cardiovascular resonance
- Improve heart rate variability
- Enhance parasympathetic nervous system activity
- Reduce stress hormones and blood pressure
- Improve emotional regulation and cognitive performance

## 🏥 Supported Data Formats

### Vitals Data
- Date, Time, Systolic (mmHg), Diastolic (mmHg), MAP (mmHg)
- HeartRate (bpm), Respiration (Bpm), AS, SQE, TimeStamp (mS)

### Secondary Vitals Data (HRV Analysis)
- Date, Time, BV (mS), CO, IBI (mS), TimeStamp
- LVET (mS), P-Ratio, HRC, PR

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- Expo CLI
- React Native development environment

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/FakeFlippy/SimpleBreathingApp.git
   cd SimpleBreathingApp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   expo start
   ```

4. Run on your device using the Expo Go app or simulator

## 📋 How to Use

1. **Breathing Exercises**: 
   - Select "Breathing Exercises" from the dashboard
   - Customize your breathing pattern (inhale/exhale/hold durations)
   - Follow the visual guide for optimal 0.1 Hz breathing

2. **Data Analysis**:
   - Select "Data Analysis" from the dashboard
   - Upload CSV or Excel files from your biometric device
   - Review wellness insights and HRV metrics
   - Get personalized recommendations for health improvement

## 🛠️ Technology Stack

- **Framework**: React Native with Expo SDK 53
- **File Handling**: expo-document-picker, expo-file-system
- **Data Processing**: Custom CSV/XLSX parsing
- **UI/UX**: Native React Native components with custom styling
- **Platform**: iOS and Android compatible

## 📈 Health Metrics Explained

- **RMSSD**: Measures short-term heart rate variability and parasympathetic activity
- **SDNN**: Indicates overall heart rate variability and autonomic nervous system health
- **pNN50**: Reflects the percentage of heartbeat intervals that vary significantly
- **HRV Index**: Normalized measure of heart rate variability for easy comparison

## ⚠️ Medical Disclaimer

This app is for wellness and educational purposes only. Always consult with healthcare professionals for medical advice and interpretation of health data.

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve the app.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

**Built with ❤️ for better health and wellness**
