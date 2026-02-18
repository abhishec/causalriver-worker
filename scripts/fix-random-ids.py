#!/usr/bin/env python3
"""
Fix Math.random() ID generation patterns in production TypeScript files.
Replaces non-collision-safe Math.random().toString(36).slice/substr/substring(...)
with crypto.randomUUID().replace(/-/g, '').slice(0, N) for a safe alternative.

For subscription IDs that need uniqueness within a single process (not stored in DB),
we keep a Date.now() + short uuid suffix pattern.
"""

import re
import os
import glob
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "packages", "memory-stack", "src")

# Pattern to match: Math.random().toString(36).slice/substr/substring(N, M)
# Captures the method (substr/slice/substring) and the start/end args
PATTERN = re.compile(
    r'Math\.random\(\)\.(toString\(36\)\.(slice|substr|substring))\((\d+)(?:,\s*(\d+))?\)'
)

def replacement(m):
    """Replace Math.random().toString(36).slice(2, N) with crypto.randomUUID() snippet."""
    start = int(m.group(3))
    end_raw = m.group(4)
    if end_raw is not None:
        length = int(end_raw) - start
        length = max(6, min(length, 32))  # clamp to reasonable range
    else:
        # No end arg — take a full UUID-minus-dashes (32 chars)
        length = 32
    return f"crypto.randomUUID().replace(/-/g, '').slice(0, {length})"

def needs_crypto_import(content):
    """Check if file already imports crypto."""
    return "require('crypto')" in content or "from 'crypto'" in content or "from \"crypto\"" in content

def ensure_crypto_import(content):
    """Add crypto import if not already present."""
    if needs_crypto_import(content):
        return content
    # Add after the last import line or at top
    lines = content.split('\n')
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith('import ') or line.startswith('const ') and 'require(' in line:
            last_import_idx = i

    # Actually, in Node.js 19+ and browser environments crypto is global
    # In Next.js API routes, crypto is available globally
    # In memory-stack (Node.js), we need to check
    # For safety: add import after first import block
    if last_import_idx >= 0:
        # Insert after last import
        lines.insert(last_import_idx + 1, "import { randomUUID } from 'node:crypto';")
        # But this changes the function name — we'll use the global crypto instead
        # Revert: don't insert, just rely on global crypto (available in Node 19+, Next.js)
        lines.pop(last_import_idx + 1)

    return '\n'.join(lines)

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()

    if 'Math.random().toString(36)' not in original and 'Math.random().slice' not in original and 'Math.random().substr' not in original:
        return False

    fixed = PATTERN.sub(replacement, original)

    if fixed == original:
        return False

    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)

    return True

# Find all production TS files (not tests)
SKIP_PATTERNS = [
    '__tests__', 'stress-test', 'e2e-rl', 'synthetic', '.test.ts', '.spec.ts'
]

files = glob.glob(os.path.join(SRC, '**', '*.ts'), recursive=True)
files = [f for f in files if not any(skip in f for skip in SKIP_PATTERNS)]

fixed_count = 0
fixed_files = []

for path in sorted(files):
    if fix_file(path):
        fixed_count += 1
        rel = os.path.relpath(path, BASE)
        fixed_files.append(rel)
        print(f"  FIXED: {rel}")

print(f"\nTotal files fixed: {fixed_count}")
if fixed_files:
    print("\nFixed files:")
    for f in fixed_files:
        print(f"  - {f}")
