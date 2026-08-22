import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Award, Sparkles, Flame, Plus, X, Loader2, HelpCircle, 
  Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Users, Trophy, Star, Heart
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function KarmaLedger({ session, isOnline = navigator.onLine }) {
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
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [karmaRecords, setKarmaRecords] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_karma_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Seva / Karma Log Form State
  const [karmaForm, setKarmaForm] = useState({
    volunteerName: session?.userName || '',
    activityType: 'VOLUNTEER_SEVA', // 'VOLUNTEER_SEVA' | 'SHLOKA_LEARNING' | 'UTSAV_ATTENDANCE'
    description: '',
    pointsEarned: '50'
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_karma_ledger', { workspace_type: workspaceType });

    const karmaRef = ref(db, `communities/${session.communityId}/karma_ledger`);
    const unsub = onValue(karmaRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ karmaId: k, ...data[k] }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setKarmaRecords(list);
        localStorage.setItem(`sb_karma_${session.communityId}`, JSON.stringify(list));
      } else {
        setKarmaRecords([]);
        localStorage.removeItem(`sb_karma_${session.communityId}`);
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

  // ➕ Log Karma / Seva Entry
  const handleSaveKarma = async (e) => {
    e.preventDefault();
    if (!karmaForm.volunteerName.trim() || !karmaForm.description.trim()) {
      return showToast("Volunteer Name and Description are required.", "error");
    }

    setSubmitting(true);
    try {
      const karmaKey = `KARMA-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();
      const pts = parseInt(karmaForm.pointsEarned) || 50;

      const payload = {
        ...karmaForm,
        karmaId: karmaKey,
        pointsEarned: pts,
        timestamp: timestamp,
        loggedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/karma_ledger/${karmaKey}`] = payload;

      await executeSafeUpdate(updates, "Karma & Seva points successfully logged!");
      logAudit("KARMA_LOGGED", `Awarded ${pts} points to ${karmaForm.volunteerName}`);

      setShowModal(false);
      setKarmaForm({ volunteerName: session?.userName || '', activityType: 'VOLUNTEER_SEVA', description: '', pointsEarned: '50' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Compute Leaderboard Summary per Volunteer
  const leaderboard = useMemo(() => {
    const map = {};
    karmaRecords.forEach(rec => {
      const name = rec.volunteerName || 'Devotee';
      if (!map[name]) map[name] = { name, totalPoints: 0, activitiesCount: 0 };
      map[name].totalPoints += (rec.pointsEarned || 0);
      map[name].activitiesCount += 1;
    });
    return Object.values(map).sort((a, b) => b.totalPoints - a.totalPoints);
  }, [karmaRecords]);

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
            <Trophy className="text-sanatani-orange" size={32} /> {institutionLabel} Gurukul & Youth Karma Ledger
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Gamify spiritual learning, log volunteer Seva hours, and track youth community engagement points.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
            <Plus size={16}/> Log Karma / Seva
          </button>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Karma Ledger Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Encourage youth and devotee participation by awarding Karma points for volunteering during Utsavs, learning Vedic shlokas, or rendering general Seva. Top contributors automatically rank on the community leaderboard.
          </p>
        </div>
      )}

      {/* MAIN LAYOUT: LEADERBOARD & RECENT ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Leaderboard */}
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <Trophy size={16} className="text-yellow-500"/> Youth Seva Leaderboard
          </h3>

          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {leaderboard.length > 0 ? (
              leaderboard.map((user, idx) => (
                <div key={user.name} className="flex justify-between items-center bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center ${idx === 0 ? 'bg-yellow-400 text-yellow-950' : idx === 1 ? 'bg-gray-300 text-gray-800' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-black text-gray-900 text-xs">{user.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold">{user.activitiesCount} Seva logs</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-sanatani-orange bg-orange-50 px-2.5 py-1 rounded-xl border border-orange-200">
                    ⭐ {user.totalPoints} Pts
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 italic text-center py-8">No leaderboard data yet.</p>
            )}
          </div>
        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <Sparkles size={16} className="text-sanatani-orange"/> Recent Seva & Learning Activity
          </h3>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {karmaRecords.length > 0 ? (
              karmaRecords.map(rec => (
                <div key={rec.karmaId} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {rec.activityType.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">{new Date(rec.timestamp).toLocaleDateString()}</span>
                    </div>
                    <h4 className="font-black text-gray-900 text-sm">{rec.volunteerName}</h4>
                    <p className="text-xs text-gray-600">{rec.description}</p>
                  </div>
                  <span className="text-sm font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-xl border border-green-200 shrink-0">
                    +{rec.pointsEarned} Pts
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-16 text-gray-400 font-bold">
                <Award size={40} className="mx-auto mb-2 opacity-30 text-sanatani-orange"/>
                <p className="text-sm font-black text-gray-800">No Seva logs recorded yet.</p>
                <p className="text-xs uppercase tracking-widest mt-0.5">Click 'Log Karma / Seva' to record an achievement.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* MODAL: LOG KARMA ENTRY */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Log Karma & Seva Points</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveKarma} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Volunteer / Devotee Name *</label>
                <input type="text" required value={karmaForm.volunteerName} onChange={e=>setKarmaForm({...karmaForm, volunteerName: e.target.value})} placeholder="e.g. Rohit Chandra" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Activity Category</label>
                  <select value={karmaForm.activityType} onChange={e=>setKarmaForm({...karmaForm, activityType: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="VOLUNTEER_SEVA">Volunteer Seva</option>
                    <option value="SHLOKA_LEARNING">Shloka Memorization</option>
                    <option value="UTSAV_ATTENDANCE">Utsav Attendance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Karma Points</label>
                  <input type="number" required value={karmaForm.pointsEarned} onChange={e=>setKarmaForm({...karmaForm, pointsEarned: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Description / Milestone *</label>
                <textarea rows="3" required value={karmaForm.description} onChange={e=>setKarmaForm({...karmaForm, description: e.target.value})} placeholder="e.g. Cleaned temple premises for Janmashtami / Memorized Chapter 1 of Bhagavad Gita" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none resize-none"></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Award Points & Update Leaderboard'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Karma Ledger
      </div>
    </div>
  );
}
