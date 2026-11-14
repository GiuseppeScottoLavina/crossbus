"""Verify the locally staged Maven SDK, including source and license contents."""
import argparse,pathlib,xml.etree.ElementTree as ET,zipfile,io,hashlib,json
parser=argparse.ArgumentParser();parser.add_argument('directory');args=parser.parse_args()
directory=pathlib.Path(args.directory);root=pathlib.Path(__file__).resolve().parents[2]
metadata=ET.parse(directory/'maven-metadata.xml')
versions=metadata.findall('./versioning/snapshotVersions/snapshotVersion')
def artifact(extension,classifier=None):
 item=next(v for v in versions if v.findtext('extension')==extension and v.findtext('classifier')==classifier)
 return directory/('crossbus-native-'+item.findtext('value')+('-'+classifier if classifier else '')+'.'+extension)
aar=artifact('aar');sources=artifact('jar','sources');pom=artifact('pom')
with zipfile.ZipFile(aar) as archive:
 with zipfile.ZipFile(io.BytesIO(archive.read('classes.jar'))) as classes:
  assert 'io/crossbus/CrossBusBridge.class' in classes.namelist()
  assert classes.read('META-INF/crossbus/LICENSE')==(root/'LICENSE').read_bytes()
with zipfile.ZipFile(sources) as archive:
 assert archive.read('io/crossbus/CrossBusBridge.java')==(root/'native/android/CrossBusBridge.java').read_bytes()
namespace={'m':'http://maven.apache.org/POM/4.0.0'};document=ET.parse(pom)
assert document.findtext('m:groupId',namespaces=namespace)=='io.github.giuseppescottolavina'
assert document.findtext('m:artifactId',namespaces=namespace)=='crossbus-native'
assert document.findtext('m:packaging',namespaces=namespace)=='aar'
deps=document.findall('./m:dependencies/m:dependency',namespace)
assert any(d.findtext('m:groupId',namespaces=namespace)=='androidx.webkit' and d.findtext('m:version',namespaces=namespace)=='1.14.0' for d in deps)
print(json.dumps({'aar':aar.name,'sources':sources.name,'class':True,'license':True,'sourceMatches':True,
 'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [aar,sources,pom]}}))
