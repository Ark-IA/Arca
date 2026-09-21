'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import type { Contact, Tag, CustomField, Deal, MessageTemplate } from '@/types';
import {
  TemplatePicker,
  type TemplateSendValues,
} from '@/components/inbox/template-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Phone,
  PhoneCall,
  Mail,
  Building2,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  Save,
  DollarSign,
  LayoutTemplate,
  User,
  Tag as TagIcon,
  SlidersHorizontal,
  Activity,
  StickyNote,
  CheckSquare,
  FileText,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PanelNotas } from '@/components/registros/panel-notas';
import { PanelAdjuntos } from '@/components/registros/panel-adjuntos';
import { PanelLineaDeTiempo } from '@/components/registros/panel-linea-de-tiempo';
import { PanelTareasDeContacto } from '@/components/registros/panel-tareas-de-contacto';
import { PanelProximaGestion } from '@/components/registros/panel-proxima-gestion';
import { AvisoProximaGestion } from '@/components/registros/aviso-proxima-gestion';
import { ChatDelContacto } from '@/components/contacts/chat-del-contacto';
import { canSendMessages } from '@/lib/auth/roles';
import { useTelefono } from '@/components/telefonia/contexto-telefono';

/**
 * Estilo compartido de los campos de la ficha.
 *
 * El borde se aclara al pasar por encima y el foco lo tiñe del color de marca.
 * Sin eso, en un fondo oscuro un campo de texto y una etiqueta se ven igual y
 * no hay forma de saber dónde se puede escribir hasta hacer clic.
 */
const CAMPO =
  'bg-muted border-border text-foreground h-8 text-sm transition-colors ' +
  'hover:border-primary/40 focus:border-primary/60';

interface ContactDetailViewProps {
  contactId: string | null;
  /** Aviso a quien la abrió de que algo cambió, por si tiene una lista detrás. */
  onUpdated: () => void;
  /** Pestaña con la que abrir, si el enlace pidió una. */
  pestanaPedida?: string | null;
  /**
   * Volver a de donde se vino.
   *
   * El botón vive DENTRO de la cabecera y no encima de ella: en una fila
   * propia se comía casi tres centímetros de alto, y ese alto sale del
   * chat, que es lo único de la pantalla que lo necesita.
   */
  onVolver?: () => void;
}

/**
 * Las pestañas de la columna derecha.
 *
 * Son las seis cosas que se consultan o se anotan MIENTRAS se conversa. Los
 * datos, las etiquetas y los campos propios no están acá porque no se
 * consultan: se editan, y por eso viven a la izquierda, siempre a la vista.
 *
 * El nombre se pide como función porque tres de los seis vienen de las
 * traducciones y `t` solo existe dentro del componente.
 */
type Traductor = ReturnType<typeof useTranslations>;

const PESTANAS: {
  id: string;
  etiqueta: (t: Traductor) => string;
  icono: LucideIcon;
}[] = [
  { id: 'activity', etiqueta: () => 'Actividad', icono: Activity },
  { id: 'notes', etiqueta: (t) => t('tabs.notes'), icono: StickyNote },
  { id: 'tasks', etiqueta: () => 'Tareas', icono: CheckSquare },
  { id: 'files', etiqueta: () => 'Archivos', icono: FileText },
  { id: 'next', etiqueta: () => 'Gestión', icono: CalendarClock },
  { id: 'deals', etiqueta: (t) => t('tabs.deals'), icono: DollarSign },
];

/** Para no fiarse de lo que venga en la dirección. */
const PESTANAS_VALIDAS = PESTANAS.map((p) => p.id);

function pestanaInicial(pedida: string | null | undefined): string {
  return pedida && PESTANAS_VALIDAS.includes(pedida) ? pedida : 'activity';
}

/**
 * Una tarjeta con título, de las que forman las columnas laterales.
 *
 * Existe para que las seis secciones se vean como seis cosas y no como una
 * lista larga: sin el borde y el encabezado, «Etiquetas» y «Campos
 * personalizados» se leen como una sola sección con campos sueltos.
 */
function Bloque({
  titulo,
  icono: Icono,
  children,
}: {
  titulo: string;
  icono: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-xl border">
      <header className="border-border flex items-center gap-2 border-b px-4 py-2.5">
        <Icono className="text-muted-foreground size-3.5" />
        <h2 className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {titulo}
        </h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ContactDetailView({
  contactId,
  onUpdated,
  pestanaPedida,
  onVolver,
}: ContactDetailViewProps) {
  const t = useTranslations('Contacts.detailView');
  const supabase = createClient();
  const { defaultCurrency, accountRole } = useAuth();
  // Los paneles nuevos comparten la misma regla que el resto del CRM: de
  // 'agent' para arriba se escribe, un 'viewer' solo mira.
  const puedeEditarRegistros = accountRole ? canSendMessages(accountRole) : false;

  const [contact, setContact] = useState<Contact | null>(null);
  // La pestaña con la que se abre puede venir en la dirección
  // (`/contacts/xxx?tab=next`). Es lo que permite que un enlace lleve
  // directo a agendar en vez de a Detalles, y que quien lo abra vea lo que
  // le prometieron. Se lee UNA vez, al montar: después manda lo que la
  // persona pulse, no lo que diga la barra de direcciones.
  const [pestana, setPestana] = useState(() => pestanaInicial(pestanaPedida));
  /**
   * Cambia cada vez que se agenda una gestión, para que el aviso de la pestaña
   * Detalles se entere. Sin esto, agendar y volver a Detalles seguiría diciendo
   * "Sin próxima gestión": son dos componentes con su propia consulta.
   */
  const [gestionesVersion, setGestionesVersion] = useState(0);
  // La empresa del contacto, para colgar de ella también la próxima gestión:
  // así aparece en la ficha de la empresa, que es donde mira quien lleva la
  // cuenta y no a la persona.
  const companyIdDelContacto = contact?.company_id ?? null;
  const [loading, setLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Teléfono del CRM. `null` fuera del panel; sin extensión, `disponible` es
  // false y el número vuelve a ser "copiar".
  const telefono = useTelefono();
  const puedeLlamar = !!telefono?.disponible && !!contact?.phone;

  function llamarAlContacto() {
    if (!telefono || !contact?.phone) return;
    // Se limpia el número antes de marcarlo: Asterisk no entiende espacios ni
    // paréntesis, y un contacto guardado como "+57 (300) 123-4567" fallaría.
    // El '+' se conserva porque forma parte del formato internacional.
    telefono.llamar(contact.phone.replace(/[^\d*#+]/g, ''));
    toast.success(`Llamando a ${contact.name || contact.phone}…`);
  }

  // Send template — lets the business initiate (or re-open) a conversation
  // with this contact by sending an approved template. The send route
  // find-or-creates the conversation, so no inbound message is required.
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);

  // Details tab
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Tags tab
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Custom fields tab
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Deals tab
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (data) {
      setContact(data);
      setEditName(data.name ?? '');
      setEditPhone(data.phone);
      setEditEmail(data.email ?? '');
      setEditCompany(data.company ?? '');
    }
    setLoading(false);
  }, [contactId, supabase]);

  const fetchTags = useCallback(async () => {
    if (!contactId) return;

    const [tagsRes, contactTagsRes] = await Promise.all([
      supabase.from('tags').select('*').order('name'),
      supabase.from('contact_tags').select('tag_id').eq('contact_id', contactId),
    ]);

    if (tagsRes.data) setAllTags(tagsRes.data);
    if (contactTagsRes.data) {
      setContactTagIds(contactTagsRes.data.map((ct) => ct.tag_id));
    }
  }, [contactId, supabase]);

  const fetchCustomFields = useCallback(async () => {
    if (!contactId) return;
    setLoadingCustom(true);

    const [fieldsRes, valuesRes] = await Promise.all([
      supabase.from('custom_fields').select('*').order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contactId),
    ]);

    if (fieldsRes.data) setCustomFields(fieldsRes.data);
    if (valuesRes.data) {
      const map: Record<string, string> = {};
      valuesRes.data.forEach((v) => {
        map[v.custom_field_id] = v.value ?? '';
      });
      setCustomValues(map);
    }
    setLoadingCustom(false);
  }, [contactId, supabase]);

  const fetchDeals = useCallback(async () => {
    if (!contactId) return;
    setLoadingDeals(true);
    const { data } = await supabase
      .from('deals')
      .select('*, stage:pipeline_stages(*)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as Deal[]);
    setLoadingDeals(false);
  }, [contactId, supabase]);

  useEffect(() => {
    if (contactId) {
      fetchContact();
      fetchTags();
      fetchCustomFields();
      fetchDeals();
    }
    // La condición era `open && contactId`, de cuando la ficha era una
    // ventana que se abría y se cerraba. En una pantalla no hay nada que
    // abrir: si hay contacto, se carga. Y `open` ya no era una variable de
    // este componente —resolvía a `window.open`, que siempre existe—, así
    // que la condición no filtraba nada.
  }, [contactId, fetchContact, fetchTags, fetchCustomFields, fetchDeals]);

  // Al pasar de un contacto a otro se vuelve a la pestaña de entrada. Sin
  // esto, quien está mirando «Archivos» de alguien y abre el siguiente cae
  // en los archivos de otra persona, que es donde peor se nota que estás
  // viendo la ficha equivocada.
  //
  // Se guarda el par —contacto y pestaña— y se decide al dibujar, en vez de
  // reponerla desde un efecto: con el efecto habría un instante en el que la
  // pestaña vieja ya está en pantalla con el contacto nuevo, que es
  // exactamente el error que se quiere evitar.
  const [dueno, setDueno] = useState<string | null>(contactId);
  if (dueno !== contactId) {
    setDueno(contactId);
    setPestana(pestanaInicial(pestanaPedida));
  }

  async function copyPhone() {
    if (!contact) return;
    // Copiar el identificador cuando no hay numero es mas util que copiar
    // una cadena vacia sin avisar.
    await navigator.clipboard.writeText(
      contact.phone ?? contact.whatsapp_user_id ?? contact.whatsapp_id ?? "",
    );
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveDetails() {
    if (!contactId || !editPhone.trim()) {
      toast.error(t('toastPhoneRequired'));
      return;
    }

    setSavingDetails(true);
    const { error } = await supabase
      .from('contacts')
      .update({
        name: editName.trim() || null,
        phone: editPhone.trim(),
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    if (error) {
      toast.error(t('toastUpdateFailed'));
    } else {
      toast.success(t('toastUpdated'));
      fetchContact();
      onUpdated();
    }
    setSavingDetails(false);
  }

  async function toggleTag(tagId: string) {
    if (!contactId) return;
    setSavingTags(true);

    const isSelected = contactTagIds.includes(tagId);

    try {
      if (isSelected) {
        await deleteContactTag(contactId, tagId);
        setContactTagIds((prev) => prev.filter((id) => id !== tagId));
      } else {
        await addContactTag(contactId, tagId);
        setContactTagIds((prev) => [...prev, tagId]);
      }
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toastUpdateFailed'));
    }
    setSavingTags(false);
  }

  async function saveCustomFields() {
    if (!contactId) return;
    setSavingCustom(true);

    try {
      // Delete existing values and re-insert
      await supabase
        .from('contact_custom_values')
        .delete()
        .eq('contact_id', contactId);

      const rows = Object.entries(customValues)
        .filter(([, val]) => val.trim())
        .map(([fieldId, val]) => ({
          contact_id: contactId,
          custom_field_id: fieldId,
          value: val.trim(),
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('contact_custom_values')
          .insert(rows);
        if (error) throw error;
      }

      toast.success(t('toastCustomFieldsSaved'));
    } catch {
      toast.error(t('toastCustomFieldsFailed'));
    }
    setSavingCustom(false);
  }

  async function handleSendTemplate(
    template: MessageTemplate,
    values: TemplateSendValues,
  ) {
    if (!contactId) return;
    setSendingTemplate(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No conversation_id — the route find-or-creates one for this
          // contact, mirroring the inbox template-send payload otherwise.
          contact_id: contactId,
          message_type: 'template',
          template_name: template.name,
          template_language: template.language,
          template_message_params: {
            body: values.body,
            headerText: values.headerText,
            buttonParams: values.buttonParams,
          },
          template_params: values.body,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = payload?.error || `HTTP ${res.status}`;
        toast.error(t('toastTemplateFailed', { reason }));
        return;
      }

      toast.success(t('toastTemplateSent', { name: template.name }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      toast.error(`Failed to send template: ${reason}`);
    } finally {
      setSendingTemplate(false);
    }
  }

  function getInitials(name?: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <>
      {loading || !contact ? (
        <div className="border-border bg-card flex h-full items-center justify-center rounded-xl border">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        // Columna de alto heredado: la cabecera ocupa lo suyo y la rejilla se
        // queda con el resto. Antes esto era una pila (`space-y-4`) que
        // crecía con el contenido, y por eso la página se estiraba.
        <div className="flex h-full min-h-0 flex-col gap-4">
          {/* ============================================================
              Cabecera: quién es y qué se hace con él
              ============================================================
              Franja del color de marca: separa la identidad del contacto
              del contenido sin necesidad de una línea más, y le da a la
              pantalla un punto de anclaje visual. */}
          <div className="border-border from-primary/10 via-primary/5 shrink-0 rounded-xl border bg-gradient-to-r to-transparent px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              {onVolver && (
                <button
                  type="button"
                  onClick={onVolver}
                  title="Volver"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground -ml-1 shrink-0 rounded-md p-1.5 transition-colors"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}

              <Avatar className="border-primary/20 bg-muted ring-primary/10 size-10 border ring-2">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {getInitials(contact.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <h1 className="text-foreground truncate text-base font-semibold">
                  {contact.name || t('unnamed')}
                </h1>

                {/* Los datos de contacto son PULSABLES: el teléfono llama o
                    se copia, el correo abre el cliente de correo. Como texto
                    plano obligaban a seleccionar a mano. */}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {/* El teléfono LLAMA, no copia.
                      Copiar el número era un paso intermedio inútil: nadie lo
                      quiere en el portapapeles, lo quiere marcado. Un clic
                      aquí inicia la llamada en el softphone y abre la burbuja
                      sola, sin un segundo clic.
                      Quien no tiene extensión sigue viendo "copiar", que es
                      lo único que puede hacer con ese número. */}
                  {puedeLlamar ? (
                    <button
                      onClick={llamarAlContacto}
                      title={`Llamar a ${contact.phone}`}
                      className="border-primary/30 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/20 hover:shadow-primary/10 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium transition-all hover:shadow-md"
                    >
                      <PhoneCall className="size-3" />
                      {contact.phone}
                    </button>
                  ) : (
                    <button
                      onClick={copyPhone}
                      title="Copiar el teléfono"
                      className="border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:bg-card hover:text-primary inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors"
                    >
                      <Phone className="size-3" />
                      {contact.phone}
                      {copiedPhone ? (
                        <Check className="text-primary size-3" />
                      ) : (
                        <Copy className="size-3 opacity-60" />
                      )}
                    </button>
                  )}

                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      title="Escribir un correo"
                      className="border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:bg-card hover:text-primary inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors"
                    >
                      <Mail className="size-3" />
                      {contact.email}
                    </a>
                  )}

                  {contact.company && (
                    <span className="border-border bg-card/60 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                      <Building2 className="size-3" />
                      {contact.company}
                    </span>
                  )}
                </div>
              </div>

              {/* Enviar plantilla: la acción principal de la ficha, arriba a
                  la derecha, no debajo del nombre. */}
              <Button
                size="sm"
                onClick={() => setTemplatePickerOpen(true)}
                disabled={sendingTemplate}
                className="bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/20 shrink-0 transition-all hover:shadow-lg"
              >
                {sendingTemplate ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LayoutTemplate className="size-4" />
                )}
                {t('sendTemplateBtn')}
              </Button>
            </div>
          </div>

          {/* ============================================================
              Tres columnas
              ============================================================
              Cada una responde una pregunta distinta, y esa es la razón del
              reparto:

                izquierda  QUIÉN es           datos, etiquetas, campos propios
                centro     QUÉ LE DIGO        la conversación con el cliente
                derecha    QUÉ HAY ALREDEDOR  actividad, notas, tareas,
                                              archivos, negocios y la próxima
                                              gestión

              El chat va en el MEDIO porque es lo único de esta pantalla que
              se usa mirándolo fijo: se lee lo que escribió el cliente y se le
              contesta ahí mismo. Todo lo demás son cosas que se consultan de
              reojo o se anotan al pasar, y por eso viven a los costados.

              Antes era una sola fila de nueve pestañas. El problema no era el
              espacio sino que obligaba a elegir: para ver una etiqueta había
              que dejar de ver la actividad, y para saber qué se había
              acordado había que abandonar los campos que se estaban
              editando. Un contacto se mira entero, no de a una cosa.

              La rejilla se queda con el alto que sobra —`flex-1`— en vez de
              calcularlo restando a `100vh`. El chat necesita un alto conocido
              para desplazarse por dentro, pero ese alto lo sabe el
              contenedor, no una cuenta: la versión con números no incluía el
              hueco de la burbuja del teléfono y la página sobraba por abajo.

              Se apila por debajo de `xl` —tres columnas en una pantalla
              angosta dejan cada una demasiado estrecha para escribir— y ahí
              sí se desplaza en bloque, porque apiladas no caben. */}
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[19rem_minmax(0,1fr)_22rem] xl:grid-rows-[minmax(0,1fr)] xl:overflow-visible">
            {/* ---------- IZQUIERDA: quién es ---------- */}
            {/* Se desplaza por dentro. Sin esto, tres campos personalizados
                de más estirarían la fila y descolocarían el chat. */}
            <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              <Bloque titulo="Contacto" icono={User}>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('name')}</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">
                      {t('phone')} <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('email')}</Label>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('company')}</Label>
                    <Input
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                  <Button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                    size="sm"
                  >
                    {savingDetails ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    {t('saveChangesBtn')}
                  </Button>
                </div>
              </Bloque>

              <Bloque titulo={t('tabs.tags')} icono={TagIcon}>
                <div className="space-y-3">
                  <p className="text-muted-foreground text-xs">
                    {t('tagsTab.clickTagDesc')}
                  </p>
                  {allTags.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t('tagsTab.noTagsAvailable')}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => {
                        const selected = contactTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            disabled={savingTags}
                            className={`inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-xs font-medium transition-all ${
                              selected
                                ? 'ring-primary ring-offset-border ring-2 ring-offset-1'
                                : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {selected && <Check className="mr-1 size-3" />}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Bloque>

              <Bloque titulo={t('tabs.custom')} icono={SlidersHorizontal}>
                {loadingCustom ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="text-muted-foreground size-5 animate-spin" />
                  </div>
                ) : customFields.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('noCustomFields')}</p>
                ) : (
                  <div className="space-y-3">
                    {customFields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs capitalize">
                          {field.field_name}
                        </Label>
                        <Input
                          value={customValues[field.id] ?? ''}
                          onChange={(e) =>
                            setCustomValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                          placeholder={t('enterCustomField', { name: field.field_name })}
                          className={CAMPO}
                        />
                      </div>
                    ))}
                    <Button
                      onClick={saveCustomFields}
                      disabled={savingCustom}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                      size="sm"
                    >
                      {savingCustom ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      {t('saveCustomFieldsBtn')}
                    </Button>
                  </div>
                )}
              </Bloque>
            </div>

            {/* ---------- CENTRO: qué le digo ---------- */}
            {/* El mismo hilo de la bandeja, con su campo de escritura, sus
                adjuntos y sus estados de entrega. Que sea EL MISMO y no una
                caja de texto reducida es la diferencia entre poder atender
                desde la ficha y tener que saltar a la bandeja para cada
                respuesta. */}
            {/* Alto fijo por debajo de `xl`, donde la fila no lo impone; de
                `xl` para arriba lo marca la rejilla.

                La fila se declara `minmax(0, 1fr)` arriba, y ese `0` es lo
                que arregla que el chat se pasara de largo. Por omisión una
                fila mide `auto`, o sea «lo que pida el contenido más alto»:
                con doscientos mensajes, el hilo pedía toda su altura, la
                fila crecía con él y las columnas de los lados se estiraban
                detrás, vacías. Con el mínimo en cero la fila vale exactamente
                el alto disponible y el hilo se desplaza por dentro, a la
                altura de los datos de al lado. */}
            <div className="min-h-0 xl:h-auto max-xl:h-[30rem]">
              <ChatDelContacto contact={contact} />
            </div>

            {/* ---------- DERECHA: qué hay alrededor ---------- */}
            {/* Todo lo que se consulta o se anota mientras se conversa, en un
                solo sitio y por pestañas. Apilado en bloques ocupaba tres
                pantallas de alto y lo de abajo no lo miraba nadie; y como
                fila de pestañas arriba del contenido le robaba el centro al
                chat, que es lo que de verdad se mira fijo. */}
            <div className="border-border bg-card flex min-h-0 flex-col overflow-hidden rounded-xl border">
              {/* El aviso de la próxima gestión va FUERA de las pestañas: es
                  lo único de esta columna que hay que ver sin buscarlo. Una
                  gestión vencida escondida detrás de una pestaña es una
                  gestión que nadie atiende. */}
              {contactId && (
                <div className="border-border shrink-0 border-b p-3">
                  <AvisoProximaGestion
                    // La clave incluye la versión: cambiarla remonta el aviso
                    // y lo obliga a releer, que es más simple y más difícil
                    // de romper que pasarle un `refrescar` hacia abajo.
                    key={`${contactId}-${gestionesVersion}`}
                    contactId={contactId}
                    onIr={() => setPestana('next')}
                  />
                </div>
              )}

              {/* Dos filas de tres. Seis nombres en una sola fila no entran en
                  una columna de este ancho: o se recortan o aparece una barra
                  horizontal, y una pestaña que hay que ir a buscar
                  desplazando es una pestaña que no existe. */}
              <div className="border-border grid shrink-0 grid-cols-3 gap-px border-b">
                {PESTANAS.map((p) => {
                  const Icono = p.icono;
                  const activa = pestana === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPestana(p.id)}
                      className={
                        'flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors ' +
                        (activa
                          ? 'text-primary border-primary -mb-px border-b-2'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')
                      }
                    >
                      <Icono className="size-4" />
                      {p.etiqueta(t)}
                    </button>
                  );
                })}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {pestana === 'activity' && contactId && (
                  <PanelLineaDeTiempo tipo="contact" registroId={contactId} conChat={false} />
                )}

                {/* Notas. Usa el panel compartido, el mismo que la ficha de
                    una empresa: hasta la migración 049 había DOS sistemas de
                    notas conviviendo y nadie sabía en cuál había escrito. */}
                {pestana === 'notes' && contactId && (
                  <PanelNotas
                    tipo="contact"
                    registroId={contactId}
                    puedeEditar={puedeEditarRegistros}
                  />
                )}

                {pestana === 'tasks' && contactId && (
                  <PanelTareasDeContacto
                    contactId={contactId}
                    puedeEditar={puedeEditarRegistros}
                  />
                )}

                {pestana === 'files' && contactId && (
                  <PanelAdjuntos
                    tipo="contact"
                    registroId={contactId}
                    puedeEditar={puedeEditarRegistros}
                  />
                )}

                {/* Próxima gestión: qué sigue con este cliente y cuándo. Lo
                    que se agenda aquí es un evento de calendario de verdad,
                    así que aparece en la agenda del equipo y no solo en esta
                    ficha. */}
                {pestana === 'next' && contactId && (
                  <PanelProximaGestion
                    contactId={contactId}
                    companyId={companyIdDelContacto}
                    puedeEditar={puedeEditarRegistros}
                    onAgendado={() => setGestionesVersion((v) => v + 1)}
                  />
                )}

                {pestana === 'deals' &&
                  (loadingDeals ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="text-primary size-5 animate-spin" />
                    </div>
                  ) : deals.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t('dealsTab.noDeals')}</p>
                  ) : (
                    <div className="space-y-2">
                      {deals.map((deal) => (
                        <div
                          key={deal.id}
                          className="border-border bg-muted/50 rounded-lg border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-foreground text-sm font-medium">{deal.title}</p>
                            {deal.stage && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${deal.stage.color}20`,
                                  color: deal.stage.color,
                                }}
                              >
                                {deal.stage.name}
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1 tabular-nums">
                              <DollarSign className="size-3" />
                              {formatCurrency(deal.value ?? 0, deal.currency || defaultCurrency)}
                            </span>
                            {deal.status && deal.status !== 'open' && (
                              <span
                                className={deal.status === 'won' ? 'text-primary' : 'text-red-400'}
                              >
                                {deal.status}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={handleSendTemplate}
      />
    </>
  );
}
