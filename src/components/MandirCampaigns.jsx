import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Flag, Target, Heart, Award, Plus, X, Loader2, HelpCircle, 
  Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Sparkles, Banknote, Users
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function MandirCampaigns({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  // ✨ Dynamic Institution Label mapping for all exact 8 Organization Types from workspace selection
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [donateModal, setDonateModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [campaigns, setCampaigns] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_campaigns_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Campaign Form State
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    description: '',
    targetAmount: '',
    category: 'Infrastructure & Renovation'
  });

  // Donation Form State
  const [donationForm, setDonationForm] = useState({
    donorName: session?.userName || '',
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
    pushToDataLayer('view_institution_campaigns', { workspace_type: workspaceType });

    const campRef = ref(db, `communities/${session.communityId}/campaigns`);
    const unsub = onValue(campRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ campaignId: k, ...data[k] }));
        setCampaigns(list);
        localStorage.setItem(`sb_campaigns_${session.communityId}`, JSON.stringify(list));
      } else {
        setCampaigns([]);
        localStorage.removeItem(`sb_campaigns_${session.communityId}`);
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

  // ➕ Create Campaign
  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!campaignForm.title.trim() || !campaignForm.targetAmount) {
      return showToast("Campaign Title and Target Amount are required.", "error");
    }

    setSubmitting(true);
    try {
      const campKey = `CAMP-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...campaignForm,
        campaignId: campKey,
        targetAmount: parseFloat(campaignForm.targetAmount) || 0,
        raisedAmount: 0,
        donors: {},
        status: 'ACTIVE',
        createdAt: timestamp,
        createdBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/campaigns/${campKey}`] = payload;

      await executeSafeUpdate(updates, "Crowdfunding campaign successfully launched!");
      logAudit("CAMPAIGN_CREATED", `Launched campaign: ${campaignForm.title}`);

      setShowCreateModal(false);
      setCampaignForm({ title: '', description: '', targetAmount: '', category: 'Infrastructure & Renovation' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 💖 Contribute to Campaign
  const handleDonateSubmit = async (e) => {
    e.preventDefault();
    if (!donateModal) return;
    const amt = parseFloat(donationForm.amount);
    if (isNaN(amt) || amt <= 0) return showToast("Enter a valid contribution amount.", "error");

    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const donorKey = push(ref(db, `communities/${session.communityId}/campaigns/${donateModal.campaignId}/donors`)).key;
      
      const donorPayload = {
        donorId: donorKey,
        name: donationForm.isAnonymous ? 'Anonymous Devotee' : (donationForm.donorName.trim() || 'Devotee'),
        gotra: donationForm.gotra.trim() || 'Kashyap',
        amount: amt,
        timestamp: timestamp
      };

      const newRaised = (donateModal.raisedAmount || 0) + amt;

      const updates = {};
      updates[`communities/${session.communityId}/campaigns/${donateModal.campaignId}/raisedAmount`] = newRaised;
      updates[`communities/${session.communityId}/campaigns/${donateModal.campaignId}/donors/${donorKey}`] = donorPayload;

      // Sync to Treasury Ledger
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
        id: transId,
        name: `${donorPayload.name} [E-Wall Campaign]`,
        amount: amt,
        note: `Campaign: ${donateModal.title} (Gotra: ${donorPayload.gotra})`,
        collector: `${session.userName} (Crowdfunding Desk)`,
        timestamp: timestamp,
        category: 'Asset Donation'
      };

      await executeSafeUpdate(updates, "Contribution recorded successfully! Added to Eshwar Samman Wall.");
      logAudit("CAMPAIGN_DONATION", `Contributed ৳${amt} to campaign '${donateModal.title}'`);

      setDonateModal(null);
      setDonationForm({ donorName: session?.userName || '', gotra: '', amount: '', isAnonymous: false });
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

      {/* HEADER - Dynamically adapts to any of the 8 exact workspace types */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Target className="text-sanatani-orange" size={32} /> {institutionLabel} Crowdfunding & E-Walls
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Raise funds for capital projects, view live progress, and honor patrons on the Eshwar Samman Wall.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setShowCreateModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Launch Campaign
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Crowdfunding Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Launch capital projects with transparency. Every contribution updates the live progress bar and records the donor's name and Gotra on the public Eshwar Samman Wall while syncing to the Treasury Ledger.
          </p>
        </div>
      )}

      {/* CAMPAIGNS GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {campaigns.length > 0 ? (
          campaigns.map(camp => {
            const raised = camp.raisedAmount || 0;
            const target = camp.targetAmount || 1;
            const percentage = Math.min(100, Math.round((raised / target) * 100));
            const donorsList = camp.donors ? Object.keys(camp.donors).map(k => ({ id: k, ...camp.donors[k] })) : [];

            return (
              <div key={camp.campaignId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                      {camp.category}
                    </span>
                    <span className="text-xs font-bold text-gray-400">Goal: {curSymbol}{camp.targetAmount?.toLocaleString()}</span>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-gray-900">{camp.title}</h3>
                    <p className="text-xs text-gray-600 font-medium mt-2 leading-relaxed">{camp.description}</p>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between items-center text-xs font-black">
                      <span className="text-green-600">Raised: {curSymbol}{raised.toLocaleString()}</span>
                      <span className="text-gray-500">{percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden border border-gray-200">
                      <div className="bg-gradient-to-r from-orange-500 to-green-500 h-full transition-all duration-1000 ease-out" style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>

                  {/* Eshwar Samman Wall */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                      <Award size={12} className="text-yellow-600"/> Eshwar Samman Wall ({donorsList.length} Patrons)
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                      {donorsList.length > 0 ? (
                        donorsList.map(d => (
                          <div key={d.donorId} className="flex justify-between items-center bg-white p-2 rounded-xl border border-gray-100 text-xs font-bold">
                            <span className="text-gray-800">{d.name} <span className="text-[9px] text-gray-400 font-mono">({d.gotra})</span></span>
                            <span className="text-green-600 font-black">+{curSymbol}{d.amount}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">Be the first patron to support this sacred project!</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button 
                    onClick={() => setDonateModal(camp)}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Heart size={16}/> Contribute & Support 🛕
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
            <Target size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
            <p className="text-lg font-black text-gray-800 mb-1">No active crowdfunding campaigns.</p>
            <p className="text-xs uppercase tracking-widest">Click 'Launch Campaign' to start raising funds for institutional development.</p>
          </div>
        )}
      </div>

      {/* MODAL: LAUNCH CAMPAIGN */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Launch Crowdfunding Campaign</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleCreateCampaign} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Project Title *</label>
                <input type="text" required value={campaignForm.title} onChange={e=>setCampaignForm({...campaignForm, title: e.target.value})} placeholder="e.g. Hall Renovation & Construction" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Target Amount ({curSymbol}) *</label>
                  <input type="number" required value={campaignForm.targetAmount} onChange={e=>setCampaignForm({...campaignForm, targetAmount: e.target.value})} placeholder="50000" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Category</label>
                  <select value={campaignForm.category} onChange={e=>setCampaignForm({...campaignForm, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Infrastructure & Renovation">Infrastructure & Renovation</option>
                    <option value="Annadanam & Welfare">Annadanam & Welfare</option>
                    <option value="Festival & Utsav">Festival & Utsav</option>
                    <option value="Education & Gurukul">Education & Gurukul</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Project Description</label>
                <textarea rows="3" value={campaignForm.description} onChange={e=>setCampaignForm({...campaignForm, description: e.target.value})} placeholder="Explain the spiritual and physical scope of this project..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none resize-none"></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Launch Campaign Officially'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: CONTRIBUTE TO CAMPAIGN */}
      {donateModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-green-600 flex flex-col p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">Contribute to Project</h3>
                <p className="text-xs text-sanatani-orange font-bold truncate max-w-[280px]">{donateModal.title}</p>
              </div>
              <button onClick={() => setDonateModal(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleDonateSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Patron / Donor Name *</label>
                <input type="text" required={!donationForm.isAnonymous} disabled={donationForm.isAnonymous} value={donationForm.donorName} onChange={e=>setDonationForm({...donationForm, donorName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none disabled:opacity-50" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Gotra (For Samman Wall & Sankalp)</label>
                <input type="text" value={donationForm.gotra} onChange={e=>setDonationForm({...donationForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Contribution Amount ({curSymbol}) *</label>
                <input type="number" required value={donationForm.amount} onChange={e=>setDonationForm({...donationForm, amount: e.target.value})} placeholder="1000" className="w-full p-4 bg-green-50 border border-green-200 rounded-xl text-lg font-black text-green-700 outline-none" />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="anon" checked={donationForm.isAnonymous} onChange={e=>setDonationForm({...donationForm, isAnonymous: e.target.checked})} className="w-4 h-4 accent-sanatani-orange cursor-pointer" />
                <label htmlFor="anon" className="text-xs font-bold text-gray-700 cursor-pointer">Contribute anonymously (Hide name on Samman Wall)</label>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Confirm Contribution & Sync Treasury'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Campaigns Desk
      </div>
    </div>
  );
}
