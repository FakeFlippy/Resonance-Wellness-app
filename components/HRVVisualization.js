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

  const renderPSDPlot = () => {
    const { frequency } = hrvData;
    if (!frequency || !frequency.psdData || !frequency.sampleRate) {
      return (
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Power Spectral Density Plot</Text>
          <Text style={styles.errorText}>PSD data not available. This requires FFT analysis with sufficient data points.</Text>
        </View>
      );
    }

    const psdData = frequency.psdData;
    const sampleRate = frequency.sampleRate;
    const freqResolution = sampleRate / (2 * psdData.length);
    
    // Generate frequency array
    const frequencies = psdData.map((_, index) => index * freqResolution);
    
    // Find max PSD value for scaling
    const maxPSD = Math.max(...psdData);
    const logMaxPSD = Math.log10(maxPSD + 1);
    
    // Focus on 0-0.5 Hz range (relevant for HRV)
    const maxFreq = 0.5;
    const relevantIndices = frequencies.map((freq, index) => freq <= maxFreq ? index : -1).filter(i => i >= 0);
    const relevantFreqs = relevantIndices.map(i => frequencies[i]);
    const relevantPSD = relevantIndices.map(i => psdData[i]);
    
    const padding = 50;
    const plotWidth = chartWidth - 2 * padding;
    const plotHeight = chartHeight - 2 * padding;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Power Spectral Density Plot</Text>
        <Text style={styles.chartSubtitle}>FFT-based frequency analysis (0-0.5 Hz)</Text>
        
        <Svg width={chartWidth} height={chartHeight} style={styles.chart}>
          {/* Background */}
          <Rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#0f0f1a" />
          
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
          
          {/* Frequency band markers */}
          {/* VLF band (0.003-0.04 Hz) */}
          <Rect
            x={padding + (0.003 / maxFreq) * plotWidth}
            y={padding}
            width={((0.04 - 0.003) / maxFreq) * plotWidth}
            height={plotHeight}
            fill="#9C27B0"
            opacity={0.1}
          />
          
          {/* LF band (0.04-0.15 Hz) */}
          <Rect
            x={padding + (0.04 / maxFreq) * plotWidth}
            y={padding}
            width={((0.15 - 0.04) / maxFreq) * plotWidth}
            height={plotHeight}
            fill="#FF9800"
            opacity={0.1}
          />
          
          {/* HF band (0.15-0.4 Hz) */}
          <Rect
            x={padding + (0.15 / maxFreq) * plotWidth}
            y={padding}
            width={((0.4 - 0.15) / maxFreq) * plotWidth}
            height={plotHeight}
            fill="#4CAF50"
            opacity={0.1}
          />
          
          {/* 0.1 Hz marker (breathing frequency) */}
          <Line
            x1={padding + (0.1 / maxFreq) * plotWidth}
            y1={padding}
            x2={padding + (0.1 / maxFreq) * plotWidth}
            y2={padding + plotHeight}
            stroke="#FF5722"
            strokeWidth={2}
            strokeDasharray="5,5"
          />
          
          {/* PSD curve - draw as connected path for smoother visualization */}
          {relevantPSD.map((power, index) => {
            if (index === 0) return null;
            
            const freq1 = relevantFreqs[index - 1];
            const freq2 = relevantFreqs[index];
            const power1 = relevantPSD[index - 1];
            const power2 = power;
            
            // Use log scale for better visualization
            const logPower1 = Math.log10(power1 + 1);
            const logPower2 = Math.log10(power2 + 1);
            
            const x1 = padding + (freq1 / maxFreq) * plotWidth;
            const x2 = padding + (freq2 / maxFreq) * plotWidth;
            const y1 = padding + plotHeight - (logPower1 / logMaxPSD) * plotHeight;
            const y2 = padding + plotHeight - (logPower2 / logMaxPSD) * plotHeight;
            
            // Highlight peaks near 0.1 Hz with different color
            const isNear01Hz = freq2 >= 0.08 && freq2 <= 0.12;
            const strokeColor = isNear01Hz ? "#FF5722" : "#00BCD4";
            const strokeWidth = isNear01Hz ? 2.5 : 1.5;
            
            return (
              <Line
                key={index}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
              />
            );
          })}
          
          {/* Add circles to highlight actual peak points near 0.1 Hz */}
          {relevantPSD.map((power, index) => {
            const freq = relevantFreqs[index];
            const isNear01Hz = freq >= 0.08 && freq <= 0.12;
            
            if (!isNear01Hz) return null;
            
            const logPower = Math.log10(power + 1);
            
            const x = padding + (freq / maxFreq) * plotWidth;
            const y = padding + plotHeight - (logPower / logMaxPSD) * plotHeight;
            
            return (
              <Circle
                key={`peak-${index}`}
                cx={x}
                cy={y}
                r={3}
                fill="#FF5722"
                opacity={0.8}
              />
            );
          })}
          
          {/* Axis labels */}
          <SvgText x={padding - 5} y={padding + 5} fill="#888" fontSize="10">
            High
          </SvgText>
          <SvgText x={padding - 5} y={padding + plotHeight} fill="#888" fontSize="10">
            Low
          </SvgText>
          <SvgText x={padding} y={chartHeight - 10} fill="#888" fontSize="10">
            0 Hz
          </SvgText>
          <SvgText x={padding + plotWidth - 30} y={chartHeight - 10} fill="#888" fontSize="10">
            0.5 Hz
          </SvgText>
          
          {/* 0.1 Hz label */}
          <SvgText 
            x={padding + (0.1 / maxFreq) * plotWidth - 15} 
            y={padding - 5} 
            fill="#FF5722" 
            fontSize="10"
            fontWeight="bold"
          >
            0.1 Hz
          </SvgText>
        </Svg>
        
        <View style={styles.chartInfo}>
          <Text style={styles.infoText}>
            🎯 Sample Rate: {sampleRate} Hz • Resolution: {freqResolution.toFixed(4)} Hz • Points: {psdData.length}
          </Text>
        </View>
        
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>What This Shows:</Text>
          <Text style={styles.explanationText}>
            The Power Spectral Density (PSD) plot shows the distribution of power across different frequencies in your heart rate variability signal.
          </Text>
          <Text style={styles.explanationText}>
            • <Text style={styles.highlight}>Purple area (VLF)</Text>: Very low frequency band (0.003-0.04 Hz){'\n'}
            • <Text style={styles.highlight}>Orange area (LF)</Text>: Low frequency band (0.04-0.15 Hz){'\n'}
            • <Text style={styles.highlight}>Green area (HF)</Text>: High frequency band (0.15-0.4 Hz){'\n'}
            • <Text style={styles.highlight}>Red dashed line (0.1 Hz)</Text>: Target breathing frequency for optimal HRV{'\n'}
            • <Text style={styles.highlight}>Peaks near 0.1 Hz</Text>: Indicate good respiratory-cardiac coupling
          </Text>
        </View>
      </View>
    );
  };

  const renderTimePowerPlot = () => {
    const { timePower } = hrvData;
    if (!timePower || !timePower.timePoints || timePower.timePoints.length < 2) {
      return (
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Time-Domain Power Analysis</Text>
          <Text style={styles.errorText}>Insufficient data for time-power analysis. Need longer recording (&gt;2 minutes).</Text>
        </View>
      );
    }

    const timePoints = timePower.timePoints;
    const maxTime = Math.max(...timePoints.map(p => p.time));
    const maxVLF = Math.max(...timePoints.map(p => p.vlfPower));
    const maxLF = Math.max(...timePoints.map(p => p.lfPower));
    const maxHF = Math.max(...timePoints.map(p => p.hfPower));
    const maxPower = Math.max(maxVLF, maxLF, maxHF);
    
    const padding = 50;
    const plotWidth = chartWidth - 2 * padding;
    const plotHeight = chartHeight - 2 * padding;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Time-Domain Power Analysis</Text>
        <Text style={styles.chartSubtitle}>Frequency band power over time ({timePower.windowSize}s windows)</Text>
        
        <Svg width={chartWidth} height={chartHeight} style={styles.chart}>
          {/* Background */}
          <Rect x={0} y={0} width={chartWidth} height={chartHeight} fill="#0f0f1a" />
          
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
          
          {/* VLF Power Line */}
          {timePoints.map((point, index) => {
            if (index === 0) return null;
            
            const prevPoint = timePoints[index - 1];
            const x1 = padding + (prevPoint.time / maxTime) * plotWidth;
            const x2 = padding + (point.time / maxTime) * plotWidth;
            const y1 = padding + plotHeight - (prevPoint.vlfPower / maxPower) * plotHeight;
            const y2 = padding + plotHeight - (point.vlfPower / maxPower) * plotHeight;
            
            return (
              <Line
                key={`vlf-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#9C27B0"
                strokeWidth={2}
              />
            );
          })}
          
          {/* LF Power Line */}
          {timePoints.map((point, index) => {
            if (index === 0) return null;
            
            const prevPoint = timePoints[index - 1];
            const x1 = padding + (prevPoint.time / maxTime) * plotWidth;
            const x2 = padding + (point.time / maxTime) * plotWidth;
            const y1 = padding + plotHeight - (prevPoint.lfPower / maxPower) * plotHeight;
            const y2 = padding + plotHeight - (point.lfPower / maxPower) * plotHeight;
            
            return (
              <Line
                key={`lf-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#FF9800"
                strokeWidth={2}
              />
            );
          })}
          
          {/* HF Power Line */}
          {timePoints.map((point, index) => {
            if (index === 0) return null;
            
            const prevPoint = timePoints[index - 1];
            const x1 = padding + (prevPoint.time / maxTime) * plotWidth;
            const x2 = padding + (point.time / maxTime) * plotWidth;
            const y1 = padding + plotHeight - (prevPoint.hfPower / maxPower) * plotHeight;
            const y2 = padding + plotHeight - (point.hfPower / maxPower) * plotHeight;
            
            return (
              <Line
                key={`hf-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#4CAF50"
                strokeWidth={2.5}
              />
            );
          })}
          
          {/* Data points for HF (breathing-related) */}
          {timePoints.map((point, index) => {
            const x = padding + (point.time / maxTime) * plotWidth;
            const y = padding + plotHeight - (point.hfPower / maxPower) * plotHeight;
            
            return (
              <Circle
                key={`hf-point-${index}`}
                cx={x}
                cy={y}
                r={2}
                fill="#4CAF50"
                opacity={0.8}
              />
            );
          })}
          
          {/* Axis labels */}
          <SvgText x={padding - 5} y={padding + 5} fill="#888" fontSize="10">
            High
          </SvgText>
          <SvgText x={padding - 5} y={padding + plotHeight} fill="#888" fontSize="10">
            Low
          </SvgText>
          <SvgText x={padding} y={chartHeight - 10} fill="#888" fontSize="10">
            0s
          </SvgText>
          <SvgText x={padding + plotWidth - 30} y={chartHeight - 10} fill="#888" fontSize="10">
            {Math.round(maxTime)}s
          </SvgText>
        </Svg>
        
        {/* Legend */}
        <View style={styles.timePowerLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#9C27B0' }]} />
            <Text style={styles.legendText}>VLF Power</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#FF9800' }]} />
            <Text style={styles.legendText}>LF Power</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.legendText}>HF Power (Breathing)</Text>
          </View>
        </View>
        
        <View style={styles.chartInfo}>
          <Text style={styles.infoText}>
            📊 {timePoints.length} time windows • Window: {timePower.windowSize}s • Step: {timePower.stepSize}s • Duration: {Math.round(timePower.totalDuration)}s
          </Text>
        </View>
        
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>What This Shows:</Text>
          <Text style={styles.explanationText}>
            This time-domain power plot shows how the power in different frequency bands changes over time during your recording.
          </Text>
          <Text style={styles.explanationText}>
            • <Text style={styles.highlight}>Green line (HF Power)</Text>: Breathing-related power - should increase during 0.1 Hz breathing exercises{'\n'}
            • <Text style={styles.highlight}>Orange line (LF Power)</Text>: Mixed autonomic activity - reflects stress and recovery{'\n'}
            • <Text style={styles.highlight}>Purple line (VLF Power)</Text>: Very low frequency - related to thermoregulation and hormones{'\n'}
            • <Text style={styles.highlight}>Real-time feedback</Text>: Watch how your breathing exercises affect HF power immediately
          </Text>
        </View>
      </View>
    );
  };

  const renderSpectralAnalysis = () => {
    const { timePower, frequency } = hrvData;
    
    // Check if we have time-power data
    const hasTimePower = timePower && timePower.timePoints && timePower.timePoints.length >= 2;
    
    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Spectral Analysis</Text>
        <Text style={styles.chartSubtitle}>Complete frequency domain analysis over time</Text>
        
        {/* Time-Power Plot Section */}
        {hasTimePower ? (
          <View>
            <Text style={styles.sectionTitle}>Power Over Time</Text>
            {renderTimePowerChart(timePower)}
          </View>
        ) : (
          <View style={styles.noDataSection}>
            <Text style={styles.noDataText}>Time-power analysis requires longer recording (&gt;2 minutes)</Text>
          </View>
        )}
        
        {/* Frequency Domain Summary Section */}
        {frequency && (
          <View style={styles.frequencySection}>
            <Text style={styles.sectionTitle}>Overall Power Distribution</Text>
            {renderFrequencyBars(frequency)}
            {renderFrequencyMetrics(frequency)}
          </View>
        )}
        
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>Complete Spectral View:</Text>
          <Text style={styles.explanationText}>
            This combined analysis shows both how your frequency power changes over time and the overall distribution across frequency bands.
          </Text>
          <Text style={styles.explanationText}>
            • <Text style={styles.highlight}>Time plot (top)</Text>: Shows when HF power increases during 0.1 Hz breathing{'\n'}
            • <Text style={styles.highlight}>Power bars (bottom)</Text>: Shows total power distribution across VLF, LF, and HF bands{'\n'}
            • <Text style={styles.highlight}>Same colors</Text>: Purple (VLF), Orange (LF), Green (HF) for easy comparison{'\n'}
            • <Text style={styles.highlight}>LF/HF Ratio</Text>: Lower values indicate better autonomic balance
          </Text>
        </View>
      </View>
    );
  };

  const renderTimePowerChart = (timePower) => {
    const timePoints = timePower.timePoints;
    const maxTime = Math.max(...timePoints.map(p => p.time));
    const maxVLF = Math.max(...timePoints.map(p => p.vlfPower));
    const maxLF = Math.max(...timePoints.map(p => p.lfPower));
    const maxHF = Math.max(...timePoints.map(p => p.hfPower));
    const maxPower = Math.max(maxVLF, maxLF, maxHF);
    
    const padding = 50;
    const plotWidth = chartWidth - 2 * padding;
    const plotHeight = 160; // Smaller height for combined view

    return (
      <View>
        <Svg width={chartWidth} height={plotHeight + 40} style={styles.chart}>
          {/* Background */}
          <Rect x={0} y={0} width={chartWidth} height={plotHeight + 40} fill="#0f0f1a" />
          
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
            <G key={`grid-${ratio}`}>
              <Line
                x1={padding}
                y1={20 + ratio * plotHeight}
                x2={padding + plotWidth}
                y2={20 + ratio * plotHeight}
                stroke="#333"
                strokeWidth={0.5}
              />
            </G>
          ))}
          
          {/* VLF Power Line */}
          {timePoints.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = timePoints[index - 1];
            const x1 = padding + (prevPoint.time / maxTime) * plotWidth;
            const x2 = padding + (point.time / maxTime) * plotWidth;
            const y1 = 20 + plotHeight - (prevPoint.vlfPower / maxPower) * plotHeight;
            const y2 = 20 + plotHeight - (point.vlfPower / maxPower) * plotHeight;
            
            return (
              <Line key={`vlf-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9C27B0" strokeWidth={2} />
            );
          })}
          
          {/* LF Power Line */}
          {timePoints.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = timePoints[index - 1];
            const x1 = padding + (prevPoint.time / maxTime) * plotWidth;
            const x2 = padding + (point.time / maxTime) * plotWidth;
            const y1 = 20 + plotHeight - (prevPoint.lfPower / maxPower) * plotHeight;
            const y2 = 20 + plotHeight - (point.lfPower / maxPower) * plotHeight;
            
            return (
              <Line key={`lf-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FF9800" strokeWidth={2} />
            );
          })}
          
          {/* HF Power Line */}
          {timePoints.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = timePoints[index - 1];
            const x1 = padding + (prevPoint.time / maxTime) * plotWidth;
            const x2 = padding + (point.time / maxTime) * plotWidth;
            const y1 = 20 + plotHeight - (prevPoint.hfPower / maxPower) * plotHeight;
            const y2 = 20 + plotHeight - (point.hfPower / maxPower) * plotHeight;
            
            return (
              <Line key={`hf-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4CAF50" strokeWidth={2.5} />
            );
          })}
          
          {/* Axis labels */}
          <SvgText x={padding} y={plotHeight + 35} fill="#888" fontSize="10">0s</SvgText>
          <SvgText x={padding + plotWidth - 30} y={plotHeight + 35} fill="#888" fontSize="10">{Math.round(maxTime)}s</SvgText>
        </Svg>
        
        {/* Time-Power Legend */}
        <View style={styles.timePowerLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#9C27B0' }]} />
            <Text style={styles.legendText}>VLF Power</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#FF9800' }]} />
            <Text style={styles.legendText}>LF Power</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.legendText}>HF Power (Breathing)</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderFrequencyBars = (frequency) => {
    const bands = [
      { name: 'VLF', value: frequency.vlfPower, color: '#9C27B0', desc: 'Very Low Frequency' },
      { name: 'LF', value: frequency.lfPower, color: '#FF9800', desc: 'Low Frequency' },
      { name: 'HF', value: frequency.hfPower, color: '#4CAF50', desc: 'High Frequency' }
    ];

    const total = bands.reduce((sum, band) => sum + band.value, 0);
    
    return (
      <View style={styles.frequencyBands}>
        {bands.map((band) => {
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
    );
  };

  const renderFrequencyMetrics = (frequency) => {
    return (
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
    );
  };

  const tabs = [
    { id: 'scatter', name: 'IBI Plot', icon: '📊' },
    { id: 'poincare', name: 'Poincaré', icon: '🎯' },
    { id: 'spectral', name: 'Spectral Analysis', icon: '🌊' },
    { id: 'psd', name: 'PSD Plot', icon: '📈' }
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
        {activeTab === 'spectral' && renderSpectralAnalysis()}
        {activeTab === 'psd' && renderPSDPlot()}
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
  // Time-Power plot styles
  timePowerLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#cccccc',
    fontWeight: '500',
  },
  // Combined spectral analysis styles
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 15,
    marginBottom: 10,
  },
  frequencySection: {
    marginTop: 20,
  },
  noDataSection: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 15,
    marginVertical: 10,
  },
  noDataText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
