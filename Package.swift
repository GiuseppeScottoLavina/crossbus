// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CrossBusNative",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "CrossBusNative", targets: ["CrossBusNative"])],
    targets: [.target(name: "CrossBusNative", path: "native/ios", sources: ["CrossBusBridge.swift"])]
)
