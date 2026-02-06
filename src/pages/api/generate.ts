import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';
import { consumeCredit, ensureFreeCredits, getUserCredits } from '../../lib/credits';

export const prerender = false;

const MAX_PROMPT_LENGTH = 1000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const API_TIMEOUT = 60_000; // 60 seconds
const GEMINI_MODEL = 'gemini-3-pro-image-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  try {
    // Check if it matches base64 pattern
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
  } catch {
    return false;
  }
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const GET: APIRoute = async () => {
  return jsonResponse({ success: false, error: 'Method not allowed. Use POST.' }, 405);
};

export const POST: APIRoute = async ({ request, locals }) => {
  // Check authentication
  const sessionData = await auth.api.getSession({ headers: request.headers });
  if (!sessionData?.user) {
    return jsonResponse(
      { success: false, error: 'Please sign in to generate images.' },
      401
    );
  }

  // Ensure free credits for new users, then check balance
  await ensureFreeCredits(sessionData.user.id);
  const credits = await getUserCredits(sessionData.user.id);
  if (credits <= 0) {
    return jsonResponse(
      { success: false, error: 'No credits remaining. Please purchase more credits.', code: 'NO_CREDITS' },
      402
    );
  }

  const runtime = (locals as any).runtime;
  const apiKey =
    runtime?.env?.GOOGLE_AI_STUDIO_API_KEY ||
    import.meta.env.GOOGLE_AI_STUDIO_API_KEY;

  if (!apiKey || apiKey === 'your_api_key_here') {
    return jsonResponse(
      { success: false, error: 'API key is not configured.' },
      500
    );
  }

  let body: { prompt?: string; image?: string; style?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { success: false, error: 'Invalid JSON in request body.' },
      400
    );
  }

  const { prompt, image, style } = body;

  // Validate prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return jsonResponse(
      { success: false, error: 'Prompt is required and must be a non-empty string.' },
      400
    );
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return jsonResponse(
      { success: false, error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.` },
      400
    );
  }

  // Validate image if provided
  if (image !== undefined) {
    if (typeof image !== 'string' || !isValidBase64(image)) {
      return jsonResponse(
        { success: false, error: 'Image must be a valid base64 encoded string.' },
        400
      );
    }
    // Approximate size check: base64 is ~4/3 of original size
    const approximateSize = (image.length * 3) / 4;
    if (approximateSize > MAX_IMAGE_SIZE) {
      return jsonResponse(
        { success: false, error: 'Image size must be 10MB or less.' },
        400
      );
    }
  }

  // Build the prompt text
  let finalPrompt = prompt.trim();
  if (style && typeof style === 'string' && style.trim().length > 0) {
    finalPrompt = `in ${style.trim()} style: ${finalPrompt}`;
  }

  // Build request parts
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: finalPrompt },
  ];

  if (image) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: image,
      },
    });
  }

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(
      `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error?.message || `API error: ${response.status}`;

      if (response.status === 429) {
        return jsonResponse(
          { success: false, error: 'Rate limit exceeded. Please try again later.' },
          429
        );
      }
      if (response.status === 401 || response.status === 403) {
        return jsonResponse(
          { success: false, error: 'Invalid API key.' },
          500
        );
      }

      return jsonResponse({ success: false, error: errorMessage }, 500);
    }

    const data = await response.json();

    // Extract image from response
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      return jsonResponse(
        { success: false, error: 'No response generated from the model.' },
        500
      );
    }

    const responseParts = candidates[0]?.content?.parts;
    if (!responseParts || responseParts.length === 0) {
      return jsonResponse(
        { success: false, error: 'Empty response from the model.' },
        500
      );
    }

    // Find the image part in the response
    const imagePart = responseParts.find(
      (part: { inlineData?: { mimeType: string; data: string } }) => part.inlineData
    );

    if (!imagePart?.inlineData) {
      return jsonResponse(
        { success: false, error: 'No image was generated. Try a different prompt.' },
        500
      );
    }

    // Deduct credit only after successful generation
    await consumeCredit(sessionData.user.id);

    return jsonResponse(
      {
        success: true,
        image: imagePart.inlineData.data,
      },
      200
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return jsonResponse(
        { success: false, error: 'Request timed out. Please try again.' },
        504
      );
    }

    return jsonResponse(
      { success: false, error: 'An unexpected error occurred.' },
      500
    );
  }
};
