'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface UIContext {
  toast: (msg: string) => void;
  openModal: (content: ReactNode) => void;
  closeModal: () => void;
}

const UICtx = createContext<UIContext | null>(null);

export function useUI(): UIContext {
  const ctx = useContext(UICtx);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<{ content: ReactNode } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);

  const openModal = useCallback((content: ReactNode) => setModal({ content }), []);
  const closeModal = useCallback(() => setModal(null), []);

  return (
    <UICtx.Provider value={{ toast, openModal, closeModal }}>
      {children}
      {modal && (
        <div
          id="overlay"
          onClick={(e) => (e.target as HTMLElement).id === 'overlay' && closeModal()}
        >
          <div className="modal" role="dialog" aria-modal>
            {modal.content}
          </div>
        </div>
      )}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </UICtx.Provider>
  );
}
