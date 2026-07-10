import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Settings, Download, Trash2, GripVertical, CheckCircle2, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';

function App() {
  const [isReceiver, setIsReceiver] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);

  // Settings
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState('#ffffff');
  const [maxHeight, setMaxHeight] = useState(300);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsReceiver(params.get('mode') === 'receiver');
  }, []);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Receiver: Listen to WebSocket messages
  useEffect(() => {
    const connectWS = () => {
      const ws = new WebSocket('ws://localhost:4000');
      
      ws.onopen = () => {
        console.log('Connected to local WS server');
        // If sender, tell receiver our initial state
        if (!isReceiver) {
          ws.send(JSON.stringify({ type: 'status', isListening }));
          ws.send(JSON.stringify({ type: 'settings', fontSize, textColor, maxHeight }));
        }
      };

      ws.onmessage = (event) => {
        if (isReceiver) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
              setFinalTranscript(data.final);
              setInterimTranscript(data.interim);
            } else if (data.type === 'settings') {
              if (data.fontSize) setFontSize(data.fontSize);
              if (data.textColor) setTextColor(data.textColor);
              if (data.maxHeight) setMaxHeight(data.maxHeight);
            } else if (data.type === 'status') {
              setIsListening(data.isListening);
            }
          } catch (e) {
            console.error(e);
          }
        }
      };

      ws.onclose = () => {
        setTimeout(connectWS, 2000);
      };

      wsRef.current = ws;
    };

    connectWS();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReceiver]);

  // Sender: Send status when isListening changes
  useEffect(() => {
    if (!isReceiver && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'status', isListening }));
    }
  }, [isListening, isReceiver]);

  const finalTranscriptRef = useRef(finalTranscript);
  useEffect(() => {
    finalTranscriptRef.current = finalTranscript;
  }, [finalTranscript]);

  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Sender: Web Speech API Setup
  useEffect(() => {
    if (isReceiver) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Browser tidak mendukung Speech API. Gunakan Chrome.", "error");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'id-ID';

    recognition.onresult = (event: any) => {
      let currentInterim = "";
      let currentFinal = "";
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          currentFinal += event.results[i][0].transcript + " ";
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }
      
      if (currentFinal) {
        setFinalTranscript(prev => {
          const updated = prev + currentFinal;
          sendToReceiver(updated, currentInterim);
          return updated;
        });
      } else {
        sendToReceiver(finalTranscriptRef.current, currentInterim);
      }
      setInterimTranscript(currentInterim);
    };

    recognition.onend = () => {
      // Auto-restart if it stops unexpectedly (e.g. browser stops it after silence)
      if (isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch(e) {
              console.error("Failed to restart recognition:", e);
            }
          }
        }, 100); // 100ms delay prevents Chrome from throwing errors
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        console.error("Speech error", event.error);
        if (event.error === 'not-allowed') {
          showToast("Akses mikrofon diblokir!", "error");
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReceiver]);

  const sendToReceiver = (final: string, interim: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'transcript', final, interim }));
    }
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false); // Update state first so onend knows not to restart
      recognitionRef.current?.stop();
      setInterimTranscript('');
      sendToReceiver(finalTranscript, '');
    } else {
      setIsListening(true);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("Failed to start recognition:", e);
      }
    }
  };

  const handleClear = () => {
    setFinalTranscript('');
    setInterimTranscript('');
    sendToReceiver('', '');
    showToast("Teks dibersihkan");
  };

  const handleExportPDF = () => {
    const text = finalTranscript.trim();
    if (!text) {
      showToast("Tidak ada teks untuk di-export", "error");
      return;
    }
    const doc = new jsPDF();
    doc.setFont("helvetica");
    doc.setFontSize(12);
    const splitText = doc.splitTextToSize(text, 180);
    doc.text(splitText, 15, 20);
    doc.save("SuaraDosen-Transcript.pdf");
    showToast("PDF berhasil diunduh!");
  };

  const updateSettings = (size: number, color: string, height: number) => {
    setFontSize(size);
    setTextColor(color);
    setMaxHeight(height);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'settings', fontSize: size, textColor: color, maxHeight: height }));
    }
  };

  // Receiver: Toggle Click-Through based on isListening
  useEffect(() => {
    if (!isReceiver || typeof (window as any).require === 'undefined') return;
    const { ipcRenderer } = (window as any).require('electron');
    
    // If listening, IGNORE mouse events (true) so it clicks through.
    // If NOT listening, DO NOT ignore (false) so user can drag it.
    ipcRenderer.send('set-ignore-mouse-events', isListening);
  }, [isListening, isReceiver]);

  // Fading logic for Receiver
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (isReceiver && (finalTranscript || interimTranscript)) {
      setIsFading(false); // Reset fading when text changes
      const timer = setTimeout(() => {
        setIsFading(true);
      }, 3000); // 3 seconds timeout
      return () => clearTimeout(timer);
    }
  }, [isReceiver, finalTranscript, interimTranscript]);

  if (isReceiver) {
    if (!isListening) {
      // SETUP MODE: Not listening. Show placeholder and make it draggable.
      return (
        <div 
          className="w-screen h-screen flex flex-col justify-end p-6 cursor-grab active:cursor-grabbing"
          style={{ WebkitAppRegion: 'drag' } as any}
          title="Geser area ini untuk mengatur posisi subtitle"
        >
          <div className="w-full flex items-end">
            <div className="flex-1 liquid-glass-dark p-6 rounded-3xl border border-white/20 border-dashed bg-black/40">
              <div className="flex items-center gap-3 mb-2">
                <GripVertical size={24} className="text-white/50" />
                <span className="text-white/80 font-bold text-xl tracking-wider">MODE PENGATURAN POSISI</span>
              </div>
              <p className="text-white/60 text-lg">
                Tahan dan geser area ini ke posisi yang Anda inginkan.
              </p>
              
              <div className="mt-6 pt-6 border-t border-white/20">
                <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Pratinjau Batas Teks:</p>
                <div 
                  className="w-full relative border-y-2 border-dashed border-blue-400/50 flex flex-col justify-end overflow-hidden rounded-sm"
                  style={{ height: `${maxHeight}px` }}
                >
                  <div className="absolute inset-0 bg-blue-400/10 pointer-events-none"></div>
                  <div className="w-full pb-1">
                    <span 
                      className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl opacity-40"
                      style={{ fontSize: `${fontSize}px`, color: textColor }}
                    >
                      (Teks sebelumnya yang terdorong ke atas akan hilang di batas atas ini...)
                      {'\n'}
                    </span>
                    <span 
                      className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                      style={{ fontSize: `${fontSize}px`, color: textColor }}
                    >
                      Ini adalah contoh teks subtitle saat Anda presentasi nanti. Teks akan selalu muncul dari bawah dan tidak akan melewati batas garis putus-putus ini.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // LIVE MODE: Listening. Show transcripts, no drag handles.
    return (
      <div className="w-screen h-screen flex p-6">
        <div className="w-full flex items-end gap-8">
          <div 
            className={`flex-1 pb-4 transition-opacity duration-[1500ms] ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'} flex flex-col justify-end overflow-hidden`}
            style={{ maxHeight: `${maxHeight}px` }}
          >
            <div className="w-full">
              <span 
                className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                style={{ fontSize: `${fontSize}px`, color: textColor }}
              >
                {finalTranscript}
              </span>
              <span 
                className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                style={{ fontSize: `${fontSize}px`, color: textColor }}
              >
                {interimTranscript}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sender UI (Browser)
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background gradients for Liquid Glass feel */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="liquid-glass w-full max-w-4xl rounded-3xl p-8 flex flex-col gap-8 relative z-10">
        <header className="flex justify-between items-center border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              SuaraDosen <span className="px-3 py-1 rounded-full liquid-glass-dark text-xs font-medium text-blue-300">Pro</span>
            </h1>
            <p className="text-slate-400 mt-2 text-sm">Aplikasi subtitle melayang kelas premium.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end mr-4">
              <label className="text-xs text-slate-400 mb-1">Batas Tinggi (px)</label>
              <input 
                type="range" 
                min="100" 
                max="800"
                step="50"
                value={maxHeight} 
                onChange={(e) => updateSettings(fontSize, textColor, Number(e.target.value))}
                className="w-24 accent-blue-400"
              />
            </div>
            <div className="flex flex-col items-end mr-4">
              <label className="text-xs text-slate-400 mb-1">Warna Teks</label>
              <input 
                type="color" 
                value={textColor} 
                onChange={(e) => updateSettings(fontSize, e.target.value, maxHeight)}
                className="w-12 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
              />
            </div>
            <div className="flex flex-col items-end mr-4">
              <label className="text-xs text-slate-400 mb-1">Ukuran Teks</label>
              <input 
                type="range" 
                min="12" 
                max="96" 
                value={fontSize} 
                onChange={(e) => updateSettings(Number(e.target.value), textColor, maxHeight)}
                className="w-24 accent-blue-400"
              />
            </div>
            <button 
              onClick={handleExportPDF}
              className="p-3 liquid-glass-dark hover:bg-white/10 text-white rounded-xl transition-all hover:scale-105 active:scale-95"
              title="Export PDF"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={handleClear}
              className="p-3 liquid-glass-dark hover:bg-red-500/20 text-red-300 rounded-xl transition-all hover:scale-105 active:scale-95"
              title="Hapus Teks"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-[300px] max-h-[500px] overflow-y-auto pr-2 custom-scrollbar flex flex-col justify-end">
          <div className="w-full">
            <span className="text-2xl text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
              {finalTranscript}
            </span>
            <span className="text-2xl text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
              {interimTranscript}
            </span>
            {!finalTranscript && !interimTranscript && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 mt-20">
                <MicOff size={48} className="opacity-20" />
                <p>Belum ada rekaman suara. Tekan tombol mikrofon untuk memulai.</p>
              </div>
            )}
          </div>
        </main>

        <footer className="flex justify-center pt-6 border-t border-white/10">
          <button 
            onClick={toggleListening}
            className={`group relative p-6 rounded-full transition-all duration-300 ${isListening ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110' : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:scale-105'} active:scale-95`}
          >
            {isListening ? <MicOff size={32} className="text-white" /> : <Mic size={32} className="text-white" />}
          </button>
        </footer>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
        {toasts.map((toast) => (
          <div key={toast.id} className={`liquid-glass px-5 py-3 rounded-2xl text-white text-sm flex items-center gap-3 animate-float ${toast.type === 'error' ? 'border-red-500/50' : 'border-green-500/50'}`}>
            {toast.type === 'error' ? <AlertCircle size={18} className="text-red-400" /> : <CheckCircle2 size={18} className="text-green-400" />}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
