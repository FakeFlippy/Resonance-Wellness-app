import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export default function DataScreen({ onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [showChart, setShowChart] = useState(false);

  const pickDocument = async () => {
    try {
      setIsLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
          'application/csv', // .csv alternative
          'text/comma-separated-values', // .csv alternative
          '*/*', // Allow all files as fallback
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile(file);

        // For now, just store file info - actual parsing will be implemented later
        setFileData({
          name: file.name,
          size: file.size,
          type: file.mimeType,
          uri: file.uri,
        });
        
        Alert.alert(
          'File Selected',
          `Successfully selected: ${file.name}\nSize: ${(file.size / 1024).toFixed(2)} KB`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setFileData(null);
  };

  const parseXLSXData = async (fileUri) => {
    try {
      console.log('Reading XLSX file from URI:', fileUri);
      
      // Read Excel file as base64
      const base64Data = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      console.log('XLSX file size (base64):', base64Data.length);
      
      // Simple XLSX parsing - this is a basic implementation
      // For production, you might want to use a more robust library
      try {
        // Convert base64 to binary
        const binaryString = atob(base64Data);
        
        // Look for worksheet data (this is a simplified approach)
        // XLSX files contain XML data that we can extract
        const sharedStringsMatch = binaryString.match(/<si><t[^>]*>([^<]*)<\/t><\/si>/g);
        const cellDataMatch = binaryString.match(/<c[^>]*r="[A-Z]+\d+"[^>]*><v>([^<]*)<\/v><\/c>/g);
        
        if (!cellDataMatch) {
          Alert.alert('Parse Error', 'Could not find data in XLSX file. Try using a CSV file instead.');
          return null;
        }
        
        // Extract cell values (simplified)
        const values = cellDataMatch.map(match => {
          const valueMatch = match.match(/<v>([^<]*)<\/v>/);
          return valueMatch ? parseFloat(valueMatch[1]) || valueMatch[1] : '';
        }).filter(val => val !== '');
        
        console.log('Extracted values:', values.slice(0, 10));
        
        if (values.length === 0) {
          Alert.alert('No Data', 'No numeric data found in XLSX file.');
          return null;
        }
        
        // Create simple data structure
        const headers = ['Value'];
        const data = values.map((value, index) => ({ Value: value }));
        
        return { headers, data };
        
      } catch (parseError) {
        console.error('XLSX parsing error:', parseError);
        Alert.alert('Parse Error', 'Could not parse XLSX file. Please try a CSV file instead.');
        return null;
      }
      
    } catch (error) {
      console.error('XLSX reading error:', error);
      Alert.alert('File Error', `Failed to read XLSX file: ${error.message}`);
      return null;
    }
  };

  const calculateHRVMetrics = (ibiData) => {
    if (!ibiData || ibiData.length < 2) return null;
    
    // Filter out zero values and convert to numbers
    const validIBI = ibiData.filter(val => val > 0 && !isNaN(val));
    if (validIBI.length < 2) return null;
    
    // Calculate successive differences
    const successiveDiffs = [];
    for (let i = 1; i < validIBI.length; i++) {
      successiveDiffs.push(Math.abs(validIBI[i] - validIBI[i-1]));
    }
    
    // RMSSD (Root Mean Square of Successive Differences)
    const sumSquaredDiffs = successiveDiffs.reduce((sum, diff) => sum + (diff * diff), 0);
    const rmssd = Math.sqrt(sumSquaredDiffs / successiveDiffs.length);
    
    // SDNN (Standard Deviation of NN intervals)
    const mean = validIBI.reduce((sum, val) => sum + val, 0) / validIBI.length;
    const variance = validIBI.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / validIBI.length;
    const sdnn = Math.sqrt(variance);
    
    // pNN50 (percentage of intervals >50ms different from previous)
    const nn50 = successiveDiffs.filter(diff => diff > 50).length;
    const pnn50 = (nn50 / successiveDiffs.length) * 100;
    
    // Heart Rate Variability Index
    const hrvIndex = sdnn / mean * 1000; // Normalized HRV index
    
    return {
      rmssd: Math.round(rmssd * 100) / 100,
      sdnn: Math.round(sdnn * 100) / 100,
      pnn50: Math.round(pnn50 * 100) / 100,
      hrvIndex: Math.round(hrvIndex * 100) / 100,
      meanIBI: Math.round(mean * 100) / 100,
      validSamples: validIBI.length
    };
  };

  const parseCSVData = async (fileUri) => {
    try {
      console.log('Reading file from URI:', fileUri);
      
      // Read CSV file as text
      const text = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      console.log('File content length:', text.length);
      console.log('First 200 chars:', text.substring(0, 200));
      
      const lines = text.split('\n').filter(line => line.trim());
      console.log('Number of lines:', lines.length);
      
      if (lines.length < 2) {
        console.log('Not enough lines in CSV');
        return null;
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      console.log('Headers:', headers);
      
      const data = lines.slice(1).map((line, lineIndex) => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((header, index) => {
          const value = values[index] || '';
          // Try to parse as number, otherwise keep as string
          const numValue = parseFloat(value);
          row[header] = isNaN(numValue) || value === '' ? value : numValue;
        });
        return row;
      }).filter(row => Object.values(row).some(val => val !== ''));
      
      console.log('Parsed data rows:', data.length);
      console.log('Sample row:', data[0]);
      
      // Detect data type based on headers
      const isSecondaryVitals = headers.includes('IBI (mS)') || headers.includes('IBI');
      const isVitals = headers.includes('HeartRate (bpm)') || headers.includes('Systolic (mmHg)');
      
      let hrvMetrics = null;
      if (isSecondaryVitals) {
        // Extract IBI data for HRV analysis
        const ibiColumn = headers.find(h => h.includes('IBI'));
        if (ibiColumn) {
          const ibiData = data.map(row => row[ibiColumn]).filter(val => val > 0);
          hrvMetrics = calculateHRVMetrics(ibiData);
          console.log('HRV Metrics calculated:', hrvMetrics);
        }
      }
      
      return { 
        headers, 
        data, 
        dataType: isSecondaryVitals ? 'secondary_vitals' : isVitals ? 'vitals' : 'unknown',
        hrvMetrics 
      };
    } catch (error) {
      console.error('CSV parsing error:', error);
      Alert.alert('Parse Error', `Failed to parse CSV: ${error.message}`);
      return null;
    }
  };

  const analyzeFile = async () => {
    if (!selectedFile) {
      Alert.alert('No File', 'Please select a file first.');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // For now, only handle CSV files
      console.log('Selected file:', selectedFile.name, 'MIME type:', selectedFile.mimeType);
      
      // Handle both CSV and XLSX files
      let parsedData = null;
      
      if (selectedFile.name.toLowerCase().endsWith('.csv') || 
          selectedFile.mimeType === 'text/csv' || 
          selectedFile.mimeType === 'application/csv' || 
          selectedFile.mimeType === 'text/comma-separated-values') {
        console.log('Processing as CSV file');
        parsedData = await parseCSVData(selectedFile.uri);
      } else if (selectedFile.name.toLowerCase().endsWith('.xlsx') || 
                 selectedFile.name.toLowerCase().endsWith('.xls') ||
                 selectedFile.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                 selectedFile.mimeType === 'application/vnd.ms-excel') {
        console.log('Processing as XLSX file');
        parsedData = await parseXLSXData(selectedFile.uri);
      } else {
        Alert.alert(
          'Unsupported File Type',
          'Please select a CSV (.csv) or Excel (.xlsx, .xls) file.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      if (parsedData) {
        // Find numeric columns for charting
        const numericColumns = parsedData.headers.filter(header => {
          return parsedData.data.some(row => typeof row[header] === 'number');
        });
        
        if (numericColumns.length > 0) {
          // Create simple chart data using first numeric column
          const firstNumericCol = numericColumns[0];
          const chartPoints = parsedData.data
            .map((row, index) => ({
              x: index,
              y: typeof row[firstNumericCol] === 'number' ? row[firstNumericCol] : 0
            }))
            .filter(point => !isNaN(point.y))
            .slice(0, 50); // Limit to first 50 points for performance
          
          const wellnessInsights = [];
          if (parsedData.dataType === 'secondary_vitals') {
            if (parsedData.hrvMetrics) {
              if (parsedData.hrvMetrics.rmssd > 50) {
                wellnessInsights.push('Your heart rate variability is high, indicating good parasympathetic activity.');
              } else {
                wellnessInsights.push('Your heart rate variability is low, indicating potential stress or fatigue.');
              }
              if (parsedData.hrvMetrics.sdnn > 50) {
                wellnessInsights.push('Your overall heart rate variability is high, indicating good cardiovascular fitness.');
              } else {
                wellnessInsights.push('Your overall heart rate variability is low, indicating potential cardiovascular risk.');
              }
            }
          } else if (parsedData.dataType === 'vitals') {
            if (parsedData.data.some(row => row[firstNumericCol] > 100)) {
              wellnessInsights.push('Your heart rate is elevated, indicating potential stress or physical activity.');
            } else {
              wellnessInsights.push('Your heart rate is normal, indicating good cardiovascular health.');
            }
          }
          
          setChartData({
            points: chartPoints,
            columnName: firstNumericCol,
            minY: Math.min(...chartPoints.map(p => p.y)),
            maxY: Math.max(...chartPoints.map(p => p.y)),
            avgY: (chartPoints.reduce((sum, p) => sum + p.y, 0) / chartPoints.length),
            hrvMetrics: parsedData.hrvMetrics,
            dataType: parsedData.dataType,
            wellnessInsights
          });
          setShowChart(true);
        } else {
          Alert.alert('No Data', 'No numeric columns found for charting.');
        }
      } else {
        Alert.alert('Parse Error', 'Could not parse the selected file.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to analyze file: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Data Analysis</Text>
        <Text style={styles.subtitle}>Import and analyze Excel files</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        
        {/* File Picker Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📁 File Selection</Text>
          <Text style={styles.sectionDescription}>
            Select Excel (.xlsx, .xls) or CSV files from your device
          </Text>
          
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={pickDocument}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Selecting...' : '📂 Select File'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Selected File Info */}
        {selectedFile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📄 Selected File</Text>
            <View style={styles.fileInfo}>
              <Text style={styles.fileName}>{fileData.name}</Text>
              <Text style={styles.fileDetails}>
                Size: {(fileData.size / 1024).toFixed(2)} KB
              </Text>
              <Text style={styles.fileDetails}>
                Type: {fileData.type || 'Unknown'}
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={clearFile}
              >
                <Text style={styles.buttonText}>🗑️ Clear</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={analyzeFile}
              >
                <Text style={styles.buttonText}>📊 Analyze</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* HRV Analysis */}
        {showChart && chartData && chartData.hrvMetrics && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>❤️ HRV Analysis</Text>
            <Text style={styles.sectionDescription}>
              Heart Rate Variability metrics calculated from IBI data
            </Text>
            
            <View style={styles.hrvMetricsContainer}>
              <View style={styles.hrvMetricRow}>
                <View style={styles.hrvMetric}>
                  <Text style={styles.hrvMetricValue}>{chartData.hrvMetrics.rmssd}</Text>
                  <Text style={styles.hrvMetricLabel}>RMSSD (ms)</Text>
                  <Text style={styles.hrvMetricDesc}>Parasympathetic activity</Text>
                </View>
                <View style={styles.hrvMetric}>
                  <Text style={styles.hrvMetricValue}>{chartData.hrvMetrics.sdnn}</Text>
                  <Text style={styles.hrvMetricLabel}>SDNN (ms)</Text>
                  <Text style={styles.hrvMetricDesc}>Overall HRV</Text>
                </View>
              </View>
              
              <View style={styles.hrvMetricRow}>
                <View style={styles.hrvMetric}>
                  <Text style={styles.hrvMetricValue}>{chartData.hrvMetrics.pnn50}%</Text>
                  <Text style={styles.hrvMetricLabel}>pNN50</Text>
                  <Text style={styles.hrvMetricDesc}>Stress indicator</Text>
                </View>
                <View style={styles.hrvMetric}>
                  <Text style={styles.hrvMetricValue}>{chartData.hrvMetrics.hrvIndex}</Text>
                  <Text style={styles.hrvMetricLabel}>HRV Index</Text>
                  <Text style={styles.hrvMetricDesc}>Normalized variability</Text>
                </View>
              </View>
              
              <View style={styles.hrvSummary}>
                <Text style={styles.hrvSummaryText}>
                  📊 Analysis based on {chartData.hrvMetrics.validSamples} valid IBI samples
                </Text>
                <Text style={styles.hrvSummaryText}>
                  💓 Mean IBI: {chartData.hrvMetrics.meanIBI} ms
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Wellness Insights */}
        {showChart && chartData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🌱 Wellness Insights</Text>
            <Text style={styles.sectionDescription}>
              Based on your {chartData.dataType === 'secondary_vitals' ? 'cardiac' : 'vital signs'} data analysis:
            </Text>
            
            <View style={styles.summaryContainer}>
              {/* Wellness Insights Display */}
              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>💡 Your Health Insights</Text>
                {chartData.wellnessInsights && chartData.wellnessInsights.map((insight, index) => (
                  <Text key={index} style={styles.summaryText}>• {insight}</Text>
                ))}
              </View>
              
              {/* Data Overview */}
              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>📊 Data Overview</Text>
                <Text style={styles.summaryText}>
                  📈 Analyzed {chartData.points.length} data points from {chartData.columnName}
                </Text>
                <Text style={styles.summaryText}>
                  📊 Range: {chartData.minY.toFixed(1)} - {chartData.maxY.toFixed(1)} (Average: {chartData.avgY.toFixed(1)})
                </Text>
                <Text style={styles.summaryText}>
                  🎯 Data Type: {chartData.dataType === 'secondary_vitals' ? 'Advanced Cardiac Measurements' : 
                                chartData.dataType === 'vitals' ? 'Basic Vital Signs' : 'General Health Data'}
                </Text>
              </View>
              
              {/* Recommendations */}
              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>🎯 Recommendations</Text>
                {chartData.dataType === 'secondary_vitals' && (
                  <>
                    <Text style={styles.summaryText}>🧘‍♀️ Practice the 0.1 Hz breathing exercises in this app to improve HRV</Text>
                    <Text style={styles.summaryText}>💤 Ensure adequate sleep (7-9 hours) for optimal recovery</Text>
                    <Text style={styles.summaryText}>🏃‍♂️ Regular moderate exercise can improve heart rate variability</Text>
                  </>
                )}
                {chartData.dataType === 'vitals' && (
                  <>
                    <Text style={styles.summaryText}>🫁 Use breathing exercises to help regulate heart rate and blood pressure</Text>
                    <Text style={styles.summaryText}>🥗 Maintain a balanced diet for optimal vital signs</Text>
                    <Text style={styles.summaryText}>💧 Stay hydrated throughout the day</Text>
                  </>
                )}
                <Text style={styles.summaryText}>📋 Consult with a healthcare provider for detailed medical interpretation</Text>
              </View>
            </View>
            
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => setShowChart(false)}
              >
                <Text style={styles.buttonText}>Hide Insights</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Data Summary */}
        {showChart && chartData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Data Summary</Text>
            <Text style={styles.sectionDescription}>
              {chartData.dataType === 'secondary_vitals' ? 'Secondary Vitals Analysis' : 
               chartData.dataType === 'vitals' ? 'Vitals Analysis' : 'Data Analysis'} 
              ({chartData.points.length} data points)
            </Text>
            
            <View style={styles.summaryContainer}>
              {/* Key Statistics */}
              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>📈 Key Statistics</Text>
                <View style={styles.statRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{chartData.points.length}</Text>
                    <Text style={styles.statLabel}>Total Samples</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{chartData.maxY.toFixed(1)}</Text>
                    <Text style={styles.statLabel}>Maximum</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{chartData.minY.toFixed(1)}</Text>
                    <Text style={styles.statLabel}>Minimum</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{((chartData.maxY + chartData.minY) / 2).toFixed(1)}</Text>
                    <Text style={styles.statLabel}>Average</Text>
                  </View>
                </View>
              </View>
              
              {/* Data Type Specific Info */}
              {chartData.dataType === 'vitals' && (
                <View style={styles.summarySection}>
                  <Text style={styles.summarySectionTitle}>💓 Vitals Overview</Text>
                  <Text style={styles.summaryText}>
                    This file contains vital signs data including blood pressure, heart rate, and respiration measurements.
                  </Text>
                  <Text style={styles.summaryText}>
                    📊 Primary metric: {chartData.columnName}
                  </Text>
                </View>
              )}
              
              {chartData.dataType === 'secondary_vitals' && (
                <View style={styles.summarySection}>
                  <Text style={styles.summarySectionTitle}>🫀 Cardiac Analysis</Text>
                  <Text style={styles.summaryText}>
                    This file contains advanced cardiac measurements including Inter-Beat Intervals (IBI) for HRV analysis.
                  </Text>
                  <Text style={styles.summaryText}>
                    📊 Primary metric: {chartData.columnName}
                  </Text>
                </View>
              )}
              
              {/* Data Quality */}
              <View style={styles.summarySection}>
                <Text style={styles.summarySectionTitle}>✅ Data Quality</Text>
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityGood}>• Data successfully parsed</Text>
                  <Text style={styles.qualityGood}>• {chartData.points.length} valid measurements</Text>
                  <Text style={styles.qualityGood}>• Ready for analysis</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => setShowChart(false)}
              >
                <Text style={styles.buttonText}>Hide Summary</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💡 Instructions</Text>
          <Text style={styles.instructionText}>
            1. Tap "Select File" to choose an Excel or CSV file
          </Text>
          <Text style={styles.instructionText}>
            2. Review the file information displayed
          </Text>
          <Text style={styles.instructionText}>
            3. Tap "Analyze" to process the data
          </Text>
          <Text style={styles.instructionText}>
            4. View results and insights
          </Text>
        </View>

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
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 20,
    position: 'relative',
    width: '100%',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 20,
    padding: 10,
  },
  backButtonText: {
    color: '#2196F3',
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#2a2a3e',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
  },
  sectionDescription: {
    fontSize: 16,
    color: '#cccccc',
    marginBottom: 20,
    lineHeight: 22,
  },
  button: {
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
    minWidth: 120,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  secondaryButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fileInfo: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  fileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  fileDetails: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 15,
  },
  featureList: {
    marginTop: 10,
  },
  featureItem: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 5,
    paddingLeft: 10,
  },
  instructionText: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 8,
    lineHeight: 20,
  },
  // Data Summary styles
  summaryContainer: {
    marginTop: 10,
  },
  summarySection: {
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  summarySectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 8,
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  qualityRow: {
    marginTop: 5,
  },
  qualityGood: {
    fontSize: 14,
    color: '#4CAF50',
    marginBottom: 5,
  },
  // HRV Analysis styles
  hrvMetricsContainer: {
    marginTop: 10,
  },
  hrvMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  hrvMetric: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 15,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  hrvMetricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 5,
  },
  hrvMetricLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 3,
  },
  hrvMetricDesc: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
  },
  hrvSummary: {
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 15,
    marginTop: 10,
  },
  hrvSummaryText: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 5,
    textAlign: 'center',
  },
});
