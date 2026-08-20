"""Assembled smart-search implementation."""
from pathlib import Path as _P
_src = "".join((_P(__file__).resolve().parent / f"_ss_part{i}.txt").read_text() for i in range(3))
exec(compile(_src, __file__, "exec"), globals())
