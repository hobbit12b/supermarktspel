
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ShoppingBasket, Camera, Trash2, CheckCircle, 
  Settings, Plus, Barcode as BarcodeIcon, ArrowLeft, 
  Loader2, Printer, X, RefreshCw
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- AI SCANNER LOGICA (Direct in dit bestand) ---
async function identifyProduct(base64Image, catalog) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const catalogList = catalog.map(p => `- Code ${p.barcode}: ${p.name} (€${p.price})`).join("\n");
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: `Je bent de kassa van een kleuterklas. Match de foto aan de prijslijst:
          ${catalogList}
          Antwoord uitsluitend in JSON: {"name": "Naam", "price": 1, "found": true}` }
        ],
      },
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '{"name": "Product", "price": 1}');
  } catch (e) {
    return { name: "Iets lekkers", price: 1, found: false };
  }
}

// --- BARCODE COMPONENT ---
const BarcodeImage = ({ value, name }) => {
  const svgRef = useRef(null);
  useEffect(() => {
    // Gebruik window['JsBarcode'] om TypeScript errors te voorkomen
    // Fix: Access JsBarcode via (window as any) to resolve TypeScript error on Window object
    if (svgRef.current && (window as any).JsBarcode) {
      (window as any).JsBarcode(svgRef.current, value, {
        format: "CODE128", width: 2, height: 60, displayValue: true, fontSize: 16
      });
    }
  }, [value]);

  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-md border-2 border-sky-100 flex flex-col items-center gap-2">
      <p className="font-bold text-sky-900 text-lg">{name}</p>
      <svg ref={svgRef} className="max-w-full h-auto"></svg>
    </div>
  );
};

// --- HOOFD APP ---
const App = () => {
  const [view, setView] = useState('HOME'); 
  const [cart, setCart] = useState([]);
  const [catalog, setCatalog] = useState(() => {
    const saved = localStorage.getItem('supermarket_catalog');
    return saved ? JSON.parse(saved) : [
      { barcode: '1001', name: 'Appel', price: 1 },
      { barcode: '1002', name: 'Banaan', price: 1 },
      { barcode: '1003', name: 'Melk', price: 2 }
    ];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState(1);
  const [cameraStatus, setCameraStatus] = useState('idle');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const totalPrice = cart.reduce((sum, item) => sum + item.price, 0);

  const startCamera = async () => {
    setCameraStatus('loading');
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraStatus('active');
      }
    } catch (err) {
      setCameraStatus('error');
    }
  };

  useEffect(() => {
    if (view === 'HOME') startCamera();
    return () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [view]);

  useEffect(() => {
    localStorage.setItem('supermarket_catalog', JSON.stringify(catalog));
  }, [catalog]);

  const capture = async () => {
    if (!videoRef.current || isScanning) return;
    setIsScanning(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

    try {
      const result = await identifyProduct(base64Data, catalog);
      const newProduct = {
        id: Math.random().toString(36).substr(2, 9),
        name: result.name,
        price: result.price,
        imageUrl: canvas.toDataURL('image/jpeg', 0.2)
      };

      setCart(prev => [newProduct, ...prev]);
      setLastScanned(newProduct);
      
      // Bleep geluid
      try {
        // Fix: Use type assertion to access webkitAudioContext which is non-standard on Window type
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.1;
        osc.start();
        setTimeout(() => osc.stop(), 100);
      } catch(e) {}

      setTimeout(() => { setLastScanned(null); setIsScanning(false); }, 2000);
    } catch (err) {
      setIsScanning(false);
    }
  };

  if (view === 'SETTINGS') return (
    <div className="h-screen bg-sky-50 flex flex-col p-4 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setView('HOME')} className="bg-white p-3 rounded-2xl shadow-sm text-sky-600"><ArrowLeft /></button>
        <h2 className="text-2xl font-bold text-sky-900">Juf/Meester Menu</h2>
        <div className="w-10"></div>
      </div>
      <div className="bg-white p-6 rounded-[2rem] shadow-md mb-6 border-2 border-white">
        <h3 className="font-bold text-sky-800 mb-4 flex items-center gap-2"><Plus size={20}/> Product Toevoegen</h3>
        <input className="w-full p-4 rounded-xl border-2 border-sky-50 mb-3 text-lg outline-none" placeholder="Naam..." value={newProductName} onChange={e => setNewProductName(e.target.value)} />
        <div className="flex gap-2">
          {[1, 2].map(p => (
            <button key={p} onClick={() => setNewProductPrice(p)} className={`flex-1 py-3 rounded-xl font-bold border-2 ${newProductPrice === p ? 'bg-sky-500 border-sky-500 text-white' : 'bg-white border-sky-50 text-sky-300'}`}>€{p}</button>
          ))}
          <button onClick={() => { if(!newProductName) return; setCatalog([...catalog, { barcode: (1000 + catalog.length + 1).toString(), name: newProductName, price: newProductPrice }]); setNewProductName(''); }} className="bg-green-500 text-white px-6 rounded-xl font-bold">OK</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 mb-20">
        {catalog.map(item => (
          <div key={item.barcode} className="relative">
            <BarcodeImage value={item.barcode} name={item.name} />
            <button onClick={() => setCatalog(catalog.filter(c => c.barcode !== item.barcode))} className="absolute top-4 right-4 text-red-200"><Trash2 size={24}/></button>
          </div>
        ))}
        <button onClick={() => window.print()} className="w-full bg-sky-900 text-white py-6 rounded-3xl font-bold text-xl flex items-center justify-center gap-3 no-print shadow-xl"><Printer /> Print Barcodes</button>
      </div>
    </div>
  );

  if (view === 'CHECKOUT') return (
    <div className="h-screen bg-green-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 shadow-2xl text-center w-full max-w-sm bounce-in border-8 border-green-100">
        <CheckCircle size={80} className="text-green-500 mx-auto mb-4 animate-bounce" />
        <h1 className="text-3xl font-bold text-green-800">Bedankt!</h1>
        <p className="text-8xl font-black text-green-500 my-6 tracking-tighter">€{totalPrice}</p>
        <button onClick={() => { setCart([]); setView('HOME'); }} className="w-full bg-green-500 text-white py-6 rounded-3xl font-bold text-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95">
          <RefreshCw /> Volgende!
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-sky-50 overflow-hidden">
      <header className="bg-white px-5 py-3 shadow-sm flex items-center justify-between border-b-2 border-sky-50">
        <div className="flex items-center gap-2">
          <ShoppingBasket className="text-sky-500" />
          <span className="font-bold text-sky-900 text-xl">De Klas Winkel</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-sky-50 px-4 py-1 rounded-xl border-2 border-sky-100 font-bold text-sky-600 text-2xl tracking-tighter">€{totalPrice}</div>
          <button onClick={() => setView('SETTINGS')} className="text-sky-200 p-2"><Settings size={28} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden p-2 gap-2">
        <div className="h-[45%] bg-black rounded-[2.5rem] relative overflow-hidden shadow-lg border-4 border-white shrink-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="scan-line"></div>

          {cameraStatus !== 'active' && (
            <div className="absolute inset-0 bg-sky-900/60 backdrop-blur-md flex items-center justify-center z-10">
              <button onClick={startCamera} className="bg-white text-sky-900 px-10 py-5 rounded-3xl font-bold text-2xl shadow-2xl active:scale-95">START KASSA 🎥</button>
            </div>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <button onClick={capture} disabled={isScanning || cameraStatus !== 'active'} className={`w-24 h-24 rounded-full border-[6px] border-white shadow-2xl flex items-center justify-center transition-all ${isScanning ? 'bg-sky-400' : 'bg-green-500 active:scale-75'}`}>
              {isScanning ? <Loader2 className="text-white animate-spin" size={32} /> : <Camera className="text-white" size={40} />}
            </button>
          </div>

          {lastScanned && (
            <div className="absolute inset-0 bg-sky-900/80 backdrop-blur-md flex items-center justify-center z-30">
              <div className="bg-white p-8 rounded-[3rem] shadow-2xl flex flex-col items-center gap-4 bounce-in border-4 border-sky-100">
                <img src={lastScanned.imageUrl} className="w-32 h-32 rounded-3xl object-cover border-4 border-sky-50" />
                <div className="text-center">
                  <p className="font-bold text-sky-900 text-2xl">{lastScanned.name}</p>
                  <p className="text-6xl font-black text-sky-500 mt-2">€{lastScanned.price}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white rounded-[2.5rem] shadow-xl flex flex-col overflow-hidden border-2 border-white">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-sky-100 gap-3 opacity-30">
                <BarcodeIcon size={60} />
                <p className="font-bold text-xl">Nog niets gescand!</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-sky-50/50 rounded-3xl border border-sky-50 bounce-in">
                  <img src={item.imageUrl} className="w-16 h-16 rounded-2xl object-cover border-2 border-white" />
                  <div className="flex-1 truncate font-bold text-sky-900 text-xl">{item.name}</div>
                  <div className="font-black text-sky-500 text-3xl tracking-tighter">€{item.price}</div>
                  <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-200"><X size={20}/></button>
                </div>
              ))
            )}
          </div>
          <div className="p-4 bg-sky-50 border-t-2 border-sky-100 shrink-0">
            <button onClick={() => setView('CHECKOUT')} disabled={cart.length === 0} className={`w-full py-6 rounded-3xl font-bold text-4xl shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 ${cart.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-sky-500 text-white'}`}>
              KLAAR! 🏁
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
