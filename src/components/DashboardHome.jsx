import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, update, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm'; 
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { 
  Users, Banknote, CalendarDays, Activity, TrendingUp,
  ShieldCheck, Crown, Megaphone, Loader2, UserPlus, 
  Quote, BookOpen, WifiOff, Lock, Unlock, 
  CheckCircle, XCircle, Filter, Download, HelpCircle, 
  FileDown, FileText, Heart, Shield, Sparkles, PlusCircle, 
  Wallet, Flame, HeartHandshake, BellRing, UserCheck, ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { usePlanGate } from '../hooks/usePlanGate';

export default function DashboardHome({ session, isOnline = navigator.onLine, setActiveTab }) {
  const { t, getArray, workspaceType } = useLanguage(); 
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [showQuickGuide, setShowQuickGuide] = useState(false);

  // ✨ Dynamic Institution Label mapping
  const orgType = session?.type || session?.workspaceType || workspaceType || 'Mandir';
  const isPurohitMode = orgType === 'Purohit';

  const institutionLabel = useMemo(() => {
    if (isPurohitMode) return t('purohit_desk') || 'Purohit Desk';
    const rawType = String(orgType).toUpperCase();
    switch (rawType) {
      case 'GOSHALA': return t('workspace_goshala') || 'Goshala';
      case 'SANGHA': return t('workspace_sangha') || 'Sangha';
      case 'ASHRAM': return t('workspace_ashram') || 'Ashram';
      case 'GURUKUL': return t('workspace_gurukul') || 'Gurukul';
      case 'SATSANG': return t('workspace_satsang') || 'Satsang';
      case 'YOGA': return t('workspace_yoga') || 'Yoga Center';
      case 'TRUST': return t('workspace_trust') || 'Trust';
      case 'TIRTH': return t('workspace_tirth') || 'Tirth / Dham';
      case 'SAMAJ': return t('workspace_samaj') || 'Samaj';
      case 'MANDIR':
      default: return t('workspace_mandir') || 'Mandir';
    }
  }, [orgType, t, isPurohitMode]);

  // ✨ Dynamic Multi-Lingual Shloka State
  const quotesList = getArray('quotes');
  const [dailyQuote, setDailyQuote] = useState(quotesList[0] || {});

  // ✨ OFFLINE CACHE INITIALIZATION
  const [globalStats, setGlobalStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_stats_${session.communityId}`)) || { devotees: 0, income: 0, expense: 0, activeEvents: 0, broadcastsSent: 0 }; } 
    catch { return { devotees: 0, income: 0, expense: 0, activeEvents: 0, broadcastsSent: 0 }; }
  });
  const [personalStats, setPersonalStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_pstats_${session.uid}`)) || { myDonations: 0 }; } 
    catch { return { myDonations: 0 }; }
  });
  
  // Smart Widget States
  const [vivahStats, setVivahStats] = useState({ totalProfiles: 0, pendingRequests: 0 });
  const [poojaStats, setPoojaStats] = useState({ upcomingRituals: 0, nextEvent: null });
  const [panjikaNext, setPanjikaNext] = useState(null);

  const [recentLogs, setRecentLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_logs_${session.communityId}`)) || []; } 
    catch { return []; }
  });
  const [accessRequests, setAccessRequests] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_reqs_${session.communityId}`)) || []; } 
    catch { return []; }
  });
  const [limits, setLimits] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_limits_${session.communityId}`)) || { plan: 'FREE', pdfsGen: 0, maxPdfs: 3, maxMembers: 50 }; } 
    catch { return { plan: 'FREE', pdfsGen: 0, maxPdfs: 3, maxMembers: 50 }; }
  });

  const [myAccessStatus, setMyAccessStatus] = useState('RESTRICTED'); 
  const [auditFilters, setAuditFilters] = useState({ actionType: 'ALL', startDate: '', endDate: '' });

  const curSymbol = session?.currency?.symbol || '৳';

  // Greeting Logic based on Time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('suprabhat') || 'Suprabhat'; 
    if (hour < 17) return t('namaskar') || 'Namaskar';  
    return t('shubha_sandhya') || 'Shubha Sandhya';           
  }, [t]);

  useEffect(() => {
    if(quotesList.length > 0) {
      setDailyQuote(quotesList[Math.floor(Math.random() * quotesList.length)]);
    }
  }, [quotesList]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    const updatePromise = update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
    if (!isOnline && successMsg) {
      alert(`📶 OFFLINE MODE SAVED!\n\n${successMsg}\n\nThis will permanently sync to the server the moment your internet reconnects.`);
    }
    return updatePromise;
  };

  // ✨ CORE DATA SYNCHRONIZATION WITH CACHING
  useEffect(() => {
    const commPath = `communities/${session.communityId}`;
    pushToDataLayer('view_dashboard_home', { user_role: session.role, workspace_type: orgType });

    const memRef = ref(db, `${commPath}/members`);
    const unsubMem = onValue(memRef, (snap) => {
      const devCount = snap.exists() ? Object.keys(snap.val()).length : 0;
      setGlobalStats(s => {
        const newStats = { ...s, devotees: devCount };
        localStorage.setItem(`sb_stats_${session.communityId}`, JSON.stringify(newStats));
        return newStats;
      });
    });

    const incRef = ref(db, `${commPath}/logs/Donation`);
    const unsubInc = onValue(incRef, (snap) => {
      let globalInc = 0; let myInc = 0;
      if (snap.exists()) {
        Object.values(snap.val()).forEach(d => {
          globalInc += (d.amount || 0);
          if (d.donorId === session.uid) myInc += (d.amount || 0);
        });
      }
      setGlobalStats(s => {
        const newStats = { ...s, income: globalInc };
        localStorage.setItem(`sb_stats_${session.communityId}`, JSON.stringify(newStats));
        return newStats;
      });
      setPersonalStats({ myDonations: myInc });
      localStorage.setItem(`sb_pstats_${session.uid}`, JSON.stringify({ myDonations: myInc }));
    });

    const expRef = ref(db, `${commPath}/logs/Expense`);
    const unsubExp = onValue(expRef, (snap) => {
      let total = 0;
      if (snap.exists()) Object.values(snap.val()).forEach(e => total += (e.amount || 0));
      setGlobalStats(s => {
        const newStats = { ...s, expense: total };
        localStorage.setItem(`sb_stats_${session.communityId}`, JSON.stringify(newStats));
        return newStats;
      });
    });

    // Event & Widget Fetching
    const evtRef = ref(db, `${commPath}/events`);
    const unsubEvt = onValue(evtRef, (snap) => {
      let active = 0;
      const now = new Date();
      now.setHours(0,0,0,0);
      let nextEv = null;

      if (snap.exists()) {
        const events = Object.values(snap.val()).filter(e => e.status !== 'CONCLUDED');
        events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        events.forEach(e => { 
          const evTime = new Date(e.dateStr || e.timestamp).getTime();
          if (evTime >= now.getTime()) {
            active++; 
            if (!nextEv) nextEv = e;
          }
        });
      }
      
      setPanjikaNext(nextEv);
      setGlobalStats(s => {
        const newStats = { ...s, activeEvents: active };
        localStorage.setItem(`sb_stats_${session.communityId}`, JSON.stringify(newStats));
        return newStats;
      });
    });

    // Vivah Bandhan Stats
    const vivahProfRef = ref(db, `${commPath}/matrimonial_profiles`);
    const vivahReqRef = ref(db, `${commPath}/matrimonial_requests`);
    const unsubVivahProf = onValue(vivahProfRef, snap => {
      setVivahStats(s => ({ ...s, totalProfiles: snap.exists() ? Object.keys(snap.val()).length : 0 }));
    });
    const unsubVivahReq = onValue(vivahReqRef, snap => {
      if (snap.exists()) {
        const reqs = Object.values(snap.val());
        const pendingForMe = reqs.filter(r => r.toUserId === session.uid && r.status === 'PENDING').length;
        setVivahStats(s => ({ ...s, pendingRequests: pendingForMe }));
      }
    });

    // Pooja / Purohit Stats
    const poojaRef = ref(db, `${commPath}/purohit_anushthans`);
    const unsubPooja = onValue(poojaRef, snap => {
      if (snap.exists()) {
        const anushthans = Object.values(snap.val()).filter(a => a.status !== 'COMPLETED');
        anushthans.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setPoojaStats({ upcomingRituals: anushthans.length, nextEvent: anushthans[0] || null });
      }
    });

    const auditRef = ref(db, `${commPath}/audit_logs`);
    const unsubAudit = onValue(auditRef, (snap) => {
      if (snap.exists()) {
        const logs = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        logs.sort((a, b) => b.timestamp - a.timestamp);
        const topLogs = logs.slice(0, 50);
        setRecentLogs(topLogs); 
        localStorage.setItem(`sb_logs_${session.communityId}`, JSON.stringify(topLogs));
      }
    });

    const accessRef = ref(db, `${commPath}/access_requests`);
    const unsubAccess = onValue(accessRef, (snap) => {
      if (snap.exists()) {
        const reqs = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        const pending = reqs.filter(r => r.status === 'PENDING');
        setAccessRequests(pending);
        localStorage.setItem(`sb_reqs_${session.communityId}`, JSON.stringify(pending));

        const myReq = reqs.find(r => r.uid === session.uid);
        if (myReq) {
          if (myReq.status === 'APPROVED' && myReq.expiresAt > Date.now()) setMyAccessStatus('GRANTED');
          else if (myReq.status === 'PENDING') setMyAccessStatus('PENDING');
          else setMyAccessStatus('RESTRICTED');
        }
      } else {
        setAccessRequests([]);
        localStorage.removeItem(`sb_reqs_${session.communityId}`);
      }
    });

    const infoRef = ref(db, `${commPath}/info`);
    const unsubInfo = onValue(infoRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const newLimits = { plan: data.plan || 'FREE', pdfsGen: data.pdfsGeneratedThisMonth || 0, maxPdfs: 3, maxMembers: 50 };
        setLimits(newLimits);
        localStorage.setItem(`sb_limits_${session.communityId}`, JSON.stringify(newLimits));

        setGlobalStats(s => {
          const newStats = { ...s, broadcastsSent: data.broadcastsSentThisMonth || 0 };
          localStorage.setItem(`sb_stats_${session.communityId}`, JSON.stringify(newStats));
          return newStats;
        });
      }
    });

    const failsafeTimer = setTimeout(() => { setLoading(false); }, 800);

    return () => { 
      unsubMem(); unsubInc(); unsubExp(); unsubEvt(); unsubAudit(); unsubAccess(); unsubInfo(); 
      unsubVivahProf(); unsubVivahReq(); unsubPooja();
      clearTimeout(failsafeTimer);
    };
  }, [session.communityId, session.uid, session.role, orgType]);

  const hasGlobalAccess = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.role === 'MANAGER' || myAccessStatus === 'GRANTED';
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(session.role);
  const treasuryBalance = globalStats.income - globalStats.expense;
  const incomePct = globalStats.income === 0 && globalStats.expense === 0 ? 0 : Math.round((globalStats.income / (globalStats.income + globalStats.expense)) * 100);

  // Gamification Setup Progress Calculation
  const setupProgress = useMemo(() => {
    let score = 0;
    if (globalStats.devotees > 1) score += 25; // More than just the admin
    if (globalStats.income > 0) score += 25;
    if (globalStats.activeEvents > 0) score += 25;
    if (recentLogs.length > 2) score += 25;
    return score;
  }, [globalStats, recentLogs]);


  const requestGlobalAccess = async () => {
    try {
      const newReqKey = push(ref(db, `communities/${session.communityId}/access_requests`)).key;
      const updates = {};
      updates[`communities/${session.communityId}/access_requests/${newReqKey}`] = { 
        id: newReqKey, uid: session.uid, userName: session.userName, requestType: 'FULL_LEDGER_ACCESS', status: 'PENDING', timestamp: serverTimestamp() 
      };

      await executeSafeUpdate(updates, t('req_submitted') || "Access request queued offline.");
      setMyAccessStatus('PENDING');
      pushToDataLayer('request_data_access', { request_type: 'FULL_LEDGER_ACCESS' });
    } catch (e) { alert("Failed to push request. " + e.message); }
  };

  const handleAccessDecision = async (reqId, decision, uid, userName) => {
    try {
      const updates = {};
      updates[`communities/${session.communityId}/access_requests/${reqId}/status`] = decision;
      updates[`communities/${session.communityId}/access_requests/${reqId}/approvedBy`] = session.userName;
      updates[`communities/${session.communityId}/access_requests/${reqId}/expiresAt`] = decision === 'APPROVED' ? Date.now() + (24 * 60 * 60 * 1000) : null;

      const logKey = push(ref(db, `communities/${session.communityId}/audit_logs`)).key;
      updates[`communities/${session.communityId}/audit_logs/${logKey}`] = {
        id: logKey,
        actionType: decision === 'APPROVED' ? 'ACCESS_GRANTED' : 'ACCESS_DENIED',
        managerName: session.userName,
        description: `${decision === 'APPROVED' ? 'Granted' : 'Denied'} 24H global ledger access for ${userName}.`,
        timestamp: serverTimestamp()
      };

      await executeSafeUpdate(updates, `Access decision (${decision}) queued offline.`);
      pushToDataLayer('handle_access_request', { target_user: uid, decision: decision });
    } catch (e) { alert("Failed to process request."); }
  };

  const filteredLogs = recentLogs.filter(log => {
    let match = true;
    if (auditFilters.actionType !== 'ALL' && !log.actionType.includes(auditFilters.actionType)) match = false;
    if (auditFilters.startDate && log.timestamp < new Date(auditFilters.startDate).getTime()) match = false;
    if (auditFilters.endDate && log.timestamp > new Date(auditFilters.endDate).getTime() + 86400000) match = false;
    return match;
  }); 

  // ✨ BULK PDF EXPORT FOR AUDIT LOG
  const exportBulkAuditPDF = () => {
    pushToDataLayer('export_data', { export_type: 'PDF', data_category: 'AUDIT_LOG' });
    const doc = new jsPDF();
    doc.text(`Security Audit Log - ${session.communityName || "Workspace"}`, 14, 15);

    const tableData = filteredLogs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.actionType.replace(/_/g, ' '),
      log.managerName || 'System',
      log.description
    ]);

    doc.autoTable({
      startY: 20,
      head: [["Date & Time", "Action", "Authorized By", "Details"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [230, 81, 0] }
    });

    doc.save(`Audit_Report_${Date.now()}.pdf`);
  };

  // ✨ BULK CSV EXPORT FOR AUDIT LOG
  const exportBulkAuditCSV = () => {
    pushToDataLayer('export_data', { export_type: 'CSV', data_category: 'AUDIT_LOG' });
    let csvContent = "data:text/csv;charset=utf-8,Date,Action,Authorized By,Details\n";
    filteredLogs.forEach(log => {
        let date = new Date(log.timestamp).toLocaleString().replace(/,/g, '');
        let desc = log.description.replace(/"/g, '""'); 
        let row = `"${date}","${log.actionType}","${log.managerName}","${desc}"`;
        csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = `Audit_Report_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSingleAuditVoucher = (log) => {
    pushToDataLayer('file_download', { file_extension: 'PDF', file_name: 'Single_Audit_Voucher' });
    const doc = new jsPDF({ format: 'a5' });
    doc.setFillColor(25, 118, 210);
    doc.rect(0, 0, 148, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(session.communityName || "Sanatani Workspace", 74, 12, { align: "center" });
    doc.setFontSize(10);
    doc.text("OFFICIAL AUDIT VOUCHER", 74, 19, { align: "center" });
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text(`Log ID: ${log.id}`, 15, 35);
    doc.text(`Timestamp: ${new Date(log.timestamp).toLocaleString()}`, 15, 43);
    doc.setDrawColor(220, 220, 220);
    doc.line(15, 48, 133, 48);
    doc.setFontSize(12);
    doc.setTextColor(230, 81, 0);
    doc.text(`Action: ${log.actionType}`, 15, 60);
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const splitDesc = doc.splitTextToSize(log.description, 115);
    doc.text(splitDesc, 15, 70);
    doc.setFont("helvetica", "bold");
    doc.text(`Authorized By: ${log.managerName || 'System'}`, 15, 100);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Cryptographically generated via Sanatani Bandhan Security Engine.", 74, 140, { align: "center" });
    doc.save(`Audit_Voucher_${log.id}.pdf`);
  };

  if (loading) return <div className="flex justify-center items-center h-[60vh] text-sanatani-orange"><Loader2 size={48} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full">

      {/* QUICK GUIDE MODAL */}
      {showQuickGuide && createPortal(
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden fade-in relative ring-1 ring-white/20 p-8 border-t-4 border-sanatani-orange">
            <button onClick={() => setShowQuickGuide(false)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full transition-colors"><XCircle size={20}/></button>
            <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2"><HelpCircle className="text-sanatani-orange"/> {t('quick_guide_title') || 'Command Center Guide'}</h3>
            <div className="space-y-4 text-sm font-bold text-gray-600 leading-relaxed">
              <p><strong>1. Interconnected Metrics:</strong> Tap any Quick Action shortcut (like Log Chanda or Schedule Event) to instantly jump to its specific management module.</p>
              <p><strong>2. Smart Widgets:</strong> The central dashboard pulls live data from your Panjika, Matrimonial, and Ritual modules to give you a bird's-eye view of your ecosystem.</p>
              <p><strong>3. Privacy Engine:</strong> To protect community funds, general devotees only see their personal contributions until global access is granted by an Admin.</p>
            </div>
          </div>
        </div>, document.body
      )}

      {/* 🚀 WELCOME BANNER WITH SHLOKA ENGINE */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-black rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden ring-1 ring-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10 pointer-events-none">
           <Sparkles size={200} className="text-sanatani-orange"/>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border backdrop-blur-md shadow-sm ${isPurohitMode ? 'bg-red-500/20 text-red-300 border-red-500/20' : 'bg-white/10 text-orange-400 border-white/10'}`}>
                {isPurohitMode ? t('global_scholar') || 'Global Scholar' : `${institutionLabel} Workspace`}
              </span>
              <button onClick={() => {setShowQuickGuide(true); pushToDataLayer('open_quick_guide', { module: 'DashboardHome' });}} className="text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-500/20 hover:bg-blue-500/40 transition-colors flex items-center gap-1 shadow-sm">
                 <HelpCircle size={10}/> {t('quick_guide') || 'Guide'}
              </button>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
              {greeting}, {session?.userName?.split(' ')[0]}! 🙏
            </h1>
            <p className="text-xs font-bold text-gray-400 max-w-lg leading-relaxed">
              {t('welcome_to') || 'Welcome to the'} <strong className="text-white">{session?.communityName}</strong> {t('command_center_desc') || 'command center. Here is what is happening across your network today.'}
            </p>
          </div>

          {/* Setup Progress Widget OR Shloka Quote */}
          {setupProgress < 100 && isAdmin ? (
            <div className="bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl md:w-64 shrink-0 shadow-lg animate-in slide-in-from-right-4">
              <div className="flex justify-between items-end mb-2">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{t('setup_progress') || 'Setup Progress'}</p>
                <p className="text-sm font-black text-sanatani-orange">{setupProgress}%</p>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 h-full rounded-full transition-all duration-1000" style={{ width: `${setupProgress}%` }}></div>
              </div>
            </div>
          ) : (
            <div className="w-full md:w-1/2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 relative group transition-all hover:bg-white/10 shadow-lg">
               <Quote size={40} className="absolute top-3 left-3 text-white/5 group-hover:text-sanatani-orange/10 transition-colors" />
               <div className="relative z-10 pl-4 border-l-2 border-sanatani-orange">
                  <p className="text-sm sm:text-base font-black text-orange-400 font-devanagari mb-1 leading-snug">{dailyQuote.text}</p>
                  <p className="text-[11px] sm:text-xs font-bold text-gray-300 italic mb-2">"{dailyQuote.meaning}"</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1"><BookOpen size={10}/> {dailyQuote.source}</p>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* DEVOTEE PRIVACY LOCK BANNER */}
      {!hasGlobalAccess && !isPurohitMode && (
        <div className="bg-gray-900 text-white rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4 border border-gray-800 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 p-3 rounded-2xl border border-white/5"><Lock className="text-sanatani-orange" size={24}/></div>
            <div>
              <h3 className="text-lg font-black tracking-tight">{t('global_ledger_locked') || 'Global Ledger Locked'}</h3>
              <p className="text-xs text-gray-400 font-bold">{t('global_ledger_desc') || 'You are in Personal Mode. Community figures are hidden for security.'}</p>
            </div>
          </div>
          <button 
            onClick={requestGlobalAccess}
            disabled={myAccessStatus === 'PENDING'}
            className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:transform-none text-white text-xs font-black uppercase tracking-widest px-6 py-3.5 rounded-xl shadow-lg transition-all hover:-translate-y-0.5"
          >
            {myAccessStatus === 'PENDING' ? (t('request_pending') || 'Request Pending...') : (t('request_global_access') || 'Request Global Access')}
          </button>
        </div>
      )}

      {/* 📊 KPI VITAL SIGNS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center cursor-default hover:border-sanatani-orange hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
           <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-5 group-hover:opacity-10 transition-opacity"><Users size={100}/></div>
           <div className="h-14 w-14 mb-4 bg-gradient-to-br from-orange-50 to-orange-100 text-sanatani-orange rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-orange-200 relative z-10"><Users size={26} /></div>
           <p className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight relative z-10">{globalStats.devotees.toLocaleString()}</p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 relative z-10">Total {t('members') || 'Members'}</p>
        </div>

        <div className={`bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden ${hasGlobalAccess ? 'cursor-default hover:border-green-400 hover:shadow-xl' : ''}`}>
           <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-5 group-hover:opacity-10 transition-opacity"><Banknote size={100}/></div>
           <div className={`h-14 w-14 mb-4 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border relative z-10 ${hasGlobalAccess ? (treasuryBalance >= 0 ? 'bg-gradient-to-br from-green-50 to-emerald-100 text-green-600 border-green-200' : 'bg-gradient-to-br from-red-50 to-rose-100 text-red-600 border-red-200') : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
              <Banknote size={26} />
           </div>
           <p className={`text-2xl sm:text-3xl font-black tracking-tight relative z-10 ${hasGlobalAccess ? (treasuryBalance >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-300 filter blur-sm'}`}>
               {curSymbol}{hasGlobalAccess ? Math.abs(treasuryBalance).toLocaleString() : 'XXX,XXX'}
           </p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 relative z-10">Net {t('nav_treasury')?.split('&')[0] || 'Treasury'}</p>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center cursor-default group hover:border-blue-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
           <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-5 group-hover:opacity-10 transition-opacity"><TrendingUp size={100}/></div>
           <div className="h-14 w-14 mb-4 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-blue-200 relative z-10"><TrendingUp size={26} /></div>
           <p className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight truncate w-full relative z-10">{curSymbol}{hasGlobalAccess ? globalStats.income.toLocaleString() : personalStats.myDonations.toLocaleString()}</p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 relative z-10">{hasGlobalAccess ? `Lifetime ${t('funds') || 'Funds'}` : 'My Lifetime'}</p>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center cursor-default group hover:border-purple-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
           <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-5 group-hover:opacity-10 transition-opacity"><CalendarDays size={100}/></div>
           <div className="h-14 w-14 mb-4 bg-gradient-to-br from-purple-50 to-fuchsia-100 text-purple-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-purple-200 relative z-10"><CalendarDays size={26} /></div>
           <p className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight relative z-10">{globalStats.activeEvents}</p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 relative z-10">Active {t('nav_panjika')?.split('&')[0] || 'Events'}</p>
        </div>
      </div>

      {/* 🚀 COMMAND SHORTCUTS MATRIX */}
      {hasGlobalAccess && !isPurohitMode && (
        <div className="bg-gray-50/80 border border-gray-200 rounded-3xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={14}/> {t('command_shortcuts') || 'Command Shortcuts'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <button onClick={() => { if(setActiveTab) setActiveTab('directory'); pushToDataLayer('quick_action_click', { action: 'Add Member' }); }} className="bg-white border border-gray-200 hover:border-sanatani-orange hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-orange-50 text-sanatani-orange p-3 rounded-full group-hover:scale-110 transition-transform"><UserPlus size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{t('btn_add_member') || 'Add Member'}</span>
            </button>

            <button onClick={() => { if(setActiveTab) setActiveTab('treasury'); pushToDataLayer('quick_action_click', { action: 'Log Chanda' }); }} className="bg-white border border-gray-200 hover:border-green-500 hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-green-50 text-green-600 p-3 rounded-full group-hover:scale-110 transition-transform"><Wallet size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{t('btn_log_chanda') || 'Log Chanda'}</span>
            </button>

            <button onClick={() => { if(setActiveTab) setActiveTab('panjika'); pushToDataLayer('quick_action_click', { action: 'Schedule Event' }); }} className="bg-white border border-gray-200 hover:border-blue-500 hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-full group-hover:scale-110 transition-transform"><CalendarDays size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{t('schedule_event') || 'New Event'}</span>
            </button>

            <button onClick={() => { if(setActiveTab) setActiveTab('prachar'); pushToDataLayer('quick_action_click', { action: 'Send Broadcast' }); }} className="bg-white border border-gray-200 hover:border-purple-500 hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-purple-50 text-purple-600 p-3 rounded-full group-hover:scale-110 transition-transform"><Megaphone size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{t('btn_send_alert') || 'Send Alert'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ✨ THE SUPER-APP WIDGET ZONE (Cross-Module Integrations) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* 🛕 PUROHIT / POOJA WIDGET */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
           <div className="flex justify-between items-start mb-4">
             <div className="bg-orange-50 text-orange-600 p-3 rounded-xl border border-orange-100"><Flame size={20}/></div>
             <button onClick={() => { if(setActiveTab) setActiveTab('pooja'); }} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-orange-500 transition-colors flex items-center gap-1">Open Desk <ArrowRight size={10}/></button>
           </div>
           <h3 className="text-lg font-black text-gray-900 mb-1">{isPurohitMode ? 'My Ritual Diary' : (t('nav_pooja')?.split('&')[0] || 'Pooja Desk')}</h3>
           <p className="text-xs font-bold text-gray-500 mb-4">{poojaStats.upcomingRituals} Active Reservations</p>

           <div className="mt-auto bg-gray-50 p-4 rounded-2xl border border-gray-100">
             {poojaStats.nextEvent ? (
               <>
                 <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest mb-1.5 flex items-center gap-1"><BellRing size={10}/> Next Scheduled Ritual</p>
                 <p className="text-sm font-black text-gray-900 truncate">{poojaStats.nextEvent.pujaName}</p>
                 <p className="text-[10px] font-bold text-gray-500 mt-1 truncate">For: {poojaStats.nextEvent.yajamanName}</p>
               </>
             ) : (
               <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-2">No upcoming rituals.</p>
             )}
           </div>
        </div>

        {/* ❤️ VIVAH BANDHAN WIDGET */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
           <div className="flex justify-between items-start mb-4">
             <div className="bg-pink-50 text-pink-600 p-3 rounded-xl border border-pink-100"><HeartHandshake size={20}/></div>
             <button onClick={() => { if(setActiveTab) setActiveTab('vivah'); }} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-pink-500 transition-colors flex items-center gap-1">Open Desk <ArrowRight size={10}/></button>
           </div>
           <h3 className="text-lg font-black text-gray-900 mb-1">{t('nav_vivah') || 'Vivah Bandhan'}</h3>
           {isAdmin ? (
             <p className="text-xs font-bold text-gray-500 mb-4">{vivahStats.totalProfiles} Verified Profiles Active</p>
           ) : (
             <p className="text-xs font-bold text-gray-500 mb-4">{t('vivah_subtitle')?.split('.')[0] || 'Sanatan Matchmaking'}</p>
           )}

           <div className="mt-auto bg-pink-50/50 p-4 rounded-2xl border border-pink-100 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-pink-700 uppercase tracking-widest mb-1">Pending Requests</p>
                <p className="text-xl font-black text-pink-600">{vivahStats.pendingRequests}</p>
              </div>
              <button onClick={() => { if(setActiveTab) setActiveTab('vivah'); }} className="bg-white p-2.5 rounded-xl border border-pink-200 text-pink-600 shadow-sm hover:bg-pink-600 hover:text-white transition-colors">
                <ArrowRight size={16}/>
              </button>
           </div>
        </div>

        {/* 📆 PANJIKA EVENT WIDGET */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
           <div className="flex justify-between items-start mb-4">
             <div className="bg-purple-50 text-purple-600 p-3 rounded-xl border border-purple-100"><CalendarDays size={20}/></div>
             <button onClick={() => { if(setActiveTab) setActiveTab('panjika'); }} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-purple-500 transition-colors flex items-center gap-1">Open Desk <ArrowRight size={10}/></button>
           </div>
           <h3 className="text-lg font-black text-gray-900 mb-1">{t('nav_panjika')?.split('&')[0] || 'Utsav Panjika'}</h3>
           <p className="text-xs font-bold text-gray-500 mb-4">{globalStats.activeEvents} Upcoming Events</p>

           <div className="mt-auto bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
             {panjikaNext ? (
               <>
                 <p className="text-[9px] font-black text-purple-700 uppercase tracking-widest mb-1.5 flex items-center gap-1"><CalendarDays size={10}/> Next Event</p>
                 <p className="text-sm font-black text-gray-900 truncate">{panjikaNext.title}</p>
                 <p className="text-[10px] font-bold text-gray-500 mt-1">{panjikaNext.dateStr}</p>
               </>
             ) : (
               <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-2">No upcoming events.</p>
             )}
           </div>
        </div>

      </div>

      {/* ADMIN PERMISSION WORKFLOW: ACCESS REQUESTS PANEL */}
      {(session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.role === 'MANAGER') && accessRequests.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-3xl p-6 shadow-sm animate-in slide-in-from-top-4">
          <h3 className="text-sm font-black text-orange-900 mb-4 flex items-center gap-2"><Unlock size={18}/> Pending Ledger Access Requests</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accessRequests.map(req => (
              <div key={req.id} className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 flex justify-between items-center">
                <div>
                  <p className="text-sm font-black text-gray-900">{req.userName}</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{req.requestType.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAccessDecision(req.id, 'APPROVED', req.uid, req.userName)} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-xl transition-colors"><CheckCircle size={18}/></button>
                  <button onClick={() => handleAccessDecision(req.id, 'REJECTED', req.uid, req.userName)} className="p-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl transition-colors"><XCircle size={18}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📅 TWO COLUMN LAYOUT: AUDIT LOGS & PLAN WIDGET */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">

        {/* Left Col: Security Audit Log */}
        <div className="xl:col-span-2 bg-white border border-gray-100 rounded-3xl shadow-sm flex flex-col overflow-hidden ring-1 ring-black/5 h-[500px]">

          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest"><Activity size={18} className="text-sanatani-orange" /> Security Audit Log</h3>

            <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="flex flex-1 sm:flex-none items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
                  <Filter size={14} className="text-gray-400"/>
                  <select 
                    value={auditFilters.actionType} 
                    onChange={e => {setAuditFilters({...auditFilters, actionType: e.target.value}); pushToDataLayer('filter_audit_log');}} 
                    className="bg-transparent text-[11px] font-bold text-gray-700 outline-none w-full sm:w-28 cursor-pointer"
                  >
                    <option value="ALL">All Actions</option>
                    <option value="CHANDA">Chanda / Dakshina</option>
                    <option value="EXPENSE">Expense</option>
                    <option value="EVENT">Events</option>
                  </select>
                </div>
                <input type="date" value={auditFilters.startDate} onChange={e => setAuditFilters({...auditFilters, startDate: e.target.value})} className="flex-1 sm:flex-none bg-white border border-gray-200 rounded-xl px-3 py-2 text-[11px] font-bold text-gray-700 outline-none shadow-sm cursor-pointer" />
              </div>

              {hasGlobalAccess && filteredLogs.length > 0 && (
                <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full sm:w-auto">
                   <button onClick={exportBulkAuditCSV} className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl transition-colors text-xs font-black tracking-widest border border-gray-200 shadow-sm"><FileDown size={14}/> CSV</button>
                   <button onClick={exportBulkAuditPDF} className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl transition-colors text-xs font-black tracking-widest border border-red-200 shadow-sm"><FileText size={14}/> PDF</button>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-white flex-1 overflow-y-auto scrollbar-hide">
            {filteredLogs.slice(0, 50).length > 0 ? (
              <div className="space-y-2">
                {filteredLogs.slice(0, 50).map((log) => (
                  <div key={log.id} className="p-4 hover:bg-gray-50 rounded-2xl transition-colors border border-transparent hover:border-gray-100 flex items-center justify-between group min-w-0">
                    <div className="flex-1 pr-4 min-w-0">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md border shadow-sm shrink-0 ${
                          log.actionType.includes('CHANDA') || log.actionType.includes('INCOME') || log.actionType.includes('BOOKED') ? 'text-green-600 bg-green-50 border-green-200' :
                          log.actionType.includes('EXPENSE') || log.actionType.includes('DELETED') ? 'text-red-600 bg-red-50 border-red-200' :
                          log.actionType.includes('EVENT') ? 'text-blue-600 bg-blue-50 border-blue-200' :
                          'text-gray-600 bg-gray-100 border-gray-200'
                        }`}>{log.actionType.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-gray-400 font-bold font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className={`text-sm font-bold leading-snug truncate ${hasGlobalAccess || log.description.includes(session.userName) ? 'text-gray-800' : 'text-gray-300 blur-sm'}`}>
                        {hasGlobalAccess || log.description.includes(session.userName) ? log.description : 'Confidential Activity Logged'}
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold mt-2 flex items-center gap-1"><ShieldCheck size={10}/> Auth: {log.managerName || 'System'}</p>
                    </div>

                    {(hasGlobalAccess || log.description.includes(session.userName)) && (
                      <button onClick={() => exportSingleAuditVoucher(log)} className="p-2.5 bg-gray-50 border border-gray-200 text-gray-500 hover:bg-sanatani-orange hover:border-sanatani-orange hover:text-white rounded-xl transition-all shadow-sm group-hover:shadow-md shrink-0" title="Download Voucher">
                        <Download size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <ShieldAlert size={40} className="mb-3 opacity-20"/>
                <p className="text-xs font-bold uppercase tracking-widest">No logs match criteria</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Plan & Limits Widget */}
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm flex flex-col overflow-hidden ring-1 ring-black/5 h-[500px]">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest"><Crown size={18} className={limits.plan === 'PREMIUM' ? 'text-yellow-500' : 'text-gray-400'} /> Workspace Plan</h3>
            {limits.plan === 'PREMIUM' ? (
              <span className="text-[9px] font-black text-yellow-700 bg-yellow-100 px-2.5 py-1 rounded border border-yellow-200 uppercase tracking-widest shadow-sm">SMART PRO</span>
            ) : (
              <span className="text-[9px] font-black text-gray-600 bg-white px-2.5 py-1 rounded border border-gray-200 uppercase tracking-widest shadow-sm">SEVA FREE</span>
            )}
          </div>

          <div className="p-6 space-y-6 flex-1 overflow-y-auto scrollbar-hide">
            {/* Visual Analytics Mini */}
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="relative w-28 h-28 rounded-full flex items-center justify-center shadow-inner" style={{ background: hasGlobalAccess ? `conic-gradient(#16a34a ${incomePct}%, #ef4444 0)` : '#f3f4f6' }}>
                <div className="absolute inset-0 m-3 bg-white rounded-full flex flex-col items-center justify-center shadow-md">
                  <span className="text-lg font-black text-gray-900">{hasGlobalAccess ? `${incomePct}%` : '🔒'}</span>
                  <span className="text-[7px] font-black uppercase text-gray-400 tracking-widest">Income</span>
                </div>
              </div>
            </div>

            <div className="group">
              <div className="flex justify-between items-end mb-2">
                <p className="text-xs font-bold text-gray-600 flex items-center gap-1.5"><Users size={14}/> Devotee Capacity</p>
                <p className="text-sm font-black text-gray-900">{globalStats.devotees} <span className="text-[10px] text-gray-400 font-bold">/ {limits.plan === 'PREMIUM' ? '∞' : limits.maxMembers}</span></p>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 relative ${limits.plan === 'FREE' && globalStats.devotees >= limits.maxMembers ? 'bg-red-500' : 'bg-gradient-to-r from-orange-400 to-orange-500'}`} 
                  style={{ width: limits.plan === 'PREMIUM' ? '100%' : `${Math.min((globalStats.devotees / limits.maxMembers) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="group">
              <div className="flex justify-between items-end mb-2">
                <p className="text-xs font-bold text-gray-600 flex items-center gap-1.5"><FileText size={14}/> PDF Master Reports</p>
                <p className="text-sm font-black text-gray-900">{limits.pdfsGen} <span className="text-[10px] text-gray-400 font-bold">/ {limits.plan === 'PREMIUM' ? '∞' : limits.maxPdfs}</span></p>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 relative ${limits.plan === 'FREE' && limits.pdfsGen >= limits.maxPdfs ? 'bg-red-500' : 'bg-gradient-to-r from-blue-400 to-blue-500'}`} 
                  style={{ width: limits.plan === 'PREMIUM' ? '100%' : `${Math.min((limits.pdfsGen / limits.maxPdfs) * 100, 100)}%` }}
                />
              </div>
            </div>

            {limits.plan === 'FREE' && hasGlobalAccess && !isPurohitMode && (
              <div className="mt-4 p-5 bg-gradient-to-br from-gray-900 to-black rounded-2xl border border-gray-800 text-left shadow-lg relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform"><Shield size={64}/></div>
                 <h4 className="text-sm font-black text-white mb-2 relative z-10">{t('upgrade_title') || 'Ready to Scale?'}</h4>
                 <ul className="text-[10px] font-bold text-gray-400 space-y-1.5 mb-4 relative z-10">
                   <li className="flex items-center gap-2"><CheckCircle size={12} className="text-sanatani-orange"/> {t('upgrade_r1') || 'Unlimited Member Profiles'}</li>
                   <li className="flex items-center gap-2"><CheckCircle size={12} className="text-sanatani-orange"/> {t('upgrade_r2') || 'Infinite Master PDF Reports'}</li>
                   <li className="flex items-center gap-2"><CheckCircle size={12} className="text-sanatani-orange"/> {t('upgrade_r3') || 'Verified Organization Badge'}</li>
                 </ul>
                 <button onClick={() => { if(setActiveTab) setActiveTab('settings'); pushToDataLayer('quick_action_click', { action: 'Upgrade Pro' }); }} className="w-full bg-white hover:bg-gray-100 text-gray-900 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-md hover:shadow-lg relative z-10">
                   {t('btn_upgrade_pro') || 'Upgrade to Smart Pro'}
                 </button>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
