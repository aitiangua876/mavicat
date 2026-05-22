import React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface AccordionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const Accordion = ({
  title,
  isOpen,
  onToggle,
  children,
  actions,
}: AccordionProps) => (
  <div className="flex flex-col mb-2">
    <div className="flex items-center justify-between px-2 py-1 group/acc">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-[13px] font-semibold text-muted uppercase tracking-wider hover:text-secondary transition-colors select-none flex-1"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>{title}</span>
      </button>
      {actions}
    </div>
    {isOpen && <div>{children}</div>}
  </div>
);
