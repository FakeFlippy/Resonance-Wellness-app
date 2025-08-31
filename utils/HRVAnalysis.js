// HRV Analysis Utilities - Kubios-inspired implementation
// Provides comprehensive heart rate variability analysis from IBI data

/**
 * Calculate comprehensive HRV metrics from IBI data
 * @param {Array} ibiData - Array of Inter-Beat Intervals in milliseconds
 * @returns {Object} Complete HRV analysis results
 */
export const calculateAdvancedHRVMetrics = (ibiData) => {
  if (!ibiData || ibiData.length < 10) {
    return null;
  }

  // Filter and validate IBI data
  const validIBI = ibiData
    .filter(val => val > 0 && val < 3000 && !isNaN(val)) // Remove outliers and invalid values
    .map(val => parseFloat(val));

  if (validIBI.length < 10) {
    return null;
  }

  // Calculate successive differences (NN intervals)
  const successiveDiffs = [];
  for (let i = 1; i < validIBI.length; i++) {
    successiveDiffs.push(validIBI[i] - validIBI[i-1]);
  }

  // Time Domain Metrics
  const timeMetrics = calculateTimeDomainMetrics(validIBI, successiveDiffs);
  
  // Geometric Metrics
  const geometricMetrics = calculateGeometricMetrics(validIBI, successiveDiffs);
  
  // Frequency Domain Metrics (simplified)
  const frequencyMetrics = calculateFrequencyDomainMetrics(validIBI);
  
  // Poincaré Plot Metrics
  const poincareMetrics = calculatePoincareMetrics(successiveDiffs);

  return {
    timeDomain: timeMetrics,
    geometric: geometricMetrics,
    frequency: frequencyMetrics,
    poincare: poincareMetrics,
    rawData: {
      ibiValues: validIBI,
      successiveDiffs: successiveDiffs,
      sampleCount: validIBI.length,
      duration: (validIBI.reduce((sum, val) => sum + val, 0) / 1000).toFixed(1) // seconds
    }
  };
};

/**
 * Calculate time domain HRV metrics
 */
const calculateTimeDomainMetrics = (ibiData, successiveDiffs) => {
  const n = ibiData.length;
  const mean = ibiData.reduce((sum, val) => sum + val, 0) / n;
  
  // SDNN - Standard deviation of NN intervals
  const variance = ibiData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
  const sdnn = Math.sqrt(variance);
  
  // RMSSD - Root mean square of successive differences
  const sumSquaredDiffs = successiveDiffs.reduce((sum, diff) => sum + (diff * diff), 0);
  const rmssd = Math.sqrt(sumSquaredDiffs / successiveDiffs.length);
  
  // pNN50 - Percentage of intervals >50ms different from previous
  const nn50 = successiveDiffs.filter(diff => Math.abs(diff) > 50).length;
  const pnn50 = (nn50 / successiveDiffs.length) * 100;
  
  // pNN20 - Percentage of intervals >20ms different from previous
  const nn20 = successiveDiffs.filter(diff => Math.abs(diff) > 20).length;
  const pnn20 = (nn20 / successiveDiffs.length) * 100;
  
  // SDSD - Standard deviation of successive differences
  const meanDiff = successiveDiffs.reduce((sum, val) => sum + val, 0) / successiveDiffs.length;
  const sdsd = Math.sqrt(successiveDiffs.reduce((sum, val) => sum + Math.pow(val - meanDiff, 2), 0) / (successiveDiffs.length - 1));
  
  // Heart Rate statistics
  const heartRates = ibiData.map(ibi => 60000 / ibi); // Convert IBI to HR
  const meanHR = heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length;
  const minHR = Math.min(...heartRates);
  const maxHR = Math.max(...heartRates);
  
  return {
    meanNN: Math.round(mean * 100) / 100,
    sdnn: Math.round(sdnn * 100) / 100,
    rmssd: Math.round(rmssd * 100) / 100,
    pnn50: Math.round(pnn50 * 100) / 100,
    pnn20: Math.round(pnn20 * 100) / 100,
    sdsd: Math.round(sdsd * 100) / 100,
    meanHR: Math.round(meanHR * 10) / 10,
    minHR: Math.round(minHR * 10) / 10,
    maxHR: Math.round(maxHR * 10) / 10
  };
};

/**
 * Calculate geometric HRV metrics
 */
const calculateGeometricMetrics = (ibiData, successiveDiffs) => {
  // Triangular Index (simplified approximation)
  const binWidth = 7.8125; // Standard bin width in ms
  const histogram = createHistogram(ibiData, binWidth);
  const maxBin = Math.max(...Object.values(histogram));
  const triangularIndex = ibiData.length / maxBin;
  
  // TINN - Triangular Interpolation of NN interval histogram (approximation)
  const sortedBins = Object.keys(histogram).map(Number).sort((a, b) => a - b);
  const tinn = sortedBins[sortedBins.length - 1] - sortedBins[0];
  
  return {
    triangularIndex: Math.round(triangularIndex * 100) / 100,
    tinn: Math.round(tinn * 100) / 100
  };
};

/**
 * Calculate frequency domain metrics (simplified implementation)
 */
const calculateFrequencyDomainMetrics = (ibiData) => {
  // This is a simplified implementation
  // In a full Kubios implementation, this would use FFT
  
  // Estimate power in different frequency bands
  const meanIBI = ibiData.reduce((sum, val) => sum + val, 0) / ibiData.length;
  const variance = ibiData.reduce((sum, val) => sum + Math.pow(val - meanIBI, 2), 0) / ibiData.length;
  
  // Rough approximations for frequency bands
  const totalPower = variance;
  const vlfPower = totalPower * 0.3; // Very Low Frequency (0.003-0.04 Hz)
  const lfPower = totalPower * 0.4;  // Low Frequency (0.04-0.15 Hz)
  const hfPower = totalPower * 0.3;  // High Frequency (0.15-0.4 Hz)
  const lfhfRatio = lfPower / hfPower;
  
  return {
    totalPower: Math.round(totalPower),
    vlfPower: Math.round(vlfPower),
    lfPower: Math.round(lfPower),
    hfPower: Math.round(hfPower),
    lfhfRatio: Math.round(lfhfRatio * 100) / 100,
    lfNorm: Math.round((lfPower / (lfPower + hfPower)) * 100 * 100) / 100,
    hfNorm: Math.round((hfPower / (lfPower + hfPower)) * 100 * 100) / 100
  };
};

/**
 * Calculate Poincaré plot metrics
 */
const calculatePoincareMetrics = (successiveDiffs) => {
  if (successiveDiffs.length < 2) return null;
  
  // SD1 and SD2 calculations
  const rr1 = successiveDiffs.slice(0, -1);
  const rr2 = successiveDiffs.slice(1);
  
  // Calculate differences for SD1 and SD2
  const diff1 = rr1.map((val, i) => val - rr2[i]);
  const sum1 = rr1.map((val, i) => val + rr2[i]);
  
  // SD1 (width of the cloud) - short-term variability
  const sd1Variance = diff1.reduce((sum, val) => sum + val * val, 0) / diff1.length;
  const sd1 = Math.sqrt(sd1Variance) / Math.sqrt(2);
  
  // SD2 (length of the cloud) - long-term variability
  const sd2Variance = sum1.reduce((sum, val) => sum + val * val, 0) / sum1.length;
  const sd2 = Math.sqrt(sd2Variance) / Math.sqrt(2);
  
  // SD1/SD2 ratio
  const sd1sd2Ratio = sd1 / sd2;
  
  // Ellipse area
  const ellipseArea = Math.PI * sd1 * sd2;
  
  return {
    sd1: Math.round(sd1 * 100) / 100,
    sd2: Math.round(sd2 * 100) / 100,
    sd1sd2Ratio: Math.round(sd1sd2Ratio * 1000) / 1000,
    ellipseArea: Math.round(ellipseArea)
  };
};

/**
 * Create histogram for geometric analysis
 */
const createHistogram = (data, binWidth) => {
  const histogram = {};
  const minVal = Math.min(...data);
  
  data.forEach(val => {
    const bin = Math.floor((val - minVal) / binWidth) * binWidth + minVal;
    histogram[bin] = (histogram[bin] || 0) + 1;
  });
  
  return histogram;
};

/**
 * Generate data for IBI scatter plot visualization
 */
export const generateIBIScatterData = (ibiData) => {
  if (!ibiData || ibiData.length < 2) return null;
  
  return ibiData.map((ibi, index) => ({
    x: index,
    y: ibi,
    heartRate: Math.round(60000 / ibi * 10) / 10
  }));
};

/**
 * Generate data for Poincaré plot visualization
 */
export const generatePoincareData = (ibiData) => {
  if (!ibiData || ibiData.length < 2) return null;
  
  const points = [];
  for (let i = 0; i < ibiData.length - 1; i++) {
    points.push({
      x: ibiData[i],
      y: ibiData[i + 1],
      index: i
    });
  }
  
  return points;
};

/**
 * Generate data for IBI histogram
 */
export const generateIBIHistogram = (ibiData, binCount = 20) => {
  if (!ibiData || ibiData.length < 2) return null;
  
  const minVal = Math.min(...ibiData);
  const maxVal = Math.max(...ibiData);
  const binWidth = (maxVal - minVal) / binCount;
  
  const bins = Array(binCount).fill(0).map((_, i) => ({
    start: minVal + i * binWidth,
    end: minVal + (i + 1) * binWidth,
    count: 0,
    center: minVal + (i + 0.5) * binWidth
  }));
  
  ibiData.forEach(val => {
    const binIndex = Math.min(Math.floor((val - minVal) / binWidth), binCount - 1);
    bins[binIndex].count++;
  });
  
  return bins;
};

/**
 * Assess HRV quality and provide interpretations
 */
export const assessHRVQuality = (hrvMetrics) => {
  if (!hrvMetrics) return null;
  
  const { timeDomain, poincare } = hrvMetrics;
  const assessments = [];
  
  // RMSSD assessment
  if (timeDomain.rmssd > 50) {
    assessments.push({
      metric: 'RMSSD',
      value: timeDomain.rmssd,
      status: 'excellent',
      interpretation: 'High parasympathetic activity - excellent recovery capacity'
    });
  } else if (timeDomain.rmssd > 30) {
    assessments.push({
      metric: 'RMSSD',
      value: timeDomain.rmssd,
      status: 'good',
      interpretation: 'Good parasympathetic activity - healthy recovery'
    });
  } else if (timeDomain.rmssd > 15) {
    assessments.push({
      metric: 'RMSSD',
      value: timeDomain.rmssd,
      status: 'fair',
      interpretation: 'Moderate parasympathetic activity - consider stress management'
    });
  } else {
    assessments.push({
      metric: 'RMSSD',
      value: timeDomain.rmssd,
      status: 'poor',
      interpretation: 'Low parasympathetic activity - may indicate stress or fatigue'
    });
  }
  
  // SDNN assessment
  if (timeDomain.sdnn > 50) {
    assessments.push({
      metric: 'SDNN',
      value: timeDomain.sdnn,
      status: 'excellent',
      interpretation: 'Excellent overall heart rate variability'
    });
  } else if (timeDomain.sdnn > 30) {
    assessments.push({
      metric: 'SDNN',
      value: timeDomain.sdnn,
      status: 'good',
      interpretation: 'Good overall heart rate variability'
    });
  } else {
    assessments.push({
      metric: 'SDNN',
      value: timeDomain.sdnn,
      status: 'fair',
      interpretation: 'Lower overall variability - focus on recovery practices'
    });
  }
  
  // Poincaré assessment
  if (poincare && poincare.sd1sd2Ratio) {
    if (poincare.sd1sd2Ratio > 0.5) {
      assessments.push({
        metric: 'SD1/SD2',
        value: poincare.sd1sd2Ratio,
        status: 'good',
        interpretation: 'Balanced short-term vs long-term variability'
      });
    } else {
      assessments.push({
        metric: 'SD1/SD2',
        value: poincare.sd1sd2Ratio,
        status: 'attention',
        interpretation: 'Imbalanced variability pattern - monitor stress levels'
      });
    }
  }
  
  return assessments;
};
