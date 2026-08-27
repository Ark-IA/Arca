import {
  Bot,
  Camera,
  Coins,
  FileText,
  Inbox,
  KeyRound,
  LayoutGrid,
  MessagesSquare,
  Palette,
  PlugZap,
  Shield,
  ShieldBan,
  Tags,
  User,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'whatsapp',
  'facebook',
  'instagram',
  'templates',
  'quick-replies',
  'fields',
  'deals',
  'members',
  'colas',
  'agente-ia',
  'blocklist',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  // Canales separados y no una sola pantalla de 'Canales': cada uno se
  // conecta distinto y con credenciales propias, y meterlos juntos
  // obligaria a elegir el canal antes de ver que pide cada uno.
  facebook: { id: 'facebook', label: 'Facebook', icon: MessagesSquare, group: 'workspace' },
  instagram: { id: 'instagram', label: 'Instagram', icon: Camera, group: 'workspace' },
  templates: { id: 'templates', label: 'Templates', icon: FileText, group: 'workspace' },
  'quick-replies': { id: 'quick-replies', label: 'Quick replies', icon: Zap, group: 'workspace' },
  fields: { id: 'fields', label: 'Fields & tags', icon: Tags, group: 'workspace' },
  deals: { id: 'deals', label: 'Deals & currency', icon: Coins, group: 'workspace' },
  members: { id: 'members', label: 'Team members', icon: UsersRound, group: 'workspace' },
  // Va pegada a Team members porque es la misma decision vista de otro
  // lado: quien esta en el equipo, y que atiende cada uno.
  colas: { id: 'colas', label: 'Colas de asesores', icon: Inbox, group: 'workspace' },
  // Asignar el agente a cada bandeja. Va en Configuracion, junto a los
  // canales, porque es una decision sobre COMO se atiende cada bandeja; el
  // ajuste del modelo y la clave sigue viviendo en Agentes IA.
  'agente-ia': { id: 'agente-ia', label: 'Agente de IA', icon: Bot, group: 'workspace' },
  blocklist: { id: 'blocklist', label: 'Lista de bloqueo', icon: ShieldBan, group: 'workspace' },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
  { label: 'Workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
