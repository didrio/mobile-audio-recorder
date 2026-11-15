import AVFoundation
import ExpoModulesCore
import UIKit

/// Export helpers (T36, T37): encodes a rendered WAV to M4A (AAC), and shares several files in one
/// share sheet (expo-sharing takes one file). Only paths cross the bridge; audio stays native.
public class AudioExportModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioExport")

    /// Reads the WAV at `wavPath` and writes AAC in an MPEG-4 container to `outputPath` (`.m4a`).
    AsyncFunction("encodeM4A") { (wavPath: String, outputPath: String, bitRate: Int) throws in
      try Self.encode(wavPath: wavPath, outputPath: outputPath, bitRate: bitRate)
    }

    /// Shows the share sheet for the files at these plain paths; resolves when it closes.
    AsyncFunction("shareFiles") { (paths: [String], promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject(Exception(name: "NoViewController", description: "Nothing to show the share sheet on."))
        return
      }
      let urls = paths.map { URL(fileURLWithPath: $0) }
      let controller = UIActivityViewController(activityItems: urls, applicationActivities: nil)
      controller.completionWithItemsHandler = { _, _, _, _ in promise.resolve(nil) }
      if let popover = controller.popoverPresentationController {
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(
          x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 80, width: 0, height: 0)
      }
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)
  }

  private static func encode(wavPath: String, outputPath: String, bitRate: Int) throws {
    let input = try AVAudioFile(forReading: URL(fileURLWithPath: wavPath))
    let outputURL = URL(fileURLWithPath: outputPath)
    do {
      try write(input: input, to: outputURL, bitRate: bitRate)
    } catch {
      // Some sample rate / channel combinations reject a bit rate: let the encoder pick one.
      input.framePosition = 0
      try write(input: input, to: outputURL, bitRate: nil)
    }
  }

  private static func write(input: AVAudioFile, to url: URL, bitRate: Int?) throws {
    try? FileManager.default.removeItem(at: url)
    let format = input.processingFormat
    var settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: format.sampleRate,
      AVNumberOfChannelsKey: format.channelCount,
    ]
    if let bitRate { settings[AVEncoderBitRateKey] = bitRate }
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 32768) else {
      throw Exception(name: "EncodeFailed", description: "Couldn't allocate an audio buffer.")
    }
    // The file type comes from the extension (.m4a); the file is finished when `output` goes away.
    let output = try AVAudioFile(
      forWriting: url, settings: settings, commonFormat: format.commonFormat,
      interleaved: format.isInterleaved)
    while input.framePosition < input.length {
      try input.read(into: buffer)
      if buffer.frameLength == 0 { break }
      try output.write(from: buffer)
    }
  }
}
