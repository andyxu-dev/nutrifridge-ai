from app.database import DEFAULT_DATABASE_URL, get_database_url, get_engine_kwargs
from run_qa_safe import build_child_env, build_qa_base_url, build_sqlite_url


def test_get_database_url_uses_default_when_env_absent(monkeypatch):
    monkeypatch.delenv("SQLALCHEMY_DATABASE_URL", raising=False)

    assert get_database_url() == "sqlite:///./nutrifridge.db"
    assert get_database_url() == DEFAULT_DATABASE_URL


def test_get_database_url_uses_env_override(monkeypatch):
    url = "sqlite:////tmp/nutrifridge-custom.db"
    monkeypatch.setenv("SQLALCHEMY_DATABASE_URL", url)

    assert get_database_url() == url


def test_sqlite_engine_kwargs_keep_check_same_thread_false():
    kwargs = get_engine_kwargs("sqlite:////tmp/nutrifridge-custom.db")

    assert kwargs == {"connect_args": {"check_same_thread": False}}


def test_non_sqlite_engine_kwargs_do_not_include_sqlite_connect_args():
    assert get_engine_kwargs("postgresql://user:pass@localhost/nutrifridge") == {}


def test_safe_runner_builds_absolute_sqlite_url(tmp_path):
    db_path = tmp_path / "nutrifridge_qa.db"

    assert build_sqlite_url(db_path) == f"sqlite:///{db_path.resolve().as_posix()}"


def test_safe_runner_builds_qa_base_url_from_port():
    assert build_qa_base_url(54321) == "http://127.0.0.1:54321"


def test_safe_runner_child_env_sets_database_and_base_url(monkeypatch):
    monkeypatch.setenv("EXISTING_SETTING", "preserved")

    env = build_child_env(
        "sqlite:////tmp/nutrifridge_qa.db",
        "http://127.0.0.1:54321",
    )

    assert env["SQLALCHEMY_DATABASE_URL"] == "sqlite:////tmp/nutrifridge_qa.db"
    assert env["NUTRIFRIDGE_QA_BASE_URL"] == "http://127.0.0.1:54321"
    assert env["EXISTING_SETTING"] == "preserved"
