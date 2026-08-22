import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, update, onValue, set, push, increment } from 'firebase/database'; // ✨ Added increment
import { db } from '../firebase';
import { 
  Flame, BookOpen, Download, Share2, Sparkles, Image as ImageIcon, 
  Languages, LayoutTemplate, CheckCircle2, AlertTriangle, WifiOff, 
  Heart, Loader2, Maximize, Smartphone, Globe2, ShieldCheck, Lock,
  Users, BrainCircuit, RefreshCw, MessageCircle, Copy,
  Send, Clock, XCircle, Timer, CalendarClock, X, EyeOff 
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate'; // ✨ IMPORTED GATEKEEPER HOOK

// ✨ CORE STARTER LIBRARY
const BASE_SHLOKA_LIBRARY = [
  {
    id: 'unity_1', category: 'UNITY',
    sanskrit: "संगच्छध्वं संवदध्वं सं वो मनांसि जानताम्।",
    source: "Rig Veda 10.191.2",
    translations: { en: "Walk together, speak together, let your minds be in harmony.", bn: "একসাথে চলো, একসাথে কথা বলো, তোমাদের মন যেন এক হয়।", hi: "साथ चलो, साथ बोलो, तुम्हारे मन एक हों।" }
  },
  {
    id: 'karma_1', category: 'KARMA',
    sanskrit: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।",
    source: "Bhagavad Gita 2.47",
    translations: { en: "You have a right to perform your prescribed duty, but you are not entitled to the fruits of action.", bn: "কর্মেই তোমার অধিকার, কর্মফলে নয়।", hi: "कर्म पर ही तुम्हारा अधिकार है, कर्म के फलों में कभी नहीं।" }
  },
  {
    id: 'wisdom_1', category: 'WISDOM',
    sanskrit: "सत्यमेव जयते नानृतं।",
    source: "Mundaka Upanishad 3.1.6",
    translations: { en: "Truth alone triumphs; not falsehood.", bn: "সত্যেরই জয় হয়, মিথ্যার নয়।", hi: "सत्य की ही विजय होती है, झूठ की नहीं।" }
  }
];

const THEMES = [
  { id: 'bhagwa', name: 'Saffron Sunset', color1: '#FF512F', color2: '#F09819' },
  { id: 'maroon', name: 'Deep Maroon', color1: '#642B73', color2: '#C6426E' },
  { id: 'navy', name: 'Cosmic Blue', color1: '#141E30', color2: '#243B55' },
  { id: 'emerald', name: 'Sacred Green', color1: '#1D976C', color2: '#93F9B9' }
];

export default function DharmaMarketingAI({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session); // ✨ INITIALIZED GATEKEEPER

  // ✨ ROBUST ROLE CHECK (Case-insensitive)
  const userRole = String(session?.role || '').toUpperCase();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(userRole);

  const [activeCategory, setActiveCategory] = useState('UNITY');
  const [outputLang, setOutputLang] = useState('en');

  // ✨ HYBRID CLOUD-CACHE STATE
  const [customShlokas, setCustomShlokas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_custom_shlokas_${session?.communityId}`)) || []; } catch { return []; }
  });

  const allShlokas = useMemo(() => [...BASE_SHLOKA_LIBRARY, ...customShlokas], [customShlokas]);
  const [selectedShloka, setSelectedShloka] = useState(allShlokas[0]);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingAPI, setIsFetchingAPI] = useState(false);
  const [toast, setToast] = useState(null);
  const canvasRef = useRef(null);

  // ✨ TEMPORARY ACCESS REQUEST STATES
  const [myRequest, setMyRequest] = useState(null);
  const [allRequests, setAllRequests] = useState([]);
  const [requestReason, setRequestReason] = useState('');
  const [adminActionModal, setAdminActionModal] = useState({ show: false, req: null, action: 'APPROVE', duration: 24, note: '' });
  const [showRequestManager, setShowRequestManager] = useState(false);

  // Compute Active Access
  const hasAccess = useMemo(() => {
    if (isManagerOrAdmin) return true;
    if (myRequest?.status === 'APPROVED' && myRequest?.approvedUntil > Date.now()) return true;
    return false;
  }, [isManagerOrAdmin, myRequest]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const logAudit = async (actionType, description) => {
    if (!isOnline) return; 
    try {
      await set(push(ref(db, `communities/${session?.communityId}/audit_logs`)), {
        managerName: session?.userName, actionType, description, timestamp: Date.now()
      });
    } catch (e) {}
  };

  // 🔄 SYNC DATA & REQUESTS
  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_marketing_ai', { workspace_type: workspaceType });

    // Sync Shlokas
    const shlokaRef = ref(db, `communities/${session.communityId}/custom_shlokas`);
    const unsubShlokas = onValue(shlokaRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const arr = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setCustomShlokas(arr);
        localStorage.setItem(`sb_custom_shlokas_${session.communityId}`, JSON.stringify(arr));
      }
    });

    // Sync Access Requests
    const reqRef = ref(db, `communities/${session.communityId}/marketing_requests`);
    const unsubReq = onValue(reqRef, (snapshot) => {
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

    return () => { unsubShlokas(); unsubReq(); };
  }, [session?.communityId, isManagerOrAdmin, workspaceType, session?.uid]);

  // ✨ HTML5 CANVAS RENDERING ENGINE
  useEffect(() => {
    if (!hasAccess || !canvasRef.current || !selectedShloka) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 1080;
    canvas.height = 1080;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, selectedTheme.color1);
    gradient.addColorStop(1, selectedTheme.color2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = '200px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ॐ', canvas.width / 2, 250);

    const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
      const paragraphs = text.split('\n');
      let currentY = y;
      paragraphs.forEach(para => {
        const words = para.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          if (context.measureText(testLine).width > maxWidth && n > 0) {
            context.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
          } else { line = testLine; }
        }
        context.fillText(line, x, currentY);
        currentY += lineHeight;
      });
      return currentY;
    };

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    let textY = wrapText(ctx, selectedShloka.sanskrit, canvas.width / 2, 400, 900, 70);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '40px sans-serif';
    const translationText = selectedShloka.translations[outputLang] || selectedShloka.translations['en'];
    textY = wrapText(ctx, `"${translationText}"`, canvas.width / 2, textY + 60, 900, 55);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'italic 30px sans-serif';
    ctx.fillText(`— ${selectedShloka.source}`, canvas.width / 2, textY + 50);

    const footerY = canvas.height - 100;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, canvas.height - 180, canvas.width, 180);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px sans-serif';
    ctx.fillText(session?.communityName || 'Sanatani Community', canvas.width / 2, footerY);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '25px sans-serif';
    ctx.fillText('Powered by Sanatani Bandhan', canvas.width / 2, footerY + 45);

  }, [selectedShloka, selectedTheme, outputLang, session?.communityName, hasAccess]);

  // ✨ FREE API INTEGRATION (HYBRID CACHING)
  const fetchNewShlokaFromAPI = async () => {
    if (!isOnline) return showToast("You must be online to fetch new Shlokas.", "error");
    setIsFetchingAPI(true);

    try {
      pushToDataLayer('generate_lead', { content_type: 'API_Fetch', method: 'Bhagavad_Gita_API' });

      const ch = Math.floor(Math.random() * 18) + 1;
      const bgVerseCount = [47,72,43,42,29,47,30,28,34,42,55,20,35,27,20,24,28,78];
      const v = Math.floor(Math.random() * bgVerseCount[ch-1]) + 1;

      const response = await fetch(`https://bhagavadgitaapi.in/slok/${ch}/${v}`);
      if (!response.ok) throw new Error("API rate limit reached.");
      const data = await response.json();

      const newId = `gita_${ch}_${v}`;

      if (customShlokas.some(s => s.id === newId)) {
         showToast("Already in your knowledge bank! Generating another...");
         return fetchNewShlokaFromAPI(); 
      }

      const newShloka = {
        id: newId,
        category: 'WISDOM', 
        sanskrit: data.slok,
        source: `Bhagavad Gita ${ch}.${v}`,
        translations: {
          en: data.tej?.ht || data.siva?.et || "Translation unavaliable.",
          hi: data.tej?.hi || data.siva?.hi || "अनुवाद उपलब्ध नहीं है।",
          bn: "(Bengali auto-translation pending. Displaying English) " + (data.tej?.ht || data.siva?.et)
        },
        fetchedAt: Date.now()
      };

      await set(ref(db, `communities/${session?.communityId}/custom_shlokas/${newId}`), newShloka);
      logAudit("SHLOKA_FETCHED", `Admin fetched a new Shloka: Bhagavad Gita ${ch}.${v}`);

      setSelectedShloka(newShloka);
      setActiveCategory('WISDOM');
      showToast("Divine wisdom fetched and saved to your offline vault!");

    } catch (err) {
      showToast("API Busy. Falling back to local Vedic library.", "offline");
    } finally {
      setIsFetchingAPI(false);
    }
  };

  // 🧠 SANATANI BANDHAN MARKETING ASSISTANT
  const marketingInsights = useMemo(() => {
    if (!selectedShloka) return null;
    let tip = "";
    let caption = "";
    const commName = session?.communityName || 'Sanatani Community';

    if (selectedShloka.category === 'UNITY') {
      tip = "Social Proof Strategy: People love to see community. Tag active volunteers in the comments of this post.";
      caption = `✨ "Unity is our greatest strength." ✨\n\nAt ${commName}, we believe in moving forward together. Take a moment today to appreciate the people who support you!\n\n👇 Who are you grateful for today? Tag them below! \n\n#SanatanDharma #Community #SanataniBandhan`;
    } else if (selectedShloka.category === 'KARMA') {
      tip = "Engagement Strategy: Karma quotes perform best on Monday mornings to boost motivation.";
      caption = `🕉️ Start your week with divine focus! 🕉️\n\nFocus on your duties (Seva) and leave the results to the Divine. That is the secret to ultimate peace.\n\n👇 How are you practicing Seva this week? Let us know in the comments!\n\n#BhagavadGita #Karma #SanataniBandhan`;
    } else {
      tip = "Relationship Strategy: Ask an open-ended question to drive Facebook algorithm engagement.";
      caption = `🛕 Timeless Vedic Wisdom 🛕\n\nLet this powerful Shloka guide your thoughts today. True wisdom brings peace to the mind and strength to the soul.\n\n💬 What does this verse mean to you in your daily life? Share your thoughts below!\n\n#VedicWisdom #SanatanDharma #SanataniBandhan`;
    }
    return { tip, caption };
  }, [selectedShloka, session?.communityName]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    pushToDataLayer('share', { method: 'download', content_type: 'Marketing_Banner', item_id: selectedShloka.id });

    const link = document.createElement('a');
    const commNameStr = session?.communityName ? session.communityName.replace(/\s+/g, '_') : 'Banner';
    link.download = `${commNameStr}_${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    showToast("Marketing banner successfully downloaded!");
  };

  // ✨ PAYWALL PROTECTED: PUSH DAILY BANI TO DASHBOARD
  const handleSetDailyBani = async () => {
    if (!checkQuota('free_sandesh_limit')) return; // ✨ PAYWALL GATEKEEPER

    if (!isOnline) return showToast("You must be online to update the app dashboard.", "error");
    setIsProcessing(true);
    try {
      const bannerData = {
        sanskrit: selectedShloka.sanskrit,
        translation: selectedShloka.translations[outputLang] || selectedShloka.translations['en'],
        source: selectedShloka.source,
        updatedAt: Date.now(),
        updatedBy: session?.userName || 'Admin'
      };

      const updates = {};
      updates[`communities/${session?.communityId}/info/dailyBani`] = bannerData;
      if (isOnline) {
        updates[`communities/${session?.communityId}/usage_tracking/sandesh_sent`] = increment(1); // ✨ RECORD USAGE
      }

      await update(ref(db), updates);
      logAudit("DAILY_BANI_SET", `Dashboard Bani updated to: ${selectedShloka.source}`);

      pushToDataLayer('share', { method: 'In-App_Dashboard', content_type: 'Spiritual_Quote' });
      showToast("Daily Bani updated! Devotees will see this upon login.");
    } catch (e) {
      showToast("Error updating dashboard: " + e.message, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(marketingInsights.caption);
    showToast("Highly converting caption copied to clipboard!");
    pushToDataLayer('generate_lead', { method: 'Copy_Caption', content_type: 'Marketing_Copy' });
  };

  // ✨ ACCESS REQUEST SYSTEM
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!requestReason.trim()) return alert("Please provide a reason.");

    setIsProcessing(true);
    try {
      const reqRef = ref(db, `communities/${session?.communityId}/marketing_requests/${session.uid}`);
      await set(reqRef, {
        userId: session.uid, userName: session.userName, userPhone: session.userPhone || session.uid,
        status: 'PENDING', reason: requestReason.trim(), requestedAt: Date.now()
      });
      setRequestReason('');
    } catch (err) { alert("Error: " + err.message); } finally { setIsProcessing(false); }
  };

  const handleProcessRequest = async (e) => {
    e.preventDefault();
    const { req, action, duration, note } = adminActionModal;
    setIsProcessing(true);
    try {
      const reqRef = ref(db, `communities/${session?.communityId}/marketing_requests/${req.userId}`);
      const updates = {};
      if (action === 'APPROVE') {
        updates['status'] = 'APPROVED';
        updates['approvedUntil'] = Date.now() + (duration * 3600000); 
        updates['adminNote'] = note.trim();
        updates['processedBy'] = session.userName;
      } else {
        if (!note.trim()) throw new Error("Rejection reason is required.");
        updates['status'] = 'REJECTED';
        updates['rejectionReason'] = note.trim();
        updates['processedBy'] = session.userName;
      }
      await update(reqRef, updates);
      setAdminActionModal({ show: false, req: null, action: 'APPROVE', duration: 24, note: '' });
    } catch (err) { alert("Error: " + err.message); } finally { setIsProcessing(false); }
  };

  const pendingRequestsCount = allRequests.filter(r => r.status === 'PENDING').length;
  const filteredShlokas = allShlokas.filter(s => s.category === activeCategory);

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 sm:space-y-8 fade-in ring-1 ring-black/5">

      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : (toast.type === 'offline' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400')}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : (toast.type === 'offline' ? <WifiOff size={20}/> : <CheckCircle2 size={20}/>)}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : (toast.type === 'offline' ? 'text-orange-400' : 'text-green-400')}`}>
               {toast.type === 'error' ? 'Error' : (toast.type === 'offline' ? 'Offline Warning' : 'Success')}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Flame className="text-sanatani-orange" size={26} /> Dharma Marketing Studio
          </h2>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Generate authentic branded content & boost engagement.</p>
             {!hasAccess && (
               <span className="bg-gray-100 text-gray-500 text-[9px] font-black px-2 py-0.5 rounded border border-gray-200 flex items-center gap-1 uppercase tracking-widest"><EyeOff size={10}/> Read Only</span>
             )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">

          {isManagerOrAdmin && (
            <button onClick={() => setShowRequestManager(true)} className="relative bg-white border border-gray-200 p-2.5 rounded-xl hover:bg-gray-50 transition-colors shadow-sm mr-2" title="Access Requests">
              <ShieldCheck size={18} className="text-gray-600"/>
              {pendingRequestsCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">{pendingRequestsCount}</span>}
            </button>
          )}

          {hasAccess && (
            <button 
              onClick={fetchNewShlokaFromAPI}
              disabled={isFetchingAPI || !isOnline}
              className="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-black py-2.5 px-4 rounded-xl text-[10px] sm:text-xs uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {isFetchingAPI ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Get API Inspiration
            </button>
          )}

          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
            <Globe2 size={16} className="text-gray-400 ml-2"/>
            <select 
              value={outputLang} 
              onChange={(e) => {
                setOutputLang(e.target.value);
                pushToDataLayer('select_content', { content_type: 'Language_Toggle', language: e.target.value });
              }}
              className="bg-transparent border-none text-[10px] sm:text-xs font-black text-gray-700 uppercase tracking-widest outline-none py-2 pr-4 cursor-pointer"
            >
              <option value="en">English Output</option>
              <option value="bn">Bengali Output</option>
              <option value="hi">Hindi Output</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 sm:gap-8">

        {/* LEFT COLUMN: THE KNOWLEDGE BANK (Visible to everyone) */}
        <div className="xl:col-span-5 flex flex-col space-y-5">

           {/* View-Only Copy Helper */}
           {!hasAccess && (
             <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
               <BookOpen size={20} className="text-blue-500 shrink-0"/>
               <div>
                 <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">Vedic Library Access</h4>
                 <p className="text-[10px] font-bold text-blue-700 leading-relaxed">You have view-only access. You can read and copy these verses to share manually. To use the Marketing Studio, request access below.</p>
               </div>
             </div>
           )}

           <div className="bg-gray-50 p-2 rounded-2xl flex flex-wrap gap-2 border border-gray-200">
             <button onClick={()=>setActiveCategory('UNITY')} className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'UNITY' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-100'}`}><Users size={14} className="inline mr-1"/> Unity</button>
             <button onClick={()=>setActiveCategory('KARMA')} className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'KARMA' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-100'}`}>Karma</button>
             <button onClick={()=>setActiveCategory('WISDOM')} className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'WISDOM' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-100'}`}>Wisdom</button>
           </div>

           <div className="flex-1 overflow-y-auto max-h-[600px] space-y-3 pr-2 scrollbar-hide">
              {filteredShlokas.map((shloka) => (
                <div 
                  key={shloka.id} 
                  onClick={() => setSelectedShloka(shloka)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${selectedShloka.id === shloka.id ? 'bg-orange-50 border-orange-400 shadow-md ring-2 ring-orange-100' : 'bg-white border-gray-200 hover:border-orange-300 hover:shadow-sm'}`}
                >
                  <p className="text-sm font-bold text-gray-900 mb-2 leading-relaxed whitespace-pre-wrap">{shloka.sanskrit}</p>
                  <p className="text-[11px] font-bold text-gray-600 mb-3 leading-snug line-clamp-2">"{shloka.translations[outputLang] || shloka.translations['en']}"</p>
                  <div className="flex justify-between items-center border-t border-gray-100 pt-2">
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><BookOpen size={10}/> {shloka.source}</span>
                     {selectedShloka.id === shloka.id && hasAccess && <span className="bg-orange-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Editing</span>}
                  </div>

                  {/* Manual Copy Button for View-Only Mode */}
                  {!hasAccess && (
                    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${shloka.sanskrit}\n\n${shloka.translations[outputLang] || shloka.translations['en']}\n- ${shloka.source}`); showToast("Copied to clipboard!"); }} className="absolute top-3 right-3 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 p-2 rounded-lg border border-transparent hover:border-blue-200 transition-all opacity-0 group-hover:opacity-100" title="Copy Text">
                      <Copy size={14}/>
                    </button>
                  )}
                </div>
              ))}
           </div>
        </div>

        {/* RIGHT COLUMN: CANVAS STUDIO OR LOCK SCREEN */}
        <div className="xl:col-span-7 flex flex-col h-full">
          {hasAccess ? (
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-4 sm:p-6 shadow-inner flex flex-col h-full">

               {marketingInsights && (
                 <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-2xl shadow-sm mb-6 flex items-start gap-3">
                   <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0 mt-0.5"><BrainCircuit size={18} /></div>
                   <div className="flex-1">
                     <h3 className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-1 flex justify-between items-center">
                       AI Engagement Strategy
                       <button onClick={handleCopyCaption} className="text-blue-600 hover:text-blue-800 flex items-center gap-1"><Copy size={10}/> Copy Caption</button>
                     </h3>
                     <p className="text-xs font-bold text-gray-700 leading-relaxed">{marketingInsights.tip}</p>
                   </div>
                 </div>
               )}

               {/* Studio Controls */}
               <div className="flex flex-wrap gap-2 mb-6">
                  {THEMES.map(theme => (
                    <button 
                      key={theme.id} 
                      onClick={() => setSelectedTheme(theme)}
                      className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 border-2 ${selectedTheme.id === theme.id ? 'border-gray-900 text-gray-900 bg-white shadow-sm' : 'border-transparent text-gray-500 bg-gray-100 hover:bg-gray-200'}`}
                    >
                      <div className="w-3 h-3 rounded-full border border-gray-300" style={{ background: `linear-gradient(to right, ${theme.color1}, ${theme.color2})`}}></div>
                      {theme.name}
                    </button>
                  ))}
               </div>

               {/* Live Canvas Preview */}
               <div className="flex-1 flex items-center justify-center bg-gray-200/50 rounded-2xl border-2 border-dashed border-gray-300 p-4 sm:p-8 overflow-hidden relative group min-h-[300px]">
                  <canvas ref={canvasRef} className="hidden" />

                  {canvasRef.current && selectedShloka ? (
                     <img 
                       src={canvasRef.current.toDataURL()} 
                       alt="Live Banner Preview" 
                       className="max-h-full max-w-full object-contain rounded-xl shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
                     />
                  ) : (
                    <Loader2 size={40} className="animate-spin text-gray-400" />
                  )}
               </div>

               {/* Export & Action Footer */}
               <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={handleSetDailyBani}
                    disabled={isProcessing || !selectedShloka}
                    className="flex-1 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 hover:text-blue-700 font-black py-4 rounded-xl text-[10px] sm:text-xs uppercase tracking-widest transition-all shadow-sm flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <><Smartphone size={16}/> Push to App Dashboard</>}
                  </button>

                  <button 
                    onClick={handleDownload}
                    disabled={!selectedShloka}
                    className="flex-[2] bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-4 rounded-xl text-[10px] sm:text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <Download size={18}/> Download Branded Image
                  </button>
               </div>
            </div>
          ) : (
            /* ✨ MEMBER VIEW: ACCESS REQUEST GATE */
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-8 sm:p-10 shadow-inner flex flex-col items-center justify-center h-full text-center relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-red-500"></div>

               <div className="w-20 h-20 bg-orange-50 text-sanatani-orange rounded-full flex items-center justify-center mb-6 shadow-inner border border-orange-100">
                 {myRequest?.status === 'PENDING' ? <Clock size={40} className="animate-pulse"/> : <Lock size={40} />}
               </div>

               <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Restricted Technical Studio</h2>
               <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed max-w-md">
                 Generating official branded banners and pushing quotes to the main dashboard requires Marketing permission.
               </p>

               {myRequest?.status === 'PENDING' ? (
                 <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl w-full max-w-md">
                   <h3 className="text-blue-800 font-black flex items-center justify-center gap-2 mb-2"><Timer size={18}/> Request Under Review</h3>
                   <p className="text-xs font-bold text-blue-600 leading-snug">The Admins have been notified. Please wait for approval.</p>
                 </div>
               ) : myRequest?.status === 'REJECTED' ? (
                 <div className="space-y-6 w-full max-w-md">
                   <div className="bg-red-50 border border-red-200 p-6 rounded-2xl">
                     <h3 className="text-red-800 font-black flex items-center justify-center gap-2 mb-2"><XCircle size={18}/> Request Denied</h3>
                     <p className="text-xs font-bold text-red-600 leading-snug">Reason: {myRequest.rejectionReason}</p>
                   </div>
                   <button onClick={() => setMyRequest(null)} className="text-xs font-black text-gray-500 hover:text-gray-900 underline uppercase tracking-widest">Submit New Request</button>
                 </div>
               ) : myRequest?.status === 'APPROVED' && myRequest?.approvedUntil < Date.now() ? (
                 <div className="space-y-6 w-full max-w-md">
                   <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-2xl">
                     <h3 className="text-yellow-800 font-black flex items-center justify-center gap-2 mb-2"><CalendarClock size={18}/> Access Expired</h3>
                     <p className="text-xs font-bold text-yellow-700 leading-snug">Your previous access expired. Please submit a new request.</p>
                   </div>
                   <button onClick={() => setMyRequest(null)} className="text-xs font-black text-gray-500 hover:text-gray-900 underline uppercase tracking-widest">Submit New Request</button>
                 </div>
               ) : (
                 <form onSubmit={handleSubmitRequest} className="space-y-4 w-full max-w-md">
                   <div className="text-left">
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Reason for Access *</label>
                     <textarea 
                       required rows="3" value={requestReason} onChange={e => setRequestReason(e.target.value)}
                       placeholder="e.g. I want to create the banner for tomorrow's Utsav..."
                       className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:ring-4 focus:ring-orange-50 focus:border-sanatani-orange outline-none transition-all shadow-sm resize-none"
                     />
                   </div>
                   <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex justify-center items-center gap-2 disabled:opacity-50">
                     {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Submit Access Request
                   </button>
                 </form>
               )}
            </div>
          )}
        </div>

      </div>

      {/* ✨ ADMIN MODAL: ACCESS REQUEST MANAGER */}
      {showRequestManager && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-blue-500 ring-1 ring-white/20 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <ShieldCheck size={20} className="text-blue-600"/> Studio Access Requests
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
                                   <option value={1}>1 Hour (Quick Edit)</option>
                                   <option value={12}>12 Hours (Event Day)</option>
                                   <option value={24}>24 Hours (Full Day)</option>
                                   <option value={168}>7 Days (Festival Week)</option>
                                 </select>
                               </div>
                               <div>
                                 <label className="block text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1.5">Admin Note (Optional)</label>
                                 <input type="text" value={adminActionModal.note} onChange={e => setAdminActionModal({...adminActionModal, note: e.target.value})} className="w-full p-3 bg-white border border-blue-200 rounded-lg text-xs font-bold outline-none"/>
                               </div>
                             </>
                           ) : (
                             <div>
                               <label className="block text-[10px] font-black text-red-700 uppercase tracking-widest mb-1.5">Rejection Reason *</label>
                               <input required type="text" value={adminActionModal.note} onChange={e => setAdminActionModal({...adminActionModal, note: e.target.value})} className="w-full p-3 bg-white border border-red-200 rounded-lg text-xs font-bold outline-none focus:border-red-500"/>
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

      {/* FOOTER CREDIT */}
      <div className="pt-8 pb-4 flex flex-col items-center justify-center text-center opacity-70 border-t border-gray-200 mt-auto">
         <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1">
           Made with <Heart size={12} className="text-red-500 fill-current"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span>
         </div>
         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">© {new Date().getFullYear()} Sanatani Bandhan. Enterprise Edition.</p>
      </div>

    </div>
  );
}
