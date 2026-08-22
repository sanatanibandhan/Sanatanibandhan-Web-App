import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Utensils, Soup, Heart, Calendar, Users, Plus, X, Loader2, 
  HelpCircle, Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Banknote, Sparkles
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function AnnadanamDesk({ session, isOnline = navigator.onLine }) {
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
      case 'MANDIR':
      default: return 'Mandir';
    }
  }, [workspaceType]);

  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [sponsorModal, setSponsorModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [slots, setSlots] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_annadanam_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Slot Form State
  const [slotForm, setSlotForm] = useState({
    title: '',
    date: '',
    mealType: 'Lunch / Maha-Prasadam',
    targetMealsCount: '150',
    estimatedCost: '5000'
  });

  // Sponsorship Form State
  const [sponsorForm, setSponsorForm] = useState({
    sponsorName: session?.userName || '',
    gotra: '',
    amount: '',
    isAnonymous: false
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_annadanam_desk', { workspace_type: workspaceType });

    const slotRef = ref(db, `communities/${session.communityId}/annadanam_slots`);
    const unsub = onValue(slotRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ slotId: k, ...data[k] }));
        list.sort((a, b) => new Date(a.date) - new Date(b.date));
        setSlots(list);
        localStorage.setItem(`sb_annadanam_${session.communityId}`, JSON.stringify(list));
      } else {
        setSlots([]);
        localStorage.removeItem(`sb_annadanam_${session.communityId}`);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsub(); clearTimeout(failsafe); };
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

  // ➕ Create Annadanam Slot
  const handleCreateSlot = async (e) => {
    e.preventDefault();
    if (!slotForm.title.trim() || !slotForm.date) {
      return showToast("Title and Date are required.", "error");
    }

    setSubmitting(true);
    try {
      const slotKey = `ANNA-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...slotForm,
        slotId: slotKey,
        targetMealsCount: parseInt(slotForm.targetMealsCount) || 100,
        estimatedCost: parseFloat(slotForm.estimatedCost) || 0,
        raisedAmount: 0,
        sponsors: {},
        status: 'OPEN',
        createdAt: timestamp,
        createdBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/annadanam_slots/${slotKey}`] = payload;

      await executeSafeUpdate(updates, "Annadanam slot successfully created!");
      logAudit("ANNADANAM_CREATED", `Created slot: ${slotForm.title} for ${slotForm.date}`);

      setShowModal(false);
      setSlotForm({ title: '', date: '', mealType: 'Lunch / Maha-Prasadam', targetMealsCount: '150', estimatedCost: '5000' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 💖 Sponsor Annadanam Slot
  const handleSponsorSubmit = async (e) => {
    e.preventDefault();
    if (!sponsorModal) return;
    const amt = parseFloat(sponsorForm.amount);
    if (isNaN(amt) || amt <= 0) return showToast("Enter a valid sponsorship amount.", "error");

    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const sponsorKey = push(ref(db, `communities/${session.communityId}/annadanam_slots/${sponsorModal.slotId}/sponsors`)).key;
      
      const sponsorPayload = {
        sponsorId: sponsorKey,
        name: sponsorForm.isAnonymous ? 'Anonymous Devotee' : (sponsorForm.donorName.trim() || 'Devotee'),
        gotra: sponsorForm.gotra.trim() || 'Kashyap',
        amount: amt,
        timestamp: timestamp
      };

      const newRaised = (sponsorModal.raisedAmount || 0) + amt;

      const updates = {};
      updates[`communities/${session.communityId}/annadanam_slots/${sponsorModal.slotId}/raisedAmount`] = newRaised;
      updates[`communities/${session.communityId}/annadanam_slots/${sponsorModal.slotId}/sponsors/${sponsorKey}`] = sponsorPayload;

      // Sync to Treasury Ledger
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
        id: transId,
        name: `${sponsorPayload.name} [Annadanam Seva]`,
        amount: amt,
        note: `Annadanam: ${sponsorModal.title} (Gotra: ${sponsorPayload.gotra})`,
        collector: `${session.userName} (Annadanam Desk)`,
        timestamp: timestamp,
        category: 'Prasadam Sales'
      };

      await executeSafeUpdate(updates, "Annadanam sponsorship successfully recorded & synced to Treasury!");
      logAudit("ANNADANAM_SPONSORSHIP", `Sponsored ৳${amt} for Annadanam: ${sponsorModal.title}`);

      setSponsorModal(null);
      setSponsorForm({ sponsorName: session?.userName || '', gotra: '', amount: '', isAnonymous: false });
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
            <Soup className="text-sanatani-orange" size={32} /> {institutionLabel} Annadanam & Welfare Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Coordinate daily community meals, relief kitchen schedules, and patron sponsorships.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Schedule Annadanam Slot
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Annadanam Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Annadanam (feeding the needy and devotees) is the highest form of Seva. List upcoming meal slots, track target meals and costs, and allow patrons to sponsor individual slots with automatic Treasury integration.
          </p>
        </div>
      )}

      {/* SLOTS GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {slots.length > 0 ? (
          slots.map(slot => {
            const raised = slot.raisedAmount || 0;
            const cost = slot.estimatedCost || 1;
            const percentage = Math.min(100, Math.round((raised / cost) * 100));
            const sponsorsList = slot.sponsors ? Object.keys(slot.sponsors).map(k => ({ id: k, ...slot.sponsors[k] })) : [];

            return (
              <div key={slot.slotId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                      {slot.mealType}
                    </span>
                    <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                      <Calendar size={14}/> {slot.date}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-gray-900">{slot.title}</h3>
                    <p className="text-xs text-gray-600 font-bold mt-1">Target Beneficiaries: <span className="text-gray-900 font-black">{slot.targetMealsCount} People</span></p>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center text-xs font-black">
                      <span className="text-green-600">Sponsored: {curSymbol}{raised.toLocaleString()}</span>
                      <span className="text-gray-400">Est. Cost: {curSymbol}{cost.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden border border-gray-200">
                      <div className="bg-gradient-to-r from-orange-500 to-green-500 h-full transition-all duration-1000 ease-out" style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>

                  {/* Sponsors List */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                      <Users size={12} className="text-sanatani-orange"/> Annadanam Patrons ({sponsorsList.length})
                    </p>
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {sponsorsList.length > 0 ? (
                        sponsorsList.map(s => (
                          <div key={s.sponsorId} className="flex justify-between items-center bg-white p-2 rounded-xl border border-gray-100 text-xs font-bold">
                            <span className="text-gray-800">{s.name} <span className="text-[9px] text-gray-400 font-mono">({s.gotra})</span></span>
                            <span className="text-green-600 font-black">+{curSymbol}{s.amount}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">No sponsors yet. Be the first patron for this meal!</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button 
                    onClick={() => setSponsorModal(slot)}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Heart size={16}/> Sponsor This Annadanam 🍲
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
            <Soup size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
            <p className="text-lg font-black text-gray-800 mb-1">No Annadanam slots scheduled.</p>
            <p className="text-xs uppercase tracking-widest">Click 'Schedule Annadanam Slot' to list a community meal date.</p>
          </div>
        )}
      </div>

      {/* MODAL: SCHEDULE SLOT */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Schedule Annadanam Slot</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleCreateSlot} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Slot Title / Occasion *</label>
                <input type="text" required value={slotForm.title} onChange={e=>setSlotForm({...slotForm, title: e.target.value})} placeholder="e.g. Ekadashi Maha-Prasadam / Sunday Feeding" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Date *</label>
                  <input type="date" required value={slotForm.date} onChange={e=>setSlotForm({...slotForm, date: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Meal Type</label>
                  <select value={slotForm.mealType} onChange={e=>setSlotForm({...slotForm, mealType: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Lunch / Maha-Prasadam">Lunch / Maha-Prasadam</option>
                    <option value="Dinner / Evening Seva">Dinner / Evening Seva</option>
                    <option value="Special Bhandara">Special Bhandara</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Target Count (People)</label>
                  <input type="number" required value={slotForm.targetMealsCount} onChange={e=>setSlotForm({...slotForm, targetMealsCount: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Estimated Cost ({curSymbol})</label>
                  <input type="number" required value={slotForm.estimatedCost} onChange={e=>setSlotForm({...slotForm, estimatedCost: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Publish Annadanam Slot'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: SPONSOR SLOT */}
      {sponsorModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-green-600 flex flex-col p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">Sponsor Annadanam</h3>
                <p className="text-xs text-sanatani-orange font-bold truncate max-w-[280px]">{sponsorModal.title}</p>
              </div>
              <button onClick={() => setSponsorModal(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSponsorSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Patron / Sponsor Name *</label>
                <input type="text" required={!sponsorForm.isAnonymous} disabled={sponsorForm.isAnonymous} value={sponsorForm.sponsorName} onChange={e=>setSponsorForm({...sponsorForm, sponsorName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none disabled:opacity-50" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra (For Sankalp)</label>
                <input type="text" value={sponsorForm.gotra} onChange={e=>setSponsorForm({...sponsorForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Sponsorship Amount ({curSymbol}) *</label>
                <input type="number" required value={sponsorForm.amount} onChange={e=>setSponsorForm({...sponsorForm, amount: e.target.value})} placeholder="2000" className="w-full p-4 bg-green-50 border border-green-200 rounded-xl text-lg font-black text-green-700 outline-none" />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="anon_anna" checked={sponsorForm.isAnonymous} onChange={e=>setSponsorForm({...sponsorForm, isAnonymous: e.target.checked})} className="w-4 h-4 accent-sanatani-orange cursor-pointer" />
                <label htmlFor="anon_anna" className="text-xs font-bold text-gray-700 cursor-pointer">Contribute anonymously</label>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Confirm Sponsorship & Sync Treasury'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Annadanam Desk
      </div>
    </div>
  );
}
