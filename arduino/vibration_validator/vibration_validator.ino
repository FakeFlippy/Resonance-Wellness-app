/*
  Vibration Validator for Vsb Protocol Device
  Target: Seeed XIAO nRF52840 (or any Arduino-compatible board)

  Purpose:
  - Sample a piezoelectric vibration sensor at 2000 Hz.
  - Estimate vibrator frequency in real time using zero-crossing.
  - Capture high-resolution CSV bursts for Python FFT analysis.
  - Provide LED pass/fail feedback for 100–135 Hz acceptance band.

  Hardware connections:
  - Piezo disc positive  -> A0
  - Piezo disc negative  -> GND
  - 1M ohm resistor      -> between A0 and GND (bleeds charge, protects ADC)
  - Built-in LED         -> LED_BUILTIN (used for pass/fail indicator)

  How to use:
  1. Upload sketch.
  2. Open Serial Monitor (115200 baud).
  3. Hold vibrator tip firmly against the piezo disc.
  4. Watch live frequency estimates printed every ~500 ms.
  5. Send 'c' to capture a 3-second CSV burst for Python analysis.
  6. Copy CSV block, save as vibration_capture.csv, run plot_vibration.py.

  Safety note:
  - Piezo discs can produce high voltages under strong impact.
  - The 1M bleed resistor and gentle contact with the vibrator should keep
    voltages within the 3.3 V ADC range, but avoid striking or tapping the disc.
*/

#include <Arduino.h>
#include <SPI.h>

const int SENSOR_PIN = A0;
const int LED_PIN = LED_BUILTIN;

// Sampling parameters
const unsigned long TARGET_SAMPLE_RATE_HZ = 2000;          // Hz
const unsigned long SAMPLE_INTERVAL_US = 1000000UL / TARGET_SAMPLE_RATE_HZ; // 500 us
const unsigned long CAPTURE_DURATION_MS = 3000;            // 3-second CSV burst
const unsigned long REPORT_INTERVAL_MS = 500;            // Live report every 500 ms

// Frequency acceptance band (Hz)
const float FREQ_MIN_HZ = 100.0f;
const float FREQ_MAX_HZ = 135.0f;

// Real-time estimator state
float lastFiltered = 0.0f;
int adcMax = 1023;    // Auto-detected in setup
int adcMid = 512;
unsigned long zeroCrossTimes[32];  // Circular buffer of crossing timestamps
uint8_t zcIndex = 0;
uint8_t zcCount = 0;
unsigned long lastReportTime = 0;

// Simple exponential smoothing for zero-crossing filter
const float ALPHA = 0.3f;

void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // nRF52840 uses 14-bit ADC (0-16383) in the working reference sketch.
  // For vibration we only need 12-bit; use 14-bit to match existing project.
  analogReadResolution(14);
  adcMax = 16383;
  adcMid = 8192;

  Serial.println(F("=== Vibration Validator ==="));
  Serial.println(F("Hold vibrator against piezo sensor."));
  Serial.println(F("Live frequency reports print every 500 ms."));
  Serial.println(F("Send 'c' to capture a 3-second CSV burst for Python FFT."));
  Serial.println(F("----------------------------"));

  lastReportTime = millis();
}

void loop() {
  // Check for capture command from Serial Monitor
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'c' || cmd == 'C') {
      runCaptureBurst();
    }
  }

  // Real-time frequency estimation
  unsigned long now = millis();
  if (now - lastReportTime >= REPORT_INTERVAL_MS) {
    lastReportTime = now;
    float freq = estimateFrequency();
    printLiveReport(freq);
    updateLED(freq);
  }

  // Continuously feed the zero-crossing filter at ~2 kHz
  // We do not strict-time every sample here because the report loop
  // dominates; instead we read as fast as possible and filter.
  // For the capture burst we use strict timer timing.
  unsigned long t = micros();
  static unsigned long nextSample = t;
  if (t >= nextSample) {
    nextSample = t + SAMPLE_INTERVAL_US;
    int raw = analogRead(SENSOR_PIN);
    float normalized = (raw - (float)adcMid) / (float)adcMid;  // Center around 0 for 14-bit
    lastFiltered = ALPHA * normalized + (1.0f - ALPHA) * lastFiltered;
    detectZeroCross(now);
  }
}

/*
  Record a strict-timed CSV burst and print it to Serial.
  The user can copy the output block into a .csv file.
*/
void runCaptureBurst() {
  unsigned long numSamples = (TARGET_SAMPLE_RATE_HZ * CAPTURE_DURATION_MS) / 1000UL;

  Serial.println(F("START_CAPTURE"));
  Serial.println(F("time_us,raw"));

  unsigned long startTime = micros();
  unsigned long nextTime = startTime;

  for (unsigned long i = 0; i < numSamples; i++) {
    unsigned long t = micros();
    // Busy-wait until next sample slot
    while (t < nextTime) {
      t = micros();
    }
    nextTime = t + SAMPLE_INTERVAL_US;

    int raw = analogRead(SENSOR_PIN);
    unsigned long elapsed = t - startTime;
    Serial.print(elapsed);
    Serial.print(',');
    Serial.println(raw);
  }

  Serial.println(F("END_CAPTURE"));
  Serial.println(F("----------------------------"));
  Serial.println(F("Copy lines between START_CAPTURE and END_CAPTURE into a .csv file."));
}

/*
  Detect positive zero-crossings on the filtered signal and store timestamps.
*/
void detectZeroCross(unsigned long nowMs) {
  static float prev = 0.0f;
  if (prev < 0.0f && lastFiltered >= 0.0f) {
    zeroCrossTimes[zcIndex] = nowMs;
    zcIndex = (zcIndex + 1) % 32;
    if (zcCount < 32) zcCount++;
  }
  prev = lastFiltered;
}

/*
  Compute average period from stored zero-crossing times and return frequency.
  Returns 0 if not enough crossings.
*/
float estimateFrequency() {
  if (zcCount < 4) {
    return 0.0f;
  }

  // Sum intervals between consecutive crossings in the circular buffer
  // We only look at the most recent zcCount entries.
  float totalPeriodMs = 0.0f;
  uint8_t validIntervals = 0;

  for (uint8_t i = 1; i < zcCount; i++) {
    uint8_t currIdx = (zcIndex + 32 - i) % 32;
    uint8_t prevIdx = (zcIndex + 32 - i - 1) % 32;
    unsigned long dt = zeroCrossTimes[currIdx] - zeroCrossTimes[prevIdx];
    if (dt > 0 && dt < 100) {  // Expect crossings within ~100 ms for 100+ Hz
      totalPeriodMs += dt;
      validIntervals++;
    }
  }

  if (validIntervals == 0) {
    return 0.0f;
  }

  // Period is in ms; we measured half-periods (positive crossings only).
  float avgHalfPeriodMs = totalPeriodMs / validIntervals;
  float periodMs = avgHalfPeriodMs * 2.0f;
  float freqHz = 1000.0f / periodMs;

  // Clear the buffer after computing so estimates stay fresh
  zcCount = 0;
  zcIndex = 0;

  return freqHz;
}

void printLiveReport(float freq) {
  Serial.print(F("Freq: "));
  if (freq <= 0.0f) {
    Serial.print(F("-- Hz"));
  } else {
    Serial.print(freq, 1);
    Serial.print(F(" Hz"));
  }

  if (freq > 0.0f) {
    if (freq >= FREQ_MIN_HZ && freq <= FREQ_MAX_HZ) {
      Serial.print(F("  [PASS 100-135 Hz]"));
    } else {
      Serial.print(F("  [FAIL outside 100-135 Hz]"));
    }
  }
  Serial.println();
}

void updateLED(float freq) {
  if (freq >= FREQ_MIN_HZ && freq <= FREQ_MAX_HZ) {
    digitalWrite(LED_PIN, HIGH);  // Steady ON = pass
  } else {
    digitalWrite(LED_PIN, LOW);   // OFF = no signal or fail
  }
}
