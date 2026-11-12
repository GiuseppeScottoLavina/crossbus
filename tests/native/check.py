"""Compile host adapters against installed SDKs. Does not run a WebView."""
import argparse
import glob
import os
import pathlib
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--android-jar')
parser.add_argument('--webkit-jar')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='crossbus-native-') as temporary:
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
    subprocess.run(['xcrun', 'swiftc', '-typecheck', '-sdk', sdk,
        '-target', 'arm64-apple-ios15.0-simulator', '-module-cache-path', temporary + '/swift-cache',
        str(root / 'native/ios/CrossBusBridge.swift')], check=True)
    android = args.android_jar or str(pathlib.Path.home() / 'Library/Android/sdk/platforms/android-35/android.jar')
    cached = sorted(glob.glob(str(pathlib.Path.home() / '.gradle/caches/**/webkit-*-runtime.jar'), recursive=True))
    webkit = args.webkit_jar or (cached[-1] if cached else None)
    if not webkit:
        raise SystemExit('Specify --webkit-jar pointing to AndroidX WebKit classes.jar')
    annotations = glob.glob(str(pathlib.Path.home() / '.gradle/caches/modules-2/files-2.1/androidx.annotation/annotation-jvm/**/*.jar'), recursive=True)
    kotlin = glob.glob(str(pathlib.Path.home() / '.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib/**/*.jar'), recursive=True)
    classpath = os.pathsep.join([android, webkit] + annotations + kotlin)
    subprocess.run(['javac', '-d', temporary + '/java', '-classpath', classpath,
        str(root / 'native/android/CrossBusBridge.java')], check=True)
print('Swift iOS and Java Android adapter compilation passed; runtime/device tests remain separate.')
