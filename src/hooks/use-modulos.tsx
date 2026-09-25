'use client';

/**
 * Qué módulos tiene activos esta instalación, para dibujar el panel.
 *
 * Solo sirve para no mostrar lo que no está: la barrera real está en el
 * middleware y en los motores (src/lib/modulos/catalogo.ts). Mientras carga,
 * se asume que todo está activo: esconder medio segundo el menú entero se ve
 * peor que mostrar una fila de más que el servidor igual va a rechazar.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { rutaDisponible, type Modulo } from '@/lib/modulos/catalogo';

interface EstadoModulos {
  apagados: ReadonlySet<string>;
  superadmin: boolean;
  activo: (modulo: Modulo) => boolean;
  rutaVisible: (ruta: string) => boolean;
}

const VACIO: ReadonlySet<string> = new Set();

const Contexto = createContext<EstadoModulos>({
  apagados: VACIO,
  superadmin: false,
  activo: () => true,
  rutaVisible: () => true,
});

export function ProveedorModulos({ children }: { children: ReactNode }) {
  const [apagados, setApagados] = useState<ReadonlySet<string>>(VACIO);
  const [superadmin, setSuperadmin] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetch('/api/modulos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { apagados?: string[]; superadmin?: boolean } | null) => {
        if (!vigente || !d) return;
        setApagados(new Set(d.apagados ?? []));
        setSuperadmin(!!d.superadmin);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const valor = useMemo<EstadoModulos>(
    () => ({
      apagados,
      superadmin,
      activo: (m) => !apagados.has(m),
      rutaVisible: (ruta) => rutaDisponible(ruta, apagados),
    }),
    [apagados, superadmin]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useModulos(): EstadoModulos {
  return useContext(Contexto);
}
