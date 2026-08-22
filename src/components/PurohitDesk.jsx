import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
// ✨ FIXED: Added missing icons (UserPlus, Copy, User) to prevent crashes
import { 
  UserCheck, CalendarDays, Clock, Award, Phone, Sparkles, 
  Plus, Edit, Trash2, X, Loader2, HelpCircle, Lightbulb, CheckCircle2, 
  AlertTriangle, WifiOff, ShieldCheck, Users, BookOpen, Heart, Share2, 
  Banknote, Search, MapPin, MessageSquare, ScrollText, Flame, BellRing,
  UserPlus, Copy, User
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function PurohitDesk({ session, isOnline = navigator.onLine }) {
  const { t, language, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ANUSHTHAN'); // 'ANUSHTHAN' | 'YAJAMAN' | 'SAMAGRI' | 'MANDALI'
  const [showGuide, setShowGuide] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // ✨ FAIL-SAFE TRANSLATION HELPER
  const safeTranslate = (key, fallbackEn, fallbackBn, fallbackHi) => {
    const trans = t(key);
    if (trans !== key && trans) return trans;
    if (language === 'bn') return fallbackBn;
    if (language === 'hi') return fallbackHi;
    return fallbackEn;
  };

  // 💾 Offline Cached States
  const [purohits, setPurohits] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_purohits_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [yajamans, setYajamans] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_yajamans_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [anushthans, setAnushthans] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_anushthans_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [samagri, setSamagri] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_samagri_${session?.communityId}`)) || []; } catch { return []; }
  });

  // Modal & Form States
  const [modalType, setModalType] = useState(null); 
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [sankalpPreview, setSankalpPreview] = useState(null);

  const [purohitForm, setPurohitForm] = useState({ name: '', phone: '', specialization: 'Vedic Rituals & Puja', experienceYears: '5', availabilityStatus: 'AVAILABLE', address: '', adminNotes: '' });
  const [yajamanForm, setYajamanForm] = useState({ name: '', phone: '', address: '', gotra: '', rashi: '', nakshatra: '', kuladevata: '', notes: '' });
  const [anushthanForm, setAnushthanForm] = useState({ yajamanId: '', pujaName: '', date: '', time: '', tithi: '', muhurat: '', status: 'INQUIRY', dakshinaEst: '' });
  const [samagriForm, setSamagriForm] = useState({ title: '', itemsText: '', notes: '' });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_purohit_desk', { workspace_type: workspaceType });

    const purohitRef = ref(db, `communities/${session.communityId}/purohits`);
    const yajRef = ref(db, `communities/${session.communityId}/purohit_yajamans`);
    const anuRef = ref(db, `communities/${session.communityId}/purohit_anushthans`);
    const samRef = ref(db, `communities/${session.communityId}/purohit_samagri`);

    const unsubPur = onValue(purohitRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ purohitId: k, ...snap.val()[k] }));
        setPurohits(arr);
        localStorage.setItem(`sb_purohits_${session.communityId}`, JSON.stringify(arr));
      } else setPurohits([]);
    });

    const unsubYaj = onValue(yajRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        setYajamans(arr);
        localStorage.setItem(`sb_yajamans_${session.communityId}`, JSON.stringify(arr));
      } else setYajamans([]);
    });

    const unsubAnu = onValue(anuRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setAnushthans(arr);
        localStorage.setItem(`sb_anushthans_${session.communityId}`, JSON.stringify(arr));
      } else setAnushthans([]);
    });

    const unsubSam = onValue(samRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        setSamagri(arr);
        localStorage.setItem(`sb_samagri_${session.communityId}`, JSON.stringify(arr));
      } else setSamagri([]);
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubPur(); unsubYaj(); unsubAnu(); unsubSam(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(safeTranslate('offline_saved', 'Action cached offline. Syncing soon.', 'অফলাইনে সেভ করা হয়েছে।', 'ऑफ़लाइन सहेजा गया।'), 'offline');
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + e.message, "error");
    }
  };

  const logAudit = (actionType, description) => {
    try { push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  const handleSavePurohit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const purKey = `PRH-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = { ...purohitForm, purohitId: purKey, updatedAt: Date.now(), addedBy: session.userName };
      await executeSafeUpdate({ [`communities/${session.communityId}/purohits/${purKey}`]: payload }, safeTranslate('purohit_saved', 'Priest profile registered!', 'পুরোহিত প্রোফাইল নিবন্ধিত!', 'पुरोहित प्रोफ़ाइल पंजीकृत!'));
      logAudit("MANDALI_REGISTERED", `Registered Mandali Priest: ${purohitForm.name}`);
      setModalType(null);
      setPurohitForm({ name: '', phone: '', specialization: 'Vedic Rituals & Puja', experienceYears: '5', availabilityStatus: 'AVAILABLE', address: '', adminNotes: '' });
    } catch (err) {} finally { setSubmitting(false); }
  };

  const handleSaveYajaman = async (e) => {
    e.preventDefault();
    if (!checkQuota('free_member_limit', yajamans.length + 1)) return;
    setSubmitting(true);
    try {
      const newId = `YJM-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = { ...yajamanForm, createdAt: Date.now(), addedBy: session.userName };
      await executeSafeUpdate({ [`communities/${session.communityId}/purohit_yajamans/${newId}`]: payload }, safeTranslate('yajaman_saved', 'Yajaman profile saved!', 'যজমান প্রোফাইল সেভ হয়েছে!', 'यजमान प्रोफ़ाइल सहेजी गई!'));
      logAudit("YAJAMAN_ADDED", `Added Yajaman: ${yajamanForm.name}`);
      setModalType(null);
      setYajamanForm({ name: '', phone: '', address: '', gotra: '', rashi: '', nakshatra: '', kuladevata: '', notes: '' });
    } catch (err) {} finally { setSubmitting(false); }
  };

  const handleSaveAnushthan = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const yjm = yajamans.find(y => y.id === anushthanForm.yajamanId);
      const newId = `ANU-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = { 
        ...anushthanForm, 
        yajamanName: yjm ? yjm.name : 'Unknown',
        yajamanPhone: yjm ? yjm.phone : '',
        createdAt: Date.now(), 
        purohitName: session.userName 
      };
      await executeSafeUpdate({ [`communities/${session.communityId}/purohit_anushthans/${newId}`]: payload }, safeTranslate('anushthan_saved', 'Ritual scheduled successfully!', 'আচার সফলভাবে নির্ধারিত হয়েছে!', 'अनुष्ठान सफलतापूर्वक निर्धारित!'));
      logAudit("ANUSHTHAN_SCHEDULED", `Scheduled ${anushthanForm.pujaName} for ${payload.yajamanName}`);
      setModalType(null);
      setAnushthanForm({ yajamanId: '', pujaName: '', date: '', time: '', tithi: '', muhurat: '', status: 'INQUIRY', dakshinaEst: '' });
    } catch (err) {} finally { setSubmitting(false); }
  };

  const handleSaveSamagri = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newId = `SAM-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = { ...samagriForm, createdAt: Date.now() };
      await executeSafeUpdate({ [`communities/${session.communityId}/purohit_samagri/${newId}`]: payload }, safeTranslate('samagri_saved', 'Samagri template saved!', 'সামগ্রী টেমপ্লেট সেভ হয়েছে!', 'सामग्री टेम्पलेट सहेजा गया!'));
      setModalType(null);
      setSamagriForm({ title: '', itemsText: '', notes: '' });
    } catch (err) {} finally { setSubmitting(false); }
  };

  const handleDelete = (id, path, name) => {
    setConfirmDialog({
      title: safeTranslate('delete_record', 'Delete Record', 'রেকর্ড মুছুন', 'रिकॉर्ड हटाएं'),
      message: `${safeTranslate('delete_confirm_desc', 'Are you sure you want to permanently delete', 'আপনি কি নিশ্চিত যে আপনি এটি মুছে ফেলতে চান', 'क्या आप निश्चित रूप से हटाना चाहते हैं')} ${name}?`,
      confirmText: safeTranslate('btn_delete', 'DELETE', 'মুছুন', 'हटाएं'),
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await executeSafeUpdate({ [`communities/${session.communityId}/${path}/${id}`]: null }, safeTranslate('record_deleted', 'Record deleted.', 'রেকর্ড মুছে ফেলা হয়েছে।', 'रिकॉर्ड हटा दिया गया।'));
        } catch (err) {}
      }
    });
  };

  const handleToggleStatus = async (purohit) => {
    const nextStatus = purohit.availabilityStatus === 'AVAILABLE' ? 'ON_DUTY' : 'AVAILABLE';
    await executeSafeUpdate({ [`communities/${session.communityId}/purohits/${purohit.purohitId}/availabilityStatus`]: nextStatus }, `${purohit.name} ` + safeTranslate('status_updated', 'status updated.', 'স্ট্যাটাস আপডেট হয়েছে।', 'स्थिति अपडेट की गई।'));
  };

  const updateAnushthanStatus = async (id, newStatus) => {
    await executeSafeUpdate({ [`communities/${session.communityId}/purohit_anushthans/${id}/status`]: newStatus }, safeTranslate('status_updated_to', 'Status updated to', 'স্ট্যাটাস আপডেট করা হয়েছে', 'स्थिति अपडेट की गई') + ` ${newStatus}`);
  };

  const shareSamagriToWhatsApp = (template, phone) => {
    const text = `Namaskar 🙏\n\nHere is the required Puja Samagri (Items List) for *${template.title}*:\n\n${template.itemsText}\n\n${template.notes ? `*Notes:* ${template.notes}\n\n` : ''}Please keep these items ready.\n— ${session.userName}`;
    const url = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    pushToDataLayer('share_samagri', { template_name: template.title });
  };

  const openSankalpGenerator = (anu) => {
    const yjm = yajamans.find(y => y.id === anu.yajamanId) || {};
    const sankalpText = `ॐ विष्णुर्विष्णुर्विष्णुः ... अद्य ब्रह्मणो द्वितीयपरार्धे ... \n\n*Gotra:* ${yjm.gotra || '[Gotra]'} \n*Nakshatra:* ${yjm.nakshatra || '[Nakshatra]'} \n*Rashi:* ${yjm.rashi || '[Rashi]'} \n*Nama:* ${yjm.name || '[Yajaman Name]'} \n\nश्रुति स्मृति पुराणोक्त फल प्राप्त्यर्थं ... *${anu.pujaName}* कर्म अहं करिष्ये।`;
    setSankalpPreview({ title: `${safeTranslate('sankalp', 'Sankalp', 'সংকল্প', 'संकल्प')}: ${anu.pujaName}`, text: sankalpText });
    pushToDataLayer('generate_sankalp', { puja_name: anu.pujaName });
  };

  const filteredAnushthans = anushthans.filter(a => a.pujaName.toLowerCase().includes(searchTerm.toLowerCase()) || a.yajamanName.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredYajamans = yajamans.filter(y => y.name.toLowerCase().includes(searchTerm.toLowerCase()) || y.phone.includes(searchTerm));
  const filteredSamagri = samagri.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredPurohits = purohits.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.specialization.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full flex flex-col min-h-[90vh]">

      {/* ✨ TOAST PORTAL */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{toast.type === 'error' ? safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') : safeTranslate('success', 'Success', 'সফল', 'सफल')}</p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>, document.body
      )}

      {/* ✨ CONFIRMATION DIALOG PORTAL */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center border-t-4 border-sanatani-orange">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner ${confirmDialog.isDanger ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
              {confirmDialog.isDanger ? <AlertTriangle size={32}/> : <BellRing size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-sm">{safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें')}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* HEADER */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 ring-1 ring-black/5">
        <div className="w-full lg:w-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Flame className="text-sanatani-orange" size={28} /> {safeTranslate('purohit_desk_title', 'My Ritual Diary', 'আমার রিচুয়াল ডায়েরি', 'मेरी अनुष्ठान डायरी')}
          </h2>
          <p className="text-[10px] sm:text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest flex items-center gap-1.5">
             <ScrollText size={14}/> {safeTranslate('purohit_desk_subtitle', 'Manage Rituals, Yajamans, and your Mandali.', 'আচার, যজমান এবং আপনার মন্ডলী পরিচালনা করুন।', 'अनुष्ठान, यजमान और अपनी मंडली का प्रबंधन करें।')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <button onClick={() => setShowGuide(!showGuide)} className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-sm">
            <HelpCircle size={14}/> {safeTranslate('quick_guide', 'Guide', 'গাইড', 'गाइड')}
          </button>

          {isManagerOrAdmin && (
            <button onClick={() => setModalType(activeTab)} className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all hover:-translate-y-0.5 shrink-0">
              <Plus size={16}/> 
              {activeTab === 'ANUSHTHAN' ? safeTranslate('btn_schedule_puja', 'Schedule Puja', 'পূজা নির্ধারণ করুন', 'पूजा निर्धारित करें') : 
               activeTab === 'YAJAMAN' ? safeTranslate('btn_add_yajaman', 'Add Yajaman', 'যজমান যোগ করুন', 'यजमान जोड़ें') : 
               activeTab === 'SAMAGRI' ? safeTranslate('btn_create_template', 'Create Template', 'টেমপ্লেট তৈরি করুন', 'टेम्पलेट बनाएं') : 
               safeTranslate('btn_add_mandali', 'Add to Mandali', 'মন্ডলীতে যোগ করুন', 'मंडली में जोड़ें')}
            </button>
          )}
        </div>
      </div>

      {/* GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative animate-in slide-in-from-top-2">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> {safeTranslate('purohit_protocol', 'Scholar Protocol', 'স্কলার প্রোটোকল', 'विद्वान प्रोटोकॉल')}</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed max-w-4xl">
            {safeTranslate('purohit_protocol_desc', 'Manage your spiritual practice efficiently. Anushthan: Track upcoming Pujas and generate personalized Sankalps. Yajaman: Maintain lineage records (Gotra, Nakshatra) for families. Samagri: Save item lists and dispatch them via WhatsApp. Mandali: Track your assistant priests.', 'আপনার আধ্যাত্মিক কাজ দক্ষতার সাথে পরিচালনা করুন। আচার: আসন্ন পূজা ট্র্যাক করুন। যজমান: বংশের রেকর্ড বজায় রাখুন। সামগ্রী: আইটেম তালিকা সংরক্ষণ করুন।', 'अपने आध्यात्मिक अभ्यास का कुशलता से प्रबंधन करें। अनुष्ठान: आगामी पूजाओं को ट्रैक करें। यजमान: वंशावली रिकॉर्ड बनाए रखें।')}
          </p>
        </div>
      )}

      {/* TABS & SEARCH */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-gray-50 p-2 sm:p-3 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex w-full lg:w-auto bg-gray-200/80 p-1.5 rounded-xl overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('ANUSHTHAN')} className={`flex-1 sm:w-32 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-3 ${activeTab === 'ANUSHTHAN' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-200'}`}>
            <CalendarDays size={14}/> {safeTranslate('anushthan', 'Rituals', 'আচার', 'अनुष्ठान')}
          </button>
          <button onClick={() => setActiveTab('YAJAMAN')} className={`flex-1 sm:w-32 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-3 ${activeTab === 'YAJAMAN' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-200'}`}>
            <Users size={14}/> {safeTranslate('yajaman', 'Yajaman', 'যজমান', 'यजमान')}
          </button>
          <button onClick={() => setActiveTab('SAMAGRI')} className={`flex-1 sm:w-32 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-3 ${activeTab === 'SAMAGRI' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-200'}`}>
            <BookOpen size={14}/> {safeTranslate('samagri', 'Samagri', 'সামগ্রী', 'सामग्री')}
          </button>
          <button onClick={() => setActiveTab('MANDALI')} className={`flex-1 sm:w-32 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-3 ${activeTab === 'MANDALI' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-200'}`}>
            <UserCheck size={14}/> {safeTranslate('mandali', 'Mandali (Team)', 'মন্ডলী', 'मंडली')}
          </button>
        </div>
        <div className="relative w-full lg:w-80">
          <Search size={14} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder={safeTranslate('search_records', "Search records...", "খুঁজুন...", "खोजें...")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-sanatani-orange shadow-sm transition-colors" />
        </div>
      </div>

      {/* CONTENT: ANUSHTHAN */}
      {activeTab === 'ANUSHTHAN' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in">
          {filteredAnushthans.length > 0 ? filteredAnushthans.map(anu => (
            <div key={anu.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-lg p-6 flex flex-col group transition-all duration-300 relative overflow-hidden ring-1 ring-black/5">
               <div className={`absolute top-0 left-0 w-1.5 h-full ${anu.status === 'COMPLETED' ? 'bg-green-500' : anu.status === 'BOOKED' ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
               <div className="flex justify-between items-start mb-5 border-b border-gray-100 pb-4 pl-3">
                 <div>
                   <h3 className="text-xl font-black text-gray-900 tracking-tight group-hover:text-sanatani-orange transition-colors">{anu.pujaName}</h3>
                   <p className="text-xs font-bold text-gray-500 mt-1 flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded w-fit border border-gray-100"><User size={12} className="text-gray-400"/> {anu.yajamanName}</p>
                 </div>
                 <select value={anu.status} onChange={(e) => updateAnushthanStatus(anu.id, e.target.value)} className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border outline-none cursor-pointer shadow-sm appearance-none ${anu.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' : anu.status === 'BOOKED' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                    <option value="INQUIRY">{safeTranslate('status_inquiry', 'Inquiry', 'অনুসন্ধান', 'पूछताछ')}</option>
                    <option value="BOOKED">{safeTranslate('status_booked', 'Booked', 'বুক করা হয়েছে', 'बुक किया गया')}</option>
                    <option value="COMPLETED">{safeTranslate('status_completed', 'Completed', 'সম্পন্ন', 'पूरा हुआ')}</option>
                 </select>
               </div>

               <div className="grid grid-cols-2 gap-4 text-xs font-bold text-gray-600 mb-6 pl-3">
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><CalendarDays size={12}/> {safeTranslate('date_time', 'Date & Time', 'তারিখ ও সময়', 'दिनांक और समय')}</p>
                   <p className="text-gray-900">{anu.date} <br/> <span className="text-gray-500 text-[10px]">{anu.time || 'TBA'}</span></p>
                 </div>
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Clock size={12}/> {safeTranslate('tithi_muhurat', 'Tithi / Muhurat', 'তিথি / মুহূর্ত', 'तिथि / मुहूर्त')}</p>
                   <p className="text-gray-900 truncate">{anu.tithi || 'N/A'}</p>
                 </div>
               </div>

               <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-gray-100 pl-3">
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-xl border border-green-200 text-[10px] font-black uppercase tracking-widest shadow-sm">
                    <Banknote size={14}/> {curSymbol}{anu.dakshinaEst || '0'}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openSankalpGenerator(anu)} className="flex items-center gap-1.5 bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 text-orange-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-orange-200 shadow-sm">
                      <Sparkles size={12}/> {safeTranslate('sankalp', 'Sankalp', 'সংকল্প', 'संकल्प')}
                    </button>
                    {isManagerOrAdmin && <button onClick={() => handleDelete(anu.id, 'purohit_anushthans', anu.pujaName)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"><Trash2 size={16}/></button>}
                  </div>
               </div>
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
              <CalendarDays size={48} className="mx-auto mb-4 opacity-20 text-sanatani-orange"/>
              <p className="text-xl font-black text-gray-800 mb-1">{safeTranslate('no_rituals_scheduled', 'No Rituals Scheduled', 'কোনো আচার নির্ধারিত নেই', 'कोई अनुष्ठान निर्धारित नहीं')}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Click + Schedule Puja to add one.</p>
            </div>
          )}
        </div>
      )}

      {/* CONTENT: YAJAMAN */}
      {activeTab === 'YAJAMAN' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
          {filteredYajamans.length > 0 ? filteredYajamans.map(yjm => (
            <div key={yjm.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col group hover:shadow-lg hover:border-orange-200 transition-all duration-300">
               <div className="flex items-center gap-4 mb-5">
                 <div className="w-14 h-14 bg-gradient-to-br from-orange-50 to-orange-100 text-sanatani-orange rounded-full flex items-center justify-center font-black text-xl border border-orange-200 shadow-inner shrink-0">{yjm.name.charAt(0)}</div>
                 <div className="min-w-0">
                   <h3 className="text-lg font-black text-gray-900 truncate group-hover:text-sanatani-orange transition-colors">{yjm.name}</h3>
                   <p className="text-[10px] font-mono font-bold text-gray-500 tracking-widest">{yjm.phone}</p>
                 </div>
               </div>
               <div className="space-y-2.5 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-xs font-bold text-gray-700 shadow-inner">
                 <p className="flex justify-between items-center"><span className="text-[9px] text-gray-400 uppercase tracking-widest">{safeTranslate('gotra', 'Gotra', 'গোত্র', 'गोत्र')}:</span> <span className="font-black text-gray-900">{yjm.gotra || '-'}</span></p>
                 <p className="flex justify-between items-center"><span className="text-[9px] text-gray-400 uppercase tracking-widest">{safeTranslate('nakshatra', 'Nakshatra', 'নক্ষত্র', 'नक्षत्र')}:</span> <span className="font-black text-gray-900">{yjm.nakshatra || '-'}</span></p>
                 <p className="flex justify-between items-center"><span className="text-[9px] text-gray-400 uppercase tracking-widest">{safeTranslate('rashi', 'Rashi', 'রাশি', 'राशि')}:</span> <span className="font-black text-gray-900">{yjm.rashi || '-'}</span></p>
                 <p className="flex justify-between items-center"><span className="text-[9px] text-gray-400 uppercase tracking-widest">{safeTranslate('kuladevata', 'Kuladevata', 'কূলদেবতা', 'कुलदेवता')}:</span> <span className="font-black text-gray-900 truncate max-w-[120px] text-right">{yjm.kuladevata || '-'}</span></p>
               </div>
               <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between items-center">
                 <a href={`https://wa.me/${yjm.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-xl hover:bg-green-100 transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-md">
                   <MessageSquare size={14}/> {safeTranslate('msg_whatsapp', 'WhatsApp', 'হোয়াটসঅ্যাপ', 'व्हाट्सएप')}
                 </a>
                 {isManagerOrAdmin && <button onClick={() => handleDelete(yjm.id, 'purohit_yajamans', yjm.name)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2.5 rounded-xl transition-colors border border-transparent hover:border-red-100 shadow-sm"><Trash2 size={16}/></button>}
               </div>
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
              <Users size={48} className="mx-auto mb-4 opacity-20 text-sanatani-orange"/>
              <p className="text-xl font-black text-gray-800 mb-1">{safeTranslate('no_yajamans', 'No Yajamans Added', 'কোনো যজমান যুক্ত করা হয়নি', 'कोई यजमान नहीं जोड़ा गया')}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Click + Add Yajaman to build your CRM.</p>
            </div>
          )}
        </div>
      )}

      {/* CONTENT: SAMAGRI */}
      {activeTab === 'SAMAGRI' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
          {filteredSamagri.length > 0 ? filteredSamagri.map(sam => (
            <div key={sam.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col group hover:shadow-lg transition-all duration-300 relative overflow-hidden ring-1 ring-black/5">
               <div className="absolute top-0 left-0 w-full h-1 bg-sanatani-orange opacity-50 group-hover:opacity-100 transition-opacity"></div>
               <h3 className="text-lg font-black text-gray-900 mb-3 truncate border-b border-gray-100 pb-3">{sam.title}</h3>
               <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 mb-5 flex-1 shadow-inner relative">
                 <div className="absolute top-2 right-2 opacity-5"><BookOpen size={64}/></div>
                 <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-6 font-bold leading-relaxed relative z-10">{sam.itemsText}</p>
               </div>
               <div className="flex gap-2 mt-auto">
                 <button onClick={() => shareSamagriToWhatsApp(sam, null)} className="flex-1 bg-green-50 hover:bg-green-600 text-green-700 hover:text-white border border-green-200 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
                   <Share2 size={14}/> {safeTranslate('share_wa', 'Share via WA', 'WA শেয়ার করুন', 'WA द्वारा शेयर करें')}
                 </button>
                 {isManagerOrAdmin && <button onClick={() => handleDelete(sam.id, 'purohit_samagri', sam.title)} className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"><Trash2 size={16}/></button>}
               </div>
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
              <BookOpen size={48} className="mx-auto mb-4 opacity-20 text-sanatani-orange"/>
              <p className="text-xl font-black text-gray-800 mb-1">{safeTranslate('no_samagri', 'No Samagri Templates', 'কোনো সামগ্রী টেমপ্লেট নেই', 'कोई सामग्री टेम्पलेट नहीं')}</p>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Create reusable item lists for rituals.</p>
            </div>
          )}
        </div>
      )}

      {/* CONTENT: MANDALI ROSTER */}
      {activeTab === 'MANDALI' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in">
          {filteredPurohits.length > 0 ? filteredPurohits.map(purohit => (
            <div key={purohit.purohitId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-5 hover:shadow-lg hover:border-orange-200 transition-all duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border shadow-sm ${purohit.availabilityStatus === 'AVAILABLE' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                    {purohit.availabilityStatus.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100 shadow-sm">{purohit.experienceYears} Yrs Exp.</span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 group-hover:text-sanatani-orange transition-colors">{purohit.name}</h3>
                  <p className="text-[10px] font-black text-sanatani-orange mt-2 bg-orange-50 inline-block px-2.5 py-1.5 rounded-lg border border-orange-100 uppercase tracking-widest">{purohit.specialization}</p>
                </div>
                <div className="space-y-2 text-xs text-gray-700 font-bold bg-gray-50 p-4 rounded-2xl border border-gray-100 shadow-inner">
                  <p className="flex items-center gap-2"><Phone size={14} className="text-gray-400"/> {purohit.phone}</p>
                  {purohit.address && <p className="truncate flex items-center gap-2"><MapPin size={14} className="text-gray-400"/> {purohit.address}</p>}
                </div>
              </div>
              {isManagerOrAdmin && (
                <div className="pt-5 border-t border-gray-100 flex gap-3 mt-auto">
                  <button onClick={() => handleToggleStatus(purohit)} className="flex-1 bg-white hover:bg-gray-50 text-gray-700 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest border border-gray-200 transition-colors shadow-sm">
                    {safeTranslate('toggle_status', 'Toggle Status', 'স্ট্যাটাস টগল করুন', 'स्थिति बदलें')}
                  </button>
                  <button onClick={() => handleDelete(purohit.purohitId, 'purohits', purohit.name)} className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100 shadow-sm"><Trash2 size={16}/></button>
                </div>
              )}
            </div>
          )) : (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
              <UserCheck size={48} className="mx-auto mb-4 opacity-20 text-sanatani-orange"/>
              <p className="text-xl font-black text-gray-800 mb-1">{safeTranslate('no_purohits', 'No Mandali Profiles Found', 'কোনো প্রোফাইল পাওয়া যায়নি', 'कोई प्रोफ़ाइल नहीं मिली')}</p>
            </div>
          )}
        </div>
      )}

      {/* MODAL: SANKALP GENERATOR PREVIEW (SACRED SCROLL UI) */}
      {sankalpPreview && createPortal(
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 border-t-4 border-sanatani-orange ring-1 ring-white/20">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2"><Sparkles className="text-sanatani-orange" size={20}/> {sankalpPreview.title}</h3>
              <button onClick={() => setSankalpPreview(null)} className="p-2.5 bg-white border border-gray-200 rounded-full hover:bg-gray-100 text-gray-500 transition-colors shadow-sm"><X size={16}/></button>
            </div>

            <div className="p-6">
              <div className="bg-[#fff9ed] border border-amber-200 p-8 rounded-2xl mb-6 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"><Sparkles size={100} className="text-amber-600"/></div>
                <p className="text-sm font-bold text-amber-950 leading-loose whitespace-pre-wrap font-devanagari relative z-10 text-center tracking-wide">{sankalpPreview.text}</p>
              </div>

              <button 
                onClick={() => { 
                  navigator.clipboard.writeText(sankalpPreview.text); 
                  showToast(safeTranslate('sankalp_copied', "Sankalp copied to clipboard!", "সংকল্প কপি করা হয়েছে!", "संकल्प कॉपी किया गया!")); 
                }} 
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2"
              >
                <Copy size={16}/> {safeTranslate('copy_sankalp', 'Copy Sankalp Text', 'সংকল্প টেক্সট কপি করুন', 'संकल्प पाठ कॉपी करें')}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* MODALS: FORMS (YAJAMAN | ANUSHTHAN | SAMAGRI | MANDALI) */}
      {modalType && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[95dvh] sm:max-h-[90vh] animate-in zoom-in-95 ring-1 ring-white/20">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                {modalType === 'ANUSHTHAN' ? <><CalendarDays className="text-sanatani-orange" size={24}/> {safeTranslate('schedule_puja', 'Schedule Ritual', 'পূজা নির্ধারণ করুন', 'पूजा निर्धारित करें')}</> : 
                 modalType === 'YAJAMAN' ? <><Users className="text-sanatani-orange" size={24}/> {safeTranslate('add_yajaman', 'Add Yajaman', 'যজমান যোগ করুন', 'यजमान जोड़ें')}</> : 
                 modalType === 'SAMAGRI' ? <><BookOpen className="text-sanatani-orange" size={24}/> {safeTranslate('create_samagri', 'Create Template', 'টেমপ্লেট তৈরি করুন', 'टेम्पलेट बनाएं')}</> : 
                 <><UserPlus className="text-sanatani-orange" size={24}/> {safeTranslate('add_mandali', 'Add to Mandali', 'মন্ডলীতে যোগ করুন', 'मंडली में जोड़ें')}</>}
              </h3>
              <button onClick={() => setModalType(null)} className="p-2.5 rounded-full bg-white border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors shadow-sm"><X size={18}/></button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto flex-1 scrollbar-hide bg-white pb-32 sm:pb-8">

              {/* YAJAMAN FORM */}
              {modalType === 'YAJAMAN' && (
                <form onSubmit={handleSaveYajaman} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('full_name', 'Full Name')} *</label>
                      <input type="text" required value={yajamanForm.name} onChange={e=>setYajamanForm({...yajamanForm, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" placeholder="e.g. Anand Sharma"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('phone_number', 'Phone Number')} *</label>
                      <input type="tel" required value={yajamanForm.phone} onChange={e=>setYajamanForm({...yajamanForm, phone: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" placeholder="+91..."/>
                    </div>
                  </div>

                  <div className="bg-orange-50/50 border border-orange-200 p-6 rounded-3xl space-y-4 shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><ShieldCheck size={100}/></div>
                    <p className="text-[10px] font-black text-orange-800 uppercase tracking-widest border-b border-orange-100 pb-3 flex items-center gap-1.5 relative z-10"><ShieldCheck size={14}/> {safeTranslate('vedic_lineage', 'Vedic Lineage')}</p>
                    <div className="grid grid-cols-2 gap-5 relative z-10">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('gotra', 'Gotra')}</label>
                        <input type="text" value={yajamanForm.gotra} onChange={e=>setYajamanForm({...yajamanForm, gotra: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder="Kashyap"/>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('nakshatra', 'Nakshatra')}</label>
                        <input type="text" value={yajamanForm.nakshatra} onChange={e=>setYajamanForm({...yajamanForm, nakshatra: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder="Rohini"/>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('rashi', 'Rashi')}</label>
                        <input type="text" value={yajamanForm.rashi} onChange={e=>setYajamanForm({...yajamanForm, rashi: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder="Vrishabha"/>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5">{safeTranslate('kuladevata', 'Kuladevata')}</label>
                        <input type="text" value={yajamanForm.kuladevata} onChange={e=>setYajamanForm({...yajamanForm, kuladevata: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm transition-all" placeholder="Sri Venkateshwara"/>
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl transition-all hover:-translate-y-0.5 mt-4 flex justify-center items-center gap-2 disabled:opacity-50">
                    {submitting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} {safeTranslate('btn_save_yajaman', 'Save Yajaman Profile')}
                  </button>
                </form>
              )}

              {/* ANUSHTHAN FORM */}
              {modalType === 'ANUSHTHAN' && (
                <form onSubmit={handleSaveAnushthan} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('select_yajaman', 'Select Yajaman')} *</label>
                    <select required value={anushthanForm.yajamanId} onChange={e=>setAnushthanForm({...anushthanForm, yajamanId: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm appearance-none">
                      <option value="" disabled>{safeTranslate('choose_client', 'Choose existing client...')}</option>
                      {yajamans.map(y => <option key={y.id} value={y.id}>{y.name} ({y.phone})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('ritual_name', 'Ritual / Puja Name')} *</label>
                    <input type="text" required value={anushthanForm.pujaName} onChange={e=>setAnushthanForm({...anushthanForm, pujaName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" placeholder="e.g. Satyanarayan Vrat"/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('date', 'Date')} *</label>
                      <input type="date" required value={anushthanForm.date} onChange={e=>setAnushthanForm({...anushthanForm, date: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm cursor-pointer"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('time', 'Time')}</label>
                      <input type="time" value={anushthanForm.time} onChange={e=>setAnushthanForm({...anushthanForm, time: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm cursor-pointer"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('tithi', 'Tithi')}</label>
                      <input type="text" value={anushthanForm.tithi} onChange={e=>setAnushthanForm({...anushthanForm, tithi: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" placeholder="e.g. Purnima"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-green-700 uppercase tracking-widest mb-1.5">{safeTranslate('dakshina_est', 'Dakshina Est.')} ({curSymbol})</label>
                      <input type="number" value={anushthanForm.dakshinaEst} onChange={e=>setAnushthanForm({...anushthanForm, dakshinaEst: e.target.value})} className="w-full p-4 bg-green-50/50 border border-green-300 text-green-800 rounded-xl text-lg font-black outline-none focus:ring-4 focus:ring-green-100 transition-all shadow-sm" placeholder="0"/>
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl transition-all hover:-translate-y-0.5 mt-4 flex justify-center items-center gap-2 disabled:opacity-50">
                    {submitting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} {safeTranslate('btn_schedule_puja', 'Schedule Ritual')}
                  </button>
                </form>
              )}

              {/* SAMAGRI FORM */}
              {modalType === 'SAMAGRI' && (
                <form onSubmit={handleSaveSamagri} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('template_title', 'Template Title')} *</label>
                    <input type="text" required value={samagriForm.title} onChange={e=>setSamagriForm({...samagriForm, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" placeholder="e.g. Griha Pravesh Items"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('samagri_list', 'Samagri List (Items)')} *</label>
                    <textarea required rows="8" value={samagriForm.itemsText} onChange={e=>setSamagriForm({...samagriForm, itemsText: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none resize-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm leading-relaxed" placeholder="1. Haldi 50g&#10;2. Kumkum 50g&#10;3. Ghee 1L..."/>
                  </div>
                  <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl transition-all hover:-translate-y-0.5 mt-4 flex justify-center items-center gap-2 disabled:opacity-50">
                    {submitting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} {safeTranslate('btn_save_template', 'Save Template')}
                  </button>
                </form>
              )}

              {/* PUROHIT MANDALI FORM */}
              {modalType === 'ROSTER' && (
                <form onSubmit={handleSavePurohit} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('full_name', 'Full Name')} *</label>
                    <input type="text" required value={purohitForm.name} onChange={e=>setPurohitForm({...purohitForm, name: e.target.value})} placeholder="e.g. Pandit Ramkishore Shastri" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('phone_number', 'Phone Number')} *</label>
                      <input type="tel" required value={purohitForm.phone} onChange={e=>setPurohitForm({...purohitForm, phone: e.target.value})} placeholder="017..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('exp_years', 'Experience (Years)')}</label>
                      <input type="number" value={purohitForm.experienceYears} onChange={e=>setPurohitForm({...purohitForm, experienceYears: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('specialization', 'Specialization / Expertise')}</label>
                    <input type="text" value={purohitForm.specialization} onChange={e=>setPurohitForm({...purohitForm, specialization: e.target.value})} placeholder="e.g. Vedic Rituals, Vivah Sanskar, Rudrabhishek" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('full_address', 'Full Address')}</label>
                    <input type="text" value={purohitForm.address} onChange={e=>setPurohitForm({...purohitForm, address: e.target.value})} placeholder="Mandir Premises / Quarters" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl transition-all hover:-translate-y-0.5 mt-4 flex justify-center items-center gap-2 disabled:opacity-50">
                    {submitting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} {safeTranslate('btn_save_purohit', 'Save Mandali Profile')}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>, document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500 shrink-0">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Purohit Desk
      </div>
    </div>
  );
}
