import http.server, os, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

http.server.HTTPServer(('', 8765), Handler).serve_forever()
