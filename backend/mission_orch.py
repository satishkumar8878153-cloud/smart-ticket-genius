"""Mission AI orchestration bootstrap."""
from mission_orch_p1 import PART as _P1
from mission_orch_p2 import PART as _P2

exec(compile(_P1 + _P2, "mission_orch.py", "exec"), globals())
