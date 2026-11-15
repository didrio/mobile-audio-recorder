package expo.modules.audioexport

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.EOFException
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Export helpers (T36, T37): encodes a rendered WAV to M4A (AAC-LC via MediaCodec, muxed by
 * MediaMuxer), and shares several files in one chooser (expo-sharing takes one file).
 */
class AudioExportModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private var pendingShare: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("AudioExport")

    AsyncFunction("encodeM4A") { wavPath: String, outputPath: String, bitRate: Int ->
      encode(wavPath, outputPath, bitRate)
    }

    AsyncFunction("shareFiles") { paths: List<String>, promise: Promise ->
      if (pendingShare != null) throw CodedException("ShareInProgress", "Another share is open.", null)
      // expo-sharing's FileProvider covers the cache directory, where exports are written.
      val authority = context.applicationInfo.packageName + ".SharingFileProvider"
      val uris = ArrayList<Uri>(paths.map { FileProvider.getUriForFile(context, authority, File(it)) })
      val send = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        type = "*/*"
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        clipData = ClipData.newRawUri(null, uris.first()).also { clip ->
          uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
        }
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      pendingShare = promise
      appContext.throwingActivity.startActivityForResult(Intent.createChooser(send, null), REQUEST_CODE)
    }

    OnActivityResult { _, (requestCode) ->
      if (requestCode == REQUEST_CODE) {
        pendingShare?.resolve(null)
        pendingShare = null
      }
    }
  }

  private class WavInfo(
    val sampleRate: Int,
    val channels: Int,
    val bitsPerSample: Int,
    val dataOffset: Long,
    val dataBytes: Long,
  )

  /** Finds the format and the audio data of an integer PCM WAV (16 or 24 bit). */
  private fun readWavInfo(path: String): WavInfo {
    RandomAccessFile(path, "r").use { file ->
      fun id(): String = ByteArray(4).also { file.readFully(it) }.toString(Charsets.US_ASCII)
      fun u32(): Long {
        val b = ByteArray(4).also { file.readFully(it) }
        return (b[0].toLong() and 0xff) or ((b[1].toLong() and 0xff) shl 8) or
          ((b[2].toLong() and 0xff) shl 16) or ((b[3].toLong() and 0xff) shl 24)
      }
      fun u16(): Int {
        val b = ByteArray(2).also { file.readFully(it) }
        return (b[0].toInt() and 0xff) or ((b[1].toInt() and 0xff) shl 8)
      }
      if (id() != "RIFF") throw CodedException("EncodeFailed", "Not a WAV file.", null)
      u32()
      if (id() != "WAVE") throw CodedException("EncodeFailed", "Not a WAV file.", null)
      var sampleRate = 0
      var channels = 0
      var bits = 0
      while (file.filePointer < file.length()) {
        val chunk = id()
        val size = u32()
        val start = file.filePointer
        when (chunk) {
          "fmt " -> {
            u16() // format: integer PCM
            channels = u16()
            sampleRate = u32().toInt()
            u32()
            u16()
            bits = u16()
          }
          "data" -> {
            if (bits != 16 && bits != 24) {
              throw CodedException("EncodeFailed", "Unsupported WAV bit depth: $bits.", null)
            }
            return WavInfo(sampleRate, channels, bits, start, minOf(size, file.length() - start))
          }
        }
        file.seek(start + size + (size and 1))
      }
    }
    throw CodedException("EncodeFailed", "The WAV file has no audio data.", null)
  }

  private fun encode(wavPath: String, outputPath: String, bitRate: Int) {
    val wav = readWavInfo(wavPath)
    val inFrameBytes = wav.bitsPerSample / 8 * wav.channels
    val totalFrames = wav.dataBytes / inFrameBytes
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, wav.sampleRate, wav.channels).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, FRAMES_PER_INPUT * 2 * wav.channels)
    }
    File(outputPath).delete()
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxing = false
    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()
      BufferedInputStream(FileInputStream(wavPath)).use { input ->
        skipFully(input, wav.dataOffset)
        val raw = ByteArray(FRAMES_PER_INPUT * inFrameBytes)
        val info = MediaCodec.BufferInfo()
        var track = -1
        var framesRead = 0L
        var inputDone = false
        var outputDone = false
        while (!outputDone) {
          if (!inputDone) {
            val index = codec.dequeueInputBuffer(TIMEOUT_US)
            if (index >= 0) {
              val buffer = codec.getInputBuffer(index)!!.order(ByteOrder.LITTLE_ENDIAN)
              buffer.clear()
              val capacityFrames = buffer.capacity() / (2 * wav.channels)
              val frames = minOf(FRAMES_PER_INPUT.toLong(), capacityFrames.toLong(), totalFrames - framesRead).toInt()
              val presentationUs = framesRead * 1_000_000L / wav.sampleRate
              if (frames <= 0) {
                codec.queueInputBuffer(index, 0, 0, presentationUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputDone = true
              } else {
                readFully(input, raw, frames * inFrameBytes)
                toPcm16(raw, frames * wav.channels, wav.bitsPerSample, buffer)
                codec.queueInputBuffer(index, 0, frames * 2 * wav.channels, presentationUs, 0)
                framesRead += frames
              }
            }
          }
          val out = codec.dequeueOutputBuffer(info, TIMEOUT_US)
          if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            track = muxer.addTrack(codec.outputFormat)
            muxer.start()
            muxing = true
          } else if (out >= 0) {
            val encoded = codec.getOutputBuffer(out)!!
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
            if (info.size > 0 && muxing) {
              encoded.position(info.offset)
              encoded.limit(info.offset + info.size)
              muxer.writeSampleData(track, encoded, info)
            }
            codec.releaseOutputBuffer(out, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
          }
        }
      }
    } finally {
      try {
        codec.stop()
      } catch (_: IllegalStateException) {
      }
      codec.release()
      if (muxing) muxer.stop()
      muxer.release()
    }
  }

  /** Little-endian 16- or 24-bit samples → 16-bit samples in `out` (24-bit keeps the top 16 bits). */
  private fun toPcm16(raw: ByteArray, samples: Int, bits: Int, out: ByteBuffer) {
    val step = bits / 8
    for (i in 0 until samples) {
      val at = i * step + (step - 2)
      val value = (raw[at].toInt() and 0xff) or (raw[at + 1].toInt() shl 8)
      out.putShort(value.toShort())
    }
  }

  private fun readFully(input: InputStream, into: ByteArray, length: Int) {
    var done = 0
    while (done < length) {
      val n = input.read(into, done, length - done)
      if (n < 0) throw EOFException("The WAV file ended early.")
      done += n
    }
  }

  private fun skipFully(input: InputStream, count: Long) {
    var left = count
    while (left > 0) {
      val skipped = input.skip(left)
      if (skipped <= 0) {
        if (input.read() < 0) throw EOFException("The WAV file ended early.")
        left -= 1
      } else {
        left -= skipped
      }
    }
  }

  companion object {
    private const val REQUEST_CODE = 8531
    private const val FRAMES_PER_INPUT = 4096
    private const val TIMEOUT_US = 10_000L
  }
}
