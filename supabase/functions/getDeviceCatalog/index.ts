/**
 * Supabase Edge Function: getDeviceCatalog
 * 
 * This function serves the device catalog from Supabase Storage.
 * Use this if your Storage bucket is private and you need to expose
 * the catalog without revealing service keys.
 * 
 * This is an alternative to the Astro API endpoint if you prefer
 * to use Supabase Edge Functions for all API routes.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    // Add structured logging for OPTIONS request
    console.log(JSON.stringify({
      event: 'getDeviceCatalog.options',
      timestamp: new Date().toISOString(),
    }));
    return new Response('ok', { headers: corsHeaders });
  }
  
  // Add structured logging for main request
  console.log(JSON.stringify({
    event: 'getDeviceCatalog.request',
    method: req.method,
    timestamp: new Date().toISOString(),
  }));

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch deviceCatalog.json from Supabase Storage
    const { data, error } = await supabase.storage
      .from('catalogs')
      .download('deviceCatalog.json');

    if (error) {
      console.error('Error fetching device catalog:', error);
      // Add structured error logging
      console.error(JSON.stringify({
        event: 'getDeviceCatalog.storage.error',
        error: error.message,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ error: 'Failed to fetch device catalog' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    // Log successful download
    console.log(JSON.stringify({
      event: 'getDeviceCatalog.storage.success',
      timestamp: new Date().toISOString(),
    }));

    // Convert blob to text
    const text = await data.text();
    
    // Parse to validate JSON
    const catalog = JSON.parse(text);
    
    // Log successful parsing
    console.log(JSON.stringify({
      event: 'getDeviceCatalog.parse.success',
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(catalog), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    // Add structured error logging
    console.error(JSON.stringify({
      event: 'getDeviceCatalog.unexpected.error',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

