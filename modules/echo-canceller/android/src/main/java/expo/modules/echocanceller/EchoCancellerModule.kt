package expo.modules.echocanceller

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** One clip that played while recording (see `ec_clip` in `cpp/echo_cancel.h`). */
class EchoClip : Record {
  @Field val path: String = ""
  @Field val gain: Double = 1.0
  @Field val fileStart: Double = 0.0
  @Field val offset: Double = 0.0
  @Field val duration: Double = 0.0
}

/** One metronome click: `wave` indexes `CleanTakeRequest.waves`. */
class EchoClick : Record {
  @Field val fileStart: Double = 0.0
  @Field val wave: Int = 0
}

class CleanTakeRequest : Record {
  @Field val micPath: String = ""
  @Field val outputPath: String = ""
  @Field val clips: List<EchoClip> = emptyList()
  @Field val clicks: List<EchoClick> = emptyList()
  /** Click sounds at the take's sample rate, already scaled by the metronome volume. */
  @Field val waves: List<List<Double>> = emptyList()
}

/**
 * Cleans a take recorded from the speaker by removing the known backing (the C core in `cpp/`, shared
 * with iOS, through `src/main/cpp/echo_canceller_jni.c`). Runs off the JS thread; only paths and the
 * small plan cross the bridge.
 */
class EchoCancellerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EchoCanceller")

    AsyncFunction("cleanTake") { request: CleanTakeRequest -> clean(request) }
  }

  private fun clean(request: CleanTakeRequest): Map<String, Double> {
    val out = DoubleArray(4)
    val error = nativeCleanTake(
      request.micPath,
      request.outputPath,
      request.clips.map { it.path }.toTypedArray(),
      FloatArray(request.clips.size) { request.clips[it].gain.toFloat() },
      DoubleArray(request.clips.size) { request.clips[it].fileStart },
      DoubleArray(request.clips.size) { request.clips[it].offset },
      DoubleArray(request.clips.size) { request.clips[it].duration },
      DoubleArray(request.clicks.size) { request.clicks[it].fileStart },
      IntArray(request.clicks.size) { request.clicks[it].wave },
      request.waves.map { wave -> FloatArray(wave.size) { wave[it].toFloat() } }.toTypedArray(),
      out,
    )
    if (error != null) throw CleanTakeException(error)
    return mapOf(
      "delayMs" to out[0],
      "delayConfidence" to out[1],
      "reductionDb" to out[2],
      "seconds" to out[3],
    )
  }

  private class CleanTakeException(message: String) : CodedException("CleanTakeFailed", message, null)

  companion object {
    init {
      System.loadLibrary("echo_canceller")
    }

    @JvmStatic
    private external fun nativeCleanTake(
      micPath: String,
      outputPath: String,
      paths: Array<String>,
      gains: FloatArray,
      fileStarts: DoubleArray,
      offsets: DoubleArray,
      durations: DoubleArray,
      clickStarts: DoubleArray,
      clickWaves: IntArray,
      waves: Array<FloatArray>,
      out: DoubleArray,
    ): String?
  }
}
