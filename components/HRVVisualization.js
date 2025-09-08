import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');
const chartWidth = screenWidth - 60;
const chartHeight = 200;

export default function HRVVisualization({ hrvData, onClose }) {
  const [activeTab, setActiveTab] = useState('scatter');

  if (!hrvData || !hrvData.rawData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No HRV data available for visualization</Text>
      </View>
    );
  }

  const { ibiValues } = hrvData.rawData;

  // Generate visualization data
  const scatterData = useMemo(() => {
    return ibiValues.map((ibi, index) => ({
      x: index,
      y: ibi,
      heartRate: Math.round(60000 / ibi * 10) / 10
    }));
  }, [ibiValues]);

  const poincareData = useMemo(() => {
    const points = [];
    for (let i = 0; i < ibiValues.length - 1; i++) {
      points.push({
        x: ibiValues[i],
        y: ibiValues[i + 1],
        index: i
      });
    }
    return points;
  }, [ibiValues]);


  const renderScatterPlot = () => {
    const maxY = Math.max(...scatterData.map(d => d.y));
    const minY = Math.min(...scatterData.map(d => d.y));
    const maxX = scatterData.length - 1;
    
    const padding = 40;
    const plotWidth = chartWidth - 2 * padding;
    const plotHeight = chartHeight - 2 * padding;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>IBI Scatter Plot</Text>
        <Text style={styles.chartSubtitle}>Inter-Beat Intervals over time</Text>
        
        <Svg width={chartWidth} height={chartHeight} style={styles.chart}>
          {/* Background */}
          <Rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#0f0f1a" />
          
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
            <Line
              key={`grid-${ratio}`}
              x1={padding}
              y1={padding + ratio * plotHeight}
              x2={padding + plotWidth}
              y2={padding + ratio * plotHeight}
              stroke="#333"
              strokeWidth={0.5}
            />
          ))}
          
          {/* Data points */}
          {scatterData.map((point, index) => {
            const x = padding + (point.x / maxX) * plotWidth;
            const y = padding + (1 - (point.y - minY) / (maxY - minY)) * plotHeight;
            
            return (
              <Circle
                key={index}
                cx={x}
                cy={y}
                r={2}
                fill="#4CAF50"
                opacity={0.7}
              />
            );
          })}
          
          {/* Y-axis labels */}
          <SvgText x={15} y={padding + 5} fill="#888" fontSize="10">
            {Math.round(maxY)}ms
          </SvgText>
          <SvgText x={15} y={padding + plotHeight} fill="#888" fontSize="10">
            {Math.round(minY)}ms
          </SvgText>
          
          {/* X-axis labels */}
          <SvgText x={padding} y={chartHeight - 10} fill="#888" fontSize="10">
            0
          </SvgText>
          <SvgText x={padding + plotWidth - 20} y={chartHeight - 10} fill="#888" fontSize="10">
            {maxX}
          </SvgText>
        </Svg>
        
        <View style={styles.chartInfo}>
          <Text style={styles.infoText}>
            {scatterData.length} data points • Range: {minY.toFixed(0)}-{maxY.toFixed(0)}ms • Mean: {hrvData.timeDomain?.meanNN}ms
          </Text>
        </View>
        
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>What This Shows:</Text>
          <Text style={styles.explanationText}>
            The IBI (Inter-Beat Interval) scatter plot displays your heart rate variability over time. Each point represents the time between consecutive heartbeats in milliseconds.
          </Text>
          <Text style={styles.explanationText}>
            • <Text style={styles.highlight}>Higher variability</Text> (more scattered points) generally indicates better cardiovascular health and stress resilience{'\n'}
            • <Text style={styles.highlight}>Lower variability</Text> (points in a tight line) may suggest stress, fatigue, or reduced autonomic function{'\n'}
            • <Text style={styles.highlight}>Trends</Text> in the data can reveal patterns related to breathing, stress, or recovery states
          </Text>
        </View>
      </View>
    );
  };

  const renderPoincarePlot = () => {
    if (!poincareData.length) return null;
    
    const maxVal = Math.max(...ibiValues);
    const minVal = Math.min(...ibiValues);
    const range = maxVal - minVal;
    
    const padding = 40;
    const plotWidth = chartWidth - 2 * padding;
    const plotHeight = chartHeight - 2 * padding;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Poincaré Plot</Text>
        <Text style={styles.chartSubtitle}>RR(n) vs RR(n+1) correlation</Text>
        
        <Svg width={chartWidth} height={chartHeight} style={styles.chart}>
          {/* Background */}
          <Rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#0f0f1a" />
          
          {/* Identity line (y = x) */}
          <Line
            x1={padding}
            y1={padding + plotHeight}
            x2={padding + plotWidth}
            y2={padding}
            stroke="#666"
            strokeWidth={1}
            strokeDasharray="5,5"
          />
          
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
            <G key={`grid-${ratio}`}>
              <Line
                x1={padding}
                y1={padding + ratio * plotHeight}
                x2={padding + plotWidth}
                y2={padding + ratio * plotHeight}
                stroke="#333"
                strokeWidth={0.5}
              />
              <Line
                x1={padding + ratio * plotWidth}
                y1={padding}
                x2={padding + ratio * plotWidth}
                y2={padding + plotHeight}
                stroke="#333"
                strokeWidth={0.5}
              />
            </G>
          ))}
          
          {/* Data points */}
          {poincareData.map((point, index) => {
            const x = padding + ((point.x - minVal) / range) * plotWidth;
            const y = padding + (1 - (point.y - minVal) / range) * plotHeight;
            
            return (
              <Circle
                key={index}
                cx={x}
                cy={y}
                r={1.5}
                fill="#2196F3"
                opacity={0.6}
              />
            );
          })}
          
          {/* Axis labels */}
          <SvgText x={15} y={padding + 5} fill="#888" fontSize="10">
            {Math.round(maxVal)}
          </SvgText>
          <SvgText x={15} y={padding + plotHeight} fill="#888" fontSize="10">
            {Math.round(minVal)}
          </SvgText>
          <SvgText x={padding} y={chartHeight - 10} fill="#888" fontSize="10">
            {Math.round(minVal)}
          </SvgText>
          <SvgText x={padding + plotWidth - 30} y={chartHeight - 10} fill="#888" fontSize="10">
            {Math.round(maxVal)}
          </SvgText>
        </Svg>
        
        <View style={styles.chartInfo}>
          <Text style={styles.infoText}>
            🎯 SD1: {hrvData.poincare?.sd1}ms • SD2: {hrvData.poincare?.sd2}ms • Ratio: {hrvData.poincare?.sd1sd2Ratio}
          </Text>
        </View>
        
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>What This Shows:</Text>
          <Text style={styles.explanationText}>
            The Poincaré plot shows the correlation between consecutive heartbeats by plotting each RR interval against the next one.
          </Text>
          <Text style={styles.explanationText}>
            • <Text style={styles.highlight}>SD1</Text> (width): Measures short-term variability, reflecting parasympathetic activity{'\n'}
            • <Text style={styles.highlight}>SD2</Text> (length): Measures long-term variability, reflecting overall autonomic balance{'\n'}
            • <Text style={styles.highlight}>Shape</Text>: A wider, more elliptical cloud indicates better HRV and autonomic balance{'\n'}
            • <Text style={styles.highlight}>Tight cluster</Text>: May indicate stress, fatigue, or reduced heart rate variability
          </Text>
        </View>
      </View>
    );
  };


  const renderFrequencyDomain = () => {
    const { frequency } = hrvData;
    if (!frequency) return null;

    const bands = [
      { name: 'VLF', value: frequency.vlfPower, color: '#9C27B0', desc: 'Very Low Frequency' },
      { name: 'LF', value: frequency.lfPower, color: '#FF9800', desc: 'Low Frequency' },
      { name: 'HF', value: frequency.hfPower, color: '#4CAF50', desc: 'High Frequency' }
    ];

    const total = bands.reduce((sum, band) => sum + band.value, 0);
    
    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Frequency Domain Analysis</Text>
        <Text style={styles.chartSubtitle}>Power spectral density bands</Text>
        
        <View style={styles.frequencyBands}>
          {bands.map((band, index) => {
            const percentage = total > 0 ? (band.value / total * 100) : 0;
            return (
              <View key={band.name} style={styles.frequencyBand}>
                <View style={[styles.bandColor, { backgroundColor: band.color }]} />
                <View style={styles.bandInfo}>
                  <Text style={styles.bandName}>{band.name}</Text>
                  <Text style={styles.bandDesc}>{band.desc}</Text>
                  <Text style={styles.bandValue}>{Math.round(band.value)} ms²</Text>
                  <Text style={styles.bandPercent}>{percentage.toFixed(1)}%</Text>
                </View>
                <View style={styles.bandBar}>
                  <View 
                    style={[
                      styles.bandBarFill, 
                      { width: `${percentage}%`, backgroundColor: band.color }
                    ]} 
                  />
                </View>
              </View>
            );
          })}
        </View>
        
        <View style={styles.frequencyMetrics}>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{frequency.lfhfRatio}</Text>
              <Text style={styles.metricLabel}>LF/HF Ratio</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{frequency.totalPower}</Text>
              <Text style={styles.metricLabel}>Total Power (ms²)</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>What This Shows:</Text>
          <Text style={styles.explanationText}>
            Frequency domain analysis breaks down your heart rate variability into different frequency bands, each reflecting different aspects of your autonomic nervous system.
          </Text>
          <Text style={styles.explanationText}>
            • <Text style={styles.highlight}>VLF (0.003-0.04 Hz)</Text>: Very low frequency, related to thermoregulation and hormonal influences{'\n'}
            • <Text style={styles.highlight}>LF (0.04-0.15 Hz)</Text>: Low frequency, reflects both sympathetic and parasympathetic activity{'\n'}
            • <Text style={styles.highlight}>HF (0.15-0.4 Hz)</Text>: High frequency, primarily parasympathetic activity and respiratory influence{'\n'}
            • <Text style={styles.highlight}>LF/HF Ratio</Text>: Balance between sympathetic and parasympathetic systems (lower is generally better)
          </Text>
        </View>
      </View>
    );
  };

  const tabs = [
    { id: 'scatter', name: 'IBI Plot', icon: '📊' },
    { id: 'poincare', name: 'Poincaré', icon: '🎯' },
    { id: 'frequency', name: 'Frequency', icon: '🌊' }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HRV Visualization</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {activeTab === 'scatter' && renderScatterPlot()}
        {activeTab === 'poincare' && renderPoincarePlot()}
        {activeTab === 'frequency' && renderFrequencyDomain()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#2a2a3e',
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 5,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#4CAF50',
  },
  tabIcon: {
    fontSize: 16,
    marginRight: 5,
  },
  tabText: {
    fontSize: 12,
    color: '#cccccc',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  chartContainer: {
    backgroundColor: '#2a2a3e',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  chartSubtitle: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 15,
  },
  chart: {
    borderRadius: 10,
    marginBottom: 10,
  },
  chartInfo: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#cccccc',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
    margin: 20,
  },
  // Frequency domain styles
  frequencyBands: {
    marginBottom: 20,
  },
  frequencyBand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 15,
  },
  bandColor: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 15,
  },
  bandInfo: {
    flex: 1,
  },
  bandName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  bandDesc: {
    fontSize: 12,
    color: '#888',
    marginBottom: 5,
  },
  bandValue: {
    fontSize: 14,
    color: '#cccccc',
  },
  bandPercent: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  bandBar: {
    width: 80,
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    marginLeft: 10,
  },
  bandBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  frequencyMetrics: {
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 15,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 5,
  },
  metricLabel: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  explanationContainer: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  explanationTitle: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  explanationText: {
    color: '#e0e6ed',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  highlight: {
    color: '#4CAF50',
    fontWeight: '600',
  },
});
