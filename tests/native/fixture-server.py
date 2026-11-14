"""HTTPS fixtures for an isolated WebView host; certificate trust is pinned there."""
import argparse, pathlib, http.server, ssl, threading, hashlib, json
parser=argparse.ArgumentParser()
parser.add_argument('--cert',required=True);parser.add_argument('--key',required=True)
parser.add_argument('--port',type=int,default=4784);parser.add_argument('--denied-port',type=int,default=4785)
args=parser.parse_args();root=pathlib.Path(__file__).resolve().parents[2]
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  relative=self.path.split('?',1)[0].removeprefix('/assets/')
  path=root/'dist/crossbus.min.js' if relative=='crossbus.min.js' else root/'tests/native/fixtures'/relative
  try:
   if path.resolve().parent not in [(root/'dist').resolve(),(root/'tests/native/fixtures').resolve()]:raise ValueError('Invalid path')
   data=path.read_bytes();self.send_response(200);self.send_header('Cache-Control','no-store');self.send_header('Content-Type','text/javascript' if path.suffix=='.js' else 'text/html');self.end_headers();self.wfile.write(data)
  except (OSError,ValueError):self.send_error(404)
context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(args.cert,args.key)
servers=[]
for port in [args.port,args.denied_port]:
 server=http.server.ThreadingHTTPServer(('0.0.0.0',port),Handler);server.socket=context.wrap_socket(server.socket,server_side=True);servers.append(server)
 threading.Thread(target=server.serve_forever,daemon=True).start()
print(json.dumps({'ports':[server.server_address[1] for server in servers],'certificateSha256':hashlib.sha256(ssl.PEM_cert_to_DER_cert(pathlib.Path(args.cert).read_text())).hexdigest()}),flush=True)
threading.Event().wait()
