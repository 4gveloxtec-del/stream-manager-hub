import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) {
      throw new Error('SUPABASE_DB_URL not set');
    }

    const { Client } = await import('https://deno.land/x/postgres@v0.17.0/mod.ts');
    
    const client = new Client(dbUrl);
    await client.connect();

    // Check if column exists
    const checkResult = await client.queryObject(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles'
        AND column_name = 'notification_days_before'
      );
    `);

    const columnExists = (checkResult.rows[0] as { exists: boolean }).exists;
    
    if (columnExists) {
      await client.end();
      return new Response(
        JSON.stringify({ success: true, message: 'Column notification_days_before already exists' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add the column with default value of 3 days
    await client.queryArray(`
      ALTER TABLE public.profiles 
      ADD COLUMN notification_days_before integer DEFAULT 3;
    `);

    console.log('Added notification_days_before column to profiles table');

    await client.end();

    return new Response(
      JSON.stringify({ success: true, message: 'Column notification_days_before added successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
