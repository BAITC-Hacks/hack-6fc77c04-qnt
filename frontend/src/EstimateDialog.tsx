import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import './estimate.css';

type Props = { open: boolean; onClose: () => void; children: ReactNode };

export function EstimateDialog({ open, onClose, children }: Props) {
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const element = dialog.current;
  if (!element || !open) return;
  const previousOverflow = document.body.style.overflow;
  element.showModal();
  document.body.style.overflow = 'hidden';
  return () => {
   element.close();
   document.body.style.overflow = previousOverflow;
  };
 }, [open]);
 return <dialog ref={dialog} className="estimate-dialog" aria-labelledby="estimate-title"
  onCancel={event => { event.preventDefault(); onClose(); }}
  onKeyDown={event => {
   if (event.key !== 'Tab') return;
   const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
   const first = controls[0], last = controls[controls.length - 1];
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}
  onClick={event => {
   if (event.target !== event.currentTarget) return;
   const bounds = event.currentTarget.getBoundingClientRect();
   if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
  <div className="estimate-dialog-bar"><span>QNT / FIREBIRD</span><button type="button" className="estimate-close" onClick={onClose} autoFocus aria-label="Закрыть смету">Закрыть <span aria-hidden="true">×</span></button></div>
  {children}
 </dialog>;
}
