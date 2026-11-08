import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import case, func, select

from app.api.deps import CurrentUser, OwnedListener, SessionDep
from app.core.security import (
    encrypt_token,
    token_fingerprint,
    token_hint,
)
from app.models.listener import BotListener, ListenerStatus
from app.models.log import ListenerLog, LogKind, LogLevel
from app.models.payment import Payment
from app.schemas.listener import ListenerCreate, ListenerOut, ListenerUpdate
from app.services.poller import ListenerStartError, PollerManager

# Define the API router for listener-related endpoints
router = APIRouter(prefix="/listeners", tags=["listeners"])


# Helper function to map a BotListener database model and its computed
# statistics to the ListenerOut Pydantic response schema
def _to_out(
    listener: BotListener,
    *,
    payment_count: int = 0,
    total_value: float = 0.0,
    total_usd: float = 0.0,
    last_activity_at: datetime | None = None,
) -> ListenerOut:
    # Return a ListenerOut instance populated with the listener's data and computed statistics
    return ListenerOut(
        id=listener.id,
        label=listener.label,
        channel_input=listener.channel_input,
        resolved_chat_id=listener.resolved_chat_id,
        chat_title=listener.chat_title,
        bot_username=listener.bot_username,
        status=str(listener.status),
        last_error=listener.last_error,
        last_error_at=listener.last_error_at,
        token_hint=listener.token_hint,
        created_at=listener.created_at,
        updated_at=listener.updated_at,
        payment_count=payment_count,
        total_value=total_value,
        total_usd=total_usd,
        last_activity_at=last_activity_at,
    )


# Helper function to query aggregate statistics for a specific listener:
# total payments parsed, totals per currency, and the latest log timestamp
async def _stats(session, listener_id: uuid.UUID) -> tuple[int, float, float, datetime | None]:
    # Query to count total payments and sum their values per currency for the given listener
    payment_row = (
        await session.execute(
            select(
                func.count(Payment.id),
                func.coalesce(
                    func.sum(case((Payment.currency == "SYP", Payment.value), else_=0)), 0
                ),
                func.coalesce(
                    func.sum(case((Payment.currency == "USD", Payment.value), else_=0)), 0
                ),
            ).where(Payment.listener_id == listener_id)
        )
    ).one()
    
    # Query to find the most recent log entry's creation time
    last_activity = await session.scalar(
        select(func.max(ListenerLog.created_at)).where(ListenerLog.listener_id == listener_id)
    )
    return (
        int(payment_row[0] or 0),
        float(payment_row[1] or 0),
        float(payment_row[2] or 0),
        last_activity,
    )


# Retrieves the PollerManager instance from the FastAPI application state,
# which manages background polling tasks
def _manager(request: Request) -> PollerManager:
    # Attempt to get the PollerManager from the application state; if not found,
    # raise a 503 Service Unavailable error
    manager = getattr(request.app.state, "manager", None)
    if manager is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Listener manager is not available",
        )
    # Return the PollerManager instance for use in starting/stopping listeners
    return manager


# GET endpoint to retrieve all listeners owned by the authenticated user
@router.get("", response_model=list[ListenerOut])
async def list_listeners(user: CurrentUser, session: SessionDep):
    # Fetch all listeners belonging to the current user, ordered by creation date
    listeners = list(
        (
            # Use a single query to fetch all listeners for the user,
            # ordered by creation date descending
            await session.scalars(
                select(BotListener)  # Select all columns from the BotListener table
                # Filter to only include listeners owned by the current user
                .where(BotListener.user_id == user.id)
                .order_by(BotListener.created_at.desc())
            )
        ).all()
    )
    if not listeners:
        return []

    # Extract the IDs of all retrieved listeners to use in subsequent queries for statistics
    ids = [listener.id for listener in listeners]
    
    # Batch fetch payment statistics for all retrieved listeners to avoid N+1 query issues
    payment_rows = (
        await session.execute(
            select(
                Payment.listener_id,
                Payment.currency,
                func.count(Payment.id),
                func.coalesce(func.sum(Payment.value), 0),
            )
            .where(Payment.listener_id.in_(ids))
            .group_by(Payment.listener_id, Payment.currency)
        )
    ).all()
    payments: dict[uuid.UUID, dict[str, float]] = {}
    for listener_id, currency, count, total in payment_rows:
        stats = payments.setdefault(listener_id, {"count": 0.0, "SYP": 0.0, "USD": 0.0})
        stats["count"] += int(count or 0)
        stats[currency or "SYP"] = stats.get(currency or "SYP", 0.0) + float(total or 0)
    
    # Batch fetch the last activity timestamp for all retrieved listeners
    log_rows = (
        await session.execute(
            select(ListenerLog.listener_id, func.max(ListenerLog.created_at))
            .where(ListenerLog.listener_id.in_(ids))
            .group_by(ListenerLog.listener_id)
        )
    ).all()
    activity = {row[0]: row[1] for row in log_rows}
    
    # Map the database models and grouped stats into the response schemas
    return [
        _to_out(
            listener,
            payment_count=int(payments.get(listener.id, {}).get("count", 0)),
            total_value=payments.get(listener.id, {}).get("SYP", 0.0),
            total_usd=payments.get(listener.id, {}).get("USD", 0.0),
            last_activity_at=activity.get(listener.id),
        )
        for listener in listeners
    ]


# POST endpoint to create a new listener configuration
@router.post("", response_model=ListenerOut, status_code=status.HTTP_201_CREATED)
async def create_listener(payload: ListenerCreate, user: CurrentUser, session: SessionDep):
    # Hash the token to check if another listener is already using it
    fingerprint = token_fingerprint(payload.bot_token)
    duplicate = await session.scalar(
        select(BotListener.id).where(BotListener.token_fingerprint == fingerprint)
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This bot token is already registered. Telegram allows one poller per token.",
        )
        
    # Create the listener model instance, securely encrypting the bot token
    listener = BotListener(
        user_id=user.id,
        label=payload.label,
        channel_input=payload.channel_input,
        token_encrypted=encrypt_token(payload.bot_token),
        token_fingerprint=fingerprint,
        token_hint=token_hint(payload.bot_token),
        status=ListenerStatus.STOPPED,
        parser_state={},
    )
    session.add(listener)
    await session.flush()  # Flush to generate the listener.id
    
    # Record an initial log event for the creation
    session.add(
        ListenerLog(
            listener_id=listener.id,
            kind=LogKind.EVENT,
            level=LogLevel.INFO,
            text="Listener created",
        )
    )
    await session.commit()
    await session.refresh(listener)
    return _to_out(listener)


# GET endpoint to fetch details and statistics for a specific listener owned by the user
@router.get("/{listener_id}", response_model=ListenerOut)
async def get_listener(listener: OwnedListener, session: SessionDep):
    # 'listener' is automatically fetched and verified by the 'OwnedListener' dependency
    count, total, total_usd, activity = await _stats(session, listener.id)
    return _to_out(
        listener,
        payment_count=count,
        total_value=total,
        total_usd=total_usd,
        last_activity_at=activity,
    )


# PATCH endpoint to update specific fields of an existing listener
@router.patch("/{listener_id}", response_model=ListenerOut)
async def update_listener(payload: ListenerUpdate, listener: OwnedListener, session: SessionDep):
    # Prevent modifications while the background task is actively running
    if listener.status == ListenerStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stop the listener before editing it",
        )
        
    fields = payload.model_fields_set
    
    # Update the display label if provided
    if "label" in fields:
        listener.label = payload.label

    # Update the target channel input
    if "channel_input" in fields and payload.channel_input:
        if payload.channel_input != listener.channel_input:
            listener.channel_input = payload.channel_input
            # Reset all resolved chat data and parser state since the target channel changed
            listener.resolved_chat_id = None
            listener.chat_title = None
            listener.parser_state = {}
            listener.last_error = None
            listener.last_error_at = None
            listener.status = ListenerStatus.STOPPED

    # Update the Telegram bot token
    if "bot_token" in fields and payload.bot_token:
        fingerprint = token_fingerprint(payload.bot_token)
        # Ensure the new token isn't registered to another listener
        duplicate = await session.scalar(
            select(BotListener.id).where(
                BotListener.token_fingerprint == fingerprint,
                BotListener.id != listener.id,
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This bot token is already registered.",
            )
            
        # Re-encrypt the new token and reset connection-related state
        listener.token_encrypted = encrypt_token(payload.bot_token)
        listener.token_fingerprint = fingerprint
        listener.token_hint = token_hint(payload.bot_token)
        listener.last_update_id = None
        listener.parser_state = {}
        listener.resolved_chat_id = None
        listener.chat_title = None
        listener.bot_username = None
        listener.last_error = None
        listener.last_error_at = None
        listener.status = ListenerStatus.STOPPED

    await session.commit()
    await session.refresh(listener)
    count, total, total_usd, activity = await _stats(session, listener.id)
    return _to_out(
        listener,
        payment_count=count,
        total_value=total,
        total_usd=total_usd,
        last_activity_at=activity,
    )


# DELETE endpoint to remove a listener and all its related data (due to cascade rules)
@router.delete("/{listener_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_listener(listener: OwnedListener, request: Request, session: SessionDep):
    manager = getattr(request.app.state, "manager", None)
    # Safely halt the background poller before deleting the record
    if manager is not None and listener.status == ListenerStatus.RUNNING:
        await manager.stop_listener(listener.id)
        
    await session.delete(listener)
    await session.commit()


# POST endpoint to start the background polling task for a specific listener
@router.post("/{listener_id}/start", response_model=ListenerOut)
async def start_listener(listener: OwnedListener, request: Request, session: SessionDep):
    manager = _manager(request)
    try:
        # Ask the PollerManager to spin up an async task for this listener
        await manager.start_listener(listener.id)
    except ListenerStartError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=error.message
        ) from error
        
    await session.refresh(listener)
    count, total, total_usd, activity = await _stats(session, listener.id)
    return _to_out(
        listener,
        payment_count=count,
        total_value=total,
        total_usd=total_usd,
        last_activity_at=activity,
    )


# POST endpoint to halt the background polling task for a specific listener
@router.post("/{listener_id}/stop", response_model=ListenerOut)
async def stop_listener(listener: OwnedListener, request: Request, session: SessionDep):
    manager = _manager(request)
    # Ask the PollerManager to cancel the running async task
    await manager.stop_listener(listener.id)
    
    await session.refresh(listener)
    count, total, total_usd, activity = await _stats(session, listener.id)
    return _to_out(
        listener,
        payment_count=count,
        total_value=total,
        total_usd=total_usd,
        last_activity_at=activity,
    )