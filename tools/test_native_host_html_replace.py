import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from native_host.notes_bridge import ImageJob, render_note_html

with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
    tmp.write(b"\x89PNG\r\n\x1a\n")
    tmp_path = tmp.name

file_url = Path(tmp_path).as_uri()

payload = {
    "html": "<h1>Title</h1><p>[[[IMG:0]]]</p>",
    "markdown": "# Title"
}
images = [ImageJob(token="0", url=file_url, alt=None)]

out = render_note_html(payload, images, source_url=None)
assert "IMG:0" not in out
assert "<img" in out
