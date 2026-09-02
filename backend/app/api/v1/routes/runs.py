"""Streaming workflow execution API."""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ....models.workflow import RunRequest
from ....services.run_stream import stream_run

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_class=StreamingResponse)
def create_run(run_request: RunRequest, request: Request) -> StreamingResponse:
    return StreamingResponse(
        stream_run(run_request, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
