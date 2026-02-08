import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ImageAttachment, PermissionMode } from '@shared/index.js';
import { PermissionModeSelector } from './PermissionModeSelector';
import { SPEECH_DISABLED } from '../SettingsModal';
import { useIsMobile } from '../../hooks';
import '../../types/speech-recognition.d.ts';

/** Maximum file size in bytes (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
/** Maximum number of images per message */
const MAX_IMAGES = 10;
/** Allowed MIME types */
const ALLOWED_TYPES: ImageAttachment['mediaType'][] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** sessionStorage key prefix for per-tab draft persistence */
const DRAFT_KEY_PREFIX = 'claude-draft:';

interface InputFormProps {
  tabId: string;
  onSubmit: (content: string, permissionMode: PermissionMode, images?: ImageAttachment[]) => void;
  onInterrupt: () => void;
  disabled: boolean;
  isActive: boolean;
  backendPermissionMode?: PermissionMode | null;
  defaultPermissionMode?: PermissionMode;
  speechRecognitionLanguage?: string;
}

/**
 * Get localized error message for speech recognition errors
 */
function getSpeechErrorMessage(error: string): string {
  switch (error) {
    case 'no-speech':
      return 'No speech detected';
    case 'audio-capture':
      return 'Microphone not available';
    case 'not-allowed':
      return 'Microphone permission denied';
    case 'network':
      return 'Network error';
    case 'aborted':
      return 'Recognition aborted';
    default:
      return 'Speech recognition error';
  }
}

/**
 * Convert a File to ImageAttachment (base64)
 */
async function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Failed to read file'));
        return;
      }
      resolve({
        data: base64,
        mediaType: file.type as ImageAttachment['mediaType'],
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function InputForm({ tabId, onSubmit, onInterrupt, disabled, isActive, backendPermissionMode, defaultPermissionMode = 'bypassPermissions', speechRecognitionLanguage }: InputFormProps) {
  const [input, setInput] = useState(() => {
    try {
      return sessionStorage.getItem(`${DRAFT_KEY_PREFIX}${tabId}`) ?? '';
    } catch {
      return '';
    }
  });
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(defaultPermissionMode);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check browser compatibility for Web Speech API
  const isSpeechSupported = useMemo(() => {
    return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const isMobile = useIsMobile();

  // Auto-focus when tab becomes active (desktop only)
  useEffect(() => {
    if (isActive && !disabled && !isMobile) {
      textareaRef.current?.focus();
    }
  }, [isActive, disabled, isMobile]);

  // Sync permission mode when backend mode changes (EnterPlanMode/ExitPlanMode)
  useEffect(() => {
    if (backendPermissionMode) {
      setPermissionMode(backendPermissionMode);
    }
  }, [backendPermissionMode]);

  // Sync permission mode when default mode changes (settings update)
  // Only apply if no backend mode is active
  useEffect(() => {
    if (!backendPermissionMode && defaultPermissionMode) {
      setPermissionMode(defaultPermissionMode);
    }
  }, [defaultPermissionMode, backendPermissionMode]);

  // Persist draft input to sessionStorage per tab
  useEffect(() => {
    try {
      if (input) {
        sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${tabId}`, input);
      } else {
        sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${tabId}`);
      }
    } catch {
      // ignore storage errors
    }
  }, [input, tabId]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if ((trimmed || images.length > 0) && !disabled) {
        // Stop speech recognition if active
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          setIsRecording(false);
        }
        onSubmit(trimmed, permissionMode, images.length > 0 ? images : undefined);
        setInput('');
        try { sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${tabId}`); } catch { /* ignore */ }
        // Clear images after submit
        setImages([]);
        // Revoke object URLs to free memory
        imageUrls.forEach((url) => URL.revokeObjectURL(url));
        setImageUrls([]);
      }
    },
    [input, images, imageUrls, disabled, onSubmit, permissionMode]
  );

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const newImages: ImageAttachment[] = [];
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      // Check total count
      if (images.length + newImages.length >= MAX_IMAGES) {
        console.warn(`Maximum ${MAX_IMAGES} images allowed`);
        break;
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type as ImageAttachment['mediaType'])) {
        console.warn(`Unsupported file type: ${file.type}`);
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`File too large: ${file.name} (max 5MB)`);
        continue;
      }

      try {
        const attachment = await fileToImageAttachment(file);
        newImages.push(attachment);
        newUrls.push(URL.createObjectURL(file));
      } catch (error) {
        console.error('Failed to process image:', error);
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages]);
      setImageUrls((prev) => [...prev, ...newUrls]);
    }
  }, [images.length]);

  // Toggle speech recognition
  const toggleSpeechRecognition = useCallback(() => {
    if (!speechRecognitionLanguage || !isSpeechSupported) return;

    // Stop if currently recording
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    // Create SpeechRecognition instance
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = speechRecognitionLanguage;
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setSpeechError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result.isFinal && result[0]) {
          finalTranscript += result[0].transcript;
        }
      }

      // Add final transcript to input
      if (finalTranscript) {
        setInput((prev) => prev + finalTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      if (event.error !== 'aborted') {
        setSpeechError(getSpeechErrorMessage(event.error));
        // Clear error after 3 seconds
        setTimeout(() => setSpeechError(null), 3000);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [speechRecognitionLanguage, isSpeechSupported, isRecording]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImageUrls((prev) => {
      const newUrls = prev.filter((_, i) => i !== index);
      // Revoke the removed URL
      if (prev[index]) {
        URL.revokeObjectURL(prev[index]);
      }
      return newUrls;
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const cyclePermissionMode = useCallback((reverse: boolean) => {
    const modes: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = reverse
      ? (currentIndex - 1 + modes.length) % modes.length
      : (currentIndex + 1) % modes.length;
    setPermissionMode(modes[nextIndex]!);
  }, [permissionMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        cyclePermissionMode(e.shiftKey);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, cyclePermissionMode]
  );

  return (
    <form className="flex gap-0" onSubmit={handleSubmit} onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="flex-1 relative bg-claude-bg-secondary/95 backdrop-blur-sm border border-claude-border rounded-2xl shadow-lg shadow-black/20 transition-colors focus-within:border-claude-accent">
        {/* Image previews */}
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 border-b border-claude-border/50">
            {imageUrls.map((url, index) => (
              <div key={index} className="relative group">
                <img
                  src={url}
                  alt={`Attachment ${index + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-claude-border"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent border-none pt-3 pb-2 px-3.5 text-claude-text-primary font-sans text-base resize-none min-h-[44px] max-h-[200px] leading-normal focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-claude-text-muted"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Waiting for response...' : 'Ask Claude anything...'}
          disabled={disabled}
          rows={1}
        />
        <div className="flex items-center justify-between py-1.5 px-3 border-t border-claude-border/50 bg-claude-bg-tertiary/50 rounded-b-[15px]">
          {/* Left: Permission mode selector */}
          <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
            <PermissionModeSelector
              value={permissionMode}
              onChange={setPermissionMode}
              disabled={disabled}
            />
            {/* Speech error message */}
            {speechError && (
              <span className="text-xs text-red-500 px-1 truncate">{speechError}</span>
            )}
          </div>
          {/* Spacer */}
          <div className="flex-1 min-w-2" />
          {/* Right: Image, voice, and submit buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* File input button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || images.length >= MAX_IMAGES}
              className="p-1.5 text-claude-text-muted hover:text-claude-text-primary hover:bg-claude-bg-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={images.length >= MAX_IMAGES ? `Maximum ${MAX_IMAGES} images` : 'Attach image'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            {/* Voice input button */}
            {speechRecognitionLanguage && speechRecognitionLanguage !== SPEECH_DISABLED && isSpeechSupported && (
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                disabled={disabled}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isRecording
                    ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20 animate-pulse'
                    : 'text-claude-text-muted hover:text-claude-text-primary hover:bg-claude-bg-hover'
                }`}
                title={isRecording ? 'Stop recording' : 'Voice input'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isRecording ? (
                    // Stop icon (square)
                    <rect x="6" y="6" width="12" height="12" rx="2" strokeWidth={2} fill="currentColor" />
                  ) : (
                    // Microphone icon
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  )}
                </svg>
              </button>
            )}
            {disabled ? (
              <button
                type="button"
                onClick={onInterrupt}
                className="p-1.5 text-red-400/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Cancel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" strokeWidth={2} fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                className="py-1.5 px-3.5 bg-claude-accent text-white border-none rounded-xl cursor-pointer text-[13px] font-medium transition-all flex items-center gap-1.5 hover:bg-claude-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!input.trim() && images.length === 0}
              >
                <span className="text-sm">↑</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
