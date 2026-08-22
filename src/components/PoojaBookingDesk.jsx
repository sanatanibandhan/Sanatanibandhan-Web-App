import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { 
  Sparkles, CalendarDays, User, CheckCircle2, AlertTriangle, 
  Loader2, Plus, X, HelpCircle, Lightbulb, Search, 
  Flame, BookOpen, Clock, ShieldCheck, Ticket, MapPin, Check,
  Globe2, UserPlus, BellRing, UserMinus, ShieldAlert, Phone, Banknote
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function PoojaBookingDesk({ session, isOnline = navigator.onLine }) {
  const { t, language, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('BOOKINGS'); // 'BOOKINGS' | 'CATALOG' | 'NETWORK'
  const [showGuide, setShowGuide] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ✨ FAIL-SAFE TRANSLATION HELPER
  const safeTranslate = (key, fallbackEn, fallbackBn, fallbackHi) => {
    const trans = t(key);
    if (trans !== key && trans) return trans;
    if (language === 'bn') return fallbackBn;
    if (language === 'hi') return fallbackHi;
    return fallbackEn;
  };

  // ✨ CATALOG OPTIONS (100% Multi-Language Ready)
  const DEFAULT_CATALOG = useMemo(() => [
    { id: 'POOJA-01', name: safeTranslate('pooja_satyanarayan', 'Satyanarayan Katha & Puja', 'সত্যনারায়ণ কথা ও পূজা', 'सत्यनारायण कथा और पूजा'), price: 1000, duration: '2 Hours', category: 'Mandir Ritual' },
    { id: 'POOJA-02', name: safeTranslate('pooja_rudrabhishek', 'Rudrabhishek Seva', 'রুদ্রাভিষেক সেবা', 'रुद्राभिषेक सेवा'), price: 1500, duration: '1.5 Hours', category: 'Special Seva' },
    { id: 'POOJA-03', name: safeTranslate('pooja_namakaran', 'Namakaran Sanskar', 'নামকরণ সংস্কার', 'नामकरण संस्कार'), price: 500, duration: '1 Hour', category: 'Life Sanskar' },
    { id: 'POOJA-04', name: safeTranslate('pooja_grihapravesh', 'Griha Pravesh Puja', 'গৃহপ্রবেশ পূজা', 'गृह प्रवेश पूजा'), price: 2100, duration: '3 Hours', category: 'Off-site Seva' },
    { id: 'POOJA-05', name: safeTranslate('pooja_archana', 'Daily Archana / Pushpanjali', 'দৈনিক অর্চনা / পুষ্পাঞ্জলি', 'दैनिक अर्चना / पुष्पांजलि'), price: 100, duration: '30 Mins', category: 'Daily Seva' }
  ], [language]);

  // 💾 Offline Cached States
  const [bookings, setBookings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_pooja_bookings_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [localRoster, setLocalRoster] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_pooja_roster_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [globalPurohits, setGlobalPurohits] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_global_purohits`)) || []; } catch { return []; }
  });

  const [catalog] = useState(DEFAULT_CATALOG);

  // UI Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [networkSearchTerm, setNetworkSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Booking Form State
  const [bookingForm, setBookingForm] = useState({
    poojaName: DEFAULT_CATALOG[0].name,
    yajamanaName: '',
    gotra: '',
    nakshatra: '',
    phone: '',
    bookingDate: '',
    bookingTime: '09:00 AM',
    assignedPurohit: '',
    dakshinaAmount: DEFAULT_CATALOG[0].price,
    specialNotes: ''
  });

  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_pooja_desk', { workspace_type: workspaceType });

    // 1. Fetch Bookings
    const bookRef = ref(db, `communities/${session.communityId}/logs/PoojaBookings`);
    const unsubBook = onValue(bookRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ bookingId: k, ...data[k] }));
        list.sort((a, b) => b.createdAt - a.createdAt);
        setBookings(list);
        localStorage.setItem(`sb_pooja_bookings_${session.communityId}`, JSON.stringify(list));
      } else {
        setBookings([]);
        localStorage.removeItem(`sb_pooja_bookings_${session.communityId}`);
      }
    });

    // 2. Fetch Local Mandir Roster
    const rosterRef = ref(db, `communities/${session.communityId}/purohit_roster`);
    const unsubRoster = onValue(rosterRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setLocalRoster(list);
        localStorage.setItem(`sb_pooja_roster_${session.communityId}`, JSON.stringify(list));
      } else {
        setLocalRoster([]);
      }
    });

    // 3. Fetch Global Verified Purohits (Universal B2B Marketplace Engine)
    const globalRef = ref(db, `global_purohits`);
    const unsubGlobal = onValue(globalRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ uid: k, ...data[k] })).filter(p => p.verifiedBadge === true);
        setGlobalPurohits(list);
        localStorage.setItem(`sb_global_purohits`, JSON.stringify(list));
      }
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubBook(); unsubRoster(); unsubGlobal(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const executeSafeUpdate = async (updates, successMsg = null, offlineMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(offlineMsg || safeTranslate('offline_saved', 'Action cached offline. Syncing soon.', 'অফলাইনে সেভ করা হয়েছে।', 'ऑफ़लाइन सहेजा गया।'), 'offline');
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + e.message, "error");
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

  // 📝 CREATE NEW POOJA BOOKING
  const handleCreateBooking = async (e) => {
    e.preventDefault();

    if (!isManagerOrAdmin) return showToast(safeTranslate('err_unauthorized', 'Only Admins & Managers can confirm bookings.', 'শুধুমাত্র অ্যাডমিন বুকিং নিশ্চিত করতে পারবেন।', 'केवल व्यवस्थापक बुकिंग की पुष्टि कर सकते हैं।'), "error");
    if (!bookingForm.yajamanaName.trim() || !bookingForm.gotra.trim() || !bookingForm.bookingDate) {
      return showToast(safeTranslate('err_all_fields_req', 'Yajamana Name, Gotra, and Date are required.', 'যজমানের নাম, গোত্র এবং তারিখ আবশ্যক।', 'यजमान का नाम, गोत्र और तिथि आवश्यक हैं।'), "error");
    }
    if (!checkQuota('free_booking_limit')) return;

    setSubmitting(true);
    try {
      const bookKey = `BOOK-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();
      const amt = parseFloat(bookingForm.dakshinaAmount) || 0;

      const newBooking = {
        ...bookingForm,
        bookingId: bookKey,
        dakshinaAmount: amt,
        status: 'CONFIRMED',
        createdAt: timestamp,
        loggedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/logs/PoojaBookings/${bookKey}`] = newBooking;

      // Treasury Auto-Sync Logic
      if (amt > 0) {
        const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
        updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
          id: transId,
          name: `${bookingForm.yajamanaName.trim()} [Pooja Seva]`,
          amount: amt,
          note: `Pooja Booking: ${bookingForm.poojaName} (Gotra: ${bookingForm.gotra}) | Via: CASH`,
          phone: bookingForm.phone || '',
          collector: `${session.userName} (${session.uid})`,
          timestamp: timestamp,
          role: session.role, 
          category: 'General Dakshina' 
        };
      }

      await executeSafeUpdate(updates, safeTranslate('recorded_success', 'Pooja booked and Dakshina logged to Treasury!', 'পূজা বুক করা হয়েছে এবং দক্ষিণা ট্রেজারিতে লগ করা হয়েছে!', 'पूजा बुक की गई और दक्षिणा ट्रेजरी में दर्ज की गई!'));
      logAudit("POOJA_BOOKED", `Booked ${bookingForm.poojaName} for ${bookingForm.yajamanaName}`);
      pushToDataLayer('purchase', { transaction_id: bookKey, value: amt, currency: session?.currency?.code || 'BDT', item_name: bookingForm.poojaName });

      setShowBookingModal(false);
      setBookingForm({
        poojaName: DEFAULT_CATALOG[0].name,
        yajamanaName: '', gotra: '', nakshatra: '', phone: '',
        bookingDate: '', bookingTime: '09:00 AM', assignedPurohit: '',
        dakshinaAmount: DEFAULT_CATALOG[0].price, specialNotes: ''
      });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (bookingId, newStatus) => {
    const updates = {};
    updates[`communities/${session.communityId}/logs/PoojaBookings/${bookingId}/status`] = newStatus;
    await executeSafeUpdate(updates, `Booking status updated to ${newStatus}`);
  };

  // ✨ UNIVERSAL GIG ECONOMY: HIRE GLOBAL PUROHIT TO LOCAL ROSTER
  const handleInvitePurohit = (purohit) => {
    if(localRoster.find(r => r.uid === purohit.uid)) return showToast("This scholar is already on your local panel.", "error");

    setConfirmDialog({
      title: "Invite to Organization Panel",
      message: `Send an official standby invitation to ${purohit.name} (${purohit.specialization || 'Vedic Scholar'}) to join your active roster for leave replacement or Utsav services?`,
      confirmText: "SEND INVITATION",
      isDanger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const updates = {};
          updates[`communities/${session.communityId}/purohit_roster/${purohit.uid}`] = {
             uid: purohit.uid,
             name: purohit.name,
             phone: purohit.phone || 'N/A',
             status: 'ACTIVE',
             joinedAt: serverTimestamp()
          };

          const notifId = push(ref(db, `communities/${session.communityId}/notifications/${purohit.uid}`)).key;
          updates[`communities/${session.communityId}/notifications/${purohit.uid}/${notifId}`] = {
             id: notifId, title: "Roster Invitation", message: `${session.communityName} has added you to their active Purohit Roster!`, type: "REQUEST", timestamp: Date.now(), isRead: false
          };

          await executeSafeUpdate(updates, `${purohit.name} added to your Roster!`);
          logAudit("PUROHIT_HIRED", `Added Global Scholar ${purohit.name} to local panel.`);
        } catch (e) { showToast(e.message, "error"); }
      }
    });
  };

  // ✨ LEAVE MANAGEMENT ENGINE
  const handleToggleLeave = (purohit) => {
    const isCurrentlyOnLeave = purohit.status === 'ON_LEAVE';
    const newStatus = isCurrentlyOnLeave ? 'ACTIVE' : 'ON_LEAVE';

    setConfirmDialog({
      title: isCurrentlyOnLeave ? "Mark Active" : "Mark on Leave",
      message: isCurrentlyOnLeave 
        ? `${purohit.name} is back from leave? They will be available for new bookings again.`
        : `Mark ${purohit.name} as on leave/pilgrimage? This triggers standby replacement alerts across the network.`,
      confirmText: isCurrentlyOnLeave ? "MARK ACTIVE" : "MARK ON LEAVE",
      isDanger: !isCurrentlyOnLeave,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const updates = {};
          updates[`communities/${session.communityId}/purohit_roster/${purohit.uid}/status`] = newStatus;
          await executeSafeUpdate(updates, `Purohit status updated to ${newStatus.replace('_', ' ')}`);
        } catch (e) { showToast(e.message, "error"); }
      }
    });
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const matchSearch = b.yajamanaName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          b.poojaName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.gotra.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [bookings, searchTerm, statusFilter]);

  const filteredGlobalPurohits = useMemo(() => {
    return globalPurohits.filter(p => p.name.toLowerCase().includes(networkSearchTerm.toLowerCase()) || (p.specialization && p.specialization.toLowerCase().includes(networkSearchTerm.toLowerCase())));
  }, [globalPurohits, networkSearchTerm]);

  const activeLocalPurohits = localRoster.filter(r => r.status === 'ACTIVE');
  const onLeavePurohits = localRoster.filter(r => r.status === 'ON_LEAVE');

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full flex flex-col min-h-[90vh]">

      {/* ✨ TOAST ENGINE */}
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

      {/* ✨ CONFIRMATION DIALOG PORTAL */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center border-t-4 border-sanatani-orange">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner ${confirmDialog.isDanger ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
              {confirmDialog.isDanger ? <AlertTriangle size={32}/> : <CheckCircle2 size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-sm">{safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें')}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ PREMIUM HEADER BANNER */}
      <div className="bg-gradient-to-br from-orange-600 via-red-600 to-red-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden ring-1 ring-white/10 shrink-0">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10 pointer-events-none transform rotate-12">
           <Flame size={250} className="text-white"/>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="text-white">
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full border border-white/20 backdrop-blur-md mb-3 inline-block shadow-sm">
              {safeTranslate(workspaceType?.toLowerCase(), workspaceType, workspaceType, workspaceType)} {safeTranslate('workspace', 'Workspace', 'ওয়ার্কস্পেস', 'कार्यक्षेत्र')}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-3 tracking-tight leading-tight">
              {safeTranslate('nav_pooja', 'Pooja & Seva Desk', 'পূজা ও সেবা ডেস্ক', 'पूजा और सेवा डेस्क')}
            </h2>
            <p className="text-sm font-bold text-orange-100 mt-2 max-w-xl leading-relaxed">
              {safeTranslate('pooja_desk_desc', 'Manage sacred ritual reservations, capture Gotra & Nakshatra Sankalp accurately, and automatically sync Dakshina to your Treasury Ledger.', 'পবিত্র আচারের সংরক্ষণ পরিচালনা করুন এবং দক্ষিণা স্বয়ংক্রিয়ভাবে ট্রেজারিতে সিঙ্ক করুন।', 'अनुष्ठान आरक्षण प्रबंधित करें और दक्षिणा को अपने ट्रेजरी में स्वचालित रूप से सिंक करें।')}
            </p>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setShowGuide(!showGuide)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all backdrop-blur-md shadow-lg">
              <HelpCircle size={16}/> {safeTranslate('quick_guide', 'Guide', 'গাইড', 'गाइड')}
            </button>
            {isManagerOrAdmin && (
              <button onClick={() => { 
                setBookingForm(prev => ({...prev, assignedPurohit: activeLocalPurohits.length > 0 ? activeLocalPurohits[0].name : ''}));
                setShowBookingModal(true); 
              }} className="flex-1 sm:flex-none bg-white text-red-700 hover:bg-orange-50 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5">
                <Plus size={16}/> {safeTranslate('book_pooja', 'Book New Pooja', 'নতুন পূজা বুকিং', 'नई पूजा बुक करें')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 sm:p-6 rounded-2xl shadow-inner relative animate-in slide-in-from-top-2 shrink-0">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> {safeTranslate('quick_guide_title', 'Command Center Guide', 'কমান্ড সেন্টার গাইড', 'कमांड सेंटर गाइड')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3 bg-white/80 p-4 rounded-xl border border-orange-100 shadow-sm">
              <div className="text-orange-600 shrink-0"><BookOpen size={20}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-900 mb-0.5">1. Sacred Bookings</p>
                <p className="text-[9px] font-bold text-gray-500 leading-tight">Every booking securely stores the Yajamana's Gotra and Nakshatra for the priest's Sankalp recitation.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/80 p-4 rounded-xl border border-orange-100 shadow-sm">
              <div className="text-orange-600 shrink-0"><CheckCircle2 size={20}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-900 mb-0.5">2. Auto-Treasury Sync</p>
                <p className="text-[9px] font-bold text-gray-500 leading-tight">When an admin confirms a booking, the Dakshina amount automatically posts to your Treasury Ledger.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/80 p-4 rounded-xl border border-orange-100 shadow-sm">
              <div className="text-orange-600 shrink-0"><Globe2 size={20}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-900 mb-0.5">3. Universal Marketplace</p>
                <p className="text-[9px] font-bold text-gray-500 leading-tight">Need standby coverage for temple leave? Browse verified global scholars and invite them instantly.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✨ PREMIUM SEGMENTED TAB CONTROLLER */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm shrink-0">
        <div className="flex w-full sm:w-auto bg-gray-100/80 p-1.5 rounded-xl overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('BOOKINGS')} className={`flex-1 sm:w-40 py-3 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'BOOKINGS' ? 'bg-white text-sanatani-orange shadow-md border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}>
            <Ticket size={14}/> {safeTranslate('active_bookings', 'Bookings', 'বুকিং', 'बुकिंग')} ({bookings.length})
          </button>
          <button onClick={() => setActiveTab('CATALOG')} className={`flex-1 sm:w-40 py-3 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'CATALOG' ? 'bg-white text-sanatani-orange shadow-md border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}>
            <BookOpen size={14}/> {safeTranslate('pooja_catalog', 'Catalog', 'ক্যাটালগ', 'कैटलॉग')}
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setActiveTab('NETWORK')} className={`flex-1 sm:w-40 py-3 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'NETWORK' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>
              <Globe2 size={14}/> Universal Marketplace
            </button>
          )}
        </div>

        {activeTab === 'BOOKINGS' && (
          <div className="relative w-full sm:w-80 px-2 sm:px-0">
            <Search size={16} className="absolute left-5 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder={safeTranslate('search_records', "Search records...", "খুঁজুন...", "खोजें...")}
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-inner"
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ACTIVE BOOKINGS                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'BOOKINGS' && (
        <div className="space-y-6 animate-in fade-in flex-1">
          <div className="flex items-center gap-2 w-full overflow-x-auto pb-2 scrollbar-hide">
            {['ALL', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map(st => (
              <button 
                key={st} 
                onClick={() => setStatusFilter(st)}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border shadow-sm ${statusFilter === st ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {st === 'ALL' ? (safeTranslate('filter_all', 'All', 'সব', 'सभी')) : safeTranslate(`status_${st.toLowerCase()}`, st, st, st)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
            {filteredBookings.length > 0 ? (
              filteredBookings.map(book => (
                <div key={book.bookingId} className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col group relative">
                  <div className={`p-5 flex justify-between items-center border-b ${book.status === 'CONFIRMED' ? 'bg-orange-50/50 border-orange-100' : book.status === 'COMPLETED' ? 'bg-green-50/50 border-green-100' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                       <div className={`w-2.5 h-2.5 rounded-full ${book.status === 'CONFIRMED' ? 'bg-orange-500 animate-pulse' : book.status === 'COMPLETED' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                       <span className={`text-[10px] font-black uppercase tracking-widest ${book.status === 'CONFIRMED' ? 'text-orange-700' : book.status === 'COMPLETED' ? 'text-green-700' : 'text-gray-500'}`}>
                         {safeTranslate(`status_${book.status.toLowerCase()}`, book.status, book.status, book.status)}
                       </span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 font-bold tracking-widest">{book.bookingId}</span>
                  </div>

                  <div className="p-6 flex-1 flex flex-col sm:flex-row gap-6">
                    <div className="flex-1 space-y-3">
                       <h3 className="text-xl font-black text-gray-900 leading-tight group-hover:text-sanatani-orange transition-colors">{book.poojaName}</h3>
                       <div className="space-y-2 text-xs font-bold text-gray-500">
                         <p className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100"><CalendarDays size={14} className="text-blue-500"/> {book.bookingDate} at {book.bookingTime}</p>
                         <p className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100"><User size={14} className="text-purple-500"/> {safeTranslate('assigned_purohit', 'Purohit', 'পুরোহিত', 'पुरोहित')}: <span className="text-gray-800">{book.assignedPurohit || 'TBA'}</span></p>
                       </div>
                    </div>

                    <div className="sm:w-48 bg-gray-50 rounded-2xl p-4 border border-gray-100 flex flex-col justify-center shadow-inner shrink-0 relative overflow-hidden">
                       <div className="absolute top-0 right-0 p-2 opacity-5"><Flame size={48}/></div>
                       <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 relative z-10">{safeTranslate('yajamana_name', 'Yajamana', 'যজমান', 'यजमान')}</p>
                       <p className="text-sm font-black text-gray-900 mb-3 relative z-10">{book.yajamanaName}</p>

                       <div className="space-y-1.5 relative z-10">
                         <p className="text-[10px] font-bold text-gray-600 flex items-center justify-between"><span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-orange-500"/> {safeTranslate('gotra', 'Gotra', 'গোত্র', 'गोत्र')}:</span> <span className="font-black text-gray-900">{book.gotra}</span></p>
                         {book.nakshatra && <p className="text-[10px] font-bold text-gray-600 flex items-center justify-between"><span className="flex items-center gap-1.5"><Sparkles size={12} className="text-indigo-500"/> {safeTranslate('nakshatra', 'Nakshatra', 'নক্ষত্র', 'नक्षत्र')}:</span> <span className="font-black text-gray-900">{book.nakshatra}</span></p>}
                       </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-4 bg-white">
                    <div className="flex items-center gap-1.5 text-xs font-black text-green-700 bg-green-50 px-3 py-2 rounded-xl border border-green-200 uppercase tracking-widest shadow-sm">
                       {curSymbol}{book.dakshinaAmount} Dakshina
                    </div>

                    {book.status === 'CONFIRMED' && isManagerOrAdmin ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateStatus(book.bookingId, 'CANCELLED')} className="p-2.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors border border-transparent hover:border-red-100 shadow-sm" title={safeTranslate('cancel', 'Cancel', 'বাতিল', 'रद्द करें')}>
                          <X size={16}/>
                        </button>
                        <button onClick={() => handleUpdateStatus(book.bookingId, 'COMPLETED')} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-md hover:shadow-lg flex items-center gap-1.5 hover:-translate-y-0.5">
                          {safeTranslate('mark_completed', 'Mark Completed', 'সম্পন্ন', 'पूरा करें')} <Check size={14}/>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 shadow-sm">{book.status === 'CONFIRMED' ? 'Pending' : safeTranslate('archived', 'Archived', 'আর্কাইভ', 'पुरालेख')}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center text-gray-400 font-black bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
                <Ticket size={48} className="mx-auto mb-4 opacity-20 text-sanatani-orange"/>
                <p className="text-xl font-black text-gray-800 mb-2">{safeTranslate('no_bookings', 'No active pooja bookings found.', 'কোনো সক্রিয় বুকিং নেই।', 'कोई सक्रिय बुकिंग नहीं मिली।')}</p>
                <p className="text-xs uppercase tracking-widest font-bold text-gray-400">Click 'Book New Pooja' to schedule a ritual.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CATALOG                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'CATALOG' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in flex-1">
          {catalog.map(item => (
            <div key={item.id} className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 space-y-6 flex flex-col justify-between group relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-red-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
               <div>
                 <div className="flex justify-between items-start mb-5">
                   <span className="text-[9px] font-black uppercase px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 shadow-sm tracking-widest">{item.category}</span>
                   <Sparkles size={20} className="text-orange-200 group-hover:text-orange-500 transition-colors"/>
                 </div>
                 <h3 className="text-2xl font-black text-gray-900 leading-tight group-hover:text-sanatani-orange transition-colors">{item.name}</h3>
                 <p className="text-xs font-bold text-gray-500 mt-3 flex items-center gap-1.5 bg-gray-50 w-fit px-3 py-1.5 rounded-lg border border-gray-100"><Clock size={14} className="text-gray-400"/> Approx. Duration: {item.duration}</p>
               </div>

               <div className="flex justify-between items-end border-t border-gray-100 pt-6">
                 <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Base Dakshina</p>
                   <span className="text-3xl font-black text-green-600 tracking-tight">{curSymbol}{item.price}</span>
                 </div>
                 {isManagerOrAdmin && (
                   <button onClick={() => { setBookingForm(prev => ({...prev, poojaName: item.name, dakshinaAmount: item.price})); setShowBookingModal(true); }} className="bg-gray-900 hover:bg-sanatani-orange text-white px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all hover:-translate-y-1">
                     {safeTranslate('book_now', 'Book Now', 'বুক করুন', 'बुक करें')}
                   </button>
                 )}
               </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ✨ TAB 3: UNIVERSAL MARKETPLACE & STANDBY NETWORK (ALL WORKSPACE TYPES)   */}
      {/* ========================================================================= */}
      {activeTab === 'NETWORK' && isManagerOrAdmin && (
        <div className="space-y-8 animate-in fade-in flex-1">

          {/* SECTION A: LOCAL ROSTER & STANDBY LEAVE COVER */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden ring-1 ring-black/5">
             <div className="p-6 bg-gradient-to-r from-orange-50 to-red-50 border-b border-orange-100 flex justify-between items-center">
               <div>
                 <h3 className="text-lg font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="text-sanatani-orange"/> Local Organization Roster & Standby Cover</h3>
                 <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Manage leave replacements and active resident priests</p>
               </div>
               <span className="bg-white text-sanatani-orange border border-orange-200 px-3 py-1 rounded-lg text-xs font-black shadow-sm">{localRoster.length} Active</span>
             </div>

             <div className="p-6">
               {onLeavePurohits.length > 0 && (
                 <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-4 shadow-sm relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                   <ShieldAlert size={20} className="text-red-500 shrink-0 mt-0.5"/>
                   <div>
                     <p className="text-xs font-black text-red-800 uppercase tracking-widest mb-1">Emergency Standby Replacement Needed</p>
                     <p className="text-sm font-bold text-red-900 leading-relaxed">
                       {onLeavePurohits.length} priest(s) are currently on leave or pilgrimage. Sourcing temporary standby coverage from the Universal Registry below ensures daily Nitya Seva continues without interruption.
                     </p>
                   </div>
                 </div>
               )}

               {localRoster.length > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                   {localRoster.map(r => (
                     <div key={r.id} className="border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow group">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-black shadow-inner border border-orange-200">
                           {getInitial(r.name)}
                         </div>
                         <div>
                           <p className="text-sm font-black text-gray-900">{r.name}</p>
                           <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 mt-0.5"><Phone size={10}/> {r.phone}</p>
                         </div>
                       </div>
                       <button 
                         onClick={() => handleToggleLeave(r)}
                         className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border shadow-sm transition-colors ${r.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' : 'bg-red-50 text-red-700 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}
                       >
                         {r.status === 'ACTIVE' ? 'Active' : 'On Leave'}
                       </button>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                   <UserMinus size={32} className="mx-auto text-gray-400 mb-3 opacity-50"/>
                   <p className="text-sm font-black text-gray-600">Your organization panel is currently empty.</p>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Invite verified scholars from the Universal Marketplace below.</p>
                 </div>
               )}
             </div>
          </div>

          {/* SECTION B: UNIVERSAL GLOBAL REGISTRY */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden ring-1 ring-black/5">
             <div className="p-6 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
               <div>
                 <h3 className="text-lg font-black text-gray-900 flex items-center gap-2"><Globe2 className="text-blue-600"/> Universal Purohit Marketplace</h3>
                 <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Source verified Vedic scholars across all communities for festivals or standby leave</p>
               </div>
               <div className="relative w-full sm:w-72">
                 <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                 <input 
                   type="text" 
                   placeholder="Search by name or expertise..."
                   value={networkSearchTerm} 
                   onChange={e => setNetworkSearchTerm(e.target.value)} 
                   className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 shadow-sm transition-colors"
                 />
               </div>
             </div>

             <div className="p-6">
               <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                 {filteredGlobalPurohits.length > 0 ? (
                   filteredGlobalPurohits.map(p => {
                     const isAlreadyHired = localRoster.some(r => r.uid === p.uid);
                     return (
                       <div key={p.uid} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col group">
                         <div className="flex justify-between items-start mb-4">
                           <div className="flex items-center gap-3">
                             <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 rounded-full flex items-center justify-center font-black text-lg shadow-inner border border-blue-200 shrink-0">
                               {getInitial(p.name)}
                             </div>
                             <div>
                               <h4 className="text-base font-black text-gray-900 group-hover:text-blue-600 transition-colors">{p.name}</h4>
                               <span className="text-[8px] font-black uppercase tracking-widest bg-green-100 text-green-800 px-2 py-0.5 rounded flex items-center gap-1 w-fit mt-1 border border-green-200 shadow-sm"><ShieldCheck size={10}/> Verified Scholar</span>
                             </div>
                           </div>
                         </div>

                         <div className="space-y-2 mb-6">
                           <p className="text-xs font-bold text-gray-600 flex items-center gap-2"><MapPin size={12} className="text-gray-400"/> {p.location || 'Global (Available Online)'}</p>
                           <p className="text-xs font-bold text-gray-600 flex items-center gap-2"><Sparkles size={12} className="text-gray-400"/> {p.specialization || 'Vedic Rituals & Pujas'}</p>
                         </div>

                         <div className="mt-auto pt-4 border-t border-gray-100">
                           <button 
                             onClick={() => handleInvitePurohit(p)}
                             disabled={isAlreadyHired}
                             className={`w-full py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 ${isAlreadyHired ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-transparent' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-900 hover:text-white hover:border-gray-900'}`}
                           >
                             {isAlreadyHired ? <><Check size={14}/> On Panel</> : <><UserPlus size={14}/> Invite for Standby Cover</>}
                           </button>
                         </div>
                       </div>
                     )
                   })
                 ) : (
                   <div className="col-span-full py-16 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                     <Globe2 size={40} className="mx-auto mb-3 opacity-20 text-blue-500"/>
                     <p className="text-sm font-black text-gray-600">No verified global scholars found in the registry.</p>
                   </div>
                 )}
               </div>
             </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BOOK NEW POOJA                                                     */}
      {/* ========================================================================= */}
      {showBookingModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-[95%] sm:w-full max-w-2xl overflow-hidden border-t-4 border-sanatani-orange flex flex-col h-full max-h-[95dvh] sm:max-h-[90vh] animate-in zoom-in-95 ring-1 ring-white/20">

            <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
                <Ticket className="text-sanatani-orange" size={24}/> {safeTranslate('schedule_pooja', 'Schedule Pooja & Seva', 'পূজা ও সেবা নির্ধারণ করুন', 'पूजा और सेवा निर्धारित करें')}
              </h3>
              <button onClick={() => setShowBookingModal(false)} className="p-2.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors shadow-sm"><X size={18}/></button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto flex-1 min-h-0 bg-white pb-32 sm:pb-12 scrollbar-hide">
              <form onSubmit={handleCreateBooking} className="space-y-6 sm:space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <Flame size={16} className="text-orange-500"/>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Ritual Details</span>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('pooja_type', 'Select Ritual / Seva', 'আচার / সেবা নির্বাচন করুন', 'अनुष्ठान / सेवा चुनें')} *</label>
                    <select 
                      value={bookingForm.poojaName} 
                      onChange={e => {
                        const sel = catalog.find(c => c.name === e.target.value);
                        setBookingForm({...bookingForm, poojaName: e.target.value, dakshinaAmount: sel ? sel.price : bookingForm.dakshinaAmount});
                      }} 
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none cursor-pointer focus:border-sanatani-orange focus:bg-white focus:ring-4 focus:ring-orange-50 transition-all shadow-sm appearance-none"
                    >
                      {catalog.map(c => <option key={c.id} value={c.name}>{c.name} ({curSymbol}{c.price})</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('booking_date', 'Booking Date', 'বুকিংয়ের তারিখ', 'बुकिंग की तारीख')} *</label>
                      <input type="date" required value={bookingForm.bookingDate} onChange={e=>setBookingForm({...bookingForm, bookingDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 outline-none focus:border-sanatani-orange focus:bg-white transition-all shadow-sm cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('assigned_purohit', 'Assigned Purohit', 'নির্ধারিত পুরোহিত', 'नियुक्त पुरोहित')}</label>
                      <select 
                        value={bookingForm.assignedPurohit} 
                        onChange={e=>setBookingForm({...bookingForm, assignedPurohit: e.target.value})} 
                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 outline-none focus:border-sanatani-orange focus:bg-white transition-all shadow-sm cursor-pointer appearance-none"
                      >
                         <option value="">Unassigned (TBA)</option>
                         {activeLocalPurohits.map(p => (
                           <option key={p.uid} value={p.name}>{p.name}</option>
                         ))}
                         {activeLocalPurohits.length === 0 && <option disabled>No local priests available. Visit Marketplace tab.</option>}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2 mt-4">
                    <User size={16} className="text-blue-500"/>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Devotee Sankalp Data</span>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('devotee_full_name', 'Devotee Full Name', 'ভক্তের সম্পূর্ণ নাম', 'भक्त का पूरा नाम')} *</label>
                    <input type="text" required value={bookingForm.yajamanaName} onChange={e=>setBookingForm({...bookingForm, yajamanaName: e.target.value})} placeholder="e.g. Adesh Chandra" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all shadow-sm" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('gotra', 'Gotra', 'গোত্র', 'गोत्र')} ({safeTranslate('essential', 'Essential', 'আবশ্যক', 'आवश्यक')}) *</label>
                      <input type="text" required value={bookingForm.gotra} onChange={e=>setBookingForm({...bookingForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all shadow-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('nakshatra', 'Nakshatra', 'নক্ষত্র', 'नक्षत्र')} ({safeTranslate('optional', 'Optional', 'ঐচ্ছিক', 'वैकल्पिक')})</label>
                      <input type="text" value={bookingForm.nakshatra} onChange={e=>setBookingForm({...bookingForm, nakshatra: e.target.value})} placeholder="e.g. Rohini" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all shadow-sm" />
                    </div>
                  </div>
                </div>

                <div className="bg-green-50/50 border border-green-200 p-5 sm:p-6 rounded-2xl shadow-inner mt-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-green-500"></div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] font-black text-green-800 uppercase tracking-widest">{safeTranslate('dakshina_amount', 'Dakshina Amount', 'দক্ষিণা পরিমাণ', 'दक्षिणा राशि')} ({curSymbol}) *</label>
                    <span className="text-[9px] font-black uppercase tracking-widest bg-green-200 text-green-800 px-2 py-0.5 rounded border border-green-300 shadow-sm flex items-center gap-1"><Banknote size={10}/> Auto-Sync</span>
                  </div>
                  <input type="number" required value={bookingForm.dakshinaAmount} onChange={e=>setBookingForm({...bookingForm, dakshinaAmount: e.target.value})} className="w-full p-4 bg-white border border-green-300 rounded-xl text-2xl font-black text-green-700 outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all shadow-sm" />
                </div>

                <div className="pt-6 mt-8 border-t border-gray-100">
                  <button type="submit" disabled={submitting} className="w-full py-4 sm:py-5 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 disabled:opacity-50 disabled:transform-none flex justify-center items-center gap-2">
                    {submitting ? <Loader2 size={20} className="animate-spin"/> : <CheckCircle2 size={20}/>} {safeTranslate('btn_confirm_booking', 'Confirm Booking & Sync Treasury', 'বুকিং নিশ্চিত করুন ও ট্রেজারিতে সিঙ্ক করুন', 'बुकिंग की पुष्टि करें और ट्रेजरी सिंक करें')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🏛️ ENTERPRISE FOOTER CREDIT */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500 shrink-0">
        Made with <Sparkles size={12} className="text-sanatani-orange fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Universal Pooja & Seva Desk
      </div>

    </div>
  );
}

function getInitial(name) {
  return name ? name.charAt(0).toUpperCase() : 'ॐ';
}
