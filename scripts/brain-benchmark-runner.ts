/**
 * Brain Benchmark Runner
 *
 * Runs LongMemEval benchmark evaluation on AWS ECS Fargate.
 * Wraps the Python benchmark pipeline with proper environment setup,
 * progress reporting, and result persistence.
 *
 * Environment Variables:
 *   BENCHMARK_METHOD    - Method to run: "observational" | "federated_observational" (default: observational)
 *   BENCHMARK_VARIANT   - Dataset variant: "oracle" | "s" (default: s)
 *   BENCHMARK_MAX_QUESTIONS - Max questions to process (default: all)
 *   BENCHMARK_MAX_WORKERS   - Parallel observer workers (default: 10)
 *   OPENAI_API_KEY      - Required for LLM calls
 *
 * Usage:
 *   # Via docker
 *   BRAIN_PROCESS=benchmark BENCHMARK_METHOD=observational ./docker-entrypoint.sh
 *
 *   # Via ECS
 *   ./infra/run-task.sh benchmark
 *
 *   # Locally
 *   pnpm exec tsx scripts/brain-benchmark-runner.ts
 */

import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const BENCHMARK_DIR = path.join(__dirname, '../scripts/benchmarks/longmemeval');
const METHOD = process.env.BENCHMARK_METHOD || 'observational';
const VARIANT = process.env.BENCHMARK_VARIANT || 's';
const MAX_QUESTIONS = process.env.BENCHMARK_MAX_QUESTIONS || '';
const MAX_WORKERS = process.env.BENCHMARK_MAX_WORKERS || '10';

async function main() {
  console.log('========================================');
  console.log(`[${new Date().toISOString()}] NexusBrain Benchmark Runner`);
  console.log(`  Method:       ${METHOD}`);
  console.log(`  Variant:      ${VARIANT}`);
  console.log(`  Max Workers:  ${MAX_WORKERS}`);
  console.log(`  Max Questions: ${MAX_QUESTIONS || 'all'}`);
  console.log('========================================');
  console.log('');

  // Verify Python + OpenAI are available
  try {
    execSync('python3 --version', { stdio: 'pipe' });
    console.log('[OK] Python3 available');
  } catch {
    console.error('[ERROR] Python3 not found. Install python3.');
    process.exit(1);
  }

  // Verify OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('[ERROR] OPENAI_API_KEY not set. Required for LLM calls.');
    process.exit(1);
  }
  console.log('[OK] OPENAI_API_KEY set');

  // Verify benchmark directory exists
  if (!fs.existsSync(BENCHMARK_DIR)) {
    console.error(`[ERROR] Benchmark directory not found: ${BENCHMARK_DIR}`);
    process.exit(1);
  }
  console.log(`[OK] Benchmark dir: ${BENCHMARK_DIR}`);

  // Create the Python runner script inline
  const pythonScript = `
import sys, time, os, json
sys.path.insert(0, '${BENCHMARK_DIR}')
os.chdir('${BENCHMARK_DIR}')

# Set max workers for parallel observer
os.environ['OBSERVATION_MAX_WORKERS'] = '${MAX_WORKERS}'

from longmemeval_adapter import load_dataset, download_dataset
from longmemeval_method import run_method

method = '${METHOD}'
variant = '${VARIANT}'
max_q = ${MAX_QUESTIONS ? MAX_QUESTIONS : 'None'}

# Auto-download dataset if not present (needed for Docker/ECS)
print(f"[{time.strftime('%H:%M:%S')}] Ensuring {variant} variant dataset is available...")
download_dataset(variant=variant, verbose=True)

print(f"[{time.strftime('%H:%M:%S')}] Loading {variant} variant dataset...")
data = load_dataset(variant)
print(f"[{time.strftime('%H:%M:%S')}] Loaded {len(data)} questions")

print(f"[{time.strftime('%H:%M:%S')}] Starting {method} on {variant} variant...")
start = time.time()

results = run_method(
    method_name=method,
    dataset=data,
    verbose=True,
    max_questions=max_q,
    variant=variant,
)

elapsed = time.time() - start
print(f"\\n[{time.strftime('%H:%M:%S')}] Done! {len(results)} results in {elapsed:.0f}s ({elapsed/60:.1f}min)")

# Save hypothesis file
from pathlib import Path
os.makedirs('results', exist_ok=True)
output_path = Path(f"results/longmemeval_{variant}_{method}.hyp.json")
with open(output_path, 'w') as f:
    json.dump(results, f, indent=2)
print(f"Saved to {output_path}")

# If oracle variant, also run evaluation
if variant == 'oracle':
    print(f"\\n[{time.strftime('%H:%M:%S')}] Running evaluation...")
    try:
        from longmemeval_adapter import evaluate_results
        eval_result = evaluate_results(results, data, variant=variant, method_name=method)
        print(f"\\nEvaluation Results:")
        print(json.dumps(eval_result, indent=2))
    except Exception as e:
        print(f"Evaluation failed: {e}")
`;

  console.log('');
  console.log('[START] Running benchmark...');
  console.log('');

  const startTime = Date.now();

  // Run the Python script
  const proc = spawn('python3', ['-u', '-c', pythonScript], {
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: 'inherit',
  });

  proc.on('close', (code) => {
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log('');
    console.log('========================================');
    console.log(`[${new Date().toISOString()}] Benchmark Complete`);
    console.log(`  Exit code: ${code}`);
    console.log(`  Duration: ${elapsed} minutes`);
    console.log('========================================');
    process.exit(code || 0);
  });

  proc.on('error', (err) => {
    console.error(`[ERROR] Failed to start benchmark: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
