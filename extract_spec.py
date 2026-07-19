#!/usr/bin/env python3
import json, sys, re
from html import unescape

# Read the HTML file saved from /reference
with open('/tmp/neon_ref.json') as f:
    text = f.read()

# The JSON config is inside a <script> tag. Extract it.
# It's after a line like: \"configuration\": {...}
m = re.search(r'\"configuration\"\s*:\s*(\{.*?\})(?=,\s*\"presets\"|\})', text, re.DOTALL)
if not m:
    print("Could not locate configuration in HTML", file=sys.stderr)
    sys.exit(1)

config_str = '{' + m.group(1) + '}'
config_str = config_str.replace('\\n', ' ').replace('\\t', ' ')
config_str = re.sub(r',\s*}', '}', config_str)  # trailing commas

try:
    config = json.loads(config_str)
except Exception as e:
    print("Failed to parse configuration JSON:", e, file=sys.stderr)
    sys.exit(1)

# Extract the list of operations (actions)
spec = config.get('spec', {})
# The spec likely contains "operations" array with "path" and "method" fields.
ops = []
# Try nested: spec -> information -> sections maybe. Or spec.operations.
# For simplicity, let's just find all path+method occurrences via json traversal.
def walk(o):
    if isinstance(o, dict):
        if 'path' in o and 'method' in o:
            ops.append((o['method'], o['path']))
        for k, v in o.items():
            walk(v)
    elif isinstance(o, list):
        for i in o:
            walk(i)
walk(spec)

if not ops:
    print("No operations found")
else:
    # Deduplicate
    seen = set()
    unique = []
    for mth, pth in ops:
        key = (mth, pth)
        if key not in seen:
            seen.add(key)
            unique.append((mth, pth))
    print(f"Found {len(unique)} endpoints:")
    for mth, pth in sorted(unique):
        print(f"{mth.upper()} {pth}")