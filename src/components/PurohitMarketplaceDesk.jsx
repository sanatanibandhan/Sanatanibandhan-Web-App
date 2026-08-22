import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Sparkles, Star, Award, CheckCircle2, MapPin, Phone, CalendarDays, 
  UserCheck, Search, Filter, X, Loader2, Heart, ShieldCheck, BookOpen, 
  Send, Clock, Check, MessageSquare, AlertTriangle, WifiOff, FileText, Banknote,
  ChevronRight, ArrowLeft, Shield
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function PurohitMarketplaceDesk({ session, isOnline = navigator.onLine }) {
  const { t, language, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('GIGS'); // 'GIGS' | 'MY_ORDERS'
  const [submitting, setSubmitting] = useState(false);

  // ✨ FAIL-SAFE TRANSLATION HELPER
  const safeTranslate = (key, fallbackEn, fallbackBn, fallbackHi) => {
    const trans = t(key);
    if (trans !== key && trans) return trans;
    if (language === 'bn') return fallbackBn;
    if (language === 'hi') return fallbackHi;
    return fallbackEn;
  };

  // 💾 Offline Cached States
  const [gigs, setGigs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_purohit_gigs_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [contracts, setContracts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_purohit_contracts_${session?.communityId}`)) || []; } catch { return []; }
  });

  // UI Filters & Modals
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedGig, setSelectedGig] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState('DETAILS'); // 'DETAILS' | 'FORM'

  // Booking Form State
  const [bookingForm, setBookingForm] = useState({
    yajamanaName: session?.userName || '',
    gotra: '',
    nakshatra: '',
    address: '',
    ceremonyDate: '',
    ceremonyTime: '10:00 AM'
  });

  const [toast, setToast] = useState(null);
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 🔄 Realtime Data Synchronization
  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_purohit_marketplace', { workspace_type: workspaceType });

    const gigsRef = ref(db, `purohit_gigs`);
    const unsubGigs = onValue(gigsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ gigId: k, ...data[k] }));
        setGigs(list);
        localStorage.setItem(`sb_purohit_gigs_${session.communityId}`, JSON.stringify(list));
      } else {
        // Fallback Premium Gigs (Seed Data for Marketplace Demo)
        setGigs([
          {
            gigId: 'GIG-101',
            purohitName: 'Pt. Shrikant Sharma',
            title: 'Complete Satyanarayan Katha & Puja Vidhi',
            description: 'Traditional performance with precise Vedic Sanskrit pronunciation and Katha meaning explanation. Includes complete Sankalp, Navagraha Shanti, and Havan.',
            category: 'Mandir & Home Rituals',
            durationHours: 2.5,
            dakshinaFee: 1500,
            ratingAvg: 4.9,
            totalReviewsCount: 128,
            verifiedBadge: true,
            completedOrders: 340
          },
          {
            gigId: 'GIG-102',
            purohitName: 'Acharya Devavrat Shastri',
            title: 'Rudrabhishek Seva & Maha Mrityunjaya Mantra',
            description: 'Powerful ritual for health, peace, and spiritual shielding performed according to Vedic scriptures. I will bring all primary Yantra materials.',
            category: 'Special Seva',
            durationHours: 3,
            dakshinaFee: 2500,
            ratingAvg: 5.0,
            totalReviewsCount: 89,
            verifiedBadge: true,
            completedOrders: 195
          },
          {
            gigId: 'GIG-103',
            purohitName: 'Pandit Ramakant Ji',
            title: 'Vastu Shanti & Griha Pravesh Anushthan',
            description: 'Complete home purification ritual ensuring peace and prosperity in your new dwelling. Includes Dwar Puja and Kalash Sthapana.',
            category: 'Off-site Seva',
            durationHours: 4,
            dakshinaFee: 3500,
            ratingAvg: 4.8,
            totalReviewsCount: 45,
            verifiedBadge: false,
            completedOrders: 92
          }
        ]);
      }
      setLoading(false);
    });

    const conRef = ref(db, `communities/${session.communityId}/purohit_contracts`);
    const unsubCon = onValue(conRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ contractId: k, ...data[k] }));
        list.sort((a,b) => b.createdAt - a.createdAt);
        setContracts(list);
        localStorage.setItem(`sb_purohit_contracts_${session.communityId}`, JSON.stringify(list));
      } else {
        setContracts([]);
      }
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubGigs(); unsubCon(); clearTimeout(failsafe); };
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

  const logAudit = async (actionType, description) => {
    try { push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  // 🤝 Book Gig (Checkout with Sankalp & Auto-Treasury Sync)
  const handleBookGigSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGig) return;
    if (!bookingForm.yajamanaName.trim() || !bookingForm.gotra.trim() || !bookingForm.ceremonyDate) {
      return showToast(safeTranslate('err_all_fields_req', 'Yajamana Name, Gotra, and Date are required.', 'যজমানের নাম, গোত্র এবং তারিখ আবশ্যক।', 'यजमान का नाम, गोत्र और तिथि आवश्यक हैं।'), "error");
    }
    if (!checkQuota('free_booking_limit')) return;

    setSubmitting(true);
    try {
      const conKey = `CON-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const contractPayload = {
        contractId: conKey,
        gigId: selectedGig.gigId,
        purohitId: selectedGig.purohitId || 'PRH-GLOBAL',
        purohitName: selectedGig.purohitName,
        serviceTitle: selectedGig.title,
        clientId: session.uid,
        clientName: session.userName,
        yajamanaDetails: { ...bookingForm },
        agreedFee: selectedGig.dakshinaFee,
        status: 'CONFIRMED',
        createdAt: timestamp
      };

      const updates = {};
      updates[`communities/${session.communityId}/purohit_contracts/${conKey}`] = contractPayload;

      // Automatically log revenue to Treasury Ledger (Golden Rule: Zero friction accounting)
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
        id: transId,
        name: `${bookingForm.yajamanaName.trim()} [Purohit Booking]`,
        amount: selectedGig.dakshinaFee,
        note: `Marketplace Contract: ${selectedGig.title} (Gotra: ${bookingForm.gotra})`,
        collector: `${session.userName} (System Auto)`,
        timestamp: timestamp,
        category: 'General Dakshina',
        role: session.role || 'MEMBER'
      };

      await executeSafeUpdate(updates, safeTranslate('purohit_booked', 'Service successfully booked & synced to Treasury!', 'পরিষেবা বুক করা হয়েছে এবং ট্রেজারিতে সিঙ্ক হয়েছে!', 'सेवा सफलतापूर्वक बुक की गई और ट्रेजरी में सिंक की गई!'));
      logAudit("MARKETPLACE_ORDER", `Contracted service '${selectedGig.title}' with ${selectedGig.purohitName}`);
      pushToDataLayer('purchase', { transaction_id: conKey, value: selectedGig.dakshinaFee, currency: session?.currency?.code || 'BDT', item_name: selectedGig.title });

      setSelectedGig(null);
      setCheckoutStep('DETAILS');
      setBookingForm({ yajamanaName: session?.userName || '', gotra: '', nakshatra: '', address: '', ceremonyDate: '', ceremonyTime: '10:00 AM' });
      setActiveTab('MY_ORDERS');
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredGigs = useMemo(() => {
    return gigs.filter(g => {
      const matchSearch = g.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          g.purohitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          g.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCategory === 'ALL' || g.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [gigs, searchTerm, selectedCategory]);

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : 'ॐ';

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

      {/* HEADER HERO SECTION (Upwork/Fiverr Style) */}
      <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-indigo-950 p-8 sm:p-12 rounded-3xl shadow-2xl relative overflow-hidden ring-1 ring-black/10 text-white flex flex-col justify-center min-h-[250px]">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 opacity-10 pointer-events-none transform rotate-12">
           <Sparkles size={350} className="text-blue-300"/>
        </div>
        
        <div className="relative z-10 max-w-3xl">
          <span className="text-[10px] font-black uppercase tracking-widest bg-blue-500/30 text-blue-200 px-3 py-1 rounded-full border border-blue-400/30 shadow-inner mb-4 inline-block">
            {safeTranslate('verified_network', 'Verified Scholar Network', 'ভেরিফাইড স্কলার নেটওয়ার্ক', 'सत्यापित विद्वान नेटवर्क')}
          </span>
          <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight leading-tight">
            {safeTranslate('marketplace_title', 'Find the Perfect Vedic Scholar for your Rituals', 'আপনার আচারের জন্য নিখুঁত বৈদিক পণ্ডিত খুঁজুন', 'अपने अनुष्ठानों के लिए आदर्श वैदिक विद्वान खोजें')}
          </h2>
          <p className="text-sm font-medium text-blue-200 mb-8 max-w-xl leading-relaxed">
            {safeTranslate('marketplace_subtitle', 'Hire verified experts with transparent ratings, upfront pricing, and guaranteed Sanatani authenticity.', 'স্বচ্ছ রেটিং এবং গ্যারান্টিযুক্ত সত্যতা সহ যাচাইকৃত বিশেষজ্ঞদের নিয়োগ করুন।', 'पारदर्शी रेटिंग और गारंटीकृत प्रामाणिकता के साथ सत्यापित विशेषज्ञों को नियुक्त करें।')}
          </p>

          {/* Inline Hero Search */}
          <div className="relative w-full max-w-2xl flex items-center bg-white rounded-2xl p-1 shadow-2xl">
            <Search size={20} className="absolute left-5 text-gray-400" />
            <input 
              type="text" 
              placeholder={safeTranslate('search_rituals', "What service are you looking for? (e.g. Vastu Shanti)", "আপনি কি সেবা খুঁজছেন?", "आप कौन सी सेवा ढूंढ रहे हैं?")}
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-14 pr-4 py-4 bg-transparent text-sm font-bold text-gray-900 outline-none"
            />
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md hidden sm:block shrink-0">
              {safeTranslate('btn_search', 'Search', 'খুঁজুন', 'खोजें')}
            </button>
          </div>
        </div>
      </div>

      {/* TABS & FILTERS */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex w-full sm:w-auto bg-gray-100/80 p-1.5 rounded-xl overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('GIGS')} className={`flex-1 sm:w-40 py-3 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'GIGS' ? 'bg-white text-blue-700 shadow-md border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}>
            <Sparkles size={14}/> {safeTranslate('explore_gigs', 'Explore Gigs', 'গিগ অন্বেষণ করুন', 'गिग्स खोजें')}
          </button>
          <button onClick={() => setActiveTab('MY_ORDERS')} className={`flex-1 sm:w-40 py-3 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'MY_ORDERS' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}>
            <FileText size={14}/> {safeTranslate('my_orders', 'My Orders', 'আমার অর্ডার', 'मेरे आदेश')}
          </button>
        </div>

        {activeTab === 'GIGS' && (
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-hide px-2">
            <Filter size={14} className="text-gray-400 shrink-0 hidden sm:block"/>
            {['ALL', 'Mandir & Home Rituals', 'Special Seva', 'Off-site Seva'].map(cat => (
              <button 
                key={cat} 
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border shadow-sm ${selectedCategory === cat ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {cat === 'ALL' ? safeTranslate('filter_all', 'All Categories', 'সব বিভাগ', 'सभी श्रेणियां') : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EXPLORE GIGS (Fiverr Style Cards)                                  */}
      {/* ========================================================================= */}
      {activeTab === 'GIGS' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredGigs.length > 0 ? (
              filteredGigs.map(gig => (
                <div 
                  key={gig.gigId} 
                  onClick={() => { setSelectedGig(gig); setCheckoutStep('DETAILS'); }}
                  className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col group cursor-pointer ring-1 ring-black/5"
                >
                  {/* Card Image Banner */}
                  <div className="h-32 bg-gradient-to-br from-indigo-100 to-blue-50 relative flex items-center justify-center overflow-hidden border-b border-gray-100">
                     <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiMzYjgyZjYiLz48L3N2Zz4=')]"></div>
                     <Sparkles size={48} className="text-blue-200 group-hover:scale-125 transition-transform duration-700 ease-out"/>
                     
                     {/* Floating Purohit Avatar */}
                     <div className="absolute -bottom-6 left-6 w-16 h-16 bg-white rounded-full p-1 shadow-md border border-gray-100 z-10">
                        <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 rounded-full flex items-center justify-center font-black text-xl shadow-inner border border-blue-200">
                          {getInitial(gig.purohitName)}
                        </div>
                     </div>
                  </div>

                  <div className="p-6 pt-8 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-gray-900 flex items-center gap-1.5 hover:underline">
                          {gig.purohitName}
                          {gig.verifiedBadge && <ShieldCheck size={14} className="text-blue-500" title="Verified Scholar"/>}
                        </span>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{gig.category}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1 text-yellow-500 font-black text-sm">
                          <Star size={14} className="fill-current"/> {gig.ratingAvg}
                        </div>
                        <span className="text-[9px] text-gray-400 font-bold">({gig.totalReviewsCount} Reviews)</span>
                      </div>
                    </div>

                    <h3 className="text-base font-black text-gray-800 leading-snug group-hover:text-blue-600 transition-colors mt-2 mb-3 line-clamp-2">
                      I will perform {gig.title}
                    </h3>

                    <div className="mt-auto border-t border-gray-100 pt-4 flex justify-between items-center bg-white">
                      <Heart size={18} className="text-gray-300 hover:text-red-500 transition-colors"/>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{safeTranslate('starting_at', 'STARTING AT', 'শুরু হচ্ছে', 'शुरुआती कीमत')}</p>
                        <p className="text-xl font-black text-gray-900 tracking-tight">{curSymbol}{gig.dakshinaFee}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
                <Search size={48} className="mx-auto mb-4 opacity-20 text-blue-600"/>
                <p className="text-xl font-black text-gray-800 mb-1">{safeTranslate('no_gigs', 'No services found.', 'কোনো পরিষেবা পাওয়া যায়নি।', 'कोई सेवा नहीं मिली।')}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{safeTranslate('adjust_filters', 'Try adjusting your search criteria.', 'আপনার অনুসন্ধানের মানদণ্ড সামঞ্জস্য করার চেষ্টা করুন।', 'अपने खोज मापदंड को समायोजित करने का प्रयास करें।')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY ORDERS (Contracts Pipeline)                                     */}
      {/* ========================================================================= */}
      {activeTab === 'MY_ORDERS' && (
        <div className="space-y-6 animate-in fade-in max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between border-b border-gray-200 pb-4 px-2">
            <div>
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><FileText className="text-gray-700"/> {safeTranslate('my_orders', 'My Active Orders', 'আমার সক্রিয় অর্ডার', 'मेरे सक्रिय आदेश')}</h3>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Track rituals and contracted services</p>
            </div>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-black shadow-inner border border-gray-200">{contracts.length} Orders</span>
          </div>

          <div className="space-y-4">
            {contracts.length > 0 ? (
              contracts.map(con => (
                <div key={con.contractId} className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 relative overflow-hidden group">
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${con.status === 'COMPLETED' ? 'bg-green-500' : con.status === 'CONFIRMED' ? 'bg-blue-500' : 'bg-gray-400'}`}></div>

                  <div className="flex-1 space-y-3 pl-2 w-full">
                    <div className="flex justify-between items-center sm:justify-start sm:gap-3">
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border shadow-sm ${con.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' : con.status === 'CONFIRMED' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {con.status}
                      </span>
                      <span className="text-[9px] font-mono font-bold text-gray-400 tracking-widest bg-gray-50 px-2 py-0.5 rounded border border-gray-100">ID: {con.contractId}</span>
                    </div>
                    
                    <div>
                      <h4 className="font-black text-gray-900 text-lg leading-tight group-hover:text-blue-600 transition-colors line-clamp-1">{con.serviceTitle}</h4>
                      <p className="text-xs font-bold text-gray-500 mt-1 flex items-center gap-1.5"><UserCheck size={12} className="text-blue-500"/> Contracted to: <strong className="text-gray-700">{con.purohitName}</strong></p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-600 font-bold bg-gray-50 p-2.5 rounded-xl border border-gray-100 w-fit">
                      <span className="flex items-center gap-1"><CalendarDays size={12} className="text-gray-400"/> {con.yajamanaDetails?.ceremonyDate}</span>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1"><Clock size={12} className="text-gray-400"/> {con.yajamanaDetails?.ceremonyTime}</span>
                    </div>
                  </div>

                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4 border-t sm:border-t-0 sm:border-l border-gray-100 pt-4 sm:pt-0 sm:pl-6 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Dakshina Fee</p>
                      <p className="text-2xl font-black text-gray-900 tracking-tight">{curSymbol}{con.agreedFee}</p>
                    </div>
                    
                    <button className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-black py-2.5 px-4 rounded-xl text-[10px] uppercase tracking-widest shadow-sm transition-all flex items-center gap-1.5">
                      <MessageSquare size={14}/> Contact
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
                <ScrollText size={48} className="mx-auto mb-4 opacity-20 text-gray-400"/>
                <p className="text-xl font-black text-gray-800 mb-1">{safeTranslate('no_contracts', 'No active orders found.', 'কোনো সক্রিয় অর্ডার পাওয়া যায়নি।', 'कोई सक्रिय आदेश नहीं मिला।')}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{safeTranslate('explore_gigs_desc', 'Explore the marketplace to book a ritual.', 'একটি আচার বুক করতে মার্কেটপ্লেস অন্বেষণ করুন।', 'अनुष्ठान बुक करने के लिए बाज़ार का अन्वेषण करें।')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MULTI-STEP GIG DETAILS & CHECKOUT (FIVERR UI)                      */}
      {/* ========================================================================= */}
      {selectedGig && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-0 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-full max-h-[100dvh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 ring-1 ring-white/20">

            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-white shrink-0 z-10 sticky top-0">
              <button 
                onClick={() => {
                  if (checkoutStep === 'FORM') setCheckoutStep('DETAILS');
                  else setSelectedGig(null);
                }} 
                className="p-2 sm:p-2.5 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors flex items-center gap-1 shadow-sm border border-gray-200"
              >
                {checkoutStep === 'FORM' ? <ArrowLeft size={16}/> : <X size={16}/>} 
                <span className="text-[10px] font-black uppercase tracking-widest pr-1 hidden sm:block">{checkoutStep === 'FORM' ? 'Back to Details' : 'Close'}</span>
              </button>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:block">Step {checkoutStep === 'DETAILS' ? '1' : '2'} of 2:</span>
                <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border shadow-sm ${checkoutStep === 'DETAILS' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                  {checkoutStep === 'DETAILS' ? 'Service Overview' : 'Secure Checkout'}
                </span>
              </div>
            </div>

            {/* Modal Body: STEP 1 (DETAILS) */}
            {checkoutStep === 'DETAILS' && (
              <div className="overflow-y-auto flex-1 bg-white scrollbar-hide flex flex-col md:flex-row pb-24 md:pb-0">
                
                {/* Left Side: Gig Information */}
                <div className="flex-1 p-6 sm:p-8 md:border-r border-gray-100 space-y-8">
                   
                   {/* Breadcrumb & Title */}
                   <div>
                     <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">{selectedGig.category}</span>
                     <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mt-2 mb-4 leading-tight">{selectedGig.title}</h2>
                     
                     <div className="flex flex-wrap items-center gap-4 text-sm">
                       <div className="flex items-center gap-2 font-black text-gray-800">
                         <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">{getInitial(selectedGig.purohitName)}</div>
                         {selectedGig.purohitName}
                         {selectedGig.verifiedBadge && <ShieldCheck size={14} className="text-blue-500" title="Verified Scholar"/>}
                       </div>
                       <span className="text-gray-300">|</span>
                       <div className="flex items-center gap-1 text-yellow-500 font-black">
                         <Star size={16} className="fill-current"/> {selectedGig.ratingAvg} <span className="text-gray-500 font-bold ml-1 text-xs">({selectedGig.totalReviewsCount})</span>
                       </div>
                       <span className="text-gray-300">|</span>
                       <span className="text-xs font-bold text-gray-500">{selectedGig.completedOrders} Orders Completed</span>
                     </div>
                   </div>

                   {/* Main Image Banner */}
                   <div className="w-full h-48 sm:h-64 bg-gradient-to-br from-indigo-50 to-blue-100 rounded-2xl border border-gray-200 shadow-inner flex items-center justify-center overflow-hidden relative">
                     <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiMzYjgyZjYiLz48L3N2Zz4=')]"></div>
                     <Sparkles size={64} className="text-blue-200"/>
                   </div>

                   {/* About This Gig */}
                   <div>
                     <h3 className="text-lg font-black text-gray-900 mb-3 border-b border-gray-100 pb-2">About This Ritual</h3>
                     <p className="text-sm font-bold text-gray-600 leading-relaxed whitespace-pre-wrap">{selectedGig.description}</p>
                   </div>
                </div>

                {/* Right Side: Pricing & CTA (Sticky on Desktop, Fixed Bottom on Mobile) */}
                <div className="w-full md:w-80 bg-gray-50 md:bg-white p-6 sm:p-8 flex flex-col justify-start md:sticky md:top-0 h-auto md:h-full border-t md:border-t-0 border-gray-200 fixed bottom-0 left-0 right-0 z-20 md:z-auto">
                   
                   <div className="hidden md:block">
                     <div className="flex justify-between items-center mb-6">
                       <h3 className="text-base font-black text-gray-900">Standard Package</h3>
                       <span className="text-2xl font-black text-gray-900">{curSymbol}{selectedGig.dakshinaFee}</span>
                     </div>
                     <p className="text-xs font-bold text-gray-600 mb-6 leading-relaxed">Includes complete ritual performance, personalized Sankalp, and basic Samagri checklist provision.</p>
                     
                     <div className="space-y-3 mb-8">
                       <div className="flex items-center gap-3 text-xs font-black text-gray-700">
                         <Clock size={16} className="text-gray-400"/> Approx. {selectedGig.durationHours} Hours Duration
                       </div>
                       <div className="flex items-center gap-3 text-xs font-black text-gray-700">
                         <Check size={16} className="text-green-500"/> Certified Vedic Pronunciation
                       </div>
                       <div className="flex items-center gap-3 text-xs font-black text-gray-700">
                         <Check size={16} className="text-green-500"/> Post-Ritual Consultation
                       </div>
                     </div>
                   </div>

                   {/* Mobile View CTA Summary */}
                   <div className="md:hidden flex justify-between items-center mb-4">
                     <div>
                       <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Dakshina</p>
                       <span className="text-xl font-black text-gray-900">{curSymbol}{selectedGig.dakshinaFee}</span>
                     </div>
                   </div>

                   <button 
                     onClick={() => setCheckoutStep('FORM')}
                     className="w-full py-4 sm:py-5 bg-gray-900 hover:bg-black text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-black uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 flex justify-center items-center gap-2"
                   >
                     {safeTranslate('continue_checkout', 'Continue to Checkout', 'চেকআউটে যান', 'चेकआउट पर जाएं')} <ChevronRight size={18}/>
                   </button>
                </div>
              </div>
            )}

            {/* Modal Body: STEP 2 (CHECKOUT FORM) */}
            {checkoutStep === 'FORM' && (
              <form onSubmit={handleBookGigSubmit} className="p-6 sm:p-10 overflow-y-auto flex-1 bg-gray-50/30 scrollbar-hide space-y-8">
                
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 border border-blue-100"><Sparkles size={24} className="text-blue-500"/></div>
                  <div>
                    <h4 className="text-sm font-black text-gray-900 line-clamp-1">{selectedGig.title}</h4>
                    <p className="text-xs font-bold text-gray-500 mt-1">Provider: {selectedGig.purohitName}</p>
                  </div>
                </div>

                <div className="space-y-5 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-2">
                    <UserCheck size={18} className="text-blue-600"/>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-800">Yajamana Identity & Sankalp Data</span>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{safeTranslate('yajamana_name', 'Yajamana Full Name')} *</label>
                    <input type="text" required value={bookingForm.yajamanaName} onChange={e=>setBookingForm({...bookingForm, yajamanaName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-blue-500 transition-all shadow-sm" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{safeTranslate('gotra', 'Gotra')} ({safeTranslate('essential', 'Mandatory')}) *</label>
                      <input type="text" required value={bookingForm.gotra} onChange={e=>setBookingForm({...bookingForm, gotra: e.target.value})} placeholder="e.g. Kashyap" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-blue-500 transition-all shadow-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{safeTranslate('nakshatra', 'Nakshatra')}</label>
                      <input type="text" value={bookingForm.nakshatra} onChange={e=>setBookingForm({...bookingForm, nakshatra: e.target.value})} placeholder="e.g. Rohini" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-blue-500 transition-all shadow-sm" />
                    </div>
                  </div>
                </div>

                <div className="space-y-5 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-2">
                    <CalendarDays size={18} className="text-purple-600"/>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-800">Event Logistics</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{safeTranslate('ceremony_date', 'Ceremony Date')} *</label>
                      <input type="date" required value={bookingForm.ceremonyDate} onChange={e=>setBookingForm({...bookingForm, ceremonyDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-purple-500 transition-all shadow-sm cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{safeTranslate('time_slot', 'Time Slot')}</label>
                      <input type="text" value={bookingForm.ceremonyTime} onChange={e=>setBookingForm({...bookingForm, ceremonyTime: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-purple-500 transition-all shadow-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{safeTranslate('address_venue', 'Ceremony Address / Venue')}</label>
                    <input type="text" value={bookingForm.address} onChange={e=>setBookingForm({...bookingForm, address: e.target.value})} placeholder="Home address or Mandir Hall" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-purple-500 transition-all shadow-sm" />
                  </div>
                </div>

                {/* Secure Treasury Sync Block (Checkout Summary) */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-3xl border border-green-200 shadow-inner mt-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="text-center sm:text-left">
                    <p className="text-[10px] font-black text-green-800 uppercase tracking-widest mb-1">{safeTranslate('total_payable_dakshina', 'Total Payable Dakshina')}</p>
                    <p className="text-4xl font-black text-green-600 tracking-tight">{curSymbol}{selectedGig.dakshinaFee}</p>
                  </div>
                  
                  {/* Secure payment badge */}
                  <div className="bg-white px-4 py-3 rounded-2xl border border-green-100 shadow-sm flex items-center gap-3 w-full sm:w-auto justify-center">
                     <div className="bg-green-100 p-1.5 rounded-full"><Shield size={16} className="text-green-600"/></div>
                     <div className="text-left">
                       <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Enterprise Security</p>
                       <p className="text-xs font-black text-gray-800 uppercase tracking-widest">Auto-Syncs to Treasury</p>
                     </div>
                  </div>
                </div>

                <div className="pt-4 shrink-0">
                  <button type="submit" disabled={submitting} className="w-full py-5 bg-gradient-to-r from-gray-900 to-black hover:from-black hover:to-gray-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 flex justify-center items-center gap-2 disabled:opacity-50 disabled:transform-none border border-gray-800">
                    {submitting ? <Loader2 size={20} className="animate-spin mx-auto"/> : <CheckCircle2 size={20}/>} {submitting ? 'PROCESSING...' : safeTranslate('confirm_book_pay', 'Confirm Booking & Pay Dakshina')}
                  </button>
                  <p className="text-center text-[10px] font-bold text-gray-400 mt-4 uppercase tracking-widest">By confirming, you agree to the Sanatani Bandhan service terms.</p>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500 shrink-0">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Global Purohit Marketplace
      </div>
    </div>
  );
}
