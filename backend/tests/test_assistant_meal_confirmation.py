import json
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import assistant as assistant_models  # noqa: F401
from app.models import household as household_models  # noqa: F401
from app.models import inventory as inventory_models  # noqa: F401
from app.models import location as location_models  # noqa: F401
from app.models import nutrition_log as nutrition_models  # noqa: F401
from app.models import user as user_models  # noqa: F401
from app.models import waste_log as waste_log_models  # noqa: F401
from app.models.assistant import Conversation, ConversationMessage
from app.models.nutrition_log import DailyLog, MealLog
from app.models.user import User
from app.routers import assistant
from app.services import tool_service
from app.services.tool_service import execute_tool


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        db.add(
            User(
                name="QA User",
                height_cm=175.0,
                weight_kg=75.0,
                age=30,
                sex="male",
                activity_level="moderate",
                goal="maintenance",
            )
        )
        db.commit()
        yield db
    finally:
        db.close()


def _preview() -> dict:
    return {
        "meal_type": "snack",
        "meal_name": "Confirmed Toast",
        "calories": 123.0,
        "protein_g": 10.0,
        "carbs_g": 12.0,
        "fat_g": 3.0,
        "notes": "server preview",
        "ingredients_used": [],
    }


def _create_pending_confirmation(db, conversation_id: str, token: str) -> None:
    db.add(Conversation(conversation_id=conversation_id))
    db.add(
        ConversationMessage(
            conversation_id=conversation_id,
            role="assistant",
            content="Please confirm this meal log.",
            tool_calls_summary=json.dumps(
                [
                    {
                        "tool": "log_meal",
                        "summary": "Ready to log",
                        "requires_confirmation": True,
                        "pending_action_token": token,
                        "status": "pending",
                        "meal_log_preview": _preview(),
                    }
                ]
            ),
        )
    )
    db.commit()


def _confirm(db, conversation_id: str, token: str):
    return assistant.chat(
        assistant.ChatRequest(
            message="yes",
            conversation_id=conversation_id,
            mode="agent",
            confirm_log_meal=True,
            confirmation_token=token,
        ),
        db=db,
    )


def _today_log(db) -> DailyLog | None:
    return db.query(DailyLog).filter(DailyLog.date == date.today()).first()


def _meal_count(db) -> int:
    return db.query(MealLog).count()


def _pending_call(db, conversation_id: str) -> dict:
    row = (
        db.query(ConversationMessage)
        .filter(
            ConversationMessage.conversation_id == conversation_id,
            ConversationMessage.tool_calls_summary.is_not(None),
        )
        .first()
    )
    assert row is not None
    return json.loads(row.tool_calls_summary)[0]


def test_preview_generates_pending_server_token_and_no_meal_log(db_session, monkeypatch):
    preview = _preview()

    def fake_agent_turn(**_kwargs):
        return {
            "assistant_message": "Please confirm this meal.",
            "retrieved_sources": [],
            "tool_calls": [
                {
                    "tool": "log_meal",
                    "summary": "Ready to log",
                    "requires_confirmation": True,
                }
            ],
            "meal_log_preview": preview,
            "requires_confirmation": True,
            "warnings": [],
            "grounded": True,
        }

    monkeypatch.setattr(assistant, "_run_agent_turn", fake_agent_turn)

    response = assistant.chat(
        assistant.ChatRequest(message="log toast", mode="agent"),
        db=db_session,
    )

    assert response.requires_confirmation is True
    assert response.pending_confirmation_token
    assert _meal_count(db_session) == 0

    call = _pending_call(db_session, response.conversation_id)
    assert call["pending_action_token"] == response.pending_confirmation_token
    assert call["status"] == "pending"
    assert call["meal_log_preview"] == preview


def test_meal_logs_schema_has_unique_confirmation_token_index(db_session):
    indexes = inspect(db_session.bind).get_indexes("meal_logs")

    matching = [
        index
        for index in indexes
        if index["name"] == "ix_meal_logs_assistant_confirmation_token"
    ]

    assert matching
    assert matching[0]["unique"] == 1
    assert matching[0]["column_names"] == ["assistant_confirmation_token"]


def test_valid_token_creates_one_meal_updates_daily_log_and_consumes_pending(
    db_session,
):
    conv_id = "confirm-valid"
    token = "token-valid"
    _create_pending_confirmation(db_session, conv_id, token)

    response = _confirm(db_session, conv_id, token)

    assert response.warnings == []
    meals = db_session.query(MealLog).all()
    assert len(meals) == 1
    assert meals[0].assistant_confirmation_token == token

    today_log = _today_log(db_session)
    assert today_log is not None
    assert today_log.calories_consumed == 123.0
    assert today_log.protein_consumed_g == 10.0
    assert today_log.carbs_consumed_g == 12.0
    assert today_log.fat_consumed_g == 3.0

    call = _pending_call(db_session, conv_id)
    assert call["status"] == "consumed"
    assert call["meal_log_id"] == meals[0].id


def test_same_token_submitted_twice_is_rejected_without_duplicate_write(db_session):
    conv_id = "confirm-duplicate"
    token = "token-duplicate"
    _create_pending_confirmation(db_session, conv_id, token)

    _confirm(db_session, conv_id, token)
    second = _confirm(db_session, conv_id, token)

    assert "invalid_or_consumed_confirmation" in second.warnings
    assert _meal_count(db_session) == 1
    today_log = _today_log(db_session)
    assert today_log is not None
    assert today_log.calories_consumed == 123.0
    assert today_log.protein_consumed_g == 10.0


def test_pending_token_with_existing_meal_is_consumed_without_duplicate_write(
    db_session,
):
    conv_id = "confirm-crash-retry"
    token = "token-crash-retry"
    _create_pending_confirmation(db_session, conv_id, token)

    existing = execute_tool(
        "log_meal",
        _preview(),
        db_session,
        confirmed_log_meal=True,
        assistant_confirmation_token=token,
    )
    assert existing["error"] is None
    assert _pending_call(db_session, conv_id)["status"] == "pending"

    response = _confirm(db_session, conv_id, token)

    assert "duplicate_confirmation_token" in response.warnings
    assert _meal_count(db_session) == 1
    today_log = _today_log(db_session)
    assert today_log is not None
    assert today_log.calories_consumed == 123.0
    assert _pending_call(db_session, conv_id)["status"] == "consumed"


def test_invalid_token_does_not_write(db_session):
    _create_pending_confirmation(db_session, "confirm-invalid", "real-token")

    response = _confirm(db_session, "confirm-invalid", "wrong-token")

    assert "invalid_or_consumed_confirmation" in response.warnings
    assert _meal_count(db_session) == 0


def test_generic_read_tool_failure_does_not_rollback_caller_state(
    db_session,
    monkeypatch,
):
    conversation = Conversation(conversation_id="caller-state")
    db_session.add(conversation)
    db_session.flush()

    def fail_read_tool(_db):
        raise RuntimeError("simulated read failure")

    monkeypatch.setattr(tool_service, "_list_inventory", fail_read_tool)

    result = execute_tool("list_inventory", {}, db_session)

    assert result["error"] == "Tool execution failed. Please try again."
    assert (
        db_session.query(Conversation)
        .filter(Conversation.conversation_id == "caller-state")
        .first()
        is not None
    )


def test_failed_final_commit_does_not_persist_meal_with_reusable_pending_token(
    db_session,
    monkeypatch,
):
    conv_id = "confirm-failed-commit"
    token = "token-failed-commit"
    _create_pending_confirmation(db_session, conv_id, token)

    def fail_commit():
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(db_session, "commit", fail_commit)

    with pytest.raises(HTTPException):
        _confirm(db_session, conv_id, token)

    db_session.rollback()
    assert _meal_count(db_session) == 0
    assert _pending_call(db_session, conv_id)["status"] == "pending"


def test_database_uniqueness_prevents_duplicate_confirmation_token_writes(
    db_session,
):
    daily_log = DailyLog(
        user_id=1,
        date=date.today(),
        calories_consumed=0.0,
        protein_consumed_g=0.0,
        carbs_consumed_g=0.0,
        fat_consumed_g=0.0,
    )
    db_session.add(daily_log)
    db_session.flush()

    first = MealLog(
        daily_log_id=daily_log.id,
        meal_type="snack",
        meal_name="First",
        calories=1.0,
        protein_g=1.0,
        carbs_g=1.0,
        fat_g=1.0,
        assistant_confirmation_token="unique-token",
    )
    second = MealLog(
        daily_log_id=daily_log.id,
        meal_type="snack",
        meal_name="Second",
        calories=1.0,
        protein_g=1.0,
        carbs_g=1.0,
        fat_g=1.0,
        assistant_confirmation_token="unique-token",
    )

    db_session.add(first)
    db_session.commit()
    db_session.add(second)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    assert _meal_count(db_session) == 1


def test_manual_meal_logs_without_confirmation_token_remain_compatible(db_session):
    daily_log = DailyLog(
        user_id=1,
        date=date.today(),
        calories_consumed=0.0,
        protein_consumed_g=0.0,
        carbs_consumed_g=0.0,
        fat_consumed_g=0.0,
    )
    db_session.add(daily_log)
    db_session.flush()

    db_session.add_all(
        [
            MealLog(
                daily_log_id=daily_log.id,
                meal_type="lunch",
                meal_name="Manual A",
                calories=100.0,
                protein_g=10.0,
                carbs_g=10.0,
                fat_g=3.0,
                source="manual",
            ),
            MealLog(
                daily_log_id=daily_log.id,
                meal_type="dinner",
                meal_name="Manual B",
                calories=200.0,
                protein_g=20.0,
                carbs_g=20.0,
                fat_g=6.0,
                source="manual",
            ),
        ]
    )
    db_session.commit()

    assert _meal_count(db_session) == 2


def test_confirmed_tool_duplicate_token_returns_controlled_error(db_session):
    token = "tool-duplicate-token"
    payload = _preview()

    first = execute_tool(
        "log_meal",
        payload,
        db_session,
        confirmed_log_meal=True,
        assistant_confirmation_token=token,
    )
    second = execute_tool(
        "log_meal",
        payload,
        db_session,
        confirmed_log_meal=True,
        assistant_confirmation_token=token,
    )

    assert first["error"] is None
    assert second["error"] == "duplicate_confirmation_token"
    assert _meal_count(db_session) == 1
