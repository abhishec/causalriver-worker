"""Run S variant observational memory with resume support."""
import sys, time
sys.path.insert(0, '.')

from longmemeval_adapter import load_dataset
from longmemeval_method import run_method

print(f"[{time.strftime('%H:%M:%S')}] Loading S variant dataset...")
data = load_dataset('s')
print(f"[{time.strftime('%H:%M:%S')}] Loaded {len(data)} questions")

print(f"[{time.strftime('%H:%M:%S')}] Starting observational method on S variant...")
start = time.time()
results = run_method(
    method_name="observational",
    dataset=data,
    verbose=True,
    variant="s",
)
elapsed = time.time() - start
print(f"\n[{time.strftime('%H:%M:%S')}] Done! {len(results)} results in {elapsed:.0f}s ({elapsed/60:.1f}min)")

# Save hypothesis file
import json
from pathlib import Path
output_path = Path("results/longmemeval_s_observational.hyp.json")
with open(output_path, 'w') as f:
    json.dump(results, f, indent=2)
print(f"Saved to {output_path}")
