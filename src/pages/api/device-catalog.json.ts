/**
 * API Endpoint: /api/device-catalog.json
 * 
 * This endpoint serves the device catalog from Supabase Storage.
 * Falls back to local file if Storage is not available.
 * 
 * Use this if your Storage bucket is private and you need to expose
 * the catalog without revealing service keys.
 * 
 * If your bucket is public, you can access the file directly from Storage.
 */

import type { APIRoute } from 'astro';
import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseServer } from '../../lib/supabase/serverClient';

export const GET: APIRoute = async ({ request }) => {
  try {
    // Try to fetch from Supabase Storage first
    try {
      const { data, error } = await supabaseServer.storage
        .from('catalogs')
        .download('deviceCatalog.json');

      if (!error && data) {
        // Successfully fetched from Storage
        const text = await data.text();
        const catalog = JSON.parse(text);
        
        return new Response(JSON.stringify(catalog), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            'X-Catalog-Source': 'supabase-storage',
          },
        });
      } else {
        // Storage error - log it but continue to fallback
        console.warn('Supabase Storage fetch failed, falling back to local file:', error?.message || 'Unknown error');
        if (error) {
          console.warn('Storage error details:', {
            message: error.message,
            statusCode: error.statusCode,
            error: error.name,
          });
        }
      }
    } catch (storageError) {
      // Storage fetch threw an exception - log and continue to fallback
      console.warn('Supabase Storage exception, falling back to local file:', storageError);
    }

    // Fallback: Load from local file
    try {
      const localCatalogPath = join(process.cwd(), 'data', 'deviceCatalog.json');
      const localCatalogContent = readFileSync(localCatalogPath, 'utf-8');
      const catalog = JSON.parse(localCatalogContent);

      console.log('Serving device catalog from local file (fallback mode)');
      
      return new Response(JSON.stringify(catalog), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes (shorter for fallback)
          'X-Catalog-Source': 'local-fallback',
        },
      });
    } catch (localError) {
      console.error('Failed to load local catalog file:', localError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to load device catalog',
          message: 'Both Supabase Storage and local file failed. Please ensure the catalogs bucket exists in Supabase Storage or the local file is available.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  } catch (error) {
    console.error('Unexpected error in device catalog endpoint:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};

