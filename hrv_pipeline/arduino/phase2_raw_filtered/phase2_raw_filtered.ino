/*
  HRV Pipeline — Phase 2: Raw + Filtered Capture
  Board: Seeed XIAO nRF52840
  ADC: A0, 14-bit (0–16383)
  Internal sample rate: 500 Hz (all filters run at 500 Hz)
  Serial output rate: 100 Hz (every 5th sample — saves serial bandwidth)
  Output columns: time_us, raw, filtered_200hz, filtered_10hz, filtered_15hz

  Filters applied:
    1. 200 Hz label / 1-pole IIR (alpha=0.715): matches reference firmware.
       Actual -3 dB cutoff ~100 Hz at 500 Hz Fs. Removes HF noise.
    2. 10 Hz 2-pole Butterworth (Fs=500 Hz): primary pulse waveform filter.
    3. 15 Hz 2-pole Butterworth (Fs=500 Hz): slightly less aggressive for comparison.

  How to use:
    1. Upload, open Serial Monitor at 115200 baud.
    2. Send '1' (20s) / '2' (60s) / '3' (3min) to start capture.
    3. Copy START_CAPTURE ... END_CAPTURE block to data/raw_filtered_capture.csv.

  DO NOT use these filtered values for IBI detection until Phase 3 graphs are
  visually inspected and the pulse waveform is confirmed.
*/

#include <Arduino.h>
#include <SPI.h>

#define SIGNAL_PIN         A0
#define ADC_RES            14
#define SAMPLE_RATE_HZ     500UL
#define SAMPLE_INTERVAL_US (1000000UL / SAMPLE_RATE_HZ)
#define DECIMATE           5     // Output 1 of every 5 samples = 100 Hz

// Filter 1: 1-pole IIR — matches reference firmware HRV_GPAI_test4
// y[n] = 0.715*x[n] + 0.285*y[n-1]
#define F1_ALPHA  0.715f

// Filter 2: 10 Hz 2-pole Butterworth, Fs=500 Hz
// Precomputed with bilinear transform + pre-warping.
// Matches coefficients in HRV_GPAI_test4 reference sketch.
static const float F2_B[3] = { 0.00362168f,  0.00724336f,  0.00362168f };
static const float F2_A[3] = { 1.0f,        -1.82269493f,  0.83718165f };

// Filter 3: 15 Hz 2-pole Butterworth, Fs=500 Hz
// Computed via bilinear transform: k=tan(pi*15/500), see pipeline README.
static const float F3_B[3] = { 0.00820646f,  0.01641291f,  0.00820646f };
static const float F3_A[3] = { 1.0f,        -1.72377617f,  0.75619879f };

// Filter state
float    f1_out   = 0.0f;
float    f2_x[3] = {0,0,0};
float    f2_y[3] = {0,0,0};
float    f3_x[3] = {0,0,0};
float    f3_y[3] = {0,0,0};

// Capture state
bool          capturing        = false;
unsigned long captureDurMs     = 0;
unsigned long captureStartUs   = 0;
unsigned long nextSampleUs     = 0;
unsigned long sampleCount      = 0;
unsigned long outputCount      = 0;
int           decimateCounter  = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  analogReadResolution(ADC_RES);

  Serial.println(F("=== HRV Pipeline: Phase 2 Raw+Filtered Capture ==="));
  Serial.println(F("Columns: time_us,raw,filtered_200hz,filtered_10hz,filtered_15hz"));
  Serial.println(F("Internal: 500 Hz | Output: 100 Hz (decimate by 5)"));
  Serial.println(F("Send: 1=20s  2=60s  3=3min  x=stop"));
  Serial.println(F("==================================================="));
}

void loop() {
  if (Serial.available()) {
    char c = (char)Serial.read();
    handleCmd(c);
  }

  if (!capturing) return;

  unsigned long now = micros();
  if (now < nextSampleUs) return;
  nextSampleUs += SAMPLE_INTERVAL_US;

  int   raw = analogRead(SIGNAL_PIN);
  float f1  = applyF1((float)raw);
  float f2  = applyF2(f1);
  float f3  = applyF3(f1);

  sampleCount++;
  decimateCounter++;

  if (decimateCounter >= DECIMATE) {
    decimateCounter = 0;
    unsigned long elapsed = now - captureStartUs;

    Serial.print(elapsed);  Serial.print(',');
    Serial.print(raw);      Serial.print(',');
    Serial.print((int)f1);  Serial.print(',');
    Serial.print((int)f2);  Serial.print(',');
    Serial.println((int)f3);

    outputCount++;

    if (elapsed >= captureDurMs * 1000UL) {
      endCapture(elapsed);
    }
  }
}

float applyF1(float x) {
  f1_out = F1_ALPHA * x + (1.0f - F1_ALPHA) * f1_out;
  return f1_out;
}

float applyF2(float x) {
  f2_x[0] = x;
  float y = F2_B[0]*f2_x[0] + F2_B[1]*f2_x[1] + F2_B[2]*f2_x[2]
           - F2_A[1]*f2_y[1] - F2_A[2]*f2_y[2];
  f2_x[2] = f2_x[1]; f2_x[1] = f2_x[0];
  f2_y[2] = f2_y[1]; f2_y[1] = y;
  return y;
}

float applyF3(float x) {
  f3_x[0] = x;
  float y = F3_B[0]*f3_x[0] + F3_B[1]*f3_x[1] + F3_B[2]*f3_x[2]
           - F3_A[1]*f3_y[1] - F3_A[2]*f3_y[2];
  f3_x[2] = f3_x[1]; f3_x[1] = f3_x[0];
  f3_y[2] = f3_y[1]; f3_y[1] = y;
  return y;
}

void handleCmd(char c) {
  if (capturing) {
    if (c == 'x' || c == 'X') endCapture(micros() - captureStartUs);
    return;
  }
  unsigned long dur = 0;
  switch (c) {
    case '1': dur = 20000;  break;
    case '2': dur = 60000;  break;
    case '3': dur = 180000; break;
    default:  return;
  }
  beginCapture(dur);
}

void beginCapture(unsigned long durMs) {
  // Reset all filter states before capture
  f1_out = 0.0f;
  for (int i = 0; i < 3; i++) {
    f2_x[i] = f2_y[i] = f3_x[i] = f3_y[i] = 0.0f;
  }

  captureDurMs    = durMs;
  sampleCount     = 0;
  outputCount     = 0;
  decimateCounter = 0;
  captureStartUs  = micros();
  nextSampleUs    = captureStartUs;
  capturing       = true;

  Serial.println(F("START_CAPTURE"));
  Serial.print(F("# duration_s: "));         Serial.println(durMs / 1000UL);
  Serial.print(F("# internal_rate_hz: "));   Serial.println(SAMPLE_RATE_HZ);
  Serial.println(F("# output_rate_hz: 100"));
  Serial.println(F("# filter1: 1-pole IIR alpha=0.715 (~100Hz cutoff)"));
  Serial.println(F("# filter2: 2-pole Butterworth 10Hz Fs=500Hz"));
  Serial.println(F("# filter3: 2-pole Butterworth 15Hz Fs=500Hz"));
  Serial.println(F("time_us,raw,filtered_200hz,filtered_10hz,filtered_15hz"));
}

void endCapture(unsigned long elapsedUs) {
  capturing = false;
  float outHz = (float)outputCount / ((float)elapsedUs / 1e6f);

  Serial.println(F("END_CAPTURE"));
  Serial.print(F("# internal_samples: "));   Serial.println(sampleCount);
  Serial.print(F("# output_rows: "));        Serial.println(outputCount);
  Serial.print(F("# actual_output_hz: "));   Serial.println(outHz, 1);
  Serial.println(F("# Save as: data/raw_filtered_capture.csv"));
  Serial.println(F("Send: 1=20s  2=60s  3=3min  x=stop"));
}
