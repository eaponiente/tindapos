import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

export function UIProvider({ children }) {
  const [toastMsg, setToastMsg] = useState(null);
  const [modal, setModal] = useState(null); // { content }
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);

  const openModal = useCallback((content) => setModal({ content }), []);
  const closeModal = useCallback(() => setModal(null), []);

  return (
    <UICtx.Provider value={{ toast, openModal, closeModal }}>
      {children}
      {modal && (
        <div id="overlay" onClick={(e) => e.target.id === 'overlay' && closeModal()}>
          <div className="modal">{modal.content}</div>
        </div>
      )}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </UICtx.Provider>
  );
}
