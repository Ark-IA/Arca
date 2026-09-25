'use client';

/**
 * Seguimiento web: el script que convierte los formularios de la página del
 * cliente en contactos.
 *
 * Esta pantalla solo configura. Lo que decide si un formulario se vuelve
 * contacto está en el servidor (`src/lib/seguimiento-web/archivar.ts`), y la
 * escritura de `sitios_web` la limita RLS a quien administra: esconder los
 * botones no protegería nada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Globe,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { describirOrigen } from '@/lib/seguimiento-web/atribucion';
import {
  fragmentoGtm,
  fragmentoScript,
  normalizarDominio,
  nuevaClaveDeSitio,
} from '@/lib/seguimiento-web/constantes';
import { SettingsPanelHead } from './settings-panel-head';
import type { FormularioWeb, SitioWeb, Tag } from '@/types';

const SIN_ETIQUETA = '__ninguna__';

function appUrl(): string {
  const configurado = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configurado) return configurado.replace(/\/+$/, '');
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function fecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SeguimientoWeb() {
  const { accountId, accountRole } = useAuth();
  const puedeEditar = accountRole ? canEditSettings(accountRole) : false;

  const [sitio, setSitio] = useState<SitioWeb | null>(null);
  const [etiquetas, setEtiquetas] = useState<Tag[]>([]);
  const [formularios, setFormularios] = useState<FormularioWeb[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevoDominio, setNuevoDominio] = useState('');
  const [confirmarRotar, setConfirmarRotar] = useState(false);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    const db = createClient();
    // Un sitio por cuenta, por ahora: la tabla admite varios, pero la
    // pantalla no los necesita todavía y un selector vacío confunde.
    const [{ data: sitios, error }, { data: tags }] = await Promise.all([
      db
        .from('sitios_web')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: true })
        .limit(1),
      db.from('tags').select('*').eq('account_id', accountId).order('name'),
    ]);
    if (error) {
      toast.error('No se pudo cargar el seguimiento web.');
      setCargando(false);
      return;
    }
    const actual = ((sitios ?? [])[0] as SitioWeb | undefined) ?? null;
    setSitio(actual);
    setEtiquetas((tags ?? []) as Tag[]);

    if (actual) {
      const { data: envios } = await db
        .from('formularios_web')
        .select('*')
        .eq('sitio_id', actual.id)
        .order('created_at', { ascending: false })
        .limit(25);
      setFormularios((envios ?? []) as FormularioWeb[]);
    }
    setCargando(false);
  }, [accountId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (cambios: Partial<SitioWeb>, aviso = 'Guardado.') => {
    if (!sitio) return;
    setGuardando(true);
    const { data, error } = await createClient()
      .from('sitios_web')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', sitio.id)
      .select('*')
      .single();
    setGuardando(false);
    if (error || !data) {
      toast.error('No se pudo guardar.');
      return;
    }
    setSitio(data as SitioWeb);
    toast.success(aviso);
  };

  const crear = async () => {
    if (!accountId) return;
    setGuardando(true);
    const { data, error } = await createClient()
      .from('sitios_web')
      .insert({ account_id: accountId, dominios: [] })
      .select('*')
      .single();
    setGuardando(false);
    if (error || !data) {
      toast.error('No se pudo activar el seguimiento web.');
      return;
    }
    setSitio(data as SitioWeb);
    toast.success('Listo. Agrega el dominio de tu página y pega el script.');
  };

  const agregarDominio = async () => {
    if (!sitio) return;
    const dominio = normalizarDominio(nuevoDominio);
    if (!dominio) {
      toast.error('Eso no parece un dominio (ej. miempresa.com).');
      return;
    }
    if (sitio.dominios.includes(dominio)) {
      setNuevoDominio('');
      return;
    }
    await guardar(
      { dominios: [...sitio.dominios, dominio].sort() },
      'Dominio agregado.'
    );
    setNuevoDominio('');
  };

  const quitarDominio = (dominio: string) =>
    guardar(
      { dominios: sitio?.dominios.filter((d) => d !== dominio) ?? [] },
      'Dominio quitado.'
    );

  const rotar = async () => {
    setConfirmarRotar(false);
    await guardar(
      { clave: nuevaClaveDeSitio() },
      'Clave nueva. Reemplaza el script en tu página: el anterior deja de funcionar en unos minutos.'
    );
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Copiado.');
    } catch {
      toast.error('No se pudo copiar.');
    }
  };

  const fragmentos = useMemo(
    () =>
      sitio
        ? {
            normal: fragmentoScript(appUrl(), sitio.clave),
            gtm: fragmentoGtm(appUrl(), sitio.clave),
          }
        : null,
    [sitio]
  );

  const encabezado = (
    <SettingsPanelHead
      title="Formularios web"
      description="Un script para tu página: cada formulario que alguien llene con su teléfono o correo entra como contacto, con de dónde vino (Google, Facebook, una campaña). Sin cookies de terceros ni servicios externos."
    />
  );

  if (cargando) {
    return (
      <section>
        {encabezado}
        <div className="flex justify-center py-10">
          <Loader2 className="text-primary size-5 animate-spin" />
        </div>
      </section>
    );
  }

  if (!sitio) {
    return (
      <section className="animate-in fade-in-50 space-y-6 duration-200">
        {encabezado}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Globe className="text-muted-foreground size-8" />
            <p className="text-muted-foreground max-w-[48ch] text-sm">
              Todavía no está activado. Al activarlo se genera el script que vas
              a pegar en tu página.
            </p>
            {puedeEditar && (
              <Button onClick={crear} disabled={guardando}>
                {guardando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Activar seguimiento web
              </Button>
            )}
          </CardContent>
        </Card>
      </section>
    );
  }

  const sinDominios = sitio.limitar_a_dominios && sitio.dominios.length === 0;

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      {encabezado}

      {/* Estado */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {sitio.pausado ? (
              <Badge variant="secondary">Pausado</Badge>
            ) : sinDominios ? (
              <Badge variant="destructive">Falta el dominio</Badge>
            ) : (
              <Badge>Activo</Badge>
            )}
            <span className="text-muted-foreground">
              {sitio.paginas_vistas.toLocaleString('es')} páginas vistas ·
              última {fecha(sitio.ultima_visita)}
            </span>
          </div>
          {puedeEditar && (
            <Button
              variant="outline"
              size="sm"
              disabled={guardando}
              onClick={() =>
                guardar(
                  { pausado: !sitio.pausado },
                  sitio.pausado
                    ? 'Reanudado.'
                    : 'Pausado. Deja de registrar en unos minutos.'
                )
              }
            >
              {sitio.pausado ? (
                <Play className="size-4" />
              ) : (
                <Pause className="size-4" />
              )}
              {sitio.pausado ? 'Reanudar' : 'Pausar'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Script */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-semibold">1. Pega el script</h3>
            <p className="text-muted-foreground text-xs">
              En el &lt;head&gt; de todas las páginas, o en el pie si usas
              WordPress (Ajustes → Insertar encabezados y pies).
            </p>
          </div>
          {fragmentos && (
            <>
              <Fragmento
                texto={fragmentos.normal}
                onCopiar={() => copiar(fragmentos.normal)}
              />
              <div>
                <p className="text-muted-foreground mb-1.5 text-xs">
                  Si usas Google Tag Manager, usa esta versión en una etiqueta
                  de HTML personalizado (GTM borra el atributo{' '}
                  <code>data-site</code>):
                </p>
                <Fragmento
                  texto={fragmentos.gtm}
                  onCopiar={() => copiar(fragmentos.gtm)}
                />
              </div>
            </>
          )}
          {puedeEditar && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {confirmarRotar ? (
                <>
                  <span className="text-muted-foreground text-xs">
                    El script actual dejará de funcionar. ¿Seguro?
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={rotar}
                    disabled={guardando}
                  >
                    Sí, generar clave nueva
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmarRotar(false)}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmarRotar(true)}
                >
                  <RefreshCw className="size-4" />
                  Generar clave nueva
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dominios */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">2. Dominios de tu página</h3>
            <p className="text-muted-foreground text-xs">
              Solo se aceptan datos que vengan de aquí. Así nadie puede copiar
              tu script en otra página y llenarte el CRM de contactos falsos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sitio.dominios.map((d) => (
              <Badge key={d} variant="outline" className="gap-1 font-mono">
                {d}
                {puedeEditar && (
                  <button
                    type="button"
                    aria-label={`Quitar ${d}`}
                    onClick={() => void quitarDominio(d)}
                    className="hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </Badge>
            ))}
            {sitio.dominios.length === 0 && (
              <span className="text-muted-foreground text-xs">
                Ninguno todavía.
              </span>
            )}
          </div>
          {puedeEditar && (
            <div className="flex gap-2">
              <Input
                value={nuevoDominio}
                onChange={(e) => setNuevoDominio(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void agregarDominio();
                }}
                placeholder="miempresa.com"
                className="max-w-xs font-mono"
              />
              <Button
                variant="outline"
                onClick={agregarDominio}
                disabled={guardando || !nuevoDominio.trim()}
              >
                <Plus className="size-4" />
                Agregar
              </Button>
            </div>
          )}
          <Opcion
            etiqueta="Incluir subdominios"
            detalle="blog.miempresa.com y tienda.miempresa.com cuentan como miempresa.com."
            valor={sitio.incluir_subdominios}
            deshabilitado={!puedeEditar || guardando}
            onCambio={(v) => guardar({ incluir_subdominios: v })}
          />
          <Opcion
            etiqueta="Aceptar solo estos dominios"
            detalle="Apagarlo acepta datos de cualquier página que tenga el script. No es recomendable."
            valor={sitio.limitar_a_dominios}
            deshabilitado={!puedeEditar || guardando}
            onCambio={(v) => guardar({ limitar_a_dominios: v })}
          />
        </CardContent>
      </Card>

      {/* Contactos */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h3 className="text-sm font-semibold">
            3. Qué pasa con cada formulario
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Etiqueta para los contactos que llegan</Label>
              <Select
                value={sitio.etiqueta_id ?? SIN_ETIQUETA}
                disabled={!puedeEditar || guardando}
                onValueChange={(v) =>
                  v && guardar({ etiqueta_id: v === SIN_ETIQUETA ? null : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {etiquetas.find((t) => t.id === sitio.etiqueta_id)?.name ??
                      'Sin etiqueta'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ETIQUETA}>Sin etiqueta</SelectItem>
                  {etiquetas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Con una automatización «Etiqueta agregada» puedes escribirle por
                WhatsApp apenas llena el formulario.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sw-pais">Indicativo por defecto</Label>
              <Input
                id="sw-pais"
                defaultValue={sitio.pais_por_defecto}
                disabled={!puedeEditar || guardando}
                inputMode="numeric"
                className="w-24 font-mono"
                onBlur={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  if (
                    v &&
                    v !== sitio.pais_por_defecto &&
                    /^[1-9]\d{0,2}$/.test(v)
                  ) {
                    void guardar({ pais_por_defecto: v });
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                Se le pone a los teléfonos escritos sin él: «300 123 4567» con
                57 queda +57 300 123 4567.
              </p>
            </div>
          </div>
          <Opcion
            etiqueta="Respetar «No rastrear»"
            detalle="Si el navegador del visitante lo pide, no se registra nada."
            valor={sitio.respetar_dnt}
            deshabilitado={!puedeEditar || guardando}
            onCambio={(v) => guardar({ respetar_dnt: v })}
          />
        </CardContent>
      </Card>

      {/* Últimos envíos */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Últimos formularios</h3>
        {formularios.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-6 text-center text-sm">
              Todavía no llega ninguno. Cuando pegues el script, llena un
              formulario de tu página para probarlo.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-border divide-y p-0">
              {formularios.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {f.nombre ?? f.telefono ?? f.email ?? 'Sin nombre'}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[f.telefono && `+${f.telefono}`, f.email]
                        .filter(Boolean)
                        .join(' · ')}
                      {' — '}
                      {f.host}
                      {f.ruta} · {describirOrigen(f.ultimo_origen)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {fecha(f.created_at)}
                    </span>
                    {f.contact_id ? (
                      <Link
                        href={`/contacts/${f.contact_id}`}
                        className="text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        <Check className="size-3" />
                        Ver contacto
                      </Link>
                    ) : (
                      <Badge variant="secondary" title={f.motivo_omitido ?? ''}>
                        {f.motivo_omitido ?? 'Pendiente'}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function Fragmento({
  texto,
  onCopiar,
}: {
  texto: string;
  onCopiar: () => void;
}) {
  return (
    <div className="bg-muted/50 flex items-start gap-2 rounded-md border p-2">
      <code className="min-w-0 flex-1 text-xs break-all">{texto}</code>
      <Button
        size="icon"
        variant="ghost"
        onClick={onCopiar}
        aria-label="Copiar"
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

function Opcion({
  etiqueta,
  detalle,
  valor,
  deshabilitado,
  onCambio,
}: {
  etiqueta: string;
  detalle: string;
  valor: boolean;
  deshabilitado: boolean;
  onCambio: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{etiqueta}</p>
        <p className="text-muted-foreground text-xs">{detalle}</p>
      </div>
      <Switch
        checked={valor}
        disabled={deshabilitado}
        onCheckedChange={(v) => onCambio(v)}
      />
    </div>
  );
}
