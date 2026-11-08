from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, select

from app.api.deps import OwnedListener, SessionDep
from app.models.log import ListenerLog, LogKind, LogLevel
from app.models.payment import Payment
from app.schemas.log import LogOut, LogPage

router = APIRouter(prefix="/listeners", tags=["logs"])


@router.get("/{listener_id}/logs", response_model=LogPage)
async def get_logs(
    listener: OwnedListener,
    session: SessionDep,
    before_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    level: Literal["info", "warning", "error"] | None = None,
    kind: Literal["message", "event"] | None = None,
):
    query = select(ListenerLog).where(ListenerLog.listener_id == listener.id)
    if before_id is not None:
        query = query.where(ListenerLog.id < before_id)
    if level is not None:
        query = query.where(ListenerLog.level == level)
    if kind is not None:
        query = query.where(ListenerLog.kind == kind)
    rows = list(
        (await session.scalars(query.order_by(ListenerLog.id.desc()).limit(limit + 1))).all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        LogOut(
            id=row.id,
            kind=str(row.kind),
            level=str(row.level),
            text=row.text,
            update_id=row.update_id,
            message_id=row.message_id,
            edited_at=row.edited_at,
            parsed_count=row.parsed_count,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return LogPage(items=items, next_before_id=items[-1].id if has_more and items else None)


@router.delete("/{listener_id}/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_log(
    log_id: int,
    listener: OwnedListener,
    session: SessionDep,
):
    log = await session.get(ListenerLog, log_id)
    if log is None or log.listener_id != listener.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")

    if log.kind == LogKind.MESSAGE:
        if log.message_id is not None:
            await session.execute(
                delete(Payment).where(
                    Payment.listener_id == listener.id,
                    Payment.message_id == log.message_id,
                )
            )
        elif log.update_id is not None:
            await session.execute(
                delete(Payment).where(
                    Payment.listener_id == listener.id,
                    Payment.update_id == log.update_id,
                )
            )
        await session.delete(log)
        session.add(
            ListenerLog(
                listener_id=listener.id,
                kind=LogKind.EVENT,
                level=LogLevel.INFO,
                text="Message removed from the app",
            )
        )
    else:
        await session.delete(log)

    await session.commit()
