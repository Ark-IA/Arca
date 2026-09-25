/**
 * Exportar a CSV desde el navegador: contactos, empresas, negocios, tareas,
 * informes.
 *
 * Dos cosas que un CSV "rápido" hace mal y acá no:
 *
 * 1. PostgREST devuelve como mucho 1.000 filas por consulta. Un export que
 *    no pagina entrega 1.000 contactos de 5.000 sin avisar, y el cliente lo
 *    descubre cuando ya lo usó. `traerTodo` pide página por página.
 * 2. Excel en español usa la coma como separador decimal, así que un CSV
 *    con comas se abre todo en una columna. Se usa `;` y BOM (para que las
 *    tildes no salgan rotas).
 */

import type { PostgrestError } from '@supabase/supabase-js';

/** Marca de orden de bytes: sin ella Excel abre el UTF-8 como Latin-1 y rompe las tildes. */
const BOM = String.fromCharCode(0xfeff);

type Celda = string | number | boolean | null | undefined;

export function aCsv(encabezados: string[], filas: Celda[][]): string {
  const celda = (v: Celda) => {
    const t = v === null || v === undefined ? '' : String(v);
    // Una celda que empieza con = + - @ la ejecuta Excel como fórmula
    // ("inyección CSV"): un contacto llamado "=HYPERLINK(...)" no puede
    // convertirse en un enlace en la hoja de quien exporta.
    const segura =
      typeof v === 'string' && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
    return /[;"\n\r]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
  };
  return (
    BOM +
    [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') +
    '\r\n'
  );
}

export function descargarCsv(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(
    new Blob([contenido], { type: 'text/csv;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.endsWith('.csv') ? nombre : `${nombre}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const PAGINA = 1000;

/** Tope de seguridad: un export de medio millón de filas congela la pestaña. */
const MAXIMO = 100_000;

/**
 * Trae todas las filas de una consulta, de a PAGINA. `consulta(desde, hasta)`
 * tiene que armar la consulta completa con un orden estable y terminar en
 * `.range(desde, hasta)`: sin orden estable, dos páginas pueden repetir o
 * saltarse filas.
 */
export async function traerTodo<T>(
  consulta: (
    desde: number,
    hasta: number
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<{ filas: T[]; error: string | null; recortado: boolean }> {
  const filas: T[] = [];
  for (let desde = 0; desde < MAXIMO; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) return { filas, error: error.message, recortado: false };
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA)
      return { filas, error: null, recortado: false };
  }
  return { filas, error: null, recortado: true };
}

export function fechaCsv(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function hoyArchivo(): string {
  return new Date().toISOString().slice(0, 10);
}
