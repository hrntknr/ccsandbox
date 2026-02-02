import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  tabId: string;
  isActive: boolean;
  initialExited?: boolean;
  sendInput: (tabId: string, data: string) => void;
  resizeTerminal: (cols: number, rows: number) => void;
  onOutput: (tabId: string, callback: (data: string) => void) => () => void;
  onHistory: (tabId: string, callback: (data: string) => void) => () => void;
  onExit: (tabId: string, callback: (code: number) => void) => () => void;
  onResizeSync: (tabId: string, callback: (cols: number, rows: number) => void) => () => void;
  closeTab: (tabId: string) => void;
}

export function Terminal({
  tabId,
  isActive,
  initialExited,
  sendInput,
  resizeTerminal,
  onOutput,
  onHistory,
  onExit,
  onResizeSync,
  closeTab,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const historyReceivedRef = useRef(false);
  const exitedRef = useRef(initialExited ?? false);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new XTerm({
      allowProposedApi: true,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrainsMono NF", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "MesloLGS NF", "Hack Nerd Font", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
    });

    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Handle input
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const dataHandler = terminal.onData((data) => {
      if (exitedRef.current) {
        closeTab(tabId);
      } else {
        sendInput(tabId, data);
      }
    });

    return () => {
      dataHandler.dispose();
    };
  }, [tabId, sendInput, closeTab]);

  // Handle output
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const unsubscribe = onOutput(tabId, (data) => {
      terminal.write(data);
    });

    return unsubscribe;
  }, [tabId, onOutput]);

  // Handle history (only apply once to prevent duplication on tab switch)
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const unsubscribe = onHistory(tabId, (data) => {
      if (!historyReceivedRef.current) {
        historyReceivedRef.current = true;
        terminal.write(data);
        // Show exit message if the tab was already exited when we reconnected
        if (initialExited) {
          terminal.write(`\r\n\x1b[33mProcess exited. Press any key to close this tab.\x1b[0m`);
        }
      }
    });

    return unsubscribe;
  }, [tabId, onHistory, initialExited]);

  // Handle process exit
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const unsubscribe = onExit(tabId, (code) => {
      exitedRef.current = true;
      terminal.write(`\r\n\x1b[33mProcess exited with code ${code}. Press any key to close this tab.\x1b[0m`);
    });

    return unsubscribe;
  }, [tabId, onExit]);

  // Handle server-initiated resize sync (when another client has smaller terminal)
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const unsubscribe = onResizeSync(tabId, (cols, rows) => {
      terminal.resize(cols, rows);
    });

    return unsubscribe;
  }, [tabId, onResizeSync]);

  // Handle resize
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && isActive) {
      fitAddonRef.current.fit();
      const terminal = terminalRef.current;
      if (terminal) {
        resizeTerminal(terminal.cols, terminal.rows);
      }
    }
  }, [isActive, resizeTerminal]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  // Fit when becoming active
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      // Use setTimeout to ensure the container is visible before fitting
      setTimeout(() => {
        fitAddonRef.current?.fit();
        const terminal = terminalRef.current;
        if (terminal) {
          resizeTerminal(terminal.cols, terminal.rows);
        }
      }, 0);
    }
  }, [isActive, resizeTerminal]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full absolute inset-0 ${isActive ? 'visible z-[1]' : 'invisible z-0'}`}
    />
  );
}
