'use client';

/**
 * Búsqueda global: un cuadro que busca a la vez en contactos, empresas,
 * negocios, tareas y notas.
 *
 * Se abre con Ctrl+K (Cmd+K en Mac) o con la lupa del encabezado. El trabajo
 * pesado lo hace la función `buscar_global` de la migración 048: una sola ida
 * a la base en vez de cinco consultas en paralelo que después habría que
 * ordenar entre sí.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CheckSquare,
  CornerDownLeft,
  HandCoins,
  Loader2,
  Search,
  StickyNote,
  User,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type TipoResultado = 'contact' | 'company' | 'deal' | 'task' | 'note';

interface Resultado {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  subtitulo: string;
  parecido: number;
}

/**
 * A dónde lleva cada resultado.
 *
 * Todos van con `?id=`, no a la lista pelada. Un resultado de búsqueda que
 * deja en el listado general obliga a buscar OTRA VEZ dentro de la página, y
 * entonces la búsqueda global no ahorró nada. Cada pantalla lee ese parámetro
 * y abre o resalta el registro.
 */
const META: Record<
  TipoResultado,
  { icono: typeof User; etiqueta: string; ruta: (id: string) => string }
> = {
  contact: { icono: User, etiqueta: 'Contacto', ruta: (id) => `/contacts?id=${id}` },
  company: { icono: Building2, etiqueta: 'Empresa', ruta: (id) => `/companies?id=${id}` },
  deal: { icono: HandCoins, etiqueta: 'Negocio', ruta: () => '/pipelines' },
  task: { icono: CheckSquare, etiqueta: 'Tarea', ruta: (id) => `/tasks?id=${id}` },
  // Una nota no tiene pantalla propia: vive colgada de un contacto, una
  // empresa o un negocio. Llevar a "Notas" sería llevar a ningún sitio.
  note: { icono: StickyNote, etiqueta: 'Nota', ruta: () => '/contacts' },
};

/** Debajo de dos caracteres cualquier término trae media base. */
const MINIMO = 2;

export function BusquedaGlobal() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [activo, setActivo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  // Cada búsqueda lleva su número. Si vuelve una respuesta vieja después de
  // una nueva -- pasa al escribir rápido, porque las consultas no terminan en
  // orden -- se descarta en vez de pisar los resultados buenos.
  const turno = useRef(0);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto((p) => !p);
      }
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  useEffect(() => {
    if (abierto) {
      // El foco va después del renderizado, o el campo todavía no existe.
      const t = setTimeout(() => entrada.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setTermino('');
    setResultados([]);
    setActivo(0);
  }, [abierto]);

  const buscar = useCallback(async (q: string) => {
    const mio = ++turno.current;
    setBuscando(true);
    const { data, error } = await createClient().rpc('buscar_global', {
      p_termino: q,
      p_limite: 6,
    });
    if (mio !== turno.current) return;
    setBuscando(false);
    if (error) {
      setResultados([]);
      return;
    }
    // La función ordena dentro de cada módulo; entre módulos se ordena acá por
    // parecido, para que lo más cercano a lo escrito quede arriba sin importar
    // de qué tabla salió.
    setResultados(
      ((data ?? []) as Resultado[]).sort((a, b) => b.parecido - a.parecido),
    );
    setActivo(0);
  }, []);

  useEffect(() => {
    const q = termino.trim();
    if (q.length < MINIMO) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    // 180 ms: por debajo se dispara una consulta por tecla; por encima se
    // siente lento al escribir.
    const t = setTimeout(() => void buscar(q), 180);
    return () => clearTimeout(t);
  }, [termino, buscar]);

  const abrir = (r: Resultado) => {
    setAbierto(false);
    router.push(META[r.tipo].ruta(r.id));
  };

  const navegar = (e: React.KeyboardEvent) => {
    if (resultados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((i) => (i + 1) % resultados.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      abrir(resultados[activo]);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Buscar en todo el CRM"
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="ml-2 hidden rounded border border-border bg-card px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:inline">
          Ctrl K
        </kbd>
      </button>
    );
  }

  return (
    // Se pinta a mano y no con el Dialog de la biblioteca: este panel va
    // anclado arriba y sin cabecera, y forzar ese diseño sobre el Dialog
    // implicaría pelear con sus estilos de centrado en cada versión.
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setAbierto(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          {buscando ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={entrada}
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            onKeyDown={navegar}
            placeholder="Buscar contactos, empresas, negocios, tareas, notas…"
            className="flex-1 bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto">
          {termino.trim().length < MINIMO ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Escribí al menos {MINIMO} letras.
            </p>
          ) : resultados.length === 0 && !buscando ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nada coincide con “{termino.trim()}”.
            </p>
          ) : (
            <ul>
              {resultados.map((r, i) => {
                const meta = META[r.tipo];
                const Icono = meta.icono;
                return (
                  <li key={`${r.tipo}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => abrir(r)}
                      onMouseEnter={() => setActivo(i)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        i === activo ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icono className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
                          {r.titulo}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {meta.etiqueta}
                          {r.subtitulo ? ` · ${r.subtitulo}` : ''}
                        </span>
                      </span>
                      {i === activo && (
                        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
