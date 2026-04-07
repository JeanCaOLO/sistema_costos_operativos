import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Service role key bypasses RLS — safe for read-only public embed
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [
      { data: colData, error: e1 },
      { data: filData, error: e2 },
      { data: areasData, error: e3 },
      { data: invData, error: e4 },
      { data: gastosFilData, error: e5 },
      { data: areaDistribData, error: e6 },
      { data: moColData, error: e7 },
      { data: moFilData, error: e8 },
      { data: volColData, error: e9 },
      { data: volFilData, error: e10 },
      { data: empData, error: e11 },
      { data: volConfigData },
      { data: simConfigData },
    ] = await Promise.all([
      supabase.from('costos_columnas').select('*').order('orden'),
      supabase.from('costos_operacion').select('*').order('orden'),
      supabase.from('areas').select('id, nombre, metros_cuadrados, cantidad_racks, categoria').order('nombre'),
      supabase.from('inversiones').select('*').order('created_at'),
      supabase.from('gastos_varios').select('id, area, concepto, parent_id, es_total, tipo_fila, valores'),
      supabase.from('area_distribution').select('area_name, global_distribution_percentage'),
      supabase.from('mano_obra_columnas').select('id, nombre, tipo, is_sensitive').order('orden'),
      supabase.from('mano_obra').select('id, area, valores'),
      supabase.from('volumenes_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('volumenes').select('id, proceso, subproceso, valores'),
      supabase.from('mano_obra_empleados').select('*').eq('is_active', true),
      supabase.from('app_config').select('value').eq('key', 'vol_promedio_lastN').maybeSingle(),
      supabase.from('app_config').select('value').eq('key', 'sim_multiplier').maybeSingle(),
    ]);

    const errors = [e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11]
      .filter(Boolean)
      .map((e) => e?.message);

    // Extraer lastN desde app_config (fuente de verdad compartida)
    const rawVolConfig = (volConfigData as { value?: { recibido?: number; despachado?: number } } | null)?.value;
    const volLastN = {
      recibido: typeof rawVolConfig?.recibido === 'number' ? rawVolConfig.recibido : 0,
      despachado: typeof rawVolConfig?.despachado === 'number' ? rawVolConfig.despachado : 0,
    };

    // Extraer multiplicador de simulación desde app_config
    const rawSimValue = (simConfigData as { value?: number } | null)?.value;
    const simMultiplier = typeof rawSimValue === 'number' ? rawSimValue : 1;

    return new Response(
      JSON.stringify({
        colData: colData ?? [],
        filData: filData ?? [],
        areasData: areasData ?? [],
        invData: invData ?? [],
        gastosFilData: gastosFilData ?? [],
        areaDistribData: areaDistribData ?? [],
        moColData: moColData ?? [],
        moFilData: moFilData ?? [],
        volColData: volColData ?? [],
        volFilData: volFilData ?? [],
        empData: empData ?? [],
        volLastN,
        simMultiplier,
        _errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
