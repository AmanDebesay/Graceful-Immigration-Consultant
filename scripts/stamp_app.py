"""Version-stamps the Practice Hub's files so browsers load the new code after each update.

GitHub Pages lets browsers keep files for 10 minutes, and modules the dashboard loads later
(views, fin.js, ...) can be kept even after a hard refresh. This writes an import map into
app/index.html that adds ?v=<content hash> to every script, so a changed file gets a new address.

Run before committing changes to app/:   python scripts/stamp_app.py
"""
import hashlib, io, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "app"
INDEX = APP / "index.html"

def tag(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]

scripts = sorted(p for p in (APP / "js").rglob("*.js"))
imports = {f"/app/{p.relative_to(APP).as_posix()}": f"/app/{p.relative_to(APP).as_posix()}?v={tag(p)}" for p in scripts}
block = ('<script type="importmap" id="versions">\n'
         + json.dumps({"imports": imports}, indent=2)
         + "\n</script>")

html = io.open(INDEX, encoding="utf-8").read()
html = re.sub(r'\s*<script type="importmap" id="versions">.*?</script>', "", html, flags=re.S)
html = re.sub(r'href="css/app\.css(\?v=\w+)?"', f'href="css/app.css?v={tag(APP / "css" / "app.css")}"', html)
html = re.sub(r'<script type="module" src="(/app/)?js/main\.js(\?v=\w+)?"></script>',
              f'{block}\n  <script type="module" src="/app/js/main.js?v={tag(APP / "js" / "main.js")}"></script>', html)
io.open(INDEX, "w", encoding="utf-8", newline="").write(html)
print(f"stamped {len(scripts)} scripts")
