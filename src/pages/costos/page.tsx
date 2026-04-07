import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import type { CostoColumna, CostoFila, ColumnType, FormulaConfig } from '@/types/costos';
import type { Area } from '@/types/areas';
import type { InversionRecord } from '@/types/inversion';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula } from '@/lib/formulaEngine';
import { useLocalStorageValue } from '@/hooks/useLocalStorageSync';
import type { VolPromedioConfig } from '@/hooks/useVolumenesPromedioConfig';
import CostosTable from './components/CostosTable';
import CostosSummary from './components/CostosSummary';
import AddColumnModal from './components/AddColumnModal';

const VOL_LASTN_KEY = 'vol_promedio_lastN';

type ModalState = { open: false } | { open: true; editing: CostoColumna | null };

// Datos base de Supabase (sin depender de lastN)
interface BaseCtxData {
  cols: CostoColumna[];
  rows: CostoFila[];
  baseCtx: FormulaContext;
}

export default function CostosPage() {
  const [columnas, setColumnas] = useState<CostoColumna[]>([]);
  const [filas, setFilas] = useState<CostoFila[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [baseCtxData, setBaseCtxData] = useState<BaseCtxData | null>(null);

  // Escuchar cambios en lastN de volúmenes para recalcular formulaCtx reactivamente
  const volLastN = useLocalStorageValue<VolPromedioConfig>(
    VOL_LASTN_KEY,
    (raw) => {
      if (!raw) return { recibido: 0, despachado: 0 };
      try {
        const p = JSON.parse(raw) as Partial<VolPromedioConfig>;
        return {
          recibido: typeof p.recibido === 'number' ? p.recibido : 0,
          despachado: typeof p.despachado === 'number' ? p.despachado : 0,
        };
      } catch {
        return { recibido: 0, despachado: 0 };
      }
    },
    { recibido: 0, despachado: 0 },
  );

  // Reconstruir formulaCtx cada vez que cambian los datos base O el lastN
  const formulaCtx = useMemo<FormulaContext>(() => {
    if (!baseCtxData) return EMPTY_FORMULA_CTX;
    const { cols, rows, baseCtx } = baseCtxData;
    const formulaTypeCols = cols.filter(c => c.tipo === 'formula' && c.formula);
    const enrichedRows: CostoFila[] = formulaTypeCols.length > 0
      ? rows.map(row => {
          const extra: Record<string, number> = {};
          formulaTypeCols.forEach(col => {
            extra[col.id] = calcularFormula(col.formula!, baseCtx, row.subproceso ?? '');
          });
          return { ...row, valores: { ...row.valores, ...extra } };
        })
      : rows;
    return { ...baseCtx, costosFilas: enrichedRows as FormulaContext['costosFilas'] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCtxData, volLastN.recibido, volLastN.despachado]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [
      { data: colData },
      { data: filData },
      { data: areasData },
      { data: invData },
      { data: gastosColData },
      { data: gastosFilData },
      { data: areaDistribData },
      { data: moColData },
      { data: moFilData },
      { data: volColData },
      { data: volFilData },
      { data: empData },
    ] = await Promise.all([
      supabase.from('costos_columnas').select('*').order('orden'),
      supabase.from('costos_operacion').select('*').order('orden'),
      supabase.from('areas').select('id, nombre, metros_cuadrados, cantidad_racks, categoria').order('nombre'),
      supabase.from('inversiones').select('*').order('created_at'),
      supabase.from('gastos_varios_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('gastos_varios').select('id, area, concepto, parent_id, es_total, tipo_fila, valores'),
      supabase.from('area_distribution').select('area_name, global_distribution_percentage'),
      supabase.from('mano_obra_columnas').select('id, nombre, tipo, is_sensitive').order('orden'),
      supabase.from('mano_obra').select('id, area, valores'),
      supabase.from('volumenes_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('volumenes').select('id, proceso, subproceso, valores'),
      supabase.from('mano_obra_empleados').select('*').eq('is_active', true),
    ]);

    const cols = (colData as CostoColumna[]) ?? [];
    const rows = (filData as CostoFila[]) ?? [];
    setColumnas(cols);
    setFilas(rows);
    setAreas((areasData as Area[]) ?? []);

    const mappedAreasData = ((areasData ?? []) as Area[]).map(a => ({
      nombre: a.nombre,
      metros_cuadrados: a.metros_cuadrados ?? 0,
      cantidad_racks: a.cantidad_racks ?? 0,
    }));

    // ── Enrich areaDistribucion with categoria + category_distribution_percentage ──
    const areasWithCat = ((areasData ?? []) as Area[]);
    const categoryTotals: Record<string, number> = {};
    areasWithCat.forEach(a => {
      const cat = a.categoria ?? 'Sin categoría';
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0);
    });

    const enrichedAreaDist = ((areaDistribData ?? []) as { area_name: string; global_distribution_percentage: number }[]).map(d => {
      const match = areasWithCat.find(a => a.nombre === d.area_name);
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

    // ── Guardar datos base (sin pre-calcular fórmulas) ────────────────────
    // El formulaCtx se reconstruye reactivamente en el useMemo de arriba,
    // lo que permite que cambie el lastN de volúmenes sin recargar Supabase.
    const baseCtx: FormulaContext = {
      inversiones: (invData as InversionRecord[]) ?? [],
      gastosColumnas: (gastosColData ?? []) as FormulaContext['gastosColumnas'],
      gastosFilas: (gastosFilData ?? []) as FormulaContext['gastosFilas'],
      areaDistribucion: enrichedAreaDist as FormulaContext['areaDistribucion'],
      manoObraColumnas: (moColData ?? []) as FormulaContext['manoObraColumnas'],
      manoObraFilas: (moFilData ?? []) as FormulaContext['manoObraFilas'],
      manoObraEmpleados: (empData ?? []) as FormulaContext['manoObraEmpleados'],
      volumenesColumnas: (volColData ?? []) as FormulaContext['volumenesColumnas'],
      volumenesFilas: (volFilData ?? []) as FormulaContext['volumenesFilas'],
      costosColumnas: cols as FormulaContext['costosColumnas'],
      costosFilas: rows as FormulaContext['costosFilas'],
      areasData: mappedAreasData,
    };

    setBaseCtxData({ cols, rows, baseCtx });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ---------- COLUMNS ----------
  const handleSaveColumn = async (data: {
    nombre: string;
    tipo: ColumnType;
    opciones: string[];
    formula?: FormulaConfig;
  }) => {
    const isEditing = modalState.open && modalState.editing;
    const payload = {
      nombre: data.nombre,
      tipo: data.tipo,
      opciones: data.opciones,
      formula: data.formula ?? null,
    };

    if (isEditing && modalState.editing) {
      await supabase
        .from('costos_columnas')
        .update(payload)
        .eq('id', modalState.editing.id);
    } else {
      await supabase
        .from('costos_columnas')
        .insert({ ...payload, orden: columnas.length });
    }
    setModalState({ open: false });
    // Reload everything so formulaCtx is rebuilt with updated formula columns
    await loadData();
  };

  const handleDeleteColumn = async (id: string) => {
    if (!confirm('¿Eliminar esta columna? Se perderán todos los valores registrados en ella.')) return;
    await supabase.from('costos_columnas').delete().eq('id', id);
    setColumnas(prev => prev.filter(c => c.id !== id));
    setFilas(prev => prev.map(f => {
      const newVals = { ...f.valores };
      delete newVals[id];
      return { ...f, valores: newVals };
    }));
  };

  // ---------- ROWS ----------
  const handleAddFila = async () => {
    const { data: newFila } = await supabase
      .from('costos_operacion')
      .insert({ proceso: 'Nuevo proceso', subproceso: '', valores: {}, orden: filas.length })
      .select()
      .maybeSingle();
    if (newFila) setFilas(prev => [...prev, newFila as CostoFila]);
  };

  const handleAddFilaForProceso = useCallback(async (proceso: string) => {
    const { data: newFila } = await supabase
      .from('costos_operacion')
      .insert({ proceso, subproceso: '', valores: {}, orden: filas.length })
      .select()
      .maybeSingle();
    if (newFila) setFilas(prev => [...prev, newFila as CostoFila]);
  }, [filas.length]);

  const handleUpdateFila = useCallback(async (id: string, field: string, value: string | number) => {
    setSavingId(id);
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    await supabase.from('costos_operacion').update({ [field]: value }).eq('id', id);
    setSavingId(null);
  }, []);

  const handleUpdateCell = useCallback(async (id: string, columnaId: string, value: string | number) => {
    setSavingId(id);
    setFilas(prev => prev.map(f => {
      if (f.id !== id) return f;
      return { ...f, valores: { ...f.valores, [columnaId]: value } };
    }));
    const fila = filas.find(f => f.id === id);
    if (!fila) { setSavingId(null); return; }
    await supabase.from('costos_operacion').update({ valores: { ...fila.valores, [columnaId]: value } }).eq('id', id);
    setSavingId(null);
  }, [filas]);

  const handleDeleteFila = async (id: string) => {
    await supabase.from('costos_operacion').delete().eq('id', id);
    setFilas(prev => prev.filter(f => f.id !== id));
  };

  // ---------- ROW FORMULAS ----------
  const handleSaveRowFormula = useCallback(async (rowId: string, colId: string, formula: import('@/types/costos').FormulaConfig) => {
    const fila = filas.find(f => f.id === rowId);
    if (!fila) return;
    const newFormulas = { ...(fila.formulas ?? {}), [colId]: formula };
    setFilas(prev => prev.map(f => f.id === rowId ? { ...f, formulas: newFormulas } : f));
    await supabase.from('costos_operacion').update({ formulas: newFormulas }).eq('id', rowId);
    // Rebuild formula context so formula results are fresh
    await loadData();
  }, [filas, loadData]);

  // ---------- COLUMN REORDER ----------
  const handleReorderColumns = useCallback(async (newOrder: CostoColumna[]) => {
    // Optimistic update
    setColumnas(newOrder);
    // Persist new orden values to Supabase
    await Promise.all(
      newOrder.map((col, idx) =>
        supabase.from('costos_columnas').update({ orden: idx }).eq('id', col.id)
      )
    );
  }, []);

  const handleClearRowFormula = useCallback(async (rowId: string, colId: string) => {
    const fila = filas.find(f => f.id === rowId);
    if (!fila) return;
    const newFormulas = { ...(fila.formulas ?? {}) };
    delete newFormulas[colId];
    setFilas(prev => prev.map(f => f.id === rowId ? { ...f, formulas: newFormulas } : f));
    await supabase.from('costos_operacion').update({ formulas: newFormulas }).eq('id', rowId);
    await loadData();
  }, [filas, loadData]);

  // Count data sources for banner
  const srcCount = {
    inversiones: formulaCtx.inversiones.length,
    gastosFilas: formulaCtx.gastosFilas.length,
    moColumnas: (formulaCtx.manoObraColumnas ?? []).filter(c => ['moneda', 'numero', 'porcentaje'].includes(c.tipo ?? '') && !c.is_sensitive).length,
    volColumnas: (formulaCtx.volumenesColumnas ?? []).filter(c => ['moneda', 'numero'].includes(c.tipo ?? '')).length,
    areas: formulaCtx.areaDistribucion.length,
    areasM2: (formulaCtx.areasData ?? []).filter(a => (a.metros_cuadrados ?? 0) > 0).length,
  };
  const hasSources = srcCount.inversiones > 0 || srcCount.gastosFilas > 0 || srcCount.moColumnas > 0 || srcCount.volColumnas > 0 || srcCount.areasM2 > 0;

  if (loading) {
    return (
      <AppLayout title="Costos por Operación" subtitle="Cargando módulo...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando datos...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Costos por Operación"
      subtitle="Matriz editable con fórmulas vinculadas a todos los módulos del sistema"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalState({ open: true, editing: null })}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar columna
          </button>
          <button
            onClick={handleAddFila}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar fila
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Data sources banner */}
        {hasSources && (
          <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 border border-violet-100 rounded-xl flex-wrap">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-functions text-violet-500" />
            </div>
            <p className="text-xs text-violet-700 font-medium">Fuentes disponibles para fórmulas:</p>
            {srcCount.inversiones > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-building-2-line mr-1" />{srcCount.inversiones} inversión{srcCount.inversiones !== 1 ? 'es' : ''}
              </span>
            )}
            {srcCount.gastosFilas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-receipt-line mr-1" />{srcCount.gastosFilas} concepto{srcCount.gastosFilas !== 1 ? 's' : ''} gastos varios
              </span>
            )}
            {srcCount.moColumnas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-user-3-line mr-1" />{srcCount.moColumnas} col. mano de obra
              </span>
            )}
            {srcCount.volColumnas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-bar-chart-box-line mr-1" />{srcCount.volColumnas} col. volúmenes
              </span>
            )}
            {srcCount.areas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-pie-chart-line mr-1" />{srcCount.areas} áreas de distribución
              </span>
            )}
            {srcCount.areasM2 > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-layout-grid-line mr-1" />{srcCount.areasM2} áreas con M² y racks
              </span>
            )}
          </div>
        )}

        {(filas.length > 0 || columnas.length > 0) && (
          <CostosSummary columnas={columnas} filas={filas} />
        )}

        <CostosTable
          columnas={columnas}
          filas={filas}
          areas={areas}
          savingId={savingId}
          onAddColumn={() => setModalState({ open: true, editing: null })}
          onEditColumn={col => setModalState({ open: true, editing: col })}
          onDeleteColumn={handleDeleteColumn}
          onAddFila={handleAddFila}
          onUpdateFila={handleUpdateFila}
          onUpdateCell={handleUpdateCell}
          onDeleteFila={handleDeleteFila}
          onSaveRowFormula={handleSaveRowFormula}
          onClearRowFormula={handleClearRowFormula}
          onAddFilaForProceso={handleAddFilaForProceso}
          onReorderColumns={handleReorderColumns}
          formulaCtx={formulaCtx}
        />

        {modalState.open && (
          <AddColumnModal
            onClose={() => setModalState({ open: false })}
            onSave={handleSaveColumn}
            editing={modalState.editing}
            formulaCtx={formulaCtx}
          />
        )}
      </div>
    </AppLayout>
  );
}
