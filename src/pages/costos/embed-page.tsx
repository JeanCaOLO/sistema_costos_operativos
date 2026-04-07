import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { CostoColumna, CostoFila } from '@/types/costos';
import type { Area } from '@/types/areas';
import type { InversionRecord } from '@/types/inversion';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula } from '@/lib/formulaEngine';
import type { VolPromedioConfig } from '@/hooks/useVolumenesPromedioConfig';
import CostosTableReadOnly from './components/CostosTableReadOnly';
import CostosSummary from './components/CostosSummary';

const EMBED_DATA_URL =
  'https://cqdupetgpzkvouslupfm.supabase.co/functions/v1/costos-embed-data';

interface RawSupabaseData {
  cols: CostoColumna[];
  rows: CostoFila[];
  mappedAreas: { nombre: string; metros_cuadrados: number; cantidad_racks: number }[];
  enrichedAreaDist: FormulaContext['areaDistribucion'];
  inversiones: InversionRecord[];
  gastosColsFijos: FormulaContext['gastosColumnas'];
  gastosFilas: FormulaContext['gastosFilas'];
  moColData: FormulaContext['manoObraColumnas'];
  moFilData: FormulaContext['manoObraFilas'];
  empData: FormulaContext['manoObraEmpleados'];
  volColData: FormulaContext['volumenesColumnas'];
  volFilData: FormulaContext['volumenesFilas'];
  volLastN: VolPromedioConfig;
  simMultiplier: number;
}

interface LoadState {
  data: RawSupabaseData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const INITIAL_LOAD_STATE: LoadState = {
  data: null,
  loading: true,
  error: null,
  lastUpdated: null,
};

function buildCtxFromRaw(raw: RawSupabaseData): {
  formulaCtx: FormulaContext;
  enrichedFilas: CostoFila[];
} {
  try {
    localStorage.setItem('vol_promedio_lastN', JSON.stringify(raw.volLastN));
  } catch {
    // silently ignore
  }

  const baseCtx: FormulaContext = {
    inversiones: raw.inversiones,
    gastosColumnas: raw.gastosColsFijos,
    gastosFilas: raw.gastosFilas,
    areaDistribucion: raw.enrichedAreaDist,
    manoObraColumnas: raw.moColData,
    manoObraFilas: raw.moFilData,
    manoObraEmpleados: raw.empData,
    volumenesColumnas: raw.volColData,
    volumenesFilas: raw.volFilData,
    costosColumnas: raw.cols,
    costosFilas: raw.rows,
    areasData: raw.mappedAreas,
  };

  const formulaTypeCols = raw.cols.filter((c) => c.tipo === 'formula' && c.formula);
  const enrichedFilas: CostoFila[] =
    formulaTypeCols.length > 0
      ? raw.rows.map((row) => {
          const extra: Record<string, number> = {};
          formulaTypeCols.forEach((col) => {
            extra[col.id] = calcularFormula(col.formula!, baseCtx, row.subproceso ?? '');
          });
          return { ...row, valores: { ...row.valores, ...extra } };
        })
      : raw.rows;

  const formulaCtx: FormulaContext = {
    ...baseCtx,
    costosFilas: enrichedFilas as FormulaContext['costosFilas'],
  };

  return { formulaCtx, enrichedFilas };
}

export default function CostosEmbedPage() {
  const [loadState, setLoadState] = useState<LoadState>(INITIAL_LOAD_STATE);
  const [simMultiplier, setSimMultiplier] = useState<string>('1');

  // Guardar multiplicador en Supabase cuando cambia
  const handleSimChange = useCallback(async (_filaId: string, value: string) => {
    setSimMultiplier(value);
    const numVal = parseFloat(value);
    if (!isNaN(numVal)) {
      await supabase
        .from('app_config')
        .update({ value: numVal })
        .eq('key', 'sim_multiplier');
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoadState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch(EMBED_DATA_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      const {
        colData, filData, areasData: rawAreas, invData,
        gastosFilData, areaDistribData, moColData, moFilData,
        volColData, volFilData, empData,
        volLastN: serverLastN,
        simMultiplier: serverSimMultiplier,
      } = payload;

      const cols = (colData as CostoColumna[]) ?? [];
      const rows = (filData as CostoFila[]) ?? [];
      const areasArr = ((rawAreas ?? []) as Area[]);

      const mappedAreas = areasArr.map((a) => ({
        nombre: a.nombre,
        metros_cuadrados: a.metros_cuadrados ?? 0,
        cantidad_racks: a.cantidad_racks ?? 0,
      }));

      const categoryTotals: Record<string, number> = {};
      areasArr.forEach((a) => {
        const cat = a.categoria ?? 'Sin categoría';
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0);
      });

      const enrichedAreaDist = (
        (areaDistribData ?? []) as { area_name: string; global_distribution_percentage: number }[]
      ).map((d) => {
        const match = areasArr.find((a) => a.nombre === d.area_name);
        const cat = match?.categoria ?? 'Sin categoría';
        const areaM2 = match?.metros_cuadrados ?? 0;
        const catTotal = categoryTotals[cat] ?? 0;
        const catPct = catTotal > 0 ? (areaM2 / catTotal) * 100 : 0;
        return {
          ...d,
          categoria: cat,
          category_distribution_percentage: +catPct.toFixed(2),
        };
      });

      const gastosColsFijos: FormulaContext['gastosColumnas'] = [
        { id: 'mes',       nombre: 'Mes',       tipo: 'moneda' },
        { id: 'ppto_mes',  nombre: 'Ppto Mes',  tipo: 'moneda' },
        { id: 'psdo_mes',  nombre: 'Psdo Mes',  tipo: 'moneda' },
        { id: 'acum',      nombre: 'Acumulado', tipo: 'moneda' },
        { id: 'ppto_acum', nombre: 'Ppto Acum', tipo: 'moneda' },
        { id: 'psdo_acum', nombre: 'Psdo Acum', tipo: 'moneda' },
      ];

      const volLastN: VolPromedioConfig = serverLastN ?? { recibido: 0, despachado: 0 };
      const serverMult = typeof serverSimMultiplier === 'number' ? serverSimMultiplier : 1;

      // Sincronizar multiplicador desde servidor
      setSimMultiplier(String(serverMult));

      const raw: RawSupabaseData = {
        cols, rows, mappedAreas,
        enrichedAreaDist: enrichedAreaDist as FormulaContext['areaDistribucion'],
        inversiones: (invData as InversionRecord[]) ?? [],
        gastosColsFijos,
        gastosFilas: (gastosFilData ?? []) as FormulaContext['gastosFilas'],
        moColData: (moColData ?? []) as FormulaContext['manoObraColumnas'],
        moFilData: (moFilData ?? []) as FormulaContext['manoObraFilas'],
        empData: (empData ?? []) as FormulaContext['manoObraEmpleados'],
        volColData: (volColData ?? []) as FormulaContext['volumenesColumnas'],
        volFilData: (volFilData ?? []) as FormulaContext['volumenesFilas'],
        volLastN,
        simMultiplier: serverMult,
      };

      setLoadState({ data: raw, loading: false, error: null, lastUpdated: new Date() });
    } catch (err) {
      setLoadState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const derived = useMemo(() => {
    if (!loadState.data) return null;
    return buildCtxFromRaw(loadState.data);
  }, [loadState.data]);

  const { loading, error, lastUpdated } = loadState;
  const columnas = loadState.data?.cols ?? [];
  const filas = derived?.enrichedFilas ?? [];
  const formulaCtx = derived?.formulaCtx ?? EMPTY_FORMULA_CTX;
  const volLastN = loadState.data?.volLastN ?? { recibido: 0, despachado: 0 };
  const isInitialLoad = loading && !loadState.data;

  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (error && !loadState.data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-14 h-14 flex items-center justify-center rounded-full bg-red-100">
            <i className="ri-error-warning-line text-2xl text-red-500" />
          </div>
          <p className="text-base font-semibold text-slate-700">Error al cargar los datos</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={loadData}
            className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line mr-2" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Construir simMultipliers como Record para CostosTableReadOnly (un valor global para todas las filas)
  const simMultipliers: Record<string, string> = {};
  filas.forEach(f => { simMultipliers[f.id] = simMultiplier; });

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500">
              <i className="ri-grid-line text-lg text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">Costos por Operación</h1>
              <p className="text-xs text-slate-400">Vista de solo lectura</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(volLastN.recibido > 0 || volLastN.despachado > 0) && (
              <span className="text-xs text-sky-600 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                <i className="ri-bar-chart-box-line" />
                Prom. IN: últ.&nbsp;{volLastN.recibido > 0 ? volLastN.recibido : 'todos'}
                &nbsp;·&nbsp;
                OUT: últ.&nbsp;{volLastN.despachado > 0 ? volLastN.despachado : 'todos'}
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                Actualizando...
              </span>
            )}
            {!loading && lastUpdated && (
              <span className="text-xs text-slate-400 hidden sm:block">
                <i className="ri-refresh-line mr-1" />
                Actualizado{' '}
                {lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {error && (
              <span className="text-xs text-red-500 flex items-center gap-1">
                <i className="ri-error-warning-line" />
                Error al actualizar
              </span>
            )}
            <button
              onClick={loadData}
              disabled={loading}
              title="Actualizar datos"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className={`ri-refresh-line text-sm ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-1.5 whitespace-nowrap">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Solo lectura
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {(filas.length > 0 || columnas.length > 0) && (
          <CostosSummary columnas={columnas} filas={filas} />
        )}
        <CostosTableReadOnly
          columnas={columnas}
          filas={filas}
          formulaCtx={formulaCtx}
          simMultipliers={simMultipliers}
          onSimMultiplierChange={handleSimChange}
        />
      </div>
    </div>
  );
}
