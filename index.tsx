
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ShoppingBasket, Camera, Trash2, CheckCircle, 
  Settings, Plus, Barcode as BarcodeIcon, ArrowLeft, 
  Loader2, X, RefreshCw, Printer
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- AI HERKENNING ---
async function identifyProduct(base64Image, catalog) {
  // Use new GoogleGenAI inside the function to ensure the correct API key is used.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const catalogList = catalog.map(p => `- Code ${p.barcode}: ${p.name} (€${p.price})`).join("\n");
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: `Je bent de kassa van een kleuterschool. Match de foto aan dit lijstje:\n${catalogList}\nGeef antwoord als JSON: {"name": "Naam", "price": 1}` }
        ],
      },
      config: { responseMimeType: "application/json" }
    });
    // Access response.text as a property, not a method, according to Gemini API guidelines.
    return JSON.parse(response.text || '{"name": "Iets lekkers", "price": 1}');
  } catch (e) {
    return { name: "Iets lekkers", price: 1 };
  }
}

// --- BARCODE COMPONENT ---
const BarcodeImage = ({ value, name }) => {
  const svgRef = useRef(null);
  useEffect(() => {
    // Cast window to any to access JsBarcode which is typically added via a global script.
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

// --- DE APP ---
const App = () => {
  const [view, setView] = useState('HOME'); 
  const [cart, setCart] = useState([]);
  const [catalog, setCatalog] = useState(() => {
    const saved = localStorage.getItem('super_catalog_v3');
    return saved ? JSON.parse(saved) : [
      { barcode: '1001', name: 'Appel', price: 1 },
      { barcode: '1002', name: 'Banaan', price: 1 },
      { barcode: '1003', name: 'Pak Melk', price: 2 }
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
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [view]);

  useEffect(() => {
    localStorage.setItem('super_catalog_v3', JSON.stringify(catalog));
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
        // Cast window to any for webkitAudioContext support in TypeScript.
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.05;
        osc.start();
        setTimeout(() => osc.stop(), 150);
      } catch(e) {}

      setTimeout(() => { setLastScanned(null); setIsScanning(false); }, 2500);
    } catch (err) {
      setIsScanning(false);
    }
  };

  if (view === 'SETTINGS') return (
    <div className="h-screen bg-sky-50 flex flex-col p-4 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setView('HOME')} className="bg-white p-4 rounded-2xl shadow-md text-sky-600 active:scale-90 transition-transform"><ArrowLeft size={32}/></button>
        <h2 className="text-2xl font-bold text-sky-900">Juf & Meester Menu</h2>
        <button onClick={() => setView('BARCODES')} className="bg-sky-500 text-white p-4 rounded-2xl shadow-lg active:scale-90 transition-transform"><BarcodeIcon size={32}/></button>
      </div>
      <div className="bg-white p-6 rounded-[2.5rem] shadow-md mb-6 border-4 border-white">
        <h3 className="font-bold text-sky-800 mb-4 flex items-center gap-2 text-xl"><Plus size={24}/> Product Toevoegen</h3>
        <input className="w-full p-5 rounded-2xl border-2 border-sky-50 mb-4 text-xl outline-none focus:border-sky-300" placeholder="Naam van product..." value={newProductName} onChange={e => setNewProductName(e.target.value)} />
        <div className="flex gap-3">
          {[1, 2].map(p => (
            <button key={p} onClick={() => setNewProductPrice(p)} className={`flex-1 py-4 rounded-2xl font-bold text-2xl border-4 transition-all ${newProductPrice === p ? 'bg-sky-500 border-sky-500 text-white scale-105' : 'bg-white border-sky-50 text-sky-300'}`}>€{p}</button>
          ))}
          <button onClick={() => { if(!newProductName) return; setCatalog([...catalog, { barcode: (1000 + catalog.length + 1).toString(), name: newProductName, price: newProductPrice }]); setNewProductName(''); }} className="bg-green-500 text-white px-10 rounded-2xl font-bold text-2xl shadow-lg active:scale-95 transition-transform">OK</button>
        </div>
      </div>
      <div className="space-y-3 mb-20">
        {catalog.map(item => (
          <div key={item.barcode} className="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border border-sky-100">
            <div>
              <p className="font-bold text-sky-900 text-xl">{item.name}</p>
              <p className="text-sm text-sky-300">Code: {item.barcode}</p>
            </div>
            <div className="flex items-center gap-6">
              <span className="font-black text-green-500 text-2xl">€{item.price}</span>
              <button onClick={() => setCatalog(catalog.filter(c => c.barcode !== item.barcode))} className="text-red-200 hover:text-red-500"><Trash2 size={28}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (view === 'BARCODES') return (
    <div className="min-h-screen bg-sky-50 p-6 flex flex-col items-center overflow-y-auto">
      <div className="w-full flex justify-between mb-8 max-w-md no-print">
        <button onClick={() => setView('SETTINGS')} className="bg-white p-4 rounded-2xl shadow-md text-sky-600"><ArrowLeft size={32}/></button>
        <button onClick={() => window.print()} className="bg-sky-900 text-white px-8 rounded-2xl font-bold flex items-center gap-3 text-xl shadow-lg"><Printer size={24}/> Printen</button>
      </div>
      <div className="grid grid-cols-1 gap-6 w-full max-w-md pb-20">
        {catalog.map(item => <BarcodeImage key={item.barcode} value={item.barcode} name={item.name} />)}
      </div>
    </div>
  );

  if (view === 'CHECKOUT') return (
    <div className="h-screen bg-green-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl text-center w-full max-w-sm bounce-in border-[12px] border-green-100">
        <CheckCircle size={120} className="text-green-500 mx-auto mb-6 animate-bounce" />
        <h1 className="text-4xl font-bold text-green-800">Bedankt!</h1>
        <p className="text-sky-400 font-bold mt-4">Totaal bedrag:</p>
        <p className="text-9xl font-black text-green-500 my-8 tracking-tighter">€{totalPrice}</p>
        <button onClick={() => { setCart([]); setView('HOME'); }} className="w-full bg-green-500 text-white py-8 rounded-[2.5rem] font-bold text-3xl shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-transform">
          <RefreshCw size={32} /> Volgende klant!
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-sky-50 overflow-hidden">
      <header className="bg-white px-6 py-5 shadow-sm flex items-center justify-between border-b-4 border-sky-100 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-sky-500 p-2.5 rounded-2xl text-white shadow-lg"><ShoppingBasket size={32} /></div>
          <span className="font-bold text-sky-900 text-3xl tracking-tight">Kassa</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-sky-50 px-6 py-2.5 rounded-2xl border-4 border-sky-100 font-bold text-sky-600 text-4xl tracking-tighter">€{totalPrice}</div>
          <button onClick={() => setView('SETTINGS')} className="text-sky-200 p-2 hover:text-sky-400 transition-colors"><Settings size={40} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        <div className="h-[48%] bg-black rounded-[3.5rem] relative overflow-hidden shadow-2xl border-4 border-white shrink-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="scan-line"></div>

          {cameraStatus !== 'active' && (
            <div className="absolute inset-0 bg-sky-900/60 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10">
              <button onClick={startCamera} className="bg-white text-sky-900 px-12 py-6 rounded-[2.5rem] font-bold text-4xl shadow-2xl active:scale-95 transition-transform">ZET KASSA AAN 🎥</button>
            </div>
          )}

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20">
            <button 
              onClick={capture} 
              disabled={isScanning || cameraStatus !== 'active'} 
              className={`w-32 h-32 rounded-full border-[10px] border-white shadow-2xl flex items-center justify-center transition-all ${isScanning ? 'bg-sky-400 scale-90' : 'bg-green-500 active:scale-75'}`}
            >
              {isScanning ? <Loader2 className="text-white animate-spin" size={48} /> : <Camera className="text-white" size={56} />}
            </button>
          </div>

          {lastScanned && (
            <div className="absolute inset-0 bg-sky-900/80 backdrop-blur-lg flex items-center justify-center z-30 animate-in zoom-in-95 duration-200">
              <div className="bg-white p-8 rounded-[4rem] shadow-2xl flex flex-col items-center gap-6 bounce-in border-[12px] border-sky-100 min-w-[280px]">
                <img src={lastScanned.imageUrl} className="w-40 h-40 rounded-[2.5rem] object-cover border-4 border-sky-50 shadow-inner" />
                <div className="text-center">
                  <p className="font-bold text-sky-900 text-4xl mb-2">{lastScanned.name}</p>
                  <p className="text-8xl font-black text-sky-500 tracking-tighter">€{lastScanned.price}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white rounded-[3.5rem] shadow-xl flex flex-col overflow-hidden border-4 border-white">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-sky-100 gap-6 opacity-40">
                <BarcodeIcon size={100} strokeWidth={1} />
                <p className="font-bold text-3xl">Nog niets gescand!</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center gap-6 p-4 bg-sky-50/40 rounded-[2.5rem] border-2 border-sky-50 bounce-in">
                  <img src={item.imageUrl} className="w-24 h-24 rounded-[1.5rem] object-cover border-4 border-white shadow-sm" />
                  <div className="flex-1 truncate font-bold text-sky-900 text-3xl">{item.name}</div>
                  <div className="font-black text-sky-500 text-5xl pr-2 tracking-tighter">€{item.price}</div>
                  <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-200 pr-2 hover:text-red-400 transition-colors"><X size={40}/></button>
                </div>
              ))
            )}
          </div>
          <div className="p-6 bg-sky-50 border-t-4 border-sky-100 shrink-0">
            <button 
              onClick={() => setView('CHECKOUT')} 
              disabled={cart.length === 0} 
              className={`w-full py-8 rounded-[2.5rem] font-bold text-5xl shadow-xl flex items-center justify-center gap-5 transition-all active:scale-95 ${cart.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-sky-500 text-white'}`}
            >
              <CheckCircle size={56} /> AFREKENEN
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
