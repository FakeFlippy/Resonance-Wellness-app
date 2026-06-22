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

  // Time-domain power analysis
  const timePowerData = calculateTimeDomainPower(validIBI);

  return {
    timeDomain: timeMetrics,
    geometric: geometricMetrics,
    frequency: frequencyMetrics,
    poincare: poincareMetrics,
    timePower: timePowerData,
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
 * Calculate frequency domain metrics using FFT and PSD
 */
const calculateFrequencyDomainMetrics = (ibiData) => {
  if (ibiData.length < 32) {
    // Fallback to simplified method for short data
    return calculateSimplifiedFrequencyMetrics(ibiData);
  }

  try {
    // Convert IBI to RR intervals and interpolate for uniform sampling
    const { interpolatedRR, sampleRate } = interpolateRRIntervals(ibiData);
    
    // Apply window function (Hanning window)
    const windowedData = applyHanningWindow(interpolatedRR);
    
    // Perform FFT using custom implementation
    const fftResult = performFFT(windowedData);
    
    // Calculate Power Spectral Density
    const psd = calculatePSD(fftResult, sampleRate);
    
    // Integrate power in frequency bands
    const frequencyBands = integratePowerBands(psd, sampleRate);
    
    return {
      ...frequencyBands,
      psdData: psd.slice(0, Math.floor(psd.length / 2)), // Only positive frequencies
      sampleRate: sampleRate
    };
  } catch (error) {
    console.warn('FFT calculation failed, using simplified method:', error);
    return calculateSimplifiedFrequencyMetrics(ibiData);
  }
};

/**
 * Simplified frequency domain calculation (fallback)
 */
const calculateSimplifiedFrequencyMetrics = (ibiData) => {
  const meanIBI = ibiData.reduce((sum, val) => sum + val, 0) / ibiData.length;
  const variance = ibiData.reduce((sum, val) => sum + Math.pow(val - meanIBI, 2), 0) / ibiData.length;
  
  const totalPower = variance;
  const vlfPower = totalPower * 0.3;
  const lfPower = totalPower * 0.4;
  const hfPower = totalPower * 0.3;
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
 * Interpolate RR intervals to uniform sampling rate
 */
const interpolateRRIntervals = (ibiData) => {
  // Convert IBI to cumulative time
  const cumulativeTime = [0];
  for (let i = 0; i < ibiData.length; i++) {
    cumulativeTime.push(cumulativeTime[i] + ibiData[i] / 1000); // Convert ms to seconds
  }
  
  // Target sample rate (8 Hz for better frequency resolution at 0.1 Hz)
  const sampleRate = 8;
  const totalDuration = cumulativeTime[cumulativeTime.length - 1];
  const numSamples = Math.floor(totalDuration * sampleRate);
  
  const interpolatedRR = new Array(numSamples);
  const timeStep = 1 / sampleRate;
  
  for (let i = 0; i < numSamples; i++) {
    const targetTime = i * timeStep;
    
    // Find surrounding IBI values
    let leftIndex = 0;
    for (let j = 0; j < cumulativeTime.length - 1; j++) {
      if (cumulativeTime[j] <= targetTime && targetTime < cumulativeTime[j + 1]) {
        leftIndex = j;
        break;
      }
    }
    
    // Linear interpolation
    if (leftIndex < ibiData.length - 1) {
      const t1 = cumulativeTime[leftIndex];
      const t2 = cumulativeTime[leftIndex + 1];
      const v1 = ibiData[leftIndex];
      const v2 = ibiData[leftIndex + 1];
      
      const weight = (targetTime - t1) / (t2 - t1);
      interpolatedRR[i] = v1 + weight * (v2 - v1);
    } else {
      interpolatedRR[i] = ibiData[ibiData.length - 1];
    }
  }
  
  return { interpolatedRR, sampleRate };
};

/**
 * Apply Hanning window to reduce spectral leakage
 */
const applyHanningWindow = (data) => {
  const N = data.length;
  const windowedData = new Array(N);
  
  for (let i = 0; i < N; i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    windowedData[i] = data[i] * window;
  }
  
  return windowedData;
};

/**
 * Custom FFT implementation for React Native compatibility
 */
const performFFT = (data) => {
  const N = data.length;
  
  // Ensure power of 2 length
  const paddedLength = Math.pow(2, Math.ceil(Math.log2(N)));
  const paddedData = new Array(paddedLength);
  
  for (let i = 0; i < paddedLength; i++) {
    paddedData[i] = i < N ? [data[i], 0] : [0, 0]; // [real, imaginary]
  }
  
  return cooleyTukeyFFT(paddedData);
};

/**
 * Cooley-Tukey FFT algorithm implementation
 */
const cooleyTukeyFFT = (x) => {
  const N = x.length;
  
  if (N <= 1) return x;
  
  // Divide
  const even = new Array(N / 2);
  const odd = new Array(N / 2);
  
  for (let i = 0; i < N / 2; i++) {
    even[i] = x[2 * i];
    odd[i] = x[2 * i + 1];
  }
  
  // Conquer
  const evenFFT = cooleyTukeyFFT(even);
  const oddFFT = cooleyTukeyFFT(odd);
  
  // Combine
  const result = new Array(N);
  
  for (let k = 0; k < N / 2; k++) {
    const angle = -2 * Math.PI * k / N;
    const twiddle = [Math.cos(angle), Math.sin(angle)];
    
    // Complex multiplication: twiddle * oddFFT[k]
    const twiddledOdd = [
      twiddle[0] * oddFFT[k][0] - twiddle[1] * oddFFT[k][1],
      twiddle[0] * oddFFT[k][1] + twiddle[1] * oddFFT[k][0]
    ];
    
    // Complex addition and subtraction
    result[k] = [
      evenFFT[k][0] + twiddledOdd[0],
      evenFFT[k][1] + twiddledOdd[1]
    ];
    
    result[k + N / 2] = [
      evenFFT[k][0] - twiddledOdd[0],
      evenFFT[k][1] - twiddledOdd[1]
    ];
  }
  
  return result;
};

/**
 * Calculate Power Spectral Density from FFT result
 */
const calculatePSD = (fftResult, sampleRate) => {
  const N = fftResult.length;
  const psd = new Array(N);
  
  for (let i = 0; i < N; i++) {
    const real = fftResult[i][0];
    const imag = fftResult[i][1];
    const magnitude = Math.sqrt(real * real + imag * imag);
    psd[i] = (magnitude * magnitude) / (sampleRate * N);
  }
  
  return psd;
};

/**
 * Integrate power in VLF, LF, and HF frequency bands
 */
const integratePowerBands = (psd, sampleRate) => {
  const N = psd.length;
  const freqResolution = sampleRate / (2 * N);
  
  // Frequency band definitions (Hz)
  const vlfRange = [0.003, 0.04];
  const lfRange = [0.04, 0.15];
  const hfRange = [0.15, 0.4];
  
  let vlfPower = 0;
  let lfPower = 0;
  let hfPower = 0;
  
  // Only use positive frequencies (first half of PSD)
  const halfN = Math.floor(N / 2);
  
  // Define 0.167 Hz filter parameters (±0.01 Hz around 0.167 Hz)
  const filterFreq = 0.167;
  const filterBandwidth = 0.01; // ±10 mHz around 0.167 Hz
  const filterLow = filterFreq - filterBandwidth;
  const filterHigh = filterFreq + filterBandwidth;
  
  for (let i = 1; i < halfN; i++) {
    const frequency = i * freqResolution;
    const power = psd[i] * 2; // Multiply by 2 for single-sided spectrum
    
    // Check if frequency is in the 0.167 Hz filter range
    const isFiltered = frequency >= filterLow && frequency <= filterHigh;
    
    if (frequency >= vlfRange[0] && frequency < vlfRange[1]) {
      vlfPower += power;
    } else if (frequency >= lfRange[0] && frequency < lfRange[1]) {
      lfPower += power;
    } else if (frequency >= hfRange[0] && frequency < hfRange[1] && !isFiltered) {
      // Only add to HF power if NOT in the 0.167 Hz filter range
      hfPower += power;
    }
  }
  
  const totalPower = vlfPower + lfPower + hfPower;
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

/**
 * Calculate time-domain power analysis using sliding windows
 */
const calculateTimeDomainPower = (ibiData) => {
  if (ibiData.length < 60) {
    return null; // Need sufficient data for meaningful windows
  }

  const windowSizeSeconds = 30; // 30-second windows
  const stepSizeSeconds = 5;    // 5-second steps (overlapping windows)
  
  // Convert IBI to cumulative time
  const cumulativeTime = [0];
  for (let i = 0; i < ibiData.length; i++) {
    cumulativeTime.push(cumulativeTime[i] + ibiData[i] / 1000);
  }
  
  const totalDuration = cumulativeTime[cumulativeTime.length - 1];
  const timePoints = [];
  
  // Sliding window analysis
  for (let t = windowSizeSeconds; t <= totalDuration - windowSizeSeconds; t += stepSizeSeconds) {
    const windowStart = t - windowSizeSeconds;
    const windowEnd = t;
    
    // Extract IBI data for this time window
    const windowIBI = [];
    for (let i = 0; i < ibiData.length; i++) {
      const beatTime = cumulativeTime[i];
      if (beatTime >= windowStart && beatTime < windowEnd) {
        windowIBI.push(ibiData[i]);
      }
    }
    
    if (windowIBI.length >= 20) { // Minimum beats for reliable analysis
      try {
        // Calculate frequency metrics for this window
        const windowFreq = calculateFrequencyDomainMetrics(windowIBI);
        
        timePoints.push({
          time: t,
          vlfPower: windowFreq.vlfPower || 0,
          lfPower: windowFreq.lfPower || 0,
          hfPower: windowFreq.hfPower || 0,
          totalPower: windowFreq.totalPower || 0,
          lfhfRatio: windowFreq.lfhfRatio || 0,
          beatCount: windowIBI.length
        });
      } catch (error) {
        // Skip this window if calculation fails
        console.warn('Window analysis failed at time', t, error);
      }
    }
  }
  
  return {
    timePoints: timePoints,
    windowSize: windowSizeSeconds,
    stepSize: stepSizeSeconds,
    totalDuration: totalDuration
  };
};
