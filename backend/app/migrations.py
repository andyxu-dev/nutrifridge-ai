from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine


LEGACY_COLUMN_MIGRATIONS = [
    ("users", "health_conditions", "ALTER TABLE users ADD COLUMN health_conditions TEXT"),
    ("users", "allergies", "ALTER TABLE users ADD COLUMN allergies TEXT"),
    ("users", "strict_avoid_foods", "ALTER TABLE users ADD COLUMN strict_avoid_foods TEXT"),
    ("users", "macro_strategy", "ALTER TABLE users ADD COLUMN macro_strategy VARCHAR"),
    ("users", "custom_calorie_target", "ALTER TABLE users ADD COLUMN custom_calorie_target FLOAT"),
    ("users", "custom_protein_g", "ALTER TABLE users ADD COLUMN custom_protein_g FLOAT"),
    ("users", "custom_carbs_g", "ALTER TABLE users ADD COLUMN custom_carbs_g FLOAT"),
    ("users", "custom_fat_g", "ALTER TABLE users ADD COLUMN custom_fat_g FLOAT"),
    ("meal_logs", "source", "ALTER TABLE meal_logs ADD COLUMN source VARCHAR"),
    ("meal_logs", "notes", "ALTER TABLE meal_logs ADD COLUMN notes TEXT"),
    (
        "meal_logs",
        "assistant_confirmation_token",
        "ALTER TABLE meal_logs ADD COLUMN assistant_confirmation_token VARCHAR",
    ),
    ("inventory", "location_id", "ALTER TABLE inventory ADD COLUMN location_id INTEGER"),
]


def _table_exists(conn: Connection, table_name: str) -> bool:
    return bool(inspect(conn).has_table(table_name))


def _column_exists(conn: Connection, table_name: str, column_name: str) -> bool:
    if not _table_exists(conn, table_name):
        raise RuntimeError(f"Expected table '{table_name}' does not exist")

    inspector = inspect(conn)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _add_column_if_missing(
    conn: Connection,
    table_name: str,
    column_name: str,
    ddl: str,
) -> bool:
    if _column_exists(conn, table_name, column_name):
        return False

    conn.execute(text(ddl))
    conn.commit()
    return True


def _ensure_confirmation_token_index(conn: Connection) -> None:
    conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "ix_meal_logs_assistant_confirmation_token "
            "ON meal_logs (assistant_confirmation_token) "
            "WHERE assistant_confirmation_token IS NOT NULL"
        )
    )
    conn.commit()


def migrate_db(engine: Engine) -> None:
    """Apply local SQLite schema migrations that predate the current models."""
    with engine.connect() as conn:
        for table_name, column_name, ddl in LEGACY_COLUMN_MIGRATIONS:
            _add_column_if_missing(conn, table_name, column_name, ddl)
        _ensure_confirmation_token_index(conn)
