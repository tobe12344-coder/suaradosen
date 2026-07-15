import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Download, Trash2, GripVertical, CheckCircle2, AlertCircle, Clock, Zap, Type, Layers, Send, MessageSquare, KeyRound, Play, Check, PieChart, Volume2, BellRing, User, Pause, RotateCcw, Square } from 'lucide-react';
import jsPDF from 'jspdf';
import { ref, set, onValue, push, update, onDisconnect, remove } from 'firebase/database';
import { database } from './firebase';

function App() {
  const [isReceiver, setIsReceiver] = useState(false);
  const [isTTSMode, setIsTTSMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMicAutoPaused, setIsMicAutoPaused] = useState(false);
  const [isDisplayActive, setIsDisplayActive] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);
  // Firebase integration removed wsRef
  const recognitionRef = useRef<any>(null);
  const ttsStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Session code states
  const [sessionCode, setSessionCode] = useState('');
  const sessionCodeRef = useRef('');
  const [joinedCode, setJoinedCode] = useState('');
  const pendingCodeRef = useRef('');

  // Settings
  const [fontSize, setFontSize] = useState(12);
  const [textColor, setTextColor] = useState('#ffffff');
  const [maxHeight, setMaxHeight] = useState(300);
  
  // New Teaching Features State
  const [keywords, setKeywords] = useState('');
  const [isBgEnabled, setIsBgEnabled] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(70);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

  // MEGA-UPDATE States
  const [studentName, setStudentName] = useState('');
  const [questions, setQuestions] = useState<{ id: string, name: string, text: string, isRead: boolean }[]>([]);
  const [pollState, setPollState] = useState<{ active: boolean, votes: { A: number, B: number, C: number, D: number } }>({ active: false, votes: { A: 0, B: 0, C: 0, D: 0 } });
  
  // Audio playback states
  const [playingQuestionId, setPlayingQuestionId] = useState<string | null>(null);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [karaokeText, setKaraokeText] = useState<{ name: string, text: string, charIndex: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const receiver = params.get('mode') === 'receiver';
    const tts = params.get('mode') === 'tts';
    setIsReceiver(receiver);
    setIsTTSMode(tts);
    
    if (!receiver && !tts) {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      setSessionCode(code);
      sessionCodeRef.current = code;
    }
  }, []);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const playSound = useCallback((type: 'ding' | 'buzzer' | 'chime') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      if (type === 'ding') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);
      } else if (type === 'buzzer') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.4);
      } else if (type === 'chime') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.2); // C#
        oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.4); // E
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime + 0.4);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 1.0);
      }
    } catch (e) {
      console.error('AudioContext error', e);
    }
  }, []);

  const playQuestion = useCallback((text: string, id: string, name: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find(v => v.lang === 'id-ID' || v.lang === 'id_ID' || v.name.includes('Indonesia'));
    if (idVoice) utterance.voice = idVoice;
    
    utterance.onstart = () => {
      if (ttsStopTimeoutRef.current) clearTimeout(ttsStopTimeoutRef.current);
      setPlayingQuestionId(id);
      setIsSpeechPaused(false);
      
      // Auto-Mute Mic
      if (isListeningRef.current) {
        setIsListening(false);
        setIsMicAutoPaused(true);
        recognitionRef.current?.stop();
      }
      
      setKaraokeText({ name, text, charIndex: 0 });
      if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/tts`), { active: true, name, text, charIndex: 0 }); }
    };
    
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setKaraokeText(prev => prev ? { ...prev, charIndex: event.charIndex } : null);
        if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/tts`), { charIndex: event.charIndex }); }
      }
    };
    
    utterance.onend = () => {
      setPlayingQuestionId(null);
      setIsSpeechPaused(false);
      
      ttsStopTimeoutRef.current = setTimeout(() => {
        setKaraokeText(null);
        if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/tts`), { active: false }); }

        // Auto-Resume Mic
        if (isMicAutoPausedRef.current) {
          setIsListening(true);
          setIsMicAutoPaused(false);
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error(e);
          }
        }
      }, 3000);
    };
    utterance.onpause = () => setIsSpeechPaused(true);
    utterance.onresume = () => setIsSpeechPaused(false);
    utterance.onerror = () => {
      if (ttsStopTimeoutRef.current) clearTimeout(ttsStopTimeoutRef.current);
      setPlayingQuestionId(null);
      setIsSpeechPaused(false);
      setKaraokeText(null);
      if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/tts`), { active: false }); }
    };
    
    window.speechSynthesis.speak(utterance);
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, isRead: true } : q));
  }, []);

  const pauseQuestion = useCallback(() => {
    window.speechSynthesis.pause();
  }, []);

  const resumeQuestion = useCallback(() => {
    window.speechSynthesis.resume();
  }, []);

  const stopQuestion = useCallback(() => {
    if (ttsStopTimeoutRef.current) clearTimeout(ttsStopTimeoutRef.current);
    window.speechSynthesis.cancel();
    setPlayingQuestionId(null);
    setIsSpeechPaused(false);
    setKaraokeText(null);
    if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/tts`), { active: false }); }
  }, []);

  const markQuestionRead = useCallback((id: string) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, isRead: true } : q));
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
    setPlayingQuestionId(current => {
      if (current === id) {
        if (ttsStopTimeoutRef.current) clearTimeout(ttsStopTimeoutRef.current);
        window.speechSynthesis.cancel();
        setIsSpeechPaused(false);
        setKaraokeText(null);
        if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/tts`), { active: false }); }
        return null;
      }
      return current;
    });
  }, []);

  
  // Firebase Connection
  useEffect(() => {
    const code = isTTSMode || isReceiver ? sessionCode || joinedCode : sessionCodeRef.current;
    if (!code && !isTTSMode) return;

    const currentCode = isTTSMode ? joinedCode : code;
    if (!currentCode) return;

    const sessionRef = ref(database, `sessions/${currentCode}`);

    // Setup listener
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      if (isReceiver) {
        if (data.transcript) {
          setFinalTranscript(data.transcript.final || '');
          setInterimTranscript(data.transcript.interim || '');
        }
        if (data.settings) {
          if (data.settings.fontSize !== undefined) setFontSize(data.settings.fontSize);
          if (data.settings.textColor !== undefined) setTextColor(data.settings.textColor);
          if (data.settings.maxHeight !== undefined) setMaxHeight(data.settings.maxHeight);
          if (data.settings.keywords !== undefined) setKeywords(data.settings.keywords);
          if (data.settings.isBgEnabled !== undefined) setIsBgEnabled(data.settings.isBgEnabled);
          if (data.settings.bgOpacity !== undefined) setBgOpacity(data.settings.bgOpacity);
        }
        if (data.status) {
          setIsListening(data.status.isListening || false);
          setIsDisplayActive(data.status.isDisplayActive || false);
        }
        if (data.flash) {
          // If new flash, trigger it
          if (data.flash.timestamp > ((window as any).lastFlash || 0)) {
             (window as any).lastFlash = data.flash.timestamp;
             setFlashMessage(data.flash.message);
             setTimeout(() => setFlashMessage(null), 5000);
          }
        }
        if (data.timer) {
           setTimerRemaining(data.timer.duration);
        }
        if (data.poll) {
           if (data.poll.active) {
              setPollState({ active: true, votes: { A: 0, B: 0, C: 0, D: 0 } });
           } else {
              setPollState(prev => ({ ...prev, active: false }));
           }
        }
        if (data.sound) {
           if (data.sound.timestamp > ((window as any).lastSound || 0)) {
             (window as any).lastSound = data.sound.timestamp;
             playSound(data.sound.type);
           }
        }
        if (data.tts) {
           if (data.tts.active) {
             setKaraokeText({ name: data.tts.name, text: data.tts.text, charIndex: data.tts.charIndex });
           } else {
             setKaraokeText(null);
           }
        }
      } else if (isTTSMode) {
        // TTS Mode listener
        if (data.poll) {
          if (data.poll.active) {
             setPollState(prev => ({ ...prev, active: true }));
          } else {
             setPollState(prev => ({ ...prev, active: false }));
          }
        }
      } else if (!isTTSMode && !isReceiver) {
        // Lecturer listener for Poll votes
        if (data.votes) {
          setPollState(prev => ({
             ...prev,
             votes: {
               A: data.votes.A ? Object.keys(data.votes.A).length : 0,
               B: data.votes.B ? Object.keys(data.votes.B).length : 0,
               C: data.votes.C ? Object.keys(data.votes.C).length : 0,
               D: data.votes.D ? Object.keys(data.votes.D).length : 0
             }
          }));
        }
        // Listener for questions
        if (data.questions) {
          const newQuestions = Object.values(data.questions);
          setQuestions(prev => {
             const merged = newQuestions.map((nq: any) => {
                const existing = prev.find(pq => pq.id === nq.id);
                return existing ? { ...nq, isRead: existing.isRead } : { ...nq, isRead: false };
             });
             // Show toast if new question arrived
             if (merged.length > prev.length) {
                // we can't easily showToast here without warning, but we can try
                // showToast("Pesan baru dari " + merged[merged.length-1].name);
             }
             return merged;
          });
        }
      }
    });

    // Initialize session for Lecturer
    if (!isReceiver && !isTTSMode) {
       (window as any).lastFlash = 0;
       (window as any).lastSound = 0;
       set(sessionRef, {
         status: { isListening, isDisplayActive },
         settings: { fontSize, textColor, maxHeight, keywords, isBgEnabled, bgOpacity },
         createdAt: Date.now()
       });
       onDisconnect(sessionRef).remove();
    } else {
       (window as any).lastFlash = Date.now();
       (window as any).lastSound = Date.now();
    }

    return () => {
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReceiver, isTTSMode, joinedCode, sessionCode]);


  // Sender: Send status when isListening changes
  useEffect(() => {
    if (!isReceiver && !isTTSMode && sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/status`), { isListening }); }
  }, [isListening, isReceiver, isTTSMode]);

  // Sender: Send display status when isDisplayActive changes
  useEffect(() => {
    if (!isReceiver && !isTTSMode && sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/status`), { isDisplayActive }); }
  }, [isDisplayActive, isReceiver, isTTSMode]);

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

  const isMicAutoPausedRef = useRef(isMicAutoPaused);
  useEffect(() => {
    isMicAutoPausedRef.current = isMicAutoPaused;
  }, [isMicAutoPaused]);

  // Sender: Web Speech API Setup
  useEffect(() => {
    if (isReceiver || isTTSMode) return;

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
    if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/transcript`), { final, interim }); }
  };

  const toggleListening = () => {
    setIsMicAutoPaused(false);
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
    const doc = new jsPDF();
    doc.setFont("helvetica");
    
    let yPos = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Notulensi Kelas - SuaraKami", 15, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Tanggal: ${new Date().toLocaleString('id-ID')}`, 15, yPos);
    yPos += 15;

    // Transcript
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("1. Transkrip Dosen", 15, yPos);
    yPos += 10;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const text = finalTranscript.trim() || "(Tidak ada transkrip)";
    const splitText = doc.splitTextToSize(text, 180);
    
    // Add page if needed
    for (let i = 0; i < splitText.length; i++) {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(splitText[i], 15, yPos);
      yPos += 7;
    }
    yPos += 10;

    // Q&A
    if (yPos > 260) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("2. Sesi Tanya Jawab (Mahasiswa)", 15, yPos);
    yPos += 10;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    if (questions.length === 0) {
      doc.text("(Tidak ada pertanyaan)", 15, yPos);
      yPos += 10;
    } else {
      questions.forEach((q, idx) => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        doc.setFont("helvetica", "bold");
        doc.text(`Q${idx + 1} - ${q.name}:`, 15, yPos);
        yPos += 7;
        
        doc.setFont("helvetica", "normal");
        const splitQ = doc.splitTextToSize(q.text, 175);
        for (let i = 0; i < splitQ.length; i++) {
          if (yPos > 280) { doc.addPage(); yPos = 20; }
          doc.text(splitQ[i], 20, yPos);
          yPos += 7;
        }
        yPos += 5;
      });
    }

    // Poll Results
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("3. Hasil Polling Kuis", 15, yPos);
    yPos += 10;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const totalVotes = pollState.votes.A + pollState.votes.B + pollState.votes.C + pollState.votes.D;
    if (totalVotes === 0) {
      doc.text("(Belum ada hasil polling)", 15, yPos);
    } else {
      ['A', 'B', 'C', 'D'].forEach(choice => {
        const score = pollState.votes[choice as 'A'|'B'|'C'|'D'];
        const percent = totalVotes === 0 ? 0 : Math.round((score / totalVotes) * 100);
        doc.text(`Opsi ${choice}: ${score} Suara (${percent}%)`, 15, yPos);
        yPos += 7;
      });
    }

    doc.save("SuaraKami-Notulensi.pdf");
    showToast("Notulensi PDF berhasil diunduh!");
  };

  const updateSettings = (size: number, color: string, height: number, kw: string, bg: boolean, op: number) => {
    setFontSize(size);
    setTextColor(color);
    setMaxHeight(height);
    setKeywords(kw);
    setIsBgEnabled(bg);
    setBgOpacity(op);
    if (sessionCodeRef.current) {
      update(ref(database, `sessions/${sessionCodeRef.current}/settings`), {
        fontSize: size, 
        textColor: color, 
        maxHeight: height,
        keywords: kw,
        isBgEnabled: bg,
        bgOpacity: op
      });
    }
  };

  const sendFlash = (message: string) => {
    if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/flash`), { message, timestamp: Date.now() }); }
    showToast(`Peringatan: "${message}" ditampilkan`);
  };

  const sendTimer = (minutes: number) => {
    const duration = minutes * 60;
    if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/timer`), { duration }); }
    if (minutes === 0) {
      showToast("Timer dihentikan");
    } else {
      showToast(`Timer ${minutes} Menit dimulai`);
    }
  };

  // Receiver: Toggle Click-Through based on isDisplayActive
  useEffect(() => {
    if (!isReceiver || typeof (window as any).require === 'undefined') return;
    const { ipcRenderer } = (window as any).require('electron');
    ipcRenderer.send('set-ignore-mouse-events', isDisplayActive);
  }, [isDisplayActive, isReceiver]);

  // Fading logic for Receiver
  const [isFading, setIsFading] = useState(false);
  const [lastClearIndex, setLastClearIndex] = useState(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (finalTranscript.length === 0) {
      setLastClearIndex(0);
    }
  }, [finalTranscript]);

  useEffect(() => {
    if (isReceiver && (finalTranscript || interimTranscript || karaokeText)) {
      setIsFading(false);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      
      if (karaokeText) return;
      
      const fadeTimer = setTimeout(() => {
        setIsFading(true);
        clearTimerRef.current = setTimeout(() => {
          setLastClearIndex(finalTranscript.length);
        }, 1500); // 1500ms transition
      }, 3000);
      
      return () => {
        clearTimeout(fadeTimer);
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      };
    }
  }, [isReceiver, finalTranscript, interimTranscript, karaokeText]);

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

  if (isTTSMode) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="w-full max-w-2xl liquid-glass rounded-3xl p-8 flex flex-col gap-6 relative z-10 shadow-2xl border border-white/5">
          <div className="text-center space-y-2 border-b border-white/10 pb-6">
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center justify-center gap-3">
              <MessageSquare size={32} className="text-blue-400" />
              SuaraKami <span className="px-3 py-1 rounded-full liquid-glass-dark text-xs font-medium text-blue-300">TTS Mode</span>
            </h1>
            {!joinedCode ? (
              <p className="text-slate-400">Masukkan kode sesi dosen untuk bergabung dan mengirim pesan suara.</p>
            ) : (
              <p className="text-slate-400">Ketik pesan Anda di bawah, pesan akan dibacakan di perangkat dosen secara otomatis.</p>
            )}
          </div>

          {!joinedCode ? (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const nameInput = form.elements.namedItem('student_name') as HTMLInputElement;
                const codeInput = form.elements.namedItem('code') as HTMLInputElement;
                const nameVal = nameInput.value.trim() || 'Mahasiswa';
                const code = codeInput.value.trim();
                
                if (code) {
                  setStudentName(nameVal);
                  pendingCodeRef.current = code;
                  // In Firebase, we just read the session to check if it exists.
                  onValue(ref(database, `sessions/${code}/status`), (snapshot) => {
                    if (snapshot.exists()) {
                      setJoinedCode(code);
                      pendingCodeRef.current = '';
                      showToast('Berhasil bergabung ke sesi!');
                    } else {
                      showToast('Kode sesi tidak ditemukan / tidak aktif.', 'error');
                    }
                  }, { onlyOnce: true });
                  
                  setTimeout(() => {
                    if (pendingCodeRef.current === code) {
                      showToast("Kode sesi salah!", "error");
                      pendingCodeRef.current = '';
                    }
                  }, 1500);
                  
                } else if (!code) {
                  showToast("Kode tidak boleh kosong", "error");
                } else {
                  showToast("Gagal mengirim: Belum terhubung ke server. Pastikan aplikasi Dosen sudah dijalankan.", "error");
                }
              }}
              className="flex flex-col gap-4 mt-2"
            >
              <input
                type="text"
                name="student_name"
                placeholder="Nama Anda (Bebas)"
                maxLength={30}
                className="w-full bg-black/30 border border-white/10 rounded-2xl px-6 py-4 text-center text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors text-xl font-medium mb-2"
              />
              <input
                type="text"
                name="code"
                placeholder="Kode 4 Digit (Misal: 1234)"
                maxLength={4}
                className="w-full bg-black/30 border border-white/10 rounded-2xl px-6 py-4 text-center text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors text-2xl font-bold tracking-[0.5em]"
              />
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-[0.98]"
              >
                <KeyRound size={20} /> Bergabung ke Sesi
              </button>
            </form>
          ) : pollState.active ? (
            <div className="flex flex-col gap-4 mt-2">
              <div className="text-center bg-blue-500/20 border border-blue-500/30 rounded-2xl p-4 mb-4">
                <PieChart size={32} className="text-blue-400 mx-auto mb-2 animate-pulse" />
                <h2 className="text-white font-bold text-xl">Kuis Sedang Berlangsung</h2>
                <p className="text-blue-200 text-sm">Pilih jawaban Anda di bawah ini!</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {['A', 'B', 'C', 'D'].map(choice => (
                  <button
                    key={choice}
                    onClick={() => {
                      if (joinedCode) {
                        push(ref(database, `sessions/${joinedCode}/votes/${choice}`), { time: Date.now() });
                        showToast(`Pilihan ${choice} terkirim!`);
                        setPollState(prev => ({ ...prev, active: false })); // Hide poll UI after voting locally
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-black py-8 rounded-2xl text-4xl shadow-xl transition-all active:scale-95 border border-white/10"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const input = form.elements.namedItem('message') as HTMLInputElement;
                const text = input.value.trim();
                if (text && joinedCode) {
                  const newQuestion = { id: Date.now().toString(), name: studentName || 'Mahasiswa', text, timestamp: Date.now() };
                  set(ref(database, `sessions/${joinedCode}/questions/${newQuestion.id}`), newQuestion);
                  showToast("Pesan berhasil dikirim!");
                  input.value = '';
                } else if (!text) {
                  showToast("Pesan tidak boleh kosong", "error");
                } else {
                  showToast("Koneksi terputus, coba lagi", "error");
                }
              }}
              className="flex flex-col gap-4 mt-2"
            >
            <textarea
              name="message"
              rows={4}
              placeholder="Tulis pertanyaan atau tanggapan Anda di sini..."
              className="w-full bg-black/30 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none text-lg shadow-inner custom-scrollbar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            ></textarea>
            
            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-[0.98]"
            >
              <Send size={20} /> Kirim Pesan Suara
            </button>
          </form>
          )}
        </div>

        {/* Toasts for TTS mode */}
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

  if (isReceiver) {
    if (!isDisplayActive) {
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
              
              <div className="mt-4 flex flex-col gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
                 <label className="text-white/80 font-bold text-sm">Masukkan Kode Sesi Dosen (Wajib agar teks muncul):</label>
                 <input 
                   type="text" 
                   maxLength={4}
                   value={sessionCode}
                   onChange={(e) => {
                     const val = e.target.value.replace(/\D/g, '');
                     setSessionCode(val);
                   }}
                   placeholder="Kode 4 digit"
                   className="bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-white text-xl text-center w-full max-w-[200px] focus:border-blue-500 outline-none"
                 />
              </div>

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
              {karaokeText ? (
                <div className="flex flex-col gap-2">
                  <span className="text-blue-400 font-bold text-xl md:text-3xl uppercase tracking-widest drop-shadow-lg animate-[fade-in_0.3s_ease-out]">
                    [Tanya Jawab - {karaokeText.name}]
                  </span>
                  <span 
                    className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                    style={{ fontSize: `${fontSize}px`, color: textColor }}
                  >
                    <span className="text-yellow-400 transition-colors duration-100">{karaokeText.text.substring(0, karaokeText.charIndex)}</span>
                    <span className="text-white transition-colors duration-100">{karaokeText.text.substring(karaokeText.charIndex)}</span>
                  </span>
                </div>
              ) : (
                <>
                  <span 
                    className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                    style={{ fontSize: `${fontSize}px`, color: textColor }}
                  >
                    {renderHighlightedText(finalTranscript.substring(lastClearIndex))}
                  </span>
                  <span 
                    className="font-semibold text-glow whitespace-pre-wrap leading-tight drop-shadow-2xl"
                    style={{ fontSize: `${fontSize}px`, color: textColor }}
                  >
                    {renderHighlightedText(interimTranscript)}
                  </span>
                </>
              )}
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
                SuaraKami <span className="px-3 py-1 rounded-full liquid-glass-dark text-xs font-medium text-blue-300">Pro</span>
              </h1>
              <p className="text-slate-400 mt-2 text-sm">Dashboard Pengajar - Kendalikan Presentasi Anda.</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="liquid-glass-dark px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Kode Sesi</span>
                <span className="text-2xl font-black text-blue-400 tracking-widest">{sessionCode}</span>
              </div>
              <div className="flex gap-3">
              <button onClick={() => window.open('?mode=tts', '_blank')} className="p-3 liquid-glass-dark hover:bg-blue-500/20 text-blue-300 rounded-xl transition-all" title="Buka Mode Mahasiswa (TTS)">
                <MessageSquare size={20} />
              </button>
              <button onClick={handleExportPDF} className="p-3 liquid-glass-dark hover:bg-white/10 text-white rounded-xl transition-all" title="Export PDF">
                <Download size={20} />
              </button>
              <button onClick={handleClear} className="p-3 liquid-glass-dark hover:bg-red-500/20 text-red-300 rounded-xl transition-all" title="Hapus Teks">
                <Trash2 size={20} />
              </button>
            </div>
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
              className={`flex items-center gap-3 px-8 py-6 rounded-2xl text-xl font-bold transition-all shadow-xl active:scale-[0.98] border border-white/10 ${
                isListening ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 
                isMicAutoPaused ? 'bg-yellow-500/80 hover:bg-yellow-600 text-white cursor-wait' :
                'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]'
              }`}
            >
              {isListening ? (
                <><MicOff size={28} /> Hentikan Mikrofon</>
              ) : isMicAutoPaused ? (
                <><Mic size={28} /> Menjeda untuk Q&A...</>
              ) : (
                <><Mic size={28} /> Mulai Mikrofon</>
              )}
            </button>
          </footer>
        </div>

        {/* Right Column: Teaching Features & Settings */}
        <div className="flex-[2] flex flex-col gap-6 h-[80vh] overflow-y-auto custom-scrollbar pr-2">
          
          {/* Antrean Pertanyaan */}
          <div className="liquid-glass rounded-3xl p-6 flex flex-col gap-4 max-h-[350px] flex-shrink-0">
            <h2 className="text-xl font-bold text-white flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2"><MessageSquare size={20} className="text-blue-400" /> Antrean Q&A</div>
              <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full">{questions.filter(q => !q.isRead).length} Baru</span>
            </h2>
            <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2 h-full">
              {questions.length === 0 ? (
                <p className="text-center text-slate-500 my-4 text-sm">Belum ada pertanyaan masuk.</p>
              ) : (
                questions.map(q => (
                  <div key={q.id} className={`p-4 rounded-2xl border transition-all ${q.isRead ? 'bg-white/5 border-white/5 opacity-60' : 'bg-blue-500/10 border-blue-500/30'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-white text-sm flex items-center gap-2"><User size={14} className="text-blue-400"/> {q.name}</span>
                      <div className="flex gap-2">
                        {playingQuestionId === q.id ? (
                          <>
                            {!isSpeechPaused ? (
                              <button onClick={pauseQuestion} className="p-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors" title="Jeda">
                                <Pause size={14} />
                              </button>
                            ) : (
                              <button onClick={resumeQuestion} className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors" title="Lanjutkan">
                                <Play size={14} />
                              </button>
                            )}
                            <button onClick={() => playQuestion(q.text, q.id, q.name)} className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors" title="Putar Ulang">
                              <RotateCcw size={14} />
                            </button>
                            <button onClick={stopQuestion} className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors" title="Berhenti">
                              <Square size={14} />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => playQuestion(q.text, q.id, q.name)} className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors" title={q.isRead ? "Putar Ulang" : "Putar Suara"}>
                            <Play size={14} />
                          </button>
                        )}
                        <button onClick={() => markQuestionRead(q.id)} className="p-1.5 bg-slate-700 hover:bg-green-600 text-white rounded-lg transition-colors" title="Tandai Selesai">
                          <Check size={14} />
                        </button>
                        <button onClick={() => deleteQuestion(q.id)} className="p-1.5 bg-slate-700 hover:bg-red-600 text-white rounded-lg transition-colors" title="Hapus">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed">{q.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live Polling */}
          <div className="liquid-glass rounded-3xl p-6 flex flex-col gap-4 flex-shrink-0">
            <h2 className="text-xl font-bold text-white flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2"><PieChart size={20} className="text-orange-400" /> Live Polling</div>
              <button 
                onClick={() => {
                  if (sessionCodeRef.current) {
                    if (pollState.active) {
                      update(ref(database, `sessions/${sessionCodeRef.current}/poll`), { active: false });
                      setPollState(prev => ({ ...prev, active: false }));
                    } else {
                      if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/poll`), { active: true }); remove(ref(database, `sessions/${sessionCodeRef.current}/votes`)); }
                      setPollState({ active: true, votes: { A: 0, B: 0, C: 0, D: 0 } });
                    }
                  }
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${pollState.active ? 'bg-red-500/20 text-red-300 hover:bg-red-500/40' : 'bg-green-500/20 text-green-300 hover:bg-green-500/40'}`}
              >
                {pollState.active ? 'Hentikan Kuis' : 'Mulai Kuis A/B/C/D'}
              </button>
            </h2>
            
            <div className="flex flex-col gap-3">
              {['A', 'B', 'C', 'D'].map(choice => {
                const total = pollState.votes.A + pollState.votes.B + pollState.votes.C + pollState.votes.D;
                const score = pollState.votes[choice as 'A'|'B'|'C'|'D'];
                const percent = total === 0 ? 0 : Math.round((score / total) * 100);
                return (
                  <div key={choice} className="relative w-full bg-black/30 h-10 rounded-xl overflow-hidden flex items-center px-4 border border-white/5">
                    <div className="absolute top-0 left-0 h-full bg-orange-500/40 transition-all duration-500 ease-out" style={{ width: `${percent}%` }}></div>
                    <div className="relative z-10 flex justify-between w-full text-sm font-bold">
                      <span className="text-white">Opsi {choice}</span>
                      <span className="text-orange-300">{score} Suara ({percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Soundboard */}
          <div className="liquid-glass rounded-3xl p-6 flex flex-col gap-4 flex-shrink-0">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-white/10 pb-4">
              <Volume2 size={20} className="text-pink-400" /> Soundboard Interaktif
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={() => {
                  playSound('ding');
                  if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/sound`), { type: 'ding', timestamp: Date.now() }); }
                }} 
                className="py-4 bg-black/30 hover:bg-pink-500/20 border border-white/5 hover:border-pink-500/30 rounded-2xl flex flex-col items-center gap-2 transition-all group"
              >
                <CheckCircle2 size={24} className="text-green-400 group-active:scale-90 transition-transform" />
                <span className="text-xs font-bold text-slate-300">Benar (Ding)</span>
              </button>
              
              <button 
                onClick={() => {
                  playSound('buzzer');
                  if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/sound`), { type: 'buzzer', timestamp: Date.now() }); }
                }} 
                className="py-4 bg-black/30 hover:bg-pink-500/20 border border-white/5 hover:border-pink-500/30 rounded-2xl flex flex-col items-center gap-2 transition-all group"
              >
                <AlertCircle size={24} className="text-red-400 group-active:scale-90 transition-transform" />
                <span className="text-xs font-bold text-slate-300">Salah (Buzzer)</span>
              </button>
              
              <button 
                onClick={() => {
                  playSound('chime');
                  if (sessionCodeRef.current) { update(ref(database, `sessions/${sessionCodeRef.current}/sound`), { type: 'chime', timestamp: Date.now() }); }
                }} 
                className="py-4 bg-black/30 hover:bg-pink-500/20 border border-white/5 hover:border-pink-500/30 rounded-2xl flex flex-col items-center gap-2 transition-all group"
              >
                <BellRing size={24} className="text-blue-400 group-active:scale-90 transition-transform" />
                <span className="text-xs font-bold text-slate-300">Info (Chime)</span>
              </button>
            </div>
          </div>
          
          {/* Fitur Mengajar */}
          <div className="liquid-glass rounded-3xl p-6 flex flex-col gap-6 flex-shrink-0">
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
            
            <button 
              onClick={() => setIsDisplayActive(!isDisplayActive)}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all shadow-lg active:scale-[0.98] border border-white/10 ${
                isDisplayActive ? 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.3)]' : 
                'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              <Type size={20} />
              {isDisplayActive ? 'Layar Subtitle Sedang Aktif' : 'Tampilkan Layar Subtitle'}
            </button>
            
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
