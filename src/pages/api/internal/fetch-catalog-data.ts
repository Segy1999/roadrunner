import type { APIRoute } from 'astro';

interface FetchCatalogBody {
  endpoint?: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const providedSecret = request.headers.get('X-Internal-Secret');
    const internalSecret = import.meta.env.INTERNAL_API_SECRET;

    if (!internalSecret) {
      console.error('INTERNAL_API_SECRET is not set in Astro environment');
      return new Response(
        JSON.stringify({
          error: 'Internal server configuration error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!providedSecret || providedSecret !== internalSecret) {
      console.warn('Unauthorized attempt to access internal fetch-catalog-data endpoint');
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    let body: FetchCatalogBody | null = null;
    try {
      body = (await request.json()) as FetchCatalogBody;
    } catch {
      // fall through to validation error below
    }

    if (!body || typeof body.endpoint !== 'string' || body.endpoint.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body. Expected JSON with an "endpoint" string.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const rawEndpoint = body.endpoint;
    const baseUrl = 'https://api.mobileapi.dev';

    // Allow either full URL or path-only value
    const targetUrl =
      rawEndpoint.startsWith('http://') || rawEndpoint.startsWith('https://')
        ? rawEndpoint
        : `${baseUrl}${rawEndpoint.startsWith('/') ? '' : '/'}${rawEndpoint}`;

    const mobileApiKey = import.meta.env.MOBILEAPI_KEY;
    if (!mobileApiKey) {
      console.error('MOBILEAPI_KEY is not set in Astro environment');
      return new Response(
        JSON.stringify({
          error: 'MobileAPI configuration error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Internal proxy requesting: ${targetUrl}`);

    const upstreamResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Token ${mobileApiKey}`,
        'User-Agent': 'Astro-Internal-Proxy/1.0',
        Accept: 'application/json',
      },
    });

    const responseText = await upstreamResponse.text();

    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type':
          upstreamResponse.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in /api/internal/fetch-catalog-data:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};


