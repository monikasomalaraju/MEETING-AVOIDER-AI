from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = Path(__file__).resolve().parent.parent #changed


DATABASE_URL = f"sqlite:///{str(BASE_DIR / 'meeting.db')}"


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


Base = declarative_base()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return any(row[1] == column_name for row in rows)


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table_name},
    ).fetchone()
    return row is not None


def apply_sqlite_migrations() -> None:
    """
    Lightweight column migrations for existing SQLite databases created by
    older versions of this app. Must be called AFTER Base.metadata.create_all()
    so the tables already exist (this is called explicitly from main.py —
    it intentionally does NOT run automatically on import, since that used
    to run before the tables existed on a fresh database and crashed with
    "no such table: users").
    """
    with engine.begin() as conn:
        if _table_exists(conn, "users") and not _column_exists(conn, "users", "created_at"):
            conn.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))

        if _table_exists(conn, "users"):
            for col, coltype in (
                ("phone", "VARCHAR"), ("organization", "VARCHAR"), ("department", "VARCHAR"),
                ("role", "VARCHAR"), ("bio", "TEXT"), ("notify_email", "BOOLEAN"),
                ("last_login", "DATETIME"),
            ):
                if not _column_exists(conn, "users", col):
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {coltype}"))

        if _table_exists(conn, "meetings"):
            if not _column_exists(conn, "meetings", "created_at"):
                conn.execute(text("ALTER TABLE meetings ADD COLUMN created_at DATETIME"))

            if not _column_exists(conn, "meetings", "participants"):
                conn.execute(text("ALTER TABLE meetings ADD COLUMN participants VARCHAR"))

            if not _column_exists(conn, "meetings", "updated_at"):
                conn.execute(text("ALTER TABLE meetings ADD COLUMN updated_at DATETIME"))

            if not _column_exists(conn, "meetings", "reminder_sent"):
                conn.execute(text("ALTER TABLE meetings ADD COLUMN reminder_sent BOOLEAN DEFAULT 0"))

        if _table_exists(conn, "users") and not _column_exists(conn, "users", "updated_at"):
            conn.execute(text("ALTER TABLE users ADD COLUMN updated_at DATETIME"))

        if _table_exists(conn, "transcripts") and not _column_exists(conn, "transcripts", "duration"):
            conn.execute(text("ALTER TABLE transcripts ADD COLUMN duration VARCHAR"))

        if _table_exists(conn, "summaries"):
            for col in ("executive_summary", "deadlines", "risks", "next_steps", "keywords", "category", "outcome"):
                if not _column_exists(conn, "summaries", col):
                    conn.execute(text(f"ALTER TABLE summaries ADD COLUMN {col} TEXT"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
