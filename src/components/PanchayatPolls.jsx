import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, increment } from 'firebase/database';
import { db } from '../firebase';
import { 
  BarChart2, BarChart3, PieChart, Plus, Trash2, CheckCircle2, 
  X, Loader2, Users, ShieldCheck, Clock, Check, AlertTriangle, 
  WifiOff, HelpCircle, Lightbulb, Lock, Unlock, BrainCircuit, Heart, Flag,
  CalendarDays, Timer, BellRing, FileText, MessageSquare, Award,
  ListChecks 
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate'; // ✨ IMPORTED GATEKEEPER HOOK

export default function PanchayatPolls({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session); // ✨ INITIALIZED GATEKEEPER

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ACTIVE'); 
  const [showGuide, setShowGuide] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [polls, setPolls] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_polls_${session.communityId}`)) || []; } catch { return []; }
  });
  const [members, setMembers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_poll_members_${session.communityId}`)) || []; } catch { return []; }
  });

  // UI Modals & Actions
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConcludeModal, setShowConcludeModal] = useState(false);
  const [concludeData, setConcludeData] = useState({ id: null, title: '', note: '' });
  const [auditPoll, setAuditPoll] = useState(null); 
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Create Poll Form State
  const [pollForm, setPollForm] = useState({
    title: '', description: '', targetAudience: 'ALL_MEMBERS', 
    endDate: '', endTime: '', options: ['', '']
  });

  const isManagerOrAdmin = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 🔄 Realtime Data Listeners
  useEffect(() => {
    pushToDataLayer('view_polls', { workspace_type: workspaceType });

    const pollsRef = ref(db, `communities/${session.communityId}/polls`);
    const unsubPolls = onValue(pollsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const pollArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        pollArray.sort((a, b) => b.createdAt - a.createdAt);
        setPolls(pollArray);
        localStorage.setItem(`sb_polls_${session.communityId}`, JSON.stringify(pollArray));
      } else {
        setPolls([]);
        localStorage.removeItem(`sb_polls_${session.communityId}`);
      }
      setLoading(false);
    });

    const memRef = ref(db, `communities/${session.communityId}/members`);
    const unsubMem = onValue(memRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const memArray = Object.keys(data).map(k => ({ id: k, name: data[k].name, phone: data[k].phone, role: data[k].role || 'MEMBER' }));
        setMembers(memArray);
        localStorage.setItem(`sb_poll_members_${session.communityId}`, JSON.stringify(memArray));
      }
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubPolls(); unsubMem(); clearTimeout(failsafe); };
  }, [session.communityId, workspaceType]);

  // ✨ AUTO-EXPIRATION ENGINE (Client-Side Check)
  useEffect(() => {
    if (!isManagerOrAdmin || polls.length === 0) return;
    const now = Date.now();
    const expiredPolls = polls.filter(p => p.status === 'ACTIVE' && p.expiresAt && p.expiresAt < now);

    if (expiredPolls.length > 0) {
      const updates = {};
      expiredPolls.forEach(p => { updates[`communities/${session.communityId}/polls/${p.id}/status`] = 'CONCLUDED'; });
      update(ref(db), updates).catch(e => console.error("Auto-expire failed", e));
    }
  }, [polls, isManagerOrAdmin, session.communityId]);

  // 🚀 Safe Firebase Update Engine
  const executeSafeUpdate = async (updates, successMsg = null, offlineMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(offlineMsg || t('offline_saved') || "Action cached offline. Syncing soon.", 'offline');
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
    if (!isOnline) return;
    try { await push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  // ✨ SMART NOTIFICATION DISPATCHER
  const notifyTargetAudience = async (pollData, type = 'NEW') => {
    let targets = members;
    if (pollData.targetAudience === 'MANAGERS') {
      targets = members.filter(m => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(m.role));
    }

    // If it's a final reminder, filter out users who already voted
    if (type === 'REMINDER') {
      targets = targets.filter(m => !pollData.votedUsers || !pollData.votedUsers[m.id]);
    }

    const updates = {};
    const ts = Date.now();

    targets.forEach(m => {
      const notifId = push(ref(db, `communities/${session.communityId}/notifications/${m.id}`)).key;
      let msg = "";
      if (type === 'NEW') {
        msg = `📊 New Poll: "${pollData.title}". Please cast your vote before ${new Date(pollData.expiresAt).toLocaleString()}.`;
      } else if (type === 'REMINDER') {
        msg = `⏳ Final Reminder! The poll "${pollData.title}" is ending soon. We need your vote to make a decision.`;
      } else if (type === 'CONCLUDED') {
        msg = `✅ Poll Concluded: "${pollData.title}". The results and committee decision are now available.`;
      }

      updates[`communities/${session.communityId}/notifications/${m.id}/${notifId}`] = {
        id: notifId, title: t('nav_polls') || "Community Voting", message: msg, type: "POLL", timestamp: ts, isRead: false
      };
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates).catch(e => console.error("Notification broadcast failed."));
    }
  };

  // 🗳️ ATOMIC VOTING ENGINE
  const handleVote = async (pollId, optionId) => {
    const poll = polls.find(p => p.id === pollId);
    if (!poll) return;
    if (poll.status !== 'ACTIVE' || (poll.expiresAt && Date.now() > poll.expiresAt)) {
      return showToast(t('error') || "This poll has been concluded.", "error");
    }
    if (poll.votedUsers && poll.votedUsers[session.uid]) return showToast(t('error') || "You have already voted.", "error");

    try {
      const updates = {};
      updates[`communities/${session.communityId}/polls/${pollId}/votedUsers/${session.uid}`] = optionId;
      updates[`communities/${session.communityId}/polls/${pollId}/options/${optionId}/votes`] = increment(1);

      await executeSafeUpdate(updates, t('recorded_success') || "Your vote has been securely recorded!", "Vote cached offline.");
      pushToDataLayer('select_content', { content_type: 'Poll_Vote', item_id: pollId });
    } catch (e) { showToast((t('error') || "Voting error") + ": " + e.message, "error"); }
  };

  // ➕ PAYWALL PROTECTED: CREATE NEW POLL
  const handleCreatePoll = async (e) => {
    e.preventDefault();

    // ✨ PAYWALL GATEKEEPER
    if (!checkQuota('free_poll_limit')) return; 

    const validOptions = pollForm.options.filter(opt => opt.trim() !== '');
    if (validOptions.length < 2) return showToast(t('err_all_fields_req') || "A poll requires at least 2 valid options.", "error");
    if (!pollForm.title.trim() || !pollForm.endDate) return showToast(t('err_all_fields_req') || "Title and End Date are required.", "error");

    setSubmitting(true);
    try {
      const dateTimeString = pollForm.endTime ? `${pollForm.endDate}T${pollForm.endTime}` : `${pollForm.endDate}T23:59:59`;
      const expirationMs = new Date(dateTimeString).getTime();

      if (expirationMs <= Date.now()) throw new Error(t('error') || "The deadline must be in the future.");

      const pollId = push(ref(db, `communities/${session.communityId}/polls`)).key;
      const optionsMap = {};
      validOptions.forEach((opt, idx) => {
        optionsMap[`opt_${idx}`] = { text: opt.trim(), votes: 0 };
      });

      const newPoll = {
        title: pollForm.title.trim(),
        description: pollForm.description.trim(),
        targetAudience: pollForm.targetAudience,
        status: 'ACTIVE',
        createdAt: Date.now(),
        createdBy: session.userName,
        expiresAt: expirationMs,
        options: optionsMap,
      };

      const updates = {};
      updates[`communities/${session.communityId}/polls/${pollId}`] = newPoll;
      // ✨ RECORD USAGE
      if (isOnline) {
        updates[`communities/${session.communityId}/usage_tracking/polls_created`] = increment(1); 
      }

      await executeSafeUpdate(updates, t('recorded_success') || "Panchayat Poll successfully launched!");
      logAudit("POLL_CREATED", `Launched new poll: ${newPoll.title}`);
      pushToDataLayer('generate_lead', { poll_target: newPoll.targetAudience, options_count: validOptions.length });

      // Trigger Smart Notifications
      await notifyTargetAudience(newPoll, 'NEW');

      setShowCreateModal(false);
      setPollForm({ title: '', description: '', targetAudience: 'ALL_MEMBERS', endDate: '', endTime: '', options: ['', ''] });
      setActiveTab('ACTIVE');
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 🏁 CONCLUDE POLL MANUALLY
  const handleConcludePoll = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const poll = polls.find(p => p.id === concludeData.id);
      const updates = {};
      updates[`communities/${session.communityId}/polls/${concludeData.id}/status`] = 'CONCLUDED';
      if (concludeData.note.trim()) {
        updates[`communities/${session.communityId}/polls/${concludeData.id}/adminNote`] = concludeData.note.trim();
      }

      await executeSafeUpdate(updates, t('record_updated') || "Poll concluded and decision published.");
      logAudit("POLL_CONCLUDED", `Concluded poll: ${poll.title}`);

      // Notify audience of results
      await notifyTargetAudience(poll, 'CONCLUDED');

      setShowConcludeModal(false);
      setConcludeData({ id: null, title: '', note: '' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 🔔 SEND FINAL REMINDER
  const handleSendReminder = (poll) => {
    setConfirmDialog({
      title: "Send Final Alert",
      message: `Send an urgent push notification to all targeted ${t('members')} who have NOT voted yet for "${poll.title}"?`,
      confirmText: "SEND ALERT",
      isDanger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await notifyTargetAudience(poll, 'REMINDER');
          showToast(t('success') || "Final reminder sent to unvoted members.");
          logAudit("POLL_REMINDER_SENT", `Sent voting reminder for: ${poll.title}`);
        } catch (e) { showToast(e.message, "error"); }
      }
    });
  };

  // 🗑️ DELETE POLL
  const handleDeletePoll = (poll) => {
    setConfirmDialog({
      title: "Delete Poll Record",
      message: `🚨 DANGER: This will completely erase "${poll.title}" and all its voting history. Are you sure?`,
      confirmText: t('delete_record') || "DELETE POLL",
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await executeSafeUpdate({ [`communities/${session.communityId}/polls/${poll.id}`]: null }, t('success') || "Poll record erased.");
          logAudit("POLL_DELETED", `Deleted poll: ${poll.title}`);
        } catch (e) { showToast(e.message, "error"); }
      }
    });
  };

  // 📄 DOWNLOAD PDF REPORT
  const handleDownloadPDF = (poll) => {
    pushToDataLayer('export_data', { export_type: 'PDF', data_category: 'POLL_REPORT', community_id: session.communityId });
    import('../utils/pdfGenerator').then(({ generatePollReportPdf }) => {
       if(generatePollReportPdf) generatePollReportPdf(session.communityName, poll, members);
       else showToast(t('pdf_engine_loading') || "PDF engine loading...", "error");
    });
  };

  // Option Form Helpers
  const handleAddOption = () => setPollForm(prev => ({...prev, options: [...prev.options, '']}));
  const handleRemoveOption = (index) => {
    setPollForm(prev => { const newOpts = [...prev.options]; newOpts.splice(index, 1); return { ...prev, options: newOpts }; });
  };
  const handleOptionChange = (index, value) => {
    setPollForm(prev => { const newOpts = [...prev.options]; newOpts[index] = value; return { ...prev, options: newOpts }; });
  };

  // FILTER POLLS BASED ON AUDIENCE & ROLE
  const visiblePolls = useMemo(() => {
    return polls.filter(poll => {
      if (isManagerOrAdmin) return true; 
      return poll.targetAudience === 'ALL_MEMBERS'; 
    });
  }, [polls, isManagerOrAdmin]);

  const activePolls = visiblePolls.filter(p => p.status === 'ACTIVE');
  const concludedPolls = visiblePolls.filter(p => p.status === 'CONCLUDED');
  const displayPolls = activeTab === 'ACTIVE' ? activePolls : concludedPolls;

  const getCountdown = (expiresAt) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    if (days === 0 && hours === 0) return '< 1 Hour';
    if (days === 0) return `${hours} Hours`;
    return `${days}d ${hours}h`;
  };

  // ✨ PANCHAYAT AI (DECISION ASSISTANT RESTORED)
  const panchayatInsights = useMemo(() => {
    if (!isManagerOrAdmin || polls.length === 0 || members.length === 0) return null;

    // Calculate Turnout for ACTIVE polls
    let totalEligibleActive = 0;
    let totalVotedActive = 0;

    activePolls.forEach(p => {
      const eligibleCount = p.targetAudience === 'MANAGERS' 
        ? members.filter(m => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(m.role)).length 
        : members.length;
      const votesCast = p.votedUsers ? Object.keys(p.votedUsers).length : 0;
      totalEligibleActive += eligibleCount;
      totalVotedActive += votesCast;
    });

    const activeTurnoutRate = totalEligibleActive > 0 ? Math.round((totalVotedActive / totalEligibleActive) * 100) : 0;

    // Calculate Win Margin for CONCLUDED polls
    let marginMessage = "No recent concluded polls to analyze.";
    if (concludedPolls.length > 0) {
      const lastPoll = concludedPolls[0]; // Most recently concluded
      const opts = Object.values(lastPoll.options || {}).sort((a,b) => b.votes - a.votes);
      const total = lastPoll.votedUsers ? Object.keys(lastPoll.votedUsers).length : 0;

      if (total > 0 && opts.length >= 2) {
        const first = opts[0].votes;
        const second = opts[1].votes;
        const marginPerc = Math.round(((first - second) / total) * 100);

        if (marginPerc > 30) {
          marginMessage = `Last decision ("${lastPoll.title}") was won by a decisive ${marginPerc}% margin, indicating strong community consensus.`;
        } else if (marginPerc < 10) {
          marginMessage = `Last decision ("${lastPoll.title}") was highly contested (won by just ${marginPerc}%). Consider community discussion to align ${t('members')}.`;
        } else {
          marginMessage = `Last decision ("${lastPoll.title}") had a clear ${marginPerc}% victory margin.`;
        }
      }
    }

    return { activeTurnoutRate, marginMessage };
  }, [polls, activePolls, concludedPolls, members, isManagerOrAdmin, t]);

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 sm:space-y-8 fade-in ring-1 ring-black/5 min-h-[90vh]">

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg animate-pulse">
          <WifiOff size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Offline Mode: Votes will sync when connection is restored.</span>
        </div>
      )}

      {/* ✨ GLOBAL CUSTOM TOAST ENGINE */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'offline' ? 'bg-orange-500/20 text-sanatani-orange' : toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'offline' ? <WifiOff size={20}/> : toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'offline' ? 'text-orange-400' : toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'offline' ? 'Offline Cache' : toast.type === 'error' ? t('error') || 'Error' : t('success') || 'Success'}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* ✨ CONFIRMATION DIALOG PORTAL */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center border-t-4 border-sanatani-orange">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner ${confirmDialog.isDanger ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
              {confirmDialog.isDanger ? <AlertTriangle size={32}/> : <CheckCircle2 size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-sm">{t('btn_cancel') || 'Cancel'}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HEADER CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <BarChart3 className="text-sanatani-orange" size={26} /> {t('nav_polls') || 'Community Voting'}
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Cryptographic decision making & consensus tracking.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          {isManagerOrAdmin && (
             <button 
                onClick={() => { setShowGuide(!showGuide); if(!showGuide) pushToDataLayer('open_quick_guide', { module: 'PanchayatPolls' }); }} 
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 whitespace-nowrap shadow-sm"
             >
                <HelpCircle size={14}/> {t('quick_guide') || 'Quick Guide'}
             </button>
          )}

          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button 
              onClick={() => setActiveTab('ACTIVE')} 
              className={`flex-1 sm:w-auto px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'ACTIVE' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <PieChart size={14}/> Active ({activePolls.length})
            </button>
            <button 
              onClick={() => setActiveTab('CONCLUDED')} 
              className={`flex-1 sm:w-auto px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'CONCLUDED' ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <Flag size={14}/> Concluded ({concludedPolls.length})
            </button>
          </div>

          {isManagerOrAdmin && (
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 shrink-0"
            >
              <Plus size={16}/> Launch Poll
            </button>
          )}
        </div>
      </div>

      {/* ✨ PANCHAYAT AI (DECISION INSIGHTS FOR ADMINS) */}
      {isManagerOrAdmin && panchayatInsights && activeTab === 'ACTIVE' && activePolls.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center gap-4 animate-in slide-in-from-top-2">
          <div className="bg-purple-100 text-purple-600 p-3 rounded-xl shrink-0 self-start sm:self-auto">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h3 className="text-xs font-black text-purple-900 uppercase tracking-widest mb-1">Panchayat AI Insight</h3>
            <p className="text-sm font-bold text-gray-700 leading-snug">
              Active polls currently have a <strong>{panchayatInsights.activeTurnoutRate}% voter turnout</strong> rate. 
              {panchayatInsights.activeTurnoutRate < 50 ? " Consider sending a Broadcast Desk reminder to increase engagement." : " Excellent community participation!"}
            </p>
          </div>
        </div>
      )}

      {isManagerOrAdmin && panchayatInsights && activeTab === 'CONCLUDED' && concludedPolls.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center gap-4 animate-in slide-in-from-top-2">
          <div className="bg-blue-100 text-blue-600 p-3 rounded-xl shrink-0 self-start sm:self-auto">
            <BarChart2 size={24} />
          </div>
          <div>
            <h3 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">Consensus Analytics</h3>
            <p className="text-sm font-bold text-gray-700 leading-snug">
              {panchayatInsights.marginMessage}
            </p>
          </div>
        </div>
      )}

      {/* UX: QUICK GUIDE BANNER */}
      {showGuide && isManagerOrAdmin && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-5 sm:p-6 rounded-2xl shadow-inner animate-in slide-in-from-top-2 relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors"><X size={18}/></button>
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><Lightbulb size={18} className="text-blue-500"/> Voting System Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Lock size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">1. Immutable Voting & Privacy</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Votes are cryptographically logged. Regular members only see anonymous percentages. Admins can audit individual votes.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><BellRing size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">2. Final Reminders</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Before a poll ends, click 'Send Reminder' to blast an urgent push notification ONLY to members who haven't voted yet.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><FileText size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">3. Conclude & Report</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Add official 'Admin Notes' upon conclusion explaining the decision. Members can download the official PDF report.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POLL CARDS GRID */}
      <div className="flex-1 overflow-y-auto space-y-6 pb-12 scrollbar-hide">
        {displayPolls.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {displayPolls.map(poll => {
              const myVote = poll.votedUsers ? poll.votedUsers[session.uid] : null;
              const totalVotes = poll.votedUsers ? Object.keys(poll.votedUsers).length : 0;
              const options = Object.keys(poll.options || {}).map(k => ({ id: k, ...poll.options[k] }));

              // Find winner for concluded polls
              let winnerId = null;
              if (poll.status === 'CONCLUDED' && totalVotes > 0) {
                 winnerId = options.reduce((max, obj) => obj.votes > max.votes ? obj : max, options[0]).id;
              }

              return (
                <div key={poll.id} className={`bg-white rounded-3xl p-6 sm:p-8 shadow-sm border transition-all duration-300 ring-1 ring-black/5 flex flex-col justify-between group ${poll.status === 'ACTIVE' ? 'border-orange-200 hover:shadow-md hover:border-orange-300' : 'border-gray-200 opacity-90'}`}>

                   <div>
                     <div className="flex justify-between items-start mb-4">
                       <div className="flex flex-wrap items-center gap-2">
                         <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shadow-sm ${poll.targetAudience === 'MANAGERS' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                           {poll.targetAudience === 'MANAGERS' ? <ShieldCheck size={12}/> : <Users size={12}/>} 
                           {poll.targetAudience === 'MANAGERS' ? 'Committee Only' : 'Public Poll'}
                         </span>
                         {poll.status === 'ACTIVE' ? (
                           <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border bg-orange-50 text-orange-600 border-orange-200 flex items-center gap-1.5 shadow-sm">
                             <Timer size={12}/> {getCountdown(poll.expiresAt)}
                           </span>
                         ) : (
                           <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border bg-gray-800 text-white border-gray-900 flex items-center gap-1.5 shadow-sm">
                             <Lock size={12}/> Concluded
                           </span>
                         )}
                       </div>
                     </div>

                     <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-3 leading-tight tracking-tight">{poll.title}</h3>
                     {poll.description && (
                       <p className="text-xs font-bold text-gray-500 mb-6 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner">
                         {poll.description}
                       </p>
                     )}
                   </div>

                   {/* VOTING SECTION */}
                   <div className="space-y-3 mt-auto">
                     {options.map((opt) => {
                       const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                       const isMyChoice = myVote === opt.id;
                       const isWinner = winnerId === opt.id;

                       // STATE 1: ACTIVE AND USER HAS NOT VOTED
                       if (poll.status === 'ACTIVE' && !myVote) {
                          return (
                            <button 
                              key={opt.id} 
                              onClick={() => handleVote(poll.id, opt.id)}
                              className="w-full text-left p-4 rounded-xl border-2 border-gray-100 hover:border-sanatani-orange hover:bg-orange-50/50 hover:shadow-sm transition-all flex justify-between items-center group/btn"
                            >
                              <span className="text-sm font-black text-gray-700 group-hover/btn:text-sanatani-orange transition-colors">{opt.text}</span>
                              <div className="w-5 h-5 rounded-full border-2 border-gray-300 group-hover/btn:border-sanatani-orange transition-colors"></div>
                            </button>
                          );
                       }

                       // STATE 2: ACTIVE AND USER HAS VOTED (PROGRESS BARS) OR CONCLUDED
                       return (
                         <div key={opt.id} className="relative w-full bg-gray-50 border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                           {/* Dynamic Progress Fill */}
                           <div 
                             className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out opacity-80 ${isWinner ? 'bg-green-200 border-r-4 border-green-500' : isMyChoice ? 'bg-orange-200 border-r-4 border-orange-500' : 'bg-gray-200 border-r-4 border-gray-300'}`}
                             style={{ width: `${percentage}%` }}
                           ></div>

                           {/* Content Overlay */}
                           <div className="relative z-10 p-4 flex justify-between items-center">
                             <div className="flex items-center gap-2">
                               <span className={`text-sm font-black ${isWinner ? 'text-green-900' : isMyChoice ? 'text-orange-900' : 'text-gray-800'}`}>
                                 {opt.text}
                               </span>
                               {isMyChoice && (
                                 <span className="bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest shadow-sm">Your Vote</span>
                               )}
                               {isWinner && (
                                 <span className="bg-green-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest shadow-sm flex items-center gap-1"><Award size={12}/> Winner</span>
                               )}
                             </div>
                             <div className="text-right">
                               <span className={`text-sm font-black ${isWinner ? 'text-green-800' : isMyChoice ? 'text-orange-800' : 'text-gray-700'}`}>{percentage}%</span>
                               <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">{opt.votes} Votes</p>
                             </div>
                           </div>
                         </div>
                       );
                     })}
                   </div>

                   {/* ✨ POST-POLL ANALYTICS & DECISION */}
                   {poll.status === 'CONCLUDED' && poll.adminNote && (
                     <div className="mt-5 bg-blue-50 border border-blue-100 p-5 rounded-2xl flex items-start gap-4 shadow-sm relative overflow-hidden">
                       <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                       <MessageSquare size={20} className="text-blue-500 shrink-0"/>
                       <div>
                         <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5">Official Committee Decision</p>
                         <p className="text-xs font-bold text-blue-900 leading-relaxed">{poll.adminNote}</p>
                       </div>
                     </div>
                   )}

                   {/* FOOTER CONTROLS */}
                   <div className="mt-6 pt-5 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                     <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center justify-center sm:justify-start gap-1.5 w-full sm:w-auto bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                       <CheckCircle2 size={14} className="text-green-500"/> {totalVotes} Total Votes
                     </p>

                     <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">

                       {/* Universal Report Download */}
                       {poll.status === 'CONCLUDED' && (
                         <button onClick={() => handleDownloadPDF(poll)} className="flex-1 sm:flex-none bg-white hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200 text-gray-700 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 shadow-sm hover:shadow-md">
                           <FileText size={14}/> {t('pdf_report') || 'Report'}
                         </button>
                       )}

                       {/* Admin Controls */}
                       {isManagerOrAdmin && (
                         <>
                           {/* ✨ EXCLUSIVE ADMIN AUDIT BUTTON */}
                           <button onClick={() => setAuditPoll(poll)} className="flex-1 sm:flex-none bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 border border-blue-200 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 shadow-sm hover:shadow-md" title="View Voter Details (Admin Only)">
                             <ListChecks size={14}/> Audit
                           </button>

                           {poll.status === 'ACTIVE' && (
                             <>
                               <button onClick={() => handleSendReminder(poll)} className="flex-1 sm:flex-none bg-orange-50 hover:bg-orange-600 hover:text-white text-orange-600 border border-orange-200 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 shadow-sm hover:shadow-md" title="Remind Unvoted Members">
                                 <BellRing size={14}/> Remind
                               </button>
                               <button onClick={() => { setConcludeData({ id: poll.id, title: poll.title, note: '' }); setShowConcludeModal(true); }} className="flex-1 sm:flex-none bg-gray-100 hover:bg-gray-800 hover:text-white text-gray-600 border border-gray-200 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 shadow-sm hover:shadow-md">
                                 <Lock size={14}/> Conclude
                               </button>
                             </>
                           )}
                           <button onClick={() => handleDeletePoll(poll)} className="bg-red-50 hover:bg-red-600 hover:text-white text-red-600 border border-red-200 p-2.5 rounded-xl transition-all flex justify-center items-center shadow-sm hover:shadow-md">
                             <Trash2 size={16}/>
                           </button>
                         </>
                       )}
                     </div>
                   </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center p-16 text-gray-400 font-bold bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm flex flex-col items-center justify-center h-64">
            <BarChart2 size={48} className="mx-auto mb-4 opacity-30 text-sanatani-orange" />
            <p className="text-lg sm:text-xl font-black text-gray-900 mb-2">No {activeTab.toLowerCase()} polls available.</p>
            <p className="text-[10px] sm:text-xs uppercase tracking-widest text-gray-500">
              {isManagerOrAdmin ? "Click 'Launch Poll' to start a community vote." : "Wait for the committee to announce a new vote."}
            </p>
          </div>
        )}
      </div>

      {/* FOOTER CREDIT */}
      <div className="pt-8 pb-4 flex flex-col items-center justify-center text-center opacity-70 border-t border-gray-200 mt-auto shrink-0">
         <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1">
           Made with <Heart size={12} className="text-red-500 fill-current"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span>
         </div>
         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">© {new Date().getFullYear()} Sanatani Bandhan. Enterprise Edition.</p>
      </div>

      {/* ✨ CREATE NEW POLL MODAL */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 fade-in border-t-4 border-sanatani-orange ring-1 ring-white/20 max-h-[90vh] flex flex-col">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4 shrink-0">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                 <BarChart2 className="text-sanatani-orange" size={24}/> Launch New Poll
               </h3>
               <button onClick={() => setShowCreateModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full text-gray-500 transition-colors shadow-sm"><X size={16}/></button>
             </div>

             <div className="overflow-y-auto pr-2 scrollbar-hide pb-4">
               <form onSubmit={handleCreatePoll} className="space-y-6">

                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Poll Question / Title *</label>
                   <input 
                     type="text" required value={pollForm.title} onChange={e=>setPollForm({...pollForm, title: e.target.value})} 
                     className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" 
                     placeholder="e.g. What color should we paint the new Mandir gates?" 
                   />
                 </div>

                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Description / Context (Optional)</label>
                   <textarea 
                     rows="2" value={pollForm.description} onChange={e=>setPollForm({...pollForm, description: e.target.value})} 
                     className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all resize-none shadow-sm" 
                     placeholder="Provide extra details to help voters decide..."
                   ></textarea>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><CalendarDays size={12}/> End Date *</label>
                     <input type="date" required value={pollForm.endDate} onChange={e=>setPollForm({...pollForm, endDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm text-gray-700 cursor-pointer" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Clock size={12}/> Time (Optional)</label>
                     <input type="time" value={pollForm.endTime} onChange={e=>setPollForm({...pollForm, endTime: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm text-gray-700 cursor-pointer" />
                   </div>
                 </div>

                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><ShieldCheck size={12}/> Voting Audience</label>
                   <select 
                     value={pollForm.targetAudience} onChange={e=>setPollForm({...pollForm, targetAudience: e.target.value})} 
                     className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all appearance-none cursor-pointer shadow-sm"
                   >
                     <option value="ALL_MEMBERS">Public (All Devotees & Members)</option>
                     <option value="MANAGERS">Internal (Only Admins & Managers)</option>
                   </select>
                 </div>

                 <div className="border-t border-gray-100 pt-5 mt-2">
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Voting Options *</label>

                   <div className="space-y-3">
                     {pollForm.options.map((opt, index) => (
                       <div key={index} className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-orange-50 text-sanatani-orange flex items-center justify-center text-[11px] font-black shrink-0 shadow-inner border border-orange-100">{index + 1}</div>
                         <input 
                           type="text" required={index < 2} 
                           value={opt} onChange={(e) => handleOptionChange(index, e.target.value)}
                           className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none shadow-sm transition-colors" 
                           placeholder={`Option ${index + 1}`}
                         />
                         {index >= 2 && (
                           <button type="button" onClick={() => handleRemoveOption(index)} className="p-3.5 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shrink-0 shadow-sm border border-red-100">
                             <Trash2 size={16}/>
                           </button>
                         )}
                       </div>
                     ))}
                   </div>

                   {pollForm.options.length < 5 && (
                     <button type="button" onClick={handleAddOption} className="mt-4 text-[10px] font-black text-sanatani-orange uppercase tracking-widest flex items-center justify-center w-full gap-1 hover:text-orange-700 transition-colors bg-orange-50 hover:bg-orange-100 p-3.5 rounded-xl border border-orange-200 shadow-sm">
                       <Plus size={14}/> Add Another Option
                     </button>
                   )}
                 </div>

                 <div className="pt-4 mt-2 border-t border-gray-100">
                   <button type="submit" disabled={submitting} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none">
                     {submitting ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18}/> LAUNCH POLL OFFICIALLY</>}
                   </button>
                 </div>
               </form>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ CONCLUDE POLL MODAL (ADD ADMIN NOTE) */}
      {showConcludeModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 border-t-4 border-gray-800 text-center sm:text-left">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
                 <Lock className="text-gray-700" size={24}/> Conclude Poll
              </h3>
              <button onClick={() => setShowConcludeModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full text-gray-500 transition-colors shadow-sm"><X size={16}/></button>
            </div>

            <form onSubmit={handleConcludePoll}>
               <p className="text-xs font-bold text-gray-500 mb-5 leading-relaxed">
                 You are concluding <strong className="text-gray-800">"{concludeData.title}"</strong>. This will permanently lock voting. 
               </p>

               <div className="mb-8 text-left">
                 <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><MessageSquare size={14}/> Official Committee Decision (Optional)</label>
                 <textarea rows="4" value={concludeData.note} onChange={e => setConcludeData({...concludeData, note: e.target.value})} className="w-full p-4 bg-blue-50/50 border border-blue-200 rounded-xl text-sm font-bold text-blue-900 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none shadow-sm" placeholder="e.g. Based on the majority vote, the committee will release the funds on Monday."></textarea>
               </div>

               <div className="flex gap-3">
                 <button type="button" onClick={() => setShowConcludeModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-sm">{t('btn_cancel') || 'Cancel'}</button>
                 <button type="submit" disabled={submitting} className="flex-[2] font-black py-4 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 bg-gray-900 hover:bg-black disabled:opacity-50 flex items-center justify-center gap-2">
                   {submitting ? <Loader2 size={16} className="animate-spin"/> : <><Lock size={16}/> CONCLUDE & PUBLISH</>}
                 </button>
               </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ ADMIN EXCLUSIVE: VOTER AUDIT TRAIL MODAL */}
      {auditPoll && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-blue-500 ring-1 ring-white/20 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 shrink-0">
              <div>
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <ListChecks className="text-blue-600" size={24}/> Cryptographic Audit Trail
                </h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Admin Privilege Only</p>
              </div>
              <button onClick={() => setAuditPoll(null)} className="p-2.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors shadow-sm"><X size={16}/></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-6 scrollbar-hide pb-12">
               <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200 shadow-sm relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                 <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Audit Log for Poll:</p>
                 <p className="text-sm font-black text-blue-900">{auditPoll.title}</p>
               </div>

               {Object.keys(auditPoll.options || {}).map(optId => {
                  const opt = auditPoll.options[optId];
                  // Filter out which UIDs voted for this specific option
                  const voterUids = Object.keys(auditPoll.votedUsers || {}).filter(uid => auditPoll.votedUsers[uid] === optId);

                  return (
                    <div key={optId} className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                        <span className="text-sm font-black text-gray-800">{opt.text}</span>
                        <span className="text-[10px] font-black bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 uppercase tracking-widest shadow-sm">{voterUids.length} Votes</span>
                      </div>
                      <div className="p-2 bg-white">
                        {voterUids.length > 0 ? (
                          <div className="divide-y divide-gray-50">
                             {voterUids.map(uid => {
                               // Map the UID back to the member name
                               const member = members.find(m => m.id === uid);
                               const displayName = member ? member.name : 'Unknown User';
                               const displayPhone = member ? member.phone : uid;
                               return (
                                 <div key={uid} className="p-3 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-colors group">
                                   <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-black shrink-0 border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                       {displayName.charAt(0).toUpperCase()}
                                     </div>
                                     <span className="text-sm font-bold text-gray-900">{displayName}</span>
                                   </div>
                                   <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{displayPhone}</span>
                                 </div>
                               );
                             })}
                          </div>
                        ) : (
                          <p className="text-[10px] font-bold text-gray-400 p-4 text-center italic uppercase tracking-widest">No votes cast for this option yet.</p>
                        )}
                      </div>
                    </div>
                  );
               })}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
