interface ResizeHandleProps {
  onResize: (deltaY: number) => void;
  minHeight?: number;
  maxHeight?: number;
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;

    const handleMove = (moveEvent: MouseEvent) => {
      onResize(moveEvent.clientY - startY);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onMouseDown={startResize}
      className="h-2 cursor-row-resize bg-transparent hover:bg-blue-500/20 transition-colors"
    />
  );
}
