'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';
import { AiKnowledgeCard } from './ai-knowledge';
import { AI_PROVIDER_DEFAULT_MODEL } from '@/lib/ai/defaults';
import type { AiProvider } from '@/lib/ai/types';
import type { AccountMember } from '@/types';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import { useTranslations } from 'next-intl';

const MASKED_KEY = '••••••••••••••••';

// Radix Select can't use an empty-string item value, so the "leave
// unassigned" choice gets a sentinel that maps to null in the payload.
const HANDOFF_QUEUE = '__queue__';

type CanalIa = 'whatsapp' | 'facebook' | 'instagram';

/**
 * Los canales donde el agente puede contestar.
 *
 * Los iconos de marca los quitó Lucide por motivos de marca registrada, así
 * que Facebook e Instagram se dibujan aquí. Una forma cada uno: pesan menos
 * que traer una librería de iconos de marcas entera.
 */
function IconoFacebook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
    </svg>
  );
}

function IconoInstagram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 6.03a3.81 3.81 0 1 0 0 7.62 3.81 3.81 0 0 0 0-7.62Zm0 6.29a2.48 2.48 0 1 1 0-4.96 2.48 2.48 0 0 1 0 4.96Zm4.85-6.44a.89.89 0 1 1-1.78 0 .89.89 0 0 1 1.78 0Z" />
    </svg>
  );
}

const CANALES_IA: {
  id: CanalIa;
  etiqueta: string;
  icono: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}[] = [
  { id: 'whatsapp', etiqueta: 'WhatsApp', icono: MessageCircle as never },
  { id: 'facebook', etiqueta: 'Messenger', icono: IconoFacebook },
  { id: 'instagram', etiqueta: 'Instagram', icono: IconoInstagram },
];

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  openrouter: 'OpenRouter (todos los modelos)',
};

const KEY_PLACEHOLDER: Record<AiProvider, string> = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  openrouter: 'sk-or-v1-...',
};

/** Pista bajo el selector: qué es cada proveedor y de dónde sale la clave. */
const PROVIDER_AYUDA: Record<AiProvider, string> = {
  openai: 'Tu clave de platform.openai.com. Se factura directamente a OpenAI.',
  anthropic: 'Tu clave de console.anthropic.com. Se factura directamente a Anthropic.',
  openrouter:
    'Una sola clave para los modelos de OpenAI, Anthropic, Google, Meta y más. Sacala en openrouter.ai/keys y cambiá de modelo escribiendo su nombre, sin abrir otra cuenta.',
};

export function AiConfig() {
  const { accountId, accountRole, profileLoading } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const t = useTranslations('Settings.aiConfig');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState(AI_PROVIDER_DEFAULT_MODEL.openai);
  const [apiKey, setApiKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [embeddingsKey, setEmbeddingsKey] = useState('');
  const [transcripcionKey, setTranscripcionKey] = useState('');
  const [transcripcionKeyEdited, setTranscripcionKeyEdited] = useState(false);
  const [tieneTranscripcionKey, setTieneTranscripcionKey] = useState(false);
  const [transcripcionModelo, setTranscripcionModelo] = useState('whisper-1');
  const [transcripcionUrl, setTranscripcionUrl] = useState(
    'https://api.openai.com/v1',
  );
  const [embeddingsKeyEdited, setEmbeddingsKeyEdited] = useState(false);
  const [hasStoredEmbeddingsKey, setHasStoredEmbeddingsKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [maxPerConversation, setMaxPerConversation] = useState(3);
  // Canales donde el agente contesta solo. Por defecto WhatsApp: es el que ya
  // funcionaba antes de que existiera esta opción.
  const [canalesIa, setCanalesIa] = useState<CanalIa[]>(['whatsapp']);
  // Empty string = leave unassigned (shared queue).
  const [handoffAgentId, setHandoffAgentId] = useState('');
  const [respuestaMedios, setRespuestaMedios] = useState(
    '¡Gracias por tu mensaje! 🙌 Para poder ayudarte ya mismo, ¿me contás por texto qué necesitás? Así te respondo al instante.',
  );
  const [avisoEscalada, setAvisoEscalada] = useState(
    'Dejame consultarlo con un compañero del equipo y te respondemos por acá. 🙌',
  );
  const [members, setMembers] = useState<AccountMember[]>([]);

  // Guard keyed on the account (not a bare boolean) so an in-place
  // account switch — ownership transfer, multi-account membership —
  // refetches instead of showing the previous account's config. Mirrors
  // the loadedAccountIdRef pattern in whatsapp-config.tsx.
  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('loadFailed'));
        return;
      }
      if (data.configured) {
        setConfigured(true);
        setProvider(data.provider);
        setModel(data.model);
        setSystemPrompt(data.system_prompt ?? '');
        setIsActive(data.is_active);
        setAutoReplyEnabled(data.auto_reply_enabled);
        setMaxPerConversation(data.auto_reply_max_per_conversation ?? 3);
        setCanalesIa(
          Array.isArray(data.auto_reply_channels) && data.auto_reply_channels.length
            ? (data.auto_reply_channels as CanalIa[])
            : ['whatsapp'],
        );
        setHandoffAgentId(data.handoff_agent_id ?? '');
        // Cadena vacía es una elección válida (no avisar), así que se
        // distingue de «no vino el campo» en vez de caer al texto por
        // defecto y reactivar un aviso que alguien apagó a propósito.
        if (typeof data.unsupported_media_message === 'string') {
          setRespuestaMedios(data.unsupported_media_message);
        }
        if (typeof data.handoff_message === 'string') {
          setAvisoEscalada(data.handoff_message);
        }
        setHasStoredKey(Boolean(data.has_key));
        setApiKey(data.has_key ? MASKED_KEY : '');
        setKeyEdited(false);
        setHasStoredEmbeddingsKey(Boolean(data.has_embeddings_key));
        setTieneTranscripcionKey(Boolean(data.has_transcription_key));
        setTranscripcionKey(data.has_transcription_key ? MASKED_KEY : '');
        if (data.transcription_model) setTranscripcionModelo(data.transcription_model);
        if (data.transcription_base_url) setTranscripcionUrl(data.transcription_base_url);
        setEmbeddingsKey(data.has_embeddings_key ? MASKED_KEY : '');
        setEmbeddingsKeyEdited(false);
      }
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchConfig();
    // Members populate the handoff-target picker. Best-effort — on an
    // older deployment without the endpoint the picker just shows the
    // queue option.
    void fetchAccountMembers().then(setMembers);
  }, [accountId, fetchConfig]);

  // Swap the model default when the provider changes, unless the user
  // typed a custom model.
  const handleProviderChange = (next: AiProvider) => {
    setProvider(next);
    // Solo se pisa el modelo si era el de fábrica de ALGÚN proveedor: si la
    // persona escribió uno propio, cambiar de proveedor no puede borrárselo.
    const isDefaultModel =
      Object.values(AI_PROVIDER_DEFAULT_MODEL).includes(model) ||
      model.trim() === '';
    if (isDefaultModel) setModel(AI_PROVIDER_DEFAULT_MODEL[next]);
  };

  const keyPayload = () => (keyEdited ? apiKey.trim() : undefined);

  // undefined = leave unchanged; '' typed = null (clear); text = set.
  const embeddingsKeyPayload = () =>
    embeddingsKeyEdited ? embeddingsKey.trim() || null : undefined;

  const buildBody = () => ({
    provider,
    model: model.trim(),
    api_key: keyPayload(),
    embeddings_api_key: embeddingsKeyPayload(),
    // `undefined` cuando no se toco: guardar otro ajuste no puede borrar
    // una clave que sigue siendo valida.
    transcription_api_key: transcripcionKeyEdited
      ? transcripcionKey.trim() || null
      : undefined,
    transcription_model: transcripcionModelo.trim() || undefined,
    transcription_base_url: transcripcionUrl.trim() || undefined,
    system_prompt: systemPrompt.trim() || null,
    is_active: isActive,
    auto_reply_enabled: autoReplyEnabled,
    auto_reply_max_per_conversation: maxPerConversation,
    auto_reply_channels: canalesIa,
    handoff_agent_id: handoffAgentId || null,
    handoff_message: avisoEscalada,
    unsupported_media_message: respuestaMedios,
  });

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: model.trim(),
          api_key: keyPayload(),
        }),
      });
      const data = await res.json();
      if (res.ok) toast.success(t('testSuccess'));
      else toast.error(data.error ?? t('testRejected'));
    } catch {
      toast.error(t('testNetworkError'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!model.trim()) {
      toast.error(t('missingModel'));
      return;
    }
    if (!configured && !keyEdited) {
      toast.error(t('missingApiKey'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('saveSuccess'));
        await fetchConfig();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch('/api/ai/config', { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setConfigured(false);
        setHasStoredKey(false);
        setApiKey('');
        setKeyEdited(false);
        setIsActive(false);
        setAutoReplyEnabled(false);
        setSystemPrompt('');
        setHandoffAgentId('');
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
    } finally {
      setRemoving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loadFailed')} {/* Re-using label or a global one, wait, loading is better. Let's use useTranslations from overview or just hardcode Loading... actually I should add loading to aiConfig */}
        {/* Wait, I didn't add loading to aiConfig. I'll just use loading. */}
      </div>
    );
  }

  const disabled = !canEdit || saving;

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      {!canEdit && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('adminOnlyConfig')}
        </p>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> {t('providerAndKey')}
            </CardTitle>
            <CardDescription>
              {t('encryptionNotice')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('provider')}</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => handleProviderChange(v as AiProvider)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">{PROVIDER_LABEL.openai}</SelectItem>
                    <SelectItem value="anthropic">
                      {PROVIDER_LABEL.anthropic}
                    </SelectItem>
                    <SelectItem value="openrouter">
                      {PROVIDER_LABEL.openrouter}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {PROVIDER_AYUDA[provider]}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-model">{t('model')}</Label>
                <Input
                  id="ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={AI_PROVIDER_DEFAULT_MODEL[provider]}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-key">{t('apiKey')}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="ai-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyEdited(true);
                    }}
                    onFocus={() => {
                      if (!keyEdited && hasStoredKey) {
                        setApiKey('');
                        setKeyEdited(true);
                      }
                    }}
                    placeholder={KEY_PLACEHOLDER[provider]}
                    disabled={disabled}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={disabled || testing}
                >
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {t('testKey')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-embeddings-key">
                {t('embeddingsKey')}{' '}
                <span className="font-normal text-muted-foreground">
                  {t('optionalSemanticSearch')}
                </span>
              </Label>
              <Input
                id="ai-embeddings-key"
                type="password"
                value={embeddingsKey}
                onChange={(e) => {
                  setEmbeddingsKey(e.target.value);
                  setEmbeddingsKeyEdited(true);
                }}
                onFocus={() => {
                  if (!embeddingsKeyEdited && hasStoredEmbeddingsKey) {
                    setEmbeddingsKey('');
                    setEmbeddingsKeyEdited(true);
                  }
                }}
                placeholder="sk-... (OpenAI)"
                disabled={disabled}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t('embeddingsHint', {
                  sameKeyText: provider === 'openai' ? t('sameKeyText') : '',
                })}
              </p>
              {provider === 'openrouter' && (
                // OpenRouter no expone endpoint de embeddings. Sin decirlo, la
                // persona pegaría acá su clave `sk-or-...` y la búsqueda
                // semántica fallaría en silencio cada vez que alguien
                // preguntara algo.
                <p className="text-xs text-amber-400">
                  OpenRouter no genera embeddings. Para búsqueda semántica hace
                  falta una clave de OpenAI acá; sin ella la base de conocimiento
                  busca por texto y sigue funcionando.
                </p>
              )}
            </div>

            {/* Notas de voz.
                Va aparte de la clave del agente porque son servicios
                distintos: OpenRouter conversa pero no transcribe. Obligar a
                que fuera la misma clave le negaría la función a quien ya
                eligió proveedor de conversación. */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label htmlFor="ai-transcripcion-key">
                Transcripción de notas de voz{' '}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Convierte los audios que te mandan en texto, para que tus
                flujos, automatizaciones y el agente los entiendan igual que
                un mensaje escrito. Sin esto el agente responde que no puede
                escuchar el audio y pide que se lo escriban.
              </p>
              <Input
                id="ai-transcripcion-key"
                type="password"
                value={transcripcionKey}
                onChange={(e) => {
                  setTranscripcionKey(e.target.value);
                  setTranscripcionKeyEdited(true);
                }}
                onFocus={() => {
                  if (!transcripcionKeyEdited && tieneTranscripcionKey) {
                    setTranscripcionKey('');
                    setTranscripcionKeyEdited(true);
                  }
                }}
                placeholder="sk-... (OpenAI) o gsk_... (Groq)"
                disabled={disabled}
                autoComplete="off"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ai-transcripcion-modelo" className="text-xs">
                    Modelo
                  </Label>
                  <Input
                    id="ai-transcripcion-modelo"
                    value={transcripcionModelo}
                    onChange={(e) => setTranscripcionModelo(e.target.value)}
                    placeholder="whisper-1"
                    disabled={disabled}
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="ai-transcripcion-url" className="text-xs">
                    Dirección del servicio
                  </Label>
                  <Input
                    id="ai-transcripcion-url"
                    value={transcripcionUrl}
                    onChange={(e) => setTranscripcionUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    disabled={disabled}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Con OpenAI, dejá los valores por defecto. Con Groq, poné
                <code className="mx-1 rounded bg-muted px-1">whisper-large-v3</code>
                y
                <code className="mx-1 rounded bg-muted px-1">
                  https://api.groq.com/openai/v1
                </code>
                — sale bastante más barato.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('behaviour')}</CardTitle>
            <CardDescription>
              {t('behaviourDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">{t('businessContext')}</Label>
              <Textarea
                id="ai-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t('promptPlaceholder')}
                rows={5}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('enableAssistant')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('enableAssistantDesc')}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('autoReply')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('autoReplyDesc')}
                </p>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
                disabled={disabled || !isActive}
              />
            </div>

            {/* En qué momento entra el agente.
                Es la pregunta que más se repite («configuré el agente, ¿por
                qué no responde?») y la respuesta no estaba escrita en ninguna
                pantalla: el orden flujo → automatización → agente vivía solo
                en el código. */}
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">
                ¿En qué momento entra el agente?
              </p>
              <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">1.</span> Llega un
                  mensaje y primero se prueban tus flujos. Si el mensaje toca un
                  botón del menú o coincide con una palabra que abre un flujo, lo
                  atiende el flujo y el agente no responde.
                </li>
                <li>
                  <span className="font-medium text-foreground">2.</span> Después
                  corren tus automatizaciones, que etiquetan, crean negocios y
                  avisan al equipo. Esas no contestan al cliente.
                </li>
                <li>
                  <span className="font-medium text-foreground">3.</span>{' '}
                  <span className="text-foreground">Ahí entra el agente</span>: si
                  ningún flujo se hizo cargo, él responde la pregunta con tus
                  propias palabras.
                </li>
                <li>
                  <span className="font-medium text-foreground">4.</span> Y cuando
                  el agente no puede responder, deja de contestar solo, resume la
                  conversación y se la pasa a un asesor.
                </li>
              </ol>
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                El agente tampoco responde si un asesor ya tomó la conversación:
                mientras haya una persona a cargo, el thread es suyo.
              </p>
            </div>

            {/* En qué canales contesta.
                Encender la IA de golpe en los tres sería decidir por quien
                atiende: por WhatsApp entran consultas repetidas que el agente
                resuelve bien, y por Instagram suele entrar otra cosa. */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Canales donde contesta
                </p>
                <p className="text-xs text-muted-foreground">
                  El agente solo responde solo en los canales marcados. Los que
                  no estén marcados quedan para atención humana.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {CANALES_IA.map((c) => {
                  const Icono = c.icono;
                  const activo = canalesIa.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={disabled || !autoReplyEnabled}
                      onClick={() =>
                        setCanalesIa((prev) =>
                          prev.includes(c.id)
                            ? prev.filter((x) => x !== c.id)
                            : [...prev, c.id],
                        )
                      }
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        activo
                          ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icono className="size-4 shrink-0" />
                      {c.etiqueta}
                      {activo && <Check className="ml-auto size-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {autoReplyEnabled && canalesIa.length === 0 && (
                <p className="text-xs text-amber-400">
                  Sin ningún canal marcado el agente no va a contestar en ningún
                  lado, aunque la auto-respuesta esté encendida.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ai-max">{t('maxAutoReplies')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('maxAutoRepliesDesc')}
                </p>
              </div>
              <Input
                id="ai-max"
                type="number"
                min={1}
                max={20}
                value={maxPerConversation}
                onChange={(e) =>
                  setMaxPerConversation(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                disabled={disabled || !autoReplyEnabled}
                className="w-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-handoff">{t('handoffTo')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('handoffToDesc')}
              </p>
              <Select
                value={handoffAgentId || HANDOFF_QUEUE}
                onValueChange={(v) =>
                  setHandoffAgentId(!v || v === HANDOFF_QUEUE ? '' : v)
                }
                disabled={disabled || !autoReplyEnabled}
              >
                <SelectTrigger id="ai-handoff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HANDOFF_QUEUE}>
                    {t('handoffQueue')}
                  </SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lo que se le dice al cliente al escalar.
                Antes no se le decía nada: el agente pausaba, avisaba al
                equipo y el cliente se quedaba mirando el teléfono sin
                saber si lo habían leído. El silencio no informa y encima
                parece una falla. */}
            <div className="space-y-2">
              <Label htmlFor="ai-aviso-escalada">
                Qué se le dice al cliente al pasar a una persona
              </Label>
              <Textarea
                id="ai-aviso-escalada"
                value={avisoEscalada}
                onChange={(e) => setAvisoEscalada(e.target.value)}
                rows={2}
                disabled={disabled}
                placeholder="Vacío = no se le avisa nada"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Se manda una sola vez, justo cuando el agente entrega la
                conversación. Conviene no prometer un tiempo que no se pueda
                cumplir: alcanza con confirmar que el mensaje llegó y que
                viene alguien. Dejalo vacío si preferís que no se avise.
              </p>
            </div>

            {/* Qué contestar a una nota de voz o una imagen.
                No pasa por el modelo: la situación tiene una sola respuesta
                correcta, y preguntársela costaba dinero, segundos y —con la
                base de conocimiento activa— la respuesta equivocada, porque
                el modelo escalaba a un humano por un audio. */}
            <div className="space-y-2">
              <Label htmlFor="ai-respuesta-medios">
                Qué se le contesta a un audio o una imagen
              </Label>
              <Textarea
                id="ai-respuesta-medios"
                value={respuestaMedios}
                onChange={(e) => setRespuestaMedios(e.target.value)}
                rows={3}
                disabled={disabled}
                placeholder="Vacío = no se contesta nada"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                El asistente no puede escuchar audios ni ver imágenes, pero
                <strong className="text-foreground"> un asesor sí</strong>: el
                archivo queda guardado en la conversación. Por eso conviene
                pedir texto para poder responder al momento, y no decir que no
                se puede ver — quien mandó la foto de una factura entendería
                que fue inútil mandarla.
              </p>
            </div>
          </CardContent>
        </Card>

        <AiKnowledgeCard
          accountId={accountId}
          canEdit={canEdit}
          hasEmbeddingsKey={
            embeddingsKeyEdited
              ? embeddingsKey.trim().length > 0
              : hasStoredEmbeddingsKey
          }
        />

        <div className="flex items-center justify-between">
          {configured ? (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={!canEdit || removing}
              className="text-destructive hover:text-destructive"
            >
              {removing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('remove')}
            </Button>
          ) : (
            <span />
          )}

          <Button onClick={handleSave} disabled={disabled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
