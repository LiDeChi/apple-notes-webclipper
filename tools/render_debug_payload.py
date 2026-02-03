#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


def _load_json(path: Path):
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)


def _extract_create_note_shape(obj: dict) -> dict:
    # Accept:
    # 1) Options Debug JSON: { capturedAt, mode, folder, extracted:{ ok:true, title, sourceUrl, markdown, images } }
    # 2) Direct createNote payload: { title, sourceUrl, markdown, images }
    if isinstance(obj.get("extracted"), dict) and obj["extracted"].get("ok") is True:
        extracted = obj["extracted"]
        return {
            "title": extracted.get("title") or "Untitled",
            "sourceUrl": extracted.get("sourceUrl") or "",
            "markdown": extracted.get("markdown") or "",
            "images": extracted.get("images") or [],
        }

    return {
        "title": obj.get("title") or "Untitled",
        "sourceUrl": obj.get("sourceUrl") or "",
        "markdown": obj.get("markdown") or "",
        "images": obj.get("images") or [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Render Apple Notes HTML preview from exported Debug JSON.")
    ap.add_argument("payload_json", type=Path, help="Path to Debug JSON downloaded from extension Options.")
    ap.add_argument("--out", type=Path, default=None, help="Output HTML path. Default: <cache>/preview-<id>.html")
    ap.add_argument("--no-download-images", action="store_true", help="Do not download/cache images (leave URLs).")
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "native_host"))
    import notes_bridge  # type: ignore

    obj = _load_json(args.payload_json)
    payload = _extract_create_note_shape(obj)

    title = str(payload.get("title") or "Untitled")
    source_url = str(payload.get("sourceUrl") or "")
    markdown = str(payload.get("markdown") or "").strip()

    images_raw = payload.get("images") or []
    images = []
    for item in images_raw:
        try:
            images.append(
                notes_bridge.ImageJob(
                    token=str(item.get("token")),
                    url=str(item.get("url")),
                    alt=item.get("alt"),
                )
            )
        except Exception:
            continue

    if images and not args.no_download_images:
        markdown = notes_bridge.replace_image_tokens(markdown, images, source_url)
    elif images and args.no_download_images:
        # Replace tokens with raw URLs to keep output readable (no network).
        for img in images:
            markdown = markdown.replace(f"[[[IMG:{img.token}]]]", img.url)

    fragment = notes_bridge.markdown_with_data_images_to_notes_html(markdown)
    full = "\n".join(
        [
            "<!doctype html>",
            "<html>",
            "<head>",
            '  <meta charset="utf-8">',
            f"  <title>{notes_bridge.escape_html(title)}</title>",
            "</head>",
            "<body>",
            fragment,
            "</body>",
            "</html>",
        ]
    )

    notes_bridge._cleanup_cache_dir()  # best effort
    notes_bridge._ensure_cache_dir()

    out_path = args.out
    if out_path is None:
        out_path = notes_bridge.CACHE_DIR / f"preview-local-{notes_bridge.uuid.uuid4().hex}.html"
    out_path.write_text(full, encoding="utf-8")

    print(str(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

