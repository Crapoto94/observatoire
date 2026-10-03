import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';

// Modales applicatives : confirmations, saisie et informations, en remplacement des boîtes natives
// du navigateur (window.confirm / window.prompt / window.alert). Une seule modale à la fois, rendue
// dans le contexte React : `confirm()`, `prompt()` et `alert()` renvoient des promesses.
export interface ConfirmOptions { title?: string; message?: ReactNode; okLabel?: string; cancelLabel?: string; danger?: boolean }
export interface PromptOptions extends ConfirmOptions { placeholder?: string; defaultValue?: string }
export interface AlertOptions { title?: string; message?: ReactNode; okLabel?: string }

interface ModalApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  alert: (opts: AlertOptions) => Promise<void>;
}

const Ctx = createContext<ModalApi>(null as unknown as ModalApi);
export const useModal = () => useContext(Ctx);

type State =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void };

export function ModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ kind: 'confirm', opts, resolve })), []);
  const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>((resolve) => { setDraft(opts.defaultValue ?? ''); setState({ kind: 'prompt', opts, resolve }); }), []);
  const alert = useCallback((opts: AlertOptions) => new Promise<void>((resolve) => setState({ kind: 'alert', opts, resolve })), []);

  const close = () => setState(null);
  const ok = () => {
    if (!state) return;
    if (state.kind === 'confirm') state.resolve(true);
    else if (state.kind === 'prompt') state.resolve(draft);
    else state.resolve();
    close();
  };
  const cancel = () => {
    if (!state) return;
    if (state.kind === 'confirm') state.resolve(false);
    else if (state.kind === 'prompt') state.resolve(null);
    else state.resolve();
    close();
  };

  const title = state?.opts?.title ?? (state?.kind === 'prompt' ? 'Saisie' : state?.kind === 'alert' ? 'Information' : 'Confirmation');

  return (
    <Ctx.Provider value={{ confirm, prompt, alert }}>
      {children}
      {state && (
        <div className="modal-back" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
          <div className="modal confirm-modal">
            <h2 className={`modal-title${state.kind === 'confirm' && state.opts.danger ? ' danger' : ''}`}>{title}</h2>
            {state.opts.message && <div className="modal-message">{state.opts.message}</div>}
            {state.kind === 'prompt' && (
              <input ref={inputRef} autoFocus className="modal-input" value={draft} placeholder={state.opts.placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); }} />
            )}
            <div className="modal-actions">
              {state.kind !== 'alert' && (
                <button className="secondary" onClick={cancel}>{state.opts.cancelLabel ?? 'Annuler'}</button>
              )}
              <button className={state.kind === 'confirm' && state.opts.danger ? 'danger' : ''} autoFocus={state.kind !== 'prompt'} onClick={ok}>
                {state.opts.okLabel ?? (state.kind === 'alert' ? 'Fermer' : 'Confirmer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
