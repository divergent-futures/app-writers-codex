"""build-dictionary.py — turn Open English WordNet into the Codex's writer's dictionary.

WHY THIS EXISTS
TJ's reason for wanting a dictionary (2026-09-09): "it's more to slowly teach me more grammar and
increase my vocabulary." So this keeps the USAGE EXAMPLES, which are the part that teaches, and it
keeps the WHOLE vocabulary rather than a common-words cut, because the rare words are the vocabulary
you would be gaining. The decision and the measurements behind it:
`_brain\\writers-codex\\docs\\DICTIONARY-DECISION-2026-09-09.md`.

WHAT IT PRODUCES
  src/lib/sample/dictionary/index.json   the manifest: counts, licence, attribution, shard list
  src/lib/sample/dictionary/en-<a..z>.json   one file per first letter

Each headword maps to a list of senses:
  p  part of speech (n | v | adj | adv)
  d  definition
  s  synonyms                b  broader words           n  narrower words
  x  usage examples — a string, or {t: text, q: quoted source} for the ~1,100 attributed ones

WHY SHARDED BY LETTER
A dictionary is a LOOKUP TABLE, not a reference pack: it must never be loaded whole into memory
(25 MB of JSON becomes ~80 MB of live objects and kills a tab on an older phone). Per-letter files
also stay well under the CDN's per-file limit, which is documented at 50 MB and observed rejecting
at 20 MB.

SOURCE AND LICENCE
Open English WordNet 2025, CC BY 4.0 — https://en-word.net/. Attribution travels in index.json and
must be shown wherever the dictionary is. The source YAML is read from the project's GitHub repo
because en-word.net is not reachable from every network here.

HOW TO RUN (PowerShell, from C:\\Projects\\writers-codex)
  python .\\scripts\\build-dictionary.py            # download if needed, then build
  python .\\scripts\\build-dictionary.py --fetch    # download only
  python .\\scripts\\build-dictionary.py --build    # build only, from what is already downloaded
Downloads land outside the project (%USERPROFILE%\\.wc-dict-build) so nothing temporary is ever
written into a folder TJ looks at.
"""
import json, os, sys, glob, urllib.request, datetime, concurrent.futures as cf

RAW  = "https://raw.githubusercontent.com/globalwordnet/english-wordnet/main/src/yaml"
WORK = os.path.join(os.path.expanduser("~"), ".wc-dict-build")
OUT  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "lib", "sample", "dictionary")
LEXNAMES = """adj.all adj.pert adj.ppl adv.all noun.Tops noun.act noun.animal noun.artifact
noun.attribute noun.body noun.cognition noun.communication noun.event noun.feeling noun.food
noun.group noun.location noun.motive noun.object noun.person noun.phenomenon noun.plant
noun.possession noun.process noun.quantity noun.relation noun.shape noun.state noun.substance
noun.time verb.body verb.change verb.cognition verb.communication verb.competition verb.consumption
verb.contact verb.creation verb.emotion verb.motion verb.perception verb.possession verb.social
verb.stative verb.weather""".split()
FILES = [f"entries-{c}.yaml" for c in "abcdefghijklmnopqrstuvwxyz"] + [f"{n}.yaml" for n in LEXNAMES]
POS   = {"n": "n", "v": "v", "a": "adj", "s": "adj", "r": "adv"}


def fetch():
    os.makedirs(WORK, exist_ok=True)
    todo = [f for f in FILES if not os.path.exists(os.path.join(WORK, f))]
    if not todo:
        print(f"all {len(FILES)} source files already downloaded"); return
    print(f"downloading {len(todo)} of {len(FILES)} source files to {WORK} ...")
    def one(name):
        urllib.request.urlretrieve(f"{RAW}/{name}", os.path.join(WORK, name)); return name
    with cf.ThreadPoolExecutor(8) as ex:
        for i, name in enumerate(ex.map(one, todo), 1):
            if i % 10 == 0 or i == len(todo): print(f"  {i}/{len(todo)}", flush=True)
    print("download complete")


def build():
    import yaml
    Loader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)   # the C loader is ~20x faster
    missing = [f for f in FILES if not os.path.exists(os.path.join(WORK, f))]
    if missing:
        sys.exit(f"{len(missing)} source files missing (e.g. {missing[0]}). Run with --fetch first.")

    syn = {}
    for name in FILES:
        if name.startswith("entries-"): continue
        with open(os.path.join(WORK, name), encoding="utf-8") as fh:
            for sid, s in yaml.load(fh, Loader=Loader).items():
                syn[sid] = {"d": (s.get("definition") or [""])[0],
                            "m": s.get("members") or [],
                            "h": s.get("hypernym") or [],
                            "x": s.get("example") or []}
    entries = {}
    for name in FILES:
        if not name.startswith("entries-"): continue
        with open(os.path.join(WORK, name), encoding="utf-8") as fh:
            for lemma, poses in yaml.load(fh, Loader=Loader).items():
                for pos, body in poses.items():
                    for sense in (body.get("sense") or []):
                        entries.setdefault(lemma, []).append((pos, sense.get("synset")))
    print(f"parsed {len(syn):,} meanings and {len(entries):,} headwords", flush=True)

    narrower = {}
    for sid, s in syn.items():
        for h in s["h"]: narrower.setdefault(h, []).append(sid)

    def others(sid, skip=None):
        return [m for m in syn.get(sid, {}).get("m", []) if m != skip]

    out = {}
    for lemma, senses in entries.items():
        rec = []
        for pos, sid in senses:
            s = syn.get(sid)
            if not s: continue
            e = {"p": POS.get(pos, pos), "d": s["d"]}
            syns = others(sid, lemma)
            if syns: e["s"] = syns[:12]
            broad = []
            for h in s["h"][:3]: broad += others(h)[:3]
            if broad: e["b"] = broad[:6]
            narrow = []
            for n in narrower.get(sid, [])[:6]: narrow += others(n)[:2]
            if narrow: e["n"] = narrow[:8]
            ex = []
            for x in s["x"][:3]:
                if isinstance(x, str):
                    if x: ex.append(x)
                elif x.get("text"):
                    ex.append({"t": x["text"], "q": x["source"]} if x.get("source") else x["text"])
            if ex: e["x"] = ex
            rec.append(e)
        if rec: out[lemma] = rec

    shards = {}
    for word, rec in out.items():
        c = word[0].lower()
        shards.setdefault(c if "a" <= c <= "z" else "0", {})[word] = rec

    os.makedirs(OUT, exist_ok=True)
    total, meta = 0, []
    for c, obj in sorted(shards.items()):
        blob = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with open(os.path.join(OUT, f"en-{c}.json"), "wb") as fh: fh.write(blob)
        total += len(blob)
        meta.append({"shard": c, "file": f"en-{c}.json", "words": len(obj), "bytes": len(blob)})

    with_example = sum(1 for rec in out.values() if any("x" in s for s in rec))
    index = {
        "language": "en", "label": "English",
        "source": "Open English WordNet 2025", "licence": "CC BY 4.0",
        "attribution": "Open English WordNet (https://en-word.net/), CC BY 4.0",
        "definitionsIn": "en",          # other languages will say "en" here too — see the decision doc
        "built": str(datetime.date.today()),
        "headwords": len(out), "headwordsWithExample": with_example,
        "totalBytes": total, "shards": meta,
        "fields": {"p": "part of speech", "d": "definition", "s": "synonyms",
                   "b": "broader words", "n": "narrower words", "x": "usage examples"},
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1)

    print(f"{len(out):,} headwords · {with_example:,} carry a usage example "
          f"· {total/1e6:.1f} MB across {len(meta)} files")
    print("written to", os.path.normpath(OUT))


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--build" not in args: fetch()
    if "--fetch" not in args: build()
