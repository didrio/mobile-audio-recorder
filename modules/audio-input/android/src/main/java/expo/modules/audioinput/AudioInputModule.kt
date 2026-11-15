package expo.modules.audioinput

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Input details the audio library doesn't expose (T38): the input's channel count and pulling one
 * channel out of a multi-channel take. Android has no app-settable input gain and no route button
 * (switching outputs is left to the system).
 */
class AudioInputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioInput")

    /** Channel count of the input with this id (from the audio library), or the built-in mic. */
    AsyncFunction("getInputInfo") { deviceId: String? ->
      val manager = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      val inputs = manager?.getDevices(AudioManager.GET_DEVICES_INPUTS) ?: emptyArray()
      val device =
        inputs.firstOrNull { it.id.toString() == deviceId }
          ?: inputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
      val channels = device?.channelCounts?.maxOrNull() ?: 1
      mapOf("channelCount" to maxOf(1, channels), "gainSettable" to false, "gain" to 1.0)
    }

    AsyncFunction("setInputGain") { _: Double -> false }

    /** Writes channel `channel` (0-based) of a PCM WAV as a mono WAV with the same sample format. */
    AsyncFunction("extractChannel") { sourcePath: String, outputPath: String, channel: Int ->
      extract(File(sourcePath), File(outputPath), channel)
    }
  }

  private class WavFormat(
    val formatTag: Int,
    val channels: Int,
    val sampleRate: Int,
    val bitsPerSample: Int,
    val blockAlign: Int,
  )

  private fun extract(source: File, output: File, channel: Int) {
    BufferedInputStream(FileInputStream(source)).use { input ->
      val riff = readBytes(input, 12)
      if (String(riff, 0, 4) != "RIFF" || String(riff, 8, 4) != "WAVE") {
        throw ExtractException("Not a WAV file.")
      }
      var format: WavFormat? = null
      var dataSize = -1L
      // Walk the chunks up to `data` (WAV allows others, e.g. LIST or FLLR, before it).
      while (dataSize < 0) {
        val header = ByteBuffer.wrap(readBytes(input, 8)).order(ByteOrder.LITTLE_ENDIAN)
        val id = String(header.array(), 0, 4)
        val size = header.getInt(4).toLong() and 0xffffffffL
        when (id) {
          "fmt " -> {
            val body = ByteBuffer.wrap(readBytes(input, size.toInt())).order(ByteOrder.LITTLE_ENDIAN)
            var tag = body.getShort(0).toInt() and 0xffff
            // WAVE_FORMAT_EXTENSIBLE: the real tag is the first two bytes of the sub-format GUID.
            if (tag == 0xfffe && size >= 26) tag = body.getShort(24).toInt() and 0xffff
            format =
              WavFormat(
                formatTag = tag,
                channels = body.getShort(2).toInt() and 0xffff,
                sampleRate = body.getInt(4),
                bitsPerSample = body.getShort(14).toInt() and 0xffff,
                blockAlign = body.getShort(12).toInt() and 0xffff,
              )
            if (size % 2 == 1L) skip(input, 1)
          }
          "data" -> dataSize = size
          else -> skip(input, size + size % 2)
        }
      }
      val fmt = format ?: throw ExtractException("The WAV file has no format chunk.")
      if (channel < 0 || channel >= fmt.channels) {
        throw ExtractException("The take has ${fmt.channels} channels, not ${channel + 1}.")
      }
      val sampleBytes = fmt.bitsPerSample / 8
      if (sampleBytes <= 0 || fmt.blockAlign != sampleBytes * fmt.channels) {
        throw ExtractException("Unsupported WAV sample layout.")
      }
      output.delete()
      var written = 0L
      BufferedOutputStream(FileOutputStream(output)).use { out ->
        out.write(wavHeader(fmt, sampleBytes, 0))
        val frames = ByteArray(fmt.blockAlign * 4096)
        val mono = ByteArray(sampleBytes * 4096)
        val offset = channel * sampleBytes
        // An unfinished header (size 0 or 0xFFFFFFFF) means: read to the end of the file.
        var remaining = if (dataSize == 0L || dataSize == 0xffffffffL) Long.MAX_VALUE else dataSize
        while (remaining > 0) {
          val wanted = minOf(frames.size.toLong(), remaining).toInt()
          val read = readUpTo(input, frames, wanted)
          val whole = read / fmt.blockAlign
          if (whole == 0) break
          for (frame in 0 until whole) {
            System.arraycopy(frames, frame * fmt.blockAlign + offset, mono, frame * sampleBytes, sampleBytes)
          }
          out.write(mono, 0, whole * sampleBytes)
          written += whole * sampleBytes
          remaining -= read
          if (read < wanted) break
        }
      }
      RandomAccessFile(output, "rw").use { file -> file.write(wavHeader(fmt, sampleBytes, written)) }
    }
  }

  private fun wavHeader(fmt: WavFormat, sampleBytes: Int, dataBytes: Long): ByteArray {
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray())
    header.putInt((36 + dataBytes).toInt())
    header.put("WAVE".toByteArray())
    header.put("fmt ".toByteArray())
    header.putInt(16)
    header.putShort(fmt.formatTag.toShort())
    header.putShort(1)
    header.putInt(fmt.sampleRate)
    header.putInt(fmt.sampleRate * sampleBytes)
    header.putShort(sampleBytes.toShort())
    header.putShort(fmt.bitsPerSample.toShort())
    header.put("data".toByteArray())
    header.putInt(dataBytes.toInt())
    return header.array()
  }

  private fun readBytes(input: InputStream, count: Int): ByteArray {
    val bytes = ByteArray(count)
    if (readUpTo(input, bytes, count) < count) throw ExtractException("The WAV file is truncated.")
    return bytes
  }

  private fun readUpTo(input: InputStream, buffer: ByteArray, count: Int): Int {
    var total = 0
    while (total < count) {
      val read = input.read(buffer, total, count - total)
      if (read < 0) break
      total += read
    }
    return total
  }

  private fun skip(input: InputStream, count: Long) {
    var left = count
    while (left > 0) {
      val skipped = input.skip(left)
      if (skipped <= 0) {
        if (input.read() < 0) throw ExtractException("The WAV file is truncated.")
        left -= 1
      } else {
        left -= skipped
      }
    }
  }

  private class ExtractException(message: String) : CodedException("ExtractFailed", message, null)
}
