import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { TerminalClientMessage, TerminalServerMessage } from '@ccsandbox/shared';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface TerminalProps {
  sessionId: string;
  tabId: string;
  isActive: boolean;
}

export function Terminal({ sessionId, tabId, isActive }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attachedRef = useRef(false);

  const sendMessage = useCallback((message: TerminalClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

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

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && isActive) {
        fitAddonRef.current.fit();
        const terminal = terminalRef.current;
        if (terminal && attachedRef.current) {
          sendMessage({
            type: 'resize',
            cols: terminal.cols,
            rows: terminal.rows,
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Fit when becoming active
    if (isActive && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 0);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isActive, sendMessage]);

  // WebSocket connection
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Attach to session
      const attachMessage: TerminalClientMessage = {
        type: 'attach',
        sessionId,
        tabId,
      };
      ws.send(JSON.stringify(attachMessage));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as TerminalServerMessage;

        switch (message.type) {
          case 'attached':
            attachedRef.current = true;
            // Send initial size
            sendMessage({
              type: 'resize',
              cols: terminal.cols,
              rows: terminal.rows,
            });
            break;
          case 'output':
            terminal.write(message.data);
            break;
          case 'error':
            terminal.writeln(`\r\n\x1b[31mError: ${message.message}\x1b[0m`);
            break;
          case 'exit':
            terminal.writeln(`\r\n\x1b[33mProcess exited with code ${message.code}\x1b[0m`);
            attachedRef.current = false;
            break;
        }
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onerror = () => {
      terminal.writeln('\r\n\x1b[31mWebSocket connection error\x1b[0m');
    };

    ws.onclose = () => {
      attachedRef.current = false;
      terminal.writeln('\r\n\x1b[33mConnection closed\x1b[0m');
    };

    // Handle terminal input
    const dataHandler = terminal.onData((data) => {
      if (attachedRef.current) {
        sendMessage({ type: 'input', data });
      }
    });

    return () => {
      dataHandler.dispose();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        sendMessage({ type: 'detach' });
        ws.close();
      }
      wsRef.current = null;
      attachedRef.current = false;
    };
  }, [sessionId, tabId, sendMessage]);

  return (
    <div
      ref={containerRef}
      className={`terminal ${isActive ? 'terminal-active' : 'terminal-inactive'}`}
    />
  );
}
