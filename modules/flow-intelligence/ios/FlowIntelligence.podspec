Pod::Spec.new do |s|
  s.name           = 'FlowIntelligence'
  s.version        = '1.0.0'
  s.summary        = 'On-device transcription and thought shaping for Flowthread'
  s.description    = 'Speech (SpeechAnalyzer / SFSpeechRecognizer on-device) and Apple Foundation Models.'
  s.author         = 'Kodavena'
  s.homepage       = 'https://kodavena.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,swift}'
  s.weak_frameworks = 'FoundationModels'
end
