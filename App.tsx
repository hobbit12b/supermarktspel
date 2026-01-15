
import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBasket, Camera, Trash2, CheckCircle, RefreshCw, Settings, Plus, Barcode as BarcodeIcon, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { AppState, Product, CatalogProduct } from './types';
import { identifyProduct } from './services/gemini';

const BarcodeImage: React.FC<{ value: string; name: string }> = ({ value, name }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && (window as any).JsBarcode) {
      (window as any).JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 16,
        margin: 10
      });
    }
  }, [value]);

  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border-2 border-sky-100 flex flex-col items-center gap-2">
      <p className="font-bold text-sky-900 text-lg">{name}</p>
      <svg ref={svgRef} className="max-w-full h-auto"></svg>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<AppState>(AppState.HOME);
  const [cart, setCart] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>(() => {
    const saved = localStorage.getItem('supermarket_catalog');
    return saved ? JSON.parse(saved) : [
      { barcode: '1001', name: 'Appel', price: 1 },
      { barcode: '1002', name: 'Banaan', price: 1 },
      { barcode: '1003', name: 'Melk', price: 2 }
    ];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<Product | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState<number>(1);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'active' | 'error' | 'idle'>('idle');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const totalPrice = cart.reduce((sum, item) => sum + item.price, 0);

  const startCamera = async () => {
    setCameraStatus('loading');
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => setCameraStatus('active')).catch(() => setCameraStatus('idle'));
        };
      }
    } catch (err) {
      setCameraStatus('error');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStatus('idle');
  };

  useEffect(() => {
    if (view === AppState.HOME) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [view]);

  useEffect(() => {
    localStorage.setItem('supermarket_catalog', JSON.stringify(catalog));
  }, [catalog]);

  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current || isScanning || cameraStatus !== 'active') return;
    setIsScanning(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return setIsScanning(false);
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

    try {
      let finalProduct;
      // Probeer native BarcodeDetector (Chrome/Android/iOS 17+)
      let foundBarcode = null;
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['code_128', 'ean_13'] });
        const results = await detector.detect(canvas);
        if (results.length > 0) foundBarcode = results[0].rawValue;
      }

      if (foundBarcode) {
        const p = catalog.find(c => c.barcode === foundBarcode);
        finalProduct = p ? { ...p, isFromBarcode: true } : await identifyProduct(base64Data, catalog);
      } else {
        finalProduct = await identifyProduct(base64Data, catalog);
      }
      
      const newProduct: Product = {
        id: Math.random().toString(36).substr(2, 9),
        name: finalProduct.name,
        price: finalProduct.price,
        imageUrl: canvas.toDataURL('image/jpeg', 0.3),
        timestamp: Date.now(),
        isFromBarcode: finalProduct.isFromBarcode
      };

      setCart(prev => [newProduct, ...prev]);
      setLastScanned(newProduct);
      setTimeout(() => { setLastScanned(null); setIsScanning(false); }, 2000);
    } catch (err) {
      setIsScanning(false);
    }
  };

  if (view === AppState.SETTINGS) {
    return (
      <div className="h-[100dvh] bg-sky-50 flex flex-col overflow-hidden">
        <header className="bg-white p-4 shadow-sm flex items-center justify-between border-b-4 border-sky-100">
          <button onClick={() => setView(AppState.HOME)} className="bg-sky-100 p-3 rounded-2xl text-sky-600"><ArrowLeft /></button>
          <h2 className="text-xl font-bold text-sky-900">Winkel Instellingen</h2>
          <button onClick={() => setView(AppState.BARCODES)} className="bg-sky-500 text-white p-3 rounded-2xl"><BarcodeIcon /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] shadow-md border-2 border-white">
            <h3 className="font-bold text-sky-800 mb-4 flex items-center gap-2"><Plus size={20}/> Nieuw Product</h3>
            <input className="w-full p-4 rounded-xl border-2 border-sky-50 mb-3 text-lg outline-none" placeholder="Naam..." value={newProductName} onChange={e => setNewProductName(e.target.value)} />
            <div className="flex gap-2">
              {[1, 2].map(p => (
                <button key={p} onClick={() => setNewProductPrice(p)} className={`flex-1 py-3 rounded-xl font-bold border-2 ${newProductPrice === p ? 'bg-sky-500 border-sky-500 text-white' : 'bg-white border-sky-50 text-sky-300'}`}>€{p}</button>
              ))}
              <button onClick={() => { if(!newProductName) return; setCatalog([...catalog, { barcode: (1000 + catalog.length + 1).toString(), name: newProductName, price: newProductPrice }]); setNewProductName(''); }} className="bg-green-500 text-white px-6 rounded-xl font-bold">OK</button>
            </div>
          </div>
          <div className="space-y-2 pb-10">
            {catalog.map(item => (
              <div key={item.barcode} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
                <div><p className="font-bold text-sky-900">{item.name}</p><p className="text-xs text-sky-300">Code: {item.barcode}</p></div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-green-500">€{item.price}</span>
                  <button onClick={() => setCatalog(catalog.filter(c => c.barcode !== item.barcode))} className="text-red-200"><Trash2 size={20}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === AppState.BARCODES) {
    return (
      <div className="min-h-screen bg-sky-50 p-4 no-print flex flex-col items-center">
        <div className="w-full flex justify-between mb-4 max-w-md">
          <button onClick={() => setView(AppState.SETTINGS)} className="bg-white p-3 rounded-xl shadow-sm text-sky-600"><ArrowLeft /></button>
          <button onClick={() => window.print()} className="bg-sky-500 text-white px-6 rounded-xl font-bold">Afdrukken</button>
        </div>
        <div className="grid grid-cols-1 gap-4 w-full max-w-md">
          {catalog.map(item => <BarcodeImage key={item.barcode} value={item.barcode} name={item.name} />)}
        </div>
      </div>
    );
  }

  if (view === AppState.CHECKOUT) {
    return (
      <div className="h-[100dvh] bg-green-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl text-center w-full max-w-sm bounce-in border-8 border-green-100">
          <div className="flex justify-center mb-4"><CheckCircle size={80} className="text-green-500 animate-bounce" /></div>
          <h1 className="text-3xl font-bold text-green-800 tracking-tight">Bedankt!</h1>
          <p className="text-7xl font-bold text-green-500 my-6 tracking-tighter">€{totalPrice}</p>
          <button onClick={() => { setCart([]); setView(AppState.HOME); }} className="w-full bg-green-500 text-white py-5 rounded-3xl font-bold text-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-transform">
            <RefreshCw /> Volgende!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-sky-50 overflow-hidden font-fredoka">
      <header className="bg-white px-5 py-3 shadow-sm flex items-center justify-between shrink-0 border-b-2 border-sky-50">
        <div className="flex items-center gap-2">
          <div className="bg-sky-500 p-1.5 rounded-xl text-white shadow-inner"><ShoppingBasket size={22} /></div>
          <span className="font-bold text-sky-900">Kassa</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-sky-50 px-4 py-1.5 rounded-xl border-2 border-sky-100 font-bold text-sky-600 text-xl tracking-tighter">€{totalPrice}</div>
          <button onClick={() => setView(AppState.SETTINGS)} className="text-sky-200 p-1.5 hover:text-sky-400"><Settings size={24} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden p-2 gap-2">
        {/* Camera Viewport */}
        <div className="h-[45%] md:h-full md:flex-1 bg-black rounded-[2rem] relative overflow-hidden shadow-lg border-4 border-white shrink-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          {cameraStatus !== 'active' && (
            <div className="absolute inset-0 bg-sky-900/60 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center text-white z-10">
              {cameraStatus === 'loading' ? <Loader2 size={48} className="animate-spin" /> : (
                <button onClick={startCamera} className="bg-white text-sky-900 px-10 py-5 rounded-3xl font-bold text-2xl shadow-2xl active:scale-95 transition-transform">START KASSA 🎥</button>
              )}
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-48 h-36 border-2 border-white rounded-[2rem] relative">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 shadow-[0_0_10px_red]"></div>
            </div>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <button onClick={captureAndProcess} disabled={isScanning || cameraStatus !== 'active'} className={`w-24 h-24 rounded-full border-[6px] border-white shadow-2xl flex items-center justify-center transition-all ${isScanning ? 'bg-sky-400 scale-90' : 'bg-green-500 active:scale-75'}`}>
              {isScanning ? <Loader2 className="text-white animate-spin" size={32} /> : <Camera className="text-white" size={40} />}
            </button>
          </div>

          {lastScanned && (
            <div className="absolute inset-0 bg-sky-900/70 backdrop-blur-lg flex items-center justify-center z-30 animate-in zoom-in-90">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl border-4 border-sky-100 flex flex-col items-center gap-3 min-w-[220px] bounce-in">
                <img src={lastScanned.imageUrl} className="w-28 h-28 rounded-2xl object-cover border-2 border-sky-50 shadow-inner" />
                <div className="text-center">
                  <p className="font-bold text-sky-900 text-xl leading-tight">{lastScanned.name}</p>
                  <p className="text-5xl font-black text-sky-500 mt-2">€{lastScanned.price}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cart Viewport */}
        <div className="flex-1 md:w-96 bg-white rounded-[2rem] shadow-xl flex flex-col overflow-hidden border-2 border-white">
          <div className="p-4 bg-sky-50/50 flex justify-between items-center shrink-0 border-b-2 border-sky-50">
            <h2 className="font-bold text-sky-900 flex items-center gap-2 text-lg"><ShoppingBasket size={20} className="text-sky-500"/> Winkelmandje</h2>
            <button onClick={() => { if(confirm('Alles weg?')) setCart([]); }} className="text-red-200 hover:text-red-400 transition-colors"><Trash2 size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-sky-100 gap-3 opacity-40">
                <BarcodeIcon size={60} />
                <p className="font-bold">Nog niets gescand!</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-sky-50/30 rounded-2xl border border-sky-50 bounce-in">
                  <img src={item.imageUrl} className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow-sm" />
                  <div className="flex-1 truncate font-bold text-sky-900 text-lg">{item.name}</div>
                  <div className="font-black text-sky-500 text-2xl pr-2 tracking-tighter">€{item.price}</div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 bg-sky-50 border-t-2 border-sky-100 shrink-0">
            <button onClick={() => setView(AppState.CHECKOUT)} disabled={cart.length === 0} className={`w-full py-5 rounded-2xl font-bold text-3xl shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 ${cart.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-sky-500 text-white'}`}>
              <CheckCircle size={32} /> Klaar!
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
