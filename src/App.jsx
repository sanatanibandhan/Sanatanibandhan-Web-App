import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, serverTimestamp, get, increment, push } from 'firebase/database';
import { db } from './firebase';

// ✨ TRANSLATION & GTM ENGINE
import { useLanguage } from './context/LanguageContext';
import { pushToDataLayer } from './utils/gtm'; 

// 🚀 Pages & Portals
import LandingPage from './pages/LandingPage';
import PortalLogin from './components/PortalLogin';

// 🗂️ Core & Contextual Dashboard Modules
import DashboardHome from './components/DashboardHome';
import DevoteeGrid from './components/DevoteeGrid';
import GuestManager from './components/GuestManager';
import TreasuryLedger from './components/TreasuryLedger';
import SandeshDesk from './components/SandeshDesk';
import UtsavPanjika from './components/UtsavPanjika'; 
import PanchayatPolls from './components/PanchayatPolls'; 
import MasterSettings from './components/MasterSettings';
import DharmaMarketingAI from './components/DharmaMarketingAI';
import VivahBandhanDesk from './components/VivahBandhanDesk';
import VanshavaliDesk from './components/VanshavaliDesk';
import PitruShradhDesk from './components/PitruShradhDesk';
import PoojaBookingDesk from './components/PoojaBookingDesk';
import SocialFeed from './components/SocialFeed';

// ✨ DYNAMIC PLUGIN REGISTRY
import { resolveWorkspacePlugin } from './config/workspaceRegistry';

// 💬 Enterprise Live Support Widget
import TawkToWidget from './components/TawkToWidget';

// ✨ ICONS
import { 
  LayoutDashboard, Users, Banknote, Megaphone, CalendarDays, 
  LogOut, MailOpen, Settings, Flame, ChevronDown, 
  User, X, Loader2, BarChart2, Languages, Globe2, WifiOff, Bell,
  Camera, MapPin, Phone, Mail, CreditCard, Droplet, Award, QrCode, Download,
  CheckCircle2, ShieldAlert, Edit, ShieldCheck, Lock, Filter, FileText, FileDigit, 
  AlertTriangle, BellRing, Menu, Ticket, Heart, GitBranch, 
  ScrollText, Sparkles, Send, ArrowRightLeft, HeartHandshake, Plus, History, Clock, FileDown,
  FileBadge, GraduationCap
} from 'lucide-react';

const encodeIdentity = (ident) => {
  if (!ident) return '';
  return ident.toString().trim().toLowerCase().replace(/\./g, ',');
};

export default function App() {
  const { language, setLanguage, workspaceType, setWorkspaceType, t } = useLanguage();

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [session, setSession] = useState(() => {
    const savedSession = localStorage.getItem('sanatani_web_session');
    return savedSession ? JSON.parse(savedSession) : null;
  });

  const [appView, setAppView] = useState(() => {
    const savedSession = localStorage.getItem('sanatani_web_session');
    return savedSession ? 'dashboard' : 'landing';
  });

  const [activeTab, setActiveTab] = useState('home');

  // ✨ Real-time UI States
  const [liveCommunityName, setLiveCommunityName] = useState(session?.communityName || 'Workspace');
  const [workspaceLogo, setWorkspaceLogo] = useState(() => {
    return localStorage.getItem(`sb_logo_${session?.communityId}`) || null;
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // =========================================================================
  // ✨ THE VEDIC GIG ECONOMY: DUAL-MODE ENGINE & KYC
  // =========================================================================
  const [isPurohitMode, setIsPurohitMode] = useState(false);
  const [globalPurohitData, setGlobalPurohitData] = useState(null);
  const [purohitApplication, setPurohitApplication] = useState(null);
  const [hasMatrimonialProfile, setHasMatrimonialProfile] = useState(false);

  // KYC Modal States
  const [showKycModal, setShowKycModal] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycForm, setKycForm] = useState({ specialization: '', experience: '', lineage: '', location: '' });

  // 🔄 Session Transformer: Isolates Database writes when in Purohit Mode
  const activeSession = useMemo(() => {
    if (!session) return null;
    return isPurohitMode 
      ? { 
          ...session, 
          communityId: `PUROHIT_${session.uid}`, // Encrypted personal shard
          role: 'ADMIN', 
          type: 'Purohit', 
          workspaceType: 'Purohit', 
          communityName: `${session.userName} (Purohit Desk)` 
        }
      : session;
  }, [session, isPurohitMode]);

  // ✨ DYNAMIC PLUGIN RESOLVER
  const orgType = activeSession?.type || activeSession?.workspaceType || workspaceType || 'Mandir';
  const activePlugin = resolveWorkspacePlugin(orgType);
  const PluginIcon = activePlugin.icon;
  const PluginComponent = activePlugin.component;

  // ✨ SMART VISIBILITY LOGIC (RBAC)
  const isCommunityOrg = useMemo(() => ['Mandir', 'Samaj', 'Sangha', 'Purohit'].includes(orgType), [orgType]);
  const isDhamOrAshram = useMemo(() => ['Ashram', 'Tirth', 'Mandir'].includes(orgType), [orgType]);
  const isStaff = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  // COMPREHENSIVE PERSONAL PROFILE STATES
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileTab, setProfileTab] = useState('PASS'); 
  const [userProfile, setUserProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_my_profile_${session?.uid}`)) || null; } catch { return null; }
  });
  const [userPin, setUserPin] = useState(() => {
    return localStorage.getItem(`sb_pin_${session?.uid}`) || null;
  });
  const [userTransactions, setUserTransactions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_my_trans_${session?.uid}`)) || []; } catch { return []; }
  });

  const [activityFilterType, setActivityFilterType] = useState('ALL');
  const [activityDateRange, setActivityDateRange] = useState({ start: '', end: '' });
  const [editModal, setEditModal] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const editPhotoRef = useRef(null);

  // ENTERPRISE TOAST & CONFIRM MODAL ENGINE
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [showNotifications, setShowNotifications] = useState(false);
  const [auditLogs, setAuditLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_notif_logs_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [accessRequests, setAccessRequests] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_notif_reqs_${session?.communityId}`)) || []; } catch { return []; }
  });

  // ✨ FAIL-SAFE TRANSLATION HELPER
  const safeTranslate = (key, fallbackEn, fallbackBn, fallbackHi) => {
    const trans = t(key);
    if (trans !== key && trans) return trans;
    if (language === 'bn') return fallbackBn;
    if (language === 'hi') return fallbackHi;
    return fallbackEn;
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_API.customStyle = { visibility: { mobile: { position: 'br', xOffset: 15, yOffset: 85 } } };

    if (!isPurohitMode && session) setLiveCommunityName(session.communityName || safeTranslate('workspace', 'Workspace', 'ওয়ার্কস্পেস', 'कार्यक्षेत्र'));

    return () => { 
      window.removeEventListener('online', handleOnline); 
      window.removeEventListener('offline', handleOffline); 
    };
  }, [language]);

  const executeSafeUpdate = async (updates, successMsg = null, offlineMsg = null) => {
    if (!navigator.onLine) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(offlineMsg || safeTranslate('offline_saved', 'Saved offline. Syncing soon.', 'অফলাইনে সেভ করা হয়েছে।', 'ऑफ़लाइन सहेजा गया।'), 'offline');
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

  // GLOBAL LISTENERS & SYNC
  useEffect(() => {
    if (!session) return;

    const communityRef = ref(db, `communities/${session.communityId}`);
    const unsubCommunity = onValue(communityRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (!isPurohitMode) {
          setLiveCommunityName(data.metadata?.name || data.info?.name || data.name || session.communityName || safeTranslate('workspace', 'Workspace', 'ওয়ার্কস্পেস', 'कार्यक्षेत्र'));
          if (data.info?.type) setWorkspaceType(data.info.type);
        }
        if (data.info?.logoUrl) {
           setWorkspaceLogo(data.info.logoUrl);
           localStorage.setItem(`sb_logo_${session.communityId}`, data.info.logoUrl);
        } else {
           setWorkspaceLogo(null);
           localStorage.removeItem(`sb_logo_${session.communityId}`);
        }
      }
    });

    const memberRef = ref(db, `communities/${session.communityId}/members/${session.uid}`);
    const unsubMember = onValue(memberRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setUserProfile(data);
        localStorage.setItem(`sb_my_profile_${session.uid}`, JSON.stringify(data));
      }
    });

    get(ref(db, `communities/${session.communityId}/logins/${session.uid}`)).then(s => {
       if(s.exists()) {
         setUserPin(s.val());
         localStorage.setItem(`sb_pin_${session.uid}`, s.val());
       }
    });

    const transRef = ref(db, `communities/${session.communityId}/logs/Donation`);
    const unsubTrans = onValue(transRef, (snap) => {
      if(snap.exists()) {
         const allTrans = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
         const myTrans = allTrans.filter(t => t.donorId === session.uid || (t.name && t.name.includes(session.userName)));
         myTrans.sort((a,b) => b.timestamp - a.timestamp);
         setUserTransactions(myTrans);
         localStorage.setItem(`sb_my_trans_${session.uid}`, JSON.stringify(myTrans));
      }
    });

    const logsRef = ref(db, `communities/${session.communityId}/audit_logs`);
    const unsubLogs = onValue(logsRef, snap => {
      if(snap.exists()) {
         const data = snap.val();
         const arr = Object.keys(data).map(k => ({ id: k, ...data[k], type: 'LOG' }));
         arr.sort((a,b) => b.timestamp - a.timestamp);
         const topLogs = arr.slice(0, 30);
         setAuditLogs(topLogs); 
         localStorage.setItem(`sb_notif_logs_${session.communityId}`, JSON.stringify(topLogs));
      }
    });

    const reqRef = ref(db, `communities/${session.communityId}/access_requests`);
    const unsubReq = onValue(reqRef, snap => {
      if(snap.exists()) {
         const data = snap.val();
         const arr = Object.keys(data).map(k => ({ id: k, ...data[k], type: 'REQUEST' }));
         arr.sort((a,b) => b.timestamp - a.timestamp);
         setAccessRequests(arr);
         localStorage.setItem(`sb_notif_reqs_${session.communityId}`, JSON.stringify(arr));
      }
    });

    // ✨ GLOBAL PUROHIT & VIVAH PROFILES LISTENER
    const pRef = ref(db, `global_purohits/${session.uid}`);
    const unsubGlobalPurohit = onValue(pRef, snap => {
       if (snap.exists()) setGlobalPurohitData(snap.val());
       else setGlobalPurohitData(null);
    });

    const appRef = ref(db, `admin_queue/purohit_applications/${session.uid}`);
    const unsubApp = onValue(appRef, snap => {
       if (snap.exists()) setPurohitApplication(snap.val());
       else setPurohitApplication(null);
    });

    const vivahRef = ref(db, `communities/${session.communityId}/matrimonial_profiles`);
    const unsubVivah = onValue(vivahRef, snap => {
       if (snap.exists()) {
          const profiles = Object.values(snap.val());
          const myMatch = profiles.find(p => p.linkedUserId === session.uid || p.linkedMemberId === session.uid);
          setHasMatrimonialProfile(!!myMatch);
       } else {
          setHasMatrimonialProfile(false);
       }
    });

    return () => { unsubCommunity(); unsubMember(); unsubTrans(); unsubLogs(); unsubReq(); unsubGlobalPurohit(); unsubApp(); unsubVivah(); };
  }, [session, setWorkspaceType, t, isPurohitMode, language]);

  useEffect(() => {
    if (isPurohitMode) setLiveCommunityName(`${session?.userName}'s Purohit Desk`);
    else if (session) setLiveCommunityName(session.communityName || safeTranslate('workspace', 'Workspace', 'ওয়ার্কস্পেস', 'कार्यक्षेत्र'));
  }, [isPurohitMode, session, language]);

  const combinedNotifications = useMemo(() => {
     const pendingReqs = accessRequests.filter(r => r.status === 'PENDING');
     return [...pendingReqs, ...auditLogs].sort((a,b) => b.timestamp - a.timestamp);
  }, [auditLogs, accessRequests]);

  const pendingCount = accessRequests.filter(r => r.status === 'PENDING').length;

  const handleNotifClick = (notif) => {
    pushToDataLayer('click_notification', { notif_type: notif.type, community_id: activeSession.communityId });
    if (notif.type === 'EVENT') setActiveTab('panjika');
    else if (notif.type === 'POLL') setActiveTab('polls');
    else if (notif.type === 'BILLING' && activeSession.role === 'ADMIN') setActiveTab('settings');
    else if (notif.type === 'REQUEST' && isStaff) setActiveTab('directory');
    setShowNotifications(false);
  };

  const filteredPersonalTransactions = useMemo(() => {
    return userTransactions.filter(tr => {
      if (activityFilterType === 'INCOME' && tr.amount <= 0) return false;
      if (activityFilterType === 'EXPENSE' && tr.amount > 0) return false;
      if (activityDateRange.start && tr.timestamp < new Date(activityDateRange.start).getTime()) return false;
      if (activityDateRange.end && tr.timestamp > new Date(activityDateRange.end).setHours(23, 59, 59, 999)) return false;
      return true;
    });
  }, [userTransactions, activityFilterType, activityDateRange]);

  const handleExportPersonalPDF = () => {
    pushToDataLayer('export_personal_pdf', { community_id: activeSession.communityId });
    import('./utils/pdfGenerator').then(({ generateUserActivitiesPDF }) => {
        generateUserActivitiesPDF(activeSession.communityName, userProfile, filteredPersonalTransactions, activityFilterType, activityDateRange);
    });
  };

  const handleExportPersonalCSV = () => {
    pushToDataLayer('export_personal_csv', { community_id: activeSession.communityId });
    import('./utils/csvGenerator').then(({ generateGroupCSV }) => {
        const dummyGroup = { name: userProfile.name, history: filteredPersonalTransactions };
        generateGroupCSV(dummyGroup, 'INCOME', activeSession.communityName);
    });
  };

  const handleApproveRequest = async (req) => {
    try {
      if(req.requestType.startsWith('DELETE_PROFILE')) {
        const targetId = req.targetId;
        const targetSnap = await get(ref(db, `communities/${activeSession.communityId}/members/${targetId}`));
        const updates = {};
        if(targetSnap.exists()) {
           const tData = targetSnap.val();
           if(tData.phone) updates[`identity_map/${encodeIdentity(tData.phone)}`] = null;
           if(tData.email) updates[`identity_map/${encodeIdentity(tData.email)}`] = null;
        }
        updates[`communities/${activeSession.communityId}/members/${targetId}`] = null;
        updates[`communities/${activeSession.communityId}/logins/${targetId}`] = null;
        updates[`communities/${activeSession.communityId}/access_requests/${req.id}/status`] = 'APPROVED';
        updates[`communities/${activeSession.communityId}/info/devoteeCount`] = increment(-1);
        await executeSafeUpdate(updates, safeTranslate('req_approved_deleted', 'Request Approved and Profile Safely Erased.', 'অনুরোধ অনুমোদিত এবং প্রোফাইল মুছে ফেলা হয়েছে।', 'अनुरोध स्वीकृत और प्रोफ़ाइल हटा दी गई।'));
      }
    } catch(e) { showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + e.message, "error"); }
  };

  const handleRejectRequest = async (req) => {
    try {
      await executeSafeUpdate({ [`communities/${activeSession.communityId}/access_requests/${req.id}/status`]: 'REJECTED' }, safeTranslate('req_rejected', 'Request Rejected.', 'অনুরোধ প্রত্যাখ্যাত হয়েছে।', 'अनुरोध अस्वीकृत।'));
    } catch(e) { showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + e.message, "error"); }
  };

  const handleViewOrGeneratePin = async () => {
    try {
      if (userPin) {
        import('./utils/pdfGenerator').then(({ generateLoginCredentialsPdf }) => {
           generateLoginCredentialsPdf(activeSession.communityName, userProfile.name, userProfile.id, userPin, activeSession.userName);
        });
        pushToDataLayer('export_qr_pdf', { community_id: activeSession.communityId });
      } else {
        setConfirmDialog({
          title: safeTranslate('reset_pin', 'Generate Secure PIN', 'নিরাপদ পিন তৈরি করুন', 'सुरक्षित पिन बनाएँ'),
          message: safeTranslate('no_pin_found', '⚠️ No PIN found. Generate a new secure 4-digit PIN for instant access?', '⚠️ কোনো পিন পাওয়া যায়নি। নতুন পিন তৈরি করবেন?', '⚠️ कोई पिन नहीं मिला। क्या नया पिन जनरेट करें?'),
          confirmText: safeTranslate('generate_pin', 'GENERATE PIN', 'পিন তৈরি করুন', 'पिन जनरेट करें'),
          isDanger: false,
          onConfirm: async () => {
            setConfirmDialog(null);
            const newPin = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
            await executeSafeUpdate({ [`communities/${activeSession.communityId}/logins/${userProfile.id}`]: newPin }, safeTranslate('pin_generated', "PIN Generated Successfully", "পিন সফলভাবে তৈরি হয়েছে", "पिन सफलतापूर्वक जनरेट किया गया"));
            setUserPin(newPin);
            localStorage.setItem(`sb_pin_${userProfile.id}`, newPin);
            import('./utils/pdfGenerator').then(({ generateLoginCredentialsPdf }) => {
               generateLoginCredentialsPdf(activeSession.communityName, userProfile.name, userProfile.id, newPin, activeSession.userName);
            });
          }
        });
      }
    } catch (e) { showToast("Security Error: " + e.message, "error"); }
  };

  const submitEditField = async () => {
    if (!editModal || !editModal.value.trim()) return;
    const { field, displayName, value } = editModal;
    const trimmedVal = value.trim();
    if (trimmedVal === (userProfile[field] || '')) { setEditModal(null); return; }

    try {
      const updates = {};
      updates[`communities/${activeSession.communityId}/members/${userProfile.id}/${field}`] = trimmedVal;
      if (field === 'name') updates[`users/${activeSession.uid}/name`] = trimmedVal;

      await executeSafeUpdate(updates, safeTranslate('record_updated', 'Record updated successfully.', 'সফলভাবে আপডেট করা হয়েছে।', 'सफलतापूर्वक अपडेट किया गया।'));
      pushToDataLayer('edit_profile', { field_edited: field, community_id: activeSession.communityId });
      setEditModal(null);
    } catch (e) { showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + e.message, "error"); }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !userProfile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = document.createElement('img');
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400; 
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }

        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8); 
        try {
           await executeSafeUpdate({ [`communities/${activeSession.communityId}/members/${userProfile.id}/photoUrl`]: compressedBase64 }, safeTranslate('record_updated', "Profile photo updated successfully.", "ছবি আপডেট হয়েছে।", "फोटो अपडेट हो गई।"));
           pushToDataLayer('edit_profile', { field_edited: 'photoUrl', community_id: activeSession.communityId });
        } catch(err) { showToast("Photo upload failed: " + err.message, "error"); }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  };

  // ✨ NEW KYC SUBMISSION LOGIC
  const handleApplyPurohit = () => {
    setShowKycModal(true);
    pushToDataLayer('open_kyc_modal', { community_id: session.communityId });
  };

  const submitKycApplication = async (e) => {
    e.preventDefault();
    setKycSubmitting(true);
    try {
      const payload = {
        uid: session.uid,
        name: userProfile?.name || session.userName,
        phone: userProfile?.phone || '',
        communityId: session.communityId,
        status: 'PENDING',
        appliedAt: serverTimestamp(),
        specialization: kycForm.specialization,
        experienceYears: kycForm.experience,
        lineage: kycForm.lineage,
        location: kycForm.location
      };
      await executeSafeUpdate({ [`admin_queue/purohit_applications/${session.uid}`]: payload }, safeTranslate('application_submitted', 'Application submitted for verification!', 'আবেদন জমা দেওয়া হয়েছে!', 'आवेदन जमा कर दिया गया है!'));
      pushToDataLayer('submit_kyc_application', { community_id: session.communityId });
      setShowKycModal(false);
      setKycForm({ specialization: '', experience: '', lineage: '', location: '' });
    } catch(err) {
      showToast(err.message, 'error');
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleLoginSuccess = (data) => {
    localStorage.setItem('sanatani_web_session', JSON.stringify(data));
    setSession(data);
    setAppView('dashboard');
  };

  const handleSecureLogout = () => {
    setConfirmDialog({
      title: safeTranslate('secure_logout', 'Secure Logout', 'নিরাপদ লগআউট', 'सुरक्षित लॉगआउट'),
      message: safeTranslate('confirm_logout', 'Are you sure you want to securely log out of your workspace?', 'আপনি কি লগআউট করতে নিশ্চিত?', 'क्या आप सुनिश्चित हैं कि आप लॉगआउट करना चाहते हैं?'),
      confirmText: safeTranslate('secure_logout', 'LOGOUT', 'লগআউট', 'लॉगआउट'),
      isDanger: true,
      onConfirm: () => {
        setConfirmDialog(null);
        localStorage.removeItem('sanatani_web_session');
        setSession(null);
        setIsPurohitMode(false);
        setAppView('landing');
      }
    });
  };

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : 'ॐ';

  const calculateSevaScore = (donated, transactionCount, attendanceCount = 0) => {
    const base = 50; 
    const volumePoints = Math.floor((donated || 0) / 1000) * 5; 
    const habitPoints = (transactionCount || 0) * 10;
    const attendancePoints = (attendanceCount || 0) * 20;
    return base + volumePoints + habitPoints + attendancePoints;
  };

  const getHaloDesign = (score) => {
    if(score >= 1500) return { color: 'from-yellow-400 via-amber-500 to-purple-600', name: 'Ratna (Pillar)' };
    if(score >= 500) return { color: 'from-slate-300 to-blue-500', name: 'Vishesh (Core)' };
    if(score >= 100) return { color: 'from-orange-400 to-red-500', name: 'Kormi (Active)' };
    return { color: 'from-gray-200 to-gray-300', name: 'Sadharan (Member)' };
  };

  if (appView === 'landing') {
    return (
      <>
        <LandingPage onLoginClick={() => setAppView('login')} />
        <TawkToWidget session={activeSession} />
      </>
    );
  }

  if (appView === 'login' || (!activeSession && appView === 'dashboard')) {
    return (
      <>
        <PortalLogin onLoginSuccess={handleLoginSuccess} onBackClick={() => setAppView('landing')} />
        <TawkToWidget session={activeSession} />
      </>
    );
  }

  // ✨ CENTRAL ROUTER
  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <DashboardHome session={activeSession} setActiveTab={setActiveTab} isOnline={isOnline} />;
      case 'plugin': return <PluginComponent session={activeSession} isOnline={isOnline} />; 
      case 'directory': return <DevoteeGrid session={activeSession} isOnline={isOnline} />; 
      case 'guests': return <GuestManager session={activeSession} isOnline={isOnline} />;
      case 'vivah': return <VivahBandhanDesk session={activeSession} isOnline={isOnline} />; 
      case 'vanshavali': return <VanshavaliDesk session={activeSession} isOnline={isOnline} />; 
      case 'shradh': return <PitruShradhDesk session={activeSession} isOnline={isOnline} />; 
      case 'pooja': return <PoojaBookingDesk session={activeSession} isOnline={isOnline} />; 
      case 'treasury': return <TreasuryLedger session={activeSession} isOnline={isOnline} />;
      case 'prachar': return <SandeshDesk session={activeSession} isOnline={isOnline} />;
      case 'panjika': return <UtsavPanjika session={activeSession} isOnline={isOnline} />;
      case 'polls': return <PanchayatPolls session={activeSession} isOnline={isOnline} />; 
      case 'marketing': return <DharmaMarketingAI isOnline={isOnline} />;
      case 'settings': return <MasterSettings session={activeSession} isOnline={isOnline} />;
      case 'feed': return <SocialFeed session={activeSession} isOnline={isOnline} />;
      default: return <DashboardHome session={activeSession} setActiveTab={setActiveTab} isOnline={isOnline} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden w-full selection:bg-orange-100 selection:text-orange-900">

      {/* ✨ GLOBAL CUSTOM TOAST ENGINE */}
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

      {/* ✨ GLOBAL CONFIRMATION MODAL ENGINE */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmDialog.isDanger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
              {confirmDialog.isDanger ? <AlertTriangle size={32}/> : <BellRing size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors">{safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें')}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🖥️ DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-gray-200 shadow-sm h-full z-20 shrink-0">
        <div className="p-8 border-b border-gray-100 text-center bg-gray-50/50">
          <img src={workspaceLogo || "/icon-512x512.png"} alt={safeTranslate('app_name', 'Sanatani Bandhan', 'সনাতনী বন্ধন', 'सनातनी बंधन')} className="w-16 h-16 mx-auto object-cover bg-white border border-gray-100 rounded-2xl shadow-sm mb-4" />
          <h1 className="text-xl font-black text-gray-900 leading-tight break-words tracking-tight">{liveCommunityName}</h1>
          <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-2">
            {isPurohitMode ? safeTranslate('global_scholar', 'Global Scholar', 'গ্লোবাল স্কলার', 'ग्लोबल स्कॉलर') : `${safeTranslate(orgType.toLowerCase(), orgType, orgType, orgType)} ${safeTranslate('workspace', 'Workspace', 'ওয়ার্কস্পেস', 'कार्यक्षेत्र')}`}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-hide">
          <div className="mb-4">
             <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2">{safeTranslate('nav_group_core', 'Core Workspace', 'মূল ওয়ার্কস্পেস', 'कोर कार्यक्षेत्र')}</h4>
             <NavItem active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<LayoutDashboard size={18} />} label={safeTranslate('nav_home', 'Dashboard', 'ড্যাশবোর্ড', 'डैशबोर्ड')} />
             <NavItem active={activeTab === 'plugin'} onClick={() => setActiveTab('plugin')} icon={<PluginIcon size={18} />} label={isPurohitMode ? safeTranslate('my_ritual_diary', 'My Ritual Diary', 'আমার রিচুয়াল ডায়েরি', 'मेरी अनुष्ठान डायरी') : safeTranslate('nav_pooja', activePlugin.navTitle, 'পূজা ও সেবা ডেস্ক', 'पूजा और सेवा डेस्क')} isSpecial={true} activePlugin={activePlugin} />
          </div>

          <div className="mb-4">
             <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2">{safeTranslate('nav_group_community', 'Community & CRM', 'কমিউনিটি এবং সিআরএম', 'समुदाय और सीआरएम')}</h4>
             <NavItem active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} icon={<Sparkles size={18} />} label={safeTranslate('community_feed', 'Darshan & Feed', 'দর্শন ও ফিড', 'दर्शन और फीड')} />
             <NavItem active={activeTab === 'directory'} onClick={() => setActiveTab('directory')} icon={<Users size={18} />} label={safeTranslate('nav_directory', 'Directory', 'ডিরেক্টরি', 'निर्देशिका')} />
             {!isPurohitMode && isStaff && <NavItem active={activeTab === 'guests'} onClick={() => setActiveTab('guests')} icon={<MailOpen size={18} />} label={safeTranslate('nav_guests', 'Guest CRM', 'অতিথি সিআরএম', 'अतिथि सीआरएम')} />}
             {isCommunityOrg && <NavItem active={activeTab === 'vivah'} onClick={() => setActiveTab('vivah')} icon={<Heart size={18} />} label={safeTranslate('nav_vivah', 'Vivah Matrimonial', 'বিবাহ ম্যাট্রিমোনিয়াল', 'विवाह मैट्रिमोनियल')} />}
             {isCommunityOrg && <NavItem active={activeTab === 'vanshavali'} onClick={() => setActiveTab('vanshavali')} icon={<GitBranch size={18} />} label={safeTranslate('nav_vanshavali', 'Lineage Registry', 'বংশাবলী রেজিস্ট্রি', 'वंशावली निर्देशिका')} />}
             {isDhamOrAshram && <NavItem active={activeTab === 'shradh'} onClick={() => setActiveTab('shradh')} icon={<ScrollText size={18} />} label={safeTranslate('nav_shradh', 'Pitru Shradh', 'পিতৃ শ্রাদ্ধ', 'पितृ श्राद्ध')} />}
          </div>

          <div className="mb-4">
             <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2">{safeTranslate('nav_group_finance', 'Finance & Events', 'অর্থ ও ইভেন্ট', 'वित्त और कार्यक्रम')}</h4>
             <NavItem active={activeTab === 'treasury'} onClick={() => setActiveTab('treasury')} icon={<Banknote size={18} />} label={safeTranslate('nav_treasury', 'Treasury Ledger', 'ট্রেজারি লেজার', 'ट्रेजरी लेजर')} />
             {!isPurohitMode && <NavItem active={activeTab === 'panjika'} onClick={() => setActiveTab('panjika')} icon={<CalendarDays size={18} />} label={safeTranslate('nav_panjika', 'Panjika Events', 'পঞ্জিকা ইভেন্ট', 'पंचांग घटनाएँ').split('&')[0]} />}
          </div>

          <div className="mb-4">
             <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2">{safeTranslate('nav_group_settings', 'Outreach & Settings', 'আউটরিচ এবং সেটিংস', 'आउटरीच और सेटिंग्स')}</h4>
             {!isPurohitMode && <NavItem active={activeTab === 'prachar'} onClick={() => setActiveTab('prachar')} icon={<Megaphone size={18} />} label={safeTranslate('nav_prachar', 'Broadcast', 'সম্প্রচার', 'प्रसारण')} />}
             {!isPurohitMode && <NavItem active={activeTab === 'polls'} onClick={() => setActiveTab('polls')} icon={<BarChart2 size={18} />} label={safeTranslate('nav_polls', 'Community Voting', 'কমিউনিটি ভোটিং', 'सामुदायिक मतदान')} />}
             {!isPurohitMode && isStaff && <NavItem active={activeTab === 'marketing'} onClick={() => setActiveTab('marketing')} icon={<Flame size={18} />} label={safeTranslate('nav_marketing', 'Social Assistant', 'সোশ্যাল অ্যাসিস্ট্যান্ট', 'सोशल असिस्टेंट')} />}
             <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={18} />} label={safeTranslate('nav_settings', 'Settings', 'সেটিংস', 'सेटिंग्स')} />
          </div>
        </nav>
      </aside>

      {/* ✨ MOBILE HAMBURGER MENU DRAWER */}
      {mobileMenuOpen && createPortal(
        <div className="fixed inset-0 z-[11000] flex md:hidden">
          <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="relative w-[80vw] max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 z-10">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
               <div className="flex items-center gap-3">
                  <img src={workspaceLogo || "/icon-512x512.png"} alt="Logo" className="w-8 h-8 object-cover rounded-lg shadow-sm bg-white border border-gray-200" />
                  <span className="font-black text-gray-900 text-lg tracking-tight">{safeTranslate('menu', 'Menu', 'মেনু', 'मेनू')}</span>
               </div>
               <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-white hover:bg-gray-100 rounded-full text-gray-500 border border-gray-200 shadow-sm transition-colors"><X size={18}/></button>
             </div>

             <div className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-hide">
               <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2 mt-2">{safeTranslate('nav_group_core', 'Core Workspace', 'মূল ওয়ার্কস্পেস', 'कोर कार्यक्षेत्र')}</h4>
               <NavItem active={activeTab === 'home'} onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }} icon={<LayoutDashboard size={18} />} label={safeTranslate('nav_home', 'Dashboard', 'ড্যাশবোর্ড', 'डैशबोर्ड')} />
               <NavItem active={activeTab === 'plugin'} onClick={() => { setActiveTab('plugin'); setMobileMenuOpen(false); }} icon={<PluginIcon size={18} />} label={isPurohitMode ? safeTranslate('my_ritual_diary', 'My Ritual Diary', 'আমার রিচুয়াল ডায়েরি', 'मेरी अनुष्ठान डायरी') : safeTranslate('nav_pooja', activePlugin.navTitle, 'পূজা ও সেবা ডেস্ক', 'पूजा और सेवा डेस्क')} isSpecial={true} activePlugin={activePlugin} />

               <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2 mt-4">{safeTranslate('nav_group_community', 'Community & CRM', 'কমিউনিটি এবং সিআরএম', 'समुदाय और सीआरएम')}</h4>
               <NavItem active={activeTab === 'feed'} onClick={() => { setActiveTab('feed'); setMobileMenuOpen(false); }} icon={<Sparkles size={18} />} label={safeTranslate('community_feed', 'Darshan & Feed', 'দর্শন ও ফিড', 'दर्शन और फीड')} />
               <NavItem active={activeTab === 'directory'} onClick={() => { setActiveTab('directory'); setMobileMenuOpen(false); }} icon={<Users size={18} />} label={safeTranslate('nav_directory', 'Directory', 'ডিরেক্টরি', 'निर्देशिका')} />
               {!isPurohitMode && isStaff && <NavItem active={activeTab === 'guests'} onClick={() => { setActiveTab('guests'); setMobileMenuOpen(false); }} icon={<MailOpen size={18} />} label={safeTranslate('nav_guests', 'Guest CRM', 'অতিথি সিআরএম', 'अतिथि सीआरएम')} />}
               {isCommunityOrg && <NavItem active={activeTab === 'vivah'} onClick={() => { setActiveTab('vivah'); setMobileMenuOpen(false); }} icon={<Heart size={18} />} label={safeTranslate('nav_vivah', 'Vivah Matrimonial', 'বিবাহ ম্যাট্রিমোনিয়াল', 'विवाह मैट्रिमोनियल')} />}
               {isCommunityOrg && <NavItem active={activeTab === 'vanshavali'} onClick={() => { setActiveTab('vanshavali'); setMobileMenuOpen(false); }} icon={<GitBranch size={18} />} label={safeTranslate('nav_vanshavali', 'Lineage Registry', 'বংশাবলী রেজিস্ট্রি', 'वंशावली निर्देशिका')} />}
               {isDhamOrAshram && <NavItem active={activeTab === 'shradh'} onClick={() => { setActiveTab('shradh'); setMobileMenuOpen(false); }} icon={<ScrollText size={18} />} label={safeTranslate('nav_shradh', 'Pitru Shradh', 'পিতৃ শ্রাদ্ধ', 'पितृ श्राद्ध')} />}

               <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2 mt-4">{safeTranslate('nav_group_finance', 'Finance & Events', 'অর্থ ও ইভেন্ট', 'वित्त और कार्यक्रम')}</h4>
               <NavItem active={activeTab === 'treasury'} onClick={() => { setActiveTab('treasury'); setMobileMenuOpen(false); }} icon={<Banknote size={18} />} label={safeTranslate('nav_treasury', 'Treasury Ledger', 'ট্রেজারি লেজার', 'ट्रेजरी लेजर')} />
               {!isPurohitMode && <NavItem active={activeTab === 'panjika'} onClick={() => { setActiveTab('panjika'); setMobileMenuOpen(false); }} icon={<CalendarDays size={18} />} label={safeTranslate('nav_panjika', 'Panjika Events', 'পঞ্জিকা ইভেন্ট', 'पंचांग घटनाएँ').split('&')[0]} />}

               <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2 mt-4">{safeTranslate('nav_group_settings', 'Outreach & Settings', 'আউটরিচ এবং সেটিংস', 'आउटरीच और सेटिंग्स')}</h4>
               {!isPurohitMode && <NavItem active={activeTab === 'prachar'} onClick={() => { setActiveTab('prachar'); setMobileMenuOpen(false); }} icon={<Megaphone size={18} />} label={safeTranslate('nav_prachar', 'Broadcast', 'সম্প্রচার', 'प्रसारण')} />}
               {!isPurohitMode && <NavItem active={activeTab === 'polls'} onClick={() => { setActiveTab('polls'); setMobileMenuOpen(false); }} icon={<BarChart2 size={18} />} label={safeTranslate('nav_polls', 'Community Voting', 'কমিউনিটি ভোটিং', 'सामुदायिक मतदान')} />}
               {!isPurohitMode && isStaff && <NavItem active={activeTab === 'marketing'} onClick={() => { setActiveTab('marketing'); setMobileMenuOpen(false); }} icon={<Flame size={18} />} label={safeTranslate('nav_marketing', 'Social Assistant', 'সোশ্যাল অ্যাসিস্ট্যান্ট', 'सोशल असिस्टेंट')} />}
               <div className="my-2 border-t border-gray-100"></div>
               <NavItem active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }} icon={<Settings size={18} />} label={safeTranslate('nav_settings', 'Settings', 'সেটিংস', 'सेटिंग्स')} />
             </div>

             <div className="p-6 border-t border-gray-100 bg-gray-50/50 shrink-0">
               <button onClick={() => { setMobileMenuOpen(false); handleSecureLogout(); }} className="w-full flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-sm transition-colors hover:bg-red-50">
                  <LogOut size={16}/> {safeTranslate('secure_logout', 'Secure Logout', 'নিরাপদ লগআউট', 'सुरक्षित लॉगआउट')}
               </button>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* 📱 MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full">

        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 md:px-8 py-3 flex items-center justify-between z-30 shadow-sm shrink-0">

          <div className="md:hidden flex items-center gap-2 sm:gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors shrink-0">
              <Menu size={22} />
            </button>
            <img src={workspaceLogo || "/icon-512x512.png"} alt="Logo" className="w-8 h-8 object-cover bg-white border border-gray-100 rounded-lg shadow-sm shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-black text-gray-900 truncate max-w-[130px] sm:max-w-[150px]">{liveCommunityName}</h1>
            </div>
          </div>

          <div className="hidden md:block flex-1"></div>

          <div className="flex items-center gap-2 sm:gap-3">

            <div className="relative z-50">
              <button onClick={() => setShowNotifications(!showNotifications)} className="relative flex items-center justify-center bg-gray-50 hover:bg-gray-100 border border-gray-200 w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2.5 rounded-full sm:rounded-xl transition-all shadow-sm">
                 <Bell size={18} className="text-gray-600" />
                 {pendingCount > 0 && <span className="absolute top-0 right-0 sm:top-[-4px] sm:right-[-4px] w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 border-2 border-white rounded-full"></span>}
                 <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest hidden sm:block ml-2">{safeTranslate('updates', 'Updates', 'আপডেট', 'अपडेट')}</span>
              </button>

              {showNotifications && (
                 <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                    <div className="fixed left-4 right-4 sm:absolute sm:left-auto sm:right-0 top-[70px] sm:top-full mt-2 sm:w-80 max-h-[80vh] overflow-y-auto bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100 fade-in z-50 ring-1 ring-black/5 origin-top-right">
                       <div className="p-4 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10 flex justify-between items-center">
                          <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">{safeTranslate('activity_center', 'Activity Center', 'অ্যাক্টিভিটি সেন্টার', 'गतिविधि केंद्र')}</h3>
                          {pendingCount > 0 && <span className="bg-sanatani-orange text-white text-[9px] px-2 py-0.5 rounded-full">{pendingCount} {safeTranslate('pending', 'Pending', 'পেন্ডিং', 'लंबित')}</span>}
                       </div>
                       <div className="p-2 space-y-1">
                          {combinedNotifications.length === 0 && <p className="text-center text-xs font-bold text-gray-400 py-6">{safeTranslate('no_activities', 'No activities found.', 'কোন কার্যকলাপ পাওয়া যায়নি.', 'कोई गतिविधि नहीं मिली.')}</p>}
                          {combinedNotifications.map(notif => (
                             <div key={notif.id} onClick={() => handleNotifClick(notif)} className={`p-3 rounded-2xl transition-colors border border-transparent ${notif.type === 'LOG' ? 'bg-white cursor-default' : 'hover:bg-gray-50 hover:border-gray-100 cursor-pointer'}`}>
                                {notif.type === 'REQUEST' ? (
                                   <div>
                                      <p className="text-xs font-bold text-gray-800"><span className="text-sanatani-orange font-black">{notif.userName}</span> {safeTranslate('req_approval', 'requested approval.', 'অনুমোদনের অনুরোধ করেছেন।', 'ने स्वीकृति का अनुरोध किया।')}</p>
                                      <p className="text-[10px] font-black text-red-600 mt-1 whitespace-normal break-words">{notif.requestType}</p>
                                      {activeSession.role === 'ADMIN' && notif.status === 'PENDING' && (
                                        <div className="flex gap-2 mt-2">
                                           <button onClick={(e) => { e.stopPropagation(); handleApproveRequest(notif); }} className="flex-1 bg-green-500 hover:bg-green-600 text-white text-[10px] font-black py-2 rounded-lg shadow-sm">{safeTranslate('btn_approve', 'Approve', 'অনুমোদন', 'स्वीकृत करें')}</button>
                                           <button onClick={(e) => { e.stopPropagation(); handleRejectRequest(notif); }} className="flex-1 bg-white hover:bg-red-50 text-red-600 text-[10px] font-black py-2 rounded-lg border border-red-200">{safeTranslate('btn_reject', 'Reject', 'প্রত্যাখ্যান', 'अस्वीकार करें')}</button>
                                        </div>
                                      )}
                                      {notif.status !== 'PENDING' && <p className="text-[9px] text-gray-400 mt-1 font-bold uppercase">{notif.status}</p>}
                                   </div>
                                ) : (
                                   <div>
                                      <p className="text-[10px] text-gray-500 font-bold">{notif.managerName} {safeTranslate('performed_action', 'performed action', 'কাজটি করেছেন', 'ने कार्य किया')}</p>
                                      <p className="text-xs font-black text-gray-900 mt-0.5 whitespace-normal break-words">{notif.description}</p>
                                      <p className="text-[8px] text-gray-400 mt-1 uppercase tracking-widest">{new Date(notif.timestamp).toLocaleString()}</p>
                                   </div>
                                )}
                             </div>
                          ))}
                       </div>
                    </div>
                 </>
              )}
            </div>

            {/* MULTI-LANGUAGE SWITCHER */}
            <div className="relative group z-50">
              <button className="flex items-center justify-center sm:justify-start gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2.5 rounded-full sm:rounded-xl transition-all shadow-sm">
                <Languages size={18} className="text-gray-500" />
                <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest hidden sm:block">
                  {language === 'en' ? 'EN' : language === 'bn' ? 'বাং' : 'हि'}
                </span>
              </button>

              <div className="absolute right-0 mt-2 w-40 bg-white rounded-3xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 overflow-hidden ring-1 ring-black/5 origin-top-right">
                <div className="p-3 bg-gray-50/80 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center flex items-center justify-center gap-1.5"><Globe2 size={12}/> Language</div>
                <button onClick={() => setLanguage('en')} className={`w-full text-left px-5 py-3.5 text-xs font-black tracking-widest transition-colors ${language === 'en' ? 'text-sanatani-orange bg-orange-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>English</button>
                <button onClick={() => setLanguage('bn')} className={`w-full text-left px-5 py-3.5 text-xs font-black tracking-widest transition-colors ${language === 'bn' ? 'text-sanatani-orange bg-orange-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>বাংলা</button>
                <button onClick={() => setLanguage('hi')} className={`w-full text-left px-5 py-3.5 text-xs font-black tracking-widest transition-colors ${language === 'hi' ? 'text-sanatani-orange bg-orange-50/50' : 'text-gray-600 hover:bg-gray-50'}`}>हिन्दी</button>
              </div>
            </div>

            {/* ENTERPRISE PROFILE DROPDOWN */}
            <div className="relative z-50">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 sm:gap-3 bg-white hover:bg-gray-50 p-1 sm:pr-3 rounded-full transition-all border border-gray-200 shadow-sm"
              >
                <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center border shadow-inner overflow-hidden ${isPurohitMode ? 'bg-gradient-to-br from-red-50 to-red-100 text-red-600 border-red-200' : 'bg-gradient-to-br from-orange-50 to-orange-100 text-sanatani-orange border-orange-200'}`}>
                   {userProfile?.photoUrl ? (
                      <img src={userProfile.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                   ) : (
                      <span className="text-lg font-black">{getInitial(userProfile?.name || activeSession.userName)}</span>
                   )}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-black text-gray-900 leading-tight">{activeSession.userName}</p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${isPurohitMode ? 'text-red-500' : 'text-sanatani-orange'}`}>
                    {isPurohitMode ? safeTranslate('global_scholar', 'Global Scholar', 'গ্লোবাল স্কলার', 'ग्लोबल स्कॉलर') : activeSession.role}
                  </p>
                </div>
                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 hidden sm:block ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)}></div>
                  <div className="absolute right-0 mt-3 w-64 max-w-[90vw] bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100 z-50 fade-in overflow-hidden ring-1 ring-black/5 origin-top-right">

                    <div className="p-5 border-b border-gray-100 bg-gray-50/80">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{safeTranslate('signed_in_as', 'Signed in as', 'লগ ইন করেছেন', 'के रूप में साइन इन हैं')}</p>
                      <p className="text-sm font-black text-gray-900 truncate">{activeSession.email}</p>
                    </div>

                    {/* ✨ GLOBAL PUROHIT TOGGLE BUTTON */}
                    {globalPurohitData?.verifiedBadge && (
                       <div className="p-3 border-b border-gray-100 bg-orange-50/30">
                          <button 
                             onClick={() => {
                                setIsPurohitMode(!isPurohitMode);
                                setActiveTab('plugin');
                                setShowProfileMenu(false);
                                showToast(isPurohitMode ? "Switched to Devotee Workspace" : "Switched to Global Purohit Dashboard");
                             }}
                             className="w-full flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                          >
                             <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                                <Flame size={16} />
                                {isPurohitMode ? "Switch to Local Mode" : "Purohit Dashboard"}
                             </span>
                             <ArrowRightLeft size={14} className="opacity-70"/>
                          </button>
                       </div>
                    )}

                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{safeTranslate('operating_currency', 'Operating Currency', 'অপারেটিং কারেন্সি', 'संचालन मुद्रा')}</span>
                      <span className="bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs font-black shadow-sm">
                        {activeSession?.currency?.code || 'BDT'} ({activeSession?.currency?.symbol || '৳'})
                      </span>
                    </div>

                    <div className="p-3 space-y-1">
                      <button 
                        onClick={() => { setShowProfileModal(true); setShowProfileMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-black text-gray-700 hover:text-sanatani-orange hover:bg-orange-50 rounded-2xl transition-all"
                      >
                        <User size={18} /> {safeTranslate('my_profile', 'My Profile', 'আমার প্রোফাইল', 'मेरी प्रोफ़ाइल')}
                      </button>
                      <button 
                        onClick={handleSecureLogout}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-black text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                      >
                        <LogOut size={18} /> {safeTranslate('secure_logout', 'Secure Logout', 'নিরাপদ লগআউট', 'सुरक्षित लॉगआउट')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {!isOnline && (
          <div className="bg-red-600 text-white p-2 text-center flex items-center justify-center gap-2 shadow-md relative z-20 shrink-0 animate-pulse">
            <WifiOff size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Offline Mode: Operating from local cache</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 bg-gray-50/50 relative z-0">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* 📱 MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-md border-t border-gray-200 flex items-center justify-around pb-safe pt-2 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40">
        <MobileNavItem active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<LayoutDashboard size={20} />} label={safeTranslate('nav_home', 'Dashboard', 'ড্যাশবোর্ড', 'डैशबोर्ड').split(' ')[0]} />
        <MobileNavItem active={activeTab === 'plugin'} onClick={() => setActiveTab('plugin')} icon={<PluginIcon size={20} />} label={isPurohitMode ? 'Diary' : activePlugin.navTitle.split(' ')[0]} isSpecial={true} activePlugin={activePlugin} />
        <MobileNavItem active={activeTab === 'directory'} onClick={() => setActiveTab('directory')} icon={<Users size={20} />} label={safeTranslate('nav_directory', 'Directory', 'ডিরেক্টরি', 'निर्देशिका').split(' ')[0]} />
        <MobileNavItem active={activeTab === 'treasury'} onClick={() => setActiveTab('treasury')} icon={<Banknote size={20} />} label={safeTranslate('nav_treasury', 'Treasury', 'ট্রেজারি', 'ट्रेजरी').split(' ')[0]} />
        <MobileNavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={20} />} label={safeTranslate('nav_settings', 'Settings', 'সেটিংস', 'सेटिंग्स').split(' ')[0]} />
      </nav>

      {/* ✨ FULL-FEATURED COMPREHENSIVE PERSONAL PROFILE MODAL ("MY SPACE") */}
      {showProfileModal && userProfile && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-0 sm:p-4 pt-safe pb-safe">
          <div className="bg-white w-[95%] sm:w-full max-w-4xl h-full sm:h-auto max-h-[95dvh] sm:max-h-[90vh] mx-auto rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 ring-1 ring-white/20">

            <div className="h-32 sm:h-40 bg-gradient-to-r from-gray-900 to-black relative shrink-0">
               <button onClick={() => {setShowProfileModal(false); setShowQR(false);}} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur-sm z-10"><X size={20}/></button>
            </div>

            <div className="px-5 sm:px-10 pb-0 shrink-0 bg-white border-b border-gray-100 z-10 relative">
               <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 mb-4 relative z-10">

                 {/* ✨ FIX: -mt-16 applied ONLY to the avatar to prevent text overlapping onto the black background in mobile view */}
                 <div className="relative group cursor-pointer w-28 h-28 sm:w-32 sm:h-32 -mt-14 sm:-mt-16 rounded-full border-4 border-white bg-white shadow-md shrink-0 mx-auto sm:mx-0" onClick={() => editPhotoRef.current?.click()}>
                   <div className={`w-full h-full rounded-full p-1 bg-gradient-to-tr ${getHaloDesign(calculateSevaScore(userProfile.totalDonated, userTransactions.length, userProfile.attendanceCount)).color}`}>
                     {userProfile.photoUrl ? (
                       <img src={userProfile.photoUrl} alt="Profile" className="w-full h-full object-cover rounded-full border-2 border-white" />
                     ) : (
                       <div className="w-full h-full bg-white text-gray-400 rounded-full flex items-center justify-center font-black text-4xl sm:text-5xl border-2 border-white">
                         {getInitial(userProfile.name)}
                       </div>
                     )}
                   </div>
                   <div className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md border border-gray-100 text-gray-700 hover:text-sanatani-orange transition-colors z-10">
                     <Camera size={16}/>
                   </div>
                   <input type="file" accept="image/*" className="hidden" ref={editPhotoRef} onChange={handlePhotoUpload} />
                 </div>

                 <div className="flex-1 pb-2 text-center sm:text-left sm:ml-4 min-w-0">
                   <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mb-1 truncate px-2 sm:px-0">{userProfile.name || 'Unnamed Profile'}</h2>
                   <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                     <span className="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest bg-gray-100 text-gray-700 border border-gray-200">
                        {userProfile.designation ? userProfile.designation : safeTranslate('members', 'Member', 'সদস্য', 'सदस्य')}
                     </span>
                     <span className="text-[10px] text-gray-500 font-mono font-bold tracking-wider px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm">ID: {userProfile.id}</span>
                   </div>
                 </div>
               </div>

               {/* ✨ VEDIC HUB & PROFILE TABS */}
               <div className="flex items-center justify-start gap-4 sm:gap-6 border-b border-gray-200 overflow-x-auto scrollbar-hide w-full px-2 sm:px-0">
                  <button onClick={()=>setProfileTab('PASS')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap flex items-center gap-1.5 ${profileTab === 'PASS' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-700'}`}><Ticket size={14} className="mb-0.5 mr-1"/> {safeTranslate('gate_pass', 'Gate Pass', 'গেট পাস', 'गेट पास')}</button>
                  <button onClick={()=>setProfileTab('IDENTITY')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${profileTab === 'IDENTITY' ? 'text-sanatani-orange border-b-2 border-sanatani-orange' : 'text-gray-400 hover:text-gray-700'}`}>{safeTranslate('identity_tab', 'Identity', 'পরিচয়', 'पहचान')}</button>
                  <button onClick={()=>setProfileTab('ACTIVITY')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${profileTab === 'ACTIVITY' ? 'text-sanatani-orange border-b-2 border-sanatani-orange' : 'text-gray-400 hover:text-gray-700'}`}>{safeTranslate('activity_tab', 'Activity', 'অ্যাক্টিভিটি', 'गतिविधि')}</button>
                  <button onClick={()=>setProfileTab('GLOBAL')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap flex items-center gap-1 ${profileTab === 'GLOBAL' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400 hover:text-gray-700'}`}><Globe2 size={14} className="mb-0.5"/> {safeTranslate('vedic_hub', 'Vedic Hub', 'বেদিক হাব', 'वैदिक हब')}</button>
                  <button onClick={()=>setProfileTab('SECURITY')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${profileTab === 'SECURITY' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-700'}`}>{safeTranslate('security_tab', 'Security', 'নিরাপত্তা', 'सुरक्षा')}</button>
               </div>
            </div>

            <div className="p-4 sm:p-8 overflow-y-auto bg-gray-50/50 flex-1 min-h-0 pb-32 sm:pb-12 scrollbar-hide">

              {profileTab === 'PASS' && (
                <div className="space-y-6 animate-in fade-in flex flex-col items-center justify-center py-4">
                   <div className="bg-white rounded-3xl shadow-xl border border-gray-200 w-full max-w-sm overflow-hidden relative">
                      <div className="bg-gradient-to-r from-orange-500 to-red-600 p-6 text-center">
                         <h3 className="text-2xl font-black text-white tracking-widest uppercase">Gate Pass</h3>
                         <p className="text-orange-100 text-xs font-bold mt-1">{activeSession.communityName}</p>
                      </div>
                      <div className="p-8 flex flex-col items-center bg-white relative">
                         <div className="absolute -left-4 top-0 w-8 h-8 bg-gray-50 rounded-full shadow-inner border border-gray-100"></div>
                         <div className="absolute -right-4 top-0 w-8 h-8 bg-gray-50 rounded-full shadow-inner border border-gray-100"></div>

                         <img
                           src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`https://sanatanibandhan.web.app/?action=verify&id=${userProfile.id}`)}`}
                           alt="Safe Gate Pass QR"
                           className="w-48 h-48 rounded-2xl shadow-md border-4 border-white mb-6 bg-white p-2"
                         />
                         <h4 className="text-xl font-black text-gray-900 text-center">{userProfile.name}</h4>
                         <p className="text-sm font-mono font-bold text-gray-500 tracking-widest mt-1 text-center">{userProfile.id}</p>

                         <p className="text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-3 py-1.5 rounded-full mt-5 border border-green-200 flex items-center gap-1.5">
                           <ShieldCheck size={14}/> Identity Verified
                         </p>
                      </div>
                      <div className="bg-gray-50 p-5 border-t border-gray-100 text-center">
                         <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
                           Present this secure pass to volunteers at any event gate. It contains <strong className="text-red-500">no</strong> sensitive login credentials.
                         </p>
                      </div>
                   </div>
                </div>
              )}

              {profileTab === 'IDENTITY' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-gray-50 px-5 py-3.5 border-b border-gray-200 flex justify-between items-center">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{safeTranslate('contact_geo', 'Contact & Geography', 'যোগাযোগ ও ভৌগলিক তথ্য', 'संपर्क और भौगोलिक जानकारी')}</span>
                      <span className="text-[10px] font-black text-sanatani-orange uppercase tracking-widest flex items-center gap-1"><Edit size={12}/> {safeTranslate('tap_to_edit', 'Tap to Edit', 'এডিট করুন', 'संपादित करें')}</span>
                    </div>
                    <div className="divide-y divide-gray-100">

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('full_name', 'Full Name', 'সম্পূর্ণ নাম', 'पूरा नाम')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><User size={14} className="text-gray-400 shrink-0"/> {userProfile.name}</p></div>
                        <button onClick={() => setEditModal({ field: 'name', displayName: safeTranslate('full_name', 'Full Name', 'সম্পূর্ণ নাম', 'पूरा नाम'), value: userProfile.name || '' })} className="text-blue-600 bg-blue-50 p-2.5 rounded-xl shrink-0 ml-2 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={14}/></button>
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0 bg-gray-50/50">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('phone_number', 'Phone Number', 'ফোন নম্বর', 'फ़ोन नंबर')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><Phone size={14} className="text-gray-400 shrink-0"/> {userProfile.phone || 'N/A'}</p></div>
                        <Lock size={16} className="text-gray-300 shrink-0 ml-2" title="Contact Admin to update secure login identity."/>
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0 bg-gray-50/50">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('email', 'Email Address', 'ইমেইল', 'ईमेल')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><Mail size={14} className="text-gray-400 shrink-0"/> {userProfile.email || 'N/A'}</p></div>
                        <Lock size={16} className="text-gray-300 shrink-0 ml-2" title="Contact Admin to update secure login identity."/>
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('nid', 'Govt ID / NID', 'জাতীয় পরিচয়পত্র', 'राष्ट्रीय पहचान पत्र')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><CreditCard size={14} className="text-gray-400 shrink-0"/> {userProfile.nid || safeTranslate('not_provided', 'Not Provided', 'দেওয়া হয়নি', 'प्रदान नहीं किया गया')}</p></div>
                        <button onClick={() => setEditModal({ field: 'nid', displayName: safeTranslate('nid', 'Govt ID / NID', 'জাতীয় পরিচয়পত্র', 'राष्ट्रीय पहचान पत्र'), value: userProfile.nid || '' })} className="text-blue-600 bg-blue-50 p-2.5 rounded-xl shrink-0 ml-2 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={14}/></button>
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('full_address', 'Full Address', 'সম্পূর্ণ ঠিকানা', 'पूरा पता')}</p><p className="text-sm font-black text-gray-900 flex items-start gap-2 max-w-lg leading-snug"><MapPin size={14} className="text-gray-400 shrink-0 mt-0.5"/> <span className="break-words">{userProfile.address || safeTranslate('not_provided', 'Not Provided', 'দেওয়া হয়নি', 'प्रदान नहीं किया गया')}</span></p></div>
                        <button onClick={() => setEditModal({ field: 'address', displayName: safeTranslate('full_address', 'Full Address', 'সম্পূর্ণ ঠিকানা', 'पूरा पता'), value: userProfile.address || '' })} className="text-blue-600 bg-blue-50 p-2.5 rounded-xl shrink-0 ml-2 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={14}/></button>
                      </div>

                      <div className="grid grid-cols-2 divide-x divide-gray-100">
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('blood_group', 'Blood Group', 'রক্তের গ্রুপ', 'रक्त समूह')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><Droplet size={14} className="text-red-400 shrink-0"/> {userProfile.bloodGroup || 'N/A'}</p></div>
                          <button onClick={() => setEditModal({ field: 'bloodGroup', displayName: safeTranslate('blood_group', 'Blood Group', 'রক্তের গ্রুপ', 'रक्त समूह'), value: userProfile.bloodGroup || '' })} className="text-blue-600 bg-blue-50 p-2 rounded-lg shrink-0 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={12}/></button>
                        </div>
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0 bg-gray-50/50">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('country', 'Country', 'দেশ', 'देश')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><Globe2 size={14} className="text-blue-400 shrink-0"/> {userProfile.country || 'N/A'}</p></div>
                          <Lock size={14} className="text-gray-300 shrink-0 ml-2" title="Contact Master Support to migrate workspace region."/>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 divide-x divide-gray-100">
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('gotra_lineage', 'Gotra Lineage', 'গোত্র', 'गोत्र')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><ShieldCheck size={14} className="text-purple-400 shrink-0"/> {userProfile.gotra || 'N/A'}</p></div>
                          <button onClick={() => setEditModal({ field: 'gotra', displayName: safeTranslate('gotra_lineage', 'Gotra Lineage', 'গোত্র', 'गोत्र'), value: userProfile.gotra || '' })} className="text-blue-600 bg-blue-50 p-2 rounded-lg shrink-0 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={12}/></button>
                        </div>
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('cultural_desig', 'Designation', 'পদবী', 'पदनाम')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><Award size={14} className="text-yellow-500 shrink-0"/> {userProfile.designation || 'Member'}</p></div>
                          {activeSession.role === 'ADMIN' && <button onClick={() => setEditModal({ field: 'designation', displayName: safeTranslate('cultural_desig', 'Designation', 'পদবী', 'पदनाम'), value: userProfile.designation || '' })} className="text-blue-600 bg-blue-50 p-2 rounded-lg shrink-0 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={12}/></button>}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {profileTab === 'ACTIVITY' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-6">
                     {(() => {
                        const score = calculateSevaScore(userProfile.totalDonated, userTransactions.length, userProfile.attendanceCount);
                        const halo = getHaloDesign(score);
                        return (
                          <>
                            <div className={`w-16 h-16 rounded-full bg-gradient-to-tr ${halo.color} text-white flex items-center justify-center shrink-0 shadow-lg`}>
                              <Award size={28}/>
                            </div>
                            <div className="flex-1 text-center md:text-left">
                              <h3 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('seva_index', 'Seva Index', 'সেবা সূচক', 'सेवा सूचकांक')}: <span className="text-sanatani-orange">{score}</span></h3>
                              <p className="text-xs font-bold text-gray-500">{safeTranslate('seva_desc', 'Your current rank is', 'আপনার বর্তমান র‍্যাঙ্ক হলো', 'आपकी वर्तमान रैंक है')} <strong className="text-gray-800">{halo.name}</strong></p>
                              {userProfile.attendanceCount > 0 && (
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2 bg-emerald-50 px-3 py-1.5 rounded-full inline-block border border-emerald-100 shadow-sm">
                                  🔥 {userProfile.attendanceCount} {safeTranslate('events_attended', 'Events Attended', 'ইভেন্টে অংশগ্রহণ করেছেন', 'इवेंट में भाग लिया')}
                                </p>
                              )}
                            </div>
                          </>
                        )
                     })()}
                  </div>

                  <div className="bg-white border border-green-200 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm relative overflow-hidden">
                     <div className="absolute top-0 right-0 -mt-6 -mr-6 opacity-5 pointer-events-none"><Banknote size={120} className="text-green-600"/></div>
                     <div className="text-center sm:text-left relative z-10">
                       <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-1.5 flex items-center justify-center sm:justify-start gap-1.5"><Banknote size={14}/> {safeTranslate('lifetime_donated', 'Lifetime Donated', 'মোট অনুদান', 'कुल दान')}</p>
                       <p className="text-4xl font-black text-green-600 tracking-tight">{activeSession?.currency?.symbol || '৳'}{(userProfile.totalDonated || 0).toLocaleString()}</p>
                     </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                    <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex flex-col gap-3">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Filter size={14}/> {safeTranslate('filters', 'Filters', 'ফিল্টার', 'फ़िल्टर')}</span>

                      <div className="grid grid-cols-2 md:flex md:flex-row items-center gap-3 w-full">
                        <select 
                          value={activityFilterType} 
                          onChange={e => setActivityFilterType(e.target.value)}
                          className="col-span-2 md:col-span-1 p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none cursor-pointer shadow-sm transition-colors focus:border-sanatani-orange"
                        >
                          <option value="ALL">{safeTranslate('filter_all', 'All Activities', 'সব কার্যক্রম', 'सभी गतिविधियां')}</option>
                          <option value="INCOME">{safeTranslate('filter_income', 'Donations Only', 'শুধুমাত্র অনুদান', 'केवल दान')}</option>
                          <option value="EXPENSE">{safeTranslate('filter_expense', 'Expenses Only', 'শুধুমাত্র খরচ', 'केवल खर्च')}</option>
                        </select>

                        <div className="col-span-2 md:w-auto flex items-center bg-white border border-gray-200 p-1.5 rounded-xl shadow-sm overflow-x-auto">
                          <input type="date" value={activityDateRange.start} onChange={e => setActivityDateRange({ ...activityDateRange, start: e.target.value })} className="p-1.5 bg-transparent text-xs text-gray-700 font-bold outline-none flex-1 min-w-[110px]" />
                          <span className="text-gray-300 font-bold px-2">-</span>
                          <input type="date" value={activityDateRange.end} onChange={e => setActivityDateRange({ ...activityDateRange, end: e.target.value })} className="p-1.5 bg-transparent text-xs text-gray-700 font-bold outline-none flex-1 min-w-[110px]" />
                          {(activityDateRange.start || activityDateRange.end) && (
                            <button onClick={() => setActivityDateRange({start:'', end:''})} className="bg-gray-100 hover:bg-gray-200 p-1.5 rounded-lg transition-colors ml-1"><X size={14}/></button>
                          )}
                        </div>

                        {filteredPersonalTransactions.length > 0 && (
                          <div className="col-span-2 md:ml-auto flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                            <button onClick={handleExportPersonalCSV} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-gray-100 border border-gray-200 px-4 py-2.5 rounded-xl text-[10px] font-black text-gray-700 hover:bg-gray-200 uppercase tracking-widest transition-all shadow-sm">
                              <FileDown size={14}/> CSV
                            </button>
                            <button onClick={handleExportPersonalPDF} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl text-[10px] font-black text-red-600 hover:bg-red-100 uppercase tracking-widest transition-all shadow-sm">
                              <FileText size={14}/> PDF
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-3 scrollbar-hide">
                       {filteredPersonalTransactions.length > 0 ? (
                         <div className="space-y-2">
                           {filteredPersonalTransactions.map(tr => (
                             <div key={tr.id} className="p-4 bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm rounded-2xl transition-all flex justify-between items-center group min-w-0">
                               <div className="min-w-0 pr-4">
                                 <p className="text-sm font-black text-gray-900 truncate">{tr.note || safeTranslate('general_donation', 'General Donation', 'সাধারণ অনুদান', 'सामान्य दान')}</p>
                                 <p className="text-[10px] font-bold text-gray-400 tracking-wider mt-1">{new Date(tr.timestamp).toLocaleString()}</p>
                               </div>

                               <div className="flex items-center gap-4 shrink-0">
                                 <div className="text-right">
                                   <p className={`text-base font-black ${tr.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{tr.amount >= 0 ? '+' : ''}{activeSession?.currency?.symbol || '৳'}{Math.abs(tr.amount)}</p>
                                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">By {tr.collector?.split(' ')[0] || 'System'}</p>
                                 </div>
                                 <button 
                                   onClick={async (e) => { 
                                     e.stopPropagation(); 
                                     const type = tr.amount >= 0 ? 'INCOME' : 'EXPENSE';
                                     pushToDataLayer('download_receipt', { transaction_id: tr.id, transaction_type: type, value: Math.abs(tr.amount) });
                                     try {
                                       const { generateReceiptPdf } = await import('./utils/pdfGenerator');
                                       await generateReceiptPdf(activeSession.communityName, tr, type);
                                     } catch (err) { showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + err.message, "error"); }
                                   }} 
                                   className="text-gray-500 hover:text-sanatani-orange p-2.5 bg-gray-50 hover:bg-orange-50 rounded-xl border border-transparent hover:border-orange-200 transition-all shadow-sm" 
                                   title="Download Receipt"
                                 >
                                   <FileDigit size={16}/>
                                 </button>
                               </div>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <div className="py-12 text-center text-gray-400">
                           <History size={32} className="mx-auto mb-3 opacity-20"/>
                           <p className="text-xs font-bold uppercase tracking-widest">{safeTranslate('no_matching_activities', 'No activities found.', 'কোন কার্যকলাপ পাওয়া যায়নি.', 'कोई गतिविधि नहीं मिली.')}</p>
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              )}

              {profileTab === 'GLOBAL' && (
                <div className="space-y-6 animate-in fade-in">

                  {/* VIVAH BANDHAN MATRIMONIAL WIDGET */}
                  <div className="bg-gradient-to-br from-pink-50 to-purple-50 border border-pink-200 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="absolute top-0 right-0 -mt-6 -mr-6 opacity-10 pointer-events-none">
                       <Heart size={150} className="text-pink-500 fill-current"/>
                    </div>

                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md border border-pink-100 shrink-0 relative z-10">
                      <HeartHandshake size={32} className="text-pink-600"/>
                    </div>

                    <div className="flex-1 text-center sm:text-left relative z-10">
                      <h4 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('vivah_title', 'Vivah Bandhan Matrimonial', 'বিবাহ বন্ধন ম্যাট্রিমোনিয়াল', 'विवाह बंधन मैट्रिमोनियल')}</h4>
                      <p className="text-xs font-bold text-gray-600 mb-4 max-w-sm leading-relaxed">
                        {safeTranslate('vivah_subtitle', 'Find verified, compatible matches within the Sanatan community based on strict Gotra alignment.', 'গোত্র এবং সনাতন মূল্যবোধের উপর ভিত্তি করে পাত্র-পাত্রী খুঁজুন।', 'गोत्र और सनातन मूल्यों पर आधारित पारिवारिक मैचमेकिंग।')}
                      </p>

                      {hasMatrimonialProfile ? (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <span className="bg-green-100 text-green-800 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-inner border border-green-200 flex items-center gap-1.5">
                            <CheckCircle2 size={14}/> Profile Active
                          </span>
                          <button 
                            onClick={() => { setShowProfileModal(false); setActiveTab('vivah'); }}
                            className="bg-white hover:bg-gray-50 border border-gray-200 text-pink-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
                          >
                            Manage Profile
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => { setShowProfileModal(false); setActiveTab('vivah'); }}
                          className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
                        >
                          <Plus size={14}/> {safeTranslate('create_profile', 'Create Matrimonial Profile', 'প্রোফাইল তৈরি করুন', 'प्रोफ़ाइल बनाएँ')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* GLOBAL PUROHIT WIDGET */}
                  <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="absolute top-0 right-0 -mt-6 -mr-6 opacity-10 pointer-events-none">
                       <Flame size={150} className="text-orange-500 fill-current"/>
                    </div>

                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md border border-orange-100 shrink-0 relative z-10">
                      <Sparkles size={32} className="text-sanatani-orange"/>
                    </div>

                    <div className="flex-1 text-center sm:text-left relative z-10">
                      <h4 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('global_purohit_registry', 'Global Purohit Registry', 'গ্লোবাল পুরোহিত রেজিস্ট্রি', 'ग्लोबल पुरोहित निर्देशिका')}</h4>
                      <p className="text-xs font-bold text-gray-600 mb-4 max-w-sm leading-relaxed">
                        {safeTranslate('apply_purohit_desc', 'Are you a qualified Acharya, Pandit, or Vedic Scholar? Apply to join the global registry and accept bookings from any Mandir.', 'আপনি কি একজন যোগ্য পুরোহিত? গ্লোবাল রেজিস্ট্রিতে যোগ দিন।', 'क्या आप एक योग्य पंडित हैं? ग्लोबल डायरेक्टरी में जुड़ें।')}
                      </p>

                      {/* 🟢 1. APPROVED STATE */}
                      {globalPurohitData?.verifiedBadge ? (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <span className="bg-green-100 text-green-800 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-inner border border-green-200 flex items-center gap-1.5">
                            <ShieldCheck size={14}/> Verified Global Scholar
                          </span>
                          <button 
                            onClick={() => { 
                              setIsPurohitMode(true); 
                              setShowProfileModal(false); 
                              setActiveTab('plugin'); 
                            }}
                            className="bg-white hover:bg-gray-50 border border-gray-200 text-orange-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
                          >
                            Open Dashboard
                          </button>
                        </div>
                      ) : 

                      /* 🟡 2. PENDING / WAITING STATE */
                      purohitApplication?.status === 'PENDING' || purohitApplication?.status === 'IN_REVIEW' ? (
                        <div className="bg-amber-100 text-amber-900 px-4 py-2.5 rounded-xl flex items-center justify-center sm:justify-start gap-2 text-xs font-black uppercase tracking-widest shadow-inner border border-amber-200 inline-flex">
                          <Clock size={16} className="text-amber-700"/> 
                          {purohitApplication.status === 'IN_REVIEW' ? 'Under Active Review' : 'Application Pending Review'}
                        </div>
                      ) : 

                      /* 🔴 3. REJECTED STATE */
                      purohitApplication?.status === 'REJECTED' ? (
                        <div className="space-y-3">
                          <div className="bg-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center justify-center sm:justify-start gap-2 text-xs font-black uppercase tracking-widest shadow-inner border border-red-200 inline-flex">
                            <AlertTriangle size={16}/> Verification Not Approved
                          </div>
                          {purohitApplication.rejectionReason && (
                            <p className="text-[11px] font-bold text-red-600 leading-snug">
                              <strong>Reason:</strong> {purohitApplication.rejectionReason}
                            </p>
                          )}
                          <div>
                            <button 
                              onClick={handleApplyPurohit} 
                              className="bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
                            >
                              <Send size={14}/> Re-Submit Application
                            </button>
                          </div>
                        </div>
                      ) : 

                      /* ⚪ 4. INITIAL NOT APPLIED STATE */
                      (
                        <button 
                          onClick={handleApplyPurohit} 
                          className="bg-gray-900 hover:bg-black text-white px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
                        >
                          <Send size={14}/> {safeTranslate('btn_submit_kyc', 'Apply for Verified Badge', 'ভেরিফাইড ব্যাজের জন্য আবেদন করুন', 'सत्यापित बैज के लिए आवेदन करें')}
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {profileTab === 'SECURITY' && (
                <div className="space-y-6 animate-in fade-in">

                  <div className="bg-white border border-blue-100 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col sm:flex-row items-center gap-6 sm:gap-8 relative overflow-hidden text-center sm:text-left">
                     <div className="absolute top-0 left-0 w-1.5 sm:w-full h-full sm:h-1.5 bg-blue-500"></div>

                     {showQR ? (
                       <div className="flex flex-col items-center bg-gray-50 p-4 rounded-2xl shadow-inner border border-gray-200 shrink-0 animate-in zoom-in-95 relative overflow-hidden">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`https://sanatanibandhan.web.app/?action=autologin&id=${userProfile.id}&pin=${userPin || '0000'}&workspace=${encodeURIComponent(activeSession.communityName)}`)}`} 
                            alt="Secure Auto-Login URL QR" 
                            className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl mb-3 border border-gray-200 shadow-sm blur-sm hover:blur-none transition-all duration-300"
                          />
                          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200 shadow-sm">Auto-Login Active</p>
                       </div>
                     ) : (
                       <div className="w-32 h-32 sm:w-40 sm:h-40 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center text-blue-300 shrink-0 shadow-inner">
                         <QrCode size={48}/>
                       </div>
                     )}

                     <div className="flex flex-col justify-center w-full">
                        <h3 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('account_recovery_qr', 'Account Recovery QR', 'অ্যাকাউন্ট রিকভারি QR', 'खाता पुनर्प्राप्ति QR')}</h3>
                        <p className="text-xs font-bold text-gray-500 mb-4 max-w-sm mx-auto sm:mx-0 leading-relaxed">
                          {safeTranslate('qr_recovery_desc', 'Download or scan this to automatically log back into your workspace if you forget your PIN.', 'আপনার পিন ভুলে গেলে স্বয়ংক্রিয়ভাবে লগ ইন করতে এটি ডাউনলোড বা স্ক্যান করুন।', 'यदि आप अपना पिन भूल जाते हैं तो स्वचालित रूप से लॉग इन करने के लिए इसे डाउनलोड या स्कैन करें।')}
                        </p>

                        <p className="text-[10px] font-bold text-red-500 mb-6 bg-red-50 p-3 rounded-xl border border-red-100 text-left flex items-start gap-2 leading-relaxed">
                          <AlertTriangle size={16} className="shrink-0 mt-0.5"/> 
                          {safeTranslate('qr_warning', 'WARNING: This QR code contains your secure PIN. Do not show this to volunteers at the gate. Use the "Gate Pass" tab instead.', 'সতর্কতা: এই QR কোডে আপনার পিন রয়েছে। এটি গেটে স্বেচ্ছাসেবকদের দেখাবেন না।', 'चेतावनी: इस QR कोड में आपका पिन है। इसे गेट पर न दिखाएं।')}
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                           <button onClick={() => { setShowQR(!showQR); pushToDataLayer('view_personal_qr', { community_id: activeSession.communityId }); }} className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-sm">
                             {showQR ? safeTranslate('hide_qr', 'Hide QR', 'QR লুকান', 'QR छिपाएं') : safeTranslate('view_qr', 'View QR', 'QR দেখুন', 'QR देखें')}
                           </button>
                           <button onClick={handleViewOrGeneratePin} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                             <Download size={14}/> {safeTranslate('download_pdf_card', 'Download PDF', 'PDF ডাউনলোড করুন', 'PDF डाउनलोड करें')}
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="border border-red-100 bg-red-50/50 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden mt-6">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                    <p className="text-[10px] font-black text-red-600 flex items-center gap-2 uppercase tracking-widest mb-5 border-b border-red-100 pb-4"><ShieldAlert size={16}/> {safeTranslate('security_controls', 'Security Controls', 'নিরাপত্তা নিয়ন্ত্রণ', 'सुरक्षा नियंत्रण')}</p>

                    <button onClick={handleSecureLogout} className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-sm hover:-translate-y-0.5">
                      <LogOut size={16}/> {safeTranslate('secure_logout', 'Secure Logout', 'নিরাপদ লগআউট', 'सुरक्षित लॉगआउट')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* ✨ INLINE EDIT MODAL */}
      {editModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 ring-1 ring-white/20 relative">
              <button onClick={() => setEditModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 bg-gray-100 p-2.5 rounded-full transition-colors"><X size={16}/></button>

              <div className="mb-6">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner border border-blue-100"><Edit size={24}/></div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Update {editModal.displayName}</h3>
                <p className="text-xs font-bold text-gray-500 mt-1">Enter your new information below.</p>
              </div>

              {editModal.field === 'address' ? (
                <textarea 
                  rows="3" value={editModal.value} onChange={(e) => setEditModal({...editModal, value: e.target.value})} autoFocus
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold text-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm resize-none"
                  placeholder="Street, City, Zip Code..."
                />
              ) : (
                <input 
                  type={editModal.field === 'email' ? 'email' : editModal.field === 'phone' ? 'tel' : 'text'} 
                  value={editModal.value} onChange={(e) => setEditModal({...editModal, value: e.target.value})} autoFocus
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold text-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"
                />
              )}

              <div className="flex gap-3 mt-8">
                 <button onClick={() => setEditModal(null)} className="flex-1 px-4 py-3.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-sm">{safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें')}</button>
                 <button onClick={submitEditField} className="flex-[2] px-4 py-3.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2">
                   {safeTranslate('btn_save', 'Save', 'সংরক্ষণ', 'सहेजें')} <CheckCircle2 size={16}/>
                </button>
              </div>
           </div>
        </div>
      , document.body)}

      {/* ✨ GLOBAL PUROHIT KYC APPLICATION MODAL */}
      {showKycModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10500] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 ring-1 ring-white/20 relative overflow-hidden flex flex-col max-h-[95dvh]">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50/80 shrink-0 flex justify-between items-center relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><FileBadge size={100}/></div>
               <div className="relative z-10">
                 <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                   <FileBadge className="text-sanatani-orange" size={20}/> 
                   {safeTranslate('kyc_form_title', 'Global Scholar KYC Application', 'গ্লোবাল স্কলার কেওয়াইসি আবেদন', 'ग्लोबल स्कॉलर केवाईसी आवेदन')}
                 </h3>
                 <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                   {safeTranslate('kyc_form_subtitle', 'Submit your credentials for verification.', 'ভেরিফিকেশনের জন্য আপনার তথ্য জমা দিন।', 'सत्यापन के लिए अपना विवरण जमा करें।')}
                 </p>
               </div>
               <button onClick={() => setShowKycModal(false)} className="p-2 bg-white rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors shadow-sm border border-gray-200 relative z-10"><X size={16}/></button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-6 sm:p-8 overflow-y-auto flex-1 scrollbar-hide">
              <form id="kycForm" onSubmit={submitKycApplication} className="space-y-6">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('full_name', 'Full Name')} *</label>
                    <div className="relative">
                      <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
                      <input type="text" readOnly value={userProfile?.name || activeSession?.userName} className="w-full pl-10 pr-4 py-3.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 outline-none cursor-not-allowed" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('phone_number', 'Phone Number')} *</label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
                      <input type="text" readOnly value={userProfile?.phone || ''} className="w-full pl-10 pr-4 py-3.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 outline-none cursor-not-allowed" placeholder={safeTranslate('not_provided', 'Not Provided')}/>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50/50 border border-orange-200 p-5 rounded-2xl shadow-inner relative overflow-hidden">
                  <p className="text-[10px] font-black text-orange-800 uppercase tracking-widest mb-4 flex items-center gap-1.5 border-b border-orange-100 pb-3">
                     <GraduationCap size={14}/> Scholar Credentials
                  </p>
                  
                  <div className="space-y-4 relative z-10">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('kyc_specialization', 'Primary Specialization')} *</label>
                      <input type="text" required value={kycForm.specialization} onChange={e=>setKycForm({...kycForm, specialization: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder={safeTranslate('kyc_specialization_ph', 'e.g. Vivah, Vastu, Vedic Rituals')}/>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('kyc_experience', 'Years of Experience')} *</label>
                        <input type="number" required min="1" value={kycForm.experience} onChange={e=>setKycForm({...kycForm, experience: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder="e.g. 5"/>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('kyc_lineage', 'Gotra & Vedic Lineage')} *</label>
                        <input type="text" required value={kycForm.lineage} onChange={e=>setKycForm({...kycForm, lineage: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder={safeTranslate('kyc_lineage_ph', 'e.g. Kashyap, Rigveda')}/>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('kyc_location', 'Current City / Mandir')} *</label>
                      <input type="text" required value={kycForm.location} onChange={e=>setKycForm({...kycForm, location: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder={safeTranslate('kyc_location_ph', 'e.g. Kashi Vishwanath, Varanasi')}/>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                  <ShieldCheck size={20} className="text-blue-500 shrink-0 mt-0.5"/>
                  <p className="text-[10px] font-bold text-blue-800 leading-relaxed">
                    By submitting this form, you confirm that your provided credentials are accurate. Our verification team will review your application within 24-48 hours.
                  </p>
                </div>
              </form>
            </div>

            {/* Footer / Actions */}
            <div className="p-6 border-t border-gray-100 bg-gray-50/50 shrink-0 flex gap-3">
               <button type="button" onClick={() => setShowKycModal(false)} className="flex-1 px-4 py-3.5 bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-sm">{safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें')}</button>
               <button type="submit" form="kycForm" disabled={kycSubmitting} className="flex-[2] px-4 py-3.5 bg-gray-900 text-white hover:bg-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2 disabled:opacity-50">
                 {kycSubmitting ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} 
                 {safeTranslate('btn_submit_application', 'Submit Application', 'আবেদন জমা দিন', 'आवेदन जमा करें')}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* 🚀 MOUNT ENTERPRISE LIVE SUPPORT WIDGET */}
      <TawkToWidget session={activeSession} />
    </div>
  );
}

// Subcomponents
function NavItem({ active, onClick, icon, label, isSpecial, activePlugin }) {
  if (isSpecial) {
     return (
       <button onClick={onClick} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all font-black text-sm ${active ? `${activePlugin.bg} ${activePlugin.accent} shadow-sm border ${activePlugin.border}` : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border border-transparent'}`}>
         {icon} {label}
       </button>
     );
  }
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all font-black text-sm ${active ? 'bg-sanatani-orange text-white shadow-md' : 'text-gray-500 hover:bg-orange-50 hover:text-sanatani-orange border border-transparent hover:border-orange-100'}`}>
      {icon} {label}
    </button>
  );
}

function MobileNavItem({ active, onClick, icon, label, isSpecial, activePlugin }) {
  if (isSpecial) {
     return (
      <button onClick={onClick} className={`flex flex-col items-center justify-center w-[72px] h-[72px] rounded-2xl transition-all ${active ? activePlugin.accent : 'text-gray-400 hover:text-gray-600'}`}>
        <div className={`${active ? `${activePlugin.bg} p-2 rounded-xl mb-1.5 shadow-inner` : 'mb-1.5'}`}>{icon}</div>
        <span className={`text-[10px] font-black tracking-wide ${active ? activePlugin.accent : 'text-gray-500'}`}>{label}</span>
      </button>
     );
  }
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-[72px] h-[72px] rounded-2xl transition-all ${active ? 'text-sanatani-orange' : 'text-gray-400 hover:text-gray-600'}`}>
      <div className={`${active ? 'bg-orange-50 p-2 rounded-xl mb-1.5 shadow-inner' : 'mb-1.5'}`}>{icon}</div>
      <span className={`text-[10px] font-black tracking-wide ${active ? 'text-sanatani-orange' : 'text-gray-500'}`}>{label}</span>
    </button>
  );
}
