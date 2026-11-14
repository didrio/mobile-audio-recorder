/*
 * Desktop check of the echo canceller with synthetic audio (no phone needed): a "backing" of chords,
 * noise and metronome clicks goes through a made-up phone speaker + room into the "mic", together
 * with a separate "voice". The cleaned take must lose the backing and keep the voice.
 *
 * Build and run from the repo root (see ../../README.md in the module):
 *   node modules/echo-canceller/cpp/tests/run.mjs
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../dr_wav.h"
#include "../echo_cancel.h"

#define RATE 48000

static unsigned int seed = 12345;
static float noise(void) {
  seed = seed * 1664525u + 1013904223u;
  return (float)((seed >> 8) / 8388608.0 - 1.0);
}

static void write_float_wav(const char *path, const float *x, long n) {
  drwav_data_format format = {drwav_container_riff, DR_WAVE_FORMAT_IEEE_FLOAT, 1, RATE, 32};
  drwav wav;
  drwav_init_file_write(&wav, path, &format, NULL);
  drwav_write_pcm_frames(&wav, (drwav_uint64)n, x);
  drwav_uninit(&wav);
}

static float *read_wav(const char *path, long *n) {
  unsigned int channels, rate;
  drwav_uint64 count;
  float *x = drwav_open_file_and_read_pcm_frames_f32(path, &channels, &rate, &count, NULL);
  *n = (long)count;
  return x;
}

static double energy(const float *x, long from, long to) {
  double e = 0;
  for (long t = from; t < to; t++) e += (double)x[t] * x[t];
  return e;
}

typedef struct {
  double erle_db, double_talk_db, click_db, voice_level_db, voice_to_residual_db, delay_ms, confidence, seconds_taken;
} outcome;

/**
 * `seconds` of audio; the echo arrives `echo_ms` after the plan's alignment; voice from 40% to 80%.
 */
static outcome run(double seconds, double echo_ms, int strong, double drive, const char *dir) {
  long n = (long)(seconds * RATE);
  float *music = calloc(n, sizeof(float)), *voice = calloc(n, sizeof(float));
  float *mic = calloc(n, sizeof(float)), *reference = calloc(n, sizeof(float));

  // Backing: a chord change every 2 s (three partials per note) plus some filtered noise.
  const double roots[] = {110.0, 146.83, 130.81, 98.0};
  float smooth = 0;
  for (long t = 0; t < n; t++) {
    double time = (double)t / RATE, root = roots[(t / (2 * RATE)) % 4];
    double value = 0;
    for (int note = 0; note < 3; note++)
      for (int h = 1; h <= 3; h++)
        value += sin(2 * M_PI * root * (1 + note * 0.25) * h * time) / (h * 6.0);
    smooth += 0.2f * (noise() - smooth);
    music[t] = (float)(0.25 * value) + 0.05f * smooth;
  }

  // Metronome: a 1.5 kHz click with a fast decay every half second, louder on the downbeat.
  enum { CLICK = 2400 };
  float click_waves[2][CLICK];
  for (int k = 0; k < CLICK; k++) {
    double env = exp(-(double)k / 300.0);
    // Like the app's clicks (metronome.ts): loud, short sine ticks.
    click_waves[0][k] = (float)(0.9 * env * sin(2 * M_PI * 1760 * k / RATE));
    click_waves[1][k] = (float)(0.55 * env * sin(2 * M_PI * 880 * k / RATE));
  }
  int click_count = (int)(seconds * 2);
  ec_click *clicks = calloc(click_count, sizeof(ec_click));
  for (int i = 0; i < click_count; i++) {
    clicks[i].file_start = i * 0.5;
    clicks[i].wave = i % 4 == 0 ? 0 : 1;
  }
  memcpy(reference, music, sizeof(float) * n);
  for (int i = 0; i < click_count; i++) {
    long at = (long)(clicks[i].file_start * RATE);
    for (int k = 0; k < CLICK && at + k < n; k++) reference[at + k] += click_waves[clicks[i].wave][k];
  }

  // Phone speaker: no bass (high-pass), a bit of treble roll-off, gentle saturation. Room: direct
  // sound plus two reflections.
  float *speaker = calloc(n, sizeof(float));
  float hp = 0, previous = 0, lp = 0;
  for (long t = 0; t < n; t++) {
    hp = 0.97f * (hp + reference[t] - previous);
    previous = reference[t];
    lp += 0.6f * (hp - lp);
    speaker[t] = (float)(tanh(drive * lp) / drive);
  }
  long base = (long)(echo_ms * RATE / 1000);
  long taps[3] = {base, base + (long)(0.007 * RATE), base + (long)(0.019 * RATE)};
  float gains[3] = {0.6f, 0.25f, -0.12f};
  for (long t = 0; t < n; t++) {
    double value = 0;
    for (int i = 0; i < 3; i++)
      if (t - taps[i] >= 0) value += gains[i] * speaker[t - taps[i]];
    mic[t] = (float)value;
  }

  // Voice: a sung note with vibrato and a few harmonics, plus the mic's noise floor.
  long voice_from = (long)(0.4 * n), voice_to = (long)(0.8 * n);
  for (long t = voice_from; t < voice_to; t++) {
    double time = (double)t / RATE;
    double f = (getenv("VOICE_HZ") ? atof(getenv("VOICE_HZ")) : 220) * (1 + 0.01 * sin(2 * M_PI * 5 * time));
    voice[t] = (float)(0.15 * sin(2 * M_PI * f * time) + 0.06 * sin(4 * M_PI * f * time) +
                       0.03 * sin(6 * M_PI * f * time));
  }
  for (long t = 0; t < n; t++) mic[t] += voice[t] + 0.0003f * noise();

  char music_path[512], mic_path[512], out_path[512];
  snprintf(music_path, sizeof music_path, "%s/music.wav", dir);
  snprintf(mic_path, sizeof mic_path, "%s/mic.wav", dir);
  snprintf(out_path, sizeof out_path, "%s/clean%s.wav", dir, strong ? "-strong" : "");
  write_float_wav(music_path, music, n);
  write_float_wav(mic_path, mic, n);

  ec_clip clip = {music_path, 1.0f, 0.0, 0.0, seconds};
  const float *waves[2] = {click_waves[0], click_waves[1]};
  int lengths[2] = {CLICK, CLICK};
  ec_plan plan = {&clip, 1, clicks, click_count, waves, lengths, 2};
  ec_options options;
  ec_default_options(&options);
  options.residual_suppression = strong;
  ec_result result;
  clock_t started = clock();
  if (!ec_clean_take(mic_path, out_path, &plan, &options, &result)) {
    fprintf(stderr, "ec_clean_take failed: %s\n", result.message);
    exit(1);
  }
  outcome o;
  o.seconds_taken = (double)(clock() - started) / CLOCKS_PER_SEC;
  long m;
  float *out = read_wav(out_path, &m);

  // Echo reduction where only the backing plays (after the first second), voice kept where it sings.
  long from = RATE, to = voice_from;
  o.erle_db = 10 * log10(energy(mic, from, to) / energy(out, from, to));
  float *residual = malloc(sizeof(float) * n);
  for (long t = 0; t < n; t++) residual[t] = out[t] - voice[t];
  o.voice_level_db = 10 * log10(energy(out, voice_from, voice_to) / energy(voice, voice_from, voice_to));
  o.voice_to_residual_db =
      10 * log10(energy(voice, voice_from, voice_to) / energy(residual, voice_from, voice_to));
  // Diagnostics: echo left while the voice sings (double talk), and any time shift of the voice.
  double echo_in = 0, echo_left = 0;
  for (long t = voice_from; t < voice_to; t++) {
    double e_in = mic[t] - voice[t], e_out = out[t] - voice[t];
    echo_in += e_in * e_in;
    echo_left += e_out * e_out;
  }
  long best_shift = 0;
  double best = -1e30;
  for (long shift = -1200; shift <= 1200; shift++) {
    double c = 0;
    for (long t = voice_from + RATE; t < voice_from + 2 * RATE; t++) c += out[t + shift] * voice[t];
    if (c > best) best = c, best_shift = shift;
  }
  o.double_talk_db = 10 * log10(echo_in / echo_left);
  // Click bleed: energy in the 60 ms after each click's echo arrives, where only the backing plays.
  double click_in = 0, click_left = 0;
  for (int i = 0; i < click_count; i++) {
    long at = (long)(clicks[i].file_start * RATE) + base;
    if (at < RATE || at + RATE / 16 >= voice_from) continue;
    for (long t = at; t < at + (long)(0.06 * RATE); t++) {
      click_in += (double)mic[t] * mic[t];
      click_left += (double)out[t] * out[t];
    }
  }
  o.click_db = click_left > 0 ? 10 * log10(click_in / click_left) : 0;
  // Leftover per sample in the click windows next to the gaps between clicks (backing only).
  double gap_left = 0;
  long gap_samples = 0, click_samples = 0;
  for (int i = 0; i < click_count; i++) {
    long at = (long)(clicks[i].file_start * RATE) + base;
    if (at < RATE || at + RATE / 2 >= voice_from) continue;
    click_samples += (long)(0.06 * RATE);
    for (long t = at + (long)(0.15 * RATE); t < at + (long)(0.4 * RATE); t++, gap_samples++)
      gap_left += (double)out[t] * out[t];
  }
  if (getenv("EC_DEBUG") && click_samples && gap_samples)
    printf("  leftover in click windows vs gaps: %+.1f dB\n",
           10 * log10((click_left / click_samples) / (gap_left / gap_samples)));
  if (best_shift != 0) printf("  voice shifted by %ld samples\n", best_shift);
  o.delay_ms = result.delay_ms;
  o.confidence = result.delay_confidence;
  free(music), free(voice), free(mic), free(reference), free(speaker), free(clicks), free(residual);
  drwav_free(out, NULL);
  return o;
}

static void print(const char *label, double echo_ms, outcome o) {
  printf("%-16s echo %3.0f ms: found %5.1f ms (conf %5.0f) | removed %5.1f dB, %5.1f dB while singing, "
         "clicks %5.1f dB | voice %+5.2f dB, voice/residual %5.1f dB | %.2f s\n",
         label, echo_ms, o.delay_ms, o.confidence, o.erle_db, o.double_talk_db, o.click_db,
         o.voice_level_db, o.voice_to_residual_db, o.seconds_taken);
}

int main(int argc, char **argv) {
  const char *dir = argc > 1 ? argv[1] : ".";
  int failures = 0;
  const double echo_ms[] = {25.0, 70.0};
  for (int s = 0; s < 2; s++) {
    for (int e = 0; e < 2; e++) {
      outcome o = run(60, echo_ms[e], s, 1.2, dir);
      print(s ? "strong" : "light", echo_ms[e], o);
      if (fabs(o.delay_ms - echo_ms[e]) > 2) failures++, printf("  FAIL: delay\n");
      if (!s && o.erle_db < 25) failures++, printf("  FAIL: backing not removed enough\n");
      if (!s && o.double_talk_db < 25) failures++, printf("  FAIL: backing left while singing\n");
      if (!s && fabs(o.voice_level_db) > 1) failures++, printf("  FAIL: voice level changed\n");
      if (!s && o.voice_to_residual_db < 35) failures++, printf("  FAIL: voice touched\n");
      if (!s && o.click_db < 30) failures++, printf("  FAIL: click left\n");
    }
  }
  // A small speaker played loud: the clicks clip. Linear cancellation can't follow that; the click
  // suppression has to.
  for (int s = 0; s < 2; s++) {
    outcome o = run(60, 40, s, 4.0, dir);
    print(s ? "strong, clipping" : "light, clipping", 40, o);
    // Light keeps the performance untouched first; Strong goes further.
    if (o.click_db < (s ? 30 : 25)) failures++, printf("  FAIL: click left when the speaker clips\n");
    if (o.voice_to_residual_db < 30) failures++, printf("  FAIL: voice touched\n");
    if (fabs(o.voice_level_db) > 1) failures++, printf("  FAIL: voice level changed\n");
  }
  outcome longest = run(180, 40, 0, 1.2, dir);
  printf("3-minute take: %.2f s to clean\n", longest.seconds_taken);
  printf(failures ? "%d check(s) failed\n" : "All checks passed\n", failures);
  return failures ? 1 : 0;
}
