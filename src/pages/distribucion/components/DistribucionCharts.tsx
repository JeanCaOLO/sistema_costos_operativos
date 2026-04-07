import { useMemo } from 'react';
import type { AreaDistribution } from '../../../types/areas';
import { TIPO_COLORS } from '../../../types/areas';

type FilterCategoria = 'all' | 'Interior' | 'Exterior';

interface DistribucionChartsProps {
  data: AreaDistribution[];
  tiposUnicos: { tipo: string; color: string | null; icon: string | null }[];
  filterCategoria: FilterCategoria;
}

const COLOR_PALETTE: Record<string, string> = {
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  orange: '#f97316',
  default: '#94a3b8',
};

function HorizontalBar({ label, value, max, hexColor, subLabel }: {
  label: string;
  value: number;
  max: number;
  hexColor: string;
  subLabel?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="w-32 shrink-0 text-right">
        <p className="text-xs font-medium text-slate-700 truncate">{label}</p>
        {subLabel && <p className="text-xs text-slate-400 truncate">{subLabel}</p>}
      </div>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: hexColor }} />
      </div>
      <span className="w-14 text-right text-xs font-semibold text-slate-700 tabular-nums shrink-0">{value.toFixed(2)}%</span>
    </div>
  );
}

interface CategoryPanelProps {
  label: string;
  icon: string;
  iconColor: string;
  accentColor: string;
  hexColor: string;
  items: AreaDistribution[];
  showTypeBreakdown?: boolean;
}

function CategoryPanel({ label, icon, iconColor, accentColor, hexColor, items, showTypeBreakdown }: CategoryPanelProps) {
  const sorted = [...items].sort((a, b) => b.category_distribution_percentage - a.category_distribution_percentage);
  const maxCat = Math.max(...sorted.map((d) => d.category_distribution_percentage), 0);

  const typeAggregates = useMemo(() => {
    const map: Record<string, { color: string | null; icon: string | null; m2: number; catPct: number; count: number }> = {};
    items.forEach((d) => {
      if (!map[d.area_type]) map[d.area_type] = { color: d.area_type_color, icon: d.area_type_icon, m2: 0, catPct: 0, count: 0 };
      map[d.area_type].m2 += d.square_meters;
      map[d.area_type].catPct += d.category_distribution_percentage;
      map[d.area_type].count += 1;
    });
    return Object.entries(map)
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => b.catPct - a.catPct);
  }, [items]);

  const maxType = Math.max(...typeAggregates.map((t) => t.catPct), 0);

  if (items.length === 0) {
    return (
      <div className={`bg-white rounded-xl border-2 ${accentColor} p-5 flex flex-col items-center justify-center py-10`}>
        <i className={`${icon} ${iconColor} text-3xl mb-2`} />
        <p className="text-sm text-slate-400">Sin áreas en {label}</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border-2 ${accentColor} p-5`}>
      <div className="flex items-center gap-2 mb-5">
        <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${label === 'Interior' ? 'bg-amber-50' : 'bg-sky-50'}`}>
          <i className={`${icon} ${iconColor} text-base`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-400">{items.length} área{items.length !== 1 ? 's' : ''} · {items.reduce((s, d) => s + d.square_meters, 0).toLocaleString()} m²</p>
        </div>
      </div>

      {/* Areas within category */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">% dentro de {label}</p>
      <div className="space-y-2.5 mb-5">
        {sorted.map((row) => (
          <HorizontalBar
            key={row.id}
            label={row.area_name}
            subLabel={`${row.square_meters.toLocaleString()} m²`}
            value={row.category_distribution_percentage}
            max={maxCat}
            hexColor={hexColor}
          />
        ))}
      </div>

      {/* Type breakdown within category */}
      {showTypeBreakdown && typeAggregates.length > 1 && (
        <>
          <div className="border-t border-slate-100 my-4" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Por tipo dentro de {label}</p>
          <div className="space-y-2.5">
            {typeAggregates.map((t) => (
              <HorizontalBar
                key={t.tipo}
                label={t.tipo}
                subLabel={`${t.count} área${t.count !== 1 ? 's' : ''} · ${t.m2.toLocaleString()} m²`}
                value={t.catPct}
                max={maxType}
                hexColor={COLOR_PALETTE[t.color ?? ''] ?? COLOR_PALETTE.default}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DistribucionCharts({ data, tiposUnicos, filterCategoria }: DistribucionChartsProps) {
  const interiorData = useMemo(() => data.filter((d) => d.categoria === 'Interior'), [data]);
  const exteriorData = useMemo(() => data.filter((d) => d.categoria === 'Exterior'), [data]);

  const typeAggregates = useMemo(() =>
    tiposUnicos.map((t) => {
      const items = data.filter((d) => d.area_type === t.tipo);
      return {
        ...t,
        totalPct: items.reduce((s, d) => s + d.global_distribution_percentage, 0),
        totalM2: items.reduce((s, d) => s + d.square_meters, 0),
        count: items.length,
      };
    }).sort((a, b) => b.totalPct - a.totalPct),
  [tiposUnicos, data]);
  const maxTypePct = Math.max(...typeAggregates.map((t) => t.totalPct), 0);

  const maxGlobal = Math.max(...data.map((d) => d.global_distribution_percentage), 0);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16">
        <p className="text-sm text-slate-400">No hay datos para visualizar.</p>
      </div>
    );
  }

  // Filtered by category: show full analysis for that category
  if (filterCategoria !== 'all') {
    return (
      <div className="grid grid-cols-2 gap-5">
        <CategoryPanel
          label={filterCategoria}
          icon={filterCategoria === 'Interior' ? 'ri-home-4-line' : 'ri-sun-line'}
          iconColor={filterCategoria === 'Interior' ? 'text-amber-500' : 'text-sky-500'}
          accentColor={filterCategoria === 'Interior' ? 'border-amber-200' : 'border-sky-200'}
          hexColor={filterCategoria === 'Interior' ? '#f59e0b' : '#0ea5e9'}
          items={data}
          showTypeBreakdown
        />
        <div className="space-y-5">
          {/* Global distribution for this filtered set */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50">
                <i className="ri-global-line text-emerald-600 text-sm" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Peso Global</p>
                <p className="text-xs text-slate-400">% de cada área sobre el total general</p>
              </div>
            </div>
            <div className="space-y-3">
              {[...data].sort((a, b) => b.global_distribution_percentage - a.global_distribution_percentage).map((row) => (
                <HorizontalBar
                  key={row.id}
                  label={row.area_name}
                  subLabel={`${row.square_meters.toLocaleString()} m²`}
                  value={row.global_distribution_percentage}
                  max={maxGlobal}
                  hexColor="#10b981"
                />
              ))}
            </div>
          </div>

          {/* Type aggregates */}
          {typeAggregates.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100">
                  <i className="ri-stack-line text-slate-600 text-sm" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Por Tipo de Área</p>
                  <p className="text-xs text-slate-400">Peso global por tipo</p>
                </div>
              </div>
              <div className="space-y-3">
                {typeAggregates.map((t) => (
                  <div key={t.tipo} className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[t.color ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                        {t.icon && <i className={`${t.icon} text-xs`} />}
                        {t.tipo}
                      </span>
                    </div>
                    <HorizontalBar
                      label={`${t.count} área${t.count !== 1 ? 's' : ''}`}
                      subLabel={`${t.totalM2.toLocaleString()} m²`}
                      value={t.totalPct}
                      max={maxTypePct}
                      hexColor={COLOR_PALETTE[t.color ?? ''] ?? COLOR_PALETTE.default}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // All: show side-by-side Interior vs Exterior + global
  return (
    <div className="space-y-5">
      {/* Side by side category panels */}
      <div className="grid grid-cols-2 gap-5">
        <CategoryPanel
          label="Interior"
          icon="ri-home-4-line"
          iconColor="text-amber-500"
          accentColor="border-amber-200"
          hexColor="#f59e0b"
          items={interiorData}
          showTypeBreakdown
        />
        <CategoryPanel
          label="Exterior"
          icon="ri-sun-line"
          iconColor="text-sky-500"
          accentColor="border-sky-200"
          hexColor="#0ea5e9"
          items={exteriorData}
          showTypeBreakdown
        />
      </div>

      {/* Global distribution across all */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50">
            <i className="ri-global-line text-emerald-600 text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Distribución Global — Todas las áreas</p>
            <p className="text-xs text-slate-400">% de cada área sobre el total general (Interior + Exterior)</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-3">
          {[...data].sort((a, b) => b.global_distribution_percentage - a.global_distribution_percentage).map((row) => {
            const isInterior = row.categoria === 'Interior';
            const hexColor = isInterior ? '#f59e0b' : row.categoria === 'Exterior' ? '#0ea5e9' : '#94a3b8';
            return (
              <HorizontalBar
                key={row.id}
                label={row.area_name}
                subLabel={`${row.categoria} · ${row.square_meters.toLocaleString()} m²`}
                value={row.global_distribution_percentage}
                max={maxGlobal}
                hexColor={hexColor}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
