/**
 * Supabase Edge Function: fetchDeviceCatalog
 * 
 * This function fetches device catalog data from MobileAPI.dev and stores it
 * in Supabase Storage as deviceCatalog.json.
 * 
 * Based on MobileAPI.dev API documentation: https://mobileapi.dev/docs/
 * 
 * API Structure:
 * - Base URL: https://api.mobileapi.dev/
 * - Authentication: Authorization: Token YOUR_API_KEY
 * - Endpoints:
 *   - GET /manufacturers/ - Get all manufacturers
 *   - GET /devices/by-manufacturer/?manufacturer=... - Get devices by manufacturer
 * 
 * It should be scheduled to run bi-weekly or monthly via Supabase cron.
 * 
 * Environment variables required:
 * - MOBILEAPI_KEY: Your MobileAPI.dev API key
 * 
 * Storage bucket required:
 * - Bucket name: "catalogs"
 * - File path: "deviceCatalog.json"
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests

interface DeviceCatalog {
  metadata: {
    lastUpdated: string;
    version: string;
    source: string;
  };
  categories: {
    [category: string]: {
      brands: {
        [brand: string]: {
          models: {
            [model: string]: {
              variants: string[];
            };
          };
        };
      };
    };
  };
}

interface MobileAPIDevice {
  id: number;
  name: string;
  brand?: {
    name: string;
  };
  manufacturer_name?: string;
  brand_name?: string;
  storage?: string;
  [key: string]: any;
}

interface MobileAPIManufacturer {
  id: number;
  name: string;
  website_url?: string;
}

// Helper function to categorize device based on name/type
function categorizeDevice(deviceName: string, deviceData?: any): string {
  const name = deviceName.toLowerCase();
  
  // Check for tablet indicators
  if (name.includes('tablet') || name.includes('ipad') || name.includes('tab')) {
    return 'tablet';
  }
  
  // Check for smartwatch indicators
  if (name.includes('watch') || name.includes('band')) {
    return 'smartwatch';
  }
  
  // Default to phone (most devices are phones)
  return 'phone';
}

// Helper function to extract model name (remove brand, storage, etc.)
function extractModelName(deviceName: string, brandName: string): string {
  let model = deviceName;
  
  // Remove brand name if present
  if (model.toLowerCase().startsWith(brandName.toLowerCase())) {
    model = model.substring(brandName.length).trim();
  }
  
  // Remove common storage/color suffixes
  model = model.replace(/\s*(128GB|256GB|512GB|1TB|64GB|32GB|16GB).*$/i, '');
  model = model.replace(/\s*(Black|White|Blue|Red|Gold|Silver|Space Gray|Titanium).*$/i, '');
  
  return model.trim() || deviceName;
}

// Helper function to extract storage variants from device storage field
function extractStorageVariants(storage?: string): string[] {
  if (!storage) return [];
  
  // Storage format is typically "128GB, 256GB, 512GB" or similar
  const variants = storage.split(',').map(s => s.trim()).filter(s => s.length > 0);
  return variants.length > 0 ? variants : [];
}

// Helper function to call internal Astro API endpoint, which in turn talks to MobileAPI.dev
async function makeApiRequest(
  endpointPath: string,
  internalApiBaseUrl: string,
  internalApiSecret: string,
): Promise<Response> {
  const base = internalApiBaseUrl.replace(/\/+$/, '');
  const requestUrl = `${base}/api/internal/fetch-catalog-data`;

  console.log(
    `Calling internal API for MobileAPI endpoint: ${endpointPath}`,
  );

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': internalApiSecret,
    },
    body: JSON.stringify({ endpoint: endpointPath }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Internal API request failed (HTTP ${response.status}: ${response.statusText}). ${errorText}`,
    );
  }

  return response;
}

serve(async (req: Request) => {
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalApiSecret = Deno.env.get('INTERNAL_API_SECRET');
    const internalApiBaseUrl =
      Deno.env.get('INTERNAL_API_BASE_URL') ?? Deno.env.get('SITE_URL');

    if (!internalApiSecret) {
      throw new Error('INTERNAL_API_SECRET environment variable is not set');
    }

    if (!internalApiBaseUrl) {
      throw new Error(
        'INTERNAL_API_BASE_URL or SITE_URL environment variable is not set',
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting device catalog fetch from MobileAPI.dev...');
    
    // Add structured logging for the start of the process
    console.log(JSON.stringify({
      event: 'fetchDeviceCatalog.started',
      timestamp: new Date().toISOString(),
    }));

    // Step 1: Fetch all manufacturers
    console.log('Fetching manufacturers list...');
    const manufacturersEndpoint = '/manufacturers/?limit=200';
    const manufacturersResponse = await makeApiRequest(
      manufacturersEndpoint,
      internalApiBaseUrl,
      internalApiSecret,
    );
    const manufacturers: MobileAPIManufacturer[] = await manufacturersResponse.json();

    if (!Array.isArray(manufacturers) || manufacturers.length === 0) {
      const errorMsg = 'No manufacturers found or invalid response format';
      console.error(JSON.stringify({
        event: 'fetchDeviceCatalog.error',
        error: errorMsg,
        timestamp: new Date().toISOString(),
      }));
      throw new Error(errorMsg);
    }
    
    // Log manufacturer count
    console.log(JSON.stringify({
      event: 'fetchDeviceCatalog.manufacturers.fetched',
      count: manufacturers.length,
      timestamp: new Date().toISOString(),
    }));

    console.log(`Found ${manufacturers.length} manufacturers`);

    // Initialize catalog structure
    const catalog: DeviceCatalog = {
      metadata: {
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
        source: 'MobileAPI.dev',
      },
      categories: {
        phone: { brands: {} },
        tablet: { brands: {} },
        smartwatch: { brands: {} },
      },
    };

    // Step 2: For each manufacturer, fetch devices
    const maxManufacturers = 50; // Limit to avoid hitting rate limits (adjust based on your plan)
    const manufacturersToProcess = manufacturers.slice(0, maxManufacturers);

    for (let i = 0; i < manufacturersToProcess.length; i++) {
      const manufacturer = manufacturersToProcess[i];
      const manufacturerName = manufacturer.name;

      console.log(`Processing manufacturer ${i + 1}/${manufacturersToProcess.length}: ${manufacturerName}`);
      
      // Add structured logging for manufacturer processing
      console.log(JSON.stringify({
        event: 'fetchDeviceCatalog.manufacturer.processing',
        manufacturer: manufacturerName,
        index: i + 1,
        total: manufacturersToProcess.length,
        timestamp: new Date().toISOString(),
      }));

      try {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

        // Fetch devices for this manufacturer
        const devicesEndpoint =
          `/devices/by-manufacturer/?manufacturer=${encodeURIComponent(manufacturerName)}&limit=100`;
        const devicesResponse = await makeApiRequest(
          devicesEndpoint,
          internalApiBaseUrl,
          internalApiSecret,
        );
        const devices: MobileAPIDevice[] = await devicesResponse.json();

        if (!Array.isArray(devices) || devices.length === 0) {
          console.warn(`No devices found for manufacturer: ${manufacturerName}`);
          // Log warning with structured logging
          console.warn(JSON.stringify({
            event: 'fetchDeviceCatalog.manufacturer.noDevices',
            manufacturer: manufacturerName,
            timestamp: new Date().toISOString(),
          }));
          continue;
        }

        console.log(`  Found ${devices.length} devices for ${manufacturerName}`);
        // Log device count with structured logging
        console.log(JSON.stringify({
          event: 'fetchDeviceCatalog.manufacturer.devices.fetched',
          manufacturer: manufacturerName,
          count: devices.length,
          timestamp: new Date().toISOString(),
        }));

        // Process each device
        for (const device of devices) {
          const deviceName = device.name || device.brand_name || 'Unknown Device';
          const brandName = device.brand?.name || device.manufacturer_name || device.brand_name || manufacturerName;
          
          // Categorize device
          const category = categorizeDevice(deviceName, device);
          
          // Extract model name
          const modelName = extractModelName(deviceName, brandName);
          
          // Extract storage variants
          const storageVariants = extractStorageVariants(device.storage);
          
          // Initialize category if needed
          if (!catalog.categories[category]) {
            catalog.categories[category] = { brands: {} };
          }
          
          // Initialize brand if needed
          if (!catalog.categories[category].brands[brandName]) {
            catalog.categories[category].brands[brandName] = { models: {} };
          }
          
          // Add model and variants
          if (!catalog.categories[category].brands[brandName].models[modelName]) {
            catalog.categories[category].brands[brandName].models[modelName] = { variants: [] };
          }
          
          // Add storage variants if available
          if (storageVariants.length > 0) {
            // Merge variants, avoiding duplicates
            const existingVariants = catalog.categories[category].brands[brandName].models[modelName].variants;
            for (const variant of storageVariants) {
              if (!existingVariants.includes(variant)) {
                existingVariants.push(variant);
              }
            }
          } else {
            // If no storage variants, use device name as variant
            const variantName = `${modelName} ${device.storage || ''}`.trim();
            if (variantName && !catalog.categories[category].brands[brandName].models[modelName].variants.includes(variantName)) {
              catalog.categories[category].brands[brandName].models[modelName].variants.push(variantName);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch devices for manufacturer ${manufacturerName}:`, error instanceof Error ? error.message : error);
        // Continue with next manufacturer
        continue;
      }
    }

    // Step 3: Upload to Supabase Storage
    console.log('Uploading catalog to Supabase Storage...');
    const catalogJson = JSON.stringify(catalog, null, 2);
    
    // Log catalog size for debugging
    console.log(`Catalog size: ${catalogJson.length} characters`);
    
    // Add structured logging for catalog stats before upload
    const stats = {
      categories: Object.keys(catalog.categories).length,
      totalBrands: 0,
      totalModels: 0,
      totalVariants: 0,
    };

    for (const category of Object.values(catalog.categories)) {
      for (const brand of Object.values(category.brands)) {
        stats.totalBrands++;
        for (const model of Object.values(brand.models)) {
          stats.totalModels++;
          stats.totalVariants += model.variants.length;
        }
      }
    }
    
    console.log(JSON.stringify({
      event: 'fetchDeviceCatalog.catalog.stats',
      stats: stats,
      catalogSize: catalogJson.length,
      timestamp: new Date().toISOString(),
    }));
    
    // Convert string to Uint8Array for Supabase Storage compatibility
    const encoder = new TextEncoder();
    const catalogData = encoder.encode(catalogJson);
    
    // Add retry logic for upload
    let uploadError = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount <= maxRetries) {
      if (retryCount > 0) {
        console.log(`Retrying upload (${retryCount}/${maxRetries})...`);
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const { error } = await supabase.storage
        .from('catalogs')
        .upload('deviceCatalog.json', catalogData, {
          contentType: 'application/json',
          upsert: true, // Overwrite if exists
        });
      
      if (!error) {
        console.log('Catalog uploaded successfully');
        uploadError = null;
        break;
      }
      
      uploadError = error;
      console.warn(`Upload attempt ${retryCount + 1} failed:`, error.message);
      retryCount++;
    }
    
    if (uploadError) {
      console.error('Failed to upload catalog after retries:', {
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        error: uploadError.name
      });
      
      // Add structured error logging
      console.error(JSON.stringify({
        event: 'fetchDeviceCatalog.upload.failed',
        error: uploadError.message,
        statusCode: uploadError.statusCode,
        timestamp: new Date().toISOString(),
      }));
      
      throw new Error(`Failed to upload catalog to Storage after ${maxRetries} retries: ${uploadError.message}`);
    }
    
    // Log successful upload
    console.log(JSON.stringify({
      event: 'fetchDeviceCatalog.upload.success',
      timestamp: new Date().toISOString(),
    }));

    console.log('Catalog fetch completed successfully!');
    console.log(`Stats: ${stats.categories} categories, ${stats.totalBrands} brands, ${stats.totalModels} models, ${stats.totalVariants} variants`);
    
    // Add structured logging for completion
    console.log(JSON.stringify({
      event: 'fetchDeviceCatalog.completed',
      stats: stats,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Device catalog fetched and stored successfully',
        lastUpdated: catalog.metadata.lastUpdated,
        stats,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in fetchDeviceCatalog:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
