from __future__ import annotations

from math import isfinite
from typing import Any, Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .compute import compute_positions


class Vec2Model(BaseModel):
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def validate_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("must be finite")
        return value


class ComputePositionsRequest(BaseModel):
    version: Literal[1]
    field: str
    playMode: str
    ball: Vec2Model
    robotIds: list[int] = Field(default_factory=list)
    activePlayers: int = Field(ge=0, le=11)
    formation: dict[str, Any]


class PositionPayload(BaseModel):
    ok: bool
    x: float | None = None
    y: float | None = None
    reason: str | None = None


class ComputePositionsResponse(BaseModel):
    version: Literal[1]
    positions: dict[str, PositionPayload]
    warnings: list[str]


app = FastAPI(title="Formation Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/compute_positions", response_model=ComputePositionsResponse)
def post_compute_positions(
    request: ComputePositionsRequest,
) -> ComputePositionsResponse:
    positions, warnings = compute_positions(
        play_mode=request.playMode,
        ball=request.ball.model_dump(),
        robot_ids=request.robotIds,
        active_players=request.activePlayers,
        formation=request.formation,
    )

    return ComputePositionsResponse(
        version=1,
        positions=positions,
        warnings=warnings,
    )
