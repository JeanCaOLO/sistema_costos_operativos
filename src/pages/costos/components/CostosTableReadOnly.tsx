import { useState } from 'react';
import type { CostoColumna, CostoFila } from '@/types/costos';
import { formatCellValue, getColumnTotal, COLUMN_TYPES } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula } from '@/lib/formulaEngine';

// ─── Column widths ────────────────────────────────────────────────────────────
const COL_W_PROCESO  = 144;
const COL_W_SUBPROC  = 160;
const COL_W_DYNAMIC  = 160;
const COL_W_TOTAL    = 150;
const COL_W_SIM      = 200;

const BG_HEADER = 'rgb(30,41,59)';
const BG_WHITE  = '#ffffff';
const BG_FOOT   = 'rgb(248,250,252)';
const BG_VIOLET = 'rgb(245,243,255)';
const BG_TEAL   = 'rgb(240,253,250)';
const BORDER_ROW      = '1px solid rgb(241,245,249)';
const BORDER_FOOT_T   = '2px solid rgb(226,232,240)';
const BORDER_HEAD_COL = '1px solid rgb(51,65,85)';
const BORDER_FREEZE   = '2px solid rgba(16,185,129,0.45)';
const BORDER_PROC_DIV = '2px solid rgb(203,213,225)';
const Z_HEAD        = 15;
const Z_HEAD_STICKY = 20; // header cells that are also column-sticky
const Z_BODY        = 3;
const FROZEN        = 2; // Proceso + Subproceso always frozen

const PROCESO_BORDER_COLOR: Record<string, string> = {
  'Inbound':           '#10b981',
  'Outbound':          '#3b82f6',
  'Almacenaje':        '#f59e0b',
  'No Nacionalizados': '#f43f5e',
  'Cross Docking':     '#8b5cf6',
  'Devoluciones':      '#f97316',
  'Administración':    '#14b8a6',
};
function getProcesoColor(p: string) { return PROCESO_BORDER_COLOR[p] ?? '#94a3b8'; }

function getTypeIcon(tipo: string): string {
  return COLUMN_TYPES.find(ct => ct.value === tipo)?.icon ?? 'ri-text';
}

function getStickyLeft(i: number): number {
  if (i === 0) return 0;
  if (i === 1) return COL_W_PROCESO;
  return COL_W_PROCESO + COL_W_SUBPROC + (i - 2) * COL_W_DYNAMIC;
}
function getColWidth(i: number): number {
  if (i === 0) return COL_W_PROCESO;
  if (i === 1) return COL_W_SUBPROC;
  return COL_W_DYNAMIC;
}

function stickyStyle(i: number, bg: string, z: number): React.CSSProperties {
  const w = getColWidth(i);
  if (i >= FROZEN) return { width: w, minWidth: w };
  return {
    width: w, minWidth: w,
    position: 'sticky',
    left: getStickyLeft(i),
    zIndex: z,
    backgroundColor: bg,
    ...(i === FROZEN - 1 ? { borderRight: BORDER_FREEZE } : {}),
  };
}

function getFormulaColumnTotal(filas: CostoFila[], col: CostoColumna, ctx: FormulaContext): number {
  return filas.reduce((sum, fila) => {
    const f    = fila.formulas?.[col.id] ?? col.formula;
    if (!f) return sum;
    const mode = f.mode ?? 'terms';
    const has  =
      (mode === 'expression' && !!f.expression?.trim()) ||
      (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
    return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
  }, 0);
}

function getRowTotal(fila: CostoFila, columnas: CostoColumna[], ctx: FormulaContext): number {
  return columnas.reduce((sum, col) => {
    if (col.tipo === 'texto' || col.tipo === 'select') return sum;
    if (col.tipo === 'formula') {
      const f    = fila.formulas?.[col.id] ?? col.formula;
      if (!f) return sum;
      const mode = f.mode ?? 'terms';
      const has  =
        (mode === 'expression' && !!f.expression?.trim()) ||
        (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
      return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
    }
    const v = Number(fila.valores[col.id] ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

// ─── Read-only row with lifted simulation state ───────────────────────────────
interface ReadOnlyRowProps {
  fila: CostoFila;
  columnas: CostoColumna[];
  ctx: FormulaContext;
  isFirst: boolean;
  isLast: boolean;
  hasCols: boolean;
  simMultiplier: string;
  onSimMultiplierChange: (value: string) => void;
}

function ReadOnlyRow({ fila, columnas, ctx, isFirst, isLast, hasCols, simMultiplier, onSimMultiplierChange }: ReadOnlyRowProps) {
  const [editingSim, setEditingSim] = useState(false);

  const rowBorder   = isLast ? BORDER_PROC_DIV : BORDER_ROW;
  const accentColor = getProcesoColor(fila.proceso);
  const rowTotal    = getRowTotal(fila, columnas, ctx);
  const mult        = parseFloat(simMultiplier) || 0;
  const simValue    = rowTotal * mult;

  return (
    <tr>
      {/* Proceso */}
      <td
        style={{
          ...stickyStyle(0, BG_WHITE, Z_BODY),
          backgroundColor: BG_WHITE,
          borderLeft: `2px solid ${accentColor}`,
          borderRight: BORDER_ROW,
          borderBottom: rowBorder,
          padding: '12px',
          verticalAlign: 'top',
        }}
      >
        {isFirst ? (
          <span className="block truncate font-semibold text-slate-700 text-sm" title={fila.proceso}>
            {fila.proceso}
          </span>
        ) : (
          <div style={{ height: '100%', minHeight: 1 }} />
        )}
      </td>

      {/* Subproceso */}
      <td
        style={{
          ...stickyStyle(1, BG_WHITE, Z_BODY),
          backgroundColor: BG_WHITE,
          borderRight: BORDER_FREEZE,
          borderBottom: rowBorder,
          padding: '12px 16px',
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <i className="ri-map-pin-2-line text-xs text-slate-300" />
          </div>
          <span className="text-sm text-slate-700 font-medium truncate" title={fila.subproceso}>
            {fila.subproceso || <span className="text-slate-300 italic font-normal text-xs">—</span>}
          </span>
        </div>
      </td>

      {/* Dynamic columns */}
      {columnas.map((col, idx) => {
        const ci        = idx + 2;
        const isFormula = col.tipo === 'formula';
        const cellBg    = isFormula ? BG_VIOLET : BG_WHITE;

        let content: React.ReactNode;
        if (isFormula) {
          const f    = fila.formulas?.[col.id] ?? col.formula;
          const mode = f?.mode ?? 'terms';
          const has  = f && (
            (mode === 'expression' && !!f.expression?.trim()) ||
            (mode === 'terms' && (f.terminos?.length ?? 0) > 0)
          );
          if (!has) {
            content = <span className="text-xs text-slate-300 italic">—</span>;
          } else {
            const value = calcularFormula(f!, ctx, fila.subproceso);
            content = (
              <div className="flex items-center gap-1.5">
                <span className="text-xs px-1 py-0.5 rounded bg-violet-100 text-violet-600 font-mono font-semibold flex-shrink-0">fx</span>
                <span className="text-sm font-semibold text-violet-700 tabular-nums">
                  {formatCellValue(value, 'formula')}
                </span>
              </div>
            );
          }
        } else {
          const raw       = fila.valores[col.id] ?? '';
          const isEmpty   = raw === '' || raw === undefined || raw === null;
          const isNumeric = ['moneda', 'numero', 'porcentaje'].includes(col.tipo);
          content = isEmpty
            ? <span className="text-slate-300 text-xs">—</span>
            : (
              <span className={`block truncate ${isNumeric ? 'text-slate-700 font-medium' : 'text-slate-600'}`}>
                {formatCellValue(raw, col.tipo)}
              </span>
            );
        }

        const cellStyle: React.CSSProperties = ci < FROZEN
          ? { ...stickyStyle(ci, cellBg, Z_BODY), backgroundColor: cellBg, borderRight: ci === FROZEN - 1 ? BORDER_FREEZE : BORDER_ROW, borderBottom: rowBorder, padding: '12px 16px' }
          : { width: COL_W_DYNAMIC, minWidth: COL_W_DYNAMIC, backgroundColor: cellBg, borderRight: BORDER_ROW, borderBottom: rowBorder, padding: '12px 16px' };

        return <td key={col.id} style={cellStyle}>{content}</td>;
      })}

      {/* Row total */}
      {hasCols && (
        <td
          style={{
            width: COL_W_TOTAL, minWidth: COL_W_TOTAL,
            borderRight: BORDER_ROW, borderBottom: rowBorder,
            backgroundColor: BG_TEAL, padding: '12px 16px',
          }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
              <i className="ri-calculator-line text-xs text-teal-400" />
            </div>
            <span className="text-sm font-bold text-teal-700 tabular-nums">
              {new Intl.NumberFormat('en-US', {
                style: 'currency', currency: 'USD',
                minimumFractionDigits: 2, maximumFractionDigits: 4,
              }).format(rowTotal)}
            </span>
          </div>
        </td>
      )}

      {/* Simulación */}
      {hasCols && (
        <td
          style={{
            width: COL_W_SIM, minWidth: COL_W_SIM,
            borderRight: BORDER_ROW, borderBottom: rowBorder,
            backgroundColor: 'rgb(255,251,245)', padding: '10px 16px',
          }}
        >
          <div className="flex flex-col gap-1">
            {/* Multiplier input */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                <i className="ri-close-line text-xs text-orange-400" />
              </div>
              {editingSim ? (
                <input
                  type="number"
                  value={simMultiplier}
                  onChange={e => onSimMultiplierChange(e.target.value)}
                  onBlur={() => setEditingSim(false)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingSim(false); }}
                  autoFocus
                  className="w-20 bg-white border border-orange-300 rounded px-2 py-0.5 text-xs focus:outline-none text-right tabular-nums"
                  step="any"
                />
              ) : (
                <span
                  className="text-xs text-orange-500 font-semibold tabular-nums cursor-pointer hover:text-orange-700 hover:underline"
                  title="Clic para editar multiplicador"
                  onClick={() => setEditingSim(true)}
                >
                  ×{simMultiplier}
                </span>
              )}
            </div>
            {/* Result */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                <i className="ri-bar-chart-2-line text-xs text-orange-400" />
              </div>
              <span className="text-sm font-bold text-orange-700 tabular-nums">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency', currency: 'USD',
                  minimumFractionDigits: 2, maximumFractionDigits: 4,
                }).format(simValue)}
              </span>
            </div>
          </div>
        </td>
      )}
    </tr>
  );
}

interface Props {
  columnas: CostoColumna[];
  filas: CostoFila[];
  formulaCtx?: FormulaContext;
  simMultipliers?: Record<string, string>;
  onSimMultiplierChange?: (filaId: string, value: string) => void;
}

export default function CostosTableReadOnly({ columnas, filas, formulaCtx, simMultipliers: externalMultipliers, onSimMultiplierChange: externalOnChange }: Props) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;

  // Si se pasan multiplicadores externos (desde embed-page) los usamos,
  // si no (uso standalone) manejamos estado interno como fallback
  const [internalMultipliers, setInternalMultipliers] = useState<Record<string, string>>({});
  const simMultipliers = externalMultipliers ?? internalMultipliers;
  const handleSimChange = (filaId: string, value: string) => {
    if (externalOnChange) {
      externalOnChange(filaId, value);
    } else {
      setInternalMultipliers(prev => ({ ...prev, [filaId]: value }));
    }
  };

  const firstOfProceso = new Set<string>();
  const lastOfProceso  = new Set<string>();
  const seenProcesos   = new Set<string>();
  filas.forEach((f, i) => {
    if (!seenProcesos.has(f.proceso)) { seenProcesos.add(f.proceso); firstOfProceso.add(f.id); }
    const next = filas[i + 1];
    if (!next || next.proceso !== f.proceso) lastOfProceso.add(f.id);
  });

  const hasData    = filas.length > 0;
  const hasCols    = columnas.length > 0;
  const tableMinW  = COL_W_PROCESO + COL_W_SUBPROC + columnas.length * COL_W_DYNAMIC + (hasCols ? COL_W_TOTAL + COL_W_SIM : 0);

  const headCell = (i: number, bg?: string): React.CSSProperties => {
    const z = i < FROZEN ? Z_HEAD_STICKY : Z_HEAD;
    return {
      ...stickyStyle(i, bg ?? BG_HEADER, z),
      backgroundColor: bg ?? BG_HEADER,
    };
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        <table
          className="border-separate text-sm"
          style={{ borderSpacing: 0, width: '100%', minWidth: tableMinW }}
        >
          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              {/* Proceso */}
              <th
                className="px-4 py-3.5 text-left"
                style={{
                  ...headCell(0),
                  borderRight: FROZEN <= 1 ? BORDER_FREEZE : BORDER_HEAD_COL,
                  borderBottom: BORDER_HEAD_COL,
                }}
              >
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Proceso</span>
              </th>

              {/* Subproceso */}
              <th
                className="px-4 py-3.5 text-left"
                style={{
                  ...headCell(1),
                  borderRight: BORDER_FREEZE,
                  borderBottom: BORDER_HEAD_COL,
                }}
              >
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Subproceso</span>
              </th>

              {/* Dynamic columns */}
              {columnas.map((col, idx) => {
                const ci        = idx + 2;
                const isFormula = col.tipo === 'formula';
                const colBg     = isFormula ? 'rgb(46,16,101)' : BG_HEADER;
                return (
                  <th
                    key={col.id}
                    className="px-4 py-3.5 text-left"
                    style={{
                      ...headCell(ci, colBg),
                      borderRight: BORDER_HEAD_COL,
                      borderBottom: BORDER_HEAD_COL,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <i className={`${getTypeIcon(col.tipo)} text-xs ${isFormula ? 'text-violet-400' : 'text-slate-400'}`} />
                      </div>
                      <span className={`text-xs font-semibold uppercase tracking-wider truncate ${isFormula ? 'text-violet-300' : 'text-slate-200'}`}>
                        {col.nombre}
                      </span>
                      {isFormula && (
                        <span className="text-xs px-1 py-0.5 rounded bg-violet-700/60 text-violet-300 font-mono font-bold flex-shrink-0">fx</span>
                      )}
                    </div>
                  </th>
                );
              })}

              {/* Total */}
              {hasCols && (
                <th
                  className="px-4 py-3.5 text-left"
                  style={{
                    backgroundColor: BG_HEADER,
                    minWidth: COL_W_TOTAL,
                    width: COL_W_TOTAL,
                    borderRight: BORDER_HEAD_COL,
                    borderBottom: BORDER_HEAD_COL,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-calculator-line text-xs text-teal-400" />
                    </div>
                    <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">Total</span>
                    <span className="text-xs px-1 py-0.5 rounded bg-teal-700/60 text-teal-300 font-mono font-semibold ml-0.5">Σ</span>
                  </div>
                </th>
              )}

              {/* Simulación */}
              {hasCols && (
                <th
                  className="px-4 py-3.5 text-left"
                  style={{
                    backgroundColor: 'rgb(67,20,7)',
                    minWidth: COL_W_SIM,
                    width: COL_W_SIM,
                    borderRight: BORDER_HEAD_COL,
                    borderBottom: BORDER_HEAD_COL,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-bar-chart-2-line text-xs text-orange-400" />
                    </div>
                    <span className="text-xs font-bold text-orange-300 uppercase tracking-wider">Simulación</span>
                  </div>
                  <p className="text-xs text-orange-500/70 mt-0.5 font-normal normal-case tracking-normal">Total × multiplicador</p>
                </th>
              )}
            </tr>
          </thead>

          {/* ── BODY ───────────────────────────────────────────────────────── */}
          <tbody>
            {hasData ? filas.map(fila => (
              <ReadOnlyRow
                key={fila.id}
                fila={fila}
                columnas={columnas}
                ctx={ctx}
                isFirst={firstOfProceso.has(fila.id)}
                isLast={lastOfProceso.has(fila.id)}
                hasCols={hasCols}
                simMultiplier={simMultipliers[fila.id] ?? '1'}
                onSimMultiplierChange={(v) => handleSimChange(fila.id, v)}
              />
            )) : (
              <tr>
                <td colSpan={columnas.length + 3} className="px-8 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
                      <i className="ri-table-2 text-2xl text-slate-400" />
                    </div>
                    <p className="text-slate-400 text-sm">Sin datos disponibles</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>


        </table>
      </div>
    </div>
  );
}
