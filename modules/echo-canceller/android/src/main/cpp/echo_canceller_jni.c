/*
 * JNI glue for EchoCancellerModule.kt: turns the flattened plan into an `ec_plan`, cleans the take
 * with the default (strongest) options, and hands back the result or the C core's error message.
 */
#include <jni.h>
#include <stdlib.h>
#include <string.h>

#include "echo_cancel.h"

static jstring message(JNIEnv *env, const char *text) { return (*env)->NewStringUTF(env, text); }

/**
 * Returns null on success (with delayMs, delayConfidence, reductionDb, seconds in `out`), or the
 * error message.
 */
JNIEXPORT jstring JNICALL Java_expo_modules_echocanceller_EchoCancellerModule_nativeCleanTake(
    JNIEnv *env, jclass clazz, jstring mic_path, jstring output_path, jobjectArray paths,
    jfloatArray gains, jdoubleArray file_starts, jdoubleArray offsets, jdoubleArray durations,
    jdoubleArray click_starts, jintArray click_waves, jobjectArray waves, jdoubleArray out) {
  (void)clazz;
  jsize clip_count = (*env)->GetArrayLength(env, paths);
  jsize click_count = (*env)->GetArrayLength(env, click_starts);
  jsize wave_count = (*env)->GetArrayLength(env, waves);

  ec_clip *clips = calloc(clip_count > 0 ? clip_count : 1, sizeof(ec_clip));
  const char **path_chars = calloc(clip_count > 0 ? clip_count : 1, sizeof(char *));
  jstring *path_strings = calloc(clip_count > 0 ? clip_count : 1, sizeof(jstring));
  ec_click *clicks = calloc(click_count > 0 ? click_count : 1, sizeof(ec_click));
  float **wave_samples = calloc(wave_count > 0 ? wave_count : 1, sizeof(float *));
  int *wave_lengths = calloc(wave_count > 0 ? wave_count : 1, sizeof(int));
  const char *mic = (*env)->GetStringUTFChars(env, mic_path, NULL);
  const char *output = (*env)->GetStringUTFChars(env, output_path, NULL);
  jstring error = NULL;
  if (!clips || !path_chars || !path_strings || !clicks || !wave_samples || !wave_lengths || !mic ||
      !output) {
    error = message(env, "Not enough memory to clean the take.");
    goto done;
  }

  jfloat *gain = (*env)->GetFloatArrayElements(env, gains, NULL);
  jdouble *start = (*env)->GetDoubleArrayElements(env, file_starts, NULL);
  jdouble *offset = (*env)->GetDoubleArrayElements(env, offsets, NULL);
  jdouble *duration = (*env)->GetDoubleArrayElements(env, durations, NULL);
  for (jsize i = 0; i < clip_count; i++) {
    path_strings[i] = (jstring)(*env)->GetObjectArrayElement(env, paths, i);
    path_chars[i] = (*env)->GetStringUTFChars(env, path_strings[i], NULL);
    clips[i] = (ec_clip){path_chars[i], gain[i], start[i], offset[i], duration[i]};
  }
  (*env)->ReleaseFloatArrayElements(env, gains, gain, JNI_ABORT);
  (*env)->ReleaseDoubleArrayElements(env, file_starts, start, JNI_ABORT);
  (*env)->ReleaseDoubleArrayElements(env, offsets, offset, JNI_ABORT);
  (*env)->ReleaseDoubleArrayElements(env, durations, duration, JNI_ABORT);

  jdouble *click_start = (*env)->GetDoubleArrayElements(env, click_starts, NULL);
  jint *click_wave = (*env)->GetIntArrayElements(env, click_waves, NULL);
  for (jsize i = 0; i < click_count; i++) clicks[i] = (ec_click){click_start[i], click_wave[i]};
  (*env)->ReleaseDoubleArrayElements(env, click_starts, click_start, JNI_ABORT);
  (*env)->ReleaseIntArrayElements(env, click_waves, click_wave, JNI_ABORT);

  // Copies of the click sounds, so no JNI array stays pinned while the take is cleaned.
  for (jsize i = 0; i < wave_count; i++) {
    jfloatArray wave = (jfloatArray)(*env)->GetObjectArrayElement(env, waves, i);
    jsize length = (*env)->GetArrayLength(env, wave);
    wave_samples[i] = malloc(sizeof(float) * (length > 0 ? length : 1));
    wave_lengths[i] = length;
    if (wave_samples[i]) (*env)->GetFloatArrayRegion(env, wave, 0, length, wave_samples[i]);
    (*env)->DeleteLocalRef(env, wave);
    if (!wave_samples[i]) {
      error = message(env, "Not enough memory to clean the take.");
      goto done;
    }
  }

  ec_plan plan = {clips, clip_count, clicks, click_count, (const float *const *)wave_samples,
                  wave_lengths, wave_count};
  ec_options options;
  ec_default_options(&options);
  ec_result result;
  if (ec_clean_take(mic, output, &plan, &options, &result)) {
    jdouble values[4] = {result.delay_ms, result.delay_confidence, result.reduction_db, result.seconds};
    (*env)->SetDoubleArrayRegion(env, out, 0, 4, values);
  } else {
    error = message(env, result.message);
  }

done:
  if (path_chars && path_strings) {
    for (jsize i = 0; i < clip_count; i++) {
      if (path_chars[i]) (*env)->ReleaseStringUTFChars(env, path_strings[i], path_chars[i]);
      if (path_strings[i]) (*env)->DeleteLocalRef(env, path_strings[i]);
    }
  }
  if (wave_samples)
    for (jsize i = 0; i < wave_count; i++) free(wave_samples[i]);
  if (mic) (*env)->ReleaseStringUTFChars(env, mic_path, mic);
  if (output) (*env)->ReleaseStringUTFChars(env, output_path, output);
  free(clips), free(path_chars), free(path_strings), free(clicks), free(wave_samples), free(wave_lengths);
  return error;
}
