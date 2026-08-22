import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  ShieldCheck, FileText, CheckCircle2, XCircle, Plus, X, Loader2, 
  HelpCircle, Lightbulb, AlertTriangle, WifiOff, Award, Sparkles, Scale, Users
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function TrusteeGovernanceDesk({ session, isOnline = navigator.onLine }) {
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
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [resolutions, setResolutions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_resolutions_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Resolution Form State
  const [resForm, setResForm] = useState({
    title: '',
    description: '',
    proposedBy: session?.userName || '',
    category: 'Financial Budget & Expenditure'
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_trustee_governance', { workspace_type: workspaceType });

    const resRef = ref(db, `communities/${session.communityId}/trustee_resolutions`);
    const unsub = onValue(resRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ resolutionId: k, ...data[k] }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setResolutions(list);
        localStorage.setItem(`sb_resolutions_${session.communityId}`, JSON.stringify(list));
      } else {
        setResolutions([]);
        localStorage.removeItem(`sb_resolutions_${session.communityId}`);
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

  // ➕ Propose Resolution
  const handleCreateResolution = async (e) => {
    e.preventDefault();
    if (!resForm.title.trim() || !resForm.description.trim()) {
      return showToast("Resolution Title and Description are required.", "error");
    }

    setSubmitting(true);
    try {
      const resKey = `RES-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...resForm,
        resolutionId: resKey,
        status: 'PENDING', // PENDING, PASSED, REJECTED
        votes: {},
        timestamp: timestamp
      };

      const updates = {};
      updates[`communities/${session.communityId}/trustee_resolutions/${resKey}`] = payload;

      await executeSafeUpdate(updates, "Official resolution proposed successfully!");
      logAudit("RESOLUTION_PROPOSED", `Proposed resolution: ${resForm.title}`);

      setShowModal(false);
      setResForm({ title: '', description: '', proposedBy: session?.userName || '', category: 'Financial Budget & Expenditure' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 👍 Vote on Resolution
  const handleVote = async (res, voteType) => {
    const userId = session.uid;
    const votesMap = res.votes || {};

    const updates = {};
    updates[`communities/${session.communityId}/trustee_resolutions/${res.resolutionId}/votes/${userId}`] = {
      voterName: session.userName,
      vote: voteType, // 'APPROVE' | 'OPPOSE'
      votedAt: Date.now()
    };

    // Automatically check if majority is reached (e.g. 2+ approvals makes it PASSED)
    const updatedVotes = { ...votesMap, [userId]: { vote: voteType } };
    const approvals = Object.values(updatedVotes).filter(v => v.vote === 'APPROVE').length;
    if (approvals >= 2) {
      updates[`communities/${session.communityId}/trustee_resolutions/${res.resolutionId}/status`] = 'PASSED';
    }

    await executeSafeUpdate(updates, `Vote recorded: ${voteType}`);
    logAudit("RESOLUTION_VOTED", `User ${session.userName} voted ${voteType} on resolution ${res.resolutionId}`);
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
            <Scale className="text-sanatani-orange" size={32} /> {institutionLabel} Trustee & Committee Governance
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Manage official board resolutions, track trustee voting records, and maintain immutable meeting minutes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Propose Resolution
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Governance Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Transparent institutional governance protects trusts and committees from disputes. Board members can review proposals and record digital votes to pass formal resolutions.
          </p>
        </div>
      )}

      {/* RESOLUTIONS GRID */}
      <div className="space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <FileText size={18} className="text-sanatani-orange"/> Official Board Resolutions ({resolutions.length})
        </h3>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {resolutions.length > 0 ? (
            resolutions.map(res => {
              const votesList = res.votes ? Object.keys(res.votes).map(k => ({ id: k, ...res.votes[k] })) : [];
              const myVote = res.votes && res.votes[session.uid] ? res.votes[session.uid].vote : null;

              return (
                <div key={res.resolutionId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                        {res.category}
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md border ${res.status === 'PASSED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {res.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-2xl font-black text-gray-900">{res.title}</h3>
                      <p className="text-xs text-gray-400 font-bold mt-0.5">Proposed by: <span className="text-gray-800">{res.proposedBy}</span></p>
                      <p className="text-xs text-gray-600 font-medium mt-3 leading-relaxed whitespace-pre-wrap">{res.description}</p>
                    </div>

                    {/* Votes Summary */}
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        <Users size={12} className="text-sanatani-orange"/> Trustee Votes Recorded ({votesList.length})
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {votesList.length > 0 ? (
                          votesList.map(v => (
                            <span key={v.id} className={`text-xs font-black px-3 py-1 rounded-xl border ${v.vote === 'APPROVE' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                              {v.voterName}: {v.vote}
                            </span>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 italic">No votes cast yet.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Voting Actions */}
                  {res.status === 'PENDING' && isManagerOrAdmin && (
                    <div className="pt-4 border-t border-gray-100 flex gap-3">
                      <button 
                        onClick={() => handleVote(res, 'APPROVE')}
                        className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-all ${myVote === 'APPROVE' ? 'bg-green-600 text-white' : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'}`}
                      >
                        ✓ Approve
                      </button>
                      <button 
                        onClick={() => handleVote(res, 'OPPOSE')}
                        className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-all ${myVote === 'OPPOSE' ? 'bg-red-600 text-white' : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'}`}
                      >
                        ✕ Oppose
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
              <Scale size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
              <p className="text-lg font-black text-gray-800 mb-1">No board resolutions recorded.</p>
              <p className="text-xs uppercase tracking-widest">Click 'Propose Resolution' to submit a formal agenda item.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: PROPOSE RESOLUTION */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Propose Official Resolution</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleCreateResolution} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Resolution Title *</label>
                <input type="text" required value={resForm.title} onChange={e=>setResForm({...resForm, title: e.target.value})} placeholder="e.g. Approval of Annual Durga Puja Festival Budget" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Proposed By *</label>
                  <input type="text" required value={resForm.proposedBy} onChange={e=>setResForm({...resForm, proposedBy: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Category</label>
                  <select value={resForm.category} onChange={e=>setResForm({...resForm, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Financial Budget & Expenditure">Financial Budget & Expenditure</option>
                    <option value="Asset & Property Management">Asset & Property Management</option>
                    <option value="Festival & Event Policy">Festival & Event Policy</option>
                    <option value="Executive Appointment">Executive Appointment</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Resolution Details & Agenda *</label>
                <textarea rows="4" required value={resForm.description} onChange={e=>setResForm({...resForm, description: e.target.value})} placeholder="State full details of the resolution to be voted upon by trustees..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none resize-none"></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Submit Resolution for Voting'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Governance Desk
      </div>
    </div>
  );
}
