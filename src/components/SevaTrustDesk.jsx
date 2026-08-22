import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, set, update } from 'firebase/database';
import { db } from '../firebase';
import { 
  HeartHandshake, Target, Receipt, Plus, CheckCircle2, 
  AlertTriangle, Loader2, X, WifiOff, Search, ShieldCheck, 
  PieChart, ArrowUpRight, CheckSquare, Clock
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function SevaTrustDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const [activeTab, setActiveTab] = useState('CAMPAIGNS'); // 'CAMPAIGNS' or 'AUDIT'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 💾 Data States
  const [campaigns, setCampaigns] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_trust_campaigns_${session?.communityId}`)) || []; } catch { return []; }});
  const [audits, setAudits] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_trust_audits_${session?.communityId}`)) || []; } catch { return []; }});

  // UI Modals
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  // Form States
  const [campaignForm, setCampaignForm] = useState({ title: '', targetAmount: 50000, deadline: new Date().toISOString().split('T')[0], description: '' });
  const [auditForm, setAuditForm] = useState({ campaignId: '', amountSpent: '', vendorName: '', description: '' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_trust_desk', { workspace_type: workspaceType });

    // Sync Campaigns
    const campRef = ref(db, `communities/${session.communityId}/trust_campaigns`);
    const unsubCamp = onValue(campRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const cArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.createdAt - a.createdAt);
        setCampaigns(cArray);
        localStorage.setItem(`sb_trust_campaigns_${session.communityId}`, JSON.stringify(cArray));
      } else { setCampaigns([]); }
    });

    // Sync Field Audits (Expenses)
    const auditRef = ref(db, `communities/${session.communityId}/trust_audits`);
    const unsubAudit = onValue(auditRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const aArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.submittedAt - a.submittedAt);
        setAudits(aArray);
        localStorage.setItem(`sb_trust_audits_${session.communityId}`, JSON.stringify(aArray));
      } else { setAudits([]); }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubCamp(); unsubAudit(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  // ✨ CAMPAIGN ENGINE
  const handleSaveCampaign = async (e) => {
    e.preventDefault();
    if (!isOnline) return showToast("Offline mode.", "error");
    setIsProcessing(true);
    try {
      const campId = push(ref(db, `communities/${session.communityId}/trust_campaigns`)).key;
      const newCampaign = { 
        ...campaignForm, 
        targetAmount: Number(campaignForm.targetAmount),
        raisedAmount: 0, // Starts at 0
        status: 'ACTIVE',
        createdAt: Date.now(), 
        loggedBy: session.userName 
      };
      await set(ref(db, `communities/${session.communityId}/trust_campaigns/${campId}`), newCampaign);
      showToast("Seva Campaign successfully launched!");
      setShowCampaignModal(false);
      setCampaignForm({ title: '', targetAmount: 50000, deadline: new Date().toISOString().split('T')[0], description: '' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  // ✨ FIELD AUDIT ENGINE (Volunteers logging expenses)
  const handleSaveAudit = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const auditId = push(ref(db, `communities/${session.communityId}/trust_audits`)).key;
      const linkedCamp = campaigns.find(c => c.id === auditForm.campaignId);
      
      const newAudit = {
        ...auditForm,
        amountSpent: Number(auditForm.amountSpent),
        campaignName: linkedCamp ? linkedCamp.title : 'General Trust Fund',
        status: 'PENDING_VERIFICATION', // Admins must verify
        submittedAt: Date.now(),
        submittedBy: session.userName,
        submittedById: session.uid
      };
      
      await set(ref(db, `communities/${session.communityId}/trust_audits/${auditId}`), newAudit);
      pushToDataLayer('generate_lead', { content_type: 'Field_Audit_Submitted', value: newAudit.amountSpent });
      showToast("Field expense submitted for Admin verification.");
      setShowAuditModal(false);
      setAuditForm({ campaignId: '', amountSpent: '', vendorName: '', description: '' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  // ✨ VERIFICATION ENGINE (Admin Only)
  const handleVerifyAudit = async (audit) => {
    if (!window.confirm(`Verify this expense of ৳${audit.amountSpent} submitted by ${audit.submittedBy}?`)) return;
    try {
      await update(ref(db), { [`communities/${session.communityId}/trust_audits/${audit.id}/status`]: 'VERIFIED' });
      showToast("Expense officially verified and recorded in the ledger.");
    } catch (e) { showToast(e.message, "error"); }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  const filteredCampaigns = campaigns.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5">

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg">
          <WifiOff size={18} /> <span className="text-xs font-black uppercase tracking-widest">Offline Mode</span>
        </div>
      )}

      {toast && createPortal(
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl bg-gray-900 text-white flex items-center gap-3 animate-in slide-in-from-top-4">
           {toast.type === 'error' ? <AlertTriangle size={20} className="text-red-400"/> : <CheckCircle2 size={20} className="text-green-400"/>}
           <p className="text-sm font-bold">{toast.message}</p>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <HeartHandshake className="text-indigo-600" size={26} /> Seva Trust Operations
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Campaign fundraising & field expense auditing.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button onClick={() => setActiveTab('CAMPAIGNS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${activeTab === 'CAMPAIGNS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><Target size={14}/> Campaigns</button>
            <button onClick={() => setActiveTab('AUDIT')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${activeTab === 'AUDIT' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><Receipt size={14}/> Field Audit</button>
          </div>

          {/* Admins create campaigns, but anyone can log a field expense */}
          {isManagerOrAdmin && activeTab === 'CAMPAIGNS' && (
            <button onClick={() => setShowCampaignModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Launch Campaign
            </button>
          )}
          {activeTab === 'AUDIT' && (
            <button onClick={() => setShowAuditModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Log Expense
            </button>
          )}
        </div>
      </div>

      {/* 🎯 TAB 1: FUNDRAISING CAMPAIGNS */}
      {activeTab === 'CAMPAIGNS' && (
        <div className="flex flex-col h-full space-y-4">
          <div className="relative w-full max-w-md">
             <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
             <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search campaigns..." className="w-full bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl text-sm font-bold focus:border-indigo-500 outline-none shadow-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto pb-6">
            {filteredCampaigns.map(camp => {
              const progress = Math.min(Math.round((camp.raisedAmount / camp.targetAmount) * 100), 100);
              const isComplete = progress >= 100;

              return (
                <div key={camp.id} className="bg-white border border-gray-200 p-6 rounded-3xl shadow-sm flex flex-col justify-between hover:border-indigo-300 transition-colors">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded border uppercase tracking-widest flex items-center gap-1 ${isComplete ? 'bg-green-50 text-green-700 border-green-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                        {isComplete ? <CheckCircle2 size={10}/> : <PieChart size={10}/>} 
                        {isComplete ? 'Goal Reached' : 'Active Drive'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400">Ends: {camp.deadline}</span>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">{camp.title}</h3>
                    <p className="text-xs font-bold text-gray-500 mb-6 line-clamp-2">{camp.description}</p>
                    
                    <div className="space-y-2 mb-2">
                       <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                         <span className="text-gray-500">Raised: ৳{camp.raisedAmount.toLocaleString()}</span>
                         <span className="text-indigo-600">Target: ৳{camp.targetAmount.toLocaleString()}</span>
                       </div>
                       <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner">
                         <div className={`h-full transition-all duration-1000 ${isComplete ? 'bg-green-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`} style={{ width: `${progress}%` }}></div>
                       </div>
                    </div>
                  </div>
                  
                  {isManagerOrAdmin && !isComplete && (
                    <div className="mt-6 pt-4 border-t border-gray-100 flex gap-2">
                       <button className="flex-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 text-[10px] font-black py-2.5 rounded-lg uppercase tracking-widest transition-colors border border-indigo-200 flex justify-center items-center gap-1.5">
                         <ArrowUpRight size={14}/> Add Funds
                       </button>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredCampaigns.length === 0 && (
              <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
                No active charity campaigns.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🧾 TAB 2: FIELD AUDIT (EXPENSES) */}
      {activeTab === 'AUDIT' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {audits.map(audit => (
            <div key={audit.id} className="bg-white border border-gray-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest flex items-center gap-1 ${audit.status === 'VERIFIED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {audit.status === 'VERIFIED' ? <ShieldCheck size={10}/> : <Clock size={10}/>} 
                    {audit.status === 'VERIFIED' ? 'Verified' : 'Pending Audit'}
                  </span>
                  <span className="text-sm font-black text-red-600 bg-red-50 px-2 py-0.5 rounded shadow-sm border border-red-100">-৳{audit.amountSpent}</span>
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-1">{audit.vendorName}</h3>
                <p className="text-[10px] font-bold text-gray-500 mb-4 uppercase tracking-widest">For: {audit.campaignName}</p>
                
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs font-bold text-gray-700 italic">
                  "{audit.description}"
                </div>
              </div>
              
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">By: {audit.submittedBy}</p>
                {isManagerOrAdmin && audit.status === 'PENDING_VERIFICATION' && (
                  <button onClick={() => handleVerifyAudit(audit)} className="bg-white border border-green-200 text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 shadow-sm">
                    <CheckSquare size={12}/> Verify
                  </button>
                )}
              </div>
            </div>
          ))}
          {audits.length === 0 && (
            <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
              No field expenses logged yet.
            </div>
          )}
        </div>
      )}

      {/* ✨ LAUNCH CAMPAIGN MODAL (Admins Only) */}
      {showCampaignModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border-t-4 border-indigo-600 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Target className="text-indigo-600" size={20}/> Launch Campaign</h3>
               <button onClick={() => setShowCampaignModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveCampaign} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Campaign Title *</label>
                 <input required type="text" value={campaignForm.title} onChange={e => setCampaignForm({...campaignForm, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Flood Relief Fund 2026" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Description *</label>
                 <textarea required rows="2" value={campaignForm.description} onChange={e => setCampaignForm({...campaignForm, description: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none resize-none" placeholder="What is this fund for?"></textarea>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Target Amount (৳) *</label>
                   <input required type="number" min="100" value={campaignForm.targetAmount} onChange={e => setCampaignForm({...campaignForm, targetAmount: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Deadline *</label>
                   <input required type="date" value={campaignForm.deadline} onChange={e => setCampaignForm({...campaignForm, deadline: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
                 </div>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex items-center justify-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'LAUNCH FUNDRAISER'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ LOG FIELD EXPENSE MODAL (Any User) */}
      {showAuditModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 border-t-4 border-gray-800 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Receipt size={20}/> Log Field Expense</h3>
               <button onClick={() => setShowAuditModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveAudit} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5">Link to Campaign (Optional)</label>
                 <select value={auditForm.campaignId} onChange={e => setAuditForm({...auditForm, campaignId: e.target.value})} className="w-full p-4 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-sm font-bold outline-none cursor-pointer shadow-sm">
                   <option value="">General Trust Fund</option>
                   {campaigns.filter(c => c.status === 'ACTIVE').map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                 </select>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Vendor / Shop Name *</label>
                 <input required type="text" value={auditForm.vendorName} onChange={e => setAuditForm({...auditForm, vendorName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Sharma Traders" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Amount Spent (৳) *</label>
                 <input required type="number" min="1" value={auditForm.amountSpent} onChange={e => setAuditForm({...auditForm, amountSpent: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. 5000" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Items Purchased / Description *</label>
                 <textarea required rows="2" value={auditForm.description} onChange={e => setAuditForm({...auditForm, description: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none resize-none" placeholder="e.g. Bought 50 blankets for distribution."></textarea>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex justify-center items-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'SUBMIT FOR AUDIT'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
