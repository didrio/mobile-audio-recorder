# Local Expo module (autolinked from ./modules). The podspec sits at the module root so it can compile
# the shared C core in cpp/ next to the Swift wrapper in ios/.
Pod::Spec.new do |s|
  s.name           = 'EchoCanceller'
  s.version        = '1.0.0'
  s.summary        = 'Removes the known backing from takes recorded from the speaker.'
  s.description    = s.summary
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Audio Recorder'
  s.homepage       = 'https://docs.expo.dev/modules/overview/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.swift', 'cpp/echo_cancel.{h,c}', 'cpp/dr_wav.h'
  s.public_header_files = 'cpp/echo_cancel.h'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # Optimized in every configuration: cleaning a take is number crunching, and development builds
    # would otherwise run it unoptimized.
    'GCC_OPTIMIZATION_LEVEL' => '3'
  }
end
