// Colector del seguimiento web. Lo llama un `sendBeacon` desde la página de
// otro, sin sesión. Contesta siempre 204 y nada más: un script que pudiera
// leer la respuesta sería uno cuyos fallos un extraño podría sondear.
//
// `Cross-Origin-Resource-Policy: cross-origin` es obligatorio: sin él Chrome
// bloquea la respuesta del beacon y ensucia la consola del cliente en cada
// página vista.

import { MAX_BYTES_CUERPO } from '@/lib/seguimiento-web/constantes';
import { recibirLote, type LoteEntrante } from '@/lib/seguimiento-web/ingesta';

const CABECERAS = {
  'cross-origin-resource-policy': 'cross-origin',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};

export async function POST(request: Request): Promise<Response> {
  try {
    const declarado = Number(request.headers.get('content-length') ?? '0');
    if (declarado > MAX_BYTES_CUERPO) return nada();

    const cuerpo = await request.text();
    if (cuerpo.length > MAX_BYTES_CUERPO) return nada();

    let lote: LoteEntrante;
    try {
      lote = JSON.parse(cuerpo) as LoteEntrante;
    } catch {
      return nada();
    }
    if (!lote || typeof lote !== 'object') return nada();

    await recibirLote(lote, {
      origin: request.headers.get('origin'),
      userAgent: request.headers.get('user-agent'),
    });
  } catch (e) {
    console.error('[seguimiento-web] colector:', e);
  }
  return nada();
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CABECERAS,
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });
}

function nada(): Response {
  return new Response(null, { status: 204, headers: CABECERAS });
}
