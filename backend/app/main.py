from __future__ import annotations

from math import isfinite
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .compute import compute_positions


FIELD_SIZES_PATH = Path(__file__).resolve().parents[2] / "src" / "config" / "field_sizes.json"


class Vec2Model(BaseModel):
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def validate_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("must be finite")
        return value


class AdvertisedGameControllerStateModel(BaseModel):
    gamePhase: Literal["normal", "penalty_shoot_out", "extra_time", "timeout"]
    state: Literal["initial", "ready", "set", "playing", "finished"]
    setPlay: Literal[
        "none",
        "direct_free_kick",
        "indirect_free_kick",
        "penalty_kick",
        "throw_in",
        "goal_kick",
        "corner_kick",
    ]
    firstHalf: bool
    stopped: bool
    ownTeamNumber: int = Field(ge=0, le=254)
    kickingTeam: int | None = Field(default=None, ge=0, le=254)


class ComputePositionsRequest(BaseModel):
    version: Literal[1]
    field: Literal["S", "M", "L"] = "M"
    gameControllerState: AdvertisedGameControllerStateModel
    advertisedStateMode: str = Field(min_length=1)
    legacyMode: str = Field(min_length=1)
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
        game_controller_state=request.gameControllerState.model_dump(),
        advertised_state_mode=request.advertisedStateMode,
        legacy_mode=request.legacyMode,
        ball=request.ball.model_dump(),
        robot_ids=request.robotIds,
        active_players=request.activePlayers,
        formation=request.formation,
        field_size=request.field,
        field_sizes_path=FIELD_SIZES_PATH,
    )

    return ComputePositionsResponse(
        version=1,
        positions=positions,
        warnings=warnings,
    )