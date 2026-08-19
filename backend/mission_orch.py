"""Mission AI orchestration — full patched app."""
from __future__ import annotations
import base64, zlib
from mission_blob0 import B as _B0
from mission_blob1 import B as _B1
from mission_blob2 import B as _B2
_SRC = zlib.decompress(base64.b64decode(_B0 + _B1 + _B2)).decode()
exec(compile(_SRC, "backend/main.py", "exec"), globals())
