#!/usr/bin/env python3
import json
import mimetypes
import os
import re
import struct
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import unquote, urlparse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


HOST_NAME = "com.codex.apple_notes_webclipper"
CACHE_DIR = Path(tempfile.gettempdir()) / "apple-notes-webclipper"
CACHE_TTL_SECONDS = 7 * 24 * 60 * 60


def _ensure_cache_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cleanup_cache_dir() -> None:
    try:
        _ensure_cache_dir()
        now = int(time.time())
    except Exception:
        return

    try:
        for p in CACHE_DIR.iterdir():
            try:
                if not p.is_file():
                    continue
                age = now - int(p.stat().st_mtime)
                if age > CACHE_TTL_SECONDS:
                    p.unlink()
            except Exception:
                continue
    except Exception:
        return


def _read_exactly(n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sys.stdin.buffer.read(n - len(buf))
        if not chunk:
            raise EOFError()
        buf += chunk
    return buf


def read_native_message() -> Optional[Dict[str, Any]]:
    try:
        raw_len = _read_exactly(4)
    except EOFError:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    if msg_len <= 0:
        return None
    raw = _read_exactly(msg_len)
    return json.loads(raw.decode("utf-8"))


def send_native_message(payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def run_osascript_file(script_path: str, argv: List[str], timeout_s: int = 60) -> str:
    proc = subprocess.run(
        ["osascript", script_path, *argv],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout_s,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"osascript failed (code {proc.returncode})")
    return proc.stdout.strip()


def run_jxa(code: str, timeout_s: int = 60) -> str:
    proc = subprocess.run(
        ["osascript", "-l", "JavaScript", "-"],
        input=code,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout_s,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"JXA failed (code {proc.returncode})")
    return proc.stdout.strip()


def escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def markdown_with_data_images_to_notes_html(markdown: str) -> str:
    lines = markdown.splitlines()
    out: List[str] = []
    leading_ws_re = re.compile(r"^[ \t]+")
    for line in lines:
        if not line.strip():
            out.append("<div><br></div>")
            continue
        if line.lstrip().startswith("<img ") and line.rstrip().endswith(">"):
            out.append(f"<div>{line.strip()}</div>")
            continue
        m = leading_ws_re.match(line)
        if m:
            ws = m.group(0)
            rest = line[len(ws) :]
            ws_html = ws.replace("\t", "    ").replace(" ", "&nbsp;")
            out.append(f"<div>{ws_html}{escape_html(rest)}</div>")
        else:
            out.append(f"<div>{escape_html(line)}</div>")
    return "\n".join(out)


@dataclass
class ImageJob:
    token: str
    url: str
    alt: Optional[str] = None


def _guess_mime_from_url(url: str) -> str:
    lower = url.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".gif"):
        return "image/gif"
    if lower.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"

def _ext_from_mime_or_url(mime: str, url: str) -> str:
    mime = (mime or "").lower()
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }
    if mime in mapping:
        return mapping[mime]
    guessed = mimetypes.guess_extension(mime) if mime else None
    if guessed:
        return guessed
    try:
        suffix = Path(urlparse(url).path).suffix
        if suffix and len(suffix) <= 6:
            return suffix
    except Exception:
        pass
    return ".bin"


def _read_file_url_bytes(file_url: str) -> Tuple[bytes, str]:
    u = urlparse(file_url)
    path = unquote(u.path)
    data = Path(path).read_bytes()
    mime = _guess_mime_from_url(path)
    return data, mime


def cache_image_to_file_url(url: str, referer: Optional[str]) -> str:
    _ensure_cache_dir()
    if url.startswith("file://"):
        data, mime = _read_file_url_bytes(url)
    else:
        data, mime = download_bytes(url, referer=referer)

    ext = _ext_from_mime_or_url(mime, url)
    filename = f"img-{uuid.uuid4().hex}{ext}"
    path = CACHE_DIR / filename
    path.write_bytes(data)
    return path.as_uri()


def download_bytes(url: str, referer: Optional[str]) -> Tuple[bytes, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
            **({"Referer": referer} if referer else {}),
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        content_type = resp.headers.get("Content-Type") or ""
        mime = content_type.split(";")[0].strip() if content_type else ""
        if not mime:
            mime = _guess_mime_from_url(url)
        return data, mime


def replace_image_tokens(markdown: str, images: List[ImageJob], source_url: Optional[str]) -> str:
    out = markdown
    for img in images:
        placeholder = f"[[[IMG:{img.token}]]]"
        try:
            file_url = cache_image_to_file_url(img.url, referer=source_url)
            replacement = f'<img src="{file_url}">'
        except Exception:
            replacement = img.url
        out = out.replace(placeholder, replacement)
    return out


def render_html_preview(payload: Dict[str, Any]) -> Dict[str, Any]:
    title = str(payload.get("title") or "Untitled")
    source_url = str(payload.get("sourceUrl") or "")
    markdown = str(payload.get("markdown") or "").strip()

    images_raw = payload.get("images") or []
    images: List[ImageJob] = []
    for item in images_raw:
        try:
            images.append(ImageJob(token=str(item.get("token")), url=str(item.get("url")), alt=item.get("alt")))
        except Exception:
            continue

    if images:
        markdown = replace_image_tokens(markdown, images, source_url)

    fragment = markdown_with_data_images_to_notes_html(markdown)
    full = "\n".join(
        [
            "<!doctype html>",
            "<html>",
            "<head>",
            '  <meta charset="utf-8">',
            f"  <title>{escape_html(title)}</title>",
            "</head>",
            "<body>",
            fragment,
            "</body>",
            "</html>",
        ]
    )

    _ensure_cache_dir()
    out_path = CACHE_DIR / f"preview-{uuid.uuid4().hex}.html"
    out_path.write_text(full, encoding="utf-8")
    return {"ok": True, "htmlPath": str(out_path), "htmlFileUrl": out_path.as_uri()}


def list_folders() -> Dict[str, Any]:
    code = r"""
      const Notes = Application('Notes');
      Notes.includeStandardAdditions = true;

      function collect(folder, prefix) {
        const name = folder.name();
        const path = prefix ? `${prefix}/${name}` : name;
        let out = [{ path }];
        const children = folder.folders();
        for (const child of children) out = out.concat(collect(child, path));
        return out;
      }

      const accounts = Notes.accounts().map(acc => {
        const folders = [];
        for (const f of acc.folders()) folders.push(...collect(f, ''));
        // Remove special folders if present.
        const filtered = folders.filter(x => x.path !== 'Recently Deleted');
        return { name: acc.name(), folders: filtered };
      });

      JSON.stringify({ ok: true, accounts });
    """
    raw = run_jxa(code)
    return json.loads(raw)


def create_note(payload: Dict[str, Any], script_dir: str) -> Dict[str, Any]:
    title = str(payload.get("title") or "Untitled")
    source_url = str(payload.get("sourceUrl") or "")
    markdown = str(payload.get("markdown") or "").strip()
    folder = payload.get("folder") or {}
    account_name = str(folder.get("accountName") or "")
    folder_path = str(folder.get("folderPath") or "")

    images_raw = payload.get("images") or []
    images: List[ImageJob] = []
    for item in images_raw:
        try:
            images.append(ImageJob(token=str(item.get("token")), url=str(item.get("url")), alt=item.get("alt")))
        except Exception:
            continue

    if images:
        markdown = replace_image_tokens(markdown, images, source_url)

    html = markdown_with_data_images_to_notes_html(markdown)

    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".html", encoding="utf-8") as f:
        f.write(html)
        html_path = f.name

    try:
        script_path = os.path.join(script_dir, "scripts", "create_note.applescript")
        note_id = run_osascript_file(script_path, [account_name, folder_path, title, html_path], timeout_s=120)
        return {"ok": True, "noteId": note_id}
    finally:
        try:
            os.unlink(html_path)
        except OSError:
            pass


def main() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    _cleanup_cache_dir()

    while True:
        msg = read_native_message()
        if msg is None:
            return

        action = msg.get("action")
        try:
            if action == "ping":
                send_native_message({"ok": True})
            elif action == "listFolders":
                send_native_message(list_folders())
            elif action == "createNote":
                send_native_message(create_note(msg, script_dir))
            elif action == "renderHtml":
                send_native_message(render_html_preview(msg))
            else:
                send_native_message({"ok": False, "error": f"Unknown action: {action}"})
        except Exception as e:
            send_native_message({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
