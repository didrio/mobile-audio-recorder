/* See echo_cancel.h. */
#include "echo_cancel.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define DR_WAV_IMPLEMENTATION
#define DR_WAV_NO_STDIO_WIDE
#include "dr_wav.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/** Below this correlation peak-to-average, the delay search is ignored (the plan's alignment is used). */
#define MIN_DELAY_CONFIDENCE 5.0
/** The delay search looks at this much of the take (its loudest stretch of reference). */
#define DELAY_WINDOW_SECONDS 15
/** 10 ms stretches whose reference is quieter than this (about -50 dBFS) don't count for the stats. */
#define ACTIVE_REFERENCE_RMS 0.003

void ec_default_options(ec_options *options) {
  options->filter_ms = 85;
  options->residual_suppression = 0;
  options->max_delay_ms = 150;
  options->lead_ms = 10;
}

static void fail(ec_result *result, const char *message) {
  result->ok = 0;
  snprintf(result->message, sizeof result->message, "%s", message);
}

/* ---------------------------------------------------------------------------------------------- */
/* WAV I/O                                                                                         */

/** Reads a WAV file as mono float samples (channels averaged). Caller frees with `free`. */
static float *read_mono(const char *path, unsigned int *sample_rate, long *frames) {
  unsigned int channels = 0;
  drwav_uint64 count = 0;
  float *interleaved =
      drwav_open_file_and_read_pcm_frames_f32(path, &channels, sample_rate, &count, NULL);
  if (!interleaved || channels == 0) {
    if (interleaved) drwav_free(interleaved, NULL);
    return NULL;
  }
  float *mono = malloc(sizeof(float) * (count > 0 ? count : 1));
  if (!mono) {
    drwav_free(interleaved, NULL);
    return NULL;
  }
  for (drwav_uint64 i = 0; i < count; i++) {
    float sum = 0;
    for (unsigned int c = 0; c < channels; c++) sum += interleaved[i * channels + c];
    mono[i] = sum / (float)channels;
  }
  drwav_free(interleaved, NULL);
  *frames = (long)count;
  return mono;
}

/** Writes mono float samples as a 24-bit PCM WAV. */
static int write_wav24(const char *path, const float *samples, long n, unsigned int sample_rate) {
  drwav_data_format format;
  format.container = drwav_container_riff;
  format.format = DR_WAVE_FORMAT_PCM;
  format.channels = 1;
  format.sampleRate = sample_rate;
  format.bitsPerSample = 24;
  drwav wav;
  if (!drwav_init_file_write(&wav, path, &format, NULL)) return 0;
  enum { CHUNK = 4096 };
  unsigned char bytes[CHUNK * 3];
  long written = 0;
  while (written < n) {
    long count = n - written < CHUNK ? n - written : CHUNK;
    for (long i = 0; i < count; i++) {
      double value = samples[written + i];
      if (value > 1.0) value = 1.0;
      if (value < -1.0) value = -1.0;
      long sample = lround(value * 8388607.0);
      bytes[i * 3] = (unsigned char)(sample & 0xFF);
      bytes[i * 3 + 1] = (unsigned char)((sample >> 8) & 0xFF);
      bytes[i * 3 + 2] = (unsigned char)((sample >> 16) & 0xFF);
    }
    if (drwav_write_pcm_frames(&wav, (drwav_uint64)count, bytes) != (drwav_uint64)count) {
      drwav_uninit(&wav);
      return 0;
    }
    written += count;
  }
  return drwav_uninit(&wav) == DRWAV_SUCCESS;
}

/* ---------------------------------------------------------------------------------------------- */
/* Reference                                                                                       */

static long seconds_to_samples(double seconds, unsigned int sample_rate) {
  return lround(seconds * (double)sample_rate);
}

/**
 * Mixes the plan's clips into `ref` and its clicks into `clicks` (`n` samples each, zeroed by the
 * caller). 0 if a clip's file can't be used.
 */
static int render_reference(const ec_plan *plan, unsigned int sample_rate, float *ref, float *clicks,
                            long n, ec_result *result) {
  // Each take file is read once and freed before the next (they can be minutes long).
  char *done = calloc(plan->clip_count > 0 ? plan->clip_count : 1, 1);
  if (!done) return 0;
  for (int i = 0; i < plan->clip_count; i++) {
    if (done[i]) continue;
    unsigned int rate = 0;
    long frames = 0;
    float *source = read_mono(plan->clips[i].path, &rate, &frames);
    if (!source || rate != sample_rate) {
      free(source);
      free(done);
      snprintf(result->message, sizeof result->message,
               source ? "A backing take has a different sample rate (%u Hz)."
                      : "A backing take couldn't be read.",
               rate);
      return 0;
    }
    for (int j = i; j < plan->clip_count; j++) {
      const ec_clip *clip = &plan->clips[j];
      if (done[j] || strcmp(clip->path, plan->clips[i].path) != 0) continue;
      done[j] = 1;
      long to = seconds_to_samples(clip->file_start, sample_rate);
      long from = seconds_to_samples(clip->offset, sample_rate);
      long length = seconds_to_samples(clip->duration, sample_rate);
      for (long k = 0; k < length; k++) {
        long d = to + k, s = from + k;
        if (d < 0 || s < 0) continue;
        if (d >= n || s >= frames) break;
        ref[d] += clip->gain * source[s];
      }
    }
    free(source);
  }
  free(done);

  for (int i = 0; i < plan->click_count; i++) {
    const ec_click *click = &plan->clicks[i];
    if (click->wave < 0 || click->wave >= plan->wave_count) continue;
    const float *wave = plan->waves[click->wave];
    long length = plan->wave_lengths[click->wave];
    long to = seconds_to_samples(click->file_start, sample_rate);
    for (long k = 0; k < length; k++) {
      long d = to + k;
      if (d < 0) continue;
      if (d >= n) break;
      clicks[d] += wave[k];
    }
  }
  return 1;
}

/* ---------------------------------------------------------------------------------------------- */
/* Delay search                                                                                    */

/** In-place iterative radix-2 complex FFT (`size` a power of two); `inverse` skips the 1/N scale. */
static void fft(float *re, float *im, long size, int inverse) {
  for (long i = 1, j = 0; i < size; i++) {
    long bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      float t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (long len = 2; len <= size; len <<= 1) {
    double angle = (inverse ? 2.0 : -2.0) * M_PI / (double)len;
    double wr = cos(angle), wi = sin(angle);
    for (long i = 0; i < size; i += len) {
      double cr = 1.0, ci = 0.0;
      for (long k = 0; k < len / 2; k++) {
        long a = i + k, b = i + k + len / 2;
        double br = re[b] * cr - im[b] * ci;
        double bi = re[b] * ci + im[b] * cr;
        re[b] = (float)(re[a] - br);
        im[b] = (float)(im[a] - bi);
        re[a] = (float)(re[a] + br);
        im[a] = (float)(im[a] + bi);
        double next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

long ec_estimate_delay(const float *mic, const float *ref, long n, long max_lag, int sample_rate,
                       double *confidence) {
  *confidence = 0;
  if (n <= 0 || max_lag <= 0) return 0;

  // The loudest stretch of the reference (in quarter-second blocks) gives the clearest peak.
  long window = n < (long)DELAY_WINDOW_SECONDS * sample_rate ? n : (long)DELAY_WINDOW_SECONDS * sample_rate;
  long block = sample_rate / 4 > 0 ? sample_rate / 4 : 1;
  long start = 0;
  long blocks = n / block, per_window = window / block;
  if (blocks > per_window && per_window > 0) {
    double *energy = calloc(blocks, sizeof(double));
    if (energy) {
      for (long b = 0; b < blocks; b++)
        for (long t = b * block; t < (b + 1) * block; t++) energy[b] += (double)ref[t] * ref[t];
      double sum = 0, best = -1;
      for (long b = 0; b < blocks; b++) {
        sum += energy[b];
        if (b >= per_window) sum -= energy[b - per_window];
        if (b >= per_window - 1 && sum > best) {
          best = sum;
          start = (b - per_window + 1) * block;
        }
      }
      free(energy);
    }
  }
  if (start + window > n) start = n - window;

  long size = 1;
  while (size < window + 2 * max_lag) size <<= 1;
  float *xr = calloc(size, sizeof(float)), *xi = calloc(size, sizeof(float));
  float *yr = calloc(size, sizeof(float)), *yi = calloc(size, sizeof(float));
  if (!xr || !xi || !yr || !yi) {
    free(xr), free(xi), free(yr), free(yi);
    return 0;
  }
  memcpy(xr, mic + start, sizeof(float) * window);
  memcpy(yr, ref + start, sizeof(float) * window);
  fft(xr, xi, size, 0);
  fft(yr, yi, size, 0);
  // GCC-PHAT: keep only the phase of mic × conj(ref), so the peak stays sharp despite the speaker's
  // colouring, the room and the performer.
  for (long k = 0; k < size; k++) {
    double cr = (double)xr[k] * yr[k] + (double)xi[k] * yi[k];
    double ci = (double)xi[k] * yr[k] - (double)xr[k] * yi[k];
    double magnitude = sqrt(cr * cr + ci * ci) + 1e-20;
    xr[k] = (float)(cr / magnitude);
    xi[k] = (float)(ci / magnitude);
  }
  fft(xr, xi, size, 1);

  long best_lag = 0;
  double best = -INFINITY, total = 0;
  for (long lag = -max_lag; lag <= max_lag; lag++) {
    double value = xr[lag >= 0 ? lag : size + lag];
    total += fabs(value);
    if (value > best) {
      best = value;
      best_lag = lag;
    }
  }
  double mean = total / (double)(2 * max_lag + 1);
  *confidence = mean > 0 ? best / mean : 0;
  free(xr), free(xi), free(yr), free(yi);
  return best_lag;
}

/* ---------------------------------------------------------------------------------------------- */
/* Cancellation                                                                                    */

/*
 * The speaker → room → mic path doesn't change during a take (the phone lies still), so instead of an
 * adaptive filter (which drifts while the performer sings over the backing) the path is estimated
 * once, offline, as a fixed FIR filter, and the predicted echo `h * ref` is subtracted.
 *
 * Estimation: Hann-windowed frames give per-bin cross-spectra; H(f) = Σ w·conj(X)·Y / Σ w·|X|².
 * Iteratively reweighted: frames where the mic is mostly echo (small residual next to the predicted
 * echo) count much more than frames where the performer plays, so singing doesn't bias the filter.
 */

#define ESTIMATE_ITERATIONS 3
/** Frames used for the estimate (the loudest backing); ~40 s with 32k-sample frames at 48 kHz. */
#define ESTIMATE_MAX_FRAMES 120
/** Weight cap: residual-to-echo ratio below this counts as "pure echo". */
#define MIN_RESIDUAL_RATIO 1e-3

static long next_pow2(long value) {
  long size = 1;
  while (size < value) size <<= 1;
  return size;
}

/** Windowed spectrum of `x[start .. start+size)` (zero past `n`). */
static void windowed_spectrum(const float *x, long n, long start, const float *window, long size,
                              float *re, float *im) {
  for (long i = 0; i < size; i++) {
    long t = start + i;
    re[i] = t >= 0 && t < n ? x[t] * window[i] : 0;
    im[i] = 0;
  }
  fft(re, im, size, 0);
}

typedef struct {
  long start;
  double energy;
} frame_info;

static int by_energy_desc(const void *a, const void *b) {
  double ea = ((const frame_info *)a)->energy, eb = ((const frame_info *)b)->energy;
  return ea < eb ? 1 : ea > eb ? -1 : 0;
}

/** Estimates the echo path as `taps` FIR coefficients into `h`. 0 when there's nothing to learn from. */
/**
 * Inputs of the speaker model: the reference itself plus two distorted copies (x·|x| and x³), each
 * with its own filter (a Hammerstein model), so a speaker that squashes loud sounds, clicks above
 * all, is predicted too. Linear speakers just get near-zero filters for the extra inputs.
 */
#define TERMS 3

static void make_term(const float *ref, long n, int term, float *into) {
  for (long t = 0; t < n; t++) {
    float x = ref[t];
    into[t] = term == 0 ? x : term == 1 ? x * fabsf(x) : x * x * x;
  }
}

/** Solves the `TERMS`×`TERMS` complex system `a·x = b` in place (Gaussian elimination). */
static int solve_complex(double ar[TERMS][TERMS], double ai[TERMS][TERMS], double *br, double *bi) {
  for (int c = 0; c < TERMS; c++) {
    int pivot = c;
    double best = 0;
    for (int r = c; r < TERMS; r++) {
      double m = ar[r][c] * ar[r][c] + ai[r][c] * ai[r][c];
      if (m > best) best = m, pivot = r;
    }
    if (best <= 0) return 0;
    if (pivot != c) {
      for (int k = 0; k < TERMS; k++) {
        double t = ar[c][k];
        ar[c][k] = ar[pivot][k], ar[pivot][k] = t;
        t = ai[c][k];
        ai[c][k] = ai[pivot][k], ai[pivot][k] = t;
      }
      double t = br[c];
      br[c] = br[pivot], br[pivot] = t;
      t = bi[c];
      bi[c] = bi[pivot], bi[pivot] = t;
    }
    for (int r = c + 1; r < TERMS; r++) {
      // factor = a[r][c] / a[c][c]
      double fr = (ar[r][c] * ar[c][c] + ai[r][c] * ai[c][c]) / best;
      double fi = (ai[r][c] * ar[c][c] - ar[r][c] * ai[c][c]) / best;
      for (int k = c; k < TERMS; k++) {
        ar[r][k] -= fr * ar[c][k] - fi * ai[c][k];
        ai[r][k] -= fr * ai[c][k] + fi * ar[c][k];
      }
      br[r] -= fr * br[c] - fi * bi[c];
      bi[r] -= fr * bi[c] + fi * br[c];
    }
  }
  for (int r = TERMS - 1; r >= 0; r--) {
    double sr = br[r], si = bi[r];
    for (int k = r + 1; k < TERMS; k++) {
      sr -= ar[r][k] * br[k] - ai[r][k] * bi[k];
      si -= ar[r][k] * bi[k] + ai[r][k] * br[k];
    }
    double d = ar[r][r] * ar[r][r] + ai[r][r] * ai[r][r];
    br[r] = (sr * ar[r][r] + si * ai[r][r]) / d;
    bi[r] = (si * ar[r][r] - sr * ai[r][r]) / d;
  }
  return 1;
}

/**
 * Estimates the echo path from each input in `terms` (`TERMS` signals, `terms[0]` the reference) as
 * `taps` FIR coefficients into `h[term]`. 0 when there's nothing to learn from.
 */
static int estimate_paths(const float *mic, float *const *terms, long n, long taps, float **h) {
  long size = next_pow2(4 * taps);
  long hop = size / 2;
  long bins = size / 2 + 1;
  const float *ref = terms[0];

  long count = n > size ? (n - size) / hop + 1 : 1;
  frame_info *frames = calloc(count, sizeof(frame_info));
  float *window = malloc(sizeof(float) * size);
  float *xr[TERMS], *xi[TERMS], *hr[TERMS], *hi[TERMS];
  for (int i = 0; i < TERMS; i++) {
    xr[i] = malloc(sizeof(float) * size), xi[i] = malloc(sizeof(float) * size);
    hr[i] = malloc(sizeof(float) * size), hi[i] = malloc(sizeof(float) * size);
  }
  float *yr = malloc(sizeof(float) * size), *yi = malloc(sizeof(float) * size);
  // Per bin: the weighted cross-spectra between the inputs (upper triangle) and with the mic.
  double *rr = malloc(sizeof(double) * bins * TERMS * TERMS);
  double *ri = malloc(sizeof(double) * bins * TERMS * TERMS);
  double *pr = malloc(sizeof(double) * bins * TERMS), *pi = malloc(sizeof(double) * bins * TERMS);
  int ok = frames && window && yr && yi && rr && ri && pr && pi;
  for (int i = 0; i < TERMS; i++) ok = ok && xr[i] && xi[i] && hr[i] && hi[i];
  if (!ok) goto done;

  for (long i = 0; i < size; i++) window[i] = (float)(0.5 - 0.5 * cos(2 * M_PI * i / size));
  double total = 0;
  for (long f = 0; f < count; f++) {
    frames[f].start = f * hop;
    double e = 0;
    for (long t = frames[f].start; t < frames[f].start + size && t < n; t++) e += (double)ref[t] * ref[t];
    frames[f].energy = e;
    total += e;
  }
  if (total <= 1e-9) {
    ok = 0;
    goto done;
  }
  qsort(frames, count, sizeof(frame_info), by_energy_desc);
  long used = count < ESTIMATE_MAX_FRAMES ? count : ESTIMATE_MAX_FRAMES;
  while (used > 1 && frames[used - 1].energy < frames[0].energy * 1e-6) used--;

  int have_h = 0;
  for (int iteration = 0; iteration < ESTIMATE_ITERATIONS; iteration++) {
    memset(rr, 0, sizeof(double) * bins * TERMS * TERMS);
    memset(ri, 0, sizeof(double) * bins * TERMS * TERMS);
    memset(pr, 0, sizeof(double) * bins * TERMS);
    memset(pi, 0, sizeof(double) * bins * TERMS);
    for (long f = 0; f < used; f++) {
      for (int i = 0; i < TERMS; i++) windowed_spectrum(terms[i], n, frames[f].start, window, size, xr[i], xi[i]);
      windowed_spectrum(mic, n, frames[f].start, window, size, yr, yi);
      double weight = 1;
      if (have_h) {
        double residual = 0, echo = 0;
        for (long k = 0; k < bins; k++) {
          double er = 0, ei = 0;
          for (int i = 0; i < TERMS; i++) {
            er += hr[i][k] * xr[i][k] - hi[i][k] * xi[i][k];
            ei += hr[i][k] * xi[i][k] + hi[i][k] * xr[i][k];
          }
          double dr = yr[k] - er, di = yi[k] - ei;
          residual += dr * dr + di * di;
          echo += er * er + ei * ei;
        }
        double ratio = echo > 0 ? residual / echo : 1e9;
        weight = 1.0 / (ratio > MIN_RESIDUAL_RATIO ? ratio : MIN_RESIDUAL_RATIO);
      }
      for (long k = 0; k < bins; k++) {
        for (int i = 0; i < TERMS; i++) {
          // conj(X_i) · Y and conj(X_i) · X_j
          long p = k * TERMS + i;
          pr[p] += weight * ((double)xr[i][k] * yr[k] + (double)xi[i][k] * yi[k]);
          pi[p] += weight * ((double)xr[i][k] * yi[k] - (double)xi[i][k] * yr[k]);
          for (int j = i; j < TERMS; j++) {
            long q = (k * TERMS + i) * TERMS + j;
            rr[q] += weight * ((double)xr[i][k] * xr[j][k] + (double)xi[i][k] * xi[j][k]);
            ri[q] += weight * ((double)xr[i][k] * xi[j][k] - (double)xi[i][k] * xr[j][k]);
          }
        }
      }
    }
    // Regularize each input relative to its own average power.
    double mean[TERMS] = {0};
    for (long k = 0; k < bins; k++)
      for (int i = 0; i < TERMS; i++) mean[i] += rr[(k * TERMS + i) * TERMS + i] / (double)bins;
    for (long k = 0; k < bins; k++) {
      double ar[TERMS][TERMS], ai[TERMS][TERMS], br[TERMS], bi[TERMS];
      for (int i = 0; i < TERMS; i++) {
        for (int j = 0; j < TERMS; j++) {
          long q = i <= j ? (k * TERMS + i) * TERMS + j : (k * TERMS + j) * TERMS + i;
          ar[i][j] = rr[q];
          ai[i][j] = i <= j ? ri[q] : -ri[q];
        }
        ar[i][i] += 1e-4 * mean[i] + 1e-20;
        br[i] = pr[k * TERMS + i];
        bi[i] = pi[k * TERMS + i];
      }
      if (!solve_complex(ar, ai, br, bi)) memset(br, 0, sizeof br), memset(bi, 0, sizeof bi);
      for (int i = 0; i < TERMS; i++) hr[i][k] = (float)br[i], hi[i][k] = (float)bi[i];
    }
    // Causal and `taps` long, faded at the end; the next weighting uses the truncated filters.
    for (int i = 0; i < TERMS; i++) {
      for (long k = 1; k < size / 2; k++) {
        hr[i][size - k] = hr[i][k];
        hi[i][size - k] = -hi[i][k];
      }
      fft(hr[i], hi[i], size, 1);
      long fade = taps / 10;
      for (long t = 0; t < size; t++) {
        float value = t < taps ? hr[i][t] / (float)size : 0;
        if (t < taps && t >= taps - fade) value *= (float)(taps - t) / (float)fade;
        hr[i][t] = value;
        hi[i][t] = 0;
      }
      memcpy(h[i], hr[i], sizeof(float) * taps);
      fft(hr[i], hi[i], size, 0);
    }
    have_h = 1;
  }

done:
  free(frames), free(window), free(yr), free(yi), free(rr), free(ri), free(pr), free(pi);
  for (int i = 0; i < TERMS; i++) free(xr[i]), free(xi[i]), free(hr[i]), free(hi[i]);
  return ok;
}

/** `echo = h * ref` (FFT overlap-add), `n` samples. */
static int convolve(const float *ref, long n, const float *h, long taps, float *echo) {
  long size = next_pow2(4 * taps);
  long block = size - taps + 1;
  float *hr = calloc(size, sizeof(float)), *hi = calloc(size, sizeof(float));
  float *xr = malloc(sizeof(float) * size), *xi = malloc(sizeof(float) * size);
  if (!hr || !hi || !xr || !xi) {
    free(hr), free(hi), free(xr), free(xi);
    return 0;
  }
  memcpy(hr, h, sizeof(float) * taps);
  fft(hr, hi, size, 0);
  memset(echo, 0, sizeof(float) * n);
  for (long start = 0; start < n; start += block) {
    for (long i = 0; i < size; i++) {
      long t = start + i;
      xr[i] = i < block && t < n ? ref[t] : 0;
      xi[i] = 0;
    }
    fft(xr, xi, size, 0);
    for (long k = 0; k < size; k++) {
      float r = xr[k] * hr[k] - xi[k] * hi[k];
      xi[k] = xr[k] * hi[k] + xi[k] * hr[k];
      xr[k] = r;
    }
    fft(xr, xi, size, 1);
    for (long i = 0; i < size && start + i < n; i++) echo[start + i] += xr[i] / (float)size;
  }
  free(hr), free(hi), free(xr), free(xi);
  return 1;
}

/** How hard `suppress` turns down what a predicted signal says is still there. */
typedef struct {
  long frame;
  /** Expected leftover as a share of the predicted energy, per bin. */
  double share;
  /** Bins either side a prediction also covers (energy smeared by the speaker). */
  long spread;
  /**
   * Share of a frame's total predicted energy assumed in *every* bin: a distorting speaker turns a
   * tone into harmonics and noise that the (linear) prediction doesn't show.
   */
  double broadband;
  /** Never turned down below this gain. */
  double floor;
} suppression;

/** Residual suppression after the linear cancellation (Strong cleanup). */
static const suppression RESIDUAL = {1024, 0.1, 0, 0, 0.2};

/**
 * Per frequency bin, turns down `out` where `predicted` (the echo as the filter predicts it) says the
 * backing still dominates. STFT with square-root Hann windows, 50% overlap; frames where nothing is
 * predicted are left untouched.
 */
static void suppress(float *out, const float *predicted, long n, const suppression *how) {
  long size = how->frame, hop = how->frame / 2;
  float *window = malloc(sizeof(float) * size);
  float *or_ = malloc(sizeof(float) * size), *oi = malloc(sizeof(float) * size);
  float *er = malloc(sizeof(float) * size), *ei = malloc(sizeof(float) * size);
  double *expected = malloc(sizeof(double) * size);
  float *result = calloc(n + size, sizeof(float));
  if (!window || !or_ || !oi || !er || !ei || !expected || !result) goto done;
  for (long i = 0; i < size; i++) window[i] = (float)sqrt(0.5 - 0.5 * cos(2 * M_PI * i / size));
  for (long start = -hop; start < n; start += hop) {
    windowed_spectrum(out, n, start, window, size, or_, oi);
    windowed_spectrum(predicted, n, start, window, size, er, ei);
    double total = 0;
    for (long k = 0; k < size; k++) {
      expected[k] = (double)er[k] * er[k] + (double)ei[k] * ei[k];
      total += expected[k];
    }
    if (total > 1e-12) {
      // Smear across neighbouring bins (a running max) and add the broadband share.
      double *spread = malloc(sizeof(double) * size);
      if (spread) {
        for (long k = 0; k < size; k++) {
          double value = 0;
          for (long j = k - how->spread; j <= k + how->spread; j++) {
            long b = (j % size + size) % size;
            if (expected[b] > value) value = expected[b];
          }
          spread[k] = value + how->broadband * total / (double)size;
        }
        for (long k = 0; k < size; k++) {
          double o2 = (double)or_[k] * or_[k] + (double)oi[k] * oi[k];
          double gain = 1.0 - how->share * spread[k] / (o2 + 1e-12);
          if (gain < how->floor) gain = how->floor;
          or_[k] *= (float)gain;
          oi[k] *= (float)gain;
        }
        free(spread);
      }
    }
    fft(or_, oi, size, 1);
    for (long i = 0; i < size; i++) {
      long t = start + i;
      if (t >= 0 && t < n) result[t] += or_[i] / (float)size * window[i];
    }
  }
  memcpy(out, result, sizeof(float) * n);
done:
  free(window), free(or_), free(oi), free(er), free(ei), free(expected), free(result);
}

/*
 * Metronome clicks are short and loud, and a phone speaker often clips them, so more is left after
 * the linear cancellation than for the backing tracks, partly as harmonics the filter can't predict.
 * How much is left is *measured*: in the click frames, per frequency bin, the leftover energy next to
 * the clicks' predicted echo; a low percentile over all clicks is what's left where the performer is
 * quiet. Each click frame is then turned down by about that much (times a margin), so a louder
 * performance in the same bins keeps its level.
 */
#define CLICK_FRAME 512
/** Bins either side the prediction covers (the speaker smears a tick's spectrum a little). */
#define CLICK_SPREAD 3
/** Share of a click frame's total predicted energy assumed in every bin (distortion products). */
#define CLICK_BROADBAND 0.05
/** Frames whose predicted click energy is below this share of the loudest one are left alone. */
#define CLICK_ACTIVE 1e-3
/** Percentile of the leftover ratio taken as "the click alone", and its upper bound. */
#define CLICK_PERCENTILE 0.25
#define CLICK_MAX_RATIO 0.3

typedef struct {
  double margin;
  double floor;
} click_suppression;
static const click_suppression CLICKS = {2.0, 0.1};
static const click_suppression CLICKS_STRONG = {3.0, 0.03};

static int compare_doubles(const void *a, const void *b) {
  double x = *(const double *)a, y = *(const double *)b;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The predicted click energy per bin of one frame (smeared, plus the broadband share); its total. */
static double click_prediction(const float *er, const float *ei, long size, double *predicted) {
  long bins = size / 2 + 1;
  double total = 0;
  for (long k = 0; k < bins; k++) total += (double)er[k] * er[k] + (double)ei[k] * ei[k];
  for (long k = 0; k < bins; k++) {
    double value = 0;
    for (long j = k - CLICK_SPREAD; j <= k + CLICK_SPREAD; j++) {
      if (j < 0 || j >= bins) continue;
      double e = (double)er[j] * er[j] + (double)ei[j] * ei[j];
      if (e > value) value = e;
    }
    predicted[k] = value + CLICK_BROADBAND * total / (double)bins;
  }
  return total;
}

static void suppress_clicks(float *out, const float *click_echo, long n, const click_suppression *how) {
  long size = CLICK_FRAME, hop = CLICK_FRAME / 2, bins = size / 2 + 1;
  long frames = (n + hop) / hop + 1;
  float *window = malloc(sizeof(float) * size);
  float *or_ = malloc(sizeof(float) * size), *oi = malloc(sizeof(float) * size);
  float *er = malloc(sizeof(float) * size), *ei = malloc(sizeof(float) * size);
  double *predicted = malloc(sizeof(double) * bins), *ratio = malloc(sizeof(double) * bins);
  double *totals = malloc(sizeof(double) * frames);
  float *result = calloc(n + size, sizeof(float));
  double *samples = NULL;
  if (!window || !or_ || !oi || !er || !ei || !predicted || !ratio || !totals || !result) goto done;
  for (long i = 0; i < size; i++) window[i] = (float)sqrt(0.5 - 0.5 * cos(2 * M_PI * i / size));

  // Which frames have a click, and how loud the loudest one is.
  double loudest = 0;
  long active = 0;
  for (long f = 0; f < frames; f++) {
    windowed_spectrum(click_echo, n, f * hop - hop, window, size, er, ei);
    double total = 0;
    for (long k = 0; k < bins; k++) total += (double)er[k] * er[k] + (double)ei[k] * ei[k];
    totals[f] = total;
    if (total > loudest) loudest = total;
  }
  if (loudest <= 1e-12) goto done;
  for (long f = 0; f < frames; f++) active += totals[f] > CLICK_ACTIVE * loudest;
  samples = malloc(sizeof(double) * (size_t)active * (size_t)bins);
  if (!samples) goto done;

  // Measure: the leftover-to-prediction ratio per bin, in every click frame.
  long a = 0;
  for (long f = 0; f < frames; f++) {
    if (totals[f] <= CLICK_ACTIVE * loudest) continue;
    windowed_spectrum(out, n, f * hop - hop, window, size, or_, oi);
    windowed_spectrum(click_echo, n, f * hop - hop, window, size, er, ei);
    click_prediction(er, ei, size, predicted);
    for (long k = 0; k < bins; k++) {
      double o2 = (double)or_[k] * or_[k] + (double)oi[k] * oi[k];
      samples[k * active + a] = o2 / (predicted[k] + 1e-20);
    }
    a++;
  }
  for (long k = 0; k < bins; k++) {
    double *values = samples + k * active;
    qsort(values, active, sizeof(double), compare_doubles);
    double r = values[(long)(CLICK_PERCENTILE * (double)(active - 1))];
    ratio[k] = r < CLICK_MAX_RATIO ? r : CLICK_MAX_RATIO;
  }

  // Apply: turn each click frame down by what's expected to be left of the click there.
  for (long f = 0; f < frames; f++) {
    long start = f * hop - hop;
    windowed_spectrum(out, n, start, window, size, or_, oi);
    if (totals[f] > CLICK_ACTIVE * loudest) {
      windowed_spectrum(click_echo, n, start, window, size, er, ei);
      click_prediction(er, ei, size, predicted);
      for (long k = 0; k < bins; k++) {
        double o2 = (double)or_[k] * or_[k] + (double)oi[k] * oi[k];
        double gain = 1.0 - how->margin * ratio[k] * predicted[k] / (o2 + 1e-20);
        if (gain < how->floor) gain = how->floor;
        or_[k] *= (float)gain;
        oi[k] *= (float)gain;
        if (k > 0 && k < size - k) {
          or_[size - k] *= (float)gain;
          oi[size - k] *= (float)gain;
        }
      }
    }
    fft(or_, oi, size, 1);
    for (long i = 0; i < size; i++) {
      long t = start + i;
      if (t >= 0 && t < n) result[t] += or_[i] / (float)size * window[i];
    }
  }
  memcpy(out, result, sizeof(float) * n);
done:
  free(window), free(or_), free(oi), free(er), free(ei), free(predicted), free(ratio);
  free(totals), free(result), free(samples);
}

void ec_cancel(const float *mic, const float *ref, const float *clicks, long n, int sample_rate,
               const ec_options *options, float *out, double *reduction_db) {
  long taps = (long)(options->filter_ms + options->lead_ms) * sample_rate / 1000;
  float *terms[TERMS] = {NULL}, *h[TERMS] = {NULL};
  float *echo = malloc(sizeof(float) * n), *part = malloc(sizeof(float) * n);
  int ok = echo && part;
  for (int i = 0; i < TERMS && ok; i++) {
    h[i] = calloc(taps, sizeof(float));
    terms[i] = i == 0 ? (float *)ref : malloc(sizeof(float) * n);
    ok = h[i] && terms[i];
    if (ok && i > 0) make_term(ref, n, i, terms[i]);
  }
  *reduction_db = 0;
  ok = ok && estimate_paths(mic, terms, n, taps, h);
  // The echo: every input through its filter.
  if (ok) memset(echo, 0, sizeof(float) * n);
  for (int i = 0; i < TERMS && ok; i++) {
    ok = convolve(terms[i], n, h[i], taps, part);
    for (long t = 0; ok && t < n; t++) echo[t] += part[t];
  }
  if (!ok) {
    // Nothing to cancel (silent backing) or out of memory: the take stays as recorded.
    memcpy(out, mic, sizeof(float) * n);
    goto done;
  }
  for (long t = 0; t < n; t++) out[t] = mic[t] - echo[t];
  if (options->residual_suppression) suppress(out, echo, n, &RESIDUAL);
  if (clicks) {
    // The clicks' own predicted echo (through the same model) says exactly when and where to turn
    // down what's left of them.
    float *click_term = malloc(sizeof(float) * n);
    int fine = click_term != NULL;
    if (fine) memset(echo, 0, sizeof(float) * n);
    for (int i = 0; i < TERMS && fine; i++) {
      make_term(clicks, n, i, click_term);
      fine = convolve(click_term, n, h[i], taps, part);
      for (long t = 0; fine && t < n; t++) echo[t] += part[t];
    }
    if (fine) suppress_clicks(out, echo, n, options->residual_suppression ? &CLICKS_STRONG : &CLICKS);
    free(click_term);
  }

  // Energy removed where the backing plays (10 ms frames above about -50 dBFS).
  long frame = sample_rate / 100 > 0 ? sample_rate / 100 : 1;
  double mic_energy = 0, out_energy = 0;
  for (long start = 0; start < n; start += frame) {
    long end = start + frame < n ? start + frame : n;
    double e = 0;
    for (long t = start; t < end; t++) e += (double)ref[t] * ref[t];
    if (sqrt(e / (double)(end - start)) < ACTIVE_REFERENCE_RMS) continue;
    for (long t = start; t < end; t++) {
      mic_energy += (double)mic[t] * mic[t];
      out_energy += (double)out[t] * out[t];
    }
  }
  if (mic_energy > 0 && out_energy > 0) *reduction_db = 10.0 * log10(mic_energy / out_energy);
done:
  for (int i = 0; i < TERMS; i++) {
    free(h[i]);
    if (i > 0) free(terms[i]);
  }
  free(echo), free(part);
}

/* ---------------------------------------------------------------------------------------------- */

/** Moves `x` later by `shift` samples (earlier when negative), filling with silence. */
static void shift_signal(float *x, long n, long shift) {
  if (shift > 0) {
    long keep = n - shift > 0 ? n - shift : 0;
    memmove(x + shift, x, sizeof(float) * keep);
    memset(x, 0, sizeof(float) * (shift < n ? shift : n));
  } else if (shift < 0) {
    long by = -shift;
    long keep = n - by > 0 ? n - by : 0;
    memmove(x, x + by, sizeof(float) * keep);
    memset(x + keep, 0, sizeof(float) * (n - keep));
  }
}

int ec_clean_take(const char *mic_path, const char *out_path, const ec_plan *plan,
                  const ec_options *options, ec_result *result) {
  memset(result, 0, sizeof *result);
  unsigned int sample_rate = 0;
  long n = 0;
  float *mic = read_mono(mic_path, &sample_rate, &n);
  if (!mic || n == 0) {
    free(mic);
    fail(result, "The recording couldn't be read.");
    return 0;
  }
  result->seconds = (double)n / sample_rate;

  float *ref = calloc(n, sizeof(float));
  float *clicks = calloc(n, sizeof(float));
  float *out = malloc(sizeof(float) * n);
  if (!ref || !clicks || !out) {
    free(mic), free(ref), free(clicks), free(out);
    fail(result, "Not enough memory to clean the take.");
    return 0;
  }
  if (!render_reference(plan, sample_rate, ref, clicks, n, result)) {
    free(mic), free(ref), free(clicks), free(out);
    result->ok = 0;
    return 0;
  }
  // The canceller works on everything that played; the clicks also get their own suppression.
  for (long t = 0; t < n; t++) ref[t] += clicks[t];

  long max_lag = (long)options->max_delay_ms * sample_rate / 1000;
  double confidence = 0;
  long lag = ec_estimate_delay(mic, ref, n, max_lag, (int)sample_rate, &confidence);
  result->delay_confidence = confidence;
  if (confidence < MIN_DELAY_CONFIDENCE) lag = 0;
  result->delay_ms = 1000.0 * (double)lag / sample_rate;

  // Shift the reference so it leads the echo by `lead_ms` (the filter only models what comes after).
  long shift = lag - (long)options->lead_ms * sample_rate / 1000;
  shift_signal(ref, n, shift);
  shift_signal(clicks, n, shift);

  ec_cancel(mic, ref, plan->click_count > 0 ? clicks : NULL, n, (int)sample_rate, options, out,
            &result->reduction_db);
  int written = write_wav24(out_path, out, n, sample_rate);
  free(mic), free(ref), free(clicks), free(out);
  if (!written) {
    fail(result, "The cleaned take couldn't be written.");
    return 0;
  }
  result->ok = 1;
  return 1;
}
