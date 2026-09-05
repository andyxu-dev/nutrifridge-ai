import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DEFAULT_DATABASE_URL = "sqlite:///./nutrifridge.db"


def get_database_url() -> str:
    return os.getenv("SQLALCHEMY_DATABASE_URL", DEFAULT_DATABASE_URL)


def get_engine_kwargs(database_url: str) -> dict:
    if database_url.startswith("sqlite:"):
        return {"connect_args": {"check_same_thread": False}}
    return {}


SQLALCHEMY_DATABASE_URL = get_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    **get_engine_kwargs(SQLALCHEMY_DATABASE_URL),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
