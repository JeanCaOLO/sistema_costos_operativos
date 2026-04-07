import { useState, useEffect } from 'react';
import type { Area, TipoArea, Zona, CategoriaArea } from '../../../types/areas';

interface AreaModalProps {
  area: Area | null;
  tipos: TipoArea[];
  zonas: Zona[];
  areas: Area[];
  defaultParentId: string | null;
  onClose: () => void;
  onSave: (area: Omit<Area, 'id' | 'created_at'>) => Promise<void>;
  saving: boolean;
}

export default function AreaModal({ area, tipos, zonas, areas, defaultParentId, onClose, onSave, saving }: AreaModalProps) {
  const [nombre, setNombre] = useState('');
  const [tipoAreaId, setTipoAreaId] = useState<string>('');
  const [parentId, setParentId] = useState<string>('');
  const [zonaId, setZonaId] = useState<string>('');
  const [categoria, setCategoria] = useState<CategoriaArea | null>(null);
  const [metrosCuadrados, setMetrosCuadrados] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [tieneAutomatizacion, setTieneAutomatizacion] = useState(false);
  const [cantidadRacks, setCantidadRacks] = useState('');

  const topLevelAreas = areas.filter((a) => a.parent_id === null && a.id !== area?.id);
  const selectedTipo = tipos.find((t) => t.id === tipoAreaId);
  const selectedZona = zonas.find((z) => z.id === zonaId);
  const esZonaRacks = selectedZona?.nombre?.toLowerCase() === 'racks';

  useEffect(() => {
    if (area) {
      setNombre(area.nombre);
      setTipoAreaId(area.tipo_area_id ?? '');
      setParentId(area.parent_id ?? '');
      setZonaId(area.zona_id ?? '');
      setCategoria(area.categoria ?? null);
      setMetrosCuadrados(area.metros_cuadrados > 0 ? area.metros_cuadrados.toString() : '');
      setDescripcion(area.descripcion);
      setActivo(area.activo);
      setTieneAutomatizacion(area.tiene_automatizacion ?? false);
      setCantidadRacks(area.cantidad_racks != null ? area.cantidad_racks.toString() : '');
    } else {
      setNombre('');
      setTipoAreaId(tipos[0]?.id ?? '');
      setParentId(defaultParentId ?? '');
      setZonaId('');
      setCategoria(null);
      setMetrosCuadrados('');
      setDescripcion('');
      setActivo(true);
      setTieneAutomatizacion(false);
      setCantidadRacks('');
    }
  }, [area, tipos, defaultParentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    await onSave({
      nombre: nombre.trim(),
      tipo_area_id: tipoAreaId || null,
      parent_id: parentId || null,
      zona_id: zonaId || null,
      categoria: categoria,
      metros_cuadrados: parseFloat(metrosCuadrados) || 0,
      moneda: selectedTipo?.moneda ?? 'USD',
      descripcion: descripcion.trim(),
      activo,
      tiene_automatizacion: tieneAutomatizacion,
      metros_automatizacion: 0,
      cantidad_racks: esZonaRacks && cantidadRacks !== '' ? parseInt(cantidadRacks, 10) : null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-bold text-slate-800">
            {area ? 'Editar Área' : defaultParentId ? 'Nueva Sub-Área' : 'Nueva Área'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del Área *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Operativa en Piso"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
          </div>

          {/* Categoría — toggle Interior / Exterior */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
            <div className="flex gap-2">
              {(['Interior', 'Exterior'] as CategoriaArea[]).map((cat) => {
                const isActive = categoria === cat;
                const config = cat === 'Interior'
                  ? { icon: 'ri-home-3-line', activeClass: 'border-amber-400 bg-amber-50 text-amber-700', inactiveClass: 'border-slate-200 text-slate-500 hover:border-amber-200 hover:bg-amber-50/50' }
                  : { icon: 'ri-sun-line', activeClass: 'border-sky-400 bg-sky-50 text-sky-700', inactiveClass: 'border-slate-200 text-slate-500 hover:border-sky-200 hover:bg-sky-50/50' };
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoria(isActive ? null : cat)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${isActive ? config.activeClass : config.inactiveClass}`}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className={`${config.icon} text-sm`} />
                    </div>
                    {cat}
                  </button>
                );
              })}
            </div>
            {categoria === null && (
              <p className="text-xs text-slate-400 mt-1">Opcional — selecciona si aplica</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de Área</label>
              <select
                value={tipoAreaId}
                onChange={(e) => setTipoAreaId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">Sin tipo</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            {/* Zona */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Zona</label>
              <select
                value={zonaId}
                onChange={(e) => setZonaId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">Sin zona</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>{z.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cantidad de Racks — solo visible si zona es Racks */}
          {esZonaRacks && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4 transition-all">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-amber-100">
                  <i className="ri-layout-grid-line text-amber-600 text-sm" />
                </div>
                <span className="text-sm font-semibold text-amber-800">Configuración de Racks</span>
                <span className="text-xs text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full">Opcional</span>
              </div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Cantidad de Racks</label>
              <div className="relative">
                <input
                  type="number"
                  value={cantidadRacks}
                  onChange={(e) => setCantidadRacks(e.target.value)}
                  placeholder="Ej. 24"
                  min="0"
                  step="1"
                  className="w-full border border-amber-200 rounded-lg pl-4 pr-16 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-500 font-medium">racks</span>
              </div>
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                <i className="ri-information-line" />
                Ingresa el número total de racks disponibles en esta área
              </p>
            </div>
          )}

          {/* Área padre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Área Principal</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
            >
              <option value="">Ninguna (raíz)</option>
              {topLevelAreas.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>

          {/* Metros cuadrados */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Metros Cuadrados (m²)</label>
            <div className="relative">
              <input
                type="number"
                value={metrosCuadrados}
                onChange={(e) => setMetrosCuadrados(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full border border-slate-200 rounded-lg pl-4 pr-12 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">m²</span>
            </div>
          </div>

          {/* Sección Automatización */}
          <div className={`rounded-xl border-2 transition-all ${tieneAutomatizacion ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-slate-50/50'} p-4`}>
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setTieneAutomatizacion(!tieneAutomatizacion)}>
              <div className={`w-5 h-5 flex items-center justify-center rounded border-2 transition-all shrink-0 ${tieneAutomatizacion ? 'bg-violet-500 border-violet-500' : 'border-slate-300 bg-white'}`}>
                {tieneAutomatizacion && <i className="ri-check-line text-white text-xs" />}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className={`ri-robot-line text-sm ${tieneAutomatizacion ? 'text-violet-500' : 'text-slate-400'}`} />
                </div>
                <span className={`text-sm font-medium ${tieneAutomatizacion ? 'text-violet-700' : 'text-slate-600'}`}>
                  Esta área tiene automatización
                </span>
              </div>
            </label>
            {tieneAutomatizacion && (
              <div className="mt-3 pt-3 border-t border-violet-200">
                <p className="text-xs text-violet-600 flex items-center gap-1.5">
                  <i className="ri-check-double-line" />
                  Área marcada con sistema de automatización activo
                </p>
              </div>
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción del área..."
              rows={2}
              maxLength={500}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>

          {/* Activo */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setActivo(!activo)}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${activo ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm font-medium text-slate-700">Área Activa</span>
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors disabled:opacity-60"
            >
              {saving ? 'Guardando...' : area ? 'Guardar Cambios' : 'Crear Área'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
