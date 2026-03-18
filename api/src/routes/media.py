"""
AI Media Generation — product images and videos via Google Nano Banana + Veo.

Endpoints:
  POST /media/generate-image   → Generate AI product images (uses existing image as reference)
  POST /media/edit-image       → Edit existing product image with AI
  POST /media/upload-image     → Upload generated image to Shopify product
  POST /media/generate-video   → Generate AI product video
"""

import base64
import io
import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.router import current_active_user
from src.config import settings
from src.database import get_async_session
from src.integrations.shopify import ShopifyClient
from src.models.product import Product
from src.models.store import Store

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────


class GenerateImageRequest(BaseModel):
    product_id: uuid.UUID
    prompt: str | None = None
    aspect_ratio: str = "1:1"
    style: str = "product"  # product, lifestyle, white-background, studio
    use_reference: bool = True  # send existing product image as reference


class GenerateImageResponse(BaseModel):
    images: list[str]  # base64-encoded images
    prompt_used: str


class EditImageRequest(BaseModel):
    product_id: uuid.UUID
    image_url: str
    instructions: str


class EditImageResponse(BaseModel):
    image: str
    prompt_used: str


class UploadImageRequest(BaseModel):
    product_id: uuid.UUID
    image_base64: str  # base64-encoded image
    filename: str = "ai-generated.png"
    position: int | None = None  # position in image list, None = append
    replace_index: int | None = None  # replace image at this index


class UploadImageResponse(BaseModel):
    ok: bool
    message: str
    shopify_image_id: int | None = None


class GenerateVideoRequest(BaseModel):
    product_id: uuid.UUID
    prompt: str | None = None


class GenerateVideoResponse(BaseModel):
    status: str
    message: str
    video_base64: str | None = None


# ── Helpers ───────────────────────────────────────────


def _get_google_client(user: User):
    """Initialize Google GenAI client — server key first, BYOK fallback."""
    from google import genai

    api_key = settings.GOOGLE_AI_API_KEY or getattr(user, "google_ai_api_key", None)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Google AI not configured. Contact support.",
        )
    return genai.Client(api_key=api_key)


async def _fetch_image(url: str):
    """Download an image and return as PIL Image."""
    from PIL import Image

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content))


def _build_prompt(product: Product, style: str, custom_prompt: str | None) -> str:
    """Build image generation prompt."""
    title = product.title or "product"
    brand = product.brand or ""

    if custom_prompt:
        return f"Using the reference product image provided, {custom_prompt}"

    style_prompts = {
        "product": (
            f"Using the reference product image, create a professional ecommerce product photo "
            f"of this exact same product ({title}). Keep the product identical — same shape, "
            f"colors, labels, packaging. Clean white/neutral background, commercial photography."
        ),
        "lifestyle": (
            f"Using the reference product image, create a lifestyle photo of this exact same "
            f"product ({title}) in an aspirational natural setting. Keep the product identical. "
            f"Show it being displayed or used in context. Warm, inviting lighting."
        ),
        "white-background": (
            f"Using the reference product image, create a pure white background product photo "
            f"of this exact same product ({title}). Keep the product identical. "
            f"Amazon/Shopify style. Sharp, well-lit, no shadows, centered."
        ),
        "studio": (
            f"Using the reference product image, create a premium studio product photo "
            f"of this exact same product ({title}). Keep the product identical. "
            f"Dramatic lighting, dark gradient background, high-end commercial style."
        ),
    }

    prompt = style_prompts.get(style, style_prompts["product"])
    if brand:
        prompt += f" Brand: {brand}."
    return prompt


async def _get_product_and_store(
    product_id: uuid.UUID, user: User, session: AsyncSession
) -> tuple[Product, Store | None]:
    """Load product and its store."""
    result = await session.execute(
        select(Product).where(Product.id == product_id, Product.user_id == user.id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    store = None
    if product.store_id:
        result = await session.execute(
            select(Store).where(Store.id == product.store_id, Store.user_id == user.id)
        )
        store = result.scalar_one_or_none()

    return product, store


# ── Endpoints ─────────────────────────────────────────


@router.post("/generate-image", response_model=GenerateImageResponse)
async def generate_product_image(
    body: GenerateImageRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Generate AI product images using Nano Banana.

    If the product has existing images and use_reference=True,
    sends the first image as reference so the AI generates
    variations of the ACTUAL product, not a random image.
    """
    from google.genai import types

    product, _ = await _get_product_and_store(body.product_id, user, session)
    client = _get_google_client(user)
    prompt = _build_prompt(product, body.style, body.prompt)

    # Build content — text + reference image if available
    contents: list = []

    if body.use_reference and product.images:
        # Download the first product image as reference
        try:
            ref_image = await _fetch_image(product.images[0])
            contents.append(ref_image)
            logger.info("Using reference image for product %s", product.id)
        except Exception as exc:
            logger.warning("Could not fetch reference image: %s — generating without it", exc)

    contents.append(prompt)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=contents,
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
    Edit an existing product image with AI instructions.

    Sends the image + instructions to Nano Banana for editing.
    """
    product, _ = await _get_product_and_store(body.product_id, user, session)

    try:
        img = await _fetch_image(body.image_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to fetch image: {exc}")

    client = _get_google_client(user)

    try:
        chat = client.chats.create(model="gemini-2.5-flash-image")
        response = chat.send_message([body.instructions, img])
    except Exception as exc:
        logger.error("Image edit failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Image editing failed: {exc}")

    result_image = None
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            img_bytes = part.inline_data.data
            result_image = base64.b64encode(img_bytes).decode("utf-8")
            break

    if not result_image:
        raise HTTPException(status_code=502, detail="No edited image returned.")

    return EditImageResponse(image=result_image, prompt_used=body.instructions)


@router.post("/upload-image", response_model=UploadImageResponse)
async def upload_image_to_shopify(
    body: UploadImageRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Upload a generated/edited image to the Shopify product.

    Can append as new image or replace an existing one.
    """
    product, store = await _get_product_and_store(body.product_id, user, session)

    if not store or not store.access_token:
        raise HTTPException(status_code=400, detail="Store not connected")

    try:
        shopify_product_id = int(product.platform_id)
    except (ValueError, TypeError):
        return UploadImageResponse(ok=False, message=f"Invalid product ID: {product.platform_id}")

    shop_domain = store.platform_domain
    client = ShopifyClient(shop_domain, store.access_token)

    # Use same IPv4-forced transport as other Shopify calls
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")

    try:
        # If replacing, delete old image first
        if body.replace_index is not None:
            shopify_product = await client.get_product(shopify_product_id)
            images = shopify_product.get("images", [])
            if 0 <= body.replace_index < len(images):
                old_image_id = images[body.replace_index]["id"]
                async with httpx.AsyncClient(transport=transport, timeout=30) as http_client:
                    await http_client.delete(
                        f"{client.base_url}/products/{shopify_product_id}/images/{old_image_id}.json",
                        headers=client._headers(),
                    )

        # Upload new image
        image_payload = {
            "image": {
                "attachment": body.image_base64,
                "filename": body.filename,
            }
        }
        if body.position is not None:
            image_payload["image"]["position"] = body.position

        async with httpx.AsyncClient(transport=transport, timeout=60) as http_client:
            resp = await http_client.post(
                f"{client.base_url}/products/{shopify_product_id}/images.json",
                headers=client._headers(),
                json=image_payload,
            )
            resp.raise_for_status()
            new_image = resp.json().get("image", {})

        logger.info("Uploaded image to Shopify product %s", shopify_product_id)
        return UploadImageResponse(
            ok=True,
            message="Image uploaded to Shopify successfully!",
            shopify_image_id=new_image.get("id"),
        )

    except Exception as exc:
        logger.error("Shopify image upload failed: %s", exc)
        return UploadImageResponse(ok=False, message=f"Upload failed: {exc}")


@router.post("/generate-video", response_model=GenerateVideoResponse)
async def generate_product_video(
    body: GenerateVideoRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Generate AI product video using Google Veo."""
    product, _ = await _get_product_and_store(body.product_id, user, session)

    title = product.title or "product"
    prompt = body.prompt or (
        f"Short, professional product showcase video of {title}. "
        f"Smooth 360-degree rotation, clean background, commercial quality. "
        f"Studio lighting, premium feel."
    )

    client = _get_google_client(user)

    try:
        operation = client.models.generate_videos(
            model="veo-3.0-generate-preview",
            prompt=prompt,
        )

        import time
        for _ in range(60):  # max 5 min wait
            if operation.done:
                break
            time.sleep(5)
            operation = client.operations.get(operation)

        if operation.result and operation.result.generated_videos:
            # Encode first video as base64
            video = operation.result.generated_videos[0]
            video_b64 = None
            if hasattr(video, "video") and video.video:
                video_b64 = base64.b64encode(video.video).decode("utf-8")

            return GenerateVideoResponse(
                status="completed",
                message="Video generated successfully!",
                video_base64=video_b64,
            )
        else:
            return GenerateVideoResponse(
                status="failed",
                message="Video generation completed but no video returned.",
            )

    except Exception as exc:
        logger.error("Veo video generation failed: %s", exc)
        return GenerateVideoResponse(
            status="error",
            message=f"Video generation failed: {exc}",
        )
