-- Migration: Setup Cron Job for fetchDeviceCatalog Edge Function
-- 
-- This SQL script sets up a cron job to automatically run the fetchDeviceCatalog
-- Edge Function on a schedule.
--
-- Run this in your Supabase SQL Editor:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Paste this script
-- 3. Click "Run" or press Ctrl+Enter
--
-- IMPORTANT: Replace YOUR_PROJECT_REF with your actual Supabase project reference ID

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the fetchDeviceCatalog function to run bi-weekly (every 14 days at 2 AM UTC)
-- 
-- Cron syntax: minute hour day-of-month month day-of-week
-- Schedule: "0 2 */14 * *" = Every 14 days at 2:00 AM UTC
--
-- Alternative schedules:
-- - "0 2 1 * *" = First day of every month at 2:00 AM UTC
-- - "0 2 * * 0" = Every Sunday at 2:00 AM UTC
-- - "0 */6 * * *" = Every 6 hours
-- - "0 2 * * *" = Every day at 2:00 AM UTC

SELECT cron.schedule(
  'fetch-device-catalog',                    -- Job name (unique identifier)
  '0 2 */14 * *',                           -- Schedule: Every 14 days at 2 AM UTC
  $$SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/fetchDeviceCatalog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'fetch-device-catalog';

-- To view all cron jobs:
-- SELECT * FROM cron.job;

-- To unschedule/delete the cron job later:
-- SELECT cron.unschedule('fetch-device-catalog');


