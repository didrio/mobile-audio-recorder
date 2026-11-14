import ExpoModulesCore

/// One clip that played while recording (see `ec_clip` in `cpp/echo_cancel.h`).
struct EchoClip: Record {
  @Field var path: String = ""
  @Field var gain: Double = 1
  @Field var fileStart: Double = 0
  @Field var offset: Double = 0
  @Field var duration: Double = 0
}

/// One metronome click: `wave` indexes `CleanTakeRequest.waves`.
struct EchoClick: Record {
  @Field var fileStart: Double = 0
  @Field var wave: Int = 0
}

struct CleanTakeRequest: Record {
  @Field var micPath: String = ""
  @Field var outputPath: String = ""
  @Field var clips: [EchoClip] = []
  @Field var clicks: [EchoClick] = []
  /// Click sounds at the take's sample rate, already scaled by the metronome volume.
  @Field var waves: [[Double]] = []
  @Field var strong: Bool = false
}

/// Cleans a take recorded from the speaker by removing the known backing (the C core in `cpp/`).
/// Runs off the JS thread; only paths and the small plan cross the bridge.
public class EchoCancellerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EchoCanceller")

    AsyncFunction("cleanTake") { (request: CleanTakeRequest) throws -> [String: Any] in
      try Self.clean(request)
    }
  }

  private static func clean(_ request: CleanTakeRequest) throws -> [String: Any] {
    // C copies of the strings and click waves, freed when done.
    let paths = request.clips.map { strdup($0.path) }
    defer { paths.forEach { free($0) } }
    let waves: [UnsafeMutablePointer<Float>] = request.waves.map { wave in
      let pointer = UnsafeMutablePointer<Float>.allocate(capacity: max(wave.count, 1))
      for (index, value) in wave.enumerated() { pointer[index] = Float(value) }
      return pointer
    }
    defer { waves.forEach { $0.deallocate() } }

    var clips = request.clips.enumerated().map { index, clip in
      ec_clip(
        path: UnsafePointer(paths[index]), gain: Float(clip.gain), file_start: clip.fileStart,
        offset: clip.offset, duration: clip.duration)
    }
    var clicks = request.clicks.map { ec_click(file_start: $0.fileStart, wave: Int32($0.wave)) }
    var wavePointers: [UnsafePointer<Float>?] = waves.map { UnsafePointer($0) }
    var waveLengths = request.waves.map { Int32($0.count) }

    var options = ec_options()
    ec_default_options(&options)
    options.residual_suppression = request.strong ? 1 : 0
    var result = ec_result()

    let ok = clips.withUnsafeMutableBufferPointer { clipBuffer in
      clicks.withUnsafeMutableBufferPointer { clickBuffer in
        wavePointers.withUnsafeMutableBufferPointer { waveBuffer in
          waveLengths.withUnsafeMutableBufferPointer { lengthBuffer in
            var plan = ec_plan(
              clips: UnsafePointer(clipBuffer.baseAddress), clip_count: Int32(clipBuffer.count),
              clicks: UnsafePointer(clickBuffer.baseAddress), click_count: Int32(clickBuffer.count),
              waves: UnsafePointer(waveBuffer.baseAddress), wave_lengths: UnsafePointer(lengthBuffer.baseAddress),
              wave_count: Int32(waveBuffer.count))
            return ec_clean_take(request.micPath, request.outputPath, &plan, &options, &result)
          }
        }
      }
    }
    guard ok == 1 else {
      let message = withUnsafeBytes(of: result.message) { bytes in
        String(decoding: bytes.prefix(while: { $0 != 0 }), as: UTF8.self)
      }
      throw CleanTakeException(message)
    }
    return [
      "delayMs": result.delay_ms,
      "delayConfidence": result.delay_confidence,
      "reductionDb": result.reduction_db,
      "seconds": result.seconds,
    ]
  }
}

final class CleanTakeException: GenericException<String> {
  override var reason: String { param }
}
