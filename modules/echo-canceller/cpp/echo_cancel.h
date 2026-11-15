/*
 * Echo cancellation for takes recorded from the speaker (Speaker mode).
 *
 * The app knows exactly what it played while recording (other tracks, the metronome), so after Stop it
 * removes that "echo" from the take: it mixes the reference from a plan (WAV windows and click waves at
 * their positions in the take), finds the real echo delay, estimates the speaker → room → mic path once
 * as a fixed filter (it doesn't change during a take, and a fixed filter can't drift while the performer
 * plays), and subtracts the predicted echo. Plain C so iOS and Android share it.
 */
#ifndef ECHO_CANCEL_H
#define ECHO_CANCEL_H

#ifdef __cplusplus
extern "C" {
#endif

/** One clip that played: a window of a take's WAV file, placed in the recorded file. */
typedef struct {
  const char *path;
  float gain;
  /** Seconds from the recorded file's first sample to where the window starts (can be negative). */
  double file_start;
  /** Seconds into the take's file where the window begins. */
  double offset;
  double duration;
} ec_clip;

/** One metronome click: wave `wave` of the plan, starting `file_start` seconds into the file. */
typedef struct {
  double file_start;
  int wave;
} ec_click;

typedef struct {
  const ec_clip *clips;
  int clip_count;
  const ec_click *clicks;
  int click_count;
  /** Click sounds at the file's sample rate, already scaled by the metronome volume. */
  const float *const *waves;
  const int *wave_lengths;
  int wave_count;
} ec_plan;

/**
 * How what a predicted echo says is still there after the linear cancellation gets turned down, per
 * frequency bin: by the leftover measured where the performer is quiet, times `margin`.
 */
typedef struct {
  /** STFT frame in samples (a power of two). */
  int frame;
  /** Multiplies the measured leftover (1: exactly what was measured; more: harder). */
  double margin;
  /**
   * Which percentile of the per-frame leftover counts as "what's left" (low: where the performer is
   * quiet; higher: also covers a leftover that varies as the performer moves), and its upper bound
   * as a share of the predicted energy.
   */
  double percentile;
  double max_ratio;
  /** Bins either side a prediction also covers (energy smeared by the speaker). */
  int spread;
  /**
   * Share of a frame's total predicted energy assumed in *every* bin: a distorting speaker turns a
   * tone into harmonics and noise that the (linear) prediction doesn't show.
   */
  double broadband;
  /** Never turned down below this gain (linear). 1 switches the suppression off. */
  double floor;
} ec_suppression;

typedef struct {
  /** Echo tail the filter models, in milliseconds. */
  int filter_ms;
  /** Reweighting passes of the filter estimate (each one trusts echo-only stretches more). */
  int estimate_iterations;
  /** How far the delay search looks either side of the planned alignment. */
  int max_delay_ms;
  /** How far the aligned reference leads the echo, so the filter sees it first. */
  int lead_ms;
  /** After the linear cancellation: what's left of the backing, turned down per frequency. */
  ec_suppression residual;
  /**
   * The clicks' leftover is measured where the performer is quiet; each click frame is turned down by
   * that much times `click_margin`, never below `click_floor`.
   */
  double click_margin;
  double click_floor;
} ec_options;

typedef struct {
  int ok;
  char message[160];
  /** Echo lag found by the delay search, relative to the plan (positive: the echo came later). */
  double delay_ms;
  /** Correlation peak over the average (higher is surer; below ~5 the plan's alignment is used). */
  double delay_confidence;
  /** Energy removed while the reference was playing, in dB. */
  double reduction_db;
  double seconds;
} ec_result;

/** The settings the app uses: the most aggressive cleanup that still keeps the performance. */
void ec_default_options(ec_options *options);

/**
 * Reads the recorded mono WAV at `mic_path`, removes the echo of `plan`, and writes a 24-bit WAV with
 * the same sample rate to `out_path`. Returns 1 on success; on failure `result->message` says why.
 */
int ec_clean_take(const char *mic_path, const char *out_path, const ec_plan *plan,
                  const ec_options *options, ec_result *result);

/* Lower-level steps, exposed for tests. */

/**
 * Lag (in samples) of `ref` in `mic` within ±`max_lag` (positive: mic hears it later), by GCC-PHAT
 * cross-correlation over the loudest stretch of the reference. `confidence` as in `ec_result`.
 */
long ec_estimate_delay(const float *mic, const float *ref, long n, long max_lag, int sample_rate,
                       double *confidence);

/**
 * Cancels `ref` (everything that played, aligned to lead the echo) from `mic` into `out`; all `n`
 * samples, mono. `clicks` (the metronome part of `ref`, or NULL) additionally gets targeted
 * suppression, since a phone speaker distorts loud clicks beyond what a linear filter can predict.
 */
void ec_cancel(const float *mic, const float *ref, const float *clicks, long n, int sample_rate,
               const ec_options *options, float *out, double *reduction_db);

#ifdef __cplusplus
}
#endif

#endif
