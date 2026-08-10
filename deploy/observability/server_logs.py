"""
Local Grafana + SSH tunnel to server Loki (uses .deploy.env like update-server).

  py -3 deploy/observability/server_logs.py start
  py -3 deploy/observability/server_logs.py stop
"""

from __future__ import annotations

import io
import json
import os
import select
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("[ERROR] pip install paramiko")
    raise SystemExit(1)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
OBS = ROOT / "tools" / "observability"
PID_FILE = OBS / "pids-server-logs.json"
LOCAL_LOKI_PORT = 3100
REMOTE_LOKI_HOST = "127.0.0.1"
REMOTE_LOKI_PORT = 3100


def load_deploy_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for key in ("PMAS_SSH_HOST", "PMAS_SSH_PORT", "PMAS_SSH_USER", "PMAS_SSH_PASS", "PMAS_REMOTE_DIR"):
        if os.environ.get(key):
            out[key] = os.environ[key].strip()
    deploy_env = ROOT / ".deploy.env"
    if deploy_env.exists():
        for line in deploy_env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            if k not in out:
                out[k] = v.strip().strip('"').strip("'")
    return out


def read_pids() -> dict:
    if not PID_FILE.exists():
        return {}
    try:
        return json.loads(PID_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_pids(data: dict) -> None:
    OBS.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def kill_pid(pid: int | None, label: str) -> None:
    if not pid:
        return
    try:
        import psutil  # optional
        p = psutil.Process(pid)
        for child in p.children(recursive=True):
            child.kill()
        p.kill()
        print(f"  stopped {label} (pid={pid})")
    except ImportError:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
            print(f"  stopped {label} (pid={pid})")
        else:
            os.kill(pid, 9)
            print(f"  stopped {label} (pid={pid})")
    except Exception as exc:
        print(f"  [warn] could not stop {label} pid={pid}: {exc}")


def kill_port(port: int) -> None:
    if sys.platform != "win32":
        return
    try:
        out = subprocess.check_output(
            ["netstat", "-ano", "-p", "tcp"],
            text=True,
            errors="replace",
        )
        for line in out.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    kill_pid(int(parts[-1]), f"listener :{port}")
    except Exception:
        pass


def tunnel_worker(transport: paramiko.Transport, client_sock: socket.socket, host: str, port: int) -> None:
    try:
        chan = transport.open_channel("direct-tcpip", (host, port), client_sock.getpeername())
    except Exception:
        client_sock.close()
        return
    if chan is None:
        client_sock.close()
        return

    try:
        while True:
            r, _, _ = select.select([client_sock, chan], [], [], 1.0)
            if client_sock in r:
                data = client_sock.recv(4096)
                if not data:
                    break
                chan.send(data)
            if chan in r:
                data = chan.recv(4096)
                if not data:
                    break
                client_sock.send(data)
    finally:
        chan.close()
        client_sock.close()


def run_tunnel_daemon() -> None:
    cfg = load_deploy_env()
    host = cfg.get("PMAS_SSH_HOST", "server.linooxel.com")
    port = int(cfg.get("PMAS_SSH_PORT", "185"))
    user = cfg.get("PMAS_SSH_USER", "root")
    password = cfg.get("PMAS_SSH_PASS", "")
    if not password:
        print("[ERROR] PMAS_SSH_PASS missing in .deploy.env")
        raise SystemExit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"SSH connect {user}@{host}:{port} ...")
    client.connect(
        host,
        port=port,
        username=user,
        password=password,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
        banner_timeout=60,
        auth_timeout=60,
    )
    transport = client.get_transport()
    if transport is None:
        print("[ERROR] SSH transport failed")
        raise SystemExit(1)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", LOCAL_LOKI_PORT))
    sock.listen(32)
    print(f"Tunnel listening 127.0.0.1:{LOCAL_LOKI_PORT} -> server {REMOTE_LOKI_HOST}:{REMOTE_LOKI_PORT}")

    try:
        while True:
            client_sock, _ = sock.accept()
            t = threading.Thread(
                target=tunnel_worker,
                args=(transport, client_sock, REMOTE_LOKI_HOST, REMOTE_LOKI_PORT),
                daemon=True,
            )
            t.start()
    finally:
        sock.close()
        client.close()


def wait_loki(timeout_sec: int = 45) -> bool:
    url = f"http://127.0.0.1:{LOCAL_LOKI_PORT}/ready"
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                if resp.status == 200:
                    body = resp.read().decode("utf-8", errors="replace")
                    if "ready" in body.lower():
                        return True
        except (urllib.error.URLError, OSError, TimeoutError):
            pass
        time.sleep(1)
    return False


def list_loki_services() -> list[str]:
    """Return compose_service label values from Loki (empty if none yet)."""
    url = f"http://127.0.0.1:{LOCAL_LOKI_PORT}/loki/api/v1/label/compose_service/values"
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
            return list(data.get("data") or [])
    except Exception:
        return []


def poke_app_for_logs() -> None:
    """Hit public health so api/gateway emit a log line."""
    for url in (
        "http://server.linooxel.com:3185/health",
        "http://server.linooxel.com:3185/api/v1/auth/status",
    ):
        try:
            urllib.request.urlopen(url, timeout=8).read(200)
            print(f"      poked {url}")
        except Exception as exc:
            print(f"      [warn] poke failed {url}: {exc}")


def cmd_stop() -> int:
    print("Stopping server logs viewer...")
    pids = read_pids()
    kill_pid(pids.get("tunnel"), "SSH tunnel")
    kill_pid(pids.get("grafana"), "Grafana")

    ps1 = ROOT / "deploy" / "observability" / "stop-grafana-only.ps1"
    if ps1.exists():
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1)],
            cwd=str(ROOT),
            capture_output=True,
        )

    if PID_FILE.exists():
        PID_FILE.unlink()
    grafana_pid = OBS / "pids-grafana.json"
    if grafana_pid.exists():
        grafana_pid.unlink(missing_ok=True)

    kill_port(LOCAL_LOKI_PORT)
    kill_port(3186)
    print("Done.")
    return 0


def cmd_start() -> int:
    cmd_stop()

    cfg = load_deploy_env()
    if not cfg.get("PMAS_SSH_PASS"):
        print("[ERROR] Set PMAS_SSH_PASS in .deploy.env (same as update-server.bat)")
        return 1

    print("[1/3] Starting SSH tunnel (paramiko, background)...")
    tunnel_log = OBS / "tunnel.log"
    OBS.mkdir(parents=True, exist_ok=True)
    tunnel_log.write_text("", encoding="utf-8")

    creationflags = 0
    if sys.platform == "win32":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS

    proc = subprocess.Popen(
        [sys.executable, __file__, "--tunnel-daemon"],
        cwd=str(ROOT),
        stdout=open(tunnel_log, "a", encoding="utf-8"),
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
    )

    pids = {"tunnel": proc.pid}
    write_pids(pids)

    print("[2/3] Waiting for server Loki via tunnel...")
    if not wait_loki():
        print("[ERROR] Loki not reachable on 127.0.0.1:3100")
        print("        - Run update-server.bat once (needs Loki on server)")
        print("        - Check tunnel log:", tunnel_log)
        if tunnel_log.exists():
            tail = tunnel_log.read_text(encoding="utf-8", errors="replace")[-2000:]
            if tail.strip():
                print("--- tunnel.log (tail) ---")
                print(tail)
        cmd_stop()
        return 1
    print("      Loki ready.")

    print("      Generating a few server requests (so logs appear)...")
    poke_app_for_logs()
    time.sleep(3)
    services = list_loki_services()
    if services:
        print(f"      Loki labels compose_service = {', '.join(services)}")
    else:
        print("      [WARN] No compose_service labels yet.")
        print("             Wait ~30s, open Grafana Explore, or re-run update-server.bat")
        print("             so Loki+Promtail are running on the server.")

    print("[3/3] Starting local Grafana...")
    ps1 = ROOT / "deploy" / "observability" / "start-grafana-only.ps1"
    r = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ps1),
            "-LokiUrl",
            f"http://127.0.0.1:{LOCAL_LOKI_PORT}",
        ],
        cwd=str(ROOT),
    )
    if r.returncode != 0:
        cmd_stop()
        return r.returncode

    grafana_pid_file = OBS / "pids-grafana.json"
    if grafana_pid_file.exists():
        try:
            g = json.loads(grafana_pid_file.read_text(encoding="utf-8"))
            pids["grafana"] = g.get("grafana")
            write_pids(pids)
        except Exception:
            pass

    print()
    print("Ready.")
    print("  Grafana:  http://127.0.0.1:3186")
    print("  Login:    admin / admin  (or GRAFANA_ADMIN_* in .env)")
    print("  Dashboard: Dashboards → PMAS → PMAS Logs")
    print("  Explore:   {compose_service=\"api\"} |= \"http_request\"")
    print("  Stop:      stop-server-logs.bat")
    return 0


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "--tunnel-daemon":
        run_tunnel_daemon()
        return 0
    if len(sys.argv) >= 2 and sys.argv[1] == "stop":
        return cmd_stop()
    if len(sys.argv) >= 2 and sys.argv[1] == "start":
        return cmd_start()
    print("Usage: server_logs.py start|stop")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
