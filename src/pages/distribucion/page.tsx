import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '../../components/feature/AppLayout';
import { supabase, isSupabaseReady } from '../../lib/supabase';
import type { AreaDistribution } from '../../types/areas';
import { TIPO_COLORS } from '../../types/areas';
import DistribucionStats from './components/DistribucionStats';
import DistribucionTable from './components/DistribucionTable';
import DistribucionCharts from './components/DistribucionCharts';

type ViewMode = 'table' | 'chart';
type FilterCategoria = 'all' | 'Interior' | 'Exterior';

interface RawArea {
  id: string;
  nombre: string;
  metros_cuadrados: number;
  categoria: string | null;
  activo: boolean;
  created_at: string;
  tipos_area: { nombre: string; color: string; icono: string } | null;
}

function buildDistribution(rows: RawArea[]): AreaDistribution[] {
  const typeMap: Record<string, number> = {};
  const categoryMap: Record<string, number> = {};
  let globalTotal = 0;

  rows.forEach((r) => {
    const tipo = r.tipos_area?.nombre ?? 'Sin tipo';
    const cat = r.categoria ?? 'Sin categoría';
    typeMap[tipo] = (typeMap[tipo] ?? 0) + (r.metros_cuadrados ?? 0);
    categoryMap[cat] = (categoryMap[cat] ?? 0) + (r.metros_cuadrados ?? 0);
    globalTotal += r.metros_cuadrados ?? 0;
  });

  return rows
    .map((r) => {
      const tipo = r.tipos_area?.nombre ?? 'Sin tipo';
      const cat = r.categoria ?? 'Sin categoría';
      const m2 = r.metros_cuadrados ?? 0;
      return {
        id: r.id,
        area_name: r.nombre,
        area_type: tipo,
        area_type_color: r.tipos_area?.color ?? null,
        area_type_icon: r.tipos_area?.icono ?? null,
        square_meters: m2,
        categoria: cat,
        created_at: r.created_at,
        type_distribution_percentage: typeMap[tipo] > 0 ? +((m2 / typeMap[tipo]) * 100).toFixed(2) : 0,
        global_distribution_percentage: globalTotal > 0 ? +((m2 / globalTotal) * 100).toFixed(2) : 0,
        category_distribution_percentage: categoryMap[cat] > 0 ? +((m2 / categoryMap[cat]) * 100).toFixed(2) : 0,
      };
    })
    .sort((a, b) => b.global_distribution_percentage - a.global_distribution_percentage);
}

export default function DistribucionPage() {
  const [data, setData] = useState<AreaDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategoria, setFilterCategoria] = useState<FilterCategoria>('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const fetchData = useCallback(async () => {
    if (!isSupabaseReady || !supabase) {
      setError('NO_SUPABASE');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: err } = await supabase
        .from('areas')
        .select(`
          id,
          nombre,
          metros_cuadrados,
          categoria,
          activo,
          created_at,
          tipos_area!tipo_area_id (
            nombre,
            color,
            icono
          )
        `)
        .eq('activo', true)
        .gt('metros_cuadrados', 0);
      if (err) throw err;
      setData(buildDistribution((rows ?? []) as unknown as RawArea[]));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // When category filter changes, reset tipo filter
  const handleCategoriaChange = (cat: FilterCategoria) => {
    setFilterCategoria(cat);
    setFilterTipo('all');
  };

  const categoriaData = useMemo(() => {
    if (filterCategoria === 'all') return data;
    return data.filter((d) => d.categoria === filterCategoria);
  }, [data, filterCategoria]);

  const tiposUnicos = useMemo(() => {
    const seen = new Set<string>();
    return categoriaData.filter((d) => {
      if (seen.has(d.area_type)) return false;
      seen.add(d.area_type);
      return true;
    }).map((d) => ({ tipo: d.area_type, color: d.area_type_color, icon: d.area_type_icon }));
  }, [categoriaData]);

  const filteredData = useMemo(() => {
    if (filterTipo === 'all') return categoriaData;
    return categoriaData.filter((d) => d.area_type === filterTipo);
  }, [categoriaData, filterTipo]);

  if (loading) {
    return (
      <AppLayout title="Distribución de Áreas" subtitle="Cargando datos...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Calculando distribuciones...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    const isNoSupabase = error === 'NO_SUPABASE';
    return (
      <AppLayout title="Distribución de Áreas" subtitle="Error de conexión">
        <div className="flex items-center justify-center py-32">
          <div className="text-center max-w-sm">
            <div className={`w-14 h-14 flex items-center justify-center rounded-full mx-auto mb-4 ${isNoSupabase ? 'bg-amber-100' : 'bg-rose-100'}`}>
              <i className={`text-3xl ${isNoSupabase ? 'ri-database-2-line text-amber-500' : 'ri-error-warning-line text-rose-500'}`} />
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-2">
              {isNoSupabase ? 'Supabase no está configurado' : 'Error al cargar datos'}
            </p>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">{isNoSupabase ? 'Las variables de entorno de Supabase no están disponibles.' : error}</p>
            {!isNoSupabase && (
              <button onClick={fetchData} className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap">
                Reintentar
              </button>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  const interiorData = data.filter((d) => d.categoria === 'Interior');
  const exteriorData = data.filter((d) => d.categoria === 'Exterior');

  return (
    <AppLayout
      title="Distribución de Áreas"
      subtitle="Visualiza el porcentaje de distribución de cada área por categoría, tipo y a nivel global"
    >
      {/* Stats */}
      <DistribucionStats
        data={data}
        filterCategoria={filterCategoria}
        interiorData={interiorData}
        exteriorData={exteriorData}
      />

      {/* Category Tabs */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* Category tabs */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            {([
              { id: 'all', label: 'Todas las áreas', icon: 'ri-layout-grid-line' },
              { id: 'Interior', label: 'Interior', icon: 'ri-home-4-line' },
              { id: 'Exterior', label: 'Exterior', icon: 'ri-sun-line' },
            ] as { id: FilterCategoria; label: string; icon: string }[]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleCategoriaChange(opt.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                  filterCategoria === opt.id
                    ? opt.id === 'Interior'
                      ? 'bg-amber-500 text-white'
                      : opt.id === 'Exterior'
                        ? 'bg-sky-500 text-white'
                        : 'bg-white text-slate-800'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className={`${opt.icon} text-sm`} />
                </div>
                {opt.label}
                {opt.id !== 'all' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    filterCategoria === opt.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {opt.id === 'Interior' ? interiorData.length : exteriorData.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tipo filter (within selected category) */}
          {tiposUnicos.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
              <button
                onClick={() => setFilterTipo('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${filterTipo === 'all' ? 'bg-white text-slate-800 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Todos los tipos
              </button>
              {tiposUnicos.map((t) => (
                <button
                  key={t.tipo}
                  onClick={() => setFilterTipo(t.tipo)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${filterTipo === t.tipo ? 'bg-white text-slate-800 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {t.tipo}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-refresh-line text-sm" /></div>
            Recalcular
          </button>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${viewMode === 'table' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <div className="w-4 h-4 flex items-center justify-center"><i className="ri-table-line" /></div>
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${viewMode === 'chart' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <div className="w-4 h-4 flex items-center justify-center"><i className="ri-bar-chart-horizontal-line" /></div>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {data.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100 mb-4">
            <i className="ri-pie-chart-line text-slate-400 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">Sin datos de distribución</p>
          <p className="text-xs text-slate-400 max-w-xs text-center">
            Asegúrate de que las áreas tengan metros cuadrados registrados.
          </p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100 mb-3">
            <i className={`text-xl ${filterCategoria === 'Interior' ? 'ri-home-4-line text-amber-400' : 'ri-sun-line text-sky-400'}`} />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">Sin áreas {filterCategoria !== 'all' ? `en categoría ${filterCategoria}` : ''}</p>
          <p className="text-xs text-slate-400">Asigna la categoría a las áreas desde el módulo de Áreas.</p>
        </div>
      ) : viewMode === 'table' ? (
        <DistribucionTable data={filteredData} tipoColors={TIPO_COLORS} filterCategoria={filterCategoria} />
      ) : (
        <DistribucionCharts data={filteredData} tiposUnicos={tiposUnicos} filterCategoria={filterCategoria} />
      )}
    </AppLayout>
  );
}
