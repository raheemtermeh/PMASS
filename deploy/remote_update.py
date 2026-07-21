"""
PMAS remote updater — pull git on server, build Docker images, restart stack.

Usage (from repo root):
  py -3 deploy/remote_update.py

Password (first match wins):
  1) env PMAS_SSH_PASS
  2) file .deploy.env  ->  PMAS_SSH_PASS=...
  3) interactive prompt
"""

from __future__ import annotations

import getpass
import os
import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("[ERROR] paramiko missing. Run: py -3 -m pip install paramiko")
    input("Press Enter to exit...")
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[1]
UPDATE_SH = ROOT / "deploy" / "update.sh"

HOST = os.environ.get("PMAS_SSH_HOST", "server.linooxel.com")
PORT = int(os.environ.get("PMAS_SSH_PORT", "185"))
USER = os.environ.get("PMAS_SSH_USER", "root")
REMOTE_DIR = os.environ.get("PMAS_REMOTE_DIR", "/root/termeh/PMASS")
REPO_URL = "https://github.com/raheemtermeh/PMASS.git"


def load_password() -> str:
    env = os.environ.get("PMAS_SSH_PASS", "").strip()
    if env:
        return env
    deploy_env = ROOT / ".deploy.env"
    if deploy_env.exists():
        for line in deploy_env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == "PMAS_SSH_PASS":
                return v.strip().strip('"').strip("'")
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


def upload_update_script(ssh: paramiko.SSHClient) -> None:
    if not UPDATE_SH.exists():
        raise FileNotFoundError(f"Missing local script: {UPDATE_SH}")
    # Force Unix LF endings — Windows CRLF breaks bash ("set: pipefail").
    content = UPDATE_SH.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    sftp = ssh.open_sftp()
    try:
        sftp_mkdirs(sftp, f"{REMOTE_DIR}/deploy")
        remote = f"{REMOTE_DIR}/deploy/update.sh"
        with sftp.file(remote, "wb") as fh:
            fh.write(content)
        print(f"uploaded {remote} ({len(content)} bytes, LF)", flush=True)
    finally:
        sftp.close()


def main() -> int:
    print("========================================")
    print(" PMAS server update")
    print(f" {USER}@{HOST}:{PORT}")
    print(f" {REMOTE_DIR}")
    print("========================================")

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
        )
    except Exception as exc:
        print(f"[ERROR] SSH connect failed: {exc}")
        return 1

    # Ensure repo exists
    code = run(
        ssh,
        f'test -d {REMOTE_DIR}/.git || (mkdir -p "$(dirname {REMOTE_DIR})" && '
        f"git clone --depth 1 {REPO_URL} {REMOTE_DIR})",
        timeout=300,
    )
    if code != 0:
        print("[ERROR] clone/check failed")
        ssh.close()
        return code

    # Always upload latest update.sh (works even before git push)
    try:
        upload_update_script(ssh)
    except Exception as exc:
        print(f"[ERROR] upload update.sh failed: {exc}")
        ssh.close()
        return 1

    code = run(ssh, f"cd {REMOTE_DIR} && chmod +x deploy/update.sh && bash deploy/update.sh", timeout=2400)
    ssh.close()

    if code != 0:
        print(f"\n[ERROR] update failed with exit code {code}")
        return code

    print("\nDone.")
    print("URL: http://server.linooxel.com:3185")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except KeyboardInterrupt:
        print("\nCancelled.")
        code = 130
    except Exception as exc:
        print(f"\n[ERROR] {exc}")
        code = 1
    input("\nPress Enter to close...")
    raise SystemExit(code)
