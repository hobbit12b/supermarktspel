
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ShoppingBasket, Camera, Trash2, CheckCircle, 
  Settings, Plus, Barcode as BarcodeIcon, ArrowLeft, 
  Loader2, X, RefreshCw, Printer, ShoppingBag
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Geluid Effect ---
const playBleep = () => {
  try {
    // Cast window to any to avoid TypeScript errors with webkitAudioContext
    const audioCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) { console.log("Audio not supported yet"); }
};

// --- Barcode Component ---
const BarcodeTag = ({ value, name }) => {
  const svgRef = useRef(null);
  useEffect(() => {
    // Cast window to any to access JsBarcode which is loaded externally
    if (svgRef.current && (window as any).JsBarcode) {
      (window as any).JsBarcode(svgRef.current, value, {
        format: "CODE128", width: 2, height: 50, displayValue: true, fontSize: 14
      });
    }
  }, [value]);

  return (
    <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 flex flex-col items-center shadow-sm">
      <p className="font-bold text-slate-800 text-lg mb-1">{name}</p>
      <svg ref={svgRef} className="max-w-full h-auto"></svg>
    </div>
  );
};

// --- App Component ---
const App = () => {
  const [view, setView] = useState('HOME'); // HOME, SETTINGS, BARCODES, CHECKOUT
  const [cart, setCart] = useState([]);
  const [catalog, setCatalog] = useState(() => {
    const saved = localStorage.getItem('school_market_v3');
    return saved ? JSON.parse(saved) : [
      { barcode: '1001', name: 'Appel', price: 1 },
      { barcode: '1002', name: 'Banaan', price: 1 },
      { barcode: '1003', name: 'Melk', price: 2 },
      { barcode: '1004', name: 'Brood', price: 2 }
    ];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [lastItem, setLastItem] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState(1);
  const [cameraActive, setCameraActive] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const startCamera = async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error(err);
      alert("Oeps! De camera doet het niet. Heb je toestemming gegeven?");
    }
  };

  useEffect(() => {
    if (view === 'HOME') startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [view]);

  useEffect(() => {
    localStorage.setItem('school_market_v3', JSON.stringify(catalog));
  }, [catalog]);

  const handleScan = async () => {
    if (!videoRef.current || isScanning) return;
    setIsScanning(true);
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 300);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const catalogStr = catalog.map(p => `${p.name} (€${p.price})`).join(", ");
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: `Je bent een kassa. Welk speelgoed-eten zie je? Kies de beste uit deze lijst: ${catalogStr}. Geef alleen JSON: {"name": "productnaam", "price": 1}` }
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
    } catch (err) {
      console.error(err);
      setIsScanning(false);
    }
  };

  if (view === 'SETTINGS') return (
    <div className="h-screen flex flex-col p-4 overflow-y-auto bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setView('HOME')} className="bg-white p-4 rounded-3xl shadow-sm text-sky-500 active:scale-90"><ArrowLeft size={28}/></button>
        <h2 className="text-2xl font-bold text-slate-800">Winkelbeheer</h2>
        <button onClick={() => setView('BARCODES')} className="bg-sky-500 text-white p-4 rounded-3xl shadow-lg active:scale-90"><BarcodeIcon size={28}/></button>
      </div>
      
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm mb-6 border-4 border-white">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Plus /> Product Toevoegen</h3>
        <input 
          className="w-full p-4 rounded-2xl border-2 border-slate-100 mb-4 text-xl outline-none focus:border-sky-300" 
          placeholder="Naam van het eten..." 
          value={newName} 
          onChange={e => setNewName(e.target.value)} 
        />
        <div className="flex gap-3">
          {[1, 2].map(p => (
            <button key={p} onClick={() => setNewPrice(p)} className={`flex-1 py-4 rounded-2xl font-bold text-xl border-4 transition-all ${newPrice === p ? 'bg-sky-500 border-sky-500 text-white' : 'bg-white border-slate-50 text-slate-300'}`}>€{p}</button>
          ))}
          <button 
            onClick={() => { if(!newName) return; setCatalog([...catalog, { barcode: (1000 + catalog.length + 1).toString(), name: newName, price: newPrice }]); setNewName(''); }} 
            className="bg-emerald-500 text-white px-8 rounded-2xl font-bold text-xl shadow-lg active:scale-95"
          >HUP!</button>
        </div>
      </div>

      <div className="space-y-3 pb-24">
        {catalog.map(item => (
          <div key={item.barcode} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
            <div>
              <p className="font-bold text-slate-800 text-xl">{item.name}</p>
              <p className="text-sm text-slate-400">Code: {item.barcode}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-bold text-emerald-500 text-2xl">€{item.price}</span>
              <button onClick={() => setCatalog(catalog.filter(c => c.barcode !== item.barcode))} className="text-rose-200 hover:text-rose-500 transition-colors"><Trash2 size={24}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (view === 'BARCODES') return (
    <div className="min-h-screen p-6 bg-slate-50 overflow-y-auto flex flex-col items-center">
      <div className="w-full flex justify-between mb-8 max-w-md no-print">
        <button onClick={() => setView('SETTINGS')} className="bg-white p-4 rounded-3xl text-sky-500 shadow-sm"><ArrowLeft size={32}/></button>
        <button onClick={() => window.print()} className="bg-slate-800 text-white px-8 rounded-3xl font-bold flex items-center gap-3 shadow-xl active:scale-95"><Printer /> Printen</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl pb-20">
        {catalog.map(item => <BarcodeTag key={item.barcode} value={item.barcode} name={item.name} />)}
      </div>
    </div>
  );

  if (view === 'CHECKOUT') return (
    <div className="h-screen bg-emerald-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl text-center w-full max-w-sm border-[12px] border-emerald-100 animate-in zoom-in-95 duration-300">
        <CheckCircle size={100} className="text-emerald-500 mx-auto mb-6 animate-bounce" />
        <h1 className="text-4xl font-bold text-slate-800">Bedankt!</h1>
        <p className="text-slate-400 font-bold mt-4 uppercase tracking-widest text-sm">Totaal bedrag</p>
        <p className="text-9xl font-black text-emerald-500 my-8">€{total}</p>
        <button onClick={() => { setCart([]); setView('HOME'); }} className="w-full bg-emerald-500 text-white py-8 rounded-[2.5rem] font-bold text-3xl shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-all">
          <RefreshCw size={32} /> Volgende!
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <header className="bg-white px-6 py-4 shadow-sm flex items-center justify-between border-b-4 border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-sky-500 p-2.5 rounded-2xl text-white shadow-inner"><ShoppingBasket size={28} /></div>
          <span className="font-bold text-slate-800 text-2xl tracking-tight">Mijn Winkel</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-50 px-6 py-2 rounded-2xl border-2 border-slate-100 font-bold text-sky-600 text-4xl">€{total}</div>
          <button onClick={() => setView('SETTINGS')} className="text-slate-200 hover:text-sky-400 transition-colors p-2"><Settings size={32} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
        {/* Camera Sectie */}
        <div className="h-[45%] bg-slate-900 rounded-[3rem] relative overflow-hidden shadow-2xl border-4 border-white shrink-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="scan-line"></div>
          {isFlashing && <div className="absolute inset-0 flash z-10"></div>}

          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-800/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
              <button onClick={startCamera} className="bg-white text-slate-900 px-10 py-5 rounded-3xl font-bold text-2xl shadow-2xl active:scale-95">CAMERA AAN 🎥</button>
            </div>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <button 
              onClick={handleScan} 
              disabled={isScanning || !cameraActive} 
              className={`w-28 h-28 rounded-full border-[10px] border-white shadow-2xl flex items-center justify-center transition-all ${isScanning ? 'bg-sky-400 scale-90' : 'bg-emerald-500 active:scale-75'}`}
            >
              {isScanning ? <Loader2 className="text-white animate-spin" size={40} /> : <Camera className="text-white" size={48} />}
            </button>
          </div>

          {lastItem && (
            <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-30 animate-in zoom-in-95">
              <div className="bg-white p-6 rounded-[3rem] shadow-2xl flex flex-col items-center gap-4 border-[10px] border-sky-50 min-w-[240px]">
                <img src={lastItem.img} className="w-32 h-32 rounded-3xl object-cover border-4 border-white shadow-md" />
                <div className="text-center">
                  <p className="font-bold text-slate-800 text-2xl">{lastItem.name}</p>
                  <p className="text-7xl font-black text-sky-500">€{lastItem.price}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mandje Sectie */}
        <div className="flex-1 bg-white rounded-[3rem] shadow-xl flex flex-col overflow-hidden border-2 border-slate-100">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-100 gap-6 opacity-60">
                <ShoppingBag size={100} />
                <p className="font-bold text-2xl">Mandje is nog leeg!</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center gap-5 p-3 bg-slate-50/50 rounded-[2rem] border-2 border-slate-50 animate-in slide-in-from-right-4">
                  <img src={item.img} className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-sm" />
                  <div className="flex-1 font-bold text-slate-800 text-xl truncate">{item.name}</div>
                  <div className="font-black text-sky-500 text-4xl pr-2">€{item.price}</div>
                  <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-slate-200 hover:text-rose-400 transition-colors p-2"><X size={32}/></button>
                </div>
              ))
            )}
          </div>
          <div className="p-5 bg-slate-50 border-t-2 border-slate-100 shrink-0">
            <button 
              onClick={() => setView('CHECKOUT')} 
              disabled={cart.length === 0} 
              className={`w-full py-7 rounded-[2.5rem] font-bold text-4xl shadow-xl flex items-center justify-center gap-5 transition-all active:scale-95 ${cart.length === 0 ? 'bg-slate-200 text-slate-400' : 'bg-sky-500 text-white'}`}
            >
              <CheckCircle size={44} /> KLAAR!
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
