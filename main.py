"""
시스템 리소스 모니터링 서버
FastAPI + WebSocket을 사용한 실시간 모니터링
"""

import asyncio
import json
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from system_monitor import get_all_metrics

app = FastAPI(title="System Resource Monitor")

# 정적 파일 서빙
static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/")
async def root():
    """메인 대시보드 페이지"""
    return FileResponse(static_path / "index.html")


@app.get("/api/metrics")
async def get_metrics():
    """현재 시스템 메트릭 조회 (REST API)"""
    return get_all_metrics()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket을 통한 실시간 메트릭 스트리밍"""
    await websocket.accept()
    
    try:
        while True:
            # 1초마다 메트릭 전송
            metrics = get_all_metrics()
            await websocket.send_text(json.dumps(metrics))
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
