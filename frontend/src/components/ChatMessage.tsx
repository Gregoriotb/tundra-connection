/**
 * ChatMessage — burbuja de mensaje individual.
 *
 * Spec:
 *   - Orquestor.md §FASE 4 + §Sistema de Diseño
 *   - R2 No `any`
 *
 * 3 estilos visuales según message_type / autor:
 *   - 'system'                          → línea centrada con borde discreto
 *   - 'text' del current_user           → burbuja dorada a la derecha
 *   - 'text' de otro (admin o cliente)  → burbuja gris a la izquierda
 *   - 'attachment'                      → burbuja con lista de archivos
 */

import {
  Bot,
  Check,
  CheckCheck,
  Download,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
} from 'lucide-react';

import type { UUID } from '../types';

// ─── Tipos espejo del backend ─────────────────────────────────────────────

export interface ChatAuthor {
  id: UUID;
  first_name: string | null;
  last_name: string | null;
  profile_photo_url: string | null;
  is_admin: boolean;
}

export interface ChatAttachment {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface ChatMessageData {
  id: UUID;
  thread_id: UUID;
  user_id: UUID;
  content: string;
  message_type: 'text' | 'system' | 'attachment';
  attachments: ChatAttachment[];
  created_at: string;
  user: ChatAuthor;
}

interface ChatMessageProps {
  message: ChatMessageData;
  currentUserId: UUID;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function authorInitials(author: ChatAuthor): string {
  const first = author.first_name?.[0] ?? '';
  const last = author.last_name?.[0] ?? '';
  const initials = (first + last).toUpperCase();
  return initials || (author.is_admin ? 'AD' : 'CL');
}

function authorName(author: ChatAuthor): string {
  const parts = [author.first_name, author.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return author.is_admin ? 'Soporte Tundra' : 'Cliente';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function pickAttachmentIcon(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime === 'application/pdf' || mime.startsWith('text/')) return FileText;
  return FileIcon;
}

// ─── Subcomponente: Avatar ────────────────────────────────────────────────

interface AvatarProps {
  author: ChatAuthor;
}

function Avatar({ author }: AvatarProps): JSX.Element {
  if (author.profile_photo_url) {
    return (
      <img
        src={author.profile_photo_url}
        alt={authorName(author)}
        className={[
          'h-9 w-9 rounded-full object-cover flex-shrink-0',
          author.is_admin
            ? 'border-2 border-tundra-gold'
            : 'border border-white/10',
        ].join(' ')}
      />
    );
  }
  return (
    <div
      className={[
        'h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0',
        'text-[10px] font-semibold uppercase tracking-wider',
        author.is_admin
          ? 'bg-tundra-gold text-black border-2 border-tundra-goldBright'
          : 'bg-white/5 text-white/60 border border-white/10',
      ].join(' ')}
      aria-hidden
    >
      {authorInitials(author)}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export function ChatMessage({
  message,
  currentUserId,
}: ChatMessageProps): JSX.Element {
  // Mensaje del sistema → línea centrada.
  if (message.message_type === 'system') {
    return (
      <div className="flex items-center justify-center my-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/50 italic">
          <Bot size={12} className="text-tundra-gold" aria-hidden />
          {message.content}
        </div>
      </div>
    );
  }

  const isMine = message.user_id === currentUserId;
  const author = message.user;
  const time = formatTime(message.created_at);

  return (
    <div
      className={[
        'flex gap-3 max-w-full',
        isMine ? 'flex-row-reverse' : 'flex-row',
      ].join(' ')}
    >
      <Avatar author={author} />

      <div
        className={[
          'flex flex-col gap-1 max-w-[75%]',
          isMine ? 'items-end' : 'items-start',
        ].join(' ')}
      >
        {/* Nombre + badge admin */}
        <div
          className={[
            'flex items-center gap-2 text-xs',
            isMine ? 'flex-row-reverse' : 'flex-row',
          ].join(' ')}
        >
          <span className="text-white/60 font-medium">{authorName(author)}</span>
          {author.is_admin && !isMine && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-tundra-gold/15 text-tundra-gold text-[9px] uppercase tracking-wider font-semibold">
              <ShieldCheck size={10} strokeWidth={2.5} aria-hidden />
              Soporte
            </span>
          )}
        </div>

        {/* Burbuja */}
        <div
          className={[
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words',
            isMine
              ? 'bg-tundra-gold text-black rounded-tr-sm'
              : 'bg-white/5 text-white border border-white/10 rounded-tl-sm',
          ].join(' ')}
        >
          {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}

          {message.message_type === 'attachment' && message.attachments.length > 0 && (
            <ul
              className={[
                'mt-2 space-y-1.5',
                message.content ? 'pt-2 border-t border-black/10' : '',
              ].join(' ')}
            >
              {message.attachments.map((att, i) => {
                const Icon = pickAttachmentIcon(att.mime_type);
                return (
                  <li key={`${att.url}-${i}`}>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={[
                        'inline-flex items-center gap-2 max-w-full',
                        'text-xs underline-offset-2 hover:underline',
                        isMine ? 'text-black/80' : 'text-tundra-gold',
                      ].join(' ')}
                    >
                      <Icon size={14} className="flex-shrink-0" aria-hidden />
                      <span className="truncate">{att.filename}</span>
                      <span
                        className={[
                          'text-[10px] flex-shrink-0',
                          isMine ? 'text-black/50' : 'text-white/40',
                        ].join(' ')}
                      >
                        {formatBytes(att.size_bytes)}
                      </span>
                      <Download size={12} className="flex-shrink-0" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Timestamp + read state (placeholder) */}
        <div
          className={[
            'flex items-center gap-1 text-[10px] text-white/30',
            isMine ? 'flex-row-reverse' : 'flex-row',
          ].join(' ')}
        >
          <span>{time}</span>
          {isMine && <CheckCheck size={11} aria-hidden className="text-white/30" />}
          {!isMine && <Check size={11} aria-hidden className="text-white/20" />}
        </div>
      </div>
    </div>
  );
}
