"""
Give every photograph on the site a file name that says what it shows, who it's for, the
service, s4digital and its size, e.g.

  bjj-coach-white-team-t-shirt-london-fight-factory-photography-s4digital-1200x1600.jpg

A name travels with the file when someone saves or reposts it, so it credits the work even
off the site. Alt text stays the main ranking signal; the name backs it up.

  python tools/rename_images.py            dry run, writes .tmp/image_renames.csv
  python tools/rename_images.py --apply    renames (git mv), rewrites every reference and
                                           adds a 301 from each old path in vercel.json

Left alone: logos and brand marks, client logos, email signature images (already sent in
mail), free-tool icons, Pre-Sold, anything no page uses, and a client's own material
(a case study's thirdParty list).
"""
import csv
import glob
import json
import os
import re
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
APPLY = "--apply" in sys.argv

SKIP_DIRS = ("assets/signatures", "assets/presold", "assets/clients", "assets/free-tools", "brand_logos")
SKIP_NAMES = re.compile(r"logo|favicon|og-card|^ast-|icon", re.I)
TEXT_EXT = re.compile(r"\.(html|js|mjs|css|json|md|xml|py|txt)$")
NOT_SCANNED = ("node_modules", ".tmp", "_backup", ".git")
STOP = set("a an the of in on with and at to his her their its is are from by for into onto as"
           " while who that this one two up out over under about after before during it they he she"
           " be being was were has have our your".split())

# ---------------------------------------------------------------- what the site references
texts = {}
for p in glob.glob("**/*", recursive=True):
    q = p.replace(os.sep, "/")
    if os.path.isfile(p) and TEXT_EXT.search(q) and not any(s in q.split("/") for s in NOT_SCANNED):
        texts[q] = open(p, encoding="utf-8", errors="ignore").read()


def norm(src):
    src = re.sub(r"^https?://(www\.)?s4digi\.com", "", src or "")
    return src.split("?")[0].split("#")[0].lstrip("/")


alt, ctx = {}, {}   # image path -> alt text, -> (client, service)
work = json.load(open("content/work.json", encoding="utf-8"))["items"]


def service_for(w, role):
    cats = " ".join(w.get("categories") or []).lower()
    if "web" in cats and not re.search(r"film|video|photo", cats):
        return "web-design"
    if role in ("gallery", "photos") and "photo" in cats:
        return "photography"
    return "video-production"


def slug(s):
    s = re.sub(r"['’]", "", (s or "").lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


third = set()
for w in work:
    client = slug(w.get("client") or w.get("title"))
    third.update(norm(t) for t in w.get("thirdParty") or [])
    groups = [("cover", [w.get("cover")]), ("gallery", w.get("gallery")),
              ("photos", (w.get("photos") or {}).get("items")), ("thumbs", (w.get("thumbs") or {}).get("items")),
              ("videos", [{"src": v.get("poster"), "alt": v.get("title")} for v in w.get("videos") or []])]
    for role, items in groups:
        for it in items or []:
            if not it:
                continue
            for key in ("src", "full", "poster"):
                if it.get(key):
                    p = norm(it[key])
                    alt.setdefault(p, it.get("alt"))
                    ctx.setdefault(p, (client, service_for(w, role)))

for f in ("assets/blog/stills/catalog.json", "assets/blog/photos-catalog.json"):
    for it in json.load(open(f, encoding="utf-8")):
        p = norm(it["path"])
        alt.setdefault(p, it.get("alt"))
        if it.get("film"):
            ctx.setdefault(p, (slug(it["film"]), "video-production"))

for it in json.load(open("content/posts.json", encoding="utf-8"))["items"]:
    if it.get("cover"):
        alt.setdefault(norm(it["cover"]), it.get("coverAlt"))

for q, s in texts.items():
    for t in re.findall(r"<img\b[^>]*>", s.replace('\\"', '"')):
        m, a = re.search(r'\ssrc="([^"]+)"', t), re.search(r'\salt="([^"]*)"', t)
        if m and a and a.group(1).strip():
            alt.setdefault(norm(m.group(1)), a.group(1))
    for m in re.finditer(r'img="([^"]+)",\s*alt="([^"]+)"', s):   # tools/location_data.py
        alt.setdefault(norm(m.group(1)), m.group(2))

# ---------------------------------------------------------------- the new names
def what(a, client):
    drop = set(client.split("-")) | STOP | {"s4digital"}
    words = [x for x in slug(a).split("-") if x and x not in drop]
    return "-".join(words[:6])


def service_default(p):
    if p.startswith("assets/web/"):
        return "web-design"
    if p.startswith("assets/earl/onset/"):
        return "behind-the-scenes-video-production"
    if p.startswith("assets/earl/"):
        return "filmmaker-earl-duncan"
    return "video-production"


rows, taken = [], set()
images = [p.replace(os.sep, "/") for p in glob.glob("assets/**/*", recursive=True)
          if re.search(r"\.(jpe?g|png|webp|gif|avif)$", p, re.I)]
for p in sorted(images):
    d, base = os.path.split(p)
    if p.startswith(SKIP_DIRS) or SKIP_NAMES.search(base) or p in third:
        continue
    if not any(base in s for s in texts.values()):
        continue   # not on the site
    client, service = ctx.get(p, ("", service_default(p)))
    a = alt.get(p)
    w_ = what(a, client) if a else slug(os.path.splitext(base)[0])
    try:
        W, H = Image.open(p).size
    except Exception:
        continue
    ext = os.path.splitext(base)[1].lower().replace(".jpeg", ".jpg")
    stem = "-".join(x for x in (w_, client, service, "s4digital", f"{W}x{H}") if x)
    stem = re.sub(r"-+", "-", stem)
    new, n = f"{d}/{stem}{ext}", 2
    while new in taken or (os.path.exists(new) and new != p):
        new, n = f"{d}/{stem}-{n}{ext}", n + 1
    taken.add(new)
    if new != p:
        rows.append((p, new, "" if a else "NO ALT"))

os.makedirs(".tmp", exist_ok=True)
with open(".tmp/image_renames.csv", "w", newline="", encoding="utf-8") as fh:
    csv.writer(fh).writerows([("old", "new", "flag")] + rows)
print(len(rows), "renames,", sum(1 for r in rows if r[2]), "without alt -> .tmp/image_renames.csv")
if not APPLY:
    sys.exit()

# ---------------------------------------------------------------- apply
for old, new, _ in rows:
    r = subprocess.run(["git", "mv", old, new], capture_output=True, text=True)
    if r.returncode:
        os.replace(old, new)
pairs = sorted(((o, n) for o, n, _ in rows), key=lambda x: -len(x[0]))
# Replace by full path first, then by "dir/basename" for relative references.
for q, s in texts.items():
    t = s
    for o, n in pairs:
        if o in t:
            t = t.replace(o, n)
        ob, nb = o.split("/", 1)[1], n.split("/", 1)[1]   # without "assets/"
        if ob in t:
            t = t.replace(ob, nb)
    if t != s:
        nl = "\r\n" if "\r\n" in s else "\n"
        open(q, "w", encoding="utf-8", newline="").write(t if nl == "\n" else t.replace("\r\n", "\n").replace("\n", "\r\n"))

v = json.load(open("vercel.json", encoding="utf-8"))
have = {r["source"] for r in v.get("redirects", [])}
v.setdefault("redirects", []).extend({"source": "/" + o, "destination": "/" + n, "permanent": True}
                                     for o, n in pairs if "/" + o not in have)
open("vercel.json", "w", encoding="utf-8", newline="\n").write(json.dumps(v, indent=2) + "\n")
print("applied; vercel.json redirects:", len(v["redirects"]))
