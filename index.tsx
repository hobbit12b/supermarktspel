
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ShoppingBasket, Camera, Trash2, CheckCircle, 
  Settings, Plus, Barcode as BarcodeIcon, ArrowLeft, 
  Loader2, X, RefreshCw, Printer
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- HELPERS ---
const generateId = () => Math.random().toString(36).substr(2, 9);

// --- COMPONENT: BARCODE ---
const BarcodeItem = ({ value, name }) => {
  const svgRef = useRef(null);
  useEffect(() => {
    // Fixed: Cast window to any to access JsBarcode which is not on the standard Window type
    if (svgRef.current && (window as any).JsBarcode) {
      (window as any).JsBarcode(svgRef.current, value, {
        format: "CODE128", width: 2, height: 60, displayValue: true
      });
    }
  }, [value]);

  return (
    <div className="bg-white p-4 rounded-3xl shadow-md flex flex-col items-center gap-2 border-2 border-sky-100">
      <p className="font-bold text-sky-900">{name}</p>
      <svg ref={svgRef}></svg>
    </div>
  );
};

// --- HOOFD APP ---
const App = () => {
  const [view, setView] = useState('HOME'); // HOME, SETTINGS, BARCODES, CHECKOUT
  const [cart, setCart] = useState([]);
  const [catalog, setCatalog] = useState(() => {
    const saved = localStorage.getItem('kassa_catalog_v2');
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
  const [cameraOn, setCameraOn] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const totaal = cart.reduce((acc, curr) => acc + curr.price, 0);

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
      alert("Camera werkt niet. Geef toestemming!");
    }
  };

  useEffect(() => {
    if (view === 'HOME') startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [view]);

  useEffect(() => {
    localStorage.setItem('kassa_catalog_v2', JSON.stringify(catalog));
  }, [catalog]);

  const scanNu = async () => {
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
      const catalogInfo = catalog.map(p => `- ${p.name} (€${p.price})`).join("\n");
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            { text: `Welk product uit deze lijst zie je? ${catalogInfo}. Geef alleen JSON: {"name": "naam", "price": 1}` }
          ]
        },
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{"name": "Iets lekkers", "price": 1}');
      const product = {
        id: generateId(),
        name: result.name,
        price: result.price,
        foto: canvas.toDataURL('image/jpeg', 0.2)
      };

      setCart([product, ...cart]);
      setLastScanned(product);

      // Bleep geluid
      // Fixed: Cast window to any for webkitAudioContext support in older browsers
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.value = 800; gain.gain.value = 0.1;
      osc.start(); setTimeout(() => osc.stop(), 100);

      setTimeout(() => { setLastScanned(null); setIsScanning(false); }, 2000);
    } catch (err) {
      setIsScanning(false);
    }
  };

  if (view === 'SETTINGS') return (
    <div className="min-h-screen p-4">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setView('HOME')} className="bg-white p-4 rounded-2xl shadow text-sky-600"><ArrowLeft size={32}/></button>
        <h2 className="text-2xl font-bold text-sky-900">Instellingen</h2>
        <button onClick={() => setView('BARCODES')} className="bg-sky-500 text-white p-4 rounded-2xl shadow"><BarcodeIcon size={32}/></button>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm mb-6">
        <h3 className="font-bold text-sky-800 mb-4 text-xl">Nieuw Product</h3>
        <input className="w-full p-4 rounded-xl border-2 border-sky-50 mb-4 text-lg" placeholder="Naam..." value={newProductName} onChange={e => setNewProductName(e.target.value)} />
        <div className="flex gap-2">
          {[1, 2].map(p => (
            <button key={p} onClick={() => setNewProductPrice(p)} className={`flex-1 py-4 rounded-xl font-bold ${newProductPrice === p ? 'bg-sky-500 text-white' : 'bg-sky-50 text-sky-300'}`}>€{p}</button>
          ))}
          <button onClick={() => { if(!newProductName) return; setCatalog([...catalog, { barcode: (1000+catalog.length).toString(), name: newProductName, price: newProductPrice }]); setNewProductName(''); }} className="bg-green-500 text-white px-8 rounded-xl font-bold">OK</button>
        </div>
      </div>
      <div className="space-y-2">
        {catalog.map(item => (
          <div key={item.barcode} className="bg-white p-4 rounded-xl flex justify-between items-center shadow-sm">
            <div><p className="font-bold text-sky-900">{item.name}</p><p className="text-xs text-sky-300">Code: {item.barcode}</p></div>
            <div className="flex items-center gap-4">
              <span className="font-bold text-green-500 text-xl">€{item.price}</span>
              <button onClick={() => setCatalog(catalog.filter(c => c.barcode !== item.barcode))} className="text-red-200"><Trash2 size={24}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (view === 'BARCODES') return (
    <div className="min-h-screen p-6 bg-white overflow-y-auto flex flex-col items-center">
      <div className="w-full flex justify-between mb-8 max-w-md no-print">
        <button onClick={() => setView('SETTINGS')} className="bg-sky-100 p-4 rounded-2xl text-sky-600"><ArrowLeft size={32}/></button>
        <button onClick={() => window.print()} className="bg-sky-900 text-white px-8 rounded-2xl font-bold flex items-center gap-2 shadow-lg"><Printer size={24}/> Printen</button>
      </div>
      <div className="grid grid-cols-1 gap-6 w-full max-w-md pb-20">
        {catalog.map(item => <BarcodeItem key={item.barcode} value={item.barcode} name={item.name} />)}
      </div>
    </div>
  );

  if (view === 'CHECKOUT') return (
    <div className="h-screen bg-green-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-12 shadow-2xl text-center w-full max-w-sm border-[10px] border-green-100">
        <CheckCircle size={80} className="text-green-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-green-800">Bedankt!</h1>
        <p className="text-8xl font-black text-green-500 my-8">€{totaal}</p>
        <button onClick={() => { setCart([]); setView('HOME'); }} className="w-full bg-green-500 text-white py-6 rounded-3xl font-bold text-2xl shadow-lg flex items-center justify-center gap-3">
          <RefreshCw /> Volgende!
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="bg-white p-4 shadow-sm flex items-center justify-between border-b-4 border-sky-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-sky-500 p-2 rounded-xl text-white"><ShoppingBasket size={24} /></div>
          <span className="font-bold text-sky-900 text-xl">Kassa</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-sky-50 px-5 py-1.5 rounded-xl border-2 border-sky-100 font-bold text-sky-600 text-2xl">€{totaal}</div>
          <button onClick={() => setView('SETTINGS')} className="text-sky-200 p-1"><Settings size={28} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
        <div className="h-[45%] bg-black rounded-[2.5rem] relative overflow-hidden shadow-inner border-4 border-white shrink-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="scan-line"></div>

          {!cameraOn && (
            <div className="absolute inset-0 bg-sky-900/40 flex items-center justify-center">
              <button onClick={startCamera} className="bg-white text-sky-900 px-8 py-4 rounded-3xl font-bold text-xl shadow-2xl">CAMERA AAN 🎥</button>
            </div>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <button onClick={scanNu} disabled={isScanning || !cameraOn} className={`w-24 h-24 rounded-full border-[8px] border-white shadow-2xl flex items-center justify-center transition-all ${isScanning ? 'bg-sky-400 scale-90' : 'bg-green-500 active:scale-75'}`}>
              {isScanning ? <Loader2 className="text-white animate-spin" size={32} /> : <Camera className="text-white" size={44} />}
            </button>
          </div>

          {lastScanned && (
            <div className="absolute inset-0 bg-sky-900/80 flex items-center justify-center z-30">
              <div className="bg-white p-6 rounded-[3rem] shadow-2xl flex flex-col items-center gap-3 border-[8px] border-sky-100">
                <img src={lastScanned.foto} className="w-32 h-32 rounded-3xl object-cover" />
                <div className="text-center">
                  <p className="font-bold text-sky-900 text-2xl">{lastScanned.name}</p>
                  <p className="text-6xl font-black text-sky-500">€{lastScanned.price}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white rounded-[2.5rem] shadow flex flex-col overflow-hidden border-2 border-white">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-sky-100 opacity-50">
                <BarcodeIcon size={64} />
                <p className="font-bold mt-4">Kassa is leeg...</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center gap-4 p-3 bg-sky-50/50 rounded-2xl border-2 border-sky-50">
                  <img src={item.foto} className="w-16 h-16 rounded-xl object-cover" />
                  <div className="flex-1 font-bold text-sky-900 text-lg">{item.name}</div>
                  <div className="font-black text-sky-500 text-3xl pr-2">€{item.price}</div>
                  <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-200 pr-1"><X size={28}/></button>
                </div>
              ))
            )}
          </div>
          <div className="p-4 bg-sky-50 border-t-2 border-sky-100">
            <button onClick={() => setView('CHECKOUT')} disabled={cart.length === 0} className={`w-full py-6 rounded-3xl font-bold text-3xl shadow-lg flex items-center justify-center gap-4 transition-all ${cart.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-sky-500 text-white active:scale-95'}`}>
              <CheckCircle size={32} /> KLAAR!
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);