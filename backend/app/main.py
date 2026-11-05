from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from math import isfinite
from pathlib import Path
import socket
import threading
import ctypes
from typing import Any, Literal

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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


# GameController binary packet ctypes structures (corresponds to RoboCupGameControlData version 20)
class RobotInfo(ctypes.Structure):
    _fields_ = [
        ("penalty", ctypes.c_uint8),
        ("secsTillUnpenalised", ctypes.c_uint8),
        ("cautions", ctypes.c_uint8),
    ]


class TeamInfo(ctypes.Structure):
    _fields_ = [
        ("teamNumber", ctypes.c_uint8),
        ("fieldPlayerColour", ctypes.c_uint8),
        ("goalkeeperColour", ctypes.c_uint8),
        ("goalkeeper", ctypes.c_uint8),
        ("score", ctypes.c_uint8),
        ("penaltyShot", ctypes.c_uint8),
        ("singleShots", ctypes.c_uint16),
        ("messageBudget", ctypes.c_uint16),
        ("players", RobotInfo * 20),
    ]


class RoboCupGameControlData(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("header", ctypes.c_char * 4),
        ("version", ctypes.c_uint8),
        ("packetNumber", ctypes.c_uint8),
        ("playersPerTeam", ctypes.c_uint8),
        ("competitionType", ctypes.c_uint8),
        ("stopped", ctypes.c_uint8),
        ("gamePhase", ctypes.c_uint8),
        ("state", ctypes.c_uint8),
        ("setPlay", ctypes.c_uint8),
        ("firstHalf", ctypes.c_uint8),
        ("kickingTeam", ctypes.c_uint8),
        ("secsRemaining", ctypes.c_int16),
        ("secondaryTime", ctypes.c_int16),
        ("teams", TeamInfo * 2),
    ]


PACKET_SIZE = ctypes.sizeof(RoboCupGameControlData)  # 158 bytes

latest_gc_state: dict[str, Any] = {
    "gamePhase": "normal",
    "state": "playing",
    "setPlay": "none",
    "firstHalf": True,
    "stopped": False,
    "ownTeamNumber": 0,
    "kickingTeam": None,
    "teamNumbers": [0, 0],
}

latest_gc_lock = threading.Lock()
stop_event = threading.Event()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        with latest_gc_lock:
            state_to_send = latest_gc_state.copy()
        await websocket.send_json(state_to_send)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()


def parse_gc_data(data: bytes) -> dict[str, Any] | None:
    if len(data) < PACKET_SIZE:
        return None

    packet = RoboCupGameControlData.from_buffer_copy(data[:PACKET_SIZE])

    if packet.header not in (b"RGme", b"RGTD"):
        return None
    if packet.version != 20:
        return None

    GAME_PHASES = ["normal", "penalty_shoot_out", "extra_time", "timeout"]
    STATES = ["initial", "ready", "set", "playing", "finished"]
    SET_PLAYS = [
        "none",
        "direct_free_kick",
        "indirect_free_kick",
        "penalty_kick",
        "throw_in",
        "goal_kick",
        "corner_kick",
    ]

    game_phase_str = (
        GAME_PHASES[packet.gamePhase] if packet.gamePhase < len(GAME_PHASES) else "normal"
    )
    state_str = STATES[packet.state] if packet.state < len(STATES) else "playing"
    set_play_str = SET_PLAYS[packet.setPlay] if packet.setPlay < len(SET_PLAYS) else "none"

    return {
        "gamePhase": game_phase_str,
        "state": state_str,
        "setPlay": set_play_str,
        "firstHalf": bool(packet.firstHalf),
        "stopped": bool(packet.stopped),
        "kickingTeam": None if packet.kickingTeam == 255 else packet.kickingTeam,
        "teamNumbers": [packet.teams[0].teamNumber, packet.teams[1].teamNumber],
    }



def udp_listener_loop(loop: asyncio.AbstractEventLoop):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    except AttributeError:
        pass

    try:
        sock.bind(("", 3838))
    except Exception as e:
        print(f"GameController: Failed to bind to port 3838: {e}")
        return

    sock.settimeout(0.5)

    while not stop_event.is_set():
        try:
            data, addr = sock.recvfrom(1024)
            parsed = parse_gc_data(data)
            if parsed is not None:
                with latest_gc_lock:
                    latest_gc_state.update({
                        "gamePhase": parsed["gamePhase"],
                        "state": parsed["state"],
                        "setPlay": parsed["setPlay"],
                        "firstHalf": parsed["firstHalf"],
                        "stopped": parsed["stopped"],
                        "kickingTeam": parsed["kickingTeam"],
                        "teamNumbers": parsed["teamNumbers"],
                    })
                    state_copy = latest_gc_state.copy()

                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(state_copy), loop
                )

                if data.startswith(b"RGme"):
                    gc_ip = addr[0]
                    try:
                        sock.sendto(b"RGTr\x00", (gc_ip, 3636))
                    except Exception as e:
                        print(f"GameController: Failed to send monitor request to {gc_ip}: {e}")

        except socket.timeout:
            continue
        except Exception as e:
            if not stop_event.is_set():
                print(f"GameController: Error in UDP listener: {e}")
            break
    sock.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    stop_event.clear()
    thread = threading.Thread(target=udp_listener_loop, args=(loop,), daemon=True)
    thread.start()
    yield
    stop_event.set()
    thread.join(timeout=1.0)


app = FastAPI(title="Formation Backend", version="0.1.0", lifespan=lifespan)

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


@app.get("/api/gamecontroller/state")
def get_gamecontroller_state() -> dict[str, Any]:
    with latest_gc_lock:
        return latest_gc_state.copy()


@app.websocket("/api/gamecontroller/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


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