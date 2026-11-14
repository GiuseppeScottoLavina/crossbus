Pod::Spec.new do |spec|
  spec.name = 'CrossBusNative'
  spec.version = '0.1.5'
  spec.summary = 'Origin-restricted WKWebView transport for CrossBus.'
  spec.homepage = 'https://github.com/GiuseppeScottoLavina/crossbus'
  spec.license = { :type => 'Apache-2.0', :file => 'LICENSE' }
  spec.author = { 'Giuseppe Scotto Lavina' => 'giuseppe.sc8.lavina@gmail.com' }
  spec.source = { :git => 'https://github.com/GiuseppeScottoLavina/crossbus.git', :tag => "v#{spec.version}" }
  spec.ios.deployment_target = '15.0'
  spec.osx.deployment_target = '12.0'
  spec.swift_version = '5.0'
  spec.source_files = 'native/ios/CrossBusBridge.swift'
  spec.frameworks = 'Foundation', 'WebKit'
end
