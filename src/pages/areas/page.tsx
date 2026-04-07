import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../components/feature/AppLayout';
import AreasTab from './components/AreasTab';
import TiposAreaTab from './components/TiposAreaTab';
import ZonasTab from './components/ZonasTab';
import { supabase, isSupabaseReady } from '../../lib/supabase';
import type { Area, TipoArea, Zona } from '../../types/areas';

type Tab = 'areas' | 'zonas' | 'tipos';

export default function AreasPage() {
  const [activeTab, setActiveTab] = useState<Tab>('areas');
  const [areas, setAreas] = useState<Area[]>([]);
  const [tipos, setTipos] = useState<TipoArea[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!isSupabaseReady || !supabase) {
      setError('NO_SUPABASE');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tiposRes, areasRes, zonasRes] = await Promise.all([
        supabase.from('tipos_area').select('*').order('nombre'),
        supabase.from('areas').select('*').order('nombre'),
        supabase.from('zona').select('*').order('nombre'),
      ]);
      if (tiposRes.error) throw tiposRes.error;
      if (areasRes.error) throw areasRes.error;
      if (zonasRes.error) throw zonasRes.error;
      setTipos(tiposRes.data ?? []);
      setAreas(areasRes.data ?? []);
      setZonas(zonasRes.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // --- Tipos CRUD ---
  const addTipo = async (data: Omit<TipoArea, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('tipos_area').insert(data);
    if (!err) fetchAll();
  };

  const editTipo = async (id: string, data: Omit<TipoArea, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('tipos_area').update(data).eq('id', id);
    if (!err) fetchAll();
  };

  const deleteTipo = async (id: string) => {
    const { error: err } = await supabase.from('tipos_area').delete().eq('id', id);
    if (!err) fetchAll();
  };

  // --- Zonas CRUD ---
  const addZona = async (data: Omit<Zona, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('zona').insert(data);
    if (!err) fetchAll();
  };

  const editZona = async (id: string, data: Omit<Zona, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('zona').update(data).eq('id', id);
    if (!err) fetchAll();
  };

  const deleteZona = async (id: string) => {
    const { error: err } = await supabase.from('zona').delete().eq('id', id);
    if (!err) fetchAll();
  };

  // --- Areas CRUD ---
  const addArea = async (data: Omit<Area, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('areas').insert(data);
    if (!err) fetchAll();
  };

  const editArea = async (id: string, data: Omit<Area, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('areas').update(data).eq('id', id);
    if (!err) fetchAll();
  };

  const deleteArea = async (id: string) => {
    // First remove parent references from sub-areas
    await supabase.from('areas').update({ parent_id: null }).eq('parent_id', id);
    const { error: err } = await supabase.from('areas').delete().eq('id', id);
    if (!err) fetchAll();
  };

  const tabs: { id: Tab; label: string; icon: string; count: number }[] = [
    { id: 'areas', label: 'Áreas', icon: 'ri-map-pin-2-line', count: areas.length },
    { id: 'zonas', label: 'Zonas', icon: 'ri-map-2-line', count: zonas.length },
    { id: 'tipos', label: 'Tipos de Área', icon: 'ri-stack-line', count: tipos.length },
  ];

  if (loading) {
    return (
      <AppLayout title="Catálogo de Áreas" subtitle="Cargando datos...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando catálogo...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    const isNoSupabase = error === 'NO_SUPABASE';
    return (
      <AppLayout title="Catálogo de Áreas" subtitle="Error de conexión">
        <div className="flex items-center justify-center py-32">
          <div className="text-center max-w-sm">
            <div className={`w-14 h-14 flex items-center justify-center rounded-full mx-auto mb-4 ${isNoSupabase ? 'bg-amber-100' : 'bg-rose-100'}`}>
              <i className={`text-3xl ${isNoSupabase ? 'ri-database-2-line text-amber-500' : 'ri-error-warning-line text-rose-500'}`} />
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-2">
              {isNoSupabase ? 'Supabase no está configurado' : 'Error al cargar datos'}
            </p>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              {isNoSupabase
                ? 'Las variables de entorno de Supabase no están disponibles. Desconecta y vuelve a conectar Supabase desde el panel de configuración del proyecto.'
                : error}
            </p>
            {!isNoSupabase && (
              <button
                onClick={fetchAll}
                className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Catálogo de Áreas"
      subtitle="Gestiona áreas, sub-áreas y sus tipos para clasificar los gastos operativos"
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className={`${tab.icon} text-sm`} />
            </div>
            {tab.label}
            <span
              className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                activeTab === tab.id
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'areas' ? (
        <AreasTab
          areas={areas}
          tipos={tipos}
          zonas={zonas}
          onAdd={addArea}
          onEdit={editArea}
          onDelete={deleteArea}
        />
      ) : activeTab === 'zonas' ? (
        <ZonasTab
          zonas={zonas}
          areas={areas}
          onAdd={addZona}
          onEdit={editZona}
          onDelete={deleteZona}
        />
      ) : (
        <TiposAreaTab
          tipos={tipos}
          areas={areas}
          onAdd={addTipo}
          onEdit={editTipo}
          onDelete={deleteTipo}
        />
      )}
    </AppLayout>
  );
}
