import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, set, update } from 'firebase/database';
import { db } from '../firebase';
import { 
  Home, BedSingle, Utensils, CalendarDays, Plus, CheckCircle2, 
  AlertTriangle, Loader2, X, WifiOff, Users, Clock, ShieldCheck
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function AshramKutirDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const [activeTab, setActiveTab] = useState('KUTIRS'); // 'KUTIRS' or 'KITCHEN'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 💾 Data States
  const [kutirs, setKutirs] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_ashram_kutirs_${session?.communityId}`)) || []; } catch { return []; }});
  const [bookings, setBookings] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_ashram_bookings_${session?.communityId}`)) || []; } catch { return []; }});

  // UI Modals
  const [showKutirModal, setShowKutirModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Form States
  const [kutirForm, setKutirForm] = useState({ name: '', capacity: 1, type: 'Dormitory' });
  const [bookingForm, setBookingForm] = useState({ 
    guestName: '', 
    contact: '', 
    kutirId: '', 
    checkIn: new Date().toISOString().split('T')[0], 
    checkOut: '', 
    diet: 'Standard Satvik' 
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_ashram_desk', { workspace_type: workspaceType });

    // Sync Rooms/Kutirs
    const kutirRef = ref(db, `communities/${session.communityId}/ashram_kutirs`);
    const unsubKutir = onValue(kutirRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const kArray = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setKutirs(kArray);
        localStorage.setItem(`sb_ashram_kutirs_${session.communityId}`, JSON.stringify(kArray));
      } else { setKutirs([]); }
    });

    // Sync Bookings
    const bookRef = ref(db, `communities/${session.communityId}/ashram_bookings`);
    const unsubBook = onValue(bookRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const bArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.createdAt - a.createdAt);
        setBookings(bArray);
        localStorage.setItem(`sb_ashram_bookings_${session.communityId}`, JSON.stringify(bArray));
      } else { setBookings([]); }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubKutir(); unsubBook(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  // ✨ KUTIR MANAGEMENT
  const handleAddKutir = async (e) => {
    e.preventDefault();
    if (!isOnline) return showToast("Offline mode.", "error");
    setIsProcessing(true);
    try {
      const kutirId = push(ref(db, `communities/${session.communityId}/ashram_kutirs`)).key;
      const newKutir = { ...kutirForm, capacity: Number(kutirForm.capacity), status: 'AVAILABLE', addedBy: session.userName };
      await set(ref(db, `communities/${session.communityId}/ashram_kutirs/${kutirId}`), newKutir);
      showToast("Kutir successfully added to Ashram!");
      setShowKutirModal(false);
      setKutirForm({ name: '', capacity: 1, type: 'Dormitory' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  // ✨ BOOKING ENGINE
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const targetKutir = kutirs.find(k => k.id === bookingForm.kutirId);
      if (!targetKutir) throw new Error("Invalid Kutir selected.");

      const bookingId = push(ref(db, `communities/${session.communityId}/ashram_bookings`)).key;
      const newBooking = {
        ...bookingForm,
        kutirName: targetKutir.name,
        status: 'ACTIVE',
        loggedBy: session.userName,
        createdAt: Date.now()
      };

      const updates = {};
      updates[`communities/${session.communityId}/ashram_bookings/${bookingId}`] = newBooking;
      updates[`communities/${session.communityId}/ashram_kutirs/${bookingForm.kutirId}/status`] = 'OCCUPIED';
      updates[`communities/${session.communityId}/ashram_kutirs/${bookingForm.kutirId}/currentGuest`] = bookingForm.guestName;

      await update(ref(db), updates);
      pushToDataLayer('generate_lead', { content_type: 'Ashram_Booking', value: 0 });
      showToast("Sadhak successfully checked in!");
      setShowBookingModal(false);
      setBookingForm({ guestName: '', contact: '', kutirId: '', checkIn: new Date().toISOString().split('T')[0], checkOut: '', diet: 'Standard Satvik' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  // ✨ CHECK-OUT ENGINE
  const handleCheckout = async (booking) => {
    if (!window.confirm(`Check out ${booking.guestName} and free up ${booking.kutirName}?`)) return;
    try {
      const updates = {};
      updates[`communities/${session.communityId}/ashram_bookings/${booking.id}/status`] = 'COMPLETED';
      updates[`communities/${session.communityId}/ashram_kutirs/${booking.kutirId}/status`] = 'AVAILABLE';
      updates[`communities/${session.communityId}/ashram_kutirs/${booking.kutirId}/currentGuest`] = null;
      
      await update(ref(db), updates);
      showToast("Check-out complete. Kutir is now available.");
    } catch (e) { showToast(e.message, "error"); }
  };

  // 🥬 KITCHEN AGGREGATOR LOGIC
  const activeDietaryNeeds = bookings
    .filter(b => b.status === 'ACTIVE')
    .reduce((acc, curr) => {
      acc[curr.diet] = (acc[curr.diet] || 0) + 1;
      return acc;
    }, {});

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5">

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg">
          <WifiOff size={18} /> <span className="text-xs font-black uppercase tracking-widest">Offline Mode</span>
        </div>
      )}

      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           {toast.type === 'error' ? <AlertTriangle size={20} className="text-red-400"/> : <CheckCircle2 size={20} className="text-green-400"/>}
           <p className="text-sm font-bold">{toast.message}</p>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Home className="text-sanatani-orange" size={26} /> Ashram Operations
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Kutir allocation & Kitchen Sadhana tracking.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button onClick={() => setActiveTab('KUTIRS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'KUTIRS' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><BedSingle size={14}/> Lodging</button>
            <button onClick={() => setActiveTab('KITCHEN')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'KITCHEN' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><Utensils size={14}/> Kitchen</button>
          </div>

          {isManagerOrAdmin && activeTab === 'KUTIRS' && (
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => setShowKutirModal(true)} className="flex-1 sm:flex-none bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex justify-center items-center gap-2 shadow-sm transition-colors">
                <Plus size={16}/> Add Room
              </button>
              <button onClick={() => setShowBookingModal(true)} className="flex-1 sm:flex-none bg-gray-900 hover:bg-black text-white px-4 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex justify-center items-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
                <Plus size={16}/> Check-In
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 🛏️ TAB 1: KUTIR LODGING */}
      {activeTab === 'KUTIRS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kutirs.map(kutir => {
            const isOccupied = kutir.status === 'OCCUPIED';
            // Find active booking for this room to show check-out date
            const activeBooking = bookings.find(b => b.kutirId === kutir.id && b.status === 'ACTIVE');

            return (
              <div key={kutir.id} className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${isOccupied ? 'bg-orange-50/50 border-orange-200 shadow-sm' : 'bg-white border-gray-200 hover:border-green-300'}`}>
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest">{kutir.type} (Cap: {kutir.capacity})</span>
                    <span className={`text-[9px] font-black px-2 py-1 rounded flex items-center gap-1 uppercase tracking-widest ${isOccupied ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                      {isOccupied ? 'Occupied' : 'Available'}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-4">{kutir.name}</h3>
                  
                  {isOccupied && activeBooking ? (
                    <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-sm space-y-3">
                      <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Current Sadhak</p>
                        <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><Users size={14} className="text-orange-500"/> {activeBooking.guestName}</p>
                      </div>
                      <div className="flex justify-between items-end border-t border-gray-50 pt-2">
                        <div>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Check-Out</p>
                          <p className="text-xs font-mono font-bold text-gray-700">{activeBooking.checkOut || 'Open End'}</p>
                        </div>
                        {isManagerOrAdmin && (
                          <button onClick={() => handleCheckout(activeBooking)} className="text-[10px] font-black text-red-600 hover:text-white hover:bg-red-600 border border-red-200 px-3 py-1.5 rounded-lg uppercase tracking-widest transition-colors">
                            Check Out
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-200 text-center">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ready for Check-In</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {kutirs.length === 0 && (
            <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
              No Kutirs/Rooms added yet. Admin must add lodging infrastructure first.
            </div>
          )}
        </div>
      )}

      {/* 🍲 TAB 2: KITCHEN DIETARY AGGREGATOR */}
      {activeTab === 'KITCHEN' && (
        <div className="flex flex-col h-full space-y-6">
          <div className="bg-gradient-to-r from-green-600 to-emerald-700 rounded-3xl p-6 sm:p-10 shadow-xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><Utensils size={150} /></div>
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">Daily Kitchen Manifest</h2>
              <p className="text-xs sm:text-sm font-bold text-green-100 uppercase tracking-widest">Aggregated dietary requirements for active Sadhaks today.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.keys(activeDietaryNeeds).length === 0 ? (
              <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
                No active bookings with dietary needs.
              </div>
            ) : (
              Object.entries(activeDietaryNeeds).map(([diet, count]) => (
                <div key={diet} className="bg-white border border-gray-200 p-6 rounded-3xl shadow-sm flex items-center justify-between hover:border-green-300 transition-colors">
                  <div>
                    <h4 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-1">Diet Profile</h4>
                    <p className="text-lg font-black text-gray-900">{diet}</p>
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-green-50 text-green-600 border border-green-200 flex items-center justify-center text-2xl font-black shadow-inner">
                    {count}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Active Booking Log for Kitchen Reference */}
          <div className="mt-8 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden ring-1 ring-black/5">
             <div className="p-4 border-b border-gray-100 bg-gray-50">
               <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><Clock size={14}/> Currently Residing Sadhaks</h3>
             </div>
             <div className="divide-y divide-gray-50">
               {bookings.filter(b => b.status === 'ACTIVE').map(b => (
                 <div key={b.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-black text-gray-900">{b.guestName}</p>
                      <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5 mt-1">
                        <Home size={10}/> {b.kutirName} &nbsp;|&nbsp; <CalendarDays size={10}/> Checkout: {b.checkOut || 'Open'}
                      </p>
                    </div>
                    <span className="bg-gray-100 text-gray-700 text-[10px] font-black px-3 py-1.5 rounded-lg border border-gray-200 uppercase tracking-widest">
                      {b.diet}
                    </span>
                 </div>
               ))}
             </div>
          </div>
        </div>
      )}

      {/* ✨ ADD KUTIR MODAL */}
      {showKutirModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 border-t-4 border-gray-800 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Home size={20}/> Setup Lodging</h3>
               <button onClick={() => setShowKutirModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleAddKutir} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Kutir / Room Name *</label>
                 <input required type="text" value={kutirForm.name} onChange={e => setKutirForm({...kutirForm, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Ganga Kutir 101" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Capacity (Beds) *</label>
                   <input required type="number" min="1" value={kutirForm.capacity} onChange={e => setKutirForm({...kutirForm, capacity: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Room Type</label>
                   <select value={kutirForm.type} onChange={e => setKutirForm({...kutirForm, type: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                     <option value="Single Room">Single Room</option>
                     <option value="Double Sharing">Double Sharing</option>
                     <option value="Dormitory">Dormitory</option>
                     <option value="VIP Suite">VIP Suite</option>
                   </select>
                 </div>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex justify-center items-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'SAVE KUTIR'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ CHECK-IN MODAL */}
      {showBookingModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border-t-4 border-sanatani-orange animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="text-sanatani-orange" size={20}/> Sadhak Check-In</h3>
               <button onClick={() => setShowBookingModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleCreateBooking} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Sadhak / Guest Name *</label>
                 <input required type="text" value={bookingForm.guestName} onChange={e => setBookingForm({...bookingForm, guestName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Ramesh Patel" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Assign Kutir *</label>
                   <select required value={bookingForm.kutirId} onChange={e => setBookingForm({...bookingForm, kutirId: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                     <option value="">Select Available...</option>
                     {kutirs.filter(k => k.status === 'AVAILABLE').map(k => (
                       <option key={k.id} value={k.id}>{k.name} ({k.type})</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Dietary Requirement</label>
                   <select value={bookingForm.diet} onChange={e => setBookingForm({...bookingForm, diet: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                     <option value="Standard Satvik">Standard Satvik</option>
                     <option value="No Onion/Garlic">No Onion/Garlic</option>
                     <option value="Fasting (Phalahar)">Fasting (Phalahar)</option>
                     <option value="No Dairy (Vegan)">No Dairy</option>
                   </select>
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Check-In Date *</label>
                   <input required type="date" value={bookingForm.checkIn} onChange={e => setBookingForm({...bookingForm, checkIn: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Check-Out Date (Optional)</label>
                   <input type="date" value={bookingForm.checkOut} onChange={e => setBookingForm({...bookingForm, checkOut: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
                 </div>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex justify-center items-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'CONFIRM CHECK-IN'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
