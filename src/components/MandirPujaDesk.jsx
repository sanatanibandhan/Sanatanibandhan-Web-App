import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { 
  Flame, Calendar, Users, Package, Plus, CheckCircle2, 
  AlertTriangle, Loader2, X, WifiOff, Printer, Search, BookOpen, Heart
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function MandirPujaDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const [activeTab, setActiveTab] = useState('PUJAS'); // 'PUJAS' or 'BHANDARA'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 💾 Data States
  const [pujas, setPujas] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_mandir_pujas_${session?.communityId}`)) || []; } catch { return []; }});
  const [inventory, setInventory] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_mandir_inv_${session?.communityId}`)) || []; } catch { return []; }});

  // UI Modals
  const [showPujaModal, setShowPujaModal] = useState(false);
  const [showInvModal, setShowInvModal] = useState(false);

  // Form States
  const [pujaForm, setPujaForm] = useState({ devoteeName: '', gotra: '', nakshatra: '', pujaType: 'Rudrabhishek', dateStr: new Date().toISOString().split('T')[0], dakshina: 500 });
  const [invForm, setInvForm] = useState({ itemName: '', quantity: '', unit: 'Kg', minThreshold: 10 });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_mandir_desk', { workspace_type: workspaceType });

    // Sync Pujas
    const pujaRef = ref(db, `communities/${session.communityId}/mandir_pujas`);
    const unsubPuja = onValue(pujaRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const pArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.createdAt - a.createdAt);
        setPujas(pArray);
        localStorage.setItem(`sb_mandir_pujas_${session.communityId}`, JSON.stringify(pArray));
      } else { setPujas([]); }
    });

    // Sync Inventory
    const invRef = ref(db, `communities/${session.communityId}/mandir_inventory`);
    const unsubInv = onValue(invRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const iArray = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setInventory(iArray);
        localStorage.setItem(`sb_mandir_inv_${session.communityId}`, JSON.stringify(iArray));
      } else { setInventory([]); }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubPuja(); unsubInv(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const handleCreatePuja = async (e) => {
    e.preventDefault();
    if (!isOnline) return showToast("Offline mode.", "error");
    setIsProcessing(true);
    try {
      const pujaId = push(ref(db, `communities/${session.communityId}/mandir_pujas`)).key;
      const newPuja = {
        ...pujaForm,
        dakshina: Number(pujaForm.dakshina),
        status: 'BOOKED',
        loggedBy: session.userName,
        createdAt: Date.now()
      };
      await set(ref(db, `communities/${session.communityId}/mandir_pujas/${pujaId}`), newPuja);
      showToast("Puja & Sankalpa successfully registered!");
      setShowPujaModal(false);
      setPujaForm({ devoteeName: '', gotra: '', nakshatra: '', pujaType: 'Rudrabhishek', dateStr: new Date().toISOString().split('T')[0], dakshina: 500 });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  const handleSaveInventory = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const invId = push(ref(db, `communities/${session.communityId}/mandir_inventory`)).key;
      const newItem = {
        itemName: invForm.itemName.trim(),
        quantity: Number(invForm.quantity),
        unit: invForm.unit,
        minThreshold: Number(invForm.minThreshold),
        updatedAt: Date.now()
      };
      await set(ref(db, `communities/${session.communityId}/mandir_inventory/${invId}`), newItem);
      showToast("Inventory item added.");
      setShowInvModal(false);
      setInvForm({ itemName: '', quantity: '', unit: 'Kg', minThreshold: 10 });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5">

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg">
          <WifiOff size={18} /> <span className="text-xs font-black uppercase tracking-widest">Offline Mode</span>
        </div>
      )}

      {toast && createPortal(
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl bg-gray-900 text-white flex items-center gap-3">
           <CheckCircle2 size={20} className="text-green-400"/>
           <p className="text-sm font-bold">{toast.message}</p>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Flame className="text-sanatani-orange" size={26} /> Mandir Seva & Puja Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Online Sankalpa bookings & Bhandara supply chain.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button onClick={() => setActiveTab('PUJAS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'PUJAS' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500'}`}>Puja Sankalpa ({pujas.length})</button>
            <button onClick={() => setActiveTab('BHANDARA')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'BHANDARA' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Bhandara Stock ({inventory.length})</button>
          </div>

          {isManagerOrAdmin && activeTab === 'PUJAS' && (
            <button onClick={() => setShowPujaModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md">
              <Plus size={16}/> Book Puja
            </button>
          )}
          {isManagerOrAdmin && activeTab === 'BHANDARA' && (
            <button onClick={() => setShowInvModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md">
              <Plus size={16}/> Add Stock
            </button>
          )}
        </div>
      </div>

      {/* 🪔 TAB 1: PUJA SANKALPA */}
      {activeTab === 'PUJAS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pujas.map(puja => (
            <div key={puja.id} className="bg-orange-50/40 border border-orange-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-orange-100 text-orange-800 text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest">{puja.pujaType}</span>
                  <span className="text-xs font-black text-green-600 bg-white px-2 py-0.5 rounded shadow-sm">৳{puja.dakshina}</span>
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-2">{puja.devoteeName}</h3>
                <div className="space-y-1 text-xs font-bold text-gray-600">
                  <p>Gotra: <span className="text-gray-900">{puja.gotra || 'N/A'}</span></p>
                  <p>Nakshatra: <span className="text-gray-900">{puja.nakshatra || 'N/A'}</span></p>
                  <p>Date: <span className="text-gray-900">{puja.dateStr}</span></p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-orange-200/60 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <span>Logged by: {puja.loggedBy}</span>
                <button onClick={() => window.print()} className="hover:text-gray-800 flex items-center gap-1"><Printer size={12}/> Print</button>
              </div>
            </div>
          ))}
          {pujas.length === 0 && (
            <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
              No puja bookings recorded yet.
            </div>
          )}
        </div>
      )}

      {/* 🍚 TAB 2: BHANDARA INVENTORY */}
      {activeTab === 'BHANDARA' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {inventory.map(item => {
            const isLowStock = item.quantity <= item.minThreshold;
            return (
              <div key={item.id} className={`p-5 rounded-2xl border transition-all ${isLowStock ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-widest ${isLowStock ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {isLowStock ? 'Low Stock Warning' : 'Sufficient Stock'}
                  </span>
                </div>
                <h4 className="text-lg font-black text-gray-900 mb-1">{item.itemName}</h4>
                <p className="text-2xl font-black text-gray-800 mt-2">{item.quantity} <span className="text-xs text-gray-400 uppercase">{item.unit}</span></p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Minimum Threshold: {item.minThreshold} {item.unit}</p>
              </div>
            );
          })}
          {inventory.length === 0 && (
            <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
              No bhandara inventory items added yet.
            </div>
          )}
        </div>
      )}

      {/* ✨ PUJA BOOKING MODAL */}
      {showPujaModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border-t-4 border-sanatani-orange">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Flame className="text-sanatani-orange" size={20}/> New Puja Booking</h3>
               <button onClick={() => setShowPujaModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleCreatePuja} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Devotee Name *</label>
                 <input required type="text" value={pujaForm.devoteeName} onChange={e => setPujaForm({...pujaForm, devoteeName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Rajesh Sharma" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra</label>
                   <input type="text" value={pujaForm.gotra} onChange={e => setPujaForm({...pujaForm, gotra: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Kashyap" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Nakshatra</label>
                   <input type="text" value={pujaForm.nakshatra} onChange={e => setPujaForm({...pujaForm, nakshatra: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Rohini" />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Puja Type</label>
                   <select value={pujaForm.pujaType} onChange={e => setPujaForm({...pujaForm, pujaType: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none">
                     <option value="Rudrabhishek">Rudrabhishek</option>
                     <option value="Satyanarayan Katha">Satyanarayan Katha</option>
                     <option value="Chandi Path">Chandi Path</option>
                     <option value="General Archana">General Archana</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Dakshina (BDT)</label>
                   <input required type="number" value={pujaForm.dakshina} onChange={e => setPujaForm({...pujaForm, dakshina: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                 </div>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Scheduled Date</label>
                 <input type="date" value={pujaForm.dateStr} onChange={e => setPujaForm({...pujaForm, dateStr: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 mt-4">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'CONFIRM PUJA BOOKING'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ INVENTORY MODAL */}
      {showInvModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 border-t-4 border-gray-800">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Package size={20}/> Add Bhandara Stock</h3>
               <button onClick={() => setShowInvModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveInventory} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Item Name *</label>
                 <input required type="text" value={invForm.itemName} onChange={e => setInvForm({...invForm, itemName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Basmati Rice" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Quantity *</label>
                   <input required type="number" value={invForm.quantity} onChange={e => setInvForm({...invForm, invForm: {...invForm, quantity: e.target.value}, quantity: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="50" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Unit</label>
                   <select value={invForm.unit} onChange={e => setInvForm({...invForm, unit: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none">
                     <option value="Kg">Kg</option>
                     <option value="Liters">Liters</option>
                     <option value="Sacks">Sacks</option>
                     <option value="Pieces">Pieces</option>
                   </select>
                 </div>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Low Stock Warning Threshold</label>
                 <input required type="number" value={invForm.minThreshold} onChange={e => setInvForm({...invForm, minThreshold: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 mt-4">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'SAVE TO INVENTORY'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
