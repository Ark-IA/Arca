'use client';

/**
 * El teléfono, alcanzable desde cualquier pantalla.
 *
 * El registro SIP tiene que ser UNO solo y vivir mientras dure la sesión, así
 * que `useSoftphone` se invoca una única vez, acá. Si cada pantalla que quiere
 * llamar lo invocara por su cuenta, cada una abriría su propio registro contra
 * Asterisk, la central los pisaría entre sí (`remove_existing`) y las llamadas
 * entrantes sonarían en el registro equivocado.
 *
 * De ahí el contexto: la burbuja lo consume para pintarse, y cualquier ficha
 * de contacto lo consume para marcar sin pasar por la burbuja.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useSoftphone, type Softphone } from '@/hooks/use-softphone';

interface Telefono extends Softphone {
  /** True cuando esta persona tiene extensión y el teléfono sirve de algo. */
  disponible: boolean;
}

const Contexto = createContext<Telefono | null>(null);

export function ProveedorTelefono({ children }: { children: ReactNode }) {
  const tel = useSoftphone();

  const valor = useMemo<Telefono>(
    () => ({
      ...tel,
      // 'cargando' cuenta como no disponible: mientras no se sepa si hay
      // extensión, ofrecer "Llamar" sería ofrecer algo que puede no existir.
      disponible: tel.estado !== 'cargando' && tel.estado !== 'sin-extension',
    }),
    [tel],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Devuelve el teléfono, o `null` fuera del armazón del panel.
 *
 * Devuelve `null` en vez de lanzar: hay componentes -- la ficha de contacto,
 * por ejemplo -- que también se usan en pantallas sin teléfono, y hacerlas
 * fallar por eso sería peor que ocultarles el botón de llamar.
 */
export function useTelefono(): Telefono | null {
  return useContext(Contexto);
}
