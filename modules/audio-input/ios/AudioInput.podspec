# Local Expo module (autolinked from ./modules).
Pod::Spec.new do |s|
  s.name           = 'AudioInput'
  s.version        = '1.0.0'
  s.summary        = 'Input channels and gain, channel extraction and the output route picker.'
  s.description    = s.summary
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Audio Recorder'
  s.homepage       = 'https://docs.expo.dev/modules/overview/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
