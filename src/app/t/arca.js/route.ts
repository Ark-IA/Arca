// El cargador que se pega en la página del cliente. No cambia nunca: la
// configuración viaja en el segundo script, `/t/<clave>.js`, que es el de
// vida corta. Ver src/lib/seguimiento-web/scripts.ts.

import { SEGUNDOS_CACHE_CARGADOR } from '@/lib/seguimiento-web/constantes';
import { FUENTE_CARGADOR } from '@/lib/seguimiento-web/scripts';

export function GET(): Response {
  return new Response(FUENTE_CARGADOR, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': `public, max-age=${SEGUNDOS_CACHE_CARGADOR}`,
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}
