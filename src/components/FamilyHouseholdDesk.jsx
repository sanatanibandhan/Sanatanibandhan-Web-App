import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, remove } from 'firebase/database';
import { db } from '../firebase';
import { 
  Home, Users, UserPlus, Search, ShieldCheck, Heart, 
  BookOpen, Plus, Edit, Trash2, X, Loader2, HelpCircle, Lightbulb, 
  CheckCircle2, AlertTriangle, WifiOff, MapPin, Award, Sparkles, FileText, Printer
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function FamilyHouseholdDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [sankalpModal, setSankalpModal] = useState(null); // Displays collective Sankalp text
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [households, setHouseholds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_households_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  // Household Form State
  const [householdForm, setHouseholdForm] = useState({
    headName: '',
    primaryGotra: 'Kashyap',
    address: '',
    contactPhone: '',
    familyMembersJson: '' // Comma or newline separated list of family members with relations
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_household_desk', { workspace_type: workspaceType });

    const hhRef = ref(db, `communities/${session.communityId}/households`);
    const unsub = onValue(hhRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ householdId: k, ...data[k] }));
        setHouseholds(list);
        localStorage.setItem(`sb_households_${session.communityId}`, JSON.stringify(list));
      } else {
        setHouseholds([]);
        localStorage.removeItem(`sb_households_${session.communityId}`);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsub(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast("Action cached offline. Syncing soon.", 'offline');
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast("Error: " + e.message, "error");
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

  // ➕ Save / Register Household Profile
  const handleSaveHousehold = async (e) => {
    e.preventDefault();
    if (!householdForm.headName.trim() || !householdForm.primaryGotra.trim()) {
      return showToast("Head of Household and Primary Gotra are required.", "error");
    }

    setSubmitting(true);
    try {
      const hhKey = `HH-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      // Parse family members from text input
      const membersArray = householdForm.familyMembersJson
        ? householdForm.familyMembersJson.split('\n').map(m => m.trim()).filter(Boolean)
        : [];

      const payload = {
        householdId: hhKey,
        headName: householdForm.headName.trim(),
        primaryGotra: householdForm.primaryGotra.trim(),
        address: householdForm.address.trim(),
        contactPhone: householdForm.contactPhone.trim(),
        familyMembers: membersArray,
        updatedAt: timestamp,
        registeredBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/households/${hhKey}`] = payload;

      await executeSafeUpdate(updates, "Sanatan Household successfully registered!");
      logAudit("HOUSEHOLD_REGISTERED", `Registered Family ID: ${hhKey} (${householdForm.headName})`);

      setShowModal(false);
      setHouseholdForm({ headName: '', primaryGotra: 'Kashyap', address: '', contactPhone: '', familyMembersJson: '' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHouseholds = useMemo(() => {
    return households.filter(h => 
      h.headName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.primaryGotra.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (h.address && h.address.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [households, searchTerm]);

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full">

      {/* TOAST PORTAL */}
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
            <Home className="text-sanatani-orange" size={32} /> Sanatan Household & Collective Sankalp Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Manage family units, link dependents under one Gotra, and generate collective Vedic Sankalp statements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> Guide
          </button>
          <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
            <Plus size={16}/> Register Family Unit
          </button>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Household Desk Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            In Sanatan tradition, rituals and donations are performed at the Grihastha (family) level. Registering households allows you to generate unified Sankalp declarations instantly for temple Purohits.
          </p>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-200">
        <div className="relative w-full sm:w-96">
          <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by family head, gotra, address..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-sanatani-orange shadow-sm"
          />
        </div>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2">Total Registered Households: {households.length}</span>
      </div>

      {/* HOUSEHOLD CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredHouseholds.length > 0 ? (
          filteredHouseholds.map(hh => (
            <div key={hh.householdId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                    Gotra: {hh.primaryGotra}
                  </span>
                  <span className="text-[9px] font-mono text-gray-400">{hh.householdId}</span>
                </div>

                <div>
                  <h3 className="text-xl font-black text-gray-900">{hh.headName} (Grihastha)</h3>
                  {hh.address && <p className="text-xs text-gray-500 font-bold mt-1 flex items-center gap-1"><MapPin size={12}/> {hh.address}</p>}
                </div>

                <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs font-bold space-y-1">
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Family Dependents ({hh.familyMembers?.length || 0})</p>
                  {hh.familyMembers && hh.familyMembers.length > 0 ? (
                    hh.familyMembers.map((m, idx) => <p key={idx} className="text-gray-800">• {m}</p>)
                  ) : (
                    <p className="text-gray-400 italic">No dependents listed.</p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex gap-2">
                <button 
                  onClick={() => setSankalpModal(hh)}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={14}/> Generate Sankalp
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
            <Home size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
            <p className="text-lg font-black text-gray-800 mb-1">No households registered.</p>
            <p className="text-xs uppercase tracking-widest">Click 'Register Family Unit' to begin mapping household cards.</p>
          </div>
        )}
      </div>

      {/* MODAL: REGISTER HOUSEHOLD */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Register Sanatan Family Unit</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveHousehold} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Head of Household (Karta) *</label>
                <input type="text" required value={householdForm.headName} onChange={e=>setHouseholdForm({...householdForm, headName: e.target.value})} placeholder="e.g. Adesh Chandra" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Primary Gotra *</label>
                  <input type="text" required value={householdForm.primaryGotra} onChange={e=>setHouseholdForm({...householdForm, primaryGotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Contact Phone</label>
                  <input type="tel" value={householdForm.contactPhone} onChange={e=>setHouseholdForm({...householdForm, contactPhone: e.target.value})} placeholder="017..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Address / Residence</label>
                <input type="text" value={householdForm.address} onChange={e=>setHouseholdForm({...householdForm, address: e.target.value})} placeholder="House / Village, City" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Family Members / Dependents (One per line)</label>
                <textarea rows="3" value={householdForm.familyMembersJson} onChange={e=>setHouseholdForm({...householdForm, familyMembersJson: e.target.value})} placeholder="Mala Rani (Spouse)&#10;Rohit Chandra (Son)" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none resize-none"></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Save Family Unit'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: COLLECTIVE SANKALP GENERATOR */}
      {sankalpModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">Vedic Sankalp Declaration</h3>
                <p className="text-xs text-sanatani-orange font-bold">Household ID: {sankalpModal.householdId}</p>
              </div>
              <button onClick={() => setSankalpModal(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <div className="bg-orange-50/50 p-5 rounded-2xl border border-orange-200 space-y-3 font-medium text-xs text-gray-800 leading-relaxed">
              <p className="font-black text-orange-900 text-sm">॥ संकल्प पाठ ॥</p>
              <p>
                "Om Vishnu, Vishnu, Vishnuḥ, adya brahmano... Gotre <strong>{sankalpModal.primaryGotra}</strong> utpannasya Śrī <strong>{sankalpModal.headName}</strong> saha-kuṭumbasya (family: {sankalpModal.familyMembers?.join(', ') || 'Self'})... śri-bhagavat-prītyarthe..."
              </p>
              <p className="text-[10px] text-gray-500 italic">This statement can be recited by the Purohit during temple offerings and collective Yajnas on behalf of this entire household.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { navigator.clipboard.writeText(`Gotra: ${sankalpModal.primaryGotra}, Karta: ${sankalpModal.headName}, Dependents: ${sankalpModal.familyMembers?.join(', ')}`); showToast("Sankalp copied to clipboard!"); }} className="flex-1 bg-gray-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest">
                Copy Sankalp Text
              </button>
              <button onClick={() => setSankalpModal(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-xs font-black uppercase tracking-widest">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Household Desk
      </div>
    </div>
  );
}
