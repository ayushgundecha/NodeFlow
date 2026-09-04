"""FastAPI application factory and production middleware."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.v1.router import router as api_v1_router
from .config import Settings
from .middleware import ApiRequestSizeLimitMiddleware
from .openapi import install_contract_openapi

BACKEND_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = BACKEND_DIR / "public"


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(
        title="NodeFlow API",
        version=settings.version,
        description="Build visually. Execute for real. Debug every step.",
    )
    app.state.settings = settings
    app.add_middleware(ApiRequestSizeLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    )
    app.include_router(api_v1_router)
    app.mount(
        "/assets",
        StaticFiles(directory=PUBLIC_DIR / "assets", check_dir=False),
        name="assets",
    )

    @app.get("/{rest_of_path:path}", include_in_schema=False)
    def serve_spa(rest_of_path: str) -> FileResponse:
        if rest_of_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        index_path = PUBLIC_DIR / "index.html"
        if not index_path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Frontend build not found. Run `cd frontend && npm run build`.",
            )
        return FileResponse(index_path)

    install_contract_openapi(app)
    return app
