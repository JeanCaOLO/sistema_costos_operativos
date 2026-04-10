import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import type { Cotizacion, CotizacionItem } from '@/types/cotizaciones';
import type { CostoFila, CostoColumna } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula } from '@/lib/formulaEngine';
import type { Area } from '@/types/areas';
import type { InversionRecord } from '@/types/inversion';
import { useLocalStorageValue } from '@/hooks/useLocalStorageSync';
import type { VolPromedioConfig } from '@/hooks/useVolumenesPromedioConfig';
import CotizacionesList from './components/CotizacionesList';
import CotizacionFormModal from './components/CotizacionFormModal';
import CotizacionRowSelector from './components/CotizacionRowSelector';
import CotizacionTable from './components/CotizacionTable';
import type { FormulaConfig } from '@/types/costos';
import CotizacionPDFPreview from './components/CotizacionPDFPreview';

const VOL_LASTN_KEY = 'vol_promedio_lastN';

interface CotizacionTableItemRow {
  item: CotizacionItem;
  fila: CostoFila;
}

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [selectedCot, setSelectedCot] = useState<Cotizacion | null>(null);
  const [items, setItems] = useState<CotizacionItem[]>([]);
  const [costoFilas, setCostoFilas] = useState<CostoFila[]>([]);
  const [costoColumnas, setCostoColumnas] = useState<CostoColumna[]>([]);
  const [baseCtx, setBaseCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCot, setEditingCot] = useState<Cotizacion | null>(null);
  const [showPDF, setShowPDF] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);

  // columnas visibles de fórmula: null = ninguna (ocultas por defecto), Set = las activadas
  const columnasVisibles = useMemo<Set<string>>(() => {
    if (!selectedCot) return new Set<string>();
    if (!selectedCot.columnas_visibles || selectedCot.columnas_visibles.length === 0) return new Set<string>();
    return new Set(selectedCot.columnas_visibles);
  }, [selectedCot]);

  const volLastN = useLocalStorageValue<VolPromedioConfig>(
    VOL_LASTN_KEY,
    (raw) => {
      if (!raw) return { recibido: 0, despachado: 0 };
      try {
        const p = JSON.parse(raw) as Partial<VolPromedioConfig>;
        return { recibido: typeof p.recibido === 'number' ? p.recibido : 0, despachado: typeof p.despachado === 'number' ? p.despachado : 0 };
      } catch { return { recibido: 0, despachado: 0 }; }
    },
    { recibido: 0, despachado: 0 },
  );

  // Build formulaCtx reactively
  const formulaCtx = useMemo<FormulaContext>(() => {
    const cols = baseCtx.costosColumnas as CostoColumna[];
    const rows = baseCtx.costosFilas as CostoFila[];
    if (!cols || !rows) return baseCtx;
    const formulaCols = cols.filter(c => c.tipo === 'formula' && c.formula);
    const enriched = formulaCols.length > 0
      ? rows.map(row => {
          const extra: Record<string, number> = {};
          formulaCols.forEach(col => { extra[col.id] = calcularFormula(col.formula!, baseCtx, row.subproceso ?? ''); });
          return { ...row, valores: { ...row.valores, ...extra } };
        })
      : rows;
    return { ...baseCtx, costosFilas: enriched as FormulaContext['costosFilas'] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCtx, volLastN.recibido, volLastN.despachado]);

  // Load all base data + cotizaciones
  const loadData = useCallback(async () => {
    setLoading(true);
    const [
      { data: cotData },
      { data: colData },
      { data: filData },
      { data: invData },
      { data: gastosColData },
      { data: gastosFilData },
      { data: areaDistribData },
      { data: moColData },
      { data: moFilData },
      { data: volColData },
      { data: volFilData },
      { data: empData },
      { data: areasData },
    ] = await Promise.all([
      supabase.from('cotizaciones').select('*').order('updated_at', { ascending: false }),
      supabase.from('costos_columnas').select('*').order('orden'),
      supabase.from('costos_operacion').select('*').order('orden'),
      supabase.from('inversiones').select('*').order('created_at'),
      supabase.from('gastos_varios_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('gastos_varios').select('id, area, concepto, parent_id, es_total, tipo_fila, valores'),
      supabase.from('area_distribution').select('area_name, global_distribution_percentage'),
      supabase.from('mano_obra_columnas').select('id, nombre, tipo, is_sensitive').order('orden'),
      supabase.from('mano_obra').select('id, area, valores'),
      supabase.from('volumenes_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('volumenes').select('id, proceso, subproceso, valores'),
      supabase.from('mano_obra_empleados').select('*').eq('is_active', true),
      supabase.from('areas').select('id, nombre, metros_cuadrados, cantidad_racks, categoria').order('nombre'),
    ]);

    const cols = (colData as CostoColumna[]) ?? [];
    const rows = (filData as CostoFila[]) ?? [];
    setCostoColumnas(cols);
    setCostoFilas(rows);
    setCotizaciones((cotData as Cotizacion[]) ?? []);

    const areasArr = ((areasData ?? []) as Area[]);
    const mappedAreas = areasArr.map(a => ({ nombre: a.nombre, metros_cuadrados: a.metros_cuadrados ?? 0, cantidad_racks: a.cantidad_racks ?? 0 }));
    const categoryTotals: Record<string, number> = {};
    areasArr.forEach(a => { const cat = a.categoria ?? 'Sin categoría'; categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0); });
    const enrichedAreaDist = ((areaDistribData ?? []) as { area_name: string; global_distribution_percentage: number }[]).map(d => {
      const match = areasArr.find(a => a.nombre === d.area_name);
      const cat = match?.categoria ?? 'Sin categoría';
      const areaM2 = match?.metros_cuadrados ?? 0;
      const catTotal = categoryTotals[cat] ?? 0;
      return { ...d, categoria: cat, category_distribution_percentage: catTotal > 0 ? +((areaM2 / catTotal) * 100).toFixed(2) : 0 };
    });

    setBaseCtx({
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
      areasData: mappedAreas,
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load items when cotizacion selected
  const loadItems = useCallback(async (cotId: string) => {
    setLoadingItems(true);
    const { data } = await supabase.from('cotizacion_items').select('*').eq('cotizacion_id', cotId).order('orden');
    setItems((data as CotizacionItem[]) ?? []);
    setLoadingItems(false);
  }, []);

  useEffect(() => {
    if (selectedCot) loadItems(selectedCot.id);
    else setItems([]);
  }, [selectedCot, loadItems]);

  // Selected fila ids
  const selectedIds = useMemo(() => new Set(items.map(i => i.costo_fila_id)), [items]);

  // Toggle selection
  const handleToggle = useCallback(async (filaId: string) => {
    if (!selectedCot) return;
    const existing = items.find(i => i.costo_fila_id === filaId);
    if (existing) {
      await supabase.from('cotizacion_items').delete().eq('id', existing.id);
      setItems(prev => prev.filter(i => i.id !== existing.id));
    } else {
      const { data } = await supabase.from('cotizacion_items').insert({
        cotizacion_id: selectedCot.id,
        costo_fila_id: filaId,
        multiplicador: 1,
        orden: items.length,
        notas_item: '',
      }).select().maybeSingle();
      if (data) setItems(prev => [...prev, data as CotizacionItem]);
    }
  }, [selectedCot, items]);

  const handleSelectAll = useCallback(async (proceso: string) => {
    if (!selectedCot) return;
    const toAdd = costoFilas.filter(f => f.proceso === proceso && !selectedIds.has(f.id));
    if (toAdd.length === 0) return;
    const inserts = toAdd.map((f, idx) => ({ cotizacion_id: selectedCot.id, costo_fila_id: f.id, multiplicador: 1, orden: items.length + idx, notas_item: '' }));
    const { data } = await supabase.from('cotizacion_items').insert(inserts).select();
    if (data) setItems(prev => [...prev, ...(data as CotizacionItem[])]);
  }, [selectedCot, costoFilas, selectedIds, items.length]);

  const handleDeselectAll = useCallback(async (proceso: string) => {
    if (!selectedCot) return;
    const toRemove = items.filter(i => costoFilas.find(f => f.id === i.costo_fila_id && f.proceso === proceso));
    if (toRemove.length === 0) return;
    await supabase.from('cotizacion_items').delete().in('id', toRemove.map(i => i.id));
    setItems(prev => prev.filter(i => !toRemove.find(r => r.id === i.id)));
  }, [selectedCot, items, costoFilas]);

  const handleUpdateMultiplier = useCallback(async (itemId: string, value: number) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, multiplicador: value } : i));
    await supabase.from('cotizacion_items').update({ multiplicador: value }).eq('id', itemId);
  }, []);

  const handleUpdateNota = useCallback(async (itemId: string, value: string) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, notas_item: value } : i));
    await supabase.from('cotizacion_items').update({ notas_item: value }).eq('id', itemId);
  }, []);

  const handleRemoveItem = useCallback(async (itemId: string) => {
    await supabase.from('cotizacion_items').delete().eq('id', itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
  }, []);

  const handleUpdateFormulaOverride = useCallback(async (itemId: string, colId: string, formula: FormulaConfig) => {
    const existing = items.find(i => i.id === itemId);
    if (!existing) return;
    const newOverrides = { ...(existing.formulas_override ?? {}), [colId]: formula };
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, formulas_override: newOverrides } : i));
    await supabase.from('cotizacion_items').update({ formulas_override: newOverrides }).eq('id', itemId);
  }, [items]);

  const handleToggleColumna = useCallback(async (colId: string) => {
    if (!selectedCot) return;
    // columnasVisibles = Set de columnas de fórmula ACTIVADAS (vacío = todas ocultas)
    const currentSet = new Set(columnasVisibles);
    if (currentSet.has(colId)) {
      currentSet.delete(colId);
    } else {
      currentSet.add(colId);
    }
    const newVal = currentSet.size === 0 ? null : Array.from(currentSet);
    const updated = { ...selectedCot, columnas_visibles: newVal };
    setSelectedCot(updated);
    setCotizaciones(prev => prev.map(c => c.id === selectedCot.id ? updated : c));
    await supabase.from('cotizaciones').update({ columnas_visibles: newVal }).eq('id', selectedCot.id);
  }, [selectedCot, columnasVisibles]);

  const handleClearFormulaOverride = useCallback(async (itemId: string, colId: string) => {
    const existing = items.find(i => i.id === itemId);
    if (!existing) return;
    const newOverrides = { ...(existing.formulas_override ?? {}) };
    delete newOverrides[colId];
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, formulas_override: newOverrides } : i));
    await supabase.from('cotizacion_items').update({ formulas_override: newOverrides }).eq('id', itemId);
  }, [items]);

  const handleUpdateGlobalMult = useCallback(async (value: number) => {
    if (!selectedCot) return;
    const updated = { ...selectedCot, sim_multiplier: value };
    setSelectedCot(updated);
    setCotizaciones(prev => prev.map(c => c.id === selectedCot.id ? updated : c));
    setSavingGlobal(true);
    await supabase.from('cotizaciones').update({ sim_multiplier: value }).eq('id', selectedCot.id);
    setSavingGlobal(false);
  }, [selectedCot]);

  // Form handlers
  const handleSaveCot = useCallback(async (data: Partial<Cotizacion>) => {
    if (editingCot) {
      const { data: updated } = await supabase.from('cotizaciones').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingCot.id).select().maybeSingle();
      if (updated) {
        setCotizaciones(prev => prev.map(c => c.id === editingCot.id ? updated as Cotizacion : c));
        if (selectedCot?.id === editingCot.id) setSelectedCot(updated as Cotizacion);
      }
    } else {
      const { data: newCot } = await supabase.from('cotizaciones').insert(data).select().maybeSingle();
      if (newCot) {
        setCotizaciones(prev => [newCot as Cotizacion, ...prev]);
        setSelectedCot(newCot as Cotizacion);
      }
    }
    setEditingCot(null);
  }, [editingCot, selectedCot]);

  const handleDeleteCot = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta cotización? Se perderán todos sus ítems.')) return;
    await supabase.from('cotizaciones').delete().eq('id', id);
    setCotizaciones(prev => prev.filter(c => c.id !== id));
    if (selectedCot?.id === id) { setSelectedCot(null); setItems([]); }
  }, [selectedCot]);

  // Table items with fila data
  const tableItems = useMemo<CotizacionTableItemRow[]>(() => {
    return items
      .map(item => {
        const fila = costoFilas.find(f => f.id === item.costo_fila_id);
        if (!fila) return null;
        return { item, fila };
      })
      .filter(Boolean) as CotizacionTableItemRow[];
  }, [items, costoFilas]);

  if (loading) {
    return (
      <AppLayout title="Cotizaciones" subtitle="Cargando...">
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Cotizaciones"
      subtitle="Arma cotizaciones dinámicas basadas en los costos por operación"
      actions={
        selectedCot && (
          <div className="flex items-center gap-2">
            {savingGlobal && <span className="text-xs text-slate-400">Guardando...</span>}
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-close-line text-orange-500 text-sm" />
              </div>
              <span className="text-xs text-orange-600 font-semibold whitespace-nowrap">Mult. global:</span>
              <input
                type="number"
                value={selectedCot.sim_multiplier}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) handleUpdateGlobalMult(v);
                }}
                step="any"
                min="0"
                className="w-16 bg-white border border-orange-300 rounded px-2 py-1 text-xs font-bold text-orange-700 focus:outline-none text-center"
              />
            </div>
            <button
              onClick={() => setShowPDF(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-printer-line" />
              </div>
              Exportar PDF
            </button>
          </div>
        )
      }
    >
      <div className="flex gap-5 h-[calc(100vh-140px)]">
        {/* Left panel: list + selector */}
        <div className="flex flex-col gap-4 w-72 flex-shrink-0">
          {/* Cotizaciones list */}
          <div style={{ height: 280 }}>
            <CotizacionesList
              cotizaciones={cotizaciones}
              selectedId={selectedCot?.id ?? null}
              onSelect={setSelectedCot}
              onNew={() => { setEditingCot(null); setShowFormModal(true); }}
              onEdit={c => { setEditingCot(c); setShowFormModal(true); }}
              onDelete={handleDeleteCot}
            />
          </div>

          {/* Row selector */}
          {selectedCot ? (
            <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Seleccionar subprocesos</p>
                <p className="text-xs text-slate-400 mt-0.5">Clic para agregar o quitar de la cotización</p>
              </div>
              <div className="flex-1 overflow-hidden">
                {loadingItems ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <CotizacionRowSelector
                    filas={costoFilas}
                    columnas={costoColumnas}
                    formulaCtx={formulaCtx}
                    selectedIds={selectedIds}
                    onToggle={handleToggle}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-xl border border-slate-200 border-dashed flex flex-col items-center justify-center gap-3 text-center p-6">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
                <i className="ri-arrow-left-up-line text-xl text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 font-medium">Selecciona una cotización</p>
              <p className="text-xs text-slate-400">o crea una nueva para empezar a armar la tabla</p>
            </div>
          )}
        </div>

        {/* Right panel: cotizacion table */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selectedCot ? (
            <>
              {/* Header */}
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{selectedCot.nombre}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-building-4-line text-xs text-slate-400" />
                      </div>
                      <span className="text-sm text-slate-500">{selectedCot.cliente}</span>
                    </div>
                    {selectedCot.descripcion && (
                      <span className="text-xs text-slate-400 truncate max-w-xs">{selectedCot.descripcion}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-400">
                    {tableItems.length} ítem{tableItems.length !== 1 ? 's' : ''} seleccionado{tableItems.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto">
                <CotizacionTable
                  items={tableItems}
                  columnas={costoColumnas}
                  formulaCtx={formulaCtx}
                  onUpdateMultiplier={handleUpdateMultiplier}
                  onUpdateNota={handleUpdateNota}
                  onRemoveItem={handleRemoveItem}
                  onUpdateFormulaOverride={handleUpdateFormulaOverride}
                  onClearFormulaOverride={handleClearFormulaOverride}
                  globalMultiplier={selectedCot.sim_multiplier}
                  columnasVisibles={columnasVisibles}
                  onToggleColumna={handleToggleColumna}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white rounded-xl border border-slate-200 border-dashed">
              <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-100">
                <i className="ri-file-list-3-line text-2xl text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-slate-600 font-semibold">Ninguna cotización seleccionada</p>
                <p className="text-slate-400 text-sm mt-1">Selecciona una cotización de la lista o crea una nueva</p>
              </div>
              <button
                onClick={() => { setEditingCot(null); setShowFormModal(true); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line" />
                Nueva cotización
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Form modal */}
      {showFormModal && (
        <CotizacionFormModal
          editing={editingCot}
          onClose={() => { setShowFormModal(false); setEditingCot(null); }}
          onSave={handleSaveCot}
        />
      )}

      {/* PDF preview */}
      {showPDF && selectedCot && (
        <CotizacionPDFPreview
          cotizacion={selectedCot}
          items={tableItems}
          columnas={costoColumnas}
          formulaCtx={formulaCtx}
          onClose={() => setShowPDF(false)}
        />
      )}
    </AppLayout>
  );
}
