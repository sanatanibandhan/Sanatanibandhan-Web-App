import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, update, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm'; 
// ✨ ENTERPRISE PDF ENGINE INTEGRATION
import { generateBulkAuditPdf, generateSingleAuditVoucherPdf } from '../utils/pdfGenerator';
import { 
  Users, Banknote, CalendarDays, Activity, TrendingUp,
  ShieldCheck, Crown, Megaphone, Loader2, UserPlus, 
  Quote, BookOpen, WifiOff, Lock, Unlock, 
  CheckCircle, CheckCircle2, XCircle, Filter, Download, HelpCircle, 
  FileDown, FileText, Heart, Shield, Sparkles, PlusCircle, 
  Wallet, Flame, HeartHandshake, BellRing, UserCheck, ShieldAlert,
  ArrowRight, Sun
} from 'lucide-react';
import { usePlanGate } from '../hooks/usePlanGate';

export default function DashboardHome({ session, isOnline = navigator.onLine, setActiveTab }) {
  const { t, language, getArray, workspaceType } = useLanguage(); 
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [showQuickGuide, setShowQuickGuide] = useState(false);

  // ✨ FAIL-SAFE TRANSLATION HELPER
  const safeTranslate = (key, fallbackEn, fallbackBn, fallbackHi) => {
    const trans = t(key);
    if (trans !== key && trans) return trans;
    if (language === 'bn') return fallbackBn;
    if (language === 'hi') return fallbackHi;
    return fallbackEn;
  };

  // ✨ Dynamic Institution Label mapping
  const orgType = session?.type || session?.workspaceType || workspaceType || 'Mandir';
  const isPurohitMode = orgType === 'Purohit';

  const institutionLabel = useMemo(() => {
    if (isPurohitMode) return safeTranslate('purohit_desk', 'Purohit Desk', 'পুরোহিত ডেস্ক', 'पुरोहित डेस्क');
    const rawType = String(orgType).toUpperCase();
    switch (rawType) {
      case 'GOSHALA': return safeTranslate('workspace_goshala', 'Goshala');
      case 'SANGHA': return safeTranslate('workspace_sangha', 'Sangha');
      case 'ASHRAM': return safeTranslate('workspace_ashram', 'Ashram');
      case 'GURUKUL': return safeTranslate('workspace_gurukul', 'Gurukul');
      case 'SATSANG': return safeTranslate('workspace_satsang', 'Satsang');
      case 'YOGA': return safeTranslate('workspace_yoga', 'Yoga Center');
      case 'TRUST': return safeTranslate('workspace_trust', 'Trust');
      case 'TIRTH': return safeTranslate('workspace_tirth', 'Tirth / Dham');
      case 'SAMAJ': return safeTranslate('workspace_samaj', 'Samaj');
      case 'MANDIR':
      default: return safeTranslate('workspace_mandir', 'Mandir');
    }
  }, [orgType, language, isPurohitMode]);

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

  // ✨ ENTERPRISE TOAST & MODAL ENGINE
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const curSymbol = session?.currency?.symbol || '৳';

  // ✨ DYNAMIC DATE & PANJIKA FORMATTER
  const currentPanjikaDate = useMemo(() => {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const locale = language === 'bn' ? 'bn-BD' : language === 'hi' ? 'hi-IN' : 'en-US';
    return today.toLocaleDateString(locale, options);
  }, [language]);

  // Greeting Logic based on Time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return safeTranslate('suprabhat', 'Suprabhat', 'সুপ্রভাত', 'सुप्रभात'); 
    if (hour < 17) return safeTranslate('namaskar', 'Namaskar', 'নমস্কার', 'नमस्कार');  
    return safeTranslate('shubha_sandhya', 'Shubha Sandhya', 'শুভ সন্ধ্যা', 'शुभ संध्या');           
  }, [language]);

  useEffect(() => {
    if(quotesList.length > 0) {
      setDailyQuote(quotesList[Math.floor(Math.random() * quotesList.length)]);
    }
  }, [quotesList]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(successMsg ? successMsg + ' (Saved Offline)' : safeTranslate('offline_saved', 'Action cached offline.', 'অফলাইনে সেভ করা হয়েছে।', 'ऑफ़लाइन सहेजा गया।'), 'offline');
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + e.message, 'error');
      throw e;
    }
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
    if (globalStats.devotees > 1) score += 25; 
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

      await executeSafeUpdate(updates, safeTranslate('req_submitted', 'Access request queued offline.'));
      setMyAccessStatus('PENDING');
      pushToDataLayer('request_data_access', { request_type: 'FULL_LEDGER_ACCESS' });
    } catch (e) { showToast("Failed to push request. " + e.message, "error"); }
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

      await executeSafeUpdate(updates, `Access decision (${decision}) processed.`);
      pushToDataLayer('handle_access_request', { target_user: uid, decision: decision });
    } catch (e) { showToast("Failed to process request.", "error"); }
  };

  const filteredLogs = recentLogs.filter(log => {
    let match = true;
    if (auditFilters.actionType !== 'ALL' && !log.actionType.includes(auditFilters.actionType)) match = false;
    if (auditFilters.startDate && log.timestamp < new Date(auditFilters.startDate).getTime()) match = false;
    if (auditFilters.endDate && log.timestamp > new Date(auditFilters.endDate).getTime() + 86400000) match = false;
    return match;
  }); 

  // ✨ INTEGRATED: Enterprise PDF Generator Calls
  const exportBulkAuditPDF = async () => {
    try {
      pushToDataLayer('export_data', { export_type: 'PDF', data_category: 'AUDIT_LOG' });
      await generateBulkAuditPdf(session.communityName, filteredLogs);
      showToast(safeTranslate('success', 'Success') + ": Audit Report Downloaded");
    } catch (e) {
      showToast(safeTranslate('error', 'Error') + ": " + e.message, "error");
    }
  };

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

  const exportSingleAuditVoucher = async (log) => {
    try {
      pushToDataLayer('file_download', { file_extension: 'PDF', file_name: 'Single_Audit_Voucher' });
      await generateSingleAuditVoucherPdf(session.communityName, log);
      showToast(safeTranslate('success', 'Success') + ": Voucher Downloaded");
    } catch (e) {
      showToast(safeTranslate('error', 'Error') + ": " + e.message, "error");
    }
  };

  if (loading) return <div className="flex justify-center items-center h-[60vh] text-sanatani-orange"><Loader2 size={48} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full max-w-[1600px] mx-auto">

      {/* ✨ TOAST PORTAL */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'offline' ? 'bg-orange-500/20 text-sanatani-orange' : toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'offline' ? <WifiOff size={20}/> : toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'offline' ? 'text-orange-400' : toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'offline' ? 'Offline Cache' : toast.type === 'error' ? safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') : safeTranslate('success', 'Success', 'সফল', 'सफल')}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* QUICK GUIDE MODAL */}
      {showQuickGuide && createPortal(
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden fade-in relative ring-1 ring-white/20 p-8 border-t-4 border-sanatani-orange">
            <button onClick={() => setShowQuickGuide(false)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full transition-colors"><XCircle size={20}/></button>
            <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2"><HelpCircle className="text-sanatani-orange"/> {safeTranslate('quick_guide_title', 'Command Center Guide', 'কমান্ড সেন্টার গাইড', 'कमांड सेंटर गाइड')}</h3>
            <div className="space-y-4 text-sm font-bold text-gray-600 leading-relaxed">
              <p><strong>1. Interconnected Metrics:</strong> Tap any Quick Action shortcut or KPI card (like Total Devotees) to instantly jump to its specific management module.</p>
              <p><strong>2. Smart Widgets:</strong> The central dashboard pulls live data from your Panjika, Matrimonial, and Ritual modules to give you a bird's-eye view of your ecosystem.</p>
              <p><strong>3. Privacy Engine:</strong> To protect community funds, general devotees only see their personal contributions until global access is granted by an Admin.</p>
            </div>
          </div>
        </div>, document.body
      )}

      {/* 🚀 THE MASTER PANJIKA & SHLOKA BANNER */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-black rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden ring-1 ring-white/10 flex flex-col lg:flex-row justify-between gap-8 items-center lg:items-stretch">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10 pointer-events-none">
           <Sparkles size={300} className="text-sanatani-orange"/>
        </div>

        {/* Left: Greeting & Current Date */}
        <div className="relative z-10 flex flex-col justify-center flex-1 w-full text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2 mb-4">
            <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border backdrop-blur-md shadow-sm ${isPurohitMode ? 'bg-red-500/20 text-red-300 border-red-500/20' : 'bg-white/10 text-orange-400 border-white/10'}`}>
              {isPurohitMode ? safeTranslate('global_scholar', 'Global Scholar', 'গ্লোবাল স্কলার', 'ग्लोबल स्कॉलर') : `${institutionLabel} Workspace`}
            </span>
            <button onClick={() => {setShowQuickGuide(true); pushToDataLayer('open_quick_guide', { module: 'DashboardHome' });}} className="text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-300 px-4 py-1.5 rounded-full border border-blue-500/20 hover:bg-blue-500/40 transition-colors flex items-center gap-1.5 shadow-sm">
               <HelpCircle size={12}/> {safeTranslate('quick_guide', 'Guide', 'গাইড', 'गाइड')}
            </button>
          </div>
          
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-2">
            {greeting}, {session?.userName?.split(' ')[0]}! 🙏
          </h1>
          <p className="text-sm font-bold text-gray-400 max-w-lg leading-relaxed mx-auto lg:mx-0">
            {safeTranslate('welcome_to', 'Welcome to the', 'স্বাগতম', 'में आपका स्वागत है')} <strong className="text-white">{session?.communityName}</strong> {safeTranslate('command_center_desc', 'command center. Here is what is happening across your network today.', 'কমান্ড সেন্টারে। আজ আপনার নেটওয়ার্কে যা ঘটছে তা এখানে রয়েছে।', 'कमांड सेंटर। आज आपके नेटवर्क में क्या हो रहा है, यह यहां है।')}
          </p>

          <div className="mt-6 flex items-center justify-center lg:justify-start gap-3 text-orange-200">
             <Sun size={24} className="animate-spin-slow text-sanatani-orange" />
             <div className="text-left">
                <p className="text-sm font-black">{currentPanjikaDate}</p>
                <p className="text-[9px] uppercase tracking-widest font-bold text-orange-400">{safeTranslate('today_panjika', 'Today in Panjika', 'আজকের পঞ্জিকা', 'आज का पंचांग')}</p>
             </div>
          </div>
        </div>

        {/* Right: Shloka Widget or Setup Progress */}
        <div className="relative z-10 w-full lg:w-[450px] flex flex-col justify-center shrink-0">
          {setupProgress < 100 && isAdmin ? (
            <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-3xl shadow-xl w-full">
              <div className="flex justify-between items-end mb-3">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{safeTranslate('setup_progress', 'Setup Progress', 'সেটআপের অগ্রগতি', 'सेटअप प्रगति')}</p>
                <p className="text-lg font-black text-sanatani-orange">{setupProgress}%</p>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden shadow-inner">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 h-full rounded-full transition-all duration-1000" style={{ width: `${setupProgress}%` }}></div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 relative group transition-all hover:bg-white/10 shadow-2xl w-full">
               <Quote size={48} className="absolute top-4 left-4 text-white/5 group-hover:text-sanatani-orange/20 transition-colors duration-500" />
               <div className="relative z-10 pl-6 border-l-4 border-sanatani-orange">
                  <p className="text-base sm:text-lg font-black text-orange-400 font-devanagari mb-2 leading-relaxed tracking-wide">{dailyQuote.text}</p>
                  <p className="text-[11px] sm:text-xs font-bold text-gray-300 italic mb-4 leading-relaxed">"{dailyQuote.meaning}"</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5"><BookOpen size={12}/> {dailyQuote.source}</p>
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
              <h3 className="text-lg font-black tracking-tight">{safeTranslate('global_ledger_locked', 'Global Ledger Locked', 'গ্লোবাল লেজার লকড', 'ग्लोबल लेजर लॉक्ड')}</h3>
              <p className="text-xs text-gray-400 font-bold">{safeTranslate('global_ledger_desc', 'You are in Personal Mode. Community figures are hidden for security.', 'আপনি ব্যক্তিগত মোডে আছেন। নিরাপত্তার জন্য সম্প্রদায়ের পরিসংখ্যান লুকানো হয়েছে।', 'आप व्यक्तिगत मोड में हैं। सुरक्षा के लिए सामुदायिक आंकड़े छिपाए गए हैं।')}</p>
            </div>
          </div>
          <button 
            onClick={requestGlobalAccess}
            disabled={myAccessStatus === 'PENDING'}
            className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:transform-none text-white text-xs font-black uppercase tracking-widest px-6 py-3.5 rounded-xl shadow-lg transition-all hover:-translate-y-0.5"
          >
            {myAccessStatus === 'PENDING' ? (safeTranslate('request_pending', 'Request Pending...', 'অনুরোধ অপেক্ষমান...', 'अनुरोध लंबित...')) : (safeTranslate('request_global_access', 'Request Global Access', 'গ্লোবাল অ্যাক্সেস অনুরোধ করুন', 'ग्लोबल एक्सेस का अनुरोध करें'))}
          </button>
        </div>
      )}

      {/* 📊 INTERCONNECTED KPI VITAL SIGNS MATRIX */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div 
          onClick={() => { if(hasGlobalAccess && setActiveTab) setActiveTab('directory'); }}
          className={`bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1.5 group relative overflow-hidden ${hasGlobalAccess ? 'cursor-pointer hover:border-sanatani-orange hover:shadow-xl' : 'cursor-default'}`}
        >
           <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0"><ArrowRight size={16} className="text-orange-400"/></div>
           <div className="absolute bottom-0 right-0 -mr-4 -mb-4 opacity-5 group-hover:opacity-10 transition-opacity"><Users size={120}/></div>
           <div className="h-16 w-16 mb-4 bg-gradient-to-br from-orange-50 to-orange-100 text-sanatani-orange rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-orange-200 relative z-10"><Users size={28} /></div>
           <p className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight relative z-10 mb-1">{globalStats.devotees.toLocaleString()}</p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest relative z-10">Total {safeTranslate(workspaceType === 'Goshala' ? 'gau_sevaks' : 'members', 'Members', 'সদস্য', 'सदस्य')}</p>
        </div>

        <div 
          onClick={() => { if(hasGlobalAccess && setActiveTab) setActiveTab('treasury'); }}
          className={`bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1.5 group relative overflow-hidden ${hasGlobalAccess ? 'cursor-pointer hover:border-green-400 hover:shadow-xl' : 'cursor-default'}`}
        >
           <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0"><ArrowRight size={16} className="text-green-400"/></div>
           <div className="absolute bottom-0 right-0 -mr-4 -mb-4 opacity-5 group-hover:opacity-10 transition-opacity"><Banknote size={120}/></div>
           <div className={`h-16 w-16 mb-4 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border relative z-10 ${hasGlobalAccess ? (treasuryBalance >= 0 ? 'bg-gradient-to-br from-green-50 to-emerald-100 text-green-600 border-green-200' : 'bg-gradient-to-br from-red-50 to-rose-100 text-red-600 border-red-200') : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
              <Banknote size={28} />
           </div>
           <p className={`text-3xl sm:text-4xl font-black tracking-tight relative z-10 mb-1 ${hasGlobalAccess ? (treasuryBalance >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-300 filter blur-md'}`}>
               {curSymbol}{hasGlobalAccess ? Math.abs(treasuryBalance).toLocaleString() : 'XXX,XXX'}
           </p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest relative z-10">Net {safeTranslate('net_treasury', 'Treasury', 'নেট ট্রেজারি', 'नेट ट्रेजरी')}</p>
        </div>

        <div 
          onClick={() => { if(hasGlobalAccess && setActiveTab) setActiveTab('treasury'); }}
          className={`bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1.5 group relative overflow-hidden ${hasGlobalAccess ? 'cursor-pointer hover:border-blue-400 hover:shadow-xl' : 'cursor-default'}`}
        >
           <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0"><ArrowRight size={16} className="text-blue-400"/></div>
           <div className="absolute bottom-0 right-0 -mr-4 -mb-4 opacity-5 group-hover:opacity-10 transition-opacity"><TrendingUp size={120}/></div>
           <div className="h-16 w-16 mb-4 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-blue-200 relative z-10"><TrendingUp size={28} /></div>
           <p className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight truncate w-full relative z-10 mb-1">{curSymbol}{hasGlobalAccess ? globalStats.income.toLocaleString() : personalStats.myDonations.toLocaleString()}</p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest relative z-10">{hasGlobalAccess ? `Lifetime ${safeTranslate('funds', 'Funds', 'তহবিল', 'निधि')}` : safeTranslate('my_lifetime', 'My Lifetime', 'আমার আজীবন', 'मेरा आजीवन')}</p>
        </div>

        <div 
          onClick={() => { if(hasGlobalAccess && setActiveTab) setActiveTab('panjika'); }}
          className={`bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1.5 group relative overflow-hidden ${hasGlobalAccess ? 'cursor-pointer hover:border-purple-400 hover:shadow-xl' : 'cursor-default'}`}
        >
           <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0"><ArrowRight size={16} className="text-purple-400"/></div>
           <div className="absolute bottom-0 right-0 -mr-4 -mb-4 opacity-5 group-hover:opacity-10 transition-opacity"><CalendarDays size={120}/></div>
           <div className="h-16 w-16 mb-4 bg-gradient-to-br from-purple-50 to-fuchsia-100 text-purple-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-purple-200 relative z-10"><CalendarDays size={28} /></div>
           <p className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight relative z-10 mb-1">{globalStats.activeEvents}</p>
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest relative z-10">Active {safeTranslate('active_utsav', 'Utsav / Events', 'সক্রিয় উৎসব', 'सक्रिय उत्सव')}</p>
        </div>
      </div>

      {/* 🚀 COMMAND SHORTCUTS MATRIX */}
      {hasGlobalAccess && !isPurohitMode && (
        <div className="bg-gray-50/80 border border-gray-200 rounded-3xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={14}/> {safeTranslate('command_shortcuts', 'Command Shortcuts', 'কমান্ড শর্টকাট', 'कमांड शॉर्टकट्स')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <button onClick={() => { if(setActiveTab) setActiveTab('directory'); pushToDataLayer('quick_action_click', { action: 'Add Member' }); }} className="bg-white border border-gray-200 hover:border-sanatani-orange hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-orange-50 text-sanatani-orange p-3 rounded-full group-hover:scale-110 transition-transform"><UserPlus size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{safeTranslate('btn_add_member', 'Add Member', 'সদস্য যোগ করুন', 'सदस्य जोड़ें')}</span>
            </button>

            <button onClick={() => { if(setActiveTab) setActiveTab('treasury'); pushToDataLayer('quick_action_click', { action: 'Log Chanda' }); }} className="bg-white border border-gray-200 hover:border-green-500 hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-green-50 text-green-600 p-3 rounded-full group-hover:scale-110 transition-transform"><Wallet size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{safeTranslate('btn_log_chanda', 'Log Chanda', 'তহবিল যোগ করুন', 'योगदान दर्ज करें')}</span>
            </button>

            <button onClick={() => { if(setActiveTab) setActiveTab('panjika'); pushToDataLayer('quick_action_click', { action: 'Schedule Event' }); }} className="bg-white border border-gray-200 hover:border-blue-500 hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-blue-50 text-blue-600 p-3 rounded-full group-hover:scale-110 transition-transform"><CalendarDays size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{safeTranslate('schedule_event', 'New Event', 'নতুন ইভেন্ট', 'नया इवेंट')}</span>
            </button>

            <button onClick={() => { if(setActiveTab) setActiveTab('prachar'); pushToDataLayer('quick_action_click', { action: 'Send Broadcast' }); }} className="bg-white border border-gray-200 hover:border-purple-500 hover:shadow-md p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
              <div className="bg-purple-50 text-purple-600 p-3 rounded-full group-hover:scale-110 transition-transform"><Megaphone size={20}/></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">{safeTranslate('btn_send_alert', 'Send Alert', 'অ্যালার্ট পাঠান', 'अलर्ट भेजें')}</span>
            </button>
          </div>
        </div>
      )}

      {/* ✨ THE SUPER-APP WIDGET ZONE (Cross-Module Integrations) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* 🛕 UNIVERSAL MARKETPLACE / POOJA WIDGET */}
        <div 
          onClick={() => { if(setActiveTab) setActiveTab('pooja'); }} 
          className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden flex flex-col group hover:shadow-lg hover:border-orange-200 transition-all cursor-pointer"
        >
           <div className="flex justify-between items-start mb-4">
             <div className="bg-orange-50 text-orange-600 p-3 rounded-xl border border-orange-100 group-hover:bg-sanatani-orange group-hover:text-white transition-colors"><Flame size={20}/></div>
             <button className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-orange-500 transition-colors flex items-center gap-1">Open Desk <ArrowRight size={10} className="transform group-hover:translate-x-1 transition-transform"/></button>
           </div>
           <h3 className="text-lg font-black text-gray-900 mb-1">{isPurohitMode ? safeTranslate('my_ritual_diary', 'My Ritual Diary', 'আমার রিচুয়াল ডায়েরি', 'मेरी अनुष्ठान डायरी') : isAdmin ? safeTranslate('universal_marketplace', 'Universal Marketplace', 'গ্লোবাল মার্কেটপ্লেস', 'यूनिवर्सल मार्केटप्लेस') : safeTranslate('nav_pooja', 'Pooja Desk', 'পূজা ডেস্ক', 'पूजा डेस्क')?.split('&')[0]}</h3>

           {isAdmin && !isPurohitMode ? (
             <p className="text-xs font-bold text-gray-500 mb-4">Hire Global Scholars & Cover Leave</p>
           ) : (
             <p className="text-xs font-bold text-gray-500 mb-4">{poojaStats.upcomingRituals} Active Reservations</p>
           )}

           <div className="mt-auto bg-gray-50 p-4 rounded-2xl border border-gray-100 group-hover:border-orange-100 group-hover:bg-orange-50/30 transition-colors">
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
        <div 
          onClick={() => { if(setActiveTab) setActiveTab('vivah'); }}
          className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden flex flex-col group hover:shadow-lg hover:border-pink-200 transition-all cursor-pointer"
        >
           <div className="flex justify-between items-start mb-4">
             <div className="bg-pink-50 text-pink-600 p-3 rounded-xl border border-pink-100 group-hover:bg-pink-600 group-hover:text-white transition-colors"><HeartHandshake size={20}/></div>
             <button className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-pink-500 transition-colors flex items-center gap-1">Open Desk <ArrowRight size={10} className="transform group-hover:translate-x-1 transition-transform"/></button>
           </div>
           <h3 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('nav_vivah', 'Vivah Bandhan', 'বিবাহ বন্ধন', 'विवाह बंधन')}</h3>
           {isAdmin ? (
             <p className="text-xs font-bold text-gray-500 mb-4">{vivahStats.totalProfiles} Verified Profiles Active</p>
           ) : (
             <p className="text-xs font-bold text-gray-500 mb-4">{safeTranslate('vivah_subtitle', 'Sanatan Matchmaking', 'সনাতন ম্যাচমেকিং', 'सनातन मैचमेकिंग')?.split('.')[0]}</p>
           )}

           <div className="mt-auto bg-pink-50/50 p-4 rounded-2xl border border-pink-100 flex items-center justify-between group-hover:bg-pink-100/50 transition-colors">
              <div>
                <p className="text-[9px] font-black text-pink-700 uppercase tracking-widest mb-1">Pending Requests</p>
                <p className="text-xl font-black text-pink-600">{vivahStats.pendingRequests}</p>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-pink-200 text-pink-600 shadow-sm transition-colors">
                <ArrowRight size={16}/>
              </div>
           </div>
        </div>

        {/* 📆 PANJIKA EVENT WIDGET */}
        <div 
          onClick={() => { if(setActiveTab) setActiveTab('panjika'); }}
          className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 relative overflow-hidden flex flex-col group hover:shadow-lg hover:border-purple-200 transition-all cursor-pointer"
        >
           <div className="flex justify-between items-start mb-4">
             <div className="bg-purple-50 text-purple-600 p-3 rounded-xl border border-purple-100 group-hover:bg-purple-600 group-hover:text-white transition-colors"><CalendarDays size={20}/></div>
             <button className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-purple-500 transition-colors flex items-center gap-1">Open Desk <ArrowRight size={10} className="transform group-hover:translate-x-1 transition-transform"/></button>
           </div>
           <h3 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('nav_panjika', 'Utsav Panjika', 'উৎসব পঞ্জিকা', 'उत्सव पंचांग')?.split('&')[0]}</h3>
           <p className="text-xs font-bold text-gray-500 mb-4">{globalStats.activeEvents} Upcoming Events</p>

           <div className="mt-auto bg-purple-50/50 p-4 rounded-2xl border border-purple-100 group-hover:bg-purple-100/50 transition-colors">
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
          <h3 className="text-sm font-black text-orange-900 mb-4 flex items-center gap-2"><Unlock size={18}/> {safeTranslate('pending_ledger_access', 'Pending Ledger Access Requests', 'অপেক্ষমান লেজার অ্যাক্সেস অনুরোধ', 'लंबित खाता पहुंच अनुरोध')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accessRequests.map(req => (
              <div key={req.id} className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 flex justify-between items-center">
                <div>
                  <p className="text-sm font-black text-gray-900">{req.userName}</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{req.requestType.replace(/_/g, ' ')}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAccessDecision(req.id, 'APPROVED', req.uid, req.userName)} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-xl transition-colors"><CheckCircle2 size={18}/></button>
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
                <p className="text-xs font-bold text-gray-600 flex items-center gap-1.5"><Users size={14}/> {institutionLabel} Capacity</p>
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
                 <h4 className="text-sm font-black text-white mb-2 relative z-10">{safeTranslate('upgrade_title', 'Ready to Scale?', 'স্কেল করতে প্রস্তুত?', 'स्केल करने के लिए तैयार हैं?')}</h4>
                 <ul className="text-[10px] font-bold text-gray-400 space-y-1.5 mb-4 relative z-10">
                   <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-sanatani-orange"/> {safeTranslate('upgrade_r1', 'Unlimited Member Profiles', 'আনলিমিটেড সদস্য প্রোফাইল', 'असीमित सदस्य प्रोफाइल')}</li>
                   <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-sanatani-orange"/> {safeTranslate('upgrade_r2', 'Infinite Master PDF Reports', 'আনলিমিটেড পিডিএফ রিপোর্ট', 'अनंत मास्टर पीडीएफ रिपोर्ट')}</li>
                   <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-sanatani-orange"/> {safeTranslate('upgrade_r3', 'Verified Organization Badge', 'ভেরিফাইড অর্গানাইজেশন ব্যাজ', 'सत्यापित संगठन बैज')}</li>
                 </ul>
                 <button onClick={() => { if(setActiveTab) setActiveTab('settings'); pushToDataLayer('quick_action_click', { action: 'Upgrade Pro' }); }} className="w-full bg-white hover:bg-gray-100 text-gray-900 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-md hover:shadow-lg relative z-10">
                   {safeTranslate('btn_upgrade_pro', 'Upgrade to Smart Pro', 'স্মার্ট প্রো-তে আপগ্রেড করুন', 'स्मार्ट प्रो में अपग्रेड करें')}
                 </button>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
