"""One-command, offline technical acceptance. This is not the organizer's grader.

Requires README dependencies (Python requirements and npm ci). Never calls AI.
Writes machine-readable checks; organizational conditions stay explicitly manual.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def run(output):
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not npm:
        raise SystemExit('Install Node.js and npm as described in README.')
    env = {**os.environ, 'ENABLE_AI': 'false', 'OPENAI_API_KEY': '', 'VITE_DEMO_MODE': 'false'}
    with tempfile.TemporaryDirectory(prefix='qnt-offline-check-') as scratch:
        steps = [
            ('frontend_tests', [npm, 'test'], ROOT/'frontend'),
            ('production_build', [npm, 'run', 'build'], ROOT/'frontend'),
            ('backend_tests', [sys.executable, '-m', 'pytest', '-q'], ROOT/'backend'),
            ('three_outcomes_and_date_change', [sys.executable, 'backend/scripts/demo_check.py'], ROOT),
            ('all_100_days', [sys.executable, 'backend/scripts/acceptance_check.py'], ROOT),
            ('offline_explanation_rubric', [sys.executable, 'backend/scripts/evaluate_explanations.py', '--output', str(Path(scratch)/'rubric.json')], ROOT),
        ]
        checks = []
        for name, command, cwd in steps:
            print(f'Checking {name}...', flush=True)
            result = subprocess.run(command, cwd=cwd, env=env, text=True, capture_output=True)
            print(result.stdout, end='')
            if result.returncode:
                print(result.stderr, file=sys.stderr)
            checks.append({'check': name, 'pass': result.returncode == 0, 'exit_code': result.returncode})
        report = {'automated_pass': all(c['pass'] for c in checks), 'paid_requests': 0, 'checks': checks,
                  'not_automatically_verifiable': ['Official platform submission and receipt', 'In-person attendance/check-in/breaks', 'Authentic personal contribution beyond Git evidence', 'Organizer final score and relative ranking', 'Public demo deployed at the final submitted revision'],
                  'scope': 'Reproducible internal acceptance against Firebird requirements, not official certification or a predicted jury score.'}
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps(report, ensure_ascii=False))
        return 0 if report['automated_pass'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(tempfile.gettempdir())/'qnt-judge-check.json')
    raise SystemExit(run(parser.parse_args().output))
