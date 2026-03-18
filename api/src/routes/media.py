"""
AI Media Generation — product images and videos via Google Nano Banana + Veo.

Endpoints:
  POST /media/generate-image   → Generate AI product images
  POST /media/generate-video   → Generate AI product video
  POST /media/edit-image       → Edit existing product image with AI
"""

import base64
import io
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.config import settings
from src.database import get_async_session
from src.models.product import Product
from src.models.store import Store

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────


class GenerateImageRequest(BaseModel):
    product_id: uuid.UUID
    prompt: str | None = None  # custom prompt, auto-generated if empty
    aspect_ratio: str = "1:1"  # 1:1, 16:9, 9:16, 4:3, 3:4
    style: str = "product"  # product, lifestyle, white-background, studio


class GenerateImageResponse(BaseModel):
    images: list[str]  # base64-encoded images
    prompt_used: str


class EditImageRequest(BaseModel):
    product_id: uuid.UUID
    image_url: str  # existing image URL to edit
    instructions: str  # what to change


class EditImageResponse(BaseModel):
    image: str  # base64-encoded result
    prompt_used: str


class GenerateVideoRequest(BaseModel):
    product_id: uuid.UUID
    prompt: str | None = None
    duration: str = "short"  # short (5s), medium (10s)


class GenerateVideoResponse(BaseModel):
    status: str
    message: str


# ── Helpers ───────────────────────────────────────────


def _get_google_client():
    """Initialize Google GenAI client."""
    from google import genai

    if not settings.GOOGLE_AI_API_KEY:
        raise HTTPException(
            status_code=400,
            detail="Google AI API key not configured. Add GOOGLE_AI_API_KEY in environment.",
        )
    return genai.Client(api_key=settings.GOOGLE_AI_API_KEY)


def _build_product_image_prompt(product: Product, style: str, custom_prompt: str | None) -> str:
    """Build an image generation prompt from product data."""
    if custom_prompt:
        return custom_prompt

    title = product.title or "product"
    brand = product.brand or ""
    category = product.category or ""

    style_instructions = {
        "product": f"Professional ecommerce product photo of {title}. Clean, high-resolution, centered on white/neutral background. Commercial photography style.",
        "lifestyle": f"Lifestyle photo featuring {title} in a natural, aspirational setting. Show the product being used or displayed in context. Warm, inviting lighting.",
        "white-background": f"Pure white background product photo of {title}. Amazon/Shopify style. Sharp, well-lit, no shadows, centered composition.",
        "studio": f"Professional studio product photo of {title}. Dramatic lighting, premium feel, dark or gradient background. High-end commercial style.",
    }

    prompt = style_instructions.get(style, style_instructions["product"])

    if brand:
        prompt += f" Brand: {brand}."
    if category:
        prompt += f" Category: {category}."

    return prompt


# ── Endpoints ─────────────────────────────────────────


@router.post("/generate-image", response_model=GenerateImageResponse)
async def generate_product_image(
    body: GenerateImageRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Generate AI product images using Google Nano Banana (Gemini Flash Image).

    Returns base64-encoded images that can be uploaded to Shopify.
    """
    from google.genai import types

    # Load product
    result = await session.execute(
        select(Product).where(Product.id == body.product_id, Product.user_id == user.id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    client = _get_google_client()
    prompt = _build_product_image_prompt(product, body.style, body.prompt)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-04-17",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio=body.aspect_ratio,
                ),
            ),
        )
    except Exception as exc:
        logger.error("Nano Banana image generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Image generation failed: {exc}")

    images: list[str] = []
    for part in response.parts:
        if part.inline_data:
            img_bytes = part.inline_data.data
            b64 = base64.b64encode(img_bytes).decode("utf-8")
            images.append(b64)

    if not images:
        raise HTTPException(status_code=502, detail="No images generated. Try a different prompt.")

    logger.info("Generated %d image(s) for product %s", len(images), product.id)
    return GenerateImageResponse(images=images, prompt_used=prompt)


@router.post("/edit-image", response_model=EditImageResponse)
async def edit_product_image(
    body: EditImageRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Edit an existing product image using AI (Nano Banana).

    Send an image URL and instructions for what to change.
    """
    import httpx
    from PIL import Image

    # Verify product ownership
    result = await session.execute(
        select(Product).where(Product.id == body.product_id, Product.user_id == user.id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Download the existing image
    try:
        async with httpx.AsyncClient(timeout=30) as http_client:
            resp = await http_client.get(body.image_url)
            resp.raise_for_status()
            img = Image.open(io.BytesIO(resp.content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to fetch image: {exc}")

    client = _get_google_client()

    try:
        chat = client.chats.create(model="gemini-2.5-flash-preview-04-17")
        response = chat.send_message([body.instructions, img])
    except Exception as exc:
        logger.error("Nano Banana image edit failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Image editing failed: {exc}")

    result_image = None
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            img_bytes = part.inline_data.data
            result_image = base64.b64encode(img_bytes).decode("utf-8")
            break

    if not result_image:
        raise HTTPException(status_code=502, detail="No edited image returned. Try different instructions.")

    logger.info("Edited image for product %s", product.id)
    return EditImageResponse(image=result_image, prompt_used=body.instructions)


@router.post("/generate-video", response_model=GenerateVideoResponse)
async def generate_product_video(
    body: GenerateVideoRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Generate AI product video using Google Veo.

    Note: Video generation is async and may take longer.
    Returns status and will be available for download when complete.
    """
    # Load product
    result = await session.execute(
        select(Product).where(Product.id == body.product_id, Product.user_id == user.id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    title = product.title or "product"
    prompt = body.prompt or (
        f"Short, professional product showcase video of {title}. "
        f"Smooth 360-degree rotation, clean background, commercial quality. "
        f"Studio lighting, premium feel."
    )

    client = _get_google_client()

    try:
        # Veo video generation
        operation = client.models.generate_videos(
            model="veo-3.0-generate-preview",
            prompt=prompt,
        )

        # Poll for completion (video gen is async)
        import time
        while not operation.done:
            time.sleep(5)
            operation = client.operations.get(operation)

        if operation.result and operation.result.generated_videos:
            logger.info("Video generated for product %s", product.id)
            return GenerateVideoResponse(
                status="completed",
                message="Video generated successfully. Check your media library.",
            )
        else:
            return GenerateVideoResponse(
                status="failed",
                message="Video generation completed but no video was returned.",
            )

    except Exception as exc:
        logger.error("Veo video generation failed: %s", exc)
        return GenerateVideoResponse(
            status="error",
            message=f"Video generation not available yet: {exc}",
        )
