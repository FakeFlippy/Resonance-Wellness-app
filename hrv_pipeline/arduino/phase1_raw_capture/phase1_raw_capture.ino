/*
  HRV Pipeline — Phase 1: Raw Data Capture
  Board: Seeed XIAO nRF52840
  ADC: A0, 14-bit (0–16383)
  Sample rate: 500 Hz (2000 us per sample)
  Output: time_us,raw  (CSV to Serial)

  How to use:
    1. Upload sketch, open Serial Monitor at 115200 baud.
    2. Send '1' for 20s, '2' for 60s, '3' for 3-minute capture.
    3. Copy everything from START_CAPTURE to END_CAPTURE into data/raw_capture.csv.

  Signal expected: centered ~7000–8000 at rest.
  Movement will cause large swings — hold still during capture.
*/

#include <Arduino.h>
#include <SPI.h>

#define SIGNAL_PIN         A0
#define ADC_RES            14
#define SAMPLE_RATE_HZ     500UL
#define SAMPLE_INTERVAL_US (1000000UL / SAMPLE_RATE_HZ)   // 2000 us

bool capturing = false;
unsigned long captureDurationMs = 0;
unsigned long captureStartUs = 0;
unsigned long nextSampleUs = 0;
unsigned long sampleCount = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  analogReadResolution(ADC_RES);

  Serial.println(F("=== HRV Pipeline: Phase 1 Raw Capture ==="));
  Serial.println(F("Send: 1=20s  2=60s  3=3min  x=stop"));
  Serial.println(F("========================================="));
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

  int raw = analogRead(SIGNAL_PIN);
  unsigned long elapsed = now - captureStartUs;

  Serial.print(elapsed);
  Serial.print(',');
  Serial.println(raw);

  sampleCount++;

  if (elapsed >= captureDurationMs * 1000UL) {
    endCapture(elapsed);
  }
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
  captureDurationMs = durMs;
  sampleCount       = 0;
  captureStartUs    = micros();
  nextSampleUs      = captureStartUs;
  capturing         = true;

  Serial.println(F("START_CAPTURE"));
  Serial.print(F("# duration_s: "));   Serial.println(durMs / 1000UL);
  Serial.print(F("# sample_rate_hz: ")); Serial.println(SAMPLE_RATE_HZ);
  Serial.print(F("# adc_bits: "));     Serial.println(ADC_RES);
  Serial.println(F("time_us,raw"));
}

void endCapture(unsigned long elapsedUs) {
  capturing = false;
  float actualHz = (float)sampleCount / ((float)elapsedUs / 1e6f);

  Serial.println(F("END_CAPTURE"));
  Serial.print(F("# samples: "));         Serial.println(sampleCount);
  Serial.print(F("# actual_rate_hz: "));  Serial.println(actualHz, 1);
  Serial.println(F("# Save as: data/raw_capture.csv"));
  Serial.println(F("Send: 1=20s  2=60s  3=3min  x=stop"));
}
