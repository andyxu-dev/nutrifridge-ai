"""
Run the backend integration QA harness against a disposable SQLite database.

This starts only its own local Uvicorn child process, points it at a temporary
database, runs qa_check.py, and cleans up the temporary environment afterwards.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


def build_sqlite_url(db_path: Path) -> str:
    """Return a SQLAlchemy SQLite URL for an absolute filesystem path."""
    absolute_path = db_path.resolve()
    return f"sqlite:///{absolute_path.as_posix()}"


def build_qa_base_url(port: int) -> str:
    return f"http://127.0.0.1:{port}"


def build_child_env(database_url: str, qa_base_url: str) -> dict[str, str]:
    env = os.environ.copy()
    env["SQLALCHEMY_DATABASE_URL"] = database_url
    env["NUTRIFRIDGE_QA_BASE_URL"] = qa_base_url
    return env


def select_unused_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_health(base_url: str, process: subprocess.Popen, timeout_seconds: float = 30.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    health_url = f"{base_url}/health"

    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"QA server exited before readiness with code {process.returncode}")
        try:
            with urllib.request.urlopen(health_url, timeout=1) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(0.25)

    raise TimeoutError(f"QA server did not become ready within {timeout_seconds:.0f}s")


def terminate_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def main() -> int:
    backend_dir = Path(__file__).resolve().parent
    server_process: subprocess.Popen | None = None

    with tempfile.TemporaryDirectory(prefix="nutrifridge-qa-") as temp_dir:
        db_path = Path(temp_dir) / "nutrifridge_qa.db"
        database_url = build_sqlite_url(db_path)
        port = select_unused_port()
        qa_base_url = build_qa_base_url(port)
        child_env = build_child_env(database_url, qa_base_url)

        print(f"Using temporary QA database: {db_path}")
        print(f"Starting QA server at: {qa_base_url}")

        try:
            server_process = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                cwd=backend_dir,
                env=child_env,
            )
            wait_for_health(qa_base_url, server_process)

            qa_result = subprocess.run(
                [sys.executable, "qa_check.py"],
                cwd=backend_dir,
                env=child_env,
                check=False,
            )
            print(f"QA completed with exit code: {qa_result.returncode}")
            return int(qa_result.returncode)
        except Exception as exc:
            print(f"Safe QA runner failed: {exc}", file=sys.stderr)
            return 1
        finally:
            if server_process is not None:
                terminate_process(server_process)
                print("QA server process stopped.")
            print("Temporary QA environment cleaned up.")


if __name__ == "__main__":
    raise SystemExit(main())
