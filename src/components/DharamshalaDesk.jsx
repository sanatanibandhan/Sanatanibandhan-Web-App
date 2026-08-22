import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Bed, Building, Calendar, Users, Plus, X, Loader2, 
  HelpCircle, Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Banknote, Sparkles, MapPin
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

const DEFAULT_ROOMS = [
  { id: 'ROOM-101', roomNo: '101', type: 'AC Family Room', capacity: 4, nightlyRate: 1000, status: 'AVAILABLE' },
  { id: 'ROOM-102', roomNo: '102', type: 'AC Family Room', capacity: 4, nightlyRate: 1000, status: 'AVAILABLE' },
  { id: 'ROOM-201', roomNo: '201', type: 'Standard Non-AC Room', capacity: 3, nightlyRate: 500, status: 'AVAILABLE' },
  { id: 'ROOM-301', roomNo: '301', type: 'Dormitory Bed (Yatri Niwas)', capacity: 1, nightlyRate: 150, status: 'AVAILABLE' }
];

export default function DharamshalaDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  // ✨ Dynamic Institution Label mapping for all 8 Organization Types
  const institutionLabel = useMemo(() => {
    switch (String(workspaceType || '').toUpperCase()) {
      case 'GOSHALA': return 'Goshala';
      case 'SANGHA': return 'Sangha';
      case 'ASHRAM': return 'Ashram';
      case 'GURUKUL': return 'Gurukul';
      case 'SATSANG': return 'Satsang';
      case 'YOGA': return 'Yoga Center';
      case 'TRUST': return 'Trust';
      case 'TIRTH': return 'Tirth / Dham';
      case 'MANDIR':
      default: return 'Mandir';
    }
  }, [workspaceType]);

  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [bookingModal, setBookingModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [rooms, setRooms] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_rooms_${session?.communityId}`)) || DEFAULT_ROOMS; } catch { return DEFAULT_ROOMS; }
  });
  const [bookings, setBookings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_dharamshala_bookings_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Booking Form State
  const [bookingForm, setBookingForm] = useState({
    guestName: session?.userName || '',
    gotra: '',
    phone: '',
    checkInDate: '',
    checkOutDate: '',
    numberOfGuests: '2'
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_dharamshala_desk', { workspace_type: workspaceType });

    const roomRef = ref(db, `communities/${session.communityId}/dharamshala_rooms`);
    const unsubRoom = onValue(roomRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setRooms(list);
        localStorage.setItem(`sb_rooms_${session.communityId}`, JSON.stringify(list));
      }
    });

    const bookRef = ref(db, `communities/${session.communityId}/dharamshala_bookings`);
    const unsubBook = onValue(bookRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ bookingId: k, ...data[k] }));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setBookings(list);
        localStorage.setItem(`sb_dharamshala_bookings_${session.communityId}`, JSON.stringify(list));
      } else {
        setBookings([]);
        localStorage.removeItem(`sb_dharamshala_bookings_${session.communityId}`);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubRoom(); unsubBook(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(t('offline_saved') || "Action cached offline. Syncing soon.", 'offline');
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast((t('error') || "Error") + ": " + e.message, "error");
      throw e;
    }
  };

  const logAudit = async (actionType, description) => {
    try {
      await push(ref(db, `communities/${session.communityId}/audit_logs`), {
        managerName: session.userName, actionType, description, timestamp: Date.now()
      });
    } catch (e) {}
  };

  // 🛏️ Book Room for Pilgrim
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!bookingModal) return;
    if (!bookingForm.guestName.trim() || !bookingForm.checkInDate || !bookingForm.checkOutDate) {
      return showToast("Guest Name, Check-in and Check-out dates are required.", "error");
    }

    setSubmitting(true);
    try {
      const bookKey = `ROOM-BOOK-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();
      const totalFee = bookingModal.nightlyRate || 500; // Simplified 1-night calculation or base rate

      const payload = {
        ...bookingForm,
        bookingId: bookKey,
        roomId: bookingModal.id,
        roomNo: bookingModal.roomNo,
        roomType: bookingModal.type,
        totalFee: totalFee,
        status: 'CONFIRMED',
        createdAt: timestamp,
        bookedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/dharamshala_bookings/${bookKey}`] = payload;
      updates[`communities/${session.communityId}/dharamshala_rooms/${bookingModal.id}/status`] = 'OCCUPIED';

      // Sync to Treasury Ledger
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
        id: transId,
        name: `${bookingForm.guestName.trim()} [Dharamshala Booking]`,
        amount: totalFee,
        note: `Room ${bookingModal.roomNo} (${bookingModal.type}) (Gotra: ${bookingForm.gotra || 'N/A'})`,
        collector: `${session.userName} (Dharamshala Desk)`,
        timestamp: timestamp,
        category: 'Asset Donation'
      };

      await executeSafeUpdate(updates, "Room successfully booked & synced to Treasury!");
      logAudit("ROOM_BOOKED", `Booked Room ${bookingModal.roomNo} for pilgrim ${bookingForm.guestName}`);

      setBookingModal(null);
      setBookingForm({ guestName: session?.userName || '', gotra: '', phone: '', checkInDate: '', checkOutDate: '', numberOfGuests: '2' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full">

      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'error' ? 'Error' : 'Success'}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Bed className="text-sanatani-orange" size={32} /> {institutionLabel} Dharamshala & Yatri Niwas
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Manage pilgrim accommodation, room inventory, check-ins, and secure facility contributions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Dharamshala Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Provide comfortable lodging for visiting pilgrims and sadhus. Booking a room automatically updates room status to Occupied and logs contributions to the Treasury Ledger.
          </p>
        </div>
      )}

      {/* ROOMS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {rooms.map(room => (
          <div key={room.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border ${room.status === 'AVAILABLE' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {room.status}
                </span>
                <span className="text-xs font-bold text-gray-400">Cap: {room.capacity}</span>
              </div>

              <div>
                <h3 className="text-2xl font-black text-gray-900">Room {room.roomNo}</h3>
                <p className="text-xs font-bold text-sanatani-orange mt-0.5">{room.type}</p>
              </div>

              <p className="text-lg font-black text-green-600">{curSymbol}{room.nightlyRate} <span className="text-[10px] text-gray-400 font-normal">/ night</span></p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              {room.status === 'AVAILABLE' ? (
                <button 
                  onClick={() => setBookingModal(room)}
                  className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Bed size={16}/> Book Room
                </button>
              ) : (
                <button disabled className="w-full bg-gray-100 text-gray-400 font-black py-3 rounded-xl text-xs uppercase tracking-widest cursor-not-allowed">
                  Occupied
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* BOOKINGS TABLE OR LIST */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Users size={18} className="text-sanatani-orange"/> Active Pilgrim Bookings ({bookings.length})
        </h3>

        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {bookings.length > 0 ? (
            bookings.map(b => (
              <div key={b.bookingId} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border">Room {b.roomNo} ({b.roomType})</span>
                    <span className="text-[10px] text-gray-400 font-mono">ID: {b.bookingId}</span>
                  </div>
                  <h4 className="font-black text-gray-900 text-sm">{b.guestName} <span className="text-xs text-gray-500 font-bold">({b.gotra || 'Gotra N/A'})</span></h4>
                  <p className="text-xs text-gray-600 font-bold">Check-in: {b.checkInDate} → Check-out: {b.checkOutDate}</p>
                </div>
                <span className="text-sm font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-xl border border-green-200 shrink-0">
                  {curSymbol}{b.totalFee}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400 italic text-center py-6">No active room bookings.</p>
          )}
        </div>
      </div>

      {/* MODAL: BOOK ROOM */}
      {bookingModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-xl font-black text-gray-900">Book Room {bookingModal.roomNo}</h3>
                <p className="text-xs text-sanatani-orange font-bold">{bookingModal.type} ({curSymbol}{bookingModal.nightlyRate}/night)</p>
              </div>
              <button onClick={() => setBookingModal(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleBookingSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Guest / Pilgrim Full Name *</label>
                <input type="text" required value={bookingForm.guestName} onChange={e=>setBookingForm({...bookingForm, guestName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra</label>
                  <input type="text" value={bookingForm.gotra} onChange={e=>setBookingForm({...bookingForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Phone Number *</label>
                  <input type="tel" required value={bookingForm.phone} onChange={e=>setBookingForm({...bookingForm, phone: e.target.value})} placeholder="017..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Check-In Date *</label>
                  <input type="date" required value={bookingForm.checkInDate} onChange={e=>setBookingForm({...bookingForm, checkInDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Check-Out Date *</label>
                  <input type="date" required value={bookingForm.checkOutDate} onChange={e=>setBookingForm({...bookingForm, checkOutDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : `Confirm Booking (${curSymbol}${bookingModal.nightlyRate}) & Sync Treasury`}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Dharamshala Desk
      </div>
    </div>
  );
}
