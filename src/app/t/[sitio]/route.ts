// El rastreador con la configuración del sitio horneada adentro.
//
// Sin `stale-while-revalidate` a propósito: una ventana de revalidación es
// justamente permiso para seguir ejecutando la configuración vieja después de
// pausar, y pausar tiene que surtir efecto en SEGUNDOS_CACHE_CONFIG.

import { SEGUNDOS_CACHE_CONFIG } from '@/lib/seguimiento-web/constantes';
import { fuenteRastreador } from '@/lib/seguimiento-web/scripts';
import { sitioPorClave } from '@/lib/seguimiento-web/sitios';

const VACIO = '/* seguimiento web: sitio inexistente o pausado */\n';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sitio: string }> }
): Promise<Response> {
  const { sitio: crudo } = await params;
  const sitio = await sitioPorClave(crudo.replace(/\.js$/, ''));

  if (!sitio) return script(VACIO, 60);

  return script(
    fuenteRastreador(sitio.config, `${origenPublico(request)}/api/t/e`),
    SEGUNDOS_CACHE_CONFIG
  );
}

function script(fuente: string, segundos: number): Response {
  return new Response(fuente, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': `public, max-age=${segundos}`,
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}

/**
 * Dentro del contenedor `request.url` dice http, y una página en https no
 * puede mandarle nada a un colector en http. Mismo criterio que
 * api/meta/conexiones: la dirección configurada y, si no, las del proxy.
 */
function origenPublico(request: Request): string {
  const configurado = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(
    /\/+$/,
    ''
  );
  if (configurado) return configurado;
  const url = new URL(request.url);
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || url.host;
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  return `${proto}://${host}`;
}
