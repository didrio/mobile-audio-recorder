import AVFoundation
import AVKit
import ExpoModulesCore

/// Input and output details the audio library doesn't expose (T38): how many channels the current
/// input has, its gain, pulling one channel out of a multi-channel take, and the system's output
/// route button. Only paths and small values cross the bridge; audio stays native.
public class AudioInputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioInput")

    /// The current input's channel count and gain. Asks for all of the input's channels first, so a
    /// two-input interface reports (and records) both.
    AsyncFunction("getInputInfo") { (_: String?) -> [String: Any] in
      let session = AVAudioSession.sharedInstance()
      let maximum = session.maximumInputNumberOfChannels
      if maximum > session.inputNumberOfChannels {
        try? session.setPreferredInputNumberOfChannels(maximum)
      }
      return [
        "channelCount": max(1, session.inputNumberOfChannels),
        "gainSettable": session.isInputGainSettable,
        "gain": session.inputGain,
      ]
    }

    /// Sets the current input's gain (0…1) when the hardware allows it; false otherwise.
    AsyncFunction("setInputGain") { (gain: Double) -> Bool in
      let session = AVAudioSession.sharedInstance()
      guard session.isInputGainSettable else { return false }
      try session.setInputGain(Float(min(1, max(0, gain))))
      return true
    }

    /// Writes channel `channel` (0-based) of the WAV at `sourcePath` as a mono WAV at `outputPath`,
    /// with the same sample rate and sample format.
    AsyncFunction("extractChannel") { (sourcePath: String, outputPath: String, channel: Int) throws in
      try Self.extract(sourcePath: sourcePath, outputPath: outputPath, channel: channel)
    }

    /// `AVRoutePickerView`: the system's output route button (speaker, AirPods, AirPlay…).
    View(RoutePickerView.self) {
      Prop("tintColor") { (view: RoutePickerView, color: UIColor?) in
        view.picker.tintColor = color
      }
      Prop("activeTintColor") { (view: RoutePickerView, color: UIColor?) in
        view.picker.activeTintColor = color
      }
    }
  }

  private static func extract(sourcePath: String, outputPath: String, channel: Int) throws {
    let input = try AVAudioFile(forReading: URL(fileURLWithPath: sourcePath))
    let format = input.processingFormat
    guard channel >= 0, channel < Int(format.channelCount) else {
      throw Exception(
        name: "NoSuchChannel",
        description: "The take has \(format.channelCount) channels, not \(channel + 1).")
    }
    guard
      let monoFormat = AVAudioFormat(
        commonFormat: format.commonFormat, sampleRate: format.sampleRate, channels: 1,
        interleaved: false),
      let source = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 32768),
      let target = AVAudioPCMBuffer(pcmFormat: monoFormat, frameCapacity: 32768),
      let sourceData = source.floatChannelData, let targetData = target.floatChannelData
    else {
      throw Exception(name: "ExtractFailed", description: "Couldn't allocate audio buffers.")
    }
    var settings = input.fileFormat.settings
    settings[AVNumberOfChannelsKey] = 1
    settings.removeValue(forKey: AVChannelLayoutKey)
    let outputURL = URL(fileURLWithPath: outputPath)
    try? FileManager.default.removeItem(at: outputURL)
    // The file type comes from the extension (.wav); the file is finished when `output` goes away.
    let output = try AVAudioFile(
      forWriting: outputURL, settings: settings, commonFormat: monoFormat.commonFormat,
      interleaved: false)
    while input.framePosition < input.length {
      try input.read(into: source)
      let frames = source.frameLength
      if frames == 0 { break }
      targetData[0].update(from: sourceData[channel], count: Int(frames))
      target.frameLength = frames
      try output.write(from: target)
    }
  }
}

public class RoutePickerView: ExpoView {
  let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.prioritizesVideoDevices = false
    addSubview(picker)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
