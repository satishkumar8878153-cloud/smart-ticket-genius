"""Mission AI orchestration bootstrap."""
from mission_orch_p0 import PART as _P0
from mission_orch_p1 import PART as _P1
from mission_orch_p2 import PART as _P2
from mission_orch_p3 import PART as _P3

exec(compile(_P0 + _P1 + _P2 + _P3, "mission_orch.py", "exec"), globals())
