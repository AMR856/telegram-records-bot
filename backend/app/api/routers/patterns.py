from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, OwnedListener, SessionDep
from app.models.parser_profile import ParserProfile
from app.schemas.pattern import (
    CopyProfileRequest,
    PatternPreviewGroup,
    PatternPreviewRequest,
    PatternPreviewResponse,
    PatternPreviewRow,
    PatternProfileOut,
    PatternProfileUpdate,
)
from app.services.pattern_engine import (
    default_export_columns,
    parse_pattern_lines,
    pattern_export_columns,
    resolve_row_cells,
)

router = APIRouter(prefix="/listeners", tags=["patterns"])
preview_router = APIRouter(prefix="/patterns", tags=["patterns"])


async def _get_listener_profile(session, listener_id):
    return await session.scalar(
        select(ParserProfile).where(ParserProfile.listener_id == listener_id)
    )


@preview_router.get("/profiles", response_model=list[PatternProfileOut])
async def list_parser_profiles(user: CurrentUser, session: SessionDep):
    profiles = await session.scalars(
        select(ParserProfile)
        .where(ParserProfile.user_id == user.id)
        .order_by(ParserProfile.created_at)
    )
    return list(profiles.all())


@router.get(
    "/{listener_id}/parser-profile",
    response_model=PatternProfileOut | None,
)
async def get_listener_parser_profile(
    listener: OwnedListener,
    session: SessionDep,
):
    return await _get_listener_profile(session, listener.id)


@router.put(
    "/{listener_id}/parser-profile",
    response_model=PatternProfileOut,
)
async def save_listener_parser_profile(
    payload: PatternProfileUpdate,
    listener: OwnedListener,
    session: SessionDep,
    request: Request,
):
    profile = await _get_listener_profile(session, listener.id)
    if profile is None:
        profile = ParserProfile(
            user_id=listener.user_id,
            listener_id=listener.id,
            kind="telegram",
        )
        session.add(profile)
    profile.name = payload.name
    profile.patterns = [pattern.model_dump() for pattern in payload.patterns]
    profile.export_columns = [column.model_dump() for column in payload.export_columns]
    profile.fallback_to_default = payload.fallback_to_default
    await session.commit()
    await session.refresh(profile)
    manager = getattr(request.app.state, "manager", None)
    if manager is not None:
        await manager.reload_parser_profile(listener.id)
    return profile


@router.post(
    "/{listener_id}/parser-profile/copy",
    response_model=PatternProfileOut,
)
async def copy_listener_parser_profile(
    payload: CopyProfileRequest,
    listener: OwnedListener,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
):
    source = await session.scalar(
        select(ParserProfile).where(
            ParserProfile.id == payload.profile_id,
            ParserProfile.user_id == user.id,
            ParserProfile.kind == "telegram",
        )
    )
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    if source.listener_id == listener.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source profile already belongs to this listener",
        )

    profile = await _get_listener_profile(session, listener.id)
    if profile is None:
        profile = ParserProfile(
            user_id=listener.user_id,
            listener_id=listener.id,
            kind="telegram",
        )
        session.add(profile)
    profile.name = source.name
    profile.patterns = list(source.patterns or [])
    profile.export_columns = list(source.export_columns or [])
    profile.fallback_to_default = source.fallback_to_default
    await session.commit()
    await session.refresh(profile)

    manager = getattr(request.app.state, "manager", None)
    if manager is not None:
        await manager.reload_parser_profile(listener.id)
    return profile


@router.delete(
    "/{listener_id}/parser-profile",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_listener_parser_profile(
    listener: OwnedListener,
    session: SessionDep,
    request: Request,
):
    profile = await _get_listener_profile(session, listener.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    await session.delete(profile)
    await session.commit()
    manager = getattr(request.app.state, "manager", None)
    if manager is not None:
        await manager.reload_parser_profile(listener.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@preview_router.post("/preview", response_model=PatternPreviewResponse)
async def preview_patterns(
    payload: PatternPreviewRequest,
    user: CurrentUser,
):
    columns = (
        [column.model_dump() for column in payload.export_columns]
        if payload.export_columns
        else default_export_columns()
    )
    patterns = [pattern.model_dump() for pattern in payload.patterns]
    pattern_columns = pattern_export_columns(patterns)
    result = parse_pattern_lines(
        payload.text,
        patterns,
        default_month=payload.default_month,
        export_columns=columns,
    )
    date = datetime.now(UTC)
    rows = []
    grouped: dict[str | None, list[PatternPreviewRow]] = {}
    for payment in result.payments:
        row_columns = (
            pattern_columns.get(payment.pattern_name)
            if payment.pattern_name
            else None
        ) or columns
        row = {
            "date": date,
            "value": payment.value,
            "name": payment.name,
            "description": payment.description,
            "month": payment.month,
            "source": payment.source,
            "currency": payment.currency,
            "kind": payment.kind,
            "extra": payment.extra,
        }
        preview_row = PatternPreviewRow(
            value=payment.value,
            name=payment.name,
            description=payment.description,
            month=payment.month or date.month,
            source=payment.source,
            currency=payment.currency,
            kind=payment.kind,
            extra=payment.extra,
            pattern=payment.pattern_name,
            cells=resolve_row_cells(row, row_columns),
        )
        rows.append(preview_row)
        grouped.setdefault(payment.pattern_name, []).append(preview_row)

    groups = [
        PatternPreviewGroup(
            pattern=name,
            columns=(
                pattern_columns.get(name) if name else None
            ) or columns,
            rows=group_rows,
        )
        for name, group_rows in grouped.items()
    ]
    return PatternPreviewResponse(
        rows=rows,
        groups=groups,
        unmatched_lines=result.unmatched_lines,
        errors=result.errors,
        columns=columns,
    )
