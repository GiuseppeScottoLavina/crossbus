"""Build an isolated host and verify real native bridge RPC. Never erases device data."""
import argparse, pathlib, subprocess, tempfile, shutil, os, json, hashlib, uuid, time, plistlib, ssl, datetime, glob, re

root=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('platform',choices=['android','ios'])
parser.add_argument('--device',help='ADB serial or iOS hardware UDID for the dedicated host only')
parser.add_argument('--simulator',help='Existing iOS test simulator UDID')
parser.add_argument('--team',help='Optional Apple development team; otherwise retain the generated project setting')
parser.add_argument('--host',help='Mac address reachable from the physical iPad')
parser.add_argument('--published-bridge',action='store_true',help='Consume the locally staged Maven AAR instead of the Gradle source module')
parser.add_argument('--output',default='artifacts/native-qualification.json')
args=parser.parse_args()
output=root/args.output
if output.exists():parser.error('Receipt already exists; choose a fresh --output path to preserve prior evidence')
if not args.device and not args.simulator:parser.error('Specify --device or --simulator')
if args.platform=='android' and args.simulator:parser.error('Use --device for the Android serial, including emulators')
os.chdir(root)
run_id=str(uuid.uuid4());started=datetime.datetime.now(datetime.timezone.utc).isoformat()
artifacts=root/'artifacts';artifacts.mkdir(exist_ok=True)
library=(root/'dist/crossbus.min.js').read_bytes()
version=json.loads((root/'package.json').read_text())['version']
assert re.search(rb'CrossBus v([\d.]+)',library).group(1).decode()==version,'Build dist before qualification'
def execute(command,log=None,env=None):
 if log:
  with open(artifacts/log,'w') as output:subprocess.run(command,check=True,stdout=output,stderr=subprocess.STDOUT,env=env)
 else:return subprocess.check_output(command,text=True,env=env).strip()
def digest(data):return hashlib.sha256(data).hexdigest()
def validate(report):
 assert report.get('runId')==run_id,'Stale test report'
 assert report.get('passed') is True,report
 assert report['protectedCalls']==0 and report['echoCalls']==2 and report['nativeReplies']==2,report
 assert report['nativeReplyValid'] is True and report['deniedSendBlocked'] is True and report['closedSendBlocked'] is True
 phases=report['phases'];assert [p['phase'] for p in phases]==['first','denied','complete']
 assert phases[0]['checks']==['native echo preserves scalar and Unicode','native handler error propagates','native-initiated RPC returns through actual bridge','malformed/oversized/subframe messages never run protected handler']
 assert phases[2]['checks']==['native echo preserves scalar and Unicode','native handler error propagates','native-initiated RPC returns through actual bridge','wrong-origin navigation never runs protected handler','RPC reinitializes after allowed navigation','destroy cancels pending RPC','destroy removes JavaScript receive callback']
def poll(read):
 for attempt in range(45):
  try:
   report=read()
   if report.get('runId')==run_id:return report
  except (OSError,subprocess.CalledProcessError,json.JSONDecodeError):pass
  time.sleep(1)
 raise RuntimeError('Fresh report missing after 45 seconds; inspect host/permission prompts. Existing apps/data were not erased.')

files=['dist/crossbus.min.js','package-lock.json','tests/native/qualify.py','tests/native/fixtures/qualification.js','tests/native/fixtures/qualification.html','tests/native/fixtures/frame.html','tests/native/fixtures/denied.html']
if args.platform=='android':
 import zipfile
 sdk=pathlib.Path(os.environ.get('ANDROID_HOME',pathlib.Path.home()/'Library/Android/sdk'))
 adb=str(sdk/'platform-tools/adb');prefix=[adb,'-s',args.device]
 gradle=root/'native/android/gradlew'
 env=dict(os.environ,ANDROID_HOME=str(sdk))
 bundled=pathlib.Path('/Applications/Android Studio.app/Contents/jbr/Contents/Home')
 if bundled.exists():env['JAVA_HOME']=str(bundled)
 command=[str(gradle),'-p','tests/native/android-host','--no-daemon','--project-cache-dir',str(artifacts/'gradle-host-cache'),':app:assembleDebug']
 if args.published_bridge:command.append('-PusePublishedBridge=true')
 execute(command,'android-host-build.log',env)
 apk=root/'tests/native/android-host/app/build/outputs/apk/debug/app-debug.apk'
 with zipfile.ZipFile(apk) as archive:
  assert archive.read('assets/crossbus.min.js')==library,'APK contains a different library build'
  for name in ['qualification.js','qualification.html','frame.html','denied.html']:
   assert archive.read('assets/'+name)==(root/'tests/native/fixtures'/name).read_bytes(),'APK contains stale fixtures'
 execute(prefix+['install','-r','-t',str(apk)],'android-host-install.log')
 execute(prefix+['shell','input','keyevent','KEYCODE_WAKEUP'])
 execute(prefix+['shell','am','force-stop','io.crossbus.qualification'])
 execute(prefix+['shell','am','start','-S','-W','-f','0x10008000','-n','io.crossbus.qualification/.MainActivity','--es','runId',run_id],'android-host-launch.log')
 def read():return json.loads(execute(prefix+['shell','run-as','io.crossbus.qualification','cat','files/result.json']))
 report=poll(read)
 files+=['native/android/CrossBusBridge.java','native/android/build.gradle','native/android/settings.gradle','tests/native/android-host/app/src/main/java/io/crossbus/qualification/MainActivity.java','tests/native/android-host/app/build.gradle']
 extra={'testApkSha256':digest(apk.read_bytes()),'consumedMavenAar':args.published_bridge}
else:
 project=root/'tests/native/ios-host/CrossBusQualification.xcodeproj'
 if not project.exists():execute(['xcodegen','generate','--spec','tests/native/ios-host/project.yml'],'ios-host-generate.log')
 info_path=root/'tests/native/ios-host/Info.plist';info=plistlib.loads(info_path.read_bytes())
 info.update({'CrossBusRunID':'$(CROSSBUS_RUN_ID)','NSLocalNetworkUsageDescription':'Connect to the temporary CrossBus fixture server on this Mac for bridge qualification.','NSAppTransportSecurity':{'NSAllowsLocalNetworking':True}})
 info_path.write_bytes(plistlib.dumps(info))
 server=None
 with tempfile.TemporaryDirectory(prefix='crossbus-native-cert-',dir=artifacts) as temporary:
  temporary=pathlib.Path(temporary);cert=temporary/'cert.pem';key=temporary/'key.pem'
  execute(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=CrossBus Test Fixture','-addext','subjectAltName=IP:127.0.0.1'],'ios-fixture-certificate.log')
  log=open(artifacts/'ios-fixture-server.log','w')
  try:
   server=subprocess.Popen(['python3','tests/native/fixture-server.py','--cert',str(cert),'--key',str(key),'--port','0','--denied-port','0'],stdout=subprocess.PIPE,stderr=log,text=True)
   configuration=json.loads(server.stdout.readline());ports=configuration['ports']
   host='127.0.0.1' if args.simulator else args.host or execute(['ipconfig','getifaddr','en0'])
   sdk='iphonesimulator' if args.simulator else 'iphoneos'
   derived=artifacts/('ios-derived' if args.simulator else 'ios-physical-derived')
   command=['xcodebuild','-project',str(project),'-scheme','CrossBusQualification','-configuration','Debug','-sdk',sdk,'-destination','id='+(args.simulator or args.device),'-derivedDataPath',str(derived),
    'CROSSBUS_TEST_ORIGIN=https://'+host+':'+str(ports[0]),'CROSSBUS_DENIED_ORIGIN=https://'+host+':'+str(ports[1]),'CROSSBUS_CERT_SHA256='+configuration['certificateSha256'],'CROSSBUS_RUN_ID='+run_id]
   if args.simulator:command+=['CODE_SIGNING_ALLOWED=NO']
   else:
    command+=['-allowProvisioningUpdates']
    if args.team:command+=['DEVELOPMENT_TEAM='+args.team]
   execute(command+['build'],'ios-host-build.log')
   app=derived/'Build/Products'/('Debug-'+sdk)/'CrossBusQualification.app'
   if args.simulator:
    execute(['codesign','--force','--deep','--sign','-',str(app)],'ios-simulator-sign.log')
    execute(['xcrun','simctl','install',args.simulator,str(app)])
    subprocess.run(['xcrun','simctl','terminate',args.simulator,'io.crossbus.qualification'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    execute(['xcrun','simctl','launch',args.simulator,'io.crossbus.qualification'])
    container=pathlib.Path(execute(['xcrun','simctl','get_app_container',args.simulator,'io.crossbus.qualification','data']))
    def read():return json.loads((container/'Documents/result.json').read_text())
   else:
    execute(['xcrun','devicectl','device','install','app','--device',args.device,str(app)],'ios-host-install.log')
    execute(['xcrun','devicectl','device','process','launch','--device',args.device,'--terminate-existing','io.crossbus.qualification'],'ios-host-launch.log')
    def read():
     target=artifacts/'ios-device-report.json'
     execute(['xcrun','devicectl','device','copy','from','--device',args.device,'--domain-type','appDataContainer','--domain-identifier','io.crossbus.qualification','--source','Documents/result.json','--destination',str(target)],'ios-host-report-copy.log')
     return json.loads(target.read_text())
   report=poll(read)
   binaries=[app/'CrossBusQualification',*app.glob('*.dylib')]
   extra={'signedHostMachOHashes':{p.name:digest(p.read_bytes()) for p in binaries},'fixtureCertificateSha256':configuration['certificateSha256']}
  finally:
   if server:server.terminate();server.wait(timeout=10)
   log.close()
 files+=['native/ios/CrossBusBridge.swift','Package.swift','CrossBusNative.podspec','tests/native/ios-host/Main.swift','tests/native/ios-host/project.yml','tests/native/fixture-server.py']

raw_path=artifacts/('raw-native-'+args.platform+'-'+run_id+'.json');raw_path.write_text(json.dumps(report,indent=2)+'\n')
validate(report);assert (root/'dist/crossbus.min.js').read_bytes()==library,'Library changed during qualification'
# Public receipts omit local IP addresses and device/account identifiers.
for phase in report['phases']:
 if 'origin' in phase:phase['origin']='<denied fixture origin>'
receipt={'timestamp':started,'platform':args.platform,'physicalDevice':not bool(args.simulator),'scope':'Focused native bridge runtime qualification; 11 JavaScript assertions plus native invocation/guard checks. Not a throughput benchmark.',
 'libraryVersion':json.loads((root/'package.json').read_text())['version'],'hashes':{f:digest((root/f).read_bytes()) for f in files},'redactedFields':['phases[].origin'],**extra,'report':report}
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(receipt,indent=2)+'\n')
print(args.platform,'native bridge passed, run',run_id,'->',args.output)
