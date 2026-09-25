'use client';

/**
 * Informes: atención, origen de los clientes, ventas, llamadas y masivos
 * para un rango de fechas.
 *
 * Todo se calcula en la base (`informe_general`, migración 081) y con los
 * permisos de quien mira: un asesor ve el informe de lo suyo, quien
 * administra el de toda la cuenta. Cada tabla se descarga en CSV.
 *
 * Las secciones de módulos apagados en la instalación no se muestran.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart } from '@/components/tremor/bar-chart';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useModulos } from '@/hooks/use-modulos';
import { formatCurrency } from '@/lib/currency';
import { descargarCsv } from '@/lib/exportar/csv';
import { cn } from '@/lib/utils';
import {
  NOMBRE_RANGO,
  aCsv,
  duracion,
  limitesDe,
  porcentaje,
  type InformeGeneral,
  type Rango,
} from '@/lib/informes/tipos';

const RANGOS: Rango[] = ['7d', '30d', '90d', 'mes', 'mes_anterior'];

const CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const MEDIO: Record<string, string> = {
  organic: 'Orgánico',
  social: 'Redes',
  referral: 'Referido',
  email: 'Correo',
  cpc: 'Pago',
  direct: 'Directo',
  other: 'Otro',
};

function numero(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('es');
}

export default function InformesPage() {
  const { accountId, defaultCurrency } = useAuth();
  const { activo } = useModulos();
  const [rango, setRango] = useState<Rango>('30d');
  const [datos, setDatos] = useState<InformeGeneral | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    const { desde, hasta } = limitesDe(rango);
    const { data, error } = await createClient().rpc('informe_general', {
      p_cuenta: accountId,
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
      p_zona:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota',
    });
    setCargando(false);
    if (error) {
      console.error('[informes]', error);
      toast.error('No se pudo cargar el informe.');
      return;
    }
    setDatos(data as InformeGeneral);
  }, [accountId, rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const moneda = (v: number) => formatCurrency(v, defaultCurrency);
  const sufijo = `${rango}-${new Date().toISOString().slice(0, 10)}.csv`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            Informes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {NOMBRE_RANGO[rango]}. Cada tabla se puede descargar para Excel.
          </p>
        </div>
        <div className="bg-muted/60 flex flex-wrap gap-1 rounded-lg p-1">
          {RANGOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRango(r)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                rango === r
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {NOMBRE_RANGO[r]}
            </button>
          ))}
        </div>
      </div>

      {cargando && !datos ? (
        <div className="flex justify-center py-20">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : !datos ? null : (
        <div className={cn('space-y-6', cargando && 'opacity-60')}>
          {/* ---------------- Atención ---------------- */}
          <Seccion titulo="Atención">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                etiqueta="Conversaciones nuevas"
                valor={numero(datos.atencion.conversaciones_nuevas)}
              />
              <Kpi
                etiqueta="Primera respuesta (mediana)"
                valor={duracion(datos.atencion.primera_respuesta_mediana_min)}
                detalle={
                  datos.atencion.sin_respuesta
                    ? `${numero(datos.atencion.sin_respuesta)} sin responder`
                    : undefined
                }
              />
              <Kpi
                etiqueta="Mensajes recibidos / enviados"
                valor={`${numero(datos.atencion.mensajes_recibidos)} / ${numero(datos.atencion.mensajes_enviados)}`}
                detalle={
                  datos.atencion.mensajes_bot
                    ? `+ ${numero(datos.atencion.mensajes_bot)} automáticos`
                    : undefined
                }
              />
              <Kpi
                etiqueta="Abiertas ahora"
                valor={numero(datos.atencion.abiertas_ahora)}
              />
            </div>

            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-medium">Mensajes por día</p>
                <BarChart
                  className="h-56"
                  data={datos.serie_diaria.map((d) => ({
                    dia: d.dia.slice(5),
                    Recibidos: d.recibidos,
                    Enviados: d.enviados,
                  }))}
                  index="dia"
                  categories={['Recibidos', 'Enviados']}
                  colors={['blue', 'violet']}
                  valueFormatter={(v) => numero(v)}
                  yAxisWidth={40}
                />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Tabla
                titulo="Por asesor"
                encabezados={[
                  'Asesor',
                  'Conversaciones',
                  'Mensajes',
                  'Primera respuesta',
                  'Cerradas',
                ]}
                filas={datos.por_asesor.map((a) => [
                  a.nombre,
                  a.conversaciones,
                  a.mensajes,
                  duracion(a.primera_respuesta_mediana_min),
                  a.cerradas,
                ])}
                archivo={`atencion-por-asesor-${sufijo}`}
              />
              <Tabla
                titulo="Por canal"
                encabezados={['Canal', 'Conversaciones']}
                filas={datos.por_canal.map((c) => [
                  CANAL[c.canal] ?? c.canal,
                  c.conversaciones,
                ])}
                archivo={`atencion-por-canal-${sufijo}`}
              />
            </div>
          </Seccion>

          {/* ---------------- Origen ---------------- */}
          <Seccion titulo="De dónde llegan los clientes">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                etiqueta="Contactos nuevos"
                valor={numero(datos.origen.total)}
              />
              {activo('formularios_web') && (
                <>
                  <Kpi
                    etiqueta="Formularios web recibidos"
                    valor={numero(datos.origen.formularios.recibidos)}
                  />
                  <Kpi
                    etiqueta="Formularios convertidos en contacto"
                    valor={numero(datos.origen.formularios.con_contacto)}
                    detalle={porcentaje(
                      datos.origen.formularios.con_contacto,
                      datos.origen.formularios.recibidos
                    )}
                  />
                </>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Tabla
                titulo="Por vía de entrada"
                encabezados={['Vía', 'Contactos', '% del total']}
                filas={datos.origen.por_via.map((v) => [
                  v.via,
                  v.contactos,
                  porcentaje(v.contactos, datos.origen.total),
                ])}
                archivo={`origen-por-via-${sufijo}`}
              />
              {activo('formularios_web') && (
                <Tabla
                  titulo="Página web: fuente y campaña"
                  encabezados={['Fuente', 'Medio', 'Campaña', 'Contactos']}
                  filas={datos.origen.web.map((w) => [
                    w.fuente,
                    MEDIO[w.medio] ?? w.medio,
                    w.campana ?? '—',
                    w.contactos,
                  ])}
                  archivo={`origen-web-${sufijo}`}
                  vacio="Ningún contacto nuevo llegó por la página web en este período."
                />
              )}
            </div>
            {activo('formularios_web') &&
              datos.origen.formularios.omitidos.length > 0 && (
                <Tabla
                  titulo="Formularios que no se convirtieron en contacto"
                  encabezados={['Motivo', 'Cantidad']}
                  filas={datos.origen.formularios.omitidos.map((o) => [
                    o.motivo,
                    o.n,
                  ])}
                  archivo={`formularios-omitidos-${sufijo}`}
                />
              )}
          </Seccion>

          {/* ---------------- Ventas ---------------- */}
          {activo('pipelines') && (
            <Seccion
              titulo="Ventas"
              nota="Los negocios ganados y perdidos se cuentan por su última modificación: editar un negocio ya cerrado lo mueve de fecha."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  etiqueta="Negocios creados"
                  valor={numero(datos.ventas.creados)}
                />
                <Kpi
                  etiqueta="Ganados"
                  valor={numero(datos.ventas.ganados)}
                  detalle={`Tasa de cierre ${porcentaje(
                    datos.ventas.ganados,
                    datos.ventas.ganados + datos.ventas.perdidos
                  )}`}
                />
                <Kpi
                  etiqueta="Valor ganado"
                  valor={moneda(datos.ventas.valor_ganado)}
                />
                <Kpi
                  etiqueta="En curso"
                  valor={moneda(datos.ventas.valor_abierto)}
                  detalle={`${numero(datos.ventas.abiertos)} negocios abiertos`}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Tabla
                  titulo="Embudo actual (negocios abiertos)"
                  encabezados={['Pipeline', 'Etapa', 'Negocios', 'Valor']}
                  filas={datos.embudo.map((e) => [
                    e.pipeline,
                    e.etapa,
                    e.negocios,
                    moneda(e.valor),
                  ])}
                  archivo={`embudo-${sufijo}`}
                />
                <Tabla
                  titulo="Por asesor"
                  encabezados={[
                    'Asesor',
                    'Ganados',
                    'Valor ganado',
                    'Abiertos',
                  ]}
                  filas={datos.ventas_por_asesor.map((a) => [
                    a.nombre,
                    a.ganados,
                    moneda(a.valor_ganado),
                    a.abiertos,
                  ])}
                  archivo={`ventas-por-asesor-${sufijo}`}
                />
              </div>
            </Seccion>
          )}

          {/* ---------------- Llamadas ---------------- */}
          {activo('telefonia') && datos.llamadas.total > 0 && (
            <Seccion titulo="Llamadas">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  etiqueta="Llamadas"
                  valor={numero(datos.llamadas.total)}
                  detalle={`${numero(datos.llamadas.entrantes)} entrantes · ${numero(datos.llamadas.salientes)} salientes`}
                />
                <Kpi
                  etiqueta="Contestadas"
                  valor={numero(datos.llamadas.contestadas)}
                  detalle={porcentaje(
                    datos.llamadas.contestadas,
                    datos.llamadas.total
                  )}
                />
                <Kpi
                  etiqueta="Entrantes perdidas"
                  valor={numero(datos.llamadas.perdidas)}
                />
                <Kpi
                  etiqueta="Duración media"
                  valor={duracion(
                    datos.llamadas.duracion_media_s === null
                      ? null
                      : datos.llamadas.duracion_media_s / 60
                  )}
                />
              </div>
            </Seccion>
          )}

          {/* ---------------- Masivos ---------------- */}
          {activo('masivos') && datos.masivos.length > 0 && (
            <Seccion titulo="Mensajes masivos">
              <Tabla
                titulo="Envíos del período"
                encabezados={[
                  'Envío',
                  'Fecha',
                  'Destinatarios',
                  'Entregados',
                  'Leídos',
                  'Respondidos',
                  'Fallidos',
                ]}
                filas={datos.masivos.map((m) => [
                  m.nombre,
                  new Date(m.fecha).toLocaleDateString('es'),
                  m.destinatarios,
                  `${numero(m.entregados)} (${porcentaje(m.entregados, m.destinatarios)})`,
                  `${numero(m.leidos)} (${porcentaje(m.leidos, m.destinatarios)})`,
                  `${numero(m.respondidos)} (${porcentaje(m.respondidos, m.destinatarios)})`,
                  m.fallidos,
                ])}
                archivo={`masivos-${sufijo}`}
              />
            </Seccion>
          )}
        </div>
      )}
    </div>
  );
}

function Seccion({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-lg font-semibold">{titulo}</h2>
        {nota && <p className="text-muted-foreground text-xs">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs">{etiqueta}</p>
        <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
          {valor}
        </p>
        {detalle && (
          <p className="text-muted-foreground mt-0.5 text-xs">{detalle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Tabla({
  titulo,
  encabezados,
  filas,
  archivo,
  vacio = 'Sin datos en este período.',
}: {
  titulo: string;
  encabezados: string[];
  filas: (string | number)[][];
  archivo: string;
  vacio?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-medium">{titulo}</p>
          {filas.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => descargarCsv(archivo, aCsv(encabezados, filas))}
            >
              <Download className="size-4" />
              CSV
            </Button>
          )}
        </div>
        {filas.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">{vacio}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  {encabezados.map((e, i) => (
                    <th
                      key={e}
                      className={cn(
                        'px-4 py-2 font-medium',
                        i > 0 && 'text-right'
                      )}
                    >
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {f.map((c, j) => (
                      <td
                        key={j}
                        className={cn(
                          'px-4 py-2',
                          j > 0 && 'text-right tabular-nums'
                        )}
                      >
                        {typeof c === 'number' ? numero(c) : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
