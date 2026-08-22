import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  GitBranch, Users, UserPlus, Search, ShieldCheck, Heart, 
  BookOpen, Plus, Edit, Trash2, X, Loader2, HelpCircle, Lightbulb, 
  CheckCircle2, AlertTriangle, WifiOff, MapPin, Award, Network, LayoutGrid
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function VanshavaliDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'TREE'

  // 💾 Offline Cached States
  const [lineageRecords, setLineageRecords] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_lineage_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  // Form State for Ancestor / Lineage Entry
  const [lineageForm, setLineageForm] = useState({
    fullName: '',
    gotra: 'Kashyap',
    pravara: '',
    moolVillage: '',
    fatherName: '',
    motherName: '',
    spouseName: '',
    parentId: 'ROOT' // ✨ Hierarchical parent linkage
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_lineage_desk', { workspace_type: workspaceType });

    const lineageRef = ref(db, `communities/${session.communityId}/lineage_tree`);
    const unsub = onValue(lineageRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setLineageRecords(list);
        localStorage.setItem(`sb_lineage_${session.communityId}`, JSON.stringify(list));
      } else {
        setLineageRecords([]);
        localStorage.removeItem(`sb_lineage_${session.communityId}`);
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

  const handleSaveLineage = async (e) => {
    e.preventDefault();
    if (!lineageForm.fullName.trim() || !lineageForm.gotra.trim()) {
      return showToast("Full Name and Gotra are required.", "error");
    }

    setSubmitting(true);
    try {
      const recordKey = `LIN-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = {
        ...lineageForm,
        id: recordKey,
        updatedAt: Date.now(),
        addedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/lineage_tree/${recordKey}`] = payload;

      await executeSafeUpdate(updates, "Lineage record successfully saved to family tree!");
      setShowModal(false);
      setLineageForm({ fullName: '', gotra: 'Kashyap', pravara: '', moolVillage: '', fatherName: '', motherName: '', spouseName: '', parentId: 'ROOT' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRecords = useMemo(() => {
    return lineageRecords.filter(r => 
      r.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.gotra.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.moolVillage && r.moolVillage.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [lineageRecords, searchTerm]);

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
            <GitBranch className="text-sanatani-orange" size={32} /> Vanshavali & Gotra Lineage Registry
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Preserve ancestral roots, map Gotra lineage, and document family generations digitally.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner border">
            <button onClick={() => setViewMode('GRID')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewMode === 'GRID' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500'}`}>
              <LayoutGrid size={14}/> Grid View
            </button>
            <button onClick={() => setViewMode('TREE')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewMode === 'TREE' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500'}`}>
              <Network size={14}/> Tree View
            </button>
          </div>

          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> Guide
          </button>
          <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
            <Plus size={16}/> Add Ancestor / Branch
          </button>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Lineage Registry Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Record your ancestral lineage by logging parents, Gotra, Pravara, and Mool (ancestral village). Link descendants to parent nodes to construct a complete multi-generational family tree.
          </p>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-200">
        <div className="relative w-full sm:w-96">
          <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name, gotra, village..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-black outline-none focus:border-sanatani-orange shadow-sm"
          />
        </div>
        <span className="text-xs font-black text-gray-500 uppercase tracking-widest px-2">Total Lineage Nodes: {lineageRecords.length}</span>
      </div>

      {/* VIEW MODE 1: GRID VIEW */}
      {viewMode === 'GRID' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in">
          {filteredRecords.length > 0 ? (
            filteredRecords.map(rec => (
              <div key={rec.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                      Gotra: {rec.gotra}
                    </span>
                    {rec.moolVillage && (
                      <span className="text-[9px] font-black text-gray-500 flex items-center gap-1">
                        <MapPin size={12}/> {rec.moolVillage}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-black text-gray-900">{rec.fullName}</h3>

                  <div className="space-y-1 text-xs text-gray-600 font-bold bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                    <p>Father: <span className="text-gray-900 font-black">{rec.fatherName || 'Not Specified'}</span></p>
                    <p>Mother: <span className="text-gray-900 font-black">{rec.motherName || 'Not Specified'}</span></p>
                    <p>Spouse: <span className="text-gray-900 font-black">{rec.spouseName || 'Not Specified'}</span></p>
                  </div>

                  {rec.pravara && (
                    <p className="text-[10px] text-gray-400 font-mono italic">Pravara: {rec.pravara}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-gray-400 font-black bg-gray-50 rounded-3xl border border-gray-100">
              <GitBranch size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
              <p className="text-lg font-black text-gray-800 mb-1">No lineage records found.</p>
              <p className="text-xs uppercase tracking-widest font-black">Click 'Add Ancestor / Branch' to begin documenting your family tree.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: HIERARCHICAL TREE VIEW */}
      {viewMode === 'TREE' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6 animate-in fade-in">
          <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Network size={18} className="text-sanatani-orange"/> Hierarchical Lineage Tree
          </h3>

          <div className="space-y-4 border-l-2 border-orange-200 pl-4 sm:pl-6 ml-2">
            {lineageRecords.length > 0 ? (
              lineageRecords.map(rec => (
                <div key={rec.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-200 shadow-sm space-y-2 relative">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-orange-100 text-orange-800">Gotra: {rec.gotra}</span>
                    <span className="text-[10px] font-mono text-gray-400">ID: {rec.id}</span>
                  </div>
                  <h4 className="font-black text-gray-900 text-base">{rec.fullName}</h4>
                  <div className="text-xs font-bold text-gray-600 flex flex-wrap gap-4 pt-1">
                    <span>Father: {rec.fatherName || 'N/A'}</span>
                    <span>Mother: {rec.motherName || 'N/A'}</span>
                    {rec.moolVillage && <span>Village: {rec.moolVillage}</span>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 font-black italic">No lineage nodes available to display tree.</p>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD ANCESTOR */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Add Lineage Record</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveLineage} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Full Name *</label>
                <input type="text" required value={lineageForm.fullName} onChange={e=>setLineageForm({...lineageForm, fullName: e.target.value})} placeholder="e.g. Birendra Chandra" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra *</label>
                  <input type="text" required value={lineageForm.gotra} onChange={e=>setLineageForm({...lineageForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Mool (Village / Region)</label>
                  <input type="text" value={lineageForm.moolVillage} onChange={e=>setLineageForm({...lineageForm, moolVillage: e.target.value})} placeholder="e.g. Rampur" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Father's Name</label>
                  <input type="text" value={lineageForm.fatherName} onChange={e=>setLineageForm({...lineageForm, fatherName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Mother's Name</label>
                  <input type="text" value={lineageForm.motherName} onChange={e=>setLineageForm({...lineageForm, motherName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Spouse Name</label>
                  <input type="text" value={lineageForm.spouseName} onChange={e=>setLineageForm({...lineageForm, spouseName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Link to Parent Node</label>
                  <select value={lineageForm.parentId} onChange={e=>setLineageForm({...lineageForm, parentId: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black outline-none cursor-pointer">
                    <option value="ROOT">Root Ancestor (Top Level)</option>
                    {lineageRecords.map(r => (
                      <option key={r.id} value={r.id}>{r.fullName} ({r.gotra})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Pravara (Seer Sages)</label>
                <input type="text" value={lineageForm.pravara} onChange={e=>setLineageForm({...lineageForm, pravara: e.target.value})} placeholder="e.g. Kashyap, Avatsara, Naidhruva" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black outline-none" />
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Save Lineage Node'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Vanshavali Registry
      </div>
    </div>
  );
}
