import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, set, update, increment } from 'firebase/database';
import { db } from '../firebase';
import { 
  Megaphone, MessageSquare, Smartphone, Users, Star, Copy, Check, 
  Send, Flame, AlertCircle, Loader2, BookOpen, ShieldAlert, CheckCircle2, 
  Eye, LayoutList, ShieldCheck, BrainCircuit, History, UserPlus, Lock, 
  WifiOff, AlertTriangle, Clock, XCircle, Timer, CalendarClock, X, Filter,
  EyeOff, HelpCircle, Lightbulb, Award, Mail, Radio, Bell
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function SandeshDesk({ session, isOnline = navigator.onLine }) {
  const { t, language, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [members, setMembers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_prachar_members_${session.communityId}`)) || []; } catch { return []; }
  });
  const [guests, setGuests] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_prachar_guests_${session.communityId}`)) || []; } catch { return []; }
  });
  const [loading, setLoading] = useState(true);

  // UI States
  const [audience, setAudience] = useState('ALL_MEMBERS'); 
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState('PREVIEW'); 
  const [showGuide, setShowGuide] = useState(false); 

  // Omnichannel Toggles State
  const [activeChannels, setActiveChannels] = useState({
    push: true,
    whatsapp: true,
    sms: false,
    email: false
  });

  // Temporary Access Request States
  const [myRequest, setMyRequest] = useState(null);
  const [allRequests, setAllRequests] = useState([]);
  const [requestReason, setRequestReason] = useState('');
  const [adminActionModal, setAdminActionModal] = useState({ show: false, req: null, action: 'APPROVE', duration: 24, note: '' });
  const [showRequestManager, setShowRequestManager] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Security Role Check
  const isManagerOrAdmin = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.role === 'MANAGER';

  // Calculate if the user currently has access
  const hasAccess = useMemo(() => {
    if (isManagerOrAdmin) return true;
    if (myRequest?.status === 'APPROVED' && myRequest?.approvedUntil > Date.now()) return true;
    return false;
  }, [isManagerOrAdmin, myRequest]);

  const localizedTemplates = {
    en: {
      utsav: `Namaskar [Name] 🙏,\n\nThe ${session.communityName} cordially invites you and your family to our upcoming Utsav. Your presence will deeply bless our ${t('workspace') || 'community'}.\n\nPlease reply YES to confirm your attendance! 🚩`,
      chanda: `Namaskar [Name] 🙏,\n\nA humble reminder from ${session.communityName} regarding your monthly Seva contribution. Your support keeps our ${t('workspace') || 'organization'} running smoothly.\n\nDonate online or reply to this message. 🌺`,
      meeting: `URGENT [Name] 🙏,\n\nA special committee meeting for ${session.communityName} has been scheduled. All official members are requested to attend.\n\nHar Har Mahadev! 🔱`,
      bani: `Suprabhat [Name] 🙏,\n\n"Karmanye Vadhikaraste Ma Phaleshu Kadachana."\nStart your day with positive energy. May the divine bless you today.\n\n- ${session.communityName} 🛕`
    },
    bn: {
      utsav: `নমস্কার [Name] 🙏,\n\n${session.communityName}-এর আসন্ন উৎসবে আপনাকে ও আপনার পরিবারকে সাদর আমন্ত্রণ। আপনার উপস্থিতি আমাদের ${t('workspace') || 'প্রতিষ্ঠানকে'} ধন্য করবে।\n\nঅনুগ্রহ করে 'YES' লিখে উপস্থিতি নিশ্চিত করুন! 🚩`,
      chanda: `নমস্কার [Name] 🙏,\n\nএটি ${session.communityName}-এর পক্ষ থেকে আপনার মাসিক সেবা অনুদানের একটি বিনীত অনুস্মারক। আপনার সহযোগিতায় আমাদের ${t('workspace') || 'প্রতিষ্ঠান'} পরিচালিত হয়।\n\nঅনলাইনে দান করুন বা মেসেজের রিপ্লাই দিন। 🌺`,
      meeting: `জরুরি নোটিশ [Name] 🙏,\n\n${session.communityName}-এর একটি বিশেষ কমিটি মিটিং নির্ধারণ করা হয়েছে। সকল সদস্যকে উপস্থিত থাকার জন্য অনুরোধ করা হচ্ছে।\n\nহর হর মহাদেব! 🔱`,
      bani: `সুপ্রভাত [Name] 🙏,\n\n"কর্মণ্যবাধিকারস্তে মা ফলেষু কদাচন।"\nইতিবাচক শক্তি নিয়ে দিন শুরু করুন। ঈশ্বর আপনার মঙ্গল করুন।\n\n- ${session.communityName} 🛕`
    },
    hi: {
      utsav: `नमस्कार [Name] 🙏,\n\n${session.communityName} के आगामी उत्सव में आपको और आपके परिवार को हार्दिक निमंत्रण है। आपकी उपस्थिति हमारे ${t('workspace') || 'संस्थान'} को धन्य करेगी।\n\nकृपया 'YES' लिखकर पुष्टि करें! 🚩`,
      chanda: `नमस्कार [Name] 🙏,\n\nयह ${session.communityName} की ओर से आपके मासिक सेवा योगदान के संबंध में एक विनम्र अनुस्मारक है। आपके सहयोग से हमारा ${t('workspace') || 'संस्थान'} सुचारू रूप से चलता है।\n\nऑनलाइन दान करें या इस संदेश का उत्तर दें। 🌺`,
      meeting: `आवश्यक सूचना [Name] 🙏,\n\n${session.communityName} की एक विशेष समिति की बैठक निर्धारित की गई है। सभी आधिकारिक सदस्यों से उपस्थित होने का अनुरोध है।\n\nहर हर महादेव! 🔱`,
      bani: `सुप्रभात [Name] 🙏,\n\n"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।"\nअपने दिन की शुरुआत सकारात्मक ऊर्जा के साथ करें। ईश्वर आप पर कृपा करें।\n\n- ${session.communityName} 🛕`
    }
  };

  useEffect(() => {
    pushToDataLayer('view_sandesh_desk', { workspace_type: workspaceType });

    const requestsRef = ref(db, `communities/${session.communityId}/prachar_requests`);
    const unsubReq = onValue(requestsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const reqList = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        const myReq = reqList.find(r => r.userId === session.uid);
        setMyRequest(myReq || null);
        if (isManagerOrAdmin) setAllRequests(reqList.sort((a,b) => b.requestedAt - a.requestedAt));
      } else {
        setMyRequest(null);
        setAllRequests([]);
      }
    });

    const memRef = ref(db, `communities/${session.communityId}/members`);
    const guestRef = ref(db, `communities/${session.communityId}/guests`);

    const unsubMem = onValue(memRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loadedMembers = Object.keys(data).map(phone => ({ 
          id: phone, phone: data[phone].phone || phone, email: data[phone].email || null, name: data[phone].name, 
          role: data[phone].role || 'MEMBER', attendanceCount: data[phone].attendanceCount || 0,
          lastDonationTimestamp: data[phone].lastDonationTimestamp || null, type: 'Member' 
        })).filter(m => m.phone && m.phone.length >= 10);

        setMembers(loadedMembers);
        localStorage.setItem(`sb_prachar_members_${session.communityId}`, JSON.stringify(loadedMembers));
      }
    });

    const unsubGuest = onValue(guestRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loadedGuests = Object.keys(data).map(key => ({ 
          id: key, phone: data[key].phone, email: data[key].email || null, name: data[key].name, 
          status: data[key].status || 'NEW_LEAD', category: data[key].category || 'GENERAL', type: 'Guest' 
        })).filter(g => g.phone && g.phone.length >= 10);

        setGuests(loadedGuests);
        localStorage.setItem(`sb_prachar_guests_${session.communityId}`, JSON.stringify(loadedGuests));
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);

    return () => { unsubReq(); unsubMem(); unsubGuest(); clearTimeout(failsafe); };
  }, [session.communityId, isManagerOrAdmin, session.uid, workspaceType]);

  const logAudit = async (actionType, description) => {
    if (!isOnline) return; 
    try {
      await set(push(ref(db, `communities/${session.communityId}/audit_logs`)), {
        managerName: session.userName, actionType, description, timestamp: Date.now()
      });
    } catch (e) {}
  };

  // Global In-App Notification Engine
  const notifyWorkspaceMembers = async (method, msgContent, targetList) => {
    if (!isOnline || !activeChannels.push) return;
    try {
      const updates = {};
      const ts = Date.now();
      const snippet = msgContent.length > 50 ? msgContent.substring(0, 50) + "..." : msgContent;
      const notifMsg = `📢 Official Broadcast: "${snippet}"`;

      targetList.forEach(m => {
        if (m.type === 'Member') {
          const notifId = push(ref(db, `communities/${session.communityId}/notifications/${m.id}`)).key;
          updates[`communities/${session.communityId}/notifications/${m.id}/${notifId}`] = {
            id: notifId, title: `Message from ${session.communityName}`, message: notifMsg, timestamp: ts, type: "LOG", isRead: false
          };
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
      }
    } catch (e) { console.error("Global notification failed", e); }
  };

  // Track Successful Broadcast Execution in Firebase Usage Logs (Optimized Path)
  const trackSandeshSent = () => {
    if (isOnline) {
      update(ref(db, `communities/${session.communityId}/usage_tracking`), { sandesh_sent: increment(1) }).catch(e => console.error(e));
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!requestReason.trim()) return alert(t('err_all_fields_req') || "Please provide a reason.");

    setIsProcessing(true);
    try {
      const reqRef = ref(db, `communities/${session.communityId}/prachar_requests/${session.uid}`);
      await set(reqRef, {
        userId: session.uid, userName: session.userName, userPhone: session.userPhone || session.uid,
        status: 'PENDING', reason: requestReason.trim(), requestedAt: Date.now()
      });

      logAudit("PRACHAR_ACCESS_REQUESTED", `${session.userName} requested temporary Broadcast Desk access. Reason: ${requestReason.trim()}`);
      setRequestReason('');
    } catch (err) { alert((t('error') || "Error submitting request") + ": " + err.message); } finally { setIsProcessing(false); }
  };

  const handleProcessRequest = async (e) => {
    e.preventDefault();
    const { req, action, duration, note } = adminActionModal;

    setIsProcessing(true);
    try {
      const reqRef = ref(db, `communities/${session.communityId}/prachar_requests/${req.userId}`);
      const updates = {};

      if (action === 'APPROVE') {
        updates['status'] = 'APPROVED';
        updates['approvedUntil'] = Date.now() + (duration * 3600000); 
        updates['adminNote'] = note.trim();
        updates['processedBy'] = session.userName;
        updates['processedAt'] = Date.now();
        logAudit("PRACHAR_ACCESS_APPROVED", `${session.userName} APPROVED broadcast access for ${req.userName} for ${duration} hours.`);
      } else {
        if (!note.trim()) throw new Error(t('err_all_fields_req') || "Rejection reason is required.");
        updates['status'] = 'REJECTED';
        updates['rejectionReason'] = note.trim();
        updates['processedBy'] = session.userName;
        updates['processedAt'] = Date.now();
        logAudit("PRACHAR_ACCESS_REJECTED", `${session.userName} REJECTED broadcast access for ${req.userName}. Reason: ${note}`);
      }

      await update(reqRef, updates);
      setAdminActionModal({ show: false, req: null, action: 'APPROVE', duration: 24, note: '' });
    } catch (err) { alert((t('error') || "Error processing request") + ": " + err.message); } finally { setIsProcessing(false); }
  };

  const handleApplyTemplate = (type) => {
    const templates = localizedTemplates[language] || localizedTemplates['en'];
    setMessageText(templates[type]);
    pushToDataLayer('apply_message_template', { template_type: type, language: language });
  };

  const insertTag = (tag) => {
    setMessageText(prev => prev + tag);
  };

  const getTargetAudience = () => {
    if (audience === 'ALL_MEMBERS') return members;
    if (audience === 'MANAGERS') return members.filter(m => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(m.role));
    if (audience === 'VIP_GUESTS') return guests.filter(g => g.category === 'VIP');
    if (audience === 'LAPSED_DONORS') {
      const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
      return members.filter(m => !m.lastDonationTimestamp || m.lastDonationTimestamp < threeMonthsAgo);
    }
    if (audience === 'HIGHLY_ENGAGED') return members.filter(m => m.attendanceCount > 5);
    if (audience === 'NEW_LEADS') return guests.filter(g => ['NEW_LEAD', 'CONTACTED'].includes(g.status));

    return members;
  };

  const targetAudienceList = getTargetAudience();

  const validPhones = targetAudienceList.filter(p => p.phone && p.phone.length > 6).length;
  const validEmails = targetAudienceList.filter(p => p.email && p.email.includes('@')).length;
  const validAppUsers = targetAudienceList.filter(p => p.type === 'Member').length;

  const pracharInsights = useMemo(() => {
    const insights = [];
    const text = messageText.toLowerCase();
    if (!text.trim()) return insights;

    const hasCTA = ['rsvp', 'reply', 'donate', 'http', 'www.', '.com', 'join', 'call', 'yes', 'দান', 'যোগাযোগ', 'हां'].some(w => text.includes(w));
    if (!hasCTA) {
      insights.push({ type: 'warning', text: "Marketing Tip: Your message lacks a Call-to-Action. Ask devotees to 'Reply YES' or click a link to increase engagement." });
    }

    if (text.length > 160 && activeChannels.sms) {
      insights.push({ type: 'alert', text: "Attention: Message is over 160 chars. This costs 2+ SMS credits per person. Keep it concise!" });
    }

    if (!text.includes('[name]')) {
      insights.push({ type: 'suggestion', text: "Tip: Personalize your broadcast! Tap the [Name] tag below to insert the recipient's name automatically." });
    }

    return insights;
  }, [messageText, activeChannels.sms]);

  const maskPhone = (phone) => {
    if (!phone || phone.length < 6) return phone;
    return phone.substring(0, phone.length - 6) + '******';
  };

  const formatPhoneForWA = (phone) => {
    let clean = phone.replace(/\D/g, '');
    if (clean.length === 11 && clean.startsWith('01')) clean = '88' + clean; 
    return clean;
  };

  const parseMessageTags = (text, person) => {
    if (!person) return text;
    return text.replace(/\[Name\]/gi, person.name ? person.name.split(' ')[0] : t('registered_devotee') || 'Devotee')
               .replace(/\[Workspace\]/gi, session.communityName);
  };

  const getCleanMessage = () => {
    return messageText.replace(/\[Name\]/gi, t('registered_devotee') || 'Devotee').replace(/\[Workspace\]/gi, session.communityName);
  };

  const handleBulkSMS = () => {
    if (!hasAccess || validPhones === 0 || !messageText) return;
    if (!checkQuota('free_sandesh_limit')) return; 

    const cleanMsg = getCleanMessage();
    const numbers = targetAudienceList.filter(p => p.phone).map(p => p.phone).join(',');

    logAudit("BROADCAST_SMS", `Initiated Bulk SMS to ${validPhones} contacts.`);
    pushToDataLayer('campaign_start', { audience_segment: audience, method: 'SMS' });
    if (activeChannels.push) notifyWorkspaceMembers('SMS', cleanMsg, targetAudienceList);

    trackSandeshSent(); 

    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = userAgent.indexOf("iphone") > -1 || userAgent.indexOf("ipad") > -1;
    const separator = isIOS ? '&' : '?';

    window.location.href = `sms:${numbers}${separator}body=${encodeURIComponent(cleanMsg)}`;
  };

  const handleBulkWhatsApp = () => {
    if (!hasAccess || validPhones === 0 || !messageText) return;
    if (!checkQuota('free_sandesh_limit')) return; 

    const cleanMsg = getCleanMessage();

    logAudit("BROADCAST_WHATSAPP", `Initiated Bulk WhatsApp Broadcast.`);
    pushToDataLayer('campaign_start', { audience_segment: audience, method: 'WhatsApp' });
    if (activeChannels.push) notifyWorkspaceMembers('WhatsApp', cleanMsg, targetAudienceList);

    trackSandeshSent(); 

    window.open(`https://wa.me/?text=${encodeURIComponent(cleanMsg)}`, '_blank');
  };

  const handleBulkEmail = () => {
    if (!hasAccess || validEmails === 0 || !messageText) return;
    if (!checkQuota('free_sandesh_limit')) return; 

    const cleanMsg = getCleanMessage();
    const emails = targetAudienceList.filter(p => p.email && p.email.includes('@')).map(p => p.email).join(',');

    logAudit("BROADCAST_EMAIL", `Initiated Bulk Email to ${validEmails} contacts.`);
    pushToDataLayer('campaign_start', { audience_segment: audience, method: 'Email' });
    if (activeChannels.push) notifyWorkspaceMembers('Email', cleanMsg, targetAudienceList);

    trackSandeshSent(); 

    window.location.href = `mailto:?bcc=${emails}&subject=${encodeURIComponent(`Official Update from ${session.communityName}`)}&body=${encodeURIComponent(cleanMsg)}`;
  };

  const handleInAppPushOnly = () => {
    if (!hasAccess || validAppUsers === 0 || !messageText) return;
    if (!checkQuota('free_sandesh_limit')) return; 

    const cleanMsg = getCleanMessage();

    logAudit("BROADCAST_PUSH", `Initiated In-App Push to ${validAppUsers} users.`);
    pushToDataLayer('campaign_start', { audience_segment: audience, method: 'Push' });
    notifyWorkspaceMembers('Push Notification', cleanMsg, targetAudienceList);

    trackSandeshSent(); 

    alert(`✅ In-App Push Notification successfully queued for ${validAppUsers} registered members!`);
  };

  const handleCopyNumbers = () => {
    if (!hasAccess || validPhones === 0) return;
    const numbers = targetAudienceList.filter(p => p.phone).map(p => p.phone).join(', ');
    navigator.clipboard.writeText(numbers);
    setCopied(true);

    logAudit("BROADCAST_COPY", `Copied ${validPhones} numbers for Broadcast List.`);
    pushToDataLayer('generate_lead', { method: 'Clipboard_Export', count: validPhones });

    setTimeout(() => setCopied(false), 3000);
  };

  const handleIndividualWA = (phone, name) => {
    if (!hasAccess) return;
    const parsedMsg = parseMessageTags(messageText, { name });
    const waUrl = `https://wa.me/${formatPhoneForWA(phone)}?text=${encodeURIComponent(parsedMsg)}`;
    window.open(waUrl, '_blank');
    pushToDataLayer('share', { method: 'WhatsApp_Individual', content_type: 'Personalized_Outreach' });
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  const pendingRequestsCount = allRequests.filter(r => r.status === 'PENDING').length;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 sm:space-y-8 fade-in ring-1 ring-black/5">

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg animate-pulse">
          <WifiOff size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Offline: WhatsApp & SMS still available via cellular network.</span>
        </div>
      )}

      {!isManagerOrAdmin && hasAccess && (
        <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2 text-emerald-800">
            <Timer size={18} className="shrink-0"/>
            <span className="text-xs font-black uppercase tracking-widest">Temporary Broadcast Access Granted</span>
          </div>
          <span className="text-[10px] font-bold bg-white px-3 py-1.5 rounded-lg border border-emerald-100 text-emerald-700 shadow-sm">
            Expires: {new Date(myRequest.approvedUntil).toLocaleString()}
          </span>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Megaphone className="text-sanatani-orange" size={26} /> {t('nav_prachar') || 'Dharma Prachar Desk'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Omnichannel broadcasting & marketing orchestration.</p>
             {!hasAccess && (
               <span className="bg-gray-100 text-gray-500 text-[9px] font-black px-2 py-0.5 rounded border border-gray-200 flex items-center gap-1 uppercase tracking-widest"><EyeOff size={10}/> Read Only</span>
             )}
          </div>
        </div>
        <div className="flex items-center gap-3">

          <button 
             onClick={() => { setShowGuide(!showGuide); if(!showGuide) pushToDataLayer('open_quick_guide', { module: 'SandeshDesk' }); }} 
             className="bg-white border border-gray-200 p-3 rounded-2xl hover:bg-gray-50 transition-colors shadow-sm text-blue-600"
             title={t('quick_guide') || "Quick Guide"}
          >
             <HelpCircle size={20}/>
          </button>

          {isManagerOrAdmin && (
            <button onClick={() => setShowRequestManager(true)} className="relative bg-white border border-gray-200 p-3 rounded-2xl hover:bg-gray-50 transition-colors shadow-sm" title="Access Requests">
              <ShieldCheck size={20} className="text-gray-600"/>
              {pendingRequestsCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">{pendingRequestsCount}</span>}
            </button>
          )}

          <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 px-5 py-2.5 rounded-2xl text-center shadow-sm">
             <p className="text-[10px] font-black text-sanatani-orange uppercase tracking-widest mb-0.5">Active Audience</p>
             <p className="text-xl font-black text-gray-900 leading-none">{targetAudienceList.length} <span className="text-xs text-gray-400 font-bold">Contacts</span></p>
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-5 sm:p-6 rounded-2xl shadow-inner animate-in slide-in-from-top-2 relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors"><X size={18}/></button>
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><Lightbulb size={18} className="text-blue-500"/> {t('quick_guide_title') || 'Command Center Guide'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Filter size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">1. Smart Targeting</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Don't spam! Use behavioral filters to target only 'Lapsed Donors' or 'VIP Guests' based on their past activity.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Radio size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">2. Omnichannel Toggle</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Select how you want to reach them. Ensure 'App Push' is checked to guarantee free delivery to users with the app installed.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Send size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">3. Launch Dispatch</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Click the execute buttons below to seamlessly hand off the message to your device's native WhatsApp, SMS, or Email app for zero-cost delivery.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN MARKETING DESK GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 sm:gap-8">

        <div className="xl:col-span-3 space-y-6 flex flex-col">

          {hasAccess ? (
            <>
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/5 animate-in fade-in">
                <div className="flex justify-between items-center mb-4">
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Filter size={14}/> 1. Target Audience</label>
                   <span className="text-[9px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{targetAudienceList.length} Selected</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <button onClick={() => setAudience('ALL_MEMBERS')} className={`py-3 px-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 border-2 ${audience === 'ALL_MEMBERS' ? 'bg-orange-50 border-sanatani-orange text-sanatani-orange shadow-sm' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'}`}>
                    <Users size={16} /> All {t('members') || 'Members'}
                  </button>
                  <button onClick={() => setAudience('MANAGERS')} className={`py-3 px-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 border-2 ${audience === 'MANAGERS' ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'}`}>
                    <ShieldCheck size={16} /> Committee
                  </button>
                  <button onClick={() => setAudience('LAPSED_DONORS')} className={`py-3 px-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 border-2 ${audience === 'LAPSED_DONORS' ? 'bg-red-50 border-red-500 text-red-600 shadow-sm' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'}`}>
                    <History size={16} /> Lapsed Donors
                  </button>
                  <button onClick={() => setAudience('HIGHLY_ENGAGED')} className={`py-3 px-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 border-2 ${audience === 'HIGHLY_ENGAGED' ? 'bg-green-50 border-green-500 text-green-600 shadow-sm' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'}`}>
                    <Award size={16} /> Highly Engaged
                  </button>
                  <button onClick={() => setAudience('NEW_LEADS')} className={`py-3 px-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 border-2 ${audience === 'NEW_LEADS' ? 'bg-purple-50 border-purple-500 text-purple-600 shadow-sm' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'}`}>
                    <UserPlus size={16} /> New Leads
                  </button>
                  <button onClick={() => setAudience('VIP_GUESTS')} className={`py-3 px-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1.5 border-2 ${audience === 'VIP_GUESTS' ? 'bg-amber-50 border-amber-500 text-amber-600 shadow-sm' : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'}`}>
                    <Star size={16} /> VIP Guests
                  </button>
                </div>
              </div>

              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/5 animate-in fade-in">
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Radio size={14}/> 2. Select Dispatch Channels</label>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

                   <label className={`cursor-pointer p-3 border rounded-xl flex items-center gap-3 transition-all ${activeChannels.push ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                     <input type="checkbox" checked={activeChannels.push} onChange={() => setActiveChannels(p => ({...p, push: !p.push}))} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"/>
                     <div className="flex flex-col">
                       <span className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center gap-1"><Bell size={12}/> App Push</span>
                       <span className="text-[9px] font-bold text-indigo-600">{validAppUsers} Users</span>
                     </div>
                   </label>

                   <label className={`cursor-pointer p-3 border rounded-xl flex items-center gap-3 transition-all ${activeChannels.whatsapp ? 'bg-green-50 border-green-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                     <input type="checkbox" checked={activeChannels.whatsapp} onChange={() => setActiveChannels(p => ({...p, whatsapp: !p.whatsapp}))} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 cursor-pointer"/>
                     <div className="flex flex-col">
                       <span className="text-xs font-black text-green-900 uppercase tracking-widest flex items-center gap-1"><MessageSquare size={12}/> WhatsApp</span>
                       <span className="text-[9px] font-bold text-green-600">{validPhones} Valid</span>
                     </div>
                   </label>

                   <label className={`cursor-pointer p-3 border rounded-xl flex items-center gap-3 transition-all ${activeChannels.sms ? 'bg-gray-800 border-gray-900 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                     <input type="checkbox" checked={activeChannels.sms} onChange={() => setActiveChannels(p => ({...p, sms: !p.sms}))} className="w-4 h-4 text-gray-500 rounded focus:ring-gray-500 cursor-pointer"/>
                     <div className="flex flex-col">
                       <span className={`text-xs font-black uppercase tracking-widest flex items-center gap-1 ${activeChannels.sms ? 'text-white' : 'text-gray-600'}`}><Smartphone size={12}/> SMS</span>
                       <span className={`text-[9px] font-bold ${activeChannels.sms ? 'text-gray-400' : 'text-gray-500'}`}>{validPhones} Valid</span>
                     </div>
                   </label>

                   <label className={`cursor-pointer p-3 border rounded-xl flex items-center gap-3 transition-all ${activeChannels.email ? 'bg-orange-50 border-orange-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                     <input type="checkbox" checked={activeChannels.email} onChange={() => setActiveChannels(p => ({...p, email: !p.email}))} className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"/>
                     <div className="flex flex-col">
                       <span className="text-xs font-black text-orange-900 uppercase tracking-widest flex items-center gap-1"><Mail size={12}/> Email</span>
                       <span className="text-[9px] font-bold text-orange-600">{validEmails} Valid</span>
                     </div>
                   </label>

                 </div>
              </div>

              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/5 relative animate-in fade-in">

                <div className="flex justify-between items-end mb-4">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><MessageSquare size={14}/> 3. Compose Announcement</label>
                  <div className="flex gap-2">
                     <button onClick={() => insertTag('[Name]')} className="text-[9px] font-black uppercase tracking-widest bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded border border-gray-200 transition-colors">+ [Name]</button>
                     <button onClick={() => insertTag('[Workspace]')} className="text-[9px] font-black uppercase tracking-widest bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded border border-gray-200 transition-colors">+ [Workspace]</button>
                  </div>
                </div>

                <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center shrink-0 mr-2">Templates:</span>
                  <button type="button" onClick={() => handleApplyTemplate('utsav')} className="shrink-0 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 text-gray-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1"><Flame size={10}/> Utsav</button>
                  <button type="button" onClick={() => handleApplyTemplate('chanda')} className="shrink-0 bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-200 text-gray-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1"><AlertCircle size={10}/> Chanda</button>
                  <button type="button" onClick={() => handleApplyTemplate('meeting')} className="shrink-0 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 text-gray-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1"><Users size={10}/> Meeting</button>
                </div>

                <textarea 
                  rows="6"
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Type your announcement here... Use [Name] to automatically personalize the message for each devotee."
                  className="w-full p-4 sm:p-5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-orange-50 focus:border-sanatani-orange transition-all resize-none shadow-inner"
                ></textarea>

                {pracharInsights.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {pracharInsights.map((insight, idx) => (
                      <div key={idx} className={`p-3 rounded-lg flex items-start gap-2 text-xs font-bold ${insight.type === 'warning' ? 'bg-orange-50 text-orange-800 border border-orange-200' : insight.type === 'alert' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
                        <BrainCircuit size={16} className="shrink-0 mt-0.5"/>
                        <p className="leading-relaxed">{insight.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center mt-4 px-1 border-t border-gray-100 pt-4">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                    <ShieldAlert size={12} className="text-green-500" /> Client-Side Execution
                  </p>
                  <div className="text-right">
                    <p className={`text-xs font-black ${messageText.length > 160 && activeChannels.sms ? 'text-red-500' : 'text-gray-500'}`}>
                      {messageText.length} Chars
                    </p>
                    {activeChannels.sms && <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Est. Cost: {Math.ceil(messageText.length / 160) || 1} SMS Credit(s)</p>}
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/5 animate-in fade-in">
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                   <span className="flex items-center gap-2"><Send size={14}/> 4. Launch Dispatcher</span>
                   <span className="text-sanatani-orange">Zero-Cost Infrastructure Active</span>
                 </label>

                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">

                   <button 
                     onClick={handleInAppPushOnly}
                     disabled={!messageText || validAppUsers === 0 || !activeChannels.push}
                     className={`py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5 ${activeChannels.push && messageText && validAppUsers > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md' : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'}`}
                   >
                     <Bell size={16} /> Push App
                   </button>

                   <button 
                     onClick={handleBulkWhatsApp}
                     disabled={!messageText || validPhones === 0 || !activeChannels.whatsapp}
                     className={`py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5 ${activeChannels.whatsapp && messageText && validPhones > 0 ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-md' : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'}`}
                   >
                     <MessageSquare size={16} /> WhatsApp
                   </button>

                   <button 
                     onClick={handleBulkEmail}
                     disabled={!messageText || validEmails === 0 || !activeChannels.email}
                     className={`py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5 ${activeChannels.email && messageText && validEmails > 0 ? 'bg-orange-500 text-white hover:bg-orange-600 hover:shadow-md' : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'}`}
                   >
                     <Mail size={16} /> Native Email
                   </button>

                   <button 
                     onClick={handleBulkSMS}
                     disabled={!messageText || validPhones === 0 || !activeChannels.sms}
                     className={`py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5 ${activeChannels.sms && messageText && validPhones > 0 ? 'bg-gray-900 text-white hover:bg-black hover:shadow-md' : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'}`}
                   >
                     <Smartphone size={16} /> Native SMS
                   </button>

                 </div>

                 <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                   <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest max-w-[70%]">
                     Emails map via device BCC. SMS/WA use native intents. This bypasses telecom APIs, keeping platform costs at $0.
                   </p>
                   <button 
                     onClick={handleCopyNumbers}
                     disabled={validPhones === 0}
                     title="Copy Numbers to Clipboard"
                     className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                   >
                     {copied ? 'Copied!' : 'Copy Nos.'}
                   </button>
                 </div>
              </div>
            </>
          ) : (
            <div className="flex-1 bg-white p-8 sm:p-10 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-center animate-in zoom-in-95 ring-1 ring-black/5">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-red-500"></div>

              <div className="w-20 h-20 bg-orange-50 text-sanatani-orange rounded-full flex items-center justify-center mb-6 shadow-inner border border-orange-100">
                {myRequest?.status === 'PENDING' ? <Clock size={40} className="animate-pulse"/> : <Lock size={40} />}
              </div>

              <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Restricted Marketing Desk</h2>
              <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed max-w-md">
                Broadcast access allows you to send mass messages to the entire community. This requires committee approval.
              </p>

              {myRequest?.status === 'PENDING' ? (
                <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl w-full max-w-md">
                  <h3 className="text-blue-800 font-black flex items-center gap-2 mb-2"><Timer size={18}/> Request Under Review</h3>
                  <p className="text-xs font-bold text-blue-600 leading-snug">The Admins have been notified. Please wait for them to approve your access duration.</p>
                </div>
              ) : myRequest?.status === 'REJECTED' ? (
                <div className="space-y-6 w-full max-w-md">
                  <div className="bg-red-50 border border-red-200 p-6 rounded-2xl">
                    <h3 className="text-red-800 font-black flex items-center gap-2 mb-2"><XCircle size={18}/> Request Denied</h3>
                    <p className="text-xs font-bold text-red-600 leading-snug">Reason: {myRequest.rejectionReason}</p>
                  </div>
                  <button onClick={() => setMyRequest(null)} className="text-xs font-black text-gray-500 hover:text-gray-900 underline uppercase tracking-widest">Submit New Request</button>
                </div>
              ) : myRequest?.status === 'APPROVED' && myRequest?.approvedUntil < Date.now() ? (
                <div className="space-y-6 w-full max-w-md">
                  <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-2xl">
                    <h3 className="text-yellow-800 font-black flex items-center gap-2 mb-2"><CalendarClock size={18}/> Access Expired</h3>
                    <p className="text-xs font-bold text-yellow-700 leading-snug">Your previous temporary access has expired. Please submit a new request below.</p>
                  </div>
                  <button onClick={() => setMyRequest(null)} className="text-xs font-black text-gray-500 hover:text-gray-900 underline uppercase tracking-widest">Submit New Request</button>
                </div>
              ) : (
                <form onSubmit={handleSubmitRequest} className="space-y-4 w-full max-w-md">
                  <div className="text-left">
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Reason for Access *</label>
                    <textarea 
                      required rows="3"
                      value={requestReason} onChange={e => setRequestReason(e.target.value)}
                      placeholder="e.g. Need to invite everyone to the Sunday Aarti..."
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-orange-50 focus:border-sanatani-orange outline-none transition-all shadow-sm resize-none"
                    />
                  </div>
                  <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2 disabled:opacity-50">
                    {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Submit Access Request
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: READ-ONLY PREVIEW & DATA-MASKED QUEUE */}
        <div className="xl:col-span-2 bg-gray-50 border border-gray-200 rounded-3xl flex flex-col h-[750px] shadow-inner overflow-hidden">

          <div className="flex bg-white border-b border-gray-200 p-2 shrink-0">
            <button onClick={() => setActiveView('PREVIEW')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex justify-center items-center gap-2 ${activeView === 'PREVIEW' ? 'bg-gray-100 text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
              <Eye size={14}/> Live Preview
            </button>
            <button onClick={() => setActiveView('QUEUE')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex justify-center items-center gap-2 ${activeView === 'QUEUE' ? 'bg-gray-100 text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
              <LayoutList size={14}/> Delivery Queue
            </button>
          </div>

          {activeView === 'PREVIEW' && (
            <div className="flex-1 p-6 flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 overflow-hidden">
               <div className="border-[6px] border-gray-900 rounded-[2.5rem] h-[550px] w-full max-w-[280px] relative bg-[#efeae2] flex flex-col overflow-hidden shadow-2xl ring-1 ring-black/10">
                  <div className="absolute top-0 inset-x-0 h-5 bg-gray-900 rounded-b-xl w-32 mx-auto z-10"></div>

                  <div className="bg-[#00a884] text-white p-3 flex items-center gap-3 pt-8 shadow-md relative z-0">
                     <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center shrink-0"><Users size={18}/></div>
                     <div className="leading-tight truncate">
                        <p className="font-bold text-[13px] truncate">{session.communityName || 'Sanatani Mandir'}</p>
                        <p className="text-[9px] text-white/80">Tap here for group info</p>
                     </div>
                  </div>

                  <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 relative scrollbar-hide">
                     <div className="bg-white/60 text-gray-500 text-[10px] font-bold py-1 px-3 rounded-lg self-center shadow-sm backdrop-blur-sm mt-2">Today</div>

                     <div className="bg-white text-gray-800 p-2.5 rounded-xl rounded-tl-none shadow-sm max-w-[85%] self-start text-[13px] leading-relaxed">
                        <p>Jay Siya Ram! 🙏</p>
                        <p className="text-[9px] text-gray-400 text-right mt-1">11:58 AM</p>
                     </div>

                     <div className="bg-[#d9fdd3] text-gray-900 p-3 rounded-xl rounded-tr-none shadow-sm max-w-[90%] self-end text-[13px] leading-relaxed relative border border-green-200/50">
                        {messageText ? (
                          <p className="whitespace-pre-wrap">{parseMessageTags(messageText, targetAudienceList[0] || { name: 'Devotee' })}</p>
                        ) : (
                          <p className="text-gray-400 italic">Start typing your message to see the live preview...</p>
                        )}
                        <p className="text-[9px] text-green-700/60 text-right mt-1.5 flex items-center justify-end gap-1">
                          Just now <Check size={10} className="text-blue-500"/>
                        </p>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeView === 'QUEUE' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">

              {!hasAccess && (
                 <div className="absolute inset-x-0 top-0 z-10 bg-gray-900/90 text-white p-2.5 flex items-center justify-center gap-2 backdrop-blur-sm text-[10px] font-black uppercase tracking-widest shadow-md">
                   <EyeOff size={14} className="text-orange-400"/> Privacy Mask Active
                 </div>
              )}

              <div className={`p-4 border-b border-gray-200 bg-white shrink-0 ${!hasAccess ? 'pt-10' : ''}`}>
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                  <Send size={14} className="text-sanatani-orange"/> Queue Status
                </h3>
                <p className="text-[10px] text-gray-500 font-bold mt-1">Ready to send to {targetAudienceList.length} total matched contacts.</p>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
                 {targetAudienceList.length > 0 ? (
                     targetAudienceList.map((person, idx) => (
                        <div key={idx} className={`bg-white p-4 rounded-2xl border flex items-center justify-between transition-all ${hasAccess ? 'border-gray-100 hover:border-green-200 hover:shadow-sm group' : 'border-dashed border-gray-200 opacity-80'}`}>
                            <div className="truncate pr-3">
                                <p className={`text-sm font-bold truncate ${!hasAccess ? 'text-gray-600' : 'text-gray-900'}`}>{person.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${person.role === 'ADMIN' ? 'bg-red-50 text-red-600' : person.role === 'MANAGER' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{person.role || person.status || 'MEMBER'}</span>
                                  <p className="text-[10px] text-gray-400 font-mono font-bold">
                                    {hasAccess ? person.phone || 'No Phone' : maskPhone(person.phone)}
                                  </p>
                                </div>
                            </div>

                            <button 
                                onClick={() => handleIndividualWA(person.phone, person.name)}
                                disabled={!messageText || !hasAccess || !person.phone}
                                className="bg-green-50 text-green-600 hover:bg-green-600 hover:text-white p-3 rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-green-50 disabled:hover:text-green-600 shrink-0 shadow-sm hover:shadow-md"
                                title={hasAccess ? "Send Personalized WhatsApp" : "Access Required"}
                            >
                                {hasAccess ? <MessageSquare size={16} /> : <Lock size={16}/>}
                            </button>
                        </div>
                     ))
                 ) : (
                     <div className="text-center p-12 flex flex-col items-center justify-center h-full">
                       <Users size={32} className="text-gray-300 mb-3"/>
                       <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No valid contacts found in this segment.</p>
                     </div>
                 )}
              </div>
            </div>
          )}

        </div>
      </div>

      {showRequestManager && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-blue-500 ring-1 ring-white/20 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <ShieldCheck size={20} className="text-blue-600"/> Broadcast Access Requests
              </h3>
              <button onClick={() => { setShowRequestManager(false); setAdminActionModal({ show: false, req: null, action: 'APPROVE', duration: 24, note: '' }); }} className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"><X size={16}/></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {allRequests.filter(r => r.status === 'PENDING').length === 0 ? (
                 <div className="text-center py-10">
                   <CheckCircle2 size={40} className="mx-auto text-gray-300 mb-3"/>
                   <p className="text-sm font-bold text-gray-500">No pending access requests.</p>
                 </div>
              ) : (
                 allRequests.filter(r => r.status === 'PENDING').map(req => (
                   <div key={req.id} className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm space-y-4">
                     <div>
                       <h4 className="font-black text-gray-900 text-sm flex items-center gap-2">{req.userName} <span className="bg-gray-100 text-gray-500 text-[9px] px-2 py-0.5 rounded uppercase tracking-widest">{req.userPhone}</span></h4>
                       <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest flex items-center gap-1"><Clock size={10}/> Requested: {new Date(req.requestedAt).toLocaleString()}</p>
                     </div>
                     <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm font-bold text-gray-700 italic">
                       "{req.reason}"
                     </div>

                     {adminActionModal.req?.id === req.id ? (
                        <form onSubmit={handleProcessRequest} className="bg-blue-50 border border-blue-200 p-4 rounded-xl mt-4 animate-in fade-in space-y-4">
                           {adminActionModal.action === 'APPROVE' ? (
                             <>
                               <div>
                                 <label className="block text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1.5">Access Duration</label>
                                 <select value={adminActionModal.duration} onChange={e => setAdminActionModal({...adminActionModal, duration: parseInt(e.target.value)})} className="w-full p-3 bg-white border border-blue-200 rounded-lg text-xs font-bold outline-none cursor-pointer">
                                   <option value={1}>1 Hour (Quick Broadcast)</option>
                                   <option value={12}>12 Hours (Event Day)</option>
                                   <option value={24}>24 Hours (Full Day)</option>
                                   <option value={168}>7 Days (Festival Week)</option>
                                 </select>
                               </div>
                               <div>
                                 <label className="block text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1.5">Admin Note (Optional)</label>
                                 <input type="text" value={adminActionModal.note} onChange={e => setAdminActionModal({...adminActionModal, note: e.target.value})} className="w-full p-3 bg-white border border-blue-200 rounded-lg text-xs font-bold outline-none" placeholder="e.g. Please only message the VIP segment."/>
                               </div>
                             </>
                           ) : (
                             <div>
                               <label className="block text-[10px] font-black text-red-700 uppercase tracking-widest mb-1.5">Rejection Reason *</label>
                               <input required type="text" value={adminActionModal.note} onChange={e => setAdminActionModal({...adminActionModal, note: e.target.value})} className="w-full p-3 bg-white border border-red-200 rounded-lg text-xs font-bold outline-none focus:border-red-500" placeholder="e.g. Broadcasts are reserved for managers."/>
                             </div>
                           )}
                           <div className="flex gap-2">
                             <button type="button" onClick={() => setAdminActionModal({ show: false, req: null, action: 'APPROVE', duration: 24, note: '' })} className="flex-1 bg-white border border-gray-200 text-gray-600 text-xs font-black py-2.5 rounded-lg uppercase tracking-widest hover:bg-gray-50">Cancel</button>
                             <button type="submit" disabled={isProcessing} className={`flex-1 text-white text-xs font-black py-2.5 rounded-lg uppercase tracking-widest shadow-sm flex justify-center items-center gap-2 disabled:opacity-50 ${adminActionModal.action === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                               {isProcessing ? <Loader2 size={14} className="animate-spin"/> : (adminActionModal.action === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection')}
                             </button>
                           </div>
                        </form>
                     ) : (
                       <div className="flex gap-2 pt-2">
                         <button onClick={() => setAdminActionModal({ show: true, req, action: 'APPROVE', duration: 24, note: '' })} className="flex-1 bg-green-50 text-green-700 hover:bg-green-600 hover:text-white border border-green-200 text-xs font-black py-2.5 rounded-xl uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 shadow-sm">
                           <CheckCircle2 size={14}/> Approve
                         </button>
                         <button onClick={() => setAdminActionModal({ show: true, req, action: 'REJECT', duration: 24, note: '' })} className="flex-1 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white border border-red-200 text-xs font-black py-2.5 rounded-xl uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 shadow-sm">
                           <XCircle size={14}/> Deny
                         </button>
                       </div>
                     )}
                   </div>
                 ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
