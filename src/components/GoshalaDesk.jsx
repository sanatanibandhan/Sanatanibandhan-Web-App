import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Heart, ShieldCheck, Plus, X, Loader2, HelpCircle, 
  Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Banknote, Sparkles, Award, Users
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function GoshalaDesk({ session, isOnline = navigator.onLine }) {
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
  const [showCowModal, setShowCowModal] = useState(false);
  const [sponsorModal, setSponsorModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [cows, setCows] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_cows_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [sponsorships, setSponsorships] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_gauseva_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Cow Form State
  const [cowForm, setCowForm] = useState({
    tagNumber: '',
    cowName: '',
    breed: 'Gir / Indigenous',
    ageYears: '3',
    healthStatus: 'HEALTHY'
  });

  // Sponsorship Form State
  const [sponsorForm, setSponsorForm] = useState({
    patronName: session?.userName || '',
    gotra: '',
    packageName: 'Monthly Fodder Seva (Grass & Dana)',
    amount: '1000',
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
    pushToDataLayer('view_goshala_desk', { workspace_type: workspaceType });

    const cowRef = ref(db, `communities/${session.communityId}/goshala_cows`);
    const unsubCow = onValue(cowRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ cowId: k, ...data[k] }));
        setCows(list);
        localStorage.setItem(`sb_cows_${session.communityId}`, JSON.stringify(list));
      } else {
        setCows([]);
      }
    });

    const spRef = ref(db, `communities/${session.communityId}/gauseva_sponsorships`);
    const unsubSp = onValue(spRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ sponsorId: k, ...data[k] }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setSponsorships(list);
        localStorage.setItem(`sb_gauseva_${session.communityId}`, JSON.stringify(list));
      } else {
        setSponsorships([]);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubCow(); unsubSp(); clearTimeout(failsafe); };
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

  // 🐄 Register Cow
  const handleSaveCow = async (e) => {
    e.preventDefault();
    if (!cowForm.tagNumber.trim() || !cowForm.cowName.trim()) {
      return showToast("Tag Number and Name are required.", "error");
    }

    setSubmitting(true);
    try {
      const cowKey = `COW-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...cowForm,
        cowId: cowKey,
        registeredAt: timestamp,
        registeredBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/goshala_cows/${cowKey}`] = payload;

      await executeSafeUpdate(updates, "Gau Mata profile successfully registered!");
      logAudit("COW_REGISTERED", `Registered cow: ${cowForm.cowName} (Tag: ${cowForm.tagNumber})`);

      setShowCowModal(false);
      setCowForm({ tagNumber: '', cowName: '', breed: 'Gir / Indigenous', ageYears: '3', healthStatus: 'HEALTHY' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 💖 Submit Gau-Seva Sponsorship
  const handleSponsorshipSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(sponsorForm.amount);
    if (isNaN(amt) || amt <= 0) return showToast("Enter a valid contribution amount.", "error");

    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const spKey = push(ref(db, `communities/${session.communityId}/gauseva_sponsorships`)).key;

      const payload = {
        ...sponsorForm,
        sponsorId: spKey,
        patronName: sponsorForm.isAnonymous ? 'Anonymous Devotee' : (sponsorForm.patronName.trim() || 'Devotee'),
        gotra: sponsorForm.gotra.trim() || 'Kashyap',
        amount: amt,
        timestamp: timestamp
      };

      const updates = {};
      updates[`communities/${session.communityId}/gauseva_sponsorships/${spKey}`] = payload;

      // Sync to Treasury Ledger
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
        id: transId,
        name: `${payload.patronName} [Gau-Seva]`,
        amount: amt,
        note: `Package: ${sponsorForm.packageName} (Gotra: ${payload.gotra})`,
        collector: `${session.userName} (Goshala Desk)`,
        timestamp: timestamp,
        category: 'Asset Donation'
      };

      await executeSafeUpdate(updates, "Gau-Seva sponsorship successfully recorded & synced to Treasury!");
      logAudit("GAUSEVA_SPONSORSHIP", `Recorded ৳${amt} Gau-Seva from ${payload.patronName}`);

      setSponsorModal(false);
      setSponsorForm({ patronName: session?.userName || '', gotra: '', packageName: 'Monthly Fodder Seva (Grass & Dana)', amount: '1000', isAnonymous: false });
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
            <Heart className="text-sanatani-orange" size={32} /> {institutionLabel} Goshala & Gau-Seva Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Manage cattle health rosters, fodder contributions, and dedicated Gau-Seva sponsorships.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          <button onClick={() => setSponsorModal(true)} className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
            <Sparkles size={16}/> Sponsor Gau-Seva 🐄
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setShowCowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Register Cow
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Goshala Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Protect and nurture Gau Mata. Register cattle identification tags and health status, while allowing patrons to sponsor fodder funds that automatically sync to the Treasury Ledger.
          </p>
        </div>
      )}

      {/* COWS GRID */}
      <div className="space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Award size={18} className="text-sanatani-orange"/> Cattle Roster ({cows.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {cows.length > 0 ? (
            cows.map(cow => (
              <div key={cow.cowId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-200">
                      {cow.healthStatus}
                    </span>
                    <span className="text-xs font-mono font-bold text-gray-400">Tag: #{cow.tagNumber}</span>
                  </div>

                  <div>
                    <h4 className="text-2xl font-black text-gray-900">{cow.cowName}</h4>
                    <p className="text-xs font-bold text-sanatani-orange mt-0.5">{cow.breed} • {cow.ageYears} Years</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
              <Heart size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
              <p className="text-lg font-black text-gray-800 mb-1">No cattle registered in roster.</p>
              <p className="text-xs uppercase tracking-widest">Click 'Register Cow' to add cattle profiles.</p>
            </div>
          )}
        </div>
      </div>

      {/* SPONSORSHIPS HISTORY */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Users size={18} className="text-green-600"/> Recent Gau-Seva Contributions ({sponsorships.length})
        </h3>

        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {sponsorships.length > 0 ? (
            sponsorships.map(sp => (
              <div key={sp.sponsorId} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-orange-50 text-orange-700 border">{sp.packageName}</span>
                  <h4 className="font-black text-gray-900 text-sm pt-1">{sp.patronName} <span className="text-xs text-gray-500 font-bold">({sp.gotra})</span></h4>
                  <p className="text-[10px] text-gray-400 font-mono">{new Date(sp.timestamp).toLocaleDateString()}</p>
                </div>
                <span className="text-sm font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-xl border border-green-200">
                  +{curSymbol}{sp.amount}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400 italic text-center py-6">No sponsorships recorded yet.</p>
          )}
        </div>
      </div>

      {/* MODAL: REGISTER COW */}
      {showCowModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Register Cow / Cattle</h3>
              <button onClick={() => setShowCowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveCow} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Ear Tag Number *</label>
                  <input type="text" required value={cowForm.tagNumber} onChange={e=>setCowForm({...cowForm, tagNumber: e.target.value})} placeholder="e.g. 4021" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Cow Name *</label>
                  <input type="text" required value={cowForm.cowName} onChange={e=>setCowForm({...cowForm, cowName: e.target.value})} placeholder="e.g. Ganga" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Breed</label>
                  <input type="text" value={cowForm.breed} onChange={e=>setCowForm({...cowForm, breed: e.target.value})} placeholder="Gir / Sahiwal" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Age (Years)</label>
                  <input type="number" value={cowForm.ageYears} onChange={e=>setCowForm({...cowForm, ageYears: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Save Cattle Profile'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: SPONSOR GAUSEVA */}
      {sponsorModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-green-600 flex flex-col p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">Sponsor Gau-Seva</h3>
                <p className="text-xs text-green-600 font-bold">Fodder & Healthcare Support</p>
              </div>
              <button onClick={() => setSponsorModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSponsorshipSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Patron / Donor Name *</label>
                <input type="text" required={!sponsorForm.isAnonymous} disabled={sponsorForm.isAnonymous} value={sponsorForm.patronName} onChange={e=>setSponsorForm({...sponsorForm, patronName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none disabled:opacity-50" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra (For Sankalp)</label>
                <input type="text" value={sponsorForm.gotra} onChange={e=>setSponsorForm({...sponsorForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Sponsorship Package</label>
                <select value={sponsorForm.packageName} onChange={e=>setSponsorForm({...sponsorForm, packageName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                  <option value="Monthly Fodder Seva (Grass & Dana)">Monthly Fodder Seva (Grass & Dana)</option>
                  <option value="One Day Cow Feeding Sponsor">One Day Cow Feeding Sponsor</option>
                  <option value="Medical & Medicine Seva">Medical & Medicine Seva</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Amount ({curSymbol}) *</label>
                <input type="number" required value={sponsorForm.amount} onChange={e=>setSponsorForm({...sponsorForm, amount: e.target.value})} className="w-full p-4 bg-green-50 border border-green-200 rounded-xl text-lg font-black text-green-700 outline-none" />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="anon_gs" checked={sponsorForm.isAnonymous} onChange={e=>setSponsorForm({...sponsorForm, isAnonymous: e.target.checked})} className="w-4 h-4 accent-sanatani-orange cursor-pointer" />
                <label htmlFor="anon_gs" className="text-xs font-bold text-gray-700 cursor-pointer">Contribute anonymously</label>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Confirm Sponsorship & Sync Treasury'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Goshala Desk
      </div>
    </div>
  );
}
