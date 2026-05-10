import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../services/chatStorage";
import {
  analyzeImageWithGeminiResult,
  buildLiveBrewCoachSystemPrompt,
  buildLiveBrewVisionPrompt,
} from "../services/gemini";

interface LiveBrewCoachDockProps {
  sessionId?: string;
  sessionName?: string;
  messages: ChatMessage[];
  equipmentPrompt?: string | null;
  onSendMessage: (
    content: string,
    systemPrompt?: string | null
  ) => Promise<string>;
  onAppendMessage: (message: ChatMessage) => Promise<void>;
}

function getSpeechRecognitionCtor(): any {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function makeMessage(role: ChatMessage["role"], content: string): ChatMessage {
  const now = new Date().toISOString();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    role,
    content,
    timestamp: now,
  };
}

function speakText(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl;
  return dataUrl.slice(comma + 1);
}

export default function LiveBrewCoachDock({
  sessionId,
  sessionName,
  messages,
  equipmentPrompt,
  onSendMessage,
  onAppendMessage,
}: LiveBrewCoachDockProps) {
  const openKey = useMemo(
    () => `barista_live_coach_open:${sessionId ?? "global"}`,
    [sessionId]
  );
  const speakingKey = useMemo(
    () => `barista_live_coach_speaking:${sessionId ?? "global"}`,
    [sessionId]
  );
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(true);
  const [sending, setSending] = useState(false);
  const [visionBusy, setVisionBusy] = useState(false);
  const [status, setStatus] = useState<string>("Ready for a live brew session.");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const liveCoachPrompt = useMemo(
    () => buildLiveBrewCoachSystemPrompt(equipmentPrompt),
    [equipmentPrompt]
  );

  const recentContext = useMemo(
    () => messages.slice(-8),
    [messages]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedOpen = window.localStorage.getItem(openKey);
    const storedSpeaking = window.localStorage.getItem(speakingKey);

    if (storedOpen !== null) {
      setOpen(storedOpen === "true");
    }
    if (storedSpeaking !== null) {
      setSpeaking(storedSpeaking === "true");
    }
  }, [openKey, speakingKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(openKey, String(open));
  }, [open, openKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(speakingKey, String(speaking));
  }, [speaking, speakingKey]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setListening(false);
    }
  }, [open]);

  async function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || visionBusy) return;

    setSending(true);
    setStatus("Brewing guidance in progress...");
    setInput("");

    try {
      const response = await onSendMessage(trimmed, liveCoachPrompt);
      setStatus("Coach replied.");
      if (speaking && response.trim()) {
        speakText(response);
      }
    } catch (error) {
      console.error("Live coach send failed:", error);
      setStatus("Could not reach the coach right now.");
    } finally {
      setSending(false);
    }
  }

  function startVoiceCapture() {
    if (listening) {
      recognitionRef.current?.stop?.();
      return;
    }

    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      setStatus("Voice input is not supported in this browser.");
      return;
    }

    finalTranscriptRef.current = "";
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      setVoiceSupported(true);
      setStatus("Listening for the next brew instruction...");
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event?.error ?? event);
      setStatus("Voice capture failed.");
      setListening(false);
    };

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript ?? "";
      }
      const trimmed = transcript.trim();
      if (trimmed) {
        setInput(trimmed);
      }
      if (event.results[event.results.length - 1]?.isFinal && trimmed) {
        finalTranscriptRef.current = trimmed;
      }
    };

    recognition.onend = async () => {
      setListening(false);
      recognitionRef.current = null;
      const finalText = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = "";
      if (finalText) {
        await submitMessage(finalText);
      } else {
        setStatus("Ready.");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  async function handleImagePicked(file?: File | null) {
    if (!file) return;
    setVisionBusy(true);
    setStatus("Reading the brew setup image...");

    try {
      const dataUrl = await fileToDataUrl(file);
      const base64 = stripDataUrlPrefix(dataUrl);
      const prompt = buildLiveBrewVisionPrompt({
        sessionName,
        recentMessages: recentContext,
        equipmentPrompt,
      });
      const analysis = await analyzeImageWithGeminiResult(base64, prompt);

      const userNote = makeMessage("user", "Shared a brew setup photo for live coaching.");
      const assistantNote = {
        ...makeMessage("assistant", analysis.text),
        modelLabel: analysis.modelLabel,
      };

      await onAppendMessage(userNote);
      await onAppendMessage(assistantNote);
      setStatus("Image guidance added to the chat.");
      if (speaking && analysis.text.trim()) {
        speakText(analysis.text);
      }
    } catch (error) {
      console.error("Live coach vision failed:", error);
      setStatus("Could not analyze the image.");
    } finally {
      setVisionBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const contextPreview = recentContext.length > 0
    ? recentContext.map((msg) => ({
        label: msg.role === "user" ? "You" : "Coach",
        content: msg.content,
      }))
    : [];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 btn btn-primary shadow-2xl gap-2 rounded-full px-4"
          title="Start live brew coach"
        >
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
          <span>Live coach</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div
            className="absolute inset-0 bg-black/25 pointer-events-auto"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-6 right-6 w-[min(92vw,24rem)] pointer-events-auto">
            <div className="card bg-base-100 shadow-2xl border border-base-200 overflow-hidden">
              <div className="card-body p-4 gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.2em] text-base-content/40">Live brew coach</p>
                    <h3 className="font-semibold text-base-content truncate">
                      {sessionName || "Current chat session"}
                    </h3>
                    <p className="text-xs text-base-content/50 mt-1">{status}</p>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="btn btn-ghost btn-sm btn-square"
                    title="Close live coach"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={startVoiceCapture}
                    className={`btn btn-sm ${listening ? "btn-secondary" : "btn-primary"}`}
                    disabled={sending || visionBusy}
                  >
                    {listening ? "Stop mic" : "Talk"}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-sm btn-outline"
                    disabled={sending || visionBusy}
                  >
                    {visionBusy ? "Analyzing..." : "Camera / photo"}
                  </button>
                  <button
                    onClick={() => setSpeaking((v) => !v)}
                    className={`btn btn-sm ${speaking ? "btn-ghost" : "btn-outline"}`}
                  >
                    {speaking ? "Voice replies on" : "Voice replies off"}
                  </button>
                  <button
                    onClick={() => setInput("")}
                    className="btn btn-sm btn-ghost"
                    disabled={!input}
                  >
                    Clear draft
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    void handleImagePicked(event.target.files?.[0] ?? null);
                  }}
                />

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-base-content/40">Live input</label>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={3}
                    className="textarea textarea-bordered w-full resize-none text-sm"
                    placeholder="Ask the coach what to do next..."
                  />
                  <button
                    onClick={() => void submitMessage(input)}
                    className="btn btn-primary btn-sm w-full"
                    disabled={!input.trim() || sending || visionBusy}
                  >
                    {sending ? "Sending..." : "Send to coach"}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider text-base-content/40">Current context</p>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {contextPreview.length > 0 ? (
                      contextPreview.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="rounded-lg bg-base-200 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wider text-base-content/40">{item.label}</p>
                          <p className="text-sm text-base-content whitespace-pre-wrap break-words">
                            {item.content}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-base-content/40">No prior chat context yet.</p>
                    )}
                  </div>
                </div>

                {!voiceSupported && (
                  <p className="text-xs text-warning">
                    Voice input is not available in this browser. Text and photo coaching still work.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
