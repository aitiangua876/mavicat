import { createPortal } from "react-dom";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  overlayClassName?: string;
}

export const Modal = ({
  isOpen,
  onClose,
  children,
  overlayClassName = "",
}: ModalProps) => {
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return createPortal(
    <div className={`mavicat-modal-overlay ${overlayClassName}`.trim()}>{children}</div>,
    document.body,
  );
};
