"""Manual single-node k3s deployment of a committed release, over verified SSH.

Build first; inspect the Job; release only once it succeeded. No registry or
GitHub token is needed. The local .env is NEVER part of the build context.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import shlex
import subprocess

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = "hackalem-qnt"
KANIKO = "gcr.io/kaniko-project/executor@sha256:4e7a52dd1f14872430652bb3b027405b8dfd17c4538751c620ac005741ef9698"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def remote(host, command, data=None, capture=False):
    # Never echo data: release input contains a Kubernetes Secret patch.
    completed = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
                                "-o", "StrictHostKeyChecking=yes", "-o", "UpdateHostKeys=no",
                                host, command], input=data, stdout=subprocess.PIPE if capture else None,
                               check=True)
    return completed.stdout


def apply(host, manifest):
    remote(host, f"kubectl -n {NAMESPACE} apply -f -", json.dumps(manifest).encode())


def build(host, revision):
    if git("status", "--porcelain").strip():
        raise SystemExit("Commit/review local changes before building a release.")
    source = git("archive", "--format=tar", revision)
    context = remote(host, "mktemp -d /root/hackalem-qnt-build.XXXXXXXX", capture=True).decode().strip()
    if not re.fullmatch(r"/root/hackalem-qnt-build\.[a-zA-Z0-9]+", context):
        raise SystemExit("Unexpected build directory; refusing to proceed.")
    remote(host, f"tar -xf - -C {shlex.quote(context)}", source)
    job = {
        "apiVersion": "batch/v1", "kind": "Job",
        "metadata": {"name": "build-qnt-" + revision[:12], "namespace": NAMESPACE,
                     "annotations": {"qnt/source-revision": revision}},
        "spec": {"backoffLimit": 0, "activeDeadlineSeconds": 1200,
                 "template": {"spec": {"restartPolicy": "Never",
                    "containers": [{"name": "kaniko", "image": KANIKO, "imagePullPolicy": "IfNotPresent",
                        "args": ["--context=dir:///workspace", "--dockerfile=Dockerfile.prod", "--no-push",
                                 "--tarPath=/output/image.tar", "--destination=docker.io/library/qnt-firebird:" + revision[:12]],
                        "resources": {"requests": {"cpu": "100m", "memory": "256Mi"}, "limits": {"cpu": "500m", "memory": "1Gi"}},
                        "volumeMounts": [{"name": "source", "mountPath": "/workspace", "readOnly": True},
                                         {"name": "output", "mountPath": "/output"}]}],
                    "volumes": [{"name": "source", "hostPath": {"path": context, "type": "Directory"}},
                                {"name": "output", "hostPath": {"path": context + "-output", "type": "DirectoryOrCreate"}}]}}},
    }
    apply(host, job)
    print("Build started:", job["metadata"]["name"], "revision:", revision, flush=True)
    print("No application or secret has been changed. Inspect Job completion before release.")


def release(host, revision, enable_ai):
    job = json.loads(remote(host, f"kubectl -n {NAMESPACE} get job build-qnt-{revision[:12]} -o json", capture=True))
    if job.get("status", {}).get("succeeded") != 1 or job["metadata"]["annotations"]["qnt/source-revision"] != revision:
        raise SystemExit("The requested build has not succeeded; current deployment is unchanged.")
    output = next(v["hostPath"]["path"] for v in job["spec"]["template"]["spec"]["volumes"] if v["name"] == "output")
    if not re.fullmatch(r"/root/hackalem-qnt-build\.[a-zA-Z0-9]+-output", output):
        raise SystemExit("Unexpected image path; refusing to import.")
    settings = dotenv_values(ROOT / ".env")
    model = settings.get("OPENAI_MODEL") or "gpt-4.1-mini"
    key = settings.get("OPENAI_API_KEY") or ""
    if enable_ai and not key:
        raise SystemExit("No local API key configured. Use a keyless release or configure .env privately.")
    previous = remote(host, f"kubectl -n {NAMESPACE} get deployment hackalem-qnt -o jsonpath='{{.spec.template.spec.containers[0].image}}'", capture=True).decode()
    print("Previous image (keep for rollback):", previous, flush=True)
    remote(host, "ctr -n k8s.io images import " + shlex.quote(output + "/image.tar"))
    apply(host, {"apiVersion": "v1", "kind": "PersistentVolumeClaim",
                 "metadata": {"name": "qnt-ai-usage", "namespace": NAMESPACE},
                 "spec": {"accessModes": ["ReadWriteOnce"], "storageClassName": "local-path",
                          "resources": {"requests": {"storage": "16Mi"}}}})
    if enable_ai:
        patch = {"data": {"OPENAI_API_KEY": base64.b64encode(key.encode()).decode()}}
        remote(host, f"kubectl -n {NAMESPACE} patch secret hackalem-qnt-secrets --type=merge --patch-file=/dev/stdin", json.dumps(patch).encode())
    patch = {"spec": {"template": {"metadata": {"annotations": {"qnt/source-revision": revision}}, "spec": {
        "securityContext": {"runAsUser": 10001, "runAsGroup": 10001, "fsGroup": 10001},
        "containers": [{"name": "hackalem-qnt", "image": "docker.io/library/qnt-firebird:" + revision[:12],
            "imagePullPolicy": "Never", "command": None, "args": None,
            "securityContext": {"allowPrivilegeEscalation": False, "readOnlyRootFilesystem": True, "capabilities": {"drop": ["ALL"]}},
            "resources": {"requests": {"cpu": "50m", "memory": "128Mi"}, "limits": {"cpu": "500m", "memory": "512Mi"}},
            "env": [{"name": "ENABLE_AI", "value": "true" if enable_ai else "false"},
                    {"name": "OPENAI_MODEL", "value": model}, {"name": "AI_MAX_CALLS", "value": "100"},
                    {"name": "AI_USAGE_DB", "value": "/app/state/ai_usage.sqlite3"}],
            "volumeMounts": [{"name": "ai-usage", "mountPath": "/app/state"}],
            "readinessProbe": {"httpGet": {"path": "/api/health", "port": 8000}, "periodSeconds": 5},
            "livenessProbe": {"httpGet": {"path": "/api/health", "port": 8000}, "initialDelaySeconds": 20, "periodSeconds": 15}}],
        "volumes": [{"name": "ai-usage", "persistentVolumeClaim": {"claimName": "qnt-ai-usage"}}],
    }}}}
    remote(host, f"kubectl -n {NAMESPACE} patch deployment hackalem-qnt --type=strategic --patch-file=/dev/stdin", json.dumps(patch).encode())
    print("Rollout requested. Verify readiness, public UI, match scenarios and persistent counter.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["build", "release"])
    parser.add_argument("--host", required=True, help="SSH destination already in known_hosts")
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--enable-ai", action="store_true", help="Release only: transfer local key privately to the existing Secret")
    args = parser.parse_args()
    if args.host.startswith("-") or not re.fullmatch(r"[a-zA-Z0-9_.@:-]+", args.host):
        raise SystemExit("Invalid SSH destination")
    revision = git("rev-parse", "--verify", args.revision + "^{commit}").decode().strip()
    if args.action == "build":
        build(args.host, revision)
    else:
        release(args.host, revision, args.enable_ai)
