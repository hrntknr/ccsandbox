import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';

// Helper to detect mobile devices
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Check for touch capability and small screen width
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobile(hasTouchScreen && isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Special keys for mobile terminal
const SPECIAL_KEYS = [
  { label: '←', value: '\x1b[D' },
  { label: '→', value: '\x1b[C' },
  { label: '↑', value: '\x1b[A' },
  { label: '↓', value: '\x1b[B' },
  { label: '/', value: '/' },
  { label: '|', value: '|' },
  { label: '~', value: '~' },
  { label: '-', value: '-' },
  { label: 'Esc', value: '\x1b' },
  { label: 'Tab', value: '\t' },
];

// Modifier key states: 'off' -> 'once' (single use) -> 'locked' (toggle)
type ModifierState = 'off' | 'once' | 'locked';

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const historyReceivedRef = useRef(false);
  const exitedRef = useRef(initialExited ?? false);
  const isMobile = useIsMobile();
  const [ctrlState, setCtrlState] = useState<ModifierState>('off');
  const [altState, setAltState] = useState<ModifierState>('off');
  const [terminalHeight, setTerminalHeight] = useState<number | null>(null);
  const [terminalTop, setTerminalTop] = useState<number | null>(null);

  // Handle modifier key press (Ctrl/Alt)
  const handleModifierPress = useCallback((modifier: 'ctrl' | 'alt') => {
    const setState = modifier === 'ctrl' ? setCtrlState : setAltState;
    const currentState = modifier === 'ctrl' ? ctrlState : altState;

    if (currentState === 'off') {
      setState('once');
    } else if (currentState === 'once') {
      setState('locked');
    } else {
      setState('off');
    }
  }, [ctrlState, altState]);

  // Apply modifier to a character and return the modified value
  const applyModifiers = useCallback((value: string): string => {
    // For control characters, apply Ctrl modifier (a-z -> \x01-\x1a)
    if (ctrlState !== 'off' && value.length === 1) {
      const char = value.toLowerCase();
      if (char >= 'a' && char <= 'z') {
        return String.fromCharCode(char.charCodeAt(0) - 96); // a=1, b=2, etc.
      }
    }
    // For Alt, prepend ESC
    if (altState !== 'off' && value.length === 1) {
      return '\x1b' + value;
    }
    return value;
  }, [ctrlState, altState]);

  // Reset modifiers if in 'once' state
  const resetOnceModifiers = useCallback(() => {
    if (ctrlState === 'once') setCtrlState('off');
    if (altState === 'once') setAltState('off');
  }, [ctrlState, altState]);

  // Handle special key button press
  const handleSpecialKey = useCallback(
    (value: string) => {
      if (exitedRef.current) {
        closeTab(tabId);
      } else {
        const modifiedValue = applyModifiers(value);
        sendInput(tabId, modifiedValue);
        resetOnceModifiers();
        // Refocus terminal after button press
        terminalRef.current?.focus();
      }
    },
    [tabId, sendInput, closeTab, applyModifiers, resetOnceModifiers]
  );

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

    // WORKAROUND: iOS Safari has timing issues with initial terminal sizing.
    // FitAddon.fit() doesn't correctly calculate size on first render.
    // Polling fit() every 1s ensures terminal stays properly sized.
    const intervalId = setInterval(() => {
      fitAddon.fit();
    }, 1000);

    return () => {
      clearInterval(intervalId);
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
        // Apply modifiers from virtual keyboard (for mobile)
        const modifiedData = applyModifiers(data);
        sendInput(tabId, modifiedData);
        // Reset 'once' modifiers after use
        resetOnceModifiers();
      }
    });

    return () => {
      dataHandler.dispose();
    };
  }, [tabId, sendInput, closeTab, applyModifiers, resetOnceModifiers]);

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

    // Also listen to visualViewport changes for iOS keyboard
    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, [handleResize]);

  // Fit when becoming active or terminal height changes (iOS keyboard)
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
  }, [isActive, resizeTerminal, terminalHeight]);

  // iOS keyboard height handling - only for terminal
  useEffect(() => {
    if (!isMobile) return;

    const updateLayout = () => {
      const visualViewport = window.visualViewport;
      const wrapper = wrapperRef.current;
      if (visualViewport && wrapper) {
        // Get the wrapper's position relative to viewport
        const wrapperRect = wrapper.parentElement?.getBoundingClientRect();
        const top = wrapperRect?.top ?? 0;

        // Calculate the available height for terminal
        const availableHeight = visualViewport.height - top;

        setTerminalTop(top);
        setTerminalHeight(availableHeight > 0 ? availableHeight : null);

        // Reset scroll position to prevent content from being pushed up
        if (visualViewport.offsetTop > 0) {
          window.scrollTo(0, 0);
        }
      }
    };

    // Initial calculation after mount
    setTimeout(updateLayout, 0);

    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('resize', updateLayout);
      visualViewport.addEventListener('scroll', updateLayout);
    }

    return () => {
      if (visualViewport) {
        visualViewport.removeEventListener('resize', updateLayout);
        visualViewport.removeEventListener('scroll', updateLayout);
      }
    };
  }, [isMobile]);

  // iOS touch scroll handling - convert touch events to xterm.js scroll
  useEffect(() => {
    if (!isMobile || !isActive) return;

    const container = containerRef.current;
    const terminal = terminalRef.current;
    if (!container || !terminal) return;

    let touchStartY = 0;
    let lastTouchY = 0;
    let isTouchScrolling = false;
    // Accumulator for sub-line scroll distance
    let scrollAccumulator = 0;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchStartY = touch.clientY;
      lastTouchY = touch.clientY;
      isTouchScrolling = true;
      scrollAccumulator = 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouchScrolling) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaY = lastTouchY - touch.clientY;
      lastTouchY = touch.clientY;

      // Accumulate scroll distance
      scrollAccumulator += deltaY;

      // Calculate lines to scroll (using font size as line height approximation)
      const lineHeight = 18; // Approximate line height based on fontSize 14
      const linesToScroll = Math.trunc(scrollAccumulator / lineHeight);

      if (linesToScroll !== 0) {
        terminal.scrollLines(linesToScroll);
        // Keep remainder for smooth sub-line scrolling
        scrollAccumulator -= linesToScroll * lineHeight;
      }

      // Prevent body scroll
      e.preventDefault();
    };

    const handleTouchEnd = () => {
      isTouchScrolling = false;
      scrollAccumulator = 0;
    };

    // Add listeners to the terminal container
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isMobile, isActive]);

  // Prevent body scroll when terminal is active on iOS
  useEffect(() => {
    if (!isMobile || !isActive) return;

    // Prevent touchmove on document to stop body scrolling
    const preventScroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      // Allow scrolling within the special key bar (horizontal scroll)
      if (target.closest('[data-special-key-bar]')) {
        return;
      }
      // Allow scrolling within terminal container (handled by custom touch handler above)
      if (target.closest('.xterm') || target.closest('.xterm-viewport')) {
        return;
      }
      // Prevent default to stop body scroll
      e.preventDefault();
    };

    // Add to document to catch all touch events
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [isMobile, isActive]);

  // Apply style for iOS keyboard handling - use position:fixed to escape body scroll
  const useFixedLayout = isMobile && terminalHeight !== null && terminalTop !== null;
  const wrapperStyle: React.CSSProperties = useFixedLayout
    ? { position: 'fixed', top: terminalTop, left: 0, right: 0, height: terminalHeight }
    : {};

  return (
    <div
      ref={wrapperRef}
      className={`flex flex-col ${isActive ? 'visible z-[1]' : 'invisible z-0'} ${useFixedLayout ? '' : 'w-full h-full absolute inset-0'}`}
      style={wrapperStyle}
    >
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
      />
      {/* Mobile special key bar */}
      {isMobile && (
        <div
          data-special-key-bar
          className="flex-shrink-0 bg-[#2d2d2d] border-t border-vscode-border overflow-x-auto relative z-10"
        >
          <div className="flex gap-1 p-1.5">
            {/* Ctrl button */}
            <button
              type="button"
              className={`flex-shrink-0 px-2 py-1 min-w-[32px] text-xs font-mono border rounded transition-colors ${
                ctrlState === 'off'
                  ? 'bg-[#3c3c3c] text-vscode-text-secondary border-vscode-border'
                  : ctrlState === 'once'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-blue-700 text-white border-blue-400 ring-1 ring-blue-400'
              }`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => handleModifierPress('ctrl')}
            >
              Ctrl
            </button>
            {/* Alt button */}
            <button
              type="button"
              className={`flex-shrink-0 px-2 py-1 min-w-[32px] text-xs font-mono border rounded transition-colors ${
                altState === 'off'
                  ? 'bg-[#3c3c3c] text-vscode-text-secondary border-vscode-border'
                  : altState === 'once'
                    ? 'bg-green-600 text-white border-green-500'
                    : 'bg-green-700 text-white border-green-400 ring-1 ring-green-400'
              }`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => handleModifierPress('alt')}
            >
              Alt
            </button>
            {/* Separator */}
            <div className="w-px bg-vscode-border mx-0.5" />
            {/* Regular keys */}
            {SPECIAL_KEYS.map((key) => (
              <button
                key={key.label}
                type="button"
                className="flex-shrink-0 px-2 py-1 min-w-[32px] text-xs font-mono bg-[#3c3c3c] text-vscode-text-secondary border border-vscode-border rounded hover:bg-[#4a4a4a] active:bg-[#555555] active:text-white transition-colors"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => handleSpecialKey(key.value)}
              >
                {key.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
