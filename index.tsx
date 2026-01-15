
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  ShoppingBasket, Camera, Trash2, CheckCircle, 
  Settings, Plus, Barcode as BarcodeIcon, ArrowLeft, 
  Loader2, Printer, X, RefreshCw
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- AI SCANNER LOGICA ---
async function scanMetAI(base64Image: string, catalog: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const catalogList = catalog.map(p => `- Code ${p.barcode}: ${p.name} (€${p.price})`).join("\n");
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: `Je bent de kassa-computer van een basisschool winkel.
          Kijk naar de foto. Welk product uit onze lijst zie je? 
          Lijst:
          ${catalogList}
          
          Antwoord uitsluitend in JSON: {"name": "Productnaam", "price": 1, "found": true}` }
        ],
      },
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '{"name": "Iets lekkers", "price": 1, "found": false}');
  } catch (e) {
    return { name: "Onbekend product", price: 1, found: false };
  }
}

// --- BARCODE TEKENAAR ---
const BarcodeItem = ({ value, name }: { value: string; name: string }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && (window as any).JsBarcode) {
      (window as any).JsBarcode(svgRef.current, value, {
        format: "CODE128", width: 2, height: 60, displayValue: true, fontSize: 18
      });
    }
  }, [value]);
  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border-2 border-sky-100 flex flex-col items-center gap-2">
      <p className="font-bold text-sky-900 text-xl">{name}</p>
      <svg ref={svgRef} className="max-w-full h-auto"></svg>
    </div>
  );
};

// --- HOOFD APP ---
const App = () => {
  const [view, setView] = useState('HOME'); 
  const [cart, setCart] = useState<any[]>([]);
  const [catalog, setCatalog] = useState(() => {
    const saved = localStorage.getItem('supermarket_catalog');
    return saved ? JSON.parse(saved) : [
      { barcode: '1001', name: 'Appel', price: 1 },
      { barcode: '1002', name: 'Banaan', price: 1 },
      { barcode: '1003', name: 'Melk', price: 2 }
    ];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<any>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState(1);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    localStorage.setItem('supermarket_catalog', JSON.stringify(catalog));
  }, [catalog]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) { 
      alert("Oeps! Ik kan de camera niet vinden."); 
    }
  };

  const capture = async () => {
    if (!videoRef.current || isScanning) return;
    setIsScanning(true);
    const canvas = canvasRef.current!;
    const video = videoRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    
    const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
    
    // AI identificatie
    const result = await scanMetAI(base64, catalog);
    
    const product = {
      id: Math.random().toString(36).substr(2, 9),
      ...result,
      imageUrl: canvas.toDataURL('image/jpeg', 0.2)
    };
    
    setCart(prev => [product, ...prev]);
    setLastScanned(product);
    
    // Piepje nabootsen
    try {
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

    setTimeout(() => { 
      setLastScanned(null); 
      setIsScanning(false); 
    }, 2500);
  };

  // --- INSTELLINGEN ---
  if (view === 'SETTINGS') return (
    <div className="h-screen bg-sky-50 flex flex-col p-4 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setView('HOME')} className="bg-white p-3 rounded-2xl shadow-sm text-sky-600 active:scale-90"><ArrowLeft /></button>
        <h2 className="text-2xl font-bold text-sky-900">Juf/Meester Menu</h2>
        <div className="w-10"></div>
      </div>
      
      <div className="bg-white p-6 rounded-[2.5rem] shadow-md mb-6 border-2 border-white">
        <h3 className="font-bold text-sky-800 mb-4 flex items-center gap-2"><Plus size={20}/> Product Toevoegen</h3>
        <input className="w-full p-4 rounded-2xl bg-sky-50 border-2 border-sky-100 mb-3 text-xl outline-none" placeholder="Naam van het eten..." value={newProductName} onChange={e => setNewProductName(e.target.value)} />
        <div className="flex gap-2">
          {[1, 2].map(p => (
            <button key={p} onClick={() => setNewProductPrice(p)} className={`flex-1 py-4 rounded-2xl font-bold text-2xl border-2 transition-all ${newProductPrice === p ? 'bg-sky-500 border-sky-500 text-white shadow-lg' : 'bg-white border-sky-50 text-sky-300'}`}>€{p}</button>
          ))}
          <button onClick={() => { if(newProductName) setCatalog([...catalog, { barcode: (1000 + catalog.length + 1).toString(), name: newProductName, price: newProductPrice }]); setNewProductName(''); }} className="bg-green-500 text-white px-8 rounded-2xl font-bold text-xl shadow-lg active:scale-95">OK</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-10">
        <h3 className="font-bold text-sky-900 px-2 flex items-center gap-2">Huidige Producten:</h3>
        {catalog.map((c: any) => (
          <div key={c.barcode} className="relative group">
            <BarcodeItem value={c.barcode} name={c.name} />
            <button onClick={() => setCatalog(catalog.filter((i: any) => i.barcode !== c.barcode))} className="absolute top-4 right-4 text-red-200 p-2 hover:text-red-500"><Trash2 size={24}/></button>
          </div>
        ))}
        <button onClick={() => window.print()} className="w-full bg-sky-900 text-white py-6 rounded-[2.5rem] font-bold text-xl flex items-center justify-center gap-3 no-print shadow-xl active:scale-95"><Printer /> Barcodes Printen</button>
      </div>
    </div>
  );

  // --- KASSA ---
  return (
    <div className="h-screen flex flex-col bg-sky-50 overflow-hidden font-fredoka">
      <header className="bg-white px-6 py-4 flex items-center justify-between border-b-4 border-sky-100 shrink-0">
        <div className="flex items-center gap-2 text-sky-900 font-bold text-2xl"><ShoppingBasket className="text-sky-500"/> De Klas Winkel</div>
        <div className="flex items-center gap-3">
          <div className="bg-sky-100 px-6 py-2 rounded-2xl font-black text-sky-600 text-4xl shadow-inner tracking-tighter">€{cart.reduce((s, i) => s + i.price, 0)}</div>
          <button onClick={() => setView('SETTINGS')} className="text-sky-200 p-2 hover:text-sky-400 transition-colors"><Settings size={32} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
        {/* Camera */}
        <div className="h-[45%] bg-black rounded-[3rem] relative overflow-hidden shadow-2xl border-4 border-white shrink-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="scan-line"></div>
          
          {!cameraActive && (
            <div className="absolute inset-0 bg-sky-900/60 backdrop-blur-md flex items-center justify-center">
              <button onClick={startCamera} className="bg-white text-sky-900 px-12 py-6 rounded-[2.5rem] font-bold text-2xl shadow-2xl active:scale-95 transition-transform">KASSA STARTEN 🎥</button>
            </div>
          )}
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <button onClick={capture} disabled={isScanning || !cameraActive} className={`w-28 h-28 rounded-full border-[6px] border-white shadow-2xl flex items-center justify-center transition-all ${isScanning ? 'bg-sky-400 animate-pulse' : 'bg-green-500 active:scale-75'}`}>
              {isScanning ? <Loader2 className="text-white animate-spin" size={40} /> : <Camera className="text-white" size={44} />}
            </button>
          </div>

          {lastScanned && (
            <div className="absolute inset-0 bg-sky-900/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
              <div className="bg-white p-10 rounded-[4rem] text-center bounce-in shadow-2xl border-4 border-sky-100">
                <img src={lastScanned.imageUrl} className="w-36 h-36 rounded-[2.5rem] mx-auto mb-4 object-cover border-4 border-sky-50 shadow-inner" />
                <p className="font-bold text-3xl text-sky-900">{lastScanned.name}</p>
                <p className="text-7xl font-black text-sky-500 tracking-tighter">€{lastScanned.price}</p>
              </div>
            </div>
          )}
        </div>

        {/* Mandje */}
        <div className="flex-1 bg-white rounded-[3rem] shadow-xl flex flex-col overflow-hidden border-4 border-white">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-sky-100 opacity-40 gap-3">
                <BarcodeIcon size={80} />
                <p className="font-bold text-2xl text-center px-8">Houd iets voor de camera en druk op de groene knop!</p>
              </div>
            ) : (
              cart.map((item: any) => (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-sky-50/50 rounded-[2rem] border-2 border-sky-50 bounce-in">
                  <img src={item.imageUrl} className="w-20 h-20 rounded-2xl object-cover border-2 border-white" />
                  <div className="flex-1 font-bold text-sky-900 text-2xl truncate">{item.name}</div>
                  <div className="font-black text-sky-500 text-4xl pr-2 tracking-tighter">€{item.price}</div>
                  <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-200 p-2"><X size={24}/></button>
                </div>
              ))
            )}
          </div>
          
          <div className="p-5 bg-sky-50 border-t-2 border-sky-100">
            {view === 'CHECKOUT' ? (
               <div className="fixed inset-0 bg-green-500 z-[100] flex items-center justify-center p-6 text-center animate-in fade-in zoom-in">
                  <div className="bg-white rounded-[4rem] p-12 shadow-2xl w-full max-w-md border-8 border-green-100">
                    <CheckCircle size={100} className="text-green-500 mx-auto mb-6 animate-bounce" />
                    <h1 className="text-4xl font-bold text-green-900">Dat is alles!</h1>
                    <p className="text-9xl font-black text-green-500 my-8">€{cart.reduce((s, i) => s + i.price, 0)}</p>
                    <button onClick={() => { setCart([]); setView('HOME'); }} className="w-full bg-green-500 text-white py-8 rounded-[3rem] font-bold text-3xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4">
                      <RefreshCw size={32} /> VOLGENDE!
                    </button>
                  </div>
               </div>
            ) : (
              <button onClick={() => setView('CHECKOUT')} disabled={cart.length === 0} className={`w-full py-8 rounded-[2.5rem] font-bold text-4xl shadow-xl flex items-center justify-center gap-4 transition-all ${cart.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-sky-500 text-white active:scale-95'}`}>
                KLAAR! 🏁
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
