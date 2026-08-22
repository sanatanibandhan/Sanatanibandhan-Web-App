import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Scroll, Flame, Calendar, Users, Plus, X, Loader2, 
  HelpCircle, Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Sparkles, Heart, Banknote
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function PitruShradhDesk({ session, isOnline = navigator.onLine }) {
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
  const [showModal, setShowModal] = useState(false);
  const [bookingModal, setBookingModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [ancestors, setAncestors] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_ancestors_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [bookings, setBookings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_shradh_bookings_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Ancestor Form State
  const [ancestorForm, setAncestorForm] = useState({
    ancestorName: '',
    relation: 'Father / Pitru',
    gotra: 'Kashyap',
    deathTithi: 'Amavasya',
    familyMemberName: session?.userName || ''
  });

  // Booking Form State
  const [bookingForm, setBookingForm] = useState({
    yajamanaName: session?.userName || '',
    gotra: '',
    pujaDate: '',
    dakshinaFee: '1500'
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_pitru_shradh', { workspace_type: workspaceType });

    const ancRef = ref(db, `communities/${session.communityId}/ancestor_register`);
    const unsubAnc = onValue(ancRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setAncestors(list);
        localStorage.setItem(`sb_ancestors_${session.communityId}`, JSON.stringify(list));
      } else {
        setAncestors([]);
      }
    });

    const bookRef = ref(db, `communities/${session.communityId}/shradh_bookings`);
    const unsubBook = onValue(bookRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ bookingId: k, ...data[k] }));
        list.sort((a, b) => new Date(a.pujaDate) - new Date(b.pujaDate));
        setBookings(list);
        localStorage.setItem(`sb_shradh_bookings_${session.communityId}`, JSON.stringify(list));
      } else {
        setBookings([]);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubAnc(); unsubBook(); clearTimeout(failsafe); };
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

  // ➕ Register Ancestor
  const handleSaveAncestor = async (e) => {
    e.preventDefault();
    if (!ancestorForm.ancestorName.trim() || !ancestorForm.gotra.trim()) {
      return showToast("Ancestor Name and Gotra are required.", "error");
    }

    setSubmitting(true);
    try {
      const ancKey = `ANC-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...ancestorForm,
        id: ancKey,
        registeredAt: timestamp
      };

      const updates = {};
      updates[`communities/${session.communityId}/ancestor_register/${ancKey}`] = payload;

      await executeSafeUpdate(updates, "Ancestor successfully added to memorial register!");
      logAudit("ANCESTOR_REGISTERED", `Registered ancestor: ${ancestorForm.ancestorName} (${ancestorForm.gotra})`);

      setShowModal(false);
      setAncestorForm({ ancestorName: '', relation: 'Father / Pitru', gotra: 'Kashyap', deathTithi: 'Amavasya', familyMemberName: session?.userName || '' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 🛕 Book Shradh Ritual
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(bookingForm.dakshinaFee);
    if (!bookingForm.yajamanaName.trim() || !bookingForm.pujaDate || isNaN(amt)) {
      return showToast("Yajamana Name, Puja Date, and Dakshina Fee are required.", "error");
    }

    setSubmitting(true);
    try {
      const bookKey = `SHRADH-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...bookingForm,
        bookingId: bookKey,
        dakshinaFee: amt,
        status: 'CONFIRMED',
        createdAt: timestamp,
        bookedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/shradh_bookings/${bookKey}`] = payload;

      // Sync to Treasury Ledger
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
        id: transId,
        name: `${bookingForm.yajamanaName.trim()} [Shradh / Tarpan]`,
        amount: amt,
        note: `Ancestral Memorial Puja (Gotra: ${bookingForm.gotra})`,
        collector: `${session.userName} (Pitru Shradh Desk)`,
        timestamp: timestamp,
        category: 'Prasadam Sales'
      };

      await executeSafeUpdate(updates, "Shradh ritual successfully booked & synced to Treasury!");
      logAudit("SHRADH_BOOKED", `Booked Shradh puja for ${bookingForm.yajamanaName}`);

      setBookingModal(false);
      setBookingForm({ yajamanaName: session?.userName || '', gotra: '', pujaDate: '', dakshinaFee: '1500' });
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
            <Scroll className="text-sanatani-orange" size={32} /> {institutionLabel} Pitru Shradh & Memorial Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Manage ancestral memorial registers, Pitru Paksha Tithi logs, and ancestral ritual bookings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          <button onClick={() => setBookingModal(true)} className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
            <Sparkles size={16}/> Book Shradh Puja 🙏
          </button>
          <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
            <Plus size={16}/> Register Ancestor
          </button>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Pitru Shradh Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Honoring ancestors (Pitru Tarpan) is a foundational pillar of Sanatan Dharma. Register family ancestors with their Gotra and Tithi to ensure seamless ritual arrangements during Pitru Paksha or monthly Amavasya.
          </p>
        </div>
      )}

      {/* ANCESTORS GRID */}
      <div className="space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Scroll size={18} className="text-sanatani-orange"/> Ancestral Memorial Register ({ancestors.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {ancestors.length > 0 ? (
            ancestors.map(anc => (
              <div key={anc.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                      Gotra: {anc.gotra}
                    </span>
                    <span className="text-xs font-bold text-gray-400">Tithi: {anc.deathTithi}</span>
                  </div>

                  <div>
                    <h4 className="text-2xl font-black text-gray-900">{anc.ancestorName}</h4>
                    <p className="text-xs font-bold text-gray-500 mt-0.5">Relation: {anc.relation}</p>
                  </div>

                  <p className="text-xs text-gray-400 font-bold">Registered by: {anc.familyMemberName}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
              <Scroll size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
              <p className="text-lg font-black text-gray-800 mb-1">No ancestors added to memorial register.</p>
              <p className="text-xs uppercase tracking-widest">Click 'Register Ancestor' to record family lineage names.</p>
            </div>
          )}
        </div>
      </div>

      {/* BOOKINGS HISTORY */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Calendar size={18} className="text-green-600"/> Scheduled Shradh / Tarpan Pujas ({bookings.length})
        </h3>

        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {bookings.length > 0 ? (
            bookings.map(b => (
              <div key={b.bookingId} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-green-50 text-green-700 border">Confirmed Puja</span>
                  <h4 className="font-black text-gray-900 text-sm pt-1">{b.yajamanaName} <span className="text-xs text-gray-500 font-bold">(Gotra: {b.gotra})</span></h4>
                  <p className="text-xs text-gray-600 font-bold">Date: {b.pujaDate}</p>
                </div>
                <span className="text-sm font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-xl border border-green-200">
                  +{curSymbol}{b.dakshinaFee}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400 italic text-center py-6">No scheduled Shradh bookings.</p>
          )}
        </div>
      </div>

      {/* MODAL: REGISTER ANCESTOR */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Register Ancestor (Pitru)</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveAncestor} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Ancestor Full Name *</label>
                <input type="text" required value={ancestorForm.ancestorName} onChange={e=>setAncestorForm({...ancestorForm, ancestorName: e.target.value})} placeholder="e.g. Late Ramchandra Sharma" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra *</label>
                  <input type="text" required value={ancestorForm.gotra} onChange={e=>setAncestorForm({...ancestorForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Relation</label>
                  <select value={ancestorForm.relation} onChange={e=>setAncestorForm({...ancestorForm, relation: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Father / Pitru">Father / Pitru</option>
                    <option value="Mother / Matru">Mother / Matru</option>
                    <option value="Grandfather / Pitamah">Grandfather / Pitamah</option>
                    <option value="Grandmother / Prapitamah">Grandmother / Prapitamah</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Death Tithi (Lunar Day)</label>
                <input type="text" value={ancestorForm.deathTithi} onChange={e=>setAncestorForm({...ancestorForm, deathTithi: e.target.value})} placeholder="e.g. Amavasya / Navami" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Save to Ancestor Register'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: BOOK SHRADH PUJA */}
      {bookingModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-green-600 flex flex-col p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">Book Shradh / Tarpan Puja</h3>
                <p className="text-xs text-green-600 font-bold">Ancestral Ritual Booking</p>
              </div>
              <button onClick={() => setBookingModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleBookingSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Yajamana Name *</label>
                <input type="text" required value={bookingForm.yajamanaName} onChange={e=>setBookingForm({...bookingForm, yajamanaName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra *</label>
                  <input type="text" required value={bookingForm.gotra} onChange={e=>setBookingForm({...bookingForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Puja Date *</label>
                  <input type="date" required value={bookingForm.pujaDate} onChange={e=>setBookingForm({...bookingForm, pujaDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Dakshina Fee ({curSymbol}) *</label>
                <input type="number" required value={bookingForm.dakshinaFee} onChange={e=>setBookingForm({...bookingForm, dakshinaFee: e.target.value})} className="w-full p-4 bg-green-50 border border-green-200 rounded-xl text-lg font-black text-green-700 outline-none" />
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Confirm Booking & Sync Treasury'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Pitru Shradh Desk
      </div>
    </div>
  );
}
