/*
 * Desktop check of the echo canceller with synthetic audio (no phone needed): a "backing" of chords,
 * noise and metronome clicks goes through a made-up phone speaker + room into the "mic", together
 * with a separate "voice". The cleaned take must lose the backing and keep the voice.
 *
 * Three phones: "clean" (a fixed, nearly linear speaker and a short room), "clipping" (the same
 * speaker driven into hard saturation) and "realistic" (a level-dependent limiter, a long room tail and
 * a reflection that drifts as the performer moves), the last one closest to what a real phone leaves.
 *
 * Build and run from the repo root (see ../../README.md in the module):
 *   node modules/echo-canceller/cpp/tests/run.mjs
 *
 * Environment (for tuning; the app always uses `ec_default_options`):
 *   EC_FILTER_MS, EC_ITER, EC_FRAME, EC_MARGIN, EC_PERCENTILE, EC_MAX_RATIO, EC_SPREAD, EC_BROADBAND, EC_FLOOR, EC_CLICK_MARGIN,
 *   EC_CLICK_FLOOR   override one option
 *   EC_QUICK=1       one run per phone, no 3-minute take, no pass/fail
 *   VOICE_WAV=path   a real voice (mono, 48 kHz) instead of the sung sine, to listen to the result
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../dr_wav.h"
#include "../echo_cancel.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

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

static void env_int(const char *name, int *into) {
  const char *value = getenv(name);
  if (value) *into = atoi(value);
}

static void env_double(const char *name, double *into) {
  const char *value = getenv(name);
  if (value) *into = atof(value);
}

/** `ec_default_options` with any EC_* overrides from the environment. */
static ec_options test_options(void) {
  ec_options o;
  ec_default_options(&o);
  env_int("EC_FILTER_MS", &o.filter_ms);
  env_int("EC_ITER", &o.estimate_iterations);
  env_int("EC_FRAME", &o.residual.frame);
  env_double("EC_MARGIN", &o.residual.margin);
  env_double("EC_PERCENTILE", &o.residual.percentile);
  env_double("EC_MAX_RATIO", &o.residual.max_ratio);
  env_int("EC_SPREAD", &o.residual.spread);
  env_double("EC_BROADBAND", &o.residual.broadband);
  env_double("EC_FLOOR", &o.residual.floor);
  env_double("EC_CLICK_MARGIN", &o.click_margin);
  env_double("EC_CLICK_FLOOR", &o.click_floor);
  return o;
}

typedef enum { PHONE_CLEAN, PHONE_CLIPPING, PHONE_REALISTIC } phone;
static const char *const PHONE_NAMES[] = {"clean", "clipping", "realistic"};

typedef struct {
  double erle_db, double_talk_db, click_db, voice_level_db, voice_to_residual_db, delay_ms, confidence, seconds_taken;
} outcome;

/** The speaker: no bass, a bit of treble roll-off, then saturation (and for `realistic` a limiter). */
static void play_through_speaker(const float *reference, long n, phone kind, float *speaker) {
  float hp = 0, previous = 0, lp = 0, envelope = 0;
  double drive = kind == PHONE_CLIPPING ? 4.0 : kind == PHONE_REALISTIC ? 2.0 : 1.2;
  // Realistic: a smaller speaker (higher cut-off) behind a fast-attack, slow-release limiter, like
  // the speaker protection of a phone: its gain follows the music, so no fixed filter matches it.
  float hp_pole = kind == PHONE_REALISTIC ? 0.96f : 0.97f;
  float attack = 1.0f - expf(-1.0f / (0.001f * RATE)), release = 1.0f - expf(-1.0f / (0.12f * RATE));
  for (long t = 0; t < n; t++) {
    hp = hp_pole * (hp + reference[t] - previous);
    previous = reference[t];
    lp += 0.6f * (hp - lp);
    float x = lp;
    if (kind == PHONE_REALISTIC && !getenv("EC_DIAG_NO_LIMITER")) {
      float level = fabsf(x);
      envelope += (level > envelope ? attack : release) * (level - envelope);
      const float threshold = 0.18f;
      if (envelope > threshold) x *= threshold / envelope;
    }
    speaker[t] = (float)(tanh(drive * x) / drive);
  }
}

/** The room from speaker to mic, `base` samples late. */
static void through_room(const float *speaker, long n, long base, phone kind, float *mic) {
  long taps[3] = {base, base + (long)(0.007 * RATE), base + (long)(0.019 * RATE)};
  float gains[3] = {0.6f, 0.25f, -0.12f};
  for (long t = 0; t < n; t++) {
    double value = 0;
    for (int i = 0; i < 3; i++)
      if (t - taps[i] >= 0) value += gains[i] * speaker[t - taps[i]];
    mic[t] = (float)value;
  }
  if (kind != PHONE_REALISTIC) return;

  if (!getenv("EC_DIAG_NO_DRIFT")) {
  // A reflection off the performer (~3 ms) that drifts as they move: ±0.4 ms and ±40% over seconds.
  for (long t = 0; t < n; t++) {
    double time = (double)t / RATE;
    double delay = base + 0.003 * RATE + 0.0004 * RATE * sin(2 * M_PI * time / 7.0);
    double gain = 0.15 * (1 + 0.4 * sin(2 * M_PI * time / 11.0 + 1.0));
    double at = t - delay;
    long i = (long)floor(at);
    if (i < 0 || i + 1 >= n) continue;
    double frac = at - i;
    mic[t] += (float)(gain * ((1 - frac) * speaker[i] + frac * speaker[i + 1]));
  }
  }
  if (getenv("EC_DIAG_NO_TAIL")) return;
  // A room tail: 240 sparse echoes from 20 to 450 ms, decaying ~60 dB in 400 ms.
  enum { TAIL = 240 };
  long tail_at[TAIL];
  float tail_gain[TAIL];
  unsigned int saved = seed;
  seed = 777;
  for (int k = 0; k < TAIL; k++) {
    double ms = 20 + 430.0 * (k + 0.5 * (noise() + 1)) / TAIL;
    tail_at[k] = base + (long)(ms * RATE / 1000);
    tail_gain[k] = (float)(0.1 * noise() * pow(10, -3.0 * ms / 400.0));
  }
  seed = saved;
  for (long t = n - 1; t >= 0; t--) {
    double value = 0;
    for (int k = 0; k < TAIL; k++)
      if (t - tail_at[k] >= 0) value += tail_gain[k] * speaker[t - tail_at[k]];
    mic[t] += (float)value;
  }
}

/** The performer, from 40% to 80% of the take: a sung sine note, or VOICE_WAV looped at a similar level. */
static void make_voice(float *voice, long n) {
  long from = (long)(0.4 * n), to = (long)(0.8 * n);
  const char *path = getenv("VOICE_WAV");
  if (path) {
    long m = 0;
    float *source = read_wav(path, &m);
    if (source && m > 0) {
      double e = energy(source, 0, m);
      float scale = (float)(0.116 / sqrt(e / (double)m + 1e-12));
      for (long t = from; t < to; t++) voice[t] = scale * source[(t - from) % m];
      drwav_free(source, NULL);
      return;
    }
    fprintf(stderr, "VOICE_WAV couldn't be read, using the sine voice\n");
  }
  for (long t = from; t < to; t++) {
    double time = (double)t / RATE;
    double f = 220 * (1 + 0.01 * sin(2 * M_PI * 5 * time));
    voice[t] = (float)(0.15 * sin(2 * M_PI * f * time) + 0.06 * sin(4 * M_PI * f * time) +
                       0.03 * sin(6 * M_PI * f * time));
  }
}

/** `seconds` of audio; the echo arrives `echo_ms` after the plan's alignment; voice from 40% to 80%. */
static outcome run(double seconds, double echo_ms, phone kind, const ec_options *options, const char *dir) {
  long n = (long)(seconds * RATE);
  float *music = calloc(n, sizeof(float)), *voice = calloc(n, sizeof(float));
  float *mic = calloc(n, sizeof(float)), *reference = calloc(n, sizeof(float));
  seed = 12345;

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

  // Metronome: like the app's clicks (metronome.ts), loud, short sine ticks every half second.
  enum { CLICK = 2400 };
  static float click_waves[2][CLICK];
  for (int k = 0; k < CLICK; k++) {
    double env = exp(-(double)k / 300.0);
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

  float *speaker = calloc(n, sizeof(float));
  play_through_speaker(reference, n, kind, speaker);
  long base = (long)(echo_ms * RATE / 1000);
  through_room(speaker, n, base, kind, mic);

  make_voice(voice, n);
  long voice_from = (long)(0.4 * n), voice_to = (long)(0.8 * n);
  for (long t = 0; t < n; t++) mic[t] += voice[t] + 0.0003f * noise();

  char music_path[512], mic_path[512], out_path[512];
  snprintf(music_path, sizeof music_path, "%s/music.wav", dir);
  snprintf(mic_path, sizeof mic_path, "%s/mic-%s.wav", dir, PHONE_NAMES[kind]);
  snprintf(out_path, sizeof out_path, "%s/clean-%s.wav", dir, PHONE_NAMES[kind]);
  write_float_wav(music_path, music, n);
  write_float_wav(mic_path, mic, n);

  ec_clip clip = {music_path, 1.0f, 0.0, 0.0, seconds};
  const float *waves[2] = {click_waves[0], click_waves[1]};
  int lengths[2] = {CLICK, CLICK};
  ec_plan plan = {&clip, 1, clicks, click_count, waves, lengths, 2};
  ec_result result;
  clock_t started = clock();
  if (!ec_clean_take(mic_path, out_path, &plan, options, &result)) {
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
  // Echo left while the voice sings (double talk), and any time shift of the voice.
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
  if (best_shift != 0) printf("  voice shifted by %ld samples\n", best_shift);
  o.delay_ms = result.delay_ms;
  o.confidence = result.delay_confidence;
  free(music), free(voice), free(mic), free(reference), free(speaker), free(clicks), free(residual);
  drwav_free(out, NULL);
  return o;
}

static void print(const char *label, double echo_ms, outcome o) {
  printf("%-10s echo %3.0f ms: found %5.1f ms (conf %4.0f) | removed %5.1f dB, %5.1f dB while singing, "
         "clicks %5.1f dB | voice %+5.2f dB, voice/residual %5.1f dB | %.2f s\n",
         label, echo_ms, o.delay_ms, o.confidence, o.erle_db, o.double_talk_db, o.click_db,
         o.voice_level_db, o.voice_to_residual_db, o.seconds_taken);
}

int main(int argc, char **argv) {
  const char *dir = argc > 1 ? argv[1] : ".";
  ec_options options = test_options();
  printf("options: filter %d ms, %d iterations | residual frame %d, margin %.1f, spread %d, broadband %.3f, "
         "floor %.3f | clicks margin %.1f, floor %.3f\n",
         options.filter_ms, options.estimate_iterations, options.residual.frame, options.residual.margin,
         options.residual.spread, options.residual.broadband, options.residual.floor, options.click_margin,
         options.click_floor);

  if (getenv("EC_QUICK")) {
    print("realistic", 40, run(60, 40, PHONE_REALISTIC, &options, dir));
    print("clipping", 40, run(60, 40, PHONE_CLIPPING, &options, dir));
    print("clean", 25, run(60, 25, PHONE_CLEAN, &options, dir));
    printf("WAV files: %s\n", dir);
    return 0;
  }

  // Thresholds for the default (aggressive) options; "while singing" also counts what the suppression
  // takes from the voice, so it's printed, not checked.
  int failures = 0;
  const double echo_ms[] = {25.0, 70.0};
  for (int e = 0; e < 2; e++) {
    outcome o = run(60, echo_ms[e], PHONE_CLEAN, &options, dir);
    print("clean", echo_ms[e], o);
    if (fabs(o.delay_ms - echo_ms[e]) > 2) failures++, printf("  FAIL: delay\n");
    if (o.erle_db < 45) failures++, printf("  FAIL: backing not removed enough\n");
    if (o.click_db < 45) failures++, printf("  FAIL: click left\n");
    if (fabs(o.voice_level_db) > 1) failures++, printf("  FAIL: voice level changed\n");
    if (o.voice_to_residual_db < 17) failures++, printf("  FAIL: voice altered\n");
  }
  // A small speaker played loud: the clicks clip, which linear cancellation can't follow.
  outcome clipping = run(60, 40, PHONE_CLIPPING, &options, dir);
  print("clipping", 40, clipping);
  if (clipping.erle_db < 40) failures++, printf("  FAIL: backing left when the speaker clips\n");
  if (clipping.click_db < 40) failures++, printf("  FAIL: click left when the speaker clips\n");
  if (fabs(clipping.voice_level_db) > 1) failures++, printf("  FAIL: voice level changed\n");
  if (clipping.voice_to_residual_db < 17) failures++, printf("  FAIL: voice altered\n");
  // Limiter, room tail, a moving performer: what real phones leave behind.
  outcome real = run(60, 40, PHONE_REALISTIC, &options, dir);
  print("realistic", 40, real);
  if (fabs(real.delay_ms - 40) > 2) failures++, printf("  FAIL: delay\n");
  if (real.erle_db < 40) failures++, printf("  FAIL: backing left on a realistic phone\n");
  if (real.click_db < 40) failures++, printf("  FAIL: click left on a realistic phone\n");
  if (fabs(real.voice_level_db) > 1) failures++, printf("  FAIL: voice level changed\n");
  if (real.voice_to_residual_db < 17) failures++, printf("  FAIL: voice altered\n");

  outcome longest = run(180, 40, PHONE_REALISTIC, &options, dir);
  printf("3-minute take: %.2f s to clean\n", longest.seconds_taken);
  if (longest.seconds_taken > 10) failures++, printf("  FAIL: too slow for a phone\n");
  printf(failures ? "%d check(s) failed\n" : "All checks passed\n", failures);
  return failures ? 1 : 0;
}
