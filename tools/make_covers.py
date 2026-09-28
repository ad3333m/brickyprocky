"""Resize game covers to small WebP files for the games grid.

Called by the catalog tools with a JSON job file:
  [{"from": src, "to": dest, "width": optional max width}, ...]
"from" may also be a list of screenshots of the same game; the one with the
most detail is used, and all-flat frames (black loading screens) are skipped.
"""
import json
import sys

from PIL import Image, ImageOps, ImageStat

WIDTH = 360  # cards are at most ~300 CSS px wide; 360 keeps them crisp at 1.2x
MIN_DETAIL = 14  # grayscale standard deviation below this is a blank screen


def detail(path):
    with Image.open(path) as im:
        return ImageStat.Stat(im.convert("L")).stddev[0]


def main(job_path):
    with open(job_path, encoding="utf-8") as fh:
        jobs = json.load(fh)
    done = 0
    for job in jobs:
        src = job["from"]
        try:
            if isinstance(src, list):
                scored = sorted(((detail(p), p) for p in src), reverse=True)
                if scored[0][0] < MIN_DETAIL:
                    print(f"  blank screenshot, skipped: {job['to']}")
                    continue
                src = scored[0][1]
            with Image.open(src) as im:
                im = ImageOps.exif_transpose(im)
                im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
                width = job.get("width", WIDTH)
                if im.width > width:
                    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
                im.save(job["to"], "WEBP", quality=78, method=6)
                done += 1
        except Exception as exc:  # a broken cover just falls back to a generated tile
            print(f"  cover failed: {src}: {exc}")
    print(f"  {done}/{len(jobs)} covers written")


if __name__ == "__main__":
    main(sys.argv[1])
