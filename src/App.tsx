import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Download, Trash2, GripVertical, CheckCircle2, AlertCircle, Clock, Zap, Type, Layers } from 'lucide-react';
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
  
  // New Teaching Features State
  const [keywords, setKeywords] = useState('');
  const [isBgEnabled, setIsBgEnabled] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(70);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

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
      const ws = new WebSocket('ws://127.0.0.1:4000');
      
      ws.onopen = () => {
        console.log('Connected to local WS server');
        if (!isReceiver) {
          ws.send(JSON.stringify({ type: 'status', isListening }));
          ws.send(JSON.stringify({ type: 'settings', fontSize, textColor, maxHeight, keywords, isBgEnabled, bgOpacity }));
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
              if (data.fontSize !== undefined) setFontSize(data.fontSize);
              if (data.textColor !== undefined) setTextColor(data.textColor);
              if (data.maxHeight !== undefined) setMaxHeight(data.maxHeight);
              if (data.keywords !== undefined) setKeywords(data.keywords);
              if (data.isBgEnabled !== undefined) setIsBgEnabled(data.isBgEnabled);
              if (data.bgOpacity !== undefined) setBgOpacity(data.bgOpacity);
            } else if (data.type === 'status') {
              setIsListening(data.isListening);
            } else if (data.type === 'flash') {
              setFlashMessage(data.message);
              setTimeout(() => setFlashMessage(null), 5000); // Hide flash after 5s
            } else if (data.type === 'timer') {
              setTimerRemaining(data.duration);
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

  // Receiver: Timer logic
  useEffect(() => {
    if (!isReceiver || timerRemaining === null || timerRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimerRemaining(prev => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRemaining, isReceiver]);

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
      if (isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch(e) {
              console.error("Failed to restart recognition:", e);
            }
          }
        }, 100);
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
      setIsListening(false);
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

  const updateSettings = (size: number, color: string, height: number, kw: string, bg: boolean, op: number) => {
    setFontSize(size);
    setTextColor(color);
    setMaxHeight(height);
    setKeywords(kw);
    setIsBgEnabled(bg);
    setBgOpacity(op);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'settings', 
        fontSize: size, 
        textColor: color, 
        maxHeight: height,
        keywords: kw,
        isBgEnabled: bg,
        bgOpacity: op
      }));
    }
  };

  const sendFlash = (message: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'flash', message }));
    }
    showToast(`Peringatan: "${message}" ditampilkan`);
  };

  const sendTimer = (minutes: number) => {
    const duration = minutes * 60;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'timer', duration }));
    }
    if (minutes === 0) {
      showToast("Timer dihentikan");
    } else {
      showToast(`Timer ${minutes} Menit dimulai`);
    }
  };

  // Receiver: Toggle Click-Through based on isListening
  useEffect(() => {
    if (!isReceiver || typeof (window as any).require === 'undefined') return;
    const { ipcRenderer } = (window as any).require('electron');
    ipcRenderer.send('set-ignore-mouse-events', isListening);
  }, [isListening, isReceiver]);

  // Fading logic for Receiver
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (isReceiver && (finalTranscript || interimTranscript)) {
      setIsFading(false);
      const timer = setTimeout(() => {
        setIsFading(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isReceiver, finalTranscript, interimTranscript]);

  const renderHighlightedText = (text: string) => {
    if (!text) return null;
    if (!keywords.trim()) return text;
    
    const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keywordArray.length === 0) return text;

    const regexStr = keywordArray.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${regexStr})`, 'gi');
    
    const parts = text.split(regex);
    return parts.map((part, i) => {
      const isMatch = keywordArray.some(k => k.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return <span key={i} className="text-yellow-400 font-black drop-shadow-[0_0_12px_rgba(250,204,21,0.9)] bg-black/30 px-2 rounded-lg">{part}</span>;
      }
      return part;
    });
  };

  if (isReceiver) {
    if (!isListening) {
      // SETUP MODE
      return (
        <div 
          className="w-screen h-screen flex flex-col justify-end p-6 cursor-grab active:cursor-grabbing relative overflow-hidden"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          {/* Flash Overlay Preview */}
          {flashMessage && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fade-in_0.5s_ease-out]">
               <h1 className="text-white text-5xl font-black tracking-widest text-center uppercase drop-shadow-[0_0_40px_rgba(255,255,255,0.8)]">
                 {flashMessage}
               </h1>
             </div>
          )}

          <div className="w-full flex items-end">
            <div className="flex-1 liquid-glass-dark p-6 rounded-3xl border border-white/20 border-dashed bg-black/40">
              <div className="flex items-center gap-3 mb-2">
                <GripVertical size={24} className="text-white/50" />
                <span className="text-white/80 font-bold text-xl tracking-wider">MODE PENGATURAN POSISI</span>
              </div>
              <p className="text-white/60 text-lg">Tahan dan geser area ini ke posisi yang Anda inginkan.</p>
              
              <div className="mt-6 pt-6 border-t border-white/20">
                <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Pratinjau Batas Teks:</p>
                <div 
                  className={`w-full relative flex flex-col justify-end overflow-hidden transition-all duration-300 ${isBgEnabled ? 'backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-2xl' : 'border-y-2 border-dashed border-blue-400/50'}`}
                  style={{ 
                    height: `${maxHeight}px`,
                    ...(isBgEnabled ? { backgroundColor: `rgba(0, 0, 0, ${bgOpacity / 100})` } : {})
                  }}
                >
                  {!isBgEnabled && <div className="absolute inset-0 bg-blue-400/10 pointer-events-none"></div>}
                  <div className="w-full pb-1">
                    <span 
                      className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                      style={{ fontSize: `${fontSize}px`, color: textColor }}
                    >
                      Ini adalah contoh teks subtitle saat presentasi. {renderHighlightedText("kata_penting")} akan tersorot.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // LIVE MODE
    return (
      <div className="w-screen h-screen flex p-6 relative overflow-hidden">
        {/* Flash Overlay */}
        {flashMessage && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-[fade-in_0.5s_ease-out]">
            <h1 className="text-white text-7xl font-black tracking-widest text-center uppercase drop-shadow-[0_0_50px_rgba(255,255,255,0.8)] animate-pulse">
              {flashMessage}
            </h1>
          </div>
        )}

        {/* Timer Widget */}
        {timerRemaining !== null && timerRemaining > 0 && (
          <div className="absolute top-10 right-10 liquid-glass-dark px-8 py-5 rounded-[2rem] border border-white/20 shadow-2xl flex items-center gap-6 animate-[fade-in_0.5s_ease-out]">
            <div className="w-5 h-5 rounded-full bg-red-500 animate-pulse drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
            <span className="text-white font-mono text-6xl font-black tracking-widest drop-shadow-lg">
              {Math.floor(timerRemaining / 60).toString().padStart(2, '0')}:
              {(timerRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>
        )}

        <div className="w-full flex items-end gap-8">
          <div 
            className={`flex-1 transition-opacity duration-[1500ms] ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'} flex flex-col justify-end overflow-hidden ${isBgEnabled ? 'backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl' : 'pb-4'}`}
            style={{ 
              maxHeight: `${maxHeight}px`,
              ...(isBgEnabled ? { backgroundColor: `rgba(0, 0, 0, ${bgOpacity / 100})` } : {})
            }}
          >
            <div className="w-full">
              <span 
                className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                style={{ fontSize: `${fontSize}px`, color: textColor }}
              >
                {renderHighlightedText(finalTranscript)}
              </span>
              <span 
                className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                style={{ fontSize: `${fontSize}px`, color: textColor }}
              >
                {renderHighlightedText(interimTranscript)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sender UI (Browser)
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-x-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6 relative z-10">
        
        {/* Left Column: Subtitle Display */}
        <div className="liquid-glass rounded-3xl p-8 flex flex-col gap-6 flex-[3]">
          <header className="flex justify-between items-center border-b border-white/10 pb-6">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                SuaraDosen <span className="px-3 py-1 rounded-full liquid-glass-dark text-xs font-medium text-blue-300">Pro</span>
              </h1>
              <p className="text-slate-400 mt-2 text-sm">Dashboard Dosen - Kendalikan Presentasi Anda.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleExportPDF} className="p-3 liquid-glass-dark hover:bg-white/10 text-white rounded-xl transition-all" title="Export PDF">
                <Download size={20} />
              </button>
              <button onClick={handleClear} className="p-3 liquid-glass-dark hover:bg-red-500/20 text-red-300 rounded-xl transition-all" title="Hapus Teks">
                <Trash2 size={20} />
              </button>
            </div>
          </header>

          <main className="flex-1 min-h-[400px] overflow-y-auto pr-2 custom-scrollbar flex flex-col justify-end bg-black/20 rounded-2xl p-6 border border-white/5">
            <div className="w-full">
              <span className="text-2xl text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
                {renderHighlightedText(finalTranscript)}
              </span>
              <span className="text-2xl text-slate-200 font-medium leading-relaxed whitespace-pre-wrap opacity-70">
                {renderHighlightedText(interimTranscript)}
              </span>
              {!finalTranscript && !interimTranscript && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 mt-20">
                  <MicOff size={48} className="opacity-20" />
                  <p>Mulai presentasi dengan menekan tombol mikrofon.</p>
                </div>
              )}
            </div>
          </main>

          <footer className="flex justify-center pt-2">
            <button 
              onClick={toggleListening}
              className={`group relative p-6 rounded-full transition-all duration-300 ${isListening ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110' : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:scale-105'} active:scale-95`}
            >
              {isListening ? <MicOff size={32} className="text-white" /> : <Mic size={32} className="text-white" />}
            </button>
          </footer>
        </div>

        {/* Right Column: Teaching Features & Settings */}
        <div className="flex-[2] flex flex-col gap-6">
          
          {/* Fitur Mengajar */}
          <div className="liquid-glass rounded-3xl p-6 flex flex-col gap-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
              <Zap size={20} className="text-yellow-400" /> Fitur Pengajaran
            </h2>
            
            {/* Auto Highlight */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Type size={16} /> Auto-Highlight Kata Kunci
              </label>
              <input 
                type="text" 
                placeholder="Contoh: ujian, kuis, tugas penting"
                value={keywords}
                onChange={(e) => updateSettings(fontSize, textColor, maxHeight, e.target.value, isBgEnabled, bgOpacity)}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <p className="text-xs text-slate-500">Kata-kata ini akan bercetak tebal kuning otomatis.</p>
            </div>

            {/* Quick Timer */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Clock size={16} /> Quick Timer Layar
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button onClick={() => sendTimer(1)} className="py-2 px-1 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-lg text-sm font-medium transition-colors">1 Min</button>
                <button onClick={() => sendTimer(5)} className="py-2 px-1 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-lg text-sm font-medium transition-colors">5 Min</button>
                <button onClick={() => sendTimer(10)} className="py-2 px-1 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-lg text-sm font-medium transition-colors">10 Min</button>
                <button onClick={() => sendTimer(0)} className="py-2 px-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-lg text-sm font-medium transition-colors">Stop</button>
              </div>
            </div>

            {/* Attention Flash */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <AlertCircle size={16} /> Attention Flash
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => sendFlash("Sesi Tanya Jawab")} className="py-2 px-3 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded-lg text-sm font-medium transition-colors border border-purple-500/30">Tanya Jawab</button>
                <button onClick={() => sendFlash("Waktunya Kuis")} className="py-2 px-3 bg-orange-500/20 hover:bg-orange-500/40 text-orange-300 rounded-lg text-sm font-medium transition-colors border border-orange-500/30">Kuis</button>
                <button onClick={() => sendFlash("Istirahat 10 Menit")} className="py-2 px-3 bg-green-500/20 hover:bg-green-500/40 text-green-300 rounded-lg text-sm font-medium transition-colors border border-green-500/30">Istirahat</button>
                <button onClick={() => sendFlash("Perhatikan!")} className="py-2 px-3 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-lg text-sm font-medium transition-colors border border-red-500/30">Perhatikan!</button>
              </div>
            </div>
          </div>

          {/* Pengaturan Visual */}
          <div className="liquid-glass rounded-3xl p-6 flex flex-col gap-5">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
              <Layers size={20} className="text-blue-400" /> Tampilan Subtitle
            </h2>
            
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Gunakan Background Kaca</label>
              <button 
                onClick={() => updateSettings(fontSize, textColor, maxHeight, keywords, !isBgEnabled, bgOpacity)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isBgEnabled ? 'bg-blue-500' : 'bg-slate-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${isBgEnabled ? 'left-7' : 'left-1'}`}></div>
              </button>
            </div>

            {isBgEnabled && (
              <div className="space-y-1 mt-1">
                <label className="text-xs text-slate-400 flex justify-between">
                  <span>Opasitas Background</span> <span>{bgOpacity}%</span>
                </label>
                <input type="range" min="10" max="100" step="5" value={bgOpacity} onChange={(e) => updateSettings(fontSize, textColor, maxHeight, keywords, isBgEnabled, Number(e.target.value))} className="w-full accent-blue-400" />
              </div>
            )}

            <div className="space-y-1 mt-2">
              <label className="text-xs text-slate-400 flex justify-between">
                <span>Ukuran Teks</span> <span>{fontSize}px</span>
              </label>
              <input type="range" min="12" max="96" value={fontSize} onChange={(e) => updateSettings(Number(e.target.value), textColor, maxHeight, keywords, isBgEnabled, bgOpacity)} className="w-full accent-blue-400" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 flex justify-between">
                <span>Batas Tinggi</span> <span>{maxHeight}px</span>
              </label>
              <input type="range" min="100" max="800" step="50" value={maxHeight} onChange={(e) => updateSettings(fontSize, textColor, Number(e.target.value), keywords, isBgEnabled, bgOpacity)} className="w-full accent-blue-400" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 block mb-2">Warna Teks</label>
              <input type="color" value={textColor} onChange={(e) => updateSettings(fontSize, e.target.value, maxHeight, keywords, isBgEnabled, bgOpacity)} className="w-full h-10 rounded-lg cursor-pointer border-0 p-0 bg-transparent" />
            </div>
          </div>

        </div>
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
