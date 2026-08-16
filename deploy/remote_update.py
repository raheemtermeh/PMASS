"""
PMAS remote updater — sync deploy files, pull git on server, build & restart stack.

Usage (from repo root):
  py -3 deploy/remote_update.py
  update-server.bat

Password / SSH (first match wins):
  1) env PMAS_SSH_PASS / PMAS_SSH_HOST / PMAS_SSH_PORT / PMAS_SSH_USER / PMAS_REMOTE_DIR
  2) file .deploy.env (see .deploy.env.example)
  3) interactive password prompt
"""

from __future__ import annotations

import getpass
import io
import os
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Next.js / Docker build logs may contain Unicode (e.g. ▲). Windows cp1252 crashes otherwise.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import paramiko
except ImportError:
    print("[ERROR] paramiko missing. Run: py -3 -m pip install paramiko")
    input("Press Enter to exit...")
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[1]

HOST = os.environ.get("PMAS_SSH_HOST", "server.linooxel.com")
PORT = int(os.environ.get("PMAS_SSH_PORT", "185"))
USER = os.environ.get("PMAS_SSH_USER", "root")
REMOTE_DIR = os.environ.get("PMAS_REMOTE_DIR", "/root/termeh/PMASS")
REPO_URL = "https://github.com/raheemtermeh/PMASS.git"

# Uploaded AFTER git reset so local deploy config always wins for this run.
UPLOAD_FILES = (
    ("deploy/update.sh", "deploy/update.sh", True),
    ("docker-compose.yml", "docker-compose.yml", True),
    ("docker-compose.logs.yml", "docker-compose.logs.yml", True),
    ("deploy/nginx.conf", "deploy/nginx.conf", True),
    ("deploy/observability/loki-config.yml", "deploy/observability/loki-config.yml", True),
    ("deploy/observability/promtail-config.yml", "deploy/observability/promtail-config.yml", True),
)


def load_deploy_env() -> dict[str, str]:
    out: dict[str, str] = {}
    deploy_env = ROOT / ".deploy.env"
    if not deploy_env.exists():
        return out
    for line in deploy_env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def apply_settings() -> None:
    global HOST, PORT, USER, REMOTE_DIR
    file_env = load_deploy_env()
    HOST = os.environ.get("PMAS_SSH_HOST", file_env.get("PMAS_SSH_HOST", HOST))
    PORT = int(os.environ.get("PMAS_SSH_PORT", file_env.get("PMAS_SSH_PORT", str(PORT))))
    USER = os.environ.get("PMAS_SSH_USER", file_env.get("PMAS_SSH_USER", USER))
    REMOTE_DIR = os.environ.get("PMAS_REMOTE_DIR", file_env.get("PMAS_REMOTE_DIR", REMOTE_DIR))


def load_password() -> str:
    env = os.environ.get("PMAS_SSH_PASS", "").strip()
    if env:
        return env
    file_env = load_deploy_env()
    if file_env.get("PMAS_SSH_PASS"):
        return file_env["PMAS_SSH_PASS"]
    return getpass.getpass(f"SSH password for {USER}@{HOST}: ")


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 2400) -> int:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
    while True:
        if stdout.channel.recv_ready():
            chunk = stdout.channel.recv(8192).decode(errors="replace")
            sys.stdout.write(chunk)
            sys.stdout.flush()
        if stdout.channel.recv_stderr_ready():
            chunk = stdout.channel.recv_stderr(8192).decode(errors="replace")
            sys.stderr.write(chunk)
            sys.stderr.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    code = stdout.channel.recv_exit_status()
    leftover = stdout.read().decode(errors="replace")
    if leftover:
        sys.stdout.write(leftover)
        sys.stdout.flush()
    err_left = stderr.read().decode(errors="replace")
    if err_left:
        sys.stderr.write(err_left)
        sys.stderr.flush()
    print(flush=True)
    return code


def sftp_mkdirs(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = remote_dir.strip("/").split("/")
    cur = ""
    for p in parts:
        cur += "/" + p
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def to_lf(data: bytes) -> bytes:
    return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def upload_deploy_files(ssh: paramiko.SSHClient) -> None:
    sftp = ssh.open_sftp()
    try:
        for local_rel, remote_rel, force_lf in UPLOAD_FILES:
            local = ROOT / local_rel
            if not local.exists():
                raise FileNotFoundError(f"Missing local file: {local}")
            remote = f"{REMOTE_DIR}/{remote_rel}"
            remote_parent = str(Path(remote).parent).replace("\\", "/")
            sftp_mkdirs(sftp, remote_parent)
            raw = local.read_bytes()
            payload = to_lf(raw) if force_lf else raw
            with sftp.file(remote, "wb") as fh:
                fh.write(payload)
            print(f"uploaded {remote} ({len(payload)} bytes)", flush=True)
    finally:
        sftp.close()


def build_server_env() -> bytes:
    """Build server .env from local secrets without ever committing them."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        raise FileNotFoundError(f"Missing local file: {env_path}")

    lines = env_path.read_text(encoding="utf-8-sig").splitlines()
    values: dict[str, str] = {}
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

    required = (
        "SUPABASE_DB_URL",
        "POSTGRES_PASSWORD",
        "JWT_SECRET",
        "CREDENTIALS_ENCRYPTION_KEY",
    )
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise ValueError(f"local .env missing required values: {', '.join(missing)}")

    parsed = urlsplit(values["SUPABASE_DB_URL"])
    if parsed.scheme not in ("postgres", "postgresql") or "@" not in parsed.netloc:
        raise ValueError("SUPABASE_DB_URL must be a PostgreSQL URL with username/password")
    userinfo = parsed.netloc.rsplit("@", 1)[0]
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["sslmode"] = "disable"
    values["SUPABASE_DB_URL"] = urlunsplit(
        (parsed.scheme, f"{userinfo}@db:5432", parsed.path or "/pmas", urlencode(query), "")
    )
    values["APP_ENV"] = "production"
    values["COOKIE_SECURE"] = values.get("COOKIE_SECURE", "false")

    output: list[str] = [
        "# Generated securely by deploy/remote_update.py; never commit this file.",
    ]
    emitted: set[str] = set()
    for raw in lines:
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in emitted:
            continue
        output.append(f"{key}={values[key]}")
        emitted.add(key)
    for key in ("APP_ENV", "COOKIE_SECURE"):
        if key not in emitted:
            output.append(f"{key}={values[key]}")
    return ("\n".join(output) + "\n").encode("utf-8")


def upload_runtime_env(ssh: paramiko.SSHClient) -> None:
    payload = build_server_env()
    sftp = ssh.open_sftp()
    try:
        sftp_mkdirs(sftp, REMOTE_DIR)
        remote = f"{REMOTE_DIR}/.env"
        with sftp.file(remote, "wb") as fh:
            fh.write(payload)
        sftp.chmod(remote, 0o600)
        print(f"uploaded {remote} securely (mode 0600)", flush=True)
    finally:
        sftp.close()


def git_pull_on_server(ssh: paramiko.SSHClient) -> int:
    # Preserve .env; hard-reset to origin/master or origin/main.
    cmd = (
        f"cd {REMOTE_DIR} && "
        f"test -f .env || {{ echo '[ERROR] .env missing on server at {REMOTE_DIR}/.env'; exit 1; }} && "
        f"cp -f .env /tmp/pmas.env.bak.$$ && "
        f"git fetch --all --prune && "
        f"branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || true); "
        f"if [ -z \"$branch\" ]; then "
        f"  if git show-ref --verify --quiet refs/remotes/origin/master; then branch=master; "
        f"  elif git show-ref --verify --quiet refs/remotes/origin/main; then branch=main; "
        f"  else echo '[ERROR] no origin/master or origin/main'; exit 1; fi; "
        f"fi; "
        f"echo \"reset to origin/$branch\" && "
        f"git reset --hard \"origin/$branch\" && "
        f"git clean -fd -e .env -e '*.local' -e '.deploy.env' && "
        f"cp -f /tmp/pmas.env.bak.$$ .env && "
        f"rm -f /tmp/pmas.env.bak.$$ && "
        f"sed -i 's/\\r$//' .env || true && "
        f"git log -1 --oneline"
    )
    return run(ssh, cmd, timeout=300)


def main() -> int:
    apply_settings()

    print("========================================")
    print(" PMAS server update")
    print(f" {USER}@{HOST}:{PORT}")
    print(f" {REMOTE_DIR}")
    print("========================================")
    print("Note: application code comes from GitHub.")
    print("      Push your commits before updating if you need new code.")
    print("      deploy files and local .env are sent directly over SSH (secrets are not committed).")

    password = load_password()
    if not password:
        print("[ERROR] empty password")
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(
            HOST,
            port=PORT,
            username=USER,
            password=password,
            timeout=30,
            allow_agent=False,
            look_for_keys=False,
            banner_timeout=60,
            auth_timeout=60,
        )
    except Exception as exc:
        print(f"[ERROR] SSH connect failed: {exc}")
        return 1

    try:
        code = run(
            ssh,
            f'test -d {REMOTE_DIR}/.git || (mkdir -p "$(dirname {REMOTE_DIR})" && '
            f"git clone --depth 1 {REPO_URL} {REMOTE_DIR})",
            timeout=300,
        )
        if code != 0:
            print("[ERROR] clone/check failed")
            return code

        try:
            upload_runtime_env(ssh)
        except Exception as exc:
            print(f"[ERROR] secure .env upload failed: {exc}")
            return 1

        code = git_pull_on_server(ssh)
        if code != 0:
            print("[ERROR] git pull/reset failed — is origin/master (or main) up to date?")
            return code

        try:
            upload_deploy_files(ssh)
        except Exception as exc:
            print(f"[ERROR] upload deploy files failed: {exc}")
            return 1

        code = run(
            ssh,
            f"cd {REMOTE_DIR} && chmod +x deploy/update.sh && bash deploy/update.sh --skip-git",
            timeout=2400,
        )
        if code != 0:
            print(f"\n[ERROR] update failed with exit code {code}")
            return code

        print("\nDone.")
        print("URL: http://server.linooxel.com:3185")
        print("Health: http://server.linooxel.com:3185/health")
        return 0
    finally:
        ssh.close()


if __name__ == "__main__":
    try:
        code = main()
    except KeyboardInterrupt:
        print("\nCancelled.")
        code = 130
    except Exception as exc:
        print(f"\n[ERROR] {exc}")
        code = 1
    if sys.stdin.isatty():
        try:
            input("\nPress Enter to close...")
        except EOFError:
            pass
    raise SystemExit(code)
