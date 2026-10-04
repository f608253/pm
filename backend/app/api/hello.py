from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class HelloResponse(BaseModel):
    message: str
    success: bool

@router.get("/hello", response_model=HelloResponse)
async def hello_world():
    """Hello world endpoint for testing"""
    return HelloResponse(
        message="Hello from Kanban Studio API!",
        success=True
    )
