'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag, ContactNote, CustomField, ContactCustomValue, Deal, MessageTemplate } from '@/types';
import {
  TemplatePicker,
  type TemplateSendValues,
} from '@/components/inbox/template-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Phone,
  PhoneCall,
  Mail,
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  DollarSign,
  LayoutTemplate,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PanelNotas } from '@/components/registros/panel-notas';
import { PanelAdjuntos } from '@/components/registros/panel-adjuntos';
import { PanelLineaDeTiempo } from '@/components/registros/panel-linea-de-tiempo';
import { PanelTareasDeContacto } from '@/components/registros/panel-tareas-de-contacto';
import { PanelProximaGestion } from '@/components/registros/panel-proxima-gestion';
import { AvisoProximaGestion } from '@/components/registros/aviso-proxima-gestion';
import { canSendMessages } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
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

/**
 * Estilo de las pestañas. La activa se distingue por color; las inactivas se
 * iluminan al pasar por encima para que se lea que son pulsables.
 */
const PESTANA =
  'text-muted-foreground transition-colors rounded-md ' +
  'hover:bg-muted/70 hover:text-foreground ' +
  'data-active:bg-muted data-active:text-primary';

interface ContactDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  onUpdated: () => void;
}

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
}: ContactDetailViewProps) {
  const t = useTranslations('Contacts.detailView');
  const supabase = createClient();
  const { accountId, defaultCurrency, accountRole } = useAuth();
  // Los paneles nuevos comparten la misma regla que el resto del CRM: de
  // 'agent' para arriba se escribe, un 'viewer' solo mira.
  const puedeEditarRegistros = accountRole ? canSendMessages(accountRole) : false;

  const [contact, setContact] = useState<Contact | null>(null);
  const [pestana, setPestana] = useState('details');
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

  // Notes tab
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

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

  const fetchNotes = useCallback(async () => {
    if (!contactId) return;
    setLoadingNotes(true);

    const { data } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (data) setNotes(data);
    setLoadingNotes(false);
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
    if (open && contactId) {
      // Se vuelve a Detalles al abrir otra ficha. Sin esto, quien mira la
      // pestaña Actividad de un contacto y abre el siguiente cae en Actividad
      // de otra persona, que es justo el sitio donde peor se nota que estás
      // viendo la ficha equivocada.
      setPestana('details');
      fetchContact();
      fetchTags();
      fetchNotes();
      fetchCustomFields();
      fetchDeals();
    }
  }, [open, contactId, fetchContact, fetchTags, fetchNotes, fetchCustomFields, fetchDeals]);

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

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    setSavingNote(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) {
      toast.error(t('toastNotAuthenticated'));
      setSavingNote(false);
      return;
    }

    const { error } = await supabase.from('contact_notes').insert({
      contact_id: contactId,
      account_id: accountId,
      user_id: user.id,
      note_text: newNote.trim(),
    });

    if (error) {
      toast.error(t('toastNoteAddFailed'));
    } else {
      setNewNote('');
      fetchNotes();
      toast.success(t('toastNoteAdded'));
    }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      toast.error(t('toastNoteDeleteFailed'));
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success(t('toastNoteDeleted'));
    }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground w-full max-w-[calc(100%-2rem)] sm:max-w-5xl h-[85vh] p-0 gap-0 overflow-hidden">
        {loading || !contact ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            {/* Franja del color de marca detrás del encabezado: separa la
                identidad del contacto del contenido sin necesidad de una
                línea más, y le da al modal un punto de anclaje visual. */}
            <DialogHeader className="shrink-0 space-y-0 border-b border-border/50 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar className="size-14 border border-primary/20 bg-muted ring-2 ring-primary/10">
                  <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                    {getInitials(contact.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-lg text-popover-foreground">
                    {contact.name || t('unnamed')}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {t('contactDetailsDesc')}
                  </DialogDescription>

                  {/* Los datos de contacto son PULSABLES: el teléfono se copia,
                      el correo abre el cliente de correo, la empresa lleva a su
                      ficha. Como texto plano obligaban a seleccionar a mano. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    {/* El teléfono LLAMA, no copia.
                        Copiar el número era un paso intermedio inútil: nadie
                        lo quiere en el portapapeles, lo quiere marcado. Un
                        clic aquí inicia la llamada en el softphone y abre la
                        burbuja sola, sin un segundo clic.
                        Quien no tiene extensión sigue viendo "copiar", que es
                        lo único que puede hacer con ese número. */}
                    {puedeLlamar ? (
                      <button
                        onClick={llamarAlContacto}
                        title={`Llamar a ${contact.phone}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary transition-all hover:border-primary/50 hover:bg-primary/20 hover:shadow-md hover:shadow-primary/10"
                      >
                        <PhoneCall className="size-3" />
                        {contact.phone}
                      </button>
                    ) : (
                      <button
                        onClick={copyPhone}
                        title="Copiar el teléfono"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-primary"
                      >
                        <Phone className="size-3" />
                        {contact.phone}
                        {copiedPhone ? (
                          <Check className="size-3 text-primary" />
                        ) : (
                          <Copy className="size-3 opacity-60" />
                        )}
                      </button>
                    )}

                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        title="Escribir un correo"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-primary"
                      >
                        <Mail className="size-3" />
                        {contact.email}
                      </a>
                    )}

                    {contact.company && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-1 text-muted-foreground">
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
                  className="shrink-0 bg-primary text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20"
                >
                  {sendingTemplate ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LayoutTemplate className="size-4" />
                  )}
                  {t('sendTemplateBtn')}
                </Button>
              </div>
            </DialogHeader>

            {/* Tabs */}
            {/* Controlada, no con `defaultValue`: el aviso de arriba de
                Detalles tiene que poder saltar a "Próxima gestión", y para eso
                hace falta poder cambiar la pestaña desde fuera. */}
            <Tabs
              value={pestana}
              onValueChange={(v) => v && setPestana(v as string)}
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="mx-5 mt-3 shrink-0 gap-0.5 overflow-x-auto bg-muted/50 border-b border-border">
                <TabsTrigger
                  value="details"
                  className={PESTANA}
                >
                  {t('tabs.details')}
                </TabsTrigger>
                {/* Segunda, pegada a Detalles. Es la acción más importante de
                    una ficha de contacto -- "qué sigue con esta persona" -- y
                    quinta entre nueve pestañas, en un panel angosto, quedaba
                    fuera de la vista y nadie la encontraba. */}
                <TabsTrigger
                  value="next"
                  className={cn(PESTANA, "whitespace-nowrap")}
                >
                  Próxima gestión
                </TabsTrigger>
                <TabsTrigger
                  value="tags"
                  className={PESTANA}
                >
                  {t('tabs.tags')}
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className={PESTANA}
                >
                  {t('tabs.notes')}
                </TabsTrigger>
                <TabsTrigger
                  value="custom"
                  className={PESTANA}
                >
                  {t('tabs.custom')}
                </TabsTrigger>
                <TabsTrigger
                  value="tasks"
                  className={PESTANA}
                >
                  Tareas
                </TabsTrigger>
                <TabsTrigger
                  value="files"
                  className={PESTANA}
                >
                  Archivos
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className={PESTANA}
                >
                  Actividad
                </TabsTrigger>
                <TabsTrigger
                  value="deals"
                  className={PESTANA}
                >
                  {t('tabs.deals')}
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {/* Lo primero que hay que saber de un contacto no es su correo
                    sino qué sigue con él. Va arriba de todo y es el único sitio
                    donde una gestión vencida se ve sin buscarla. */}
                {contactId && (
                  <AvisoProximaGestion
                    // La clave incluye la versión: cambiarla remonta el aviso y
                    // lo obliga a releer, que es más simple y más difícil de
                    // romper que pasarle un `refrescar` hacia abajo.
                    key={`${contactId}-${gestionesVersion}`}
                    contactId={contactId}
                    onIr={() => setPestana('next')}
                  />
                )}
                {/* Dos columnas desde sm. En un modal ancho, una sola columna
                    de campos deja media pantalla vacía y obliga a desplazarse
                    para algo que entra de sobra. */}
                <div className="space-y-4">
                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
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
                  </div>
                  <Button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto"
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
              </TabsContent>

              {/* Tags Tab */}
              <TabsContent value="tags" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t('tagsTab.clickTagDesc')}
                  </p>
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
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
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-border'
                                : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {selected && <Check className="size-3 mr-1" />}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Notes Tab */}
              {/* Notas. Usa el panel compartido, el mismo que la ficha de una
                  empresa: hasta la migración 049 había DOS sistemas de notas
                  conviviendo y nadie sabía en cuál había escrito. */}
              <TabsContent value="notes" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {contactId && (
                  <PanelNotas
                    tipo="contact"
                    registroId={contactId}
                    puedeEditar={puedeEditarRegistros}
                  />
                )}
              </TabsContent>

              {/* Próxima gestión: qué sigue con este cliente y cuándo. Lo que
                  se agenda aquí es un evento de calendario de verdad, así que
                  aparece en la agenda del equipo y no solo en esta ficha. */}
              <TabsContent value="next" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {contactId && (
                  <PanelProximaGestion
                    contactId={contactId}
                    companyId={companyIdDelContacto}
                    puedeEditar={puedeEditarRegistros}
                    onAgendado={() => setGestionesVersion((v) => v + 1)}
                  />
                )}
              </TabsContent>

              <TabsContent value="tasks" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {contactId && (
                  <PanelTareasDeContacto
                    contactId={contactId}
                    puedeEditar={puedeEditarRegistros}
                  />
                )}
              </TabsContent>

              <TabsContent value="files" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {contactId && (
                  <PanelAdjuntos
                    tipo="contact"
                    registroId={contactId}
                    puedeEditar={puedeEditarRegistros}
                  />
                )}
              </TabsContent>

              <TabsContent value="activity" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {contactId && <PanelLineaDeTiempo tipo="contact" registroId={contactId} />}
              </TabsContent>

              {/* Custom Fields Tab */}
              <TabsContent value="custom" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {loadingCustom ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : customFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t('noCustomFields')}
                  </p>
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
                          className="bg-muted border-border text-foreground h-8 text-sm placeholder:text-muted-foreground"
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
              </TabsContent>

              {/* Deals Tab */}
              <TabsContent value="deals" className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {loadingDeals ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : deals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('dealsTab.noDeals')}</p>
                ) : (
                  <div className="space-y-2">
                    {deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="rounded-lg border border-border bg-muted/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {deal.title}
                          </p>
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
                        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="size-3" />
                            {formatCurrency(
                              deal.value ?? 0,
                              deal.currency || defaultCurrency,
                            )}
                          </span>
                          {deal.status && deal.status !== 'open' && (
                            <span
                              className={
                                deal.status === 'won'
                                  ? 'text-primary'
                                  : 'text-red-400'
                              }
                            >
                              {deal.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
    <TemplatePicker
      open={templatePickerOpen}
      onOpenChange={setTemplatePickerOpen}
      onSelect={handleSendTemplate}
    />
    </>
  );
}
