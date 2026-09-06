import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.database import Base
from app.migrations import (
    _add_column_if_missing,
    _ensure_confirmation_token_index,
    migrate_db,
)
from app.models import assistant as assistant_models  # noqa: F401
from app.models import household as household_models  # noqa: F401
from app.models import inventory as inventory_models  # noqa: F401
from app.models import location as location_models  # noqa: F401
from app.models import nutrition_log as nutrition_models  # noqa: F401
from app.models import user as user_models  # noqa: F401
from app.models import waste_log as waste_log_models  # noqa: F401


@pytest.fixture()
def engine_factory(tmp_path):
    engines = []

    def create_engine_for_test(name: str = "migration.db") -> Engine:
        engine = create_engine(f"sqlite:///{tmp_path / name}")
        engines.append(engine)
        return engine

    try:
        yield create_engine_for_test
    finally:
        for engine in engines:
            engine.dispose()


def _column_names(engine: Engine, table_name: str) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(table_name)}


def test_existing_column_is_no_op(engine_factory):
    engine = engine_factory()
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, allergies TEXT)"))
        conn.commit()

        added = _add_column_if_missing(
            conn,
            "users",
            "allergies",
            "ALTER TABLE users ADD COLUMN allergies TEXT",
        )

    assert added is False
    assert "allergies" in _column_names(engine, "users")


def test_missing_legacy_column_is_added(engine_factory):
    engine = engine_factory()
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        conn.commit()

        added = _add_column_if_missing(
            conn,
            "users",
            "allergies",
            "ALTER TABLE users ADD COLUMN allergies TEXT",
        )

    assert added is True
    assert "allergies" in _column_names(engine, "users")


def test_missing_expected_table_raises(engine_factory):
    engine = engine_factory()
    with engine.connect() as conn:
        with pytest.raises(RuntimeError, match="Expected table 'users' does not exist"):
            _add_column_if_missing(
                conn,
                "users",
                "allergies",
                "ALTER TABLE users ADD COLUMN allergies TEXT",
            )


def test_malformed_migration_sql_raises(engine_factory):
    engine = engine_factory()
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        conn.commit()

        with pytest.raises(SQLAlchemyError):
            _add_column_if_missing(
                conn,
                "users",
                "allergies",
                "ALTER TABLE users ADD COLUMN",
            )


def test_repeated_legacy_migration_is_idempotent(engine_factory):
    engine = engine_factory()
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE meal_logs (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE inventory (id INTEGER PRIMARY KEY)"))
        conn.commit()

    migrate_db(engine)
    migrate_db(engine)

    assert "strict_avoid_foods" in _column_names(engine, "users")
    assert "assistant_confirmation_token" in _column_names(engine, "meal_logs")
    assert "location_id" in _column_names(engine, "inventory")


def test_fresh_modern_metadata_and_migration_succeed(engine_factory):
    engine = engine_factory()

    Base.metadata.create_all(bind=engine)
    migrate_db(engine)

    assert "custom_fat_g" in _column_names(engine, "users")
    assert "notes" in _column_names(engine, "meal_logs")
    assert "location_id" in _column_names(engine, "inventory")


def test_confirmation_token_unique_index_exists_after_migration(engine_factory):
    engine = engine_factory()

    Base.metadata.create_all(bind=engine)
    migrate_db(engine)

    indexes = inspect(engine).get_indexes("meal_logs")
    matching = [
        index
        for index in indexes
        if index["name"] == "ix_meal_logs_assistant_confirmation_token"
    ]

    assert matching
    assert matching[0]["unique"] == 1
    assert matching[0]["column_names"] == ["assistant_confirmation_token"]


def test_duplicate_legacy_confirmation_tokens_make_index_creation_fail(engine_factory):
    engine = engine_factory()
    with engine.connect() as conn:
        conn.execute(
            text(
                "CREATE TABLE meal_logs ("
                "id INTEGER PRIMARY KEY, "
                "assistant_confirmation_token VARCHAR"
                ")"
            )
        )
        conn.execute(
            text(
                "INSERT INTO meal_logs (assistant_confirmation_token) "
                "VALUES ('duplicate-token')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO meal_logs (assistant_confirmation_token) "
                "VALUES ('duplicate-token')"
            )
        )
        conn.commit()

        with pytest.raises(SQLAlchemyError):
            _ensure_confirmation_token_index(conn)
