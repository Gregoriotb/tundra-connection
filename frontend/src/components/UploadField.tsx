/**
 * UploadField — campo de upload reutilizable.
 *
 * Spec:
 *   - Orquestor.md §FASE 7
 *   - R2 No `any`
 *   - R6 (server-side) ImgBB primero, fallback local — el componente solo
 *     se preocupa por el flow del cliente.
 *
 * Modos:
 *   - variant="image"    → preview circular, click reemplaza, drag-drop OK
 *   - variant="document" → ícono + nombre + tamaño tras subir
 *
 * Validación cliente:
 *   - MIME contra `accept`.
 *   - Tamaño contra `maxSizeMB`.
 *   - Backend re-valida (R9): MIME real con magic bytes.
 *
 * Props:
 *   - onUpload(file): la función que dispara el request HTTP. El
 *     componente NO conoce los endpoints; el padre los inyecta.
 *   - onComplete(): callback opcional al finalizar exitosamente.
 */

import {
  AlertCircle,
  Camera,
  Check,
  FileText,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  type DragEvent,
  type ChangeEvent,
  useCallback,
  useRef,
  useState,
} from 'react';

import { ApiError } from '../services/api';

interface UploadFieldProps {
  label: string;
  hint?: string;
  accept: string;        // ej: "image/jpeg,image/png,image/webp"
  maxSizeMB: number;
  variant: 'image' | 'document';
  previewUrl?: string | null;
  onUpload: (file: File) => Promise<unknown>;
  onComplete?: () => void;
}

type FieldState =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string; progress: number }
  | { kind: 'success'; filename: string; sizeBytes: number }
  | { kind: 'error'; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function mimeAccepted(accept: string, file: File): boolean {
  if (!accept) return true;
  const allowed = accept.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.some((a) => {
    if (a.endsWith('/*')) {
      return file.type.startsWith(a.slice(0, -1));
    }
    return file.type === a;
  });
}

// ─── Componente ───────────────────────────────────────────────────────────

export function UploadField({
  label,
  hint,
  accept,
  maxSizeMB,
  variant,
  previewUrl,
  onUpload,
  onComplete,
}: UploadFieldProps): JSX.Element {
  const [state, setState] = useState<FieldState>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const maxBytes = maxSizeMB * 1024 * 1024;

  const handleFile = useCallback(
    async (file: File) => {
      // Validación cliente (la real ocurre server-side).
      if (!mimeAccepted(accept, file)) {
        setState({
          kind: 'error',
          message: `Tipo no permitido: ${file.type || 'desconocido'}`,
        });
        return;
      }
      if (file.size > maxBytes) {
        setState({
          kind: 'error',
          message: `Demasiado grande (máx ${maxSizeMB} MB)`,
        });
        return;
      }

      setState({ kind: 'uploading', filename: file.name, progress: 0 });
      try {
        await onUpload(file);
        setState({
          kind: 'success',
          filename: file.name,
          sizeBytes: file.size,
        });
        onComplete?.();
      } catch (err) {
        const message =
          err instanceof ApiError ? err.detail : 'No se pudo subir el archivo';
        setState({ kind: 'error', message });
      }
    },
    [accept, maxBytes, maxSizeMB, onUpload, onComplete],
  );

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Permite re-subir el mismo archivo.
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const triggerPick = () => {
    if (state.kind === 'uploading') return;
    inputRef.current?.click();
  };

  // ── Render por variant ──────────────────────────────────────────────────
  if (variant === 'image') {
    return (
      <ImageVariant
        label={label}
        hint={hint}
        accept={accept}
        previewUrl={previewUrl}
        state={state}
        dragOver={dragOver}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onPick={onPick}
        onClick={triggerPick}
        onClear={() => setState({ kind: 'idle' })}
        inputRef={inputRef}
      />
    );
  }

  return (
    <DocumentVariant
      label={label}
      hint={hint}
      accept={accept}
      state={state}
      dragOver={dragOver}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPick={onPick}
      onClick={triggerPick}
      onClear={() => setState({ kind: 'idle' })}
      inputRef={inputRef}
    />
  );
}

// ─── Variants ─────────────────────────────────────────────────────────────

interface VariantProps {
  label: string;
  hint?: string;
  accept: string;
  state: FieldState;
  dragOver: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onClick: () => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

interface ImageVariantProps extends VariantProps {
  previewUrl?: string | null;
}

function ImageVariant({
  label,
  hint,
  accept,
  state,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onClick,
  onClear,
  previewUrl,
  inputRef,
}: ImageVariantProps): JSX.Element {
  const isUploading = state.kind === 'uploading';
  const showPreview = previewUrl && state.kind !== 'error';

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/50">
        {label}
      </span>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={[
          'relative cursor-pointer rounded-2xl overflow-hidden',
          'aspect-square w-full max-w-[200px]',
          'bg-tundra-surface border-2 transition-all',
          dragOver
            ? 'border-tundra-gold border-dashed'
            : 'border-white/10 hover:border-tundra-gold/40',
          isUploading && 'cursor-not-allowed opacity-70',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {showPreview ? (
          <img
            src={previewUrl}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40">
            <Camera size={28} strokeWidth={1.5} aria-hidden />
            <p className="text-[11px] uppercase tracking-wider">Subir foto</p>
          </div>
        )}

        {/* Overlay hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
          <UploadCloud size={28} className="text-tundra-gold" aria-hidden />
        </div>

        {isUploading && <UploadingOverlay filename={state.filename} />}
        {state.kind === 'success' && <SuccessChip />}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onPick}
          className="hidden"
        />
      </div>
      {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      {state.kind === 'error' && <ErrorRow message={state.message} onClear={onClear} />}
    </div>
  );
}

function DocumentVariant({
  label,
  hint,
  accept,
  state,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onClick,
  onClear,
  inputRef,
}: VariantProps): JSX.Element {
  const isUploading = state.kind === 'uploading';
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/50">
        {label}
      </span>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={[
          'relative cursor-pointer rounded-xl overflow-hidden p-4',
          'bg-tundra-surface border-2 transition-all',
          'flex items-center gap-3 min-h-[80px]',
          dragOver
            ? 'border-tundra-gold border-dashed'
            : 'border-white/10 hover:border-tundra-gold/40',
          isUploading && 'cursor-not-allowed opacity-70',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className={[
            'flex-shrink-0 inline-flex items-center justify-center h-12 w-12 rounded-lg',
            state.kind === 'success'
              ? 'bg-tundra-success/15 text-tundra-success'
              : 'bg-white/5 text-tundra-gold',
          ].join(' ')}
        >
          {state.kind === 'success' ? (
            <Check size={20} strokeWidth={3} aria-hidden />
          ) : (
            <FileText size={20} aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {state.kind === 'success' ? (
            <>
              <p className="text-sm text-white truncate">{state.filename}</p>
              <p className="text-[10px] text-white/40">
                {formatBytes(state.sizeBytes)} · subido
              </p>
            </>
          ) : state.kind === 'uploading' ? (
            <>
              <p className="text-sm text-white truncate">{state.filename}</p>
              <p className="text-[10px] text-tundra-gold">Subiendo…</p>
            </>
          ) : (
            <>
              <p className="text-sm text-white">Seleccionar archivo</p>
              <p className="text-[10px] text-white/30">
                Arrastra aquí o haz clic
              </p>
            </>
          )}
        </div>
        {isUploading && (
          <div className="absolute bottom-0 left-0 h-0.5 bg-tundra-gold animate-pulse w-full" />
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onPick}
          className="hidden"
        />
      </div>
      {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      {state.kind === 'error' && <ErrorRow message={state.message} onClear={onClear} />}
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

function UploadingOverlay({ filename }: { filename: string }): JSX.Element {
  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
      <div className="w-8 h-8 border-2 border-tundra-gold border-t-transparent rounded-full animate-spin" />
      <p className="text-[10px] text-tundra-gold uppercase tracking-wider truncate max-w-[80%]">
        {filename}
      </p>
    </div>
  );
}

function SuccessChip(): JSX.Element {
  return (
    <div className="absolute bottom-2 right-2 inline-flex items-center justify-center h-6 w-6 rounded-full bg-tundra-success text-white shadow-lg">
      <Check size={12} strokeWidth={3} aria-hidden />
    </div>
  );
}

interface ErrorRowProps {
  message: string;
  onClear: () => void;
}

function ErrorRow({ message, onClear }: ErrorRowProps): JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-tundra-danger/10 border border-tundra-danger/30 text-xs text-white/80"
    >
      <AlertCircle
        size={14}
        className="mt-0.5 text-tundra-danger flex-shrink-0"
        aria-hidden
      />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Cerrar"
        className="text-white/40 hover:text-white"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}
