import json
import math
import re
import sys
from pathlib import Path


PATTERN = re.compile(r'" (?P<status>\d{3}) .*?rt=(?P<rt>[0-9.\-]+) urt=(?P<urt>[0-9.\-]+)')


def percentile(values, p):
    if not values:
        return 0
    values = sorted(values)
    index = min(len(values) - 1, max(0, math.ceil((p / 100) * len(values)) - 1))
    return round(values[index], 4)


def main():
    if len(sys.argv) != 2:
        print("Usage: python summarize-nginx-timing.py <access_log_path>", file=sys.stderr)
        raise SystemExit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(json.dumps({"error": "log_not_found", "path": str(path)}))
        raise SystemExit(1)

    request_times = []
    upstream_times = []
    statuses = {}

    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = PATTERN.search(line)
        if not match:
            continue
        statuses[match.group("status")] = statuses.get(match.group("status"), 0) + 1
        rt = match.group("rt")
        urt = match.group("urt")
        if rt != "-":
            request_times.append(float(rt))
        if urt != "-":
            upstream_times.append(float(urt))

    summary = {
        "samples": len(request_times),
        "status_counts": statuses,
        "request_time": {
            "p50_s": percentile(request_times, 50),
            "p95_s": percentile(request_times, 95),
            "p99_s": percentile(request_times, 99),
            "max_s": round(max(request_times), 4) if request_times else 0,
        },
        "upstream_time": {
            "p50_s": percentile(upstream_times, 50),
            "p95_s": percentile(upstream_times, 95),
            "p99_s": percentile(upstream_times, 99),
            "max_s": round(max(upstream_times), 4) if upstream_times else 0,
        },
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
