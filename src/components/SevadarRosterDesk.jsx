import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Users, UserCheck, Calendar, Clock, Plus, X, Loader2, 
  HelpCircle, Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Sparkles, ShieldCheck
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function SevadarRosterDesk({ session, isOnline = navigator.onLine }) {
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
  const [shifts, setShifts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_shifts_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Shift Form State
  const [shiftForm, setShiftForm] = useState({
    title: '',
    department: 'Prasad Distribution',
    date: '',
    timeWindow: '08:00 AM - 12:00 PM',
    requiredSevadars: '5'
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_sevadar_roster', { workspace_type: workspaceType });

    const shiftRef = ref(db, `communities/${session.communityId}/sevadar_shifts`);
    const unsub = onValue(shiftRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ shiftId: k, ...data[k] }));
        list.sort((a, b) => new Date(a.date) - new Date(b.date));
        setShifts(list);
        localStorage.setItem(`sb_shifts_${session.communityId}`, JSON.stringify(list));
      } else {
        setShifts([]);
        localStorage.removeItem(`sb_shifts_${session.communityId}`);
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

  // ➕ Create Duty Shift
  const handleCreateShift = async (e) => {
    e.preventDefault();
    if (!shiftForm.title.trim() || !shiftForm.date) {
      return showToast("Shift Title and Date are required.", "error");
    }

    setSubmitting(true);
    try {
      const shiftKey = `SHIFT-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...shiftForm,
        shiftId: shiftKey,
        requiredSevadars: parseInt(shiftForm.requiredSevadars) || 5,
        volunteers: {},
        status: 'OPEN',
        createdAt: timestamp,
        createdBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/sevadar_shifts/${shiftKey}`] = payload;

      await executeSafeUpdate(updates, "Duty shift successfully published!");
      logAudit("SHIFT_CREATED", `Created shift: ${shiftForm.title} for ${shiftForm.date}`);

      setShowModal(false);
      setShiftForm({ title: '', department: 'Prasad Distribution', date: '', timeWindow: '08:00 AM - 12:00 PM', requiredSevadars: '5' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 🙋 Join Shift (1-Tap Seva Signup)
  const handleJoinShift = async (shift) => {
    const userId = session.uid;
    const volunteersMap = shift.volunteers || {};
    
    if (volunteersMap[userId]) {
      return showToast("You are already signed up for this shift.", "error");
    }

    const updates = {};
    updates[`communities/${session.communityId}/sevadar_shifts/${shift.shiftId}/volunteers/${userId}`] = {
      name: session.userName,
      joinedAt: Date.now()
    };

    await executeSafeUpdate(updates, "Successfully registered for Seva shift!");
    logAudit("SHIFT_JOINED", `User ${session.userName} joined shift: ${shift.title}`);
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
            <UserCheck className="text-sanatani-orange" size={32} /> {institutionLabel} Sevadar & Duty Roster Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Organize volunteer shifts, manage Utsav assignments, and coordinate selfless Seva.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Publish Duty Shift
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Sevadar Roster Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Coordinating volunteers ensures flawless Utsav execution. Publish shifts for Prasad distribution, security, or cleanliness, and allow members to sign up instantly.
          </p>
        </div>
      )}

      {/* SHIFTS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {shifts.length > 0 ? (
          shifts.map(shift => {
            const volunteersList = shift.volunteers ? Object.keys(shift.volunteers).map(k => ({ id: k, ...shift.volunteers[k] })) : [];
            const isJoined = shift.volunteers && shift.volunteers[session.uid];

            return (
              <div key={shift.shiftId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                      {shift.department}
                    </span>
                    <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                      <Calendar size={14}/> {shift.date}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-gray-900">{shift.title}</h3>
                    <p className="text-xs font-bold text-gray-500 mt-1 flex items-center gap-1">
                      <Clock size={14}/> {shift.timeWindow}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Signed Up Sevadars ({volunteersList.length} / {shift.requiredSavadars || shift.requiredSevadars})</p>
                    <div className="max-h-24 overflow-y-auto space-y-1 pt-1">
                      {volunteersList.length > 0 ? (
                        volunteersList.map(v => (
                          <p key={v.id} className="text-xs font-bold text-gray-800">• {v.name}</p>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 italic">No volunteers signed up yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <button 
                    onClick={() => handleJoinShift(shift)}
                    disabled={isJoined}
                    className={`w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 ${isJoined ? 'bg-green-50 text-green-700 border border-green-200 cursor-default' : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white'}`}
                  >
                    {isJoined ? '✓ Signed Up for Seva' : 'Join Seva Shift 🙏'}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
            <Users size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
            <p className="text-lg font-black text-gray-800 mb-1">No active duty shifts published.</p>
            <p className="text-xs uppercase tracking-widest">Click 'Publish Duty Shift' to start organizing volunteers.</p>
          </div>
        )}
      </div>

      {/* MODAL: PUBLISH SHIFT */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Publish Sevadar Duty Shift</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleCreateShift} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Shift Title / Task *</label>
                <input type="text" required value={shiftForm.title} onChange={e=>setShiftForm({...shiftForm, title: e.target.value})} placeholder="e.g. Maha-Prasadam Counter Management" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Date *</label>
                  <input type="date" required value={shiftForm.date} onChange={e=>setShiftForm({...shiftForm, date: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Department</label>
                  <select value={shiftForm.department} onChange={e=>setShiftForm({...shiftForm, department: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Prasad Distribution">Prasad Distribution</option>
                    <option value="Gate Security & Queue">Gate Security & Queue</option>
                    <option value="Stage & Puja Assistance">Stage & Puja Assistance</option>
                    <option value="Cleanliness & Sanitation">Cleanliness & Sanitation</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Time Window</label>
                  <input type="text" value={shiftForm.timeWindow} onChange={e=>setShiftForm({...shiftForm, timeWindow: e.target.value})} placeholder="08:00 AM - 12:00 PM" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Required Sevadars</label>
                  <input type="number" required value={shiftForm.requiredSevadars} onChange={e=>setShiftForm({...shiftForm, requiredSevadars: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Publish Shift Roster'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Sevadar Desk
      </div>
    </div>
  );
}
