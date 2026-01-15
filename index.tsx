
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ShoppingBasket, Camera, Trash2, CheckCircle, 
  Settings, Plus, Barcode as BarcodeIcon, ArrowLeft, 
  Loader2, X, RefreshCw, Printer, ShoppingBag
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Geluid ---
const playBleep = () => {
  try {
    // Fix: cast window to any to access webkitAudioContext which might not be in standard types
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) { console.error("Audio error", e); }
};

// --- Barcode component ---
const BarcodeTag = ({ value, name }) => {
  const svgRef = useRef(null);
  useEffect(() => {
    // Fix: cast window to any to access JsBarcode which is loaded via external script
    if (svgRef.current && (window as any).JsBarcode) {
      (window as any).JsBarcode(svgRef.current, value, {
        format: "CODE128", width: 2, height: 50, displayValue: true, fontSize: 14
      });
    }
  }, [value]);

  return (
    <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 flex flex-col items-center shadow-sm">
      <p className="font-bold text-slate-800 text-lg mb-1">{name}</p>
      <svg ref={svgRef}></svg>
    </div>
  );
};

// --- De App ---
const App = () => {
  const [view, setView] = useState('HOME'); // HOME, SETTINGS, BARCODES, CHECKOUT
  const [cart, setCart] = useState([]);
  const [catalog, setCatalog] = useState(() => {
    const saved = localStorage.getItem('kassa_v4');
    return saved ? JSON.parse(saved) : [
      { barcode: '1001', name: 'Appel', price: 1 },
      { barcode: '1002', name: 'Banaan', price: 1 },
      { barcode: '1003', name: 'Melk', price: 2 }
    ];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [lastItem, setLastItem] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState(1);
  const [cameraOn, setCameraOn] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const startCamera = async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraOn(true);
      }
    } catch (err) {
      alert("Camera toegang nodig!");
    }
  };

  useEffect(() => {
    if (view === 'HOME') startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [view]);

  useEffect(() => {
    localStorage.setItem('kassa_v4', JSON.stringify(catalog));
  }, [catalog]);

  const scan = async () => {
    if (!videoRef.current || isScanning) return;
    setIsScanning(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Lijst: ${catalog.map(p => p.name).join(", ")}. Wat zie je? Geef JSON: {"name": "naam", "price": 1}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            { text: prompt }
          ]
        },
        config: { responseMimeType: "application/json" }
      });

      const res = JSON.parse(response.text || '{"name": "Iets lekkers", "price": 1}');
      const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: res.name,
        price: res.price,
        img: canvas.toDataURL('image/jpeg', 0.2)
      };

      playBleep();
      setCart([newItem, ...cart]);
      setLastItem(newItem);
      setTimeout(() => { setLastItem(null); setIsScanning(false); }, 2000);
    } catch (e) {
      setIsScanning(false);
    }
  };

  if (view === 'SETTINGS') return (
    <div className="min-h-screen p-4 bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setView('HOME')} className="bg-white p-4 rounded-3xl shadow text-sky-500"><ArrowLeft/></button>
        <h2 className="text-xl font-bold">Winkel Instellingen</h2>
        <button onClick={() => setView('BARCODES')} className="bg-sky-500 text-white p-4 rounded-3xl shadow"><BarcodeIcon/></button>
      </div>
      <div className="bg-white p-6 rounded-[2rem] shadow-sm mb-6">
        <input className="w-full p-4 rounded-2xl border-2 border-slate-100 mb-4 text-lg" placeholder="Naam..." value={newName} onChange={e => setNewName(e.target.value)} />
        <div className="flex gap-2">
          {[1, 2].map(p => (
            <button key={p} onClick={() => setNewPrice(p)} className={`flex-1 py-4 rounded-2xl font-bold ${newPrice === p ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-400'}`}>€{p}</button>
          ))}
          <button onClick={() => { if(!newName) return; setCatalog([...catalog, { barcode: (1000+catalog.length).toString(), name: newName, price: newPrice }]); setNewName(''); }} className="bg-emerald-500 text-white px-6 rounded-2xl font-bold">OK</button>
        </div>
      </div>
      <div className="space-y-2">
        {catalog.map(item => (
          <div key={item.barcode} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
            <span className="font-bold">{item.name}</span>
            <div className="flex items-center gap-4">
              <span className="font-bold text-emerald-500">€{item.price}</span>
              <button onClick={() => setCatalog(catalog.filter(c => c.barcode !== item.barcode))} className="text-rose-200"><Trash2/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (view === 'BARCODES') return (
    <div className="p-6 bg-white min-h-screen flex flex-col items-center">
      <div className="w-full flex justify-between mb-8 max-w-md no-print">
        <button onClick={() => setView('SETTINGS')} className="p-4 rounded-2xl bg-slate-100 text-sky-500"><ArrowLeft/></button>
        <button onClick={() => window.print()} className="bg-slate-800 text-white px-8 rounded-2xl font-bold flex items-center gap-2"><Printer/> Print</button>
      </div>
      <div className="grid grid-cols-1 gap-4 w-full max-w-md">
        {catalog.map(item => <BarcodeTag key={item.barcode} value={item.barcode} name={item.name} />)}
      </div>
    </div>
  );

  if (view === 'CHECKOUT') return (
    <div className="h-screen bg-emerald-50 flex items-center justify-center p-6 text-center">
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl w-full max-w-sm border-[10px] border-emerald-100">
        <CheckCircle size={80} className="text-emerald-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold">Bedankt!</h1>
        <p className="text-8xl font-black text-emerald-500 my-8">€{total}</p>
        <button onClick={() => { setCart([]); setView('HOME'); }} className="w-full bg-emerald-500 text-white py-6 rounded-3xl font-bold text-2xl shadow-lg flex items-center justify-center gap-2">
          <RefreshCw/> Volgende!
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <header className="bg-white p-4 shadow-sm flex items-center justify-between border-b-4 border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-sky-500 p-2 rounded-xl text-white"><ShoppingBasket size={24} /></div>
          <span className="font-bold text-xl">Kassa</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 px-5 py-2 rounded-xl border-2 border-slate-100 font-bold text-sky-600 text-3xl">€{total}</div>
          <button onClick={() => setView('SETTINGS')} className="text-slate-200"><Settings size={28} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
        <div className="h-[45%] bg-slate-900 rounded-[3rem] relative overflow-hidden shadow-inner border-4 border-white shrink-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="scan-line"></div>
          
          {!cameraOn && (
            <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
              <button onClick={startCamera} className="bg-white text-slate-900 px-8 py-4 rounded-3xl font-bold">START CAMERA</button>
            </div>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <button onClick={scan} disabled={isScanning || !cameraOn} className={`w-24 h-24 rounded-full border-8 border-white shadow-2xl flex items-center justify-center transition-all ${isScanning ? 'bg-sky-400 scale-90' : 'bg-emerald-500 active:scale-75'}`}>
              {isScanning ? <Loader2 className="text-white animate-spin" size={32} /> : <Camera className="text-white" size={40} />}
            </button>
          </div>

          {lastItem && (
            <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-30">
              <div className="bg-white p-6 rounded-[3rem] shadow-2xl flex flex-col items-center gap-3 border-8 border-sky-100">
                <img src={lastItem.img} className="w-28 h-28 rounded-2xl object-cover shadow" />
                <div className="text-center">
                  <p className="font-bold text-xl">{lastItem.name}</p>
                  <p className="text-6xl font-black text-sky-500">€{lastItem.price}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white rounded-[3rem] shadow flex flex-col overflow-hidden border-2 border-slate-100">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-200 gap-4 opacity-50">
                <ShoppingBag size={64} />
                <p className="font-bold">Mandje is leeg</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center gap-4 p-2 bg-slate-50/50 rounded-2xl border-2 border-slate-50">
                  <img src={item.img} className="w-16 h-16 rounded-xl object-cover border-2 border-white" />
                  <div className="flex-1 font-bold text-lg truncate">{item.name}</div>
                  <div className="font-black text-sky-500 text-3xl pr-2">€{item.price}</div>
                  <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-slate-200"><X/></button>
                </div>
              ))
            )}
          </div>
          <div className="p-4 bg-slate-50 border-t-2 border-slate-100">
            <button onClick={() => setView('CHECKOUT')} disabled={cart.length === 0} className={`w-full py-6 rounded-[2rem] font-bold text-3xl shadow-lg transition-all ${cart.length === 0 ? 'bg-slate-200 text-slate-400' : 'bg-sky-500 text-white active:scale-95'}`}>
              KLAAR!
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
