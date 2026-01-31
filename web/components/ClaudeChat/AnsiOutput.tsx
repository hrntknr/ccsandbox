import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface AnsiOutputProps {
  content: string;
}

const COLS = 120;
const ROWS = 20;

export function AnsiOutput({ content }: AnsiOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new XTerm({
      disableStdin: true,
      convertEol: true,
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      fontSize: 12,
      fontFamily:
        '"JetBrainsMono Nerd Font", "FiraCode Nerd Font", "MesloLGS NF", "Hack Nerd Font", Menlo, Monaco, "Courier New", monospace',
      cols: COLS,
      rows: ROWS,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#1e1e1e',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
    });

    terminal.open(containerRef.current);
    terminal.write(content);

    terminalRef.current = terminal;

    return () => {
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [content]);

  return <div ref={containerRef} className="ansi-output p-3 rounded-b-md overflow-hidden" />;
}
