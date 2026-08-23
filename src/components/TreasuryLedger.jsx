import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom'; 
import { ref, onValue, update, push, increment } from 'firebase/database';
import { db } from '../firebase';
import { 
  Banknote, TrendingUp, TrendingDown, Search, Plus, Loader2, Download, ShieldAlert, 
  History, Edit, CalendarDays, FileText, Lock, ChevronDown, ChevronUp, User, 
  UserCheck, Filter, ChevronLeft, ChevronRight, X, AlertCircle, FileDigit, 
  Camera, Image as ImageIcon, ArrowUpDown, HelpCircle, Lightbulb, CheckCircle2,
  WifiOff, Heart, AlertTriangle, BrainCircuit, Scale, Package, Repeat, Send, Box
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm'; 
import { usePlanGate } from '../hooks/usePlanGate';

// ✨ IMPORTING BOTH PDF & CSV ENGINES
import { generateReceiptPdf, generateTreasuryReportPdf, generateDonorStatementPdf, generateUtsavStatementPdf } from '../utils/pdfGenerator'; 
import { generateTreasuryCSV, generateGroupCSV } from '../utils/csvGenerator';

// ✨ CHART OF ACCOUNTS (ENTERPRISE CATEGORIZATION)
const INCOME_CATEGORIES = ['General Dakshina', 'Utsav Chanda', 'Hall / Kutir Booking', 'Prasadam Sales', 'Asset Donation', 'Trust Grant', 'Other Income'];
const EXPENSE_CATEGORIES = ['Langar & Groceries', 'Electricity & Utilities', 'Priest & Staff Seva', 'Maintenance & Repairs', 'Event Logistics', 'Marketing & Prachar', 'Other Expense'];
const ASSET_CATEGORIES = ['Grains & Food', 'Clothing / Vastra', 'Metals / Ornaments', 'Building Materials', 'Livestock / Fodder', 'Other Physical Asset'];

export default function TreasuryLedger({ session, isOnline = navigator.onLine }) {
  const { t, language, workspaceType } = useLanguage(); 
  const { checkQuota } = usePlanGate(session);

  // ✨ FAIL-SAFE TRANSLATION HELPER
  const safeTranslate = (key, fallbackEn, fallbackBn, fallbackHi) => {
    const trans = t(key);
    if (trans !== key && trans) return trans;
    if (language === 'bn') return fallbackBn;
    if (language === 'hi') return fallbackHi;
    return fallbackEn;
  };

  // ✨ Dynamic Institution Label mapping for all Organization Types
  const institutionLabel = useMemo(() => {
    switch (String(workspaceType || '').toUpperCase()) {
      case 'GOSHALA': return safeTranslate('workspace_goshala', 'Goshala', 'গোশালা', 'गौशाला');
      case 'SANGHA': return safeTranslate('workspace_sangha', 'Sangha', 'সংঘ', 'संघ');
      case 'ASHRAM': return safeTranslate('workspace_ashram', 'Ashram', 'আশ্রম', 'आश्रम');
      case 'GURUKUL': return safeTranslate('workspace_gurukul', 'Gurukul', 'গুরূকুল', 'गुरुकुल');
      case 'SATSANG': return safeTranslate('workspace_satsang', 'Satsang', 'সৎসঙ্গ', 'सत्संग');
      case 'YOGA': return safeTranslate('workspace_yoga', 'Yoga Center', 'যোগ কেন্দ্র', 'योग केंद्र');
      case 'TRUST': return safeTranslate('workspace_trust', 'Trust', 'ট্রাস্ট', 'ट्रस्ट');
      case 'TIRTH': return safeTranslate('workspace_tirth', 'Tirth / Dham', 'তীর্থ / ধাম', 'तीर्थ / धाम');
      case 'SAMAJ': return safeTranslate('workspace_samaj', 'Samaj', 'সমাজ', 'समाज');
      case 'PUROHIT': return safeTranslate('workspace_purohit', 'Scholar Desk', 'স্কলার ডেস্ক', 'विद्वान डेस्क');
      case 'MANDIR':
      default: return safeTranslate('workspace_mandir', 'Mandir', 'মন্দির', 'मंदिर');
    }
  }, [workspaceType, language, t]);

  // ✨ Dynamic Tab Labels based on Org Type
  const assetTabLabel = useMemo(() => {
    const wt = String(workspaceType || '').toUpperCase();
    if (wt === 'GOSHALA') return safeTranslate('tab_gau_fodder', 'Gau Fodder & Assets', 'গোখাদ্য ও সম্পদ', 'गौ चारा और संपत्ति');
    if (wt === 'ASHRAM' || wt === 'SANGHA') return safeTranslate('tab_annadaan_assets', 'Annadaan & Assets', 'অন্নদান ও সম্পদ', 'अन्नदान और संपत्ति');
    if (wt === 'PUROHIT') return safeTranslate('tab_vastra_dakshina', 'Vastra & Gifts', 'বস্ত্র ও উপহার', 'वस्त्र और उपहार');
    return safeTranslate('tab_bhandara_assets', 'Bhandara & Assets', 'ভান্ডারা ও সম্পদ', 'भंडारा और संपत्ति');
  }, [workspaceType, language, t]);

  const pledgeTabLabel = useMemo(() => {
    const wt = String(workspaceType || '').toUpperCase();
    if (wt === 'GOSHALA') return safeTranslate('tab_gau_palan', 'Gau Palan Pledges', 'গোপালন প্রতিশ্রুতি', 'गौ पालन प्रतिज्ञा');
    if (wt === 'ASHRAM' || wt === 'SANGHA') return safeTranslate('tab_guru_seva', 'Guru Seva Pledges', 'গুরু সেবা প্রতিশ্রুতি', 'गुरु सेवा प्रतिज्ञा');
    return safeTranslate('tab_masik_chanda', 'Masik Chanda', 'মাসিক চাঁদা', 'मासिक चंदा');
  }, [workspaceType, language, t]);

  const [activeTab, setActiveTab] = useState('INCOME'); // 'INCOME' | 'EXPENSE' | 'ASSETS' | 'PLEDGES' | 'P_AND_L'
  const [searchTerm, setSearchTerm] = useState('');

  // 💾 OFFLINE CACHE INITIALIZATION
  const [donations, setDonations] = useState(() => {
    try { const cached = localStorage.getItem(`sb_donations_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });
  const [expenses, setExpenses] = useState(() => {
    try { const cached = localStorage.getItem(`sb_expenses_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });
  const [assets, setAssets] = useState(() => {
    try { const cached = localStorage.getItem(`sb_inkind_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });
  const [pledges, setPledges] = useState(() => {
    try { const cached = localStorage.getItem(`sb_pledges_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });
  const [members, setMembers] = useState(() => {
    try { const cached = localStorage.getItem(`sb_members_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });
  const [events, setEvents] = useState(() => {
    try { const cached = localStorage.getItem(`sb_events_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });

  const [loading, setLoading] = useState(true);

  // Date & Sort Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortBy, setSortBy] = useState('NEWEST'); 

  const [expandedGroup, setExpandedGroup] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [submitting, setSubmitting] = useState(false);

  // Quick Guide State
  const [showGuide, setShowGuide] = useState(false);

  // ✨ ENTERPRISE MODALS & TOASTS
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showPledgeModal, setShowPledgeModal] = useState(false);

  const [viewMemoModal, setViewMemoModal] = useState(null);
  const [editExpensePrompt, setEditExpensePrompt] = useState({ show: false, expense: null, newAmount: '' });
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Forms
  const [donorType, setDonorType] = useState('MEMBER'); 
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  
  const [donationForm, setDonationForm] = useState({ memberId: '', memberName: '', guestPhone: '', amount: '', note: '', paymentMethod: 'CASH', category: 'General Dakshina' });
  const [expenseForm, setExpenseForm] = useState({ eventName: '', itemName: '', amount: '', voucherNo: '', receiptImage: null, paymentMethod: 'CASH', involvedPerson: session?.userName || '', category: 'Event Logistics' });
  const [assetForm, setAssetForm] = useState({ donorId: '', donorName: '', guestPhone: '', itemName: '', category: 'Grains & Food', quantity: '', unit: 'KG', estimatedValue: '', allocatedTo: '' });
  const [pledgeForm, setPledgeForm] = useState({ memberId: '', memberName: '', memberPhone: '', committedAmount: '', frequency: 'MONTHLY', dueDay: '1' });

  const [eventSearch, setEventSearch] = useState('');
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [showExpenseMemberDropdown, setShowExpenseMemberDropdown] = useState(false);

  const memberDropdownRef = useRef(null);
  const eventDropdownRef = useRef(null);
  const expenseMemberDropdownRef = useRef(null);
  const isRestricted = session?.role === 'MEMBER' || session?.role === 'DEVOTEE';
  const isStaff = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(event.target)) setShowMemberDropdown(false);
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(event.target)) setShowEventDropdown(false);
      if (expenseMemberDropdownRef.current && !expenseMemberDropdownRef.current.contains(event.target)) setShowExpenseMemberDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // CORE DATA SYNCHRONIZATION WITH CACHING
  useEffect(() => {
    if (!session?.communityId) return;

    const donRef = ref(db, `communities/${session.communityId}/logs/Donation`);
    const expRef = ref(db, `communities/${session.communityId}/logs/Expense`);
    const assetRef = ref(db, `communities/${session.communityId}/logs/InKindAssets`);
    const pledgeRef = ref(db, `communities/${session.communityId}/logs/RecurringPledges`);
    const memRef = ref(db, `communities/${session.communityId}/members`);
    const eventRef = ref(db, `communities/${session.communityId}/events`);

    const unsubDon = onValue(donRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        setDonations(arr); localStorage.setItem(`sb_donations_${session.communityId}`, JSON.stringify(arr));
      } else { setDonations([]); localStorage.removeItem(`sb_donations_${session.communityId}`); }
    });

    const unsubExp = onValue(expRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        setExpenses(arr); localStorage.setItem(`sb_expenses_${session.communityId}`, JSON.stringify(arr));
      } else { setExpenses([]); localStorage.removeItem(`sb_expenses_${session.communityId}`); }
    });

    const unsubAsset = onValue(assetRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        setAssets(arr); localStorage.setItem(`sb_inkind_${session.communityId}`, JSON.stringify(arr));
      } else { setAssets([]); localStorage.removeItem(`sb_inkind_${session.communityId}`); }
    });

    const unsubPledge = onValue(pledgeRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        setPledges(arr); localStorage.setItem(`sb_pledges_${session.communityId}`, JSON.stringify(arr));
      } else { setPledges([]); localStorage.removeItem(`sb_pledges_${session.communityId}`); }
    });

    const unsubMem = onValue(memRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const arr = Object.keys(data).map(k => ({ id: k, name: data[k].name, phone: data[k].phone, role: data[key].role }));
        setMembers(arr); localStorage.setItem(`sb_members_${session.communityId}`, JSON.stringify(arr));
      }
    });

    const unsubEvent = onValue(eventRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const arr = Object.keys(data).map(k => data[k].title);
        const expEvents = [...new Set(expenses.map(e => e.eventName))];
        const mergedEvents = [...new Set([...arr, ...expEvents])].filter(Boolean);
        setEvents(mergedEvents); localStorage.setItem(`sb_events_${session.communityId}`, JSON.stringify(mergedEvents));
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubDon(); unsubExp(); unsubAsset(); unsubPledge(); unsubMem(); unsubEvent(); clearTimeout(failsafe); };
  }, [session?.communityId, expenses.length]);

  const executeSafeUpdate = async (updates, successMsg = null, offlineMsg = null) => {
    if (!isOnline) {
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

  const logAudit = async (actionType, description) => {
    try { push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  const handleImageCompression = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast(safeTranslate('err_only_images', "Only images allowed.", "শুধুমাত্র ছবি অনুমোদিত।", "केवल छवियों की अनुमति है।"), "error");

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = document.createElement('img');
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_DIMENSION = 800; 
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; }
            } else {
              if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const base64String = canvas.toDataURL('image/jpeg', 0.5); 
            const sizeInKb = (base64String.length * 0.75) / 1024;
            if (sizeInKb > 500) return showToast(safeTranslate('error', 'Error') + ": Image is still too large.", "error");

            setExpenseForm({ ...expenseForm, receiptImage: base64String });
          } catch (err) { showToast(safeTranslate('error', 'Error') + ": Image processing failed. Out of memory.", "error"); }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    } catch (error) { showToast(safeTranslate('error', 'Error') + ": " + error.message, "error"); }
  };

  const handleQuickAdd = (groupName) => {
    pushToDataLayer('quick_add_transaction', { category: activeTab, group_name: groupName });

    if (activeTab === 'INCOME') {
      if (groupName.includes('[Guest]')) {
        setDonorType('GUEST');
        setDonationForm({...donationForm, memberName: groupName.split(' (')[0], memberId: ''});
      } else {
        setDonorType('MEMBER');
        setMemberSearch(groupName); 
        const match = groupName.match(/\(SB-(.*?)\)/);
        if (match) setDonationForm({...donationForm, memberName: groupName.split(' (')[0], memberId: `SB-${match[1]}`});
      }
      setShowDonationModal(true);
    } else if (activeTab === 'EXPENSE') {
      setEventSearch(groupName);
      setExpenseForm({...expenseForm, eventName: groupName});
      setShowExpenseModal(true);
    } else if (activeTab === 'ASSETS') {
      setDonorType('MEMBER');
      setMemberSearch(groupName);
      const match = groupName.match(/\(SB-(.*?)\)/);
      if (match) setAssetForm({...assetForm, donorName: groupName.split(' (')[0], donorId: `SB-${match[1]}`});
      setShowAssetModal(true);
    }
  };

  // 💰 HANDLE CASH INCOME
  const handleRecordDonation = async (e) => {
    e.preventDefault();
    if (isRestricted) return showToast(safeTranslate('err_unauthorized', 'Unauthorized.'), "error");
    if (!donationForm.amount) return showToast(safeTranslate('err_amount_required', 'Amount required.'), "error");

    setSubmitting(true);
    try {
      const amt = parseFloat(donationForm.amount);
      const ts = Date.now();
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;
      const updates = {};
      let formattedName = "";

      if (donorType === 'MEMBER') {
        if (!donationForm.memberId) throw new Error(safeTranslate('err_select_member', 'Select a member.'));
        formattedName = `${donationForm.memberName} (SB-${donationForm.memberId.replace('SB-','')}) [Member]`;
        updates[`communities/${session.communityId}/members/${donationForm.memberId}/totalDonated`] = increment(amt);
        updates[`communities/${session.communityId}/members/${donationForm.memberId}/lastDonationTimestamp`] = ts;
      } else {
        if (!donationForm.memberName) throw new Error(safeTranslate('err_guest_name_req', 'Guest name required.'));
        const guestId = `GST-${Math.floor(1000 + Math.random() * 9000)}`;
        formattedName = `${donationForm.memberName.trim()} (${guestId}) [Guest]`;
      }

      const noteWithPayment = donationForm.note.trim() ? `${donationForm.note.trim()} | Via: ${donationForm.paymentMethod}` : `Via: ${donationForm.paymentMethod}`;

      const newItem = {
        id: transId, name: formattedName, amount: amt, note: noteWithPayment, phone: donationForm.guestPhone || '',
        collector: `${session.userName} (${session.uid})`, timestamp: ts, role: session.role,
        category: donationForm.category, donorId: donationForm.memberId || guestId
      };

      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = newItem;

      await executeSafeUpdate(updates, null, `৳${amt} donation cached offline.`);

      pushToDataLayer('purchase', {
        transaction_id: transId, affiliation: session.communityName, value: amt, currency: 'BDT',
        donor_type: donorType, payment_type: donationForm.paymentMethod,
        items: [{ item_name: 'Community Donation', item_category: donationForm.category, price: amt, quantity: 1 }]
      });

      logAudit("CHANDA_RECORDED", `Recorded ৳${amt} from ${formattedName} (${donationForm.category})`);

      setShowDonationModal(false);
      setDonationForm({ memberId: '', memberName: '', guestPhone: '', amount: '', note: '', paymentMethod: 'CASH', category: 'General Dakshina' });
      setMemberSearch('');

      setConfirmDialog({
        title: safeTranslate('success', 'Transaction Logged', 'লেনদেন সফল', 'लेनदेन सफल'),
        message: `✅ ${curSymbol}${amt} ${safeTranslate('recorded_success', 'recorded successfully!', 'সফলভাবে রেকর্ড করা হয়েছে!', 'सफलतापूर्वक दर्ज किया गया!')}\n\nWould you like to download the official PDF receipt now?`,
        confirmText: safeTranslate('download_receipt', 'DOWNLOAD RECEIPT', 'রসিদ ডাউনলোড করুন', 'रसीद डाउनलोड करें'),
        isDanger: false,
        onConfirm: async () => { setConfirmDialog(null); await handleDownloadReceipt(newItem, 'INCOME'); }
      });
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  // 📉 HANDLE EXPENSES
  const handleRecordExpense = async (e) => {
    e.preventDefault();
    if (isRestricted) return showToast(safeTranslate('err_unauthorized', 'Unauthorized.'), "error");
    if (!eventSearch || !expenseForm.itemName || !expenseForm.amount) return showToast(safeTranslate('err_all_fields_req', 'All fields required.'), "error");

    setSubmitting(true);
    try {
      const amt = parseFloat(expenseForm.amount);
      const ts = Date.now();
      const transId = push(ref(db, `communities/${session.communityId}/logs/Expense`)).key;
      const updates = {};

      const itemWithPayment = `${expenseForm.itemName.trim()} (Via: ${expenseForm.paymentMethod})`;
      const spenderName = expenseForm.involvedPerson.trim() || session.userName;

      const newItem = {
        id: transId, eventName: eventSearch.trim(), itemName: itemWithPayment, amount: amt,
        voucherNo: expenseForm.voucherNo.trim() || safeTranslate('no_memo', 'No Memo', 'কোনো মেমো নেই', 'कोई मेमो नहीं'), 
        receiptImage: expenseForm.receiptImage || null, involvedPerson: spenderName, loggedBy: session.userName, timestamp: ts,
        category: expenseForm.category
      };

      updates[`communities/${session.communityId}/logs/Expense/${transId}`] = newItem;

      await executeSafeUpdate(updates, null, `৳${amt} expense cached offline.`);

      pushToDataLayer('record_expense', {
        transaction_id: transId, affiliation: session.communityName, value: amt, currency: 'BDT',
        event_name: eventSearch.trim(), payment_type: expenseForm.paymentMethod,
        has_voucher_text: !!expenseForm.voucherNo, has_receipt_image: !!expenseForm.receiptImage,
        items: [{ item_name: expenseForm.itemName.trim(), item_category: expenseForm.category, price: amt, quantity: 1 }]
      });

      logAudit("EXPENSE_RECORDED", `Logged ৳${amt} for ${eventSearch} (${expenseForm.category})`);

      setShowExpenseModal(false);
      setExpenseForm({ eventName: '', itemName: '', amount: '', voucherNo: '', receiptImage: null, paymentMethod: 'CASH', involvedPerson: session.userName, category: 'Event Logistics' });
      setEventSearch('');

      setConfirmDialog({
        title: safeTranslate('success', 'Expense Logged'),
        message: `✅ ${curSymbol}${amt} Expense ${safeTranslate('recorded_success', 'recorded successfully!')}\n\nWould you like to download the official expense voucher PDF now?`,
        confirmText: safeTranslate('download_receipt', 'DOWNLOAD VOUCHER'),
        isDanger: false,
        onConfirm: async () => { setConfirmDialog(null); await handleDownloadReceipt(newItem, 'EXPENSE'); }
      });
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  // 📦 HANDLE IN-KIND ASSETS (BHANDARA) & SEVA GAMIFICATION
  const handleRecordAsset = async (e) => {
    e.preventDefault();
    if (isRestricted) return showToast(safeTranslate('err_unauthorized', 'Unauthorized.'), "error");
    if (!assetForm.itemName || !assetForm.quantity) return showToast(safeTranslate('err_all_fields_req', 'All fields required.'), "error");

    setSubmitting(true);
    try {
      const estimatedCashValue = parseFloat(assetForm.estimatedValue) || 0;
      const ts = Date.now();
      const assetId = push(ref(db, `communities/${session.communityId}/logs/InKindAssets`)).key;
      const updates = {};
      let formattedName = "";

      if (donorType === 'MEMBER') {
        if (!assetForm.donorId) throw new Error(safeTranslate('err_select_member', 'Select a member.'));
        formattedName = `${assetForm.donorName} (SB-${assetForm.donorId.replace('SB-','')}) [Member]`;
        
        // ✨ INVISIBLE GAMIFICATION: Add estimated value to lifetime totalDonated for Seva Ranking
        if (estimatedCashValue > 0) {
          updates[`communities/${session.communityId}/members/${assetForm.donorId}/totalDonated`] = increment(estimatedCashValue);
          updates[`communities/${session.communityId}/members/${assetForm.donorId}/lastDonationTimestamp`] = ts;
        }
      } else {
        if (!assetForm.donorName) throw new Error(safeTranslate('err_guest_name_req', 'Guest name required.'));
        const guestId = `GST-${Math.floor(1000 + Math.random() * 9000)}`;
        formattedName = `${assetForm.donorName.trim()} (${guestId}) [Guest]`;
      }

      const newItem = {
        id: assetId, donorName: formattedName, donorPhone: assetForm.guestPhone || '', 
        itemName: assetForm.itemName, category: assetForm.category,
        quantity: parseFloat(assetForm.quantity), unit: assetForm.unit,
        estimatedValue: estimatedCashValue, allocatedTo: assetForm.allocatedTo || 'Bhandara / Treasury',
        receivedBy: session.userName, timestamp: ts, donorId: assetForm.donorId || 'GUEST'
      };

      updates[`communities/${session.communityId}/logs/InKindAssets/${assetId}`] = newItem;

      await executeSafeUpdate(updates, null, `Asset cached offline.`);

      pushToDataLayer('earn_virtual_currency', {
        virtual_currency_name: 'Seva Points', value: estimatedCashValue,
        item_name: assetForm.itemName, item_category: assetForm.category, workspace_type: workspaceType
      });

      logAudit("ASSET_RECORDED", `Received ${assetForm.quantity}${assetForm.unit} ${assetForm.itemName} from ${formattedName}`);

      setShowAssetModal(false);
      setAssetForm({ donorId: '', donorName: '', guestPhone: '', itemName: '', category: 'Grains & Food', quantity: '', unit: 'KG', estimatedValue: '', allocatedTo: '' });
      setMemberSearch('');

      showToast(safeTranslate('recorded_success', 'Physical Asset Logged Successfully!'));
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  // 🔄 HANDLE RECURRING PLEDGE CREATION
  const handleCreatePledge = async (e) => {
    e.preventDefault();
    if (isRestricted) return showToast(safeTranslate('err_unauthorized', 'Unauthorized.'), "error");
    if (!pledgeForm.memberId || !pledgeForm.committedAmount) return showToast(safeTranslate('err_all_fields_req', 'Member and Amount required.'), "error");

    setSubmitting(true);
    try {
      const pledgeId = push(ref(db, `communities/${session.communityId}/logs/RecurringPledges`)).key;
      const ts = Date.now();
      
      const newPledge = {
        id: pledgeId, memberId: pledgeForm.memberId, memberName: pledgeForm.memberName, memberPhone: pledgeForm.memberPhone || '',
        committedAmount: parseFloat(pledgeForm.committedAmount), frequency: pledgeForm.frequency,
        dueDay: parseInt(pledgeForm.dueDay), status: 'ACTIVE',
        lastPaidDate: null, nextDueDate: ts, // Forcing first payment as due immediately
        createdAt: ts, loggedBy: session.userName
      };

      await executeSafeUpdate({ [`communities/${session.communityId}/logs/RecurringPledges/${pledgeId}`]: newPledge }, safeTranslate('recorded_success', 'Pledge Subscription created successfully!'));
      
      pushToDataLayer('create_subscription', { value: parseFloat(pledgeForm.committedAmount), currency: 'BDT', billing_period: pledgeForm.frequency, member_id: pledgeForm.memberId });
      logAudit("PLEDGE_CREATED", `Created ${curSymbol}${pledgeForm.committedAmount}/${pledgeForm.frequency.toLowerCase()} pledge for ${pledgeForm.memberName}`);

      setShowPledgeModal(false);
      setPledgeForm({ memberId: '', memberName: '', memberPhone: '', committedAmount: '', frequency: 'MONTHLY', dueDay: '1' });
      setMemberSearch('');
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  // 📱 WHATSAPP REMINDER DISPATCHER
  const sendPledgeReminder = (pledge) => {
    pushToDataLayer('share', { method: 'WhatsApp', content_type: 'Pledge Reminder' });
    const amount = `${curSymbol}${pledge.committedAmount}`;
    const term = pledge.frequency === 'MONTHLY' ? safeTranslate('monthly', 'monthly', 'মাসিক', 'मासिक') : safeTranslate('yearly', 'yearly', 'বার্ষিক', 'वार्षिक');
    const msg = `Namaskar ${pledge.memberName} 🙏\n\nThis is a gentle reminder for your ${term} Seva Sankalp (${amount}) to ${session.communityName}. Your contribution sustains our daily rituals and community operations.\n\nTo fulfill your pledge, you can visit the Mandir or reply to this message for digital transfer details.\n\nMay Bhagavan bless you abundantly. ✨\n— ${session.userName}`;
    const url = pledge.memberPhone ? `https://wa.me/${pledge.memberPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleEditExpenseSubmit = async (e) => {
    e.preventDefault();
    const expense = editExpensePrompt.expense;
    const newAmt = parseFloat(editExpensePrompt.newAmount);

    if (isNaN(newAmt) || newAmt === expense.amount) {
       setEditExpensePrompt({ show: false, expense: null, newAmount: '' });
       return;
    }
    setSubmitting(true);
    try {
      const ts = Date.now();
      const historyKey = push(ref(db, `communities/${session.communityId}/logs/Expense/${expense.id}/editHistory`)).key;
      const historyMsg = `${new Date(ts).toLocaleString()} - Edited by ${session.userName}: Amount changed from ${curSymbol}${expense.amount} to ${curSymbol}${newAmt}.`;

      const updates = {};
      updates[`communities/${session.communityId}/logs/Expense/${expense.id}/amount`] = newAmt;
      updates[`communities/${session.communityId}/logs/Expense/${expense.id}/editHistory/${historyKey}`] = historyMsg;

      await executeSafeUpdate(updates, safeTranslate('record_updated', "Expense modification verified and saved."));

      pushToDataLayer('edit_expense', { transaction_id: expense.id, event_name: expense.eventName, old_value: expense.amount, new_value: newAmt });
      logAudit("EXPENSE_EDITED", `Edited record in Event: ${expense.eventName}`);
      setEditExpensePrompt({ show: false, expense: null, newAmount: '' });
    } catch (err) { showToast(err.message, 'error'); } finally { setSubmitting(false); }
  };

  const handleDownloadReceipt = async (item, type) => {
    pushToDataLayer('download_receipt', { transaction_id: item.id, transaction_type: type, value: item.amount || item.estimatedValue });
    if (generateReceiptPdf) await generateReceiptPdf(session.communityName, item, type);
    else showToast(safeTranslate('pdf_engine_loading', "PDF engine loading..."), "error");
  };

  const exportGroupToPDF = async (group) => {
    if (!checkQuota('free_pdf_limit')) return; 
    pushToDataLayer('export_group_data', { format: 'PDF', type: activeTab, group_name: group.name });
    if (activeTab === 'INCOME') await generateDonorStatementPdf(session.communityName, { name: group.name, logs: group.history, total: group.total });
    else await generateUtsavStatementPdf(session.communityName, group.name, group.history, group.total);
    if (isOnline) update(ref(db), { [`communities/${session.communityId}/usage_tracking/pdfs_generated`]: increment(1) });
  };

  const exportGroupToCSV = (group) => {
    pushToDataLayer('export_group_data', { format: 'CSV', type: activeTab, group_name: group.name });
    generateGroupCSV(group, activeTab, session.communityName);
  };

  const exportToPDF = async () => {
    if (displayList.length === 0) return showToast(safeTranslate('no_data_export', "No data to export."), "error");
    if (!checkQuota('free_pdf_limit')) return; 
    pushToDataLayer('export_data', { export_type: 'PDF', data_category: activeTab, community_id: session.communityId });
    if (generateTreasuryReportPdf) {
      await generateTreasuryReportPdf(displayList, activeTab, session.communityName, totalAmount, dateRange);
      if (isOnline) update(ref(db), { [`communities/${session.communityId}/usage_tracking/pdfs_generated`]: increment(1) });
    }
  };

  const exportToCSV = () => {
    if (displayList.length === 0) return showToast(safeTranslate('no_data_export', "No data to export."), "error");
    pushToDataLayer('export_data', { export_type: 'CSV', data_category: activeTab, community_id: session.communityId });
    generateTreasuryCSV(displayList, activeTab, session.communityName);
  };

  const isWithinDate = (ts) => {
    if (!dateRange.start && !dateRange.end) return true;
    const d = new Date(ts); d.setHours(0,0,0,0);
    const s = dateRange.start ? new Date(dateRange.start) : new Date(0);
    const e = dateRange.end ? new Date(dateRange.end) : new Date(8640000000000000);
    e.setHours(23,59,59,999);
    return d >= s && d <= e;
  };

  // ⚖️ STRICT P&L AUDIT (CASH ONLY)
  const pandLData = useMemo(() => {
    if (activeTab !== 'P_AND_L') return null;

    let totalIncome = 0; let totalExpense = 0;
    const incomeByCategory = {}; const expenseByCategory = {};

    INCOME_CATEGORIES.forEach(cat => incomeByCategory[cat] = 0);
    EXPENSE_CATEGORIES.forEach(cat => expenseByCategory[cat] = 0);

    donations.forEach(d => {
      if (isWithinDate(d.timestamp)) {
        totalIncome += d.amount;
        const cat = d.category || 'General Dakshina';
        incomeByCategory[cat] = (incomeByCategory[cat] || 0) + d.amount;
      }
    });

    expenses.forEach(e => {
      if (isWithinDate(e.timestamp)) {
        totalExpense += e.amount;
        const cat = e.category || 'Event Logistics';
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e.amount;
      }
    });

    return { totalIncome, totalExpense, netBalance: totalIncome - totalExpense, incomeByCategory, expenseByCategory };
  }, [donations, expenses, dateRange, activeTab]);

  // 🗂️ MAIN DISPLAY LIST ENGINE (Handles RBAC Sandboxing)
  const { displayList, totalAmount, activePledgesCount } = useMemo(() => {
    if (activeTab === 'P_AND_L') return { displayList: [], totalAmount: 0, activePledgesCount: 0 };

    // PLEDGES TAB LOGIC (Flat List structure)
    if (activeTab === 'PLEDGES') {
      let filteredPledges = pledges.filter(p => p.memberName.toLowerCase().includes(searchTerm.toLowerCase()));
      // RBAC Filter: Members only see their own pledges
      if (isRestricted) filteredPledges = filteredPledges.filter(p => p.memberId === session.uid);
      
      const activeCount = filteredPledges.filter(p => p.status === 'ACTIVE').length;
      return { displayList: filteredPledges, totalAmount: 0, activePledgesCount: activeCount };
    }

    // ACCORDION LOGIC (INCOME, EXPENSE, ASSETS)
    const grouped = {};
    let total = 0; 
    let sourceData = [];
    
    if (activeTab === 'INCOME') sourceData = donations;
    else if (activeTab === 'EXPENSE') sourceData = expenses;
    else if (activeTab === 'ASSETS') sourceData = assets;

    // RBAC Filter: Members only see their own donations/assets. They see ZERO expenses.
    if (isRestricted) {
      if (activeTab === 'EXPENSE') sourceData = [];
      else sourceData = sourceData.filter(item => item.donorId === session.uid || (item.name && item.name.includes(session.uid)));
    }

    sourceData.forEach(item => {
      if (!isWithinDate(item.timestamp)) return;
      
      let groupKey = 'Unknown';
      if (activeTab === 'INCOME') groupKey = item.name || safeTranslate('unknown_donor', 'Unknown');
      else if (activeTab === 'EXPENSE') groupKey = item.eventName || safeTranslate('unknown_event', 'Unknown');
      else if (activeTab === 'ASSETS') groupKey = item.donorName || safeTranslate('unknown_donor', 'Unknown');

      const normalizedKey = groupKey.trim().toLowerCase();
      if (!grouped[normalizedKey]) grouped[normalizedKey] = { name: groupKey, total: 0, history: [] };

      grouped[normalizedKey].history.push(item);
      const val = activeTab === 'ASSETS' ? (item.estimatedValue || 0) : item.amount;
      grouped[normalizedKey].total += val;
      total += val; 
    });

    let filtered = Object.values(grouped).filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (sortBy === 'AMOUNT_HIGH') filtered.sort((a, b) => b.total - a.total);
    else if (sortBy === 'AMOUNT_LOW') filtered.sort((a, b) => a.total - b.total);
    else filtered.sort((a, b) => b.total - a.total); 

    return { displayList: filtered, totalAmount: total, activePledgesCount: 0 };
  }, [donations, expenses, assets, pledges, activeTab, searchTerm, dateRange, sortBy, isRestricted, session.uid]);

  const incomeInsights = useMemo(() => {
    if (donations.length < 2 || activeTab !== 'INCOME' || isRestricted) return null;
    let total = 0; const donorTotals = {};
    donations.forEach(d => { total += d.amount; const dName = d.name ? d.name.split(' (')[0] : 'Unknown'; donorTotals[dName] = (donorTotals[dName] || 0) + d.amount; });
    const avg = Math.round(total / donations.length);
    const topDonor = Object.keys(donorTotals).reduce((a, b) => donorTotals[a] > donorTotals[b] ? a : b);
    return { average: avg, topDonor: topDonor, message: `Your average recorded contribution is ${curSymbol}${avg.toLocaleString()}. Your top patron is currently ${topDonor}. Maintain strong engagement here for sustained growth.` };
  }, [donations, curSymbol, activeTab, isRestricted]);

  const expenseInsights = useMemo(() => {
    if (expenses.length < 2 || activeTab !== 'EXPENSE' || isRestricted) return null;
    let total = 0; const eventTotals = {};
    expenses.forEach(e => { total += e.amount; const evName = e.eventName || 'General'; eventTotals[evName] = (eventTotals[evName] || 0) + e.amount; });
    const avg = Math.round(total / expenses.length);
    const topEvent = Object.keys(eventTotals).reduce((a, b) => eventTotals[a] > eventTotals[b] ? a : b);
    return { average: avg, topEvent: topEvent, message: `Your average transaction cost is ${curSymbol}${avg.toLocaleString()}. The highest organizational expenditure is on "${topEvent}". Consider reviewing this category for budget optimization.` };
  }, [expenses, curSymbol, activeTab, isRestricted]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeTab, dateRange, sortBy]);
  const totalPages = Math.ceil(displayList.length / itemsPerPage) || 1;
  const currentItems = displayList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5 min-h-[90vh]">

      {/* TOAST PORTAL */}
      {!isOnline && !toast && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg mb-2 animate-pulse">
          <WifiOff size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Offline Mode: Operating from local vault.</span>
        </div>
      )}

      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'offline' ? 'bg-orange-500/20 text-sanatani-orange' : toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'offline' ? <WifiOff size={20}/> : toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'offline' ? 'text-orange-400' : toast.type === 'error' ? safeTranslate('error', 'Error') : safeTranslate('success', 'Success')}`}>
               {toast.type === 'offline' ? 'Offline Cache' : toast.type === 'error' ? safeTranslate('error', 'Error') : safeTranslate('success', 'Success')}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Banknote className="text-sanatani-orange" size={26} /> {institutionLabel} {safeTranslate('treasury_title', 'Treasury & Wealth')}
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">{safeTranslate('treasury_subtitle', 'Financial Tracking, Assets & Subscriptions')}</p>
        </div>

        <div className="grid grid-cols-2 md:flex md:flex-row gap-3 w-full">

          <button 
            onClick={() => { setShowGuide(!showGuide); if(!showGuide) pushToDataLayer('open_quick_guide', { module: 'TreasuryLedger' }); }} 
            className="col-span-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-sm whitespace-nowrap"
          >
            <HelpCircle size={14}/> {safeTranslate('quick_guide', 'Quick Guide')}
          </button>

          {activeTab !== 'P_AND_L' && activeTab !== 'PLEDGES' && (
            <div className="col-span-1 relative">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-[10px] sm:text-xs font-bold uppercase tracking-widest py-2.5 pl-8 pr-4 rounded-xl outline-none focus:border-sanatani-orange shadow-sm cursor-pointer">
                <option value="NEWEST">{safeTranslate('sort_newest', 'Newest')}</option>
                <option value="OLDEST">{safeTranslate('sort_oldest', 'Oldest')}</option>
                <option value="AMOUNT_HIGH">{safeTranslate('sort_high', 'Highest')}</option>
                <option value="AMOUNT_LOW">{safeTranslate('sort_low', 'Lowest')}</option>
              </select>
              <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
          )}

          {activeTab !== 'PLEDGES' && (
            <div className="col-span-2 md:w-auto flex items-center bg-gray-50 border border-gray-200 p-1.5 rounded-xl overflow-x-auto shadow-sm">
              <Filter size={14} className="text-gray-400 ml-2 shrink-0" />
              <input type="date" value={dateRange.start} onChange={e=>setDateRange({...dateRange, start: e.target.value})} className="bg-transparent text-[10px] sm:text-xs font-bold text-gray-600 outline-none cursor-pointer flex-1 min-w-[100px] px-1" />
              <span className="text-gray-300 font-bold px-1">-</span>
              <input type="date" value={dateRange.end} onChange={e=>setDateRange({...dateRange, end: e.target.value})} className="bg-transparent text-[10px] sm:text-xs font-bold text-gray-600 outline-none cursor-pointer flex-1 min-w-[100px] px-1" />
              {(dateRange.start || dateRange.end) && (
                <button onClick={() => setDateRange({start:'', end:''})} className="bg-gray-200 hover:bg-gray-300 p-1 rounded-md transition-colors shrink-0 mx-1"><X size={12}/></button>
              )}
            </div>
          )}

          {!isRestricted && activeTab !== 'P_AND_L' && activeTab !== 'PLEDGES' && (
            <div className="col-span-2 md:w-auto flex bg-gray-100 p-1 rounded-xl shadow-sm">
              <button onClick={exportToCSV} className="flex-1 md:flex-none bg-white hover:bg-gray-50 text-gray-700 font-black py-2 px-3 rounded-lg text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-all border border-gray-200">
                <Download size={14} /> CSV
              </button>
              <button onClick={exportToPDF} className="flex-1 md:flex-none bg-gray-900 hover:bg-black text-white font-black py-2 px-3 rounded-lg text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-all ml-1">
                <FileText size={14} /> PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SMART INSIGHTS */}
      {!isRestricted && activeTab === 'INCOME' && incomeInsights && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center gap-4 animate-in slide-in-from-top-2">
          <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl shrink-0 self-start sm:self-auto"><BrainCircuit size={24} /></div>
          <div>
            <h3 className="text-xs font-black text-emerald-900 uppercase tracking-widest mb-1">Smart Treasury Assistant</h3>
            <p className="text-sm font-bold text-gray-700 leading-snug">{incomeInsights.message}</p>
          </div>
        </div>
      )}

      {!isRestricted && activeTab === 'EXPENSE' && expenseInsights && (
        <div className="bg-gradient-to-r from-rose-50 to-red-50 border border-red-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center gap-4 animate-in slide-in-from-top-2">
          <div className="bg-red-100 text-red-600 p-3 rounded-xl shrink-0 self-start sm:self-auto"><BrainCircuit size={24} /></div>
          <div>
            <h3 className="text-xs font-black text-red-900 uppercase tracking-widest mb-1">Smart Expense Assistant</h3>
            <p className="text-sm font-bold text-gray-700 leading-snug">{expenseInsights.message}</p>
          </div>
        </div>
      )}

      {/* QUICK GUIDE BANNER */}
      {showGuide && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-5 sm:p-6 rounded-2xl shadow-inner animate-in slide-in-from-top-2 relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors"><X size={18}/></button>
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><Lightbulb size={18} className="text-blue-500"/> {safeTranslate('how_to_use', 'How to use the Treasury')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Banknote size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">1. Cash Ledger</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Categorize incoming Dakshina and outgoing Expense for strict P&L accounting.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Package size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">2. In-Kind Assets</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Log physical items (Rice, Gold). The estimated cash value bypasses the P&L but is secretly credited to the Devotee's Seva Gamification Score!</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Repeat size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">3. Recurring Pledges</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Track monthly donors. Use the 1-click WhatsApp dispatcher to send respectful payment reminders.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Scale size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">4. P&L Audits</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">View a generated Balance Sheet mapping pure cash liquidity.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI & SEGMENTED TOGGLE BAR (ENTERPRISE UPGRADE) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 flex bg-gray-100 p-1.5 rounded-2xl h-16 shadow-inner border border-gray-200 overflow-x-auto scrollbar-hide shrink-0">
          <button onClick={() => { setActiveTab('INCOME'); setExpandedGroup(null); }} className={`flex-1 min-w-[80px] rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 ${activeTab === 'INCOME' ? 'bg-white text-green-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <TrendingUp size={14} className="hidden sm:block" /> {safeTranslate('tab_chanda', 'Income')}
          </button>
          {!isRestricted && (
            <button onClick={() => { setActiveTab('EXPENSE'); setExpandedGroup(null); }} className={`flex-1 min-w-[80px] rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 ${activeTab === 'EXPENSE' ? 'bg-white text-red-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
              <TrendingDown size={14} className="hidden sm:block" /> {safeTranslate('tab_expenses', 'Expense')}
            </button>
          )}
          <button onClick={() => { setActiveTab('ASSETS'); setExpandedGroup(null); }} className={`flex-1 min-w-[80px] rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 ${activeTab === 'ASSETS' ? 'bg-white text-indigo-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <Package size={14} className="hidden sm:block" /> {safeTranslate('tab_assets', 'Assets')}
          </button>
          <button onClick={() => { setActiveTab('PLEDGES'); setExpandedGroup(null); }} className={`flex-1 min-w-[80px] rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 ${activeTab === 'PLEDGES' ? 'bg-white text-purple-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <Repeat size={14} className="hidden sm:block" /> {safeTranslate('tab_pledges', 'Pledges')}
          </button>
          {!isRestricted && (
            <button onClick={() => { setActiveTab('P_AND_L'); setExpandedGroup(null); }} className={`flex-1 min-w-[80px] rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 ${activeTab === 'P_AND_L' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>
              <Scale size={14} className="hidden sm:block" /> {safeTranslate('tab_audit', 'Audit')}
            </button>
          )}
        </div>

        {activeTab !== 'P_AND_L' && activeTab !== 'PLEDGES' && (
          <div className="lg:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-inner gap-4">
             <div>
               <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{safeTranslate('total_amount', 'Total Value')} ({safeTranslate('filtered', 'Filtered')})</p>
               <p className={`text-3xl font-black tracking-tight ${activeTab === 'INCOME' ? 'text-green-600' : activeTab === 'EXPENSE' ? 'text-red-600' : 'text-indigo-600'}`}>
                 {curSymbol}{totalAmount.toLocaleString()}
               </p>
             </div>

             {!isRestricted && (
               <button 
                 onClick={() => {
                   if (activeTab === 'INCOME') setShowDonationModal(true);
                   else if (activeTab === 'EXPENSE') setShowExpenseModal(true);
                   else setShowAssetModal(true);
                 }}
                 className={`w-full sm:w-auto text-white font-black py-3.5 px-6 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md transition-all hover:-translate-y-0.5 ${activeTab === 'INCOME' ? 'bg-green-600 hover:bg-green-700 shadow-green-600/20' : activeTab === 'EXPENSE' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'}`}
               >
                 <Plus size={16} /> 
                 {activeTab === 'INCOME' ? safeTranslate('btn_record_chanda', 'Record Income') : activeTab === 'EXPENSE' ? safeTranslate('btn_record_expense', 'Record Expense') : safeTranslate('btn_record_asset', 'Record Asset')}
               </button>
             )}
          </div>
        )}

        {/* Pledges specific header actions */}
        {activeTab === 'PLEDGES' && (
          <div className="lg:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-inner gap-4">
             <div>
               <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{safeTranslate('total_active_pledges', 'Active Pledges')}</p>
               <p className="text-3xl font-black text-purple-600 tracking-tight">{activePledgesCount}</p>
             </div>
             {!isRestricted && (
               <button 
                 onClick={() => setShowPledgeModal(true)}
                 className="w-full sm:w-auto text-white font-black py-3.5 px-6 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md transition-all hover:-translate-y-0.5 bg-purple-600 hover:bg-purple-700 shadow-purple-600/20"
               >
                 <Plus size={16} /> {safeTranslate('btn_create_pledge', 'Create Pledge')}
               </button>
             )}
          </div>
        )}
      </div>

      {activeTab !== 'P_AND_L' && (
        <div className="relative w-full">
          <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input 
            type="text" placeholder={activeTab === 'INCOME' || activeTab === 'ASSETS' || activeTab === 'PLEDGES' ? safeTranslate('search_donors', 'Search by name...') : safeTranslate('search_events', 'Search by event...')} 
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" 
          />
        </div>
      )}

      {/* ========================================================================================= */}
      {/* ⚖️ STRICT P&L AUDIT (CASH ONLY)                                                           */}
      {/* ========================================================================================= */}
      {activeTab === 'P_AND_L' && !isRestricted && pandLData && (
        <div className="flex-1 overflow-y-auto space-y-6 pb-8 animate-in fade-in scrollbar-hide">

          {/* Top Line Balance */}
          <div className={`p-8 rounded-3xl text-center shadow-lg border relative overflow-hidden ${pandLData.netBalance >= 0 ? 'bg-gradient-to-br from-green-50 to-emerald-100 border-green-200' : 'bg-gradient-to-br from-red-50 to-rose-100 border-red-200'}`}>
             <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10"><Scale size={180}/></div>
             <p className={`text-xs font-black uppercase tracking-widest mb-2 ${pandLData.netBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
               Cash Net Balance 
               {(dateRange.start || dateRange.end) ? ' (Filtered Period)' : ' (All Time)'}
             </p>
             <h2 className={`text-5xl md:text-7xl font-black tracking-tight ${pandLData.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
               {curSymbol}{pandLData.netBalance.toLocaleString()}
             </h2>
             <div className="flex justify-center gap-6 mt-6 relative z-10">
                <div className="bg-white/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/50 shadow-sm">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Gross Income</p>
                  <p className="text-lg font-black text-gray-900">{curSymbol}{pandLData.totalIncome.toLocaleString()}</p>
                </div>
                <div className="bg-white/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/50 shadow-sm">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Gross Expense</p>
                  <p className="text-lg font-black text-gray-900">{curSymbol}{pandLData.totalExpense.toLocaleString()}</p>
                </div>
             </div>
             
             <div className="mt-8 pt-4 border-t border-black/5 relative z-10">
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center justify-center gap-2"><Lock size={12}/> Enterprise Rule: In-Kind assets bypass this audit to ensure strict cash liquidity mathematics.</p>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Income Breakdown */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden ring-1 ring-black/5">
              <div className="bg-green-50 p-4 border-b border-green-100 flex items-center gap-2">
                 <TrendingUp className="text-green-600" size={18}/>
                 <h3 className="text-sm font-black text-green-900 uppercase tracking-widest">Cash Income Breakdown</h3>
              </div>
              <div className="divide-y divide-gray-50 p-2">
                 {Object.entries(pandLData.incomeByCategory).sort((a,b) => b[1] - a[1]).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between items-center p-3 hover:bg-gray-50 transition-colors">
                      <span className="text-xs font-bold text-gray-700">{cat}</span>
                      <span className="text-sm font-black text-green-600">{curSymbol}{amt.toLocaleString()}</span>
                    </div>
                 ))}
                 {pandLData.totalIncome === 0 && <p className="text-xs text-gray-400 font-bold text-center py-6">No income recorded for this period.</p>}
              </div>
            </div>

            {/* Expense Breakdown */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden ring-1 ring-black/5">
              <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-2">
                 <TrendingDown className="text-red-600" size={18}/>
                 <h3 className="text-sm font-black text-red-900 uppercase tracking-widest">Cash Expense Breakdown</h3>
              </div>
              <div className="divide-y divide-gray-50 p-2">
                 {Object.entries(pandLData.expenseByCategory).sort((a,b) => b[1] - a[1]).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between items-center p-3 hover:bg-gray-50 transition-colors">
                      <span className="text-xs font-bold text-gray-700">{cat}</span>
                      <span className="text-sm font-black text-red-600">{curSymbol}{amt.toLocaleString()}</span>
                    </div>
                 ))}
                 {pandLData.totalExpense === 0 && <p className="text-xs text-gray-400 font-bold text-center py-6">No expenses recorded for this period.</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-center pt-4">
             <button onClick={() => window.print()} className="bg-gray-900 hover:bg-black text-white font-black py-4 px-8 rounded-xl shadow-lg hover:-translate-y-0.5 transition-all text-xs uppercase tracking-widest flex items-center gap-2">
               <FileText size={16}/> Print Official P&L Statement
             </button>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* 🔄 RECURRING PLEDGES PIPELINE UI (NEW)                                                    */}
      {/* ========================================================================================= */}
      {activeTab === 'PLEDGES' && (
        <div className="flex-1 overflow-y-auto pb-8 scrollbar-hide">
          {displayList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in">
              {displayList.map((pledge) => {
                const now = Date.now();
                const isOverdue = pledge.nextDueDate < now && pledge.status === 'ACTIVE';
                const statusColor = isOverdue ? 'bg-red-50 text-red-700 border-red-200' : pledge.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200';

                return (
                  <div key={pledge.id} className={`bg-white rounded-3xl border shadow-sm hover:shadow-md transition-all p-6 flex flex-col group relative overflow-hidden ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
                    {isOverdue && <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500 animate-pulse"></div>}
                    
                    <div className="flex justify-between items-start mb-4">
                      <div className={`px-2.5 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest shadow-sm ${statusColor}`}>
                        {isOverdue ? 'Overdue' : pledge.status}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">{pledge.frequency}</span>
                    </div>

                    <div className="mb-4">
                      <h3 className="text-lg font-black text-gray-900 group-hover:text-purple-600 transition-colors">{pledge.memberName}</h3>
                      <p className="text-xs font-bold text-gray-500 mt-1">{pledge.memberPhone || 'No Phone'}</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner mb-6">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{safeTranslate('committed_amount', 'Committed Amount')}</p>
                      <p className="text-2xl font-black text-purple-600 tracking-tight">{curSymbol}{pledge.committedAmount.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-gray-500 mt-2 flex items-center gap-1.5"><CalendarDays size={12}/> Next Due: {new Date(pledge.nextDueDate).toLocaleDateString()}</p>
                    </div>

                    {!isRestricted && (
                      <div className="mt-auto pt-4 border-t border-gray-100 flex gap-2">
                        {isOverdue ? (
                          <button onClick={() => {
                            const term = pledge.frequency === 'MONTHLY' ? safeTranslate('monthly', 'monthly') : safeTranslate('yearly', 'yearly');
                            const msg = `Namaskar ${pledge.memberName} 🙏\n\nThis is a gentle reminder for your ${term} Seva Sankalp (${curSymbol}${pledge.committedAmount}) to ${session.communityName}. Your contribution sustains our daily rituals and community operations.\n\nTo fulfill your pledge, you can visit the Mandir or reply to this message for digital transfer details.\n\nMay Bhagavan bless you abundantly. ✨\n— ${session.userName}`;
                            const url = pledge.memberPhone ? `https://wa.me/${pledge.memberPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                            window.open(url, '_blank');
                            pushToDataLayer('share', { method: 'WhatsApp', content_type: 'Pledge Reminder' });
                          }} className="flex-1 bg-green-50 hover:bg-green-600 hover:text-white text-green-700 border border-green-200 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm">
                            <Send size={14}/> Reminder
                          </button>
                        ) : (
                          <button onClick={() => {
                            setDonorType('MEMBER');
                            setDonationForm({...donationForm, memberName: pledge.memberName, memberId: pledge.memberId, amount: pledge.committedAmount, note: `${pledge.frequency} Pledge Payment`});
                            setShowDonationModal(true);
                          }} className="flex-1 bg-white hover:bg-purple-50 text-gray-700 border border-gray-200 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm">
                            Mark Paid
                          </button>
                        )}
                        <button onClick={() => handleDelete(pledge.id, 'logs/RecurringPledges', 'this Pledge')} className="p-3 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shadow-sm"><Trash2 size={16}/></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center p-16 text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100 shadow-inner flex flex-col items-center justify-center min-h-[400px]">
              <Repeat size={48} className="text-purple-300 mb-3" />
              <p className="text-lg text-gray-900 mb-1">{safeTranslate('no_pledges', 'No Active Pledges')}</p>
              <p className="text-xs uppercase tracking-widest">{safeTranslate('click_to_add', 'Click + Create Pledge to track subscribers.')}</p>
            </div>
          )}
        </div>
      )}

      {/* 🗂️ COLLAPSIBLE ACCORDION LIST (INCOME / EXPENSE / ASSETS) */}
      {activeTab !== 'P_AND_L' && activeTab !== 'PLEDGES' && (
        <div className="flex-1 overflow-y-auto space-y-3 pb-8 px-1 scrollbar-hide">
          {currentItems.length > 0 ? (
            currentItems.map((group, idx) => {
              const isExpanded = expandedGroup === group.name;
              const latestItem = group.history.reduce((latest, current) => current.timestamp > latest.timestamp ? current : latest, group.history[0]);

              return (
              <div key={idx} className={`bg-white border rounded-2xl shadow-sm transition-all duration-300 overflow-hidden ${activeTab === 'INCOME' ? 'border-green-100 hover:border-green-300' : activeTab === 'EXPENSE' ? 'border-red-100 hover:border-red-300' : 'border-indigo-100 hover:border-indigo-300'} ${isExpanded ? 'ring-2 ring-opacity-50 ' + (activeTab === 'INCOME' ? 'ring-green-500' : activeTab === 'EXPENSE' ? 'ring-red-500' : 'ring-indigo-500') : ''}`}>

                 <div onClick={() => setExpandedGroup(isExpanded ? null : group.name)} className="p-4 sm:p-5 flex justify-between items-center cursor-pointer bg-white hover:bg-gray-50 transition-colors">
                   <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 pr-2">
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shadow-inner shrink-0 ${activeTab === 'INCOME' ? 'bg-green-50 text-green-600' : activeTab === 'EXPENSE' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                       {activeTab === 'INCOME' ? <User size={20}/> : activeTab === 'EXPENSE' ? <CalendarDays size={20}/> : <Box size={20}/>}
                     </div>

                     <div className="min-w-0 flex-1">
                       <h3 className="text-sm sm:text-base font-black text-gray-900 truncate">{group.name}</h3>
                       <div className="flex items-center gap-2 mt-1 overflow-hidden">
                          <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md uppercase tracking-widest shrink-0">
                            {group.history.length} {activeTab === 'INCOME' ? safeTranslate('contributions', 'Contributions') : activeTab === 'EXPENSE' ? safeTranslate('expenses', 'Items') : safeTranslate('assets_logged', 'Assets')}
                          </span>
                          <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-widest truncate">
                            <Clock size={10} className="shrink-0"/> {new Date(latestItem.timestamp).toLocaleDateString()}
                          </span>
                       </div>
                     </div>
                   </div>

                   <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                     <p className={`text-base sm:text-lg font-black tracking-tight ${activeTab === 'INCOME' ? 'text-green-600' : activeTab === 'EXPENSE' ? 'text-red-600' : 'text-indigo-600'}`}>
                       {curSymbol}{group.total.toLocaleString()}
                     </p>

                     {!isRestricted && (
                       <button 
                         onClick={(e) => { e.stopPropagation(); handleQuickAdd(group.name); }} 
                         className={`p-2 rounded-xl transition-all shadow-sm border ${activeTab === 'INCOME' ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-600 hover:text-white' : activeTab === 'EXPENSE' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white' : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white'}`}
                         title="Quick Add"
                       >
                         <Plus size={16}/>
                       </button>
                     )}

                     {isExpanded ? <ChevronUp size={20} className="text-gray-300 hidden sm:block"/> : <ChevronDown size={20} className="text-gray-300 hidden sm:block"/>}
                   </div>
                 </div>

                 {isExpanded && (
                   <div className="animate-in slide-in-from-top-2">
                     <div className="bg-gray-50/80 border-t border-b border-gray-100 px-4 py-2.5 flex justify-between items-center overflow-x-auto">
                       <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
                          <button onClick={() => exportGroupToCSV(group)} className="flex-1 sm:flex-none justify-center text-[9px] font-black uppercase tracking-widest text-gray-600 bg-white border border-gray-200 px-2.5 py-1.5 rounded-md hover:bg-gray-100 flex items-center gap-1 shadow-sm"><Download size={12}/> {safeTranslate('export_csv', 'CSV')}</button>
                          <button onClick={() => exportGroupToPDF(group)} className="flex-1 sm:flex-none justify-center text-[9px] font-black uppercase tracking-widest text-gray-600 bg-white border border-gray-200 px-2.5 py-1.5 rounded-md hover:bg-gray-100 flex items-center gap-1 shadow-sm"><FileText size={12}/> {safeTranslate('export_pdf', 'PDF')}</button>
                       </div>
                     </div>

                     <div className="bg-gray-50 p-3 sm:p-4 space-y-2">
                       {group.history.sort((a,b) => {
                         if (sortBy === 'NEWEST') return b.timestamp - a.timestamp;
                         if (sortBy === 'OLDEST') return a.timestamp - b.timestamp;
                         const valA = a.amount || a.estimatedValue; const valB = b.amount || b.estimatedValue;
                         if (sortBy === 'AMOUNT_HIGH') return valB - valA;
                         if (sortBy === 'AMOUNT_LOW') return valA - valB;
                         return b.timestamp - a.timestamp;
                       }).map((item, i) => {
                         const collector = item.collectedBy || item.collector || item.loggedBy || item.involvedPerson || item.receivedBy || 'System';
                         const itemVal = item.amount || item.estimatedValue || 0;
                         
                         return (
                         <div key={i} className="flex justify-between items-start sm:items-center bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm hover:border-gray-200 transition-colors min-w-0">
                           <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                             <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                               <p className="text-sm font-bold text-gray-900 truncate">
                                 {activeTab === 'INCOME' ? (item.note || safeTranslate('general_donation', 'Donation')) : activeTab === 'ASSETS' ? `${item.quantity}${item.unit} ${item.itemName}` : item.itemName}
                               </p>
                               {activeTab === 'EXPENSE' && item.voucherNo && item.voucherNo !== safeTranslate('no_memo', 'No Memo') && item.voucherNo !== 'No Memo' && (
                                 <span className="inline-block bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest w-fit">
                                   Memo: {item.voucherNo}
                                 </span>
                               )}
                               {item.category && (
                                 <span className={`inline-block border px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest w-fit ${activeTab === 'INCOME' ? 'bg-green-50 text-green-700 border-green-200' : activeTab === 'ASSETS' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                   {item.category}
                                 </span>
                               )}
                             </div>

                             <div className="mt-2 flex items-center flex-wrap gap-2">
                               <p className="text-[9px] sm:text-[10px] text-gray-500 font-mono font-bold">{new Date(item.timestamp).toLocaleString()}</p>
                               <span className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md text-[9px] text-gray-500 font-bold flex items-center gap-1 w-fit max-w-[150px] truncate">
                                 <ShieldAlert size={10} className="shrink-0"/> Auth: {collector.split(' ')[0]}
                               </span>
                               {activeTab === 'ASSETS' && item.allocatedTo && (
                                 <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md text-[9px] text-gray-600 font-bold w-fit max-w-[150px] truncate">
                                   For: {item.allocatedTo}
                                 </span>
                               )}
                             </div>

                             {item.editHistory && (
                               <div className="mt-2 flex flex-col gap-1 text-[9px] text-gray-400 font-bold bg-yellow-50/50 p-2 rounded-lg border border-yellow-100 w-fit">
                                 <span className="flex items-center gap-1 text-yellow-700 uppercase tracking-widest"><History size={10}/> {safeTranslate('edit_history', 'Edit History')}:</span>
                                 {Object.values(item.editHistory).map((h, hIdx) => <span key={hIdx}>- {h}</span>)}
                               </div>
                             )}
                           </div>

                           <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3 shrink-0">
                             <div className="text-right">
                               <p className={`text-base font-black ${activeTab === 'INCOME' ? 'text-green-600' : activeTab === 'ASSETS' ? 'text-indigo-600' : 'text-red-600'}`}>{curSymbol}{itemVal}</p>
                               {activeTab === 'ASSETS' && <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Est. Value</p>}
                             </div>

                             <div className="flex items-center gap-1 sm:gap-2">
                               {activeTab === 'EXPENSE' && item.receiptImage && (
                                 <button onClick={(e) => { e.stopPropagation(); setViewMemoModal(item.receiptImage); }} className="text-orange-500 hover:text-white p-1.5 sm:p-2 bg-orange-50 hover:bg-orange-500 rounded-lg border border-orange-100 transition-all shadow-sm" title={safeTranslate('view_memo_photo', 'View Memo')}>
                                   <ImageIcon size={14}/>
                                 </button>
                               )}

                               {activeTab !== 'EXPENSE' && (
                                 <button onClick={(e) => { e.stopPropagation(); handleDownloadReceipt(item, activeTab); }} className="text-gray-500 hover:text-sanatani-orange p-1.5 sm:p-2 bg-gray-50 hover:bg-orange-50 rounded-lg border border-gray-200 transition-all shadow-sm" title={safeTranslate('download_receipt', 'Download Voucher')}>
                                   <FileDigit size={14}/>
                                 </button>
                               )}

                               {activeTab === 'EXPENSE' && !isRestricted && (
                                  <button onClick={(e) => { e.stopPropagation(); setEditExpensePrompt({ show: true, expense: item, newAmount: item.amount }); }} className="text-blue-500 hover:text-white p-1.5 sm:p-2 bg-blue-50 hover:bg-blue-600 rounded-lg border border-blue-100 shadow-sm"><Edit size={14}/></button>
                               )}
                               
                               {/* Admin Delete Action for Assets */}
                               {activeTab === 'ASSETS' && !isRestricted && (
                                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id, 'logs/InKindAssets', item.itemName); }} className="text-gray-400 hover:text-red-500 p-1.5 sm:p-2 bg-gray-50 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all shadow-sm"><Trash2 size={14}/></button>
                               )}
                             </div>
                           </div>
                         </div>
                       )})}
                     </div>
                   </div>
                 )}
              </div>
            )})
          ) : (
            <div className="text-center p-16 text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100 shadow-inner flex flex-col items-center justify-center">
              <AlertCircle size={48} className="text-gray-300 mb-3" />
              <p className="text-lg text-gray-900 mb-1">{safeTranslate('no_data_found', 'No Data Found')}</p>
              <p className="text-xs uppercase tracking-widest">{safeTranslate('adjust_filters', 'Adjust filters to see results')}</p>
            </div>
          )}
        </div>
      )}

      {/* 🔢 PAGINATION */}
      {activeTab !== 'P_AND_L' && activeTab !== 'PLEDGES' && totalPages > 1 && (
        <div className="flex justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-200 mt-2 shrink-0">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest pl-3">{safeTranslate('page', 'Page')} {currentPage} / {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-2 bg-white rounded-xl shadow-sm border border-gray-200 disabled:opacity-50"><ChevronLeft size={16}/></button>
            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 bg-white rounded-xl shadow-sm border border-gray-200 disabled:opacity-50"><ChevronRight size={16}/></button>
          </div>
        </div>
      )}

      {/* ✨ FOOTER CREDIT */}
      <div className="pt-12 pb-6 flex flex-col items-center justify-center text-center opacity-70 border-t border-gray-200 mt-auto shrink-0">
         <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1">
           Made with <Heart size={12} className="text-red-500 fill-current"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span>
         </div>
         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">© {new Date().getFullYear()} Sanatani Bandhan. Enterprise Edition.</p>
      </div>

      {/* ========================================== */}
      {/* ✨ SMART MODALS & FORMS (ENTERPRISE UI)    */}
      {/* ========================================== */}

      {editExpensePrompt.show && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 ring-1 ring-white/20 relative border-t-4 border-blue-500">
              <button onClick={() => setEditExpensePrompt({ show: false, expense: null, newAmount: '' })} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full"><X size={16}/></button>

              <div className="mb-6">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4"><Edit size={20}/></div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">{safeTranslate('edit_cost', 'Edit Cost')}</h3>
                <p className="text-xs font-bold text-gray-500 mt-1 truncate">Editing: {editExpensePrompt.expense?.itemName}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Current: {curSymbol}{editExpensePrompt.expense?.amount}</p>
              </div>

              <div className="relative">
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('enter_new_amt', 'Enter New Amount')} *</label>
                 <input type="number" value={editExpensePrompt.newAmount} onChange={(e) => setEditExpensePrompt({...editExpensePrompt, newAmount: e.target.value})} autoFocus className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-lg font-black text-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"/>
              </div>

              <div className="flex gap-3 mt-8">
                 <button onClick={() => setEditExpensePrompt({ show: false, expense: null, newAmount: '' })} className="flex-1 px-4 py-3.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">{safeTranslate('btn_cancel', 'Cancel')}</button>
                 <button onClick={handleEditExpenseSubmit} disabled={submitting} className="flex-[2] px-4 py-3.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2 disabled:opacity-50">
                   {submitting ? <Loader2 size={16} className="animate-spin"/> : <>{safeTranslate('btn_save', 'Save')} <CheckCircle2 size={16}/></>}
                </button>
              </div>
           </div>
        </div>, document.body
      )}

      {viewMemoModal && createPortal(
        <div className="fixed inset-0 bg-gray-950/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setViewMemoModal(null)}>
          <div className="relative max-w-3xl w-full flex justify-center items-center">
             <button onClick={() => setViewMemoModal(null)} className="absolute -top-12 right-0 bg-white/10 hover:bg-white/30 text-white p-3 rounded-full transition-colors backdrop-blur-md"><X size={24}/></button>
             <img src={viewMemoModal} alt="Scanned Memo" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border-4 border-white/10" />
          </div>
        </div>, document.body
      )}

      {/* ✨ ENTERPRISE DONATION MODAL (CASH) */}
      {showDonationModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-green-500 flex flex-col h-full max-h-[95dvh] sm:max-h-[90vh] animate-in zoom-in-95 ring-1 ring-white/20">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 tracking-tight"><Banknote className="text-green-600" size={24}/> {safeTranslate('btn_record_chanda', 'Record Income')}</h3>
               <button onClick={() => setShowDonationModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
             </div>

             <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white scrollbar-hide pb-32 sm:pb-8">
               <div className="flex bg-gray-100 p-1.5 rounded-xl mb-6">
                  <button type="button" onClick={() => setDonorType('MEMBER')} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all ${donorType === 'MEMBER' ? 'bg-white text-green-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}><UserCheck size={14}/> {safeTranslate('registered_devotee', 'Member')}</button>
                  <button type="button" onClick={() => setDonorType('GUEST')} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all ${donorType === 'GUEST' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}><User size={14}/> {safeTranslate('guest_donor', 'Guest')}</button>
               </div>

               <form onSubmit={handleRecordDonation} className="space-y-5">
                 {donorType === 'MEMBER' ? (
                   <div className="relative" ref={memberDropdownRef}>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('search_directory', 'Search Directory')} *</label>
                     <input 
                       type="text" required={donorType === 'MEMBER'} value={memberSearch}
                       onChange={(e) => { setMemberSearch(e.target.value); setShowMemberDropdown(true); setDonationForm({...donationForm, memberId: '', memberName: ''}); }}
                       onFocus={() => setShowMemberDropdown(true)}
                       className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-green-500 focus:ring-4 focus:ring-green-50 outline-none transition-all shadow-sm" 
                       placeholder={safeTranslate('type_to_search', 'Type to search...')}
                     />
                     {showMemberDropdown && memberSearch && (
                       <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto ring-1 ring-black/5">
                         {members.filter(m => (m.name && m.name.toLowerCase().includes(memberSearch.toLowerCase())) || (m.phone && m.phone.includes(memberSearch))).map(m => (
                           <div key={m.id} onClick={() => { setMemberSearch(`${m.name} (${m.phone || m.id})`); setDonationForm({...donationForm, memberId: m.id, memberName: m.name}); setShowMemberDropdown(false); }} className="p-3.5 hover:bg-green-50 border-b border-gray-50 cursor-pointer transition-colors flex items-center justify-between">
                             <div>
                               <p className="text-sm font-bold text-gray-900">{m.name}</p>
                               <p className="text-[10px] text-gray-500 font-mono mt-0.5">{m.phone || 'No Phone'}</p>
                             </div>
                             <span className="text-[9px] font-black text-green-600 bg-green-50 px-2 py-1 rounded uppercase tracking-widest">{m.id}</span>
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 ) : (
                   <div className="space-y-5">
                     <div>
                       <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('guest_name', 'Guest Name')} *</label>
                       <input type="text" required={donorType === 'GUEST'} value={donationForm.memberName} onChange={e=>setDonationForm({...donationForm, memberName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm" placeholder="e.g. Swopon Kumar" />
                     </div>
                     <div>
                       <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('guest_phone', 'Guest Phone')} ({safeTranslate('optional', 'Optional')})</label>
                       <input type="tel" value={donationForm.guestPhone} onChange={e=>setDonationForm({...donationForm, guestPhone: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm" placeholder="+880..." />
                     </div>
                   </div>
                 )}

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Accounting Category *</label>
                     <select required value={donationForm.category} onChange={e=>setDonationForm({...donationForm, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-green-500 outline-none transition-all appearance-none cursor-pointer shadow-sm">
                       {INCOME_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('payment_method', 'Payment Method')} *</label>
                     <select value={donationForm.paymentMethod} onChange={e=>setDonationForm({...donationForm, paymentMethod: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-green-500 outline-none transition-all appearance-none cursor-pointer shadow-sm">
                       <option value="CASH">{safeTranslate('cash', 'CASH')}</option>
                       <option value="BANK_TRANSFER">{safeTranslate('bank_transfer', 'BANK TRANSFER')}</option>
                       <option value="MOBILE_BANKING">{safeTranslate('mobile_banking', 'MOBILE BANKING')}</option>
                     </select>
                   </div>
                 </div>

                 <div className="bg-green-50/50 p-5 rounded-2xl border border-green-100 mt-2">
                   <label className="block text-[10px] font-black text-green-800 uppercase tracking-widest mb-1.5">{safeTranslate('amount', 'Amount')} ({curSymbol}) *</label>
                   <input type="number" required value={donationForm.amount} onChange={e=>setDonationForm({...donationForm, amount: e.target.value})} className="w-full p-4 bg-white border border-green-300 rounded-xl text-2xl font-black text-green-700 focus:border-green-500 focus:ring-4 focus:ring-green-100 outline-none transition-all shadow-sm" placeholder="0.00" />
                 </div>

                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('note', 'Note')} ({safeTranslate('optional', 'Optional')})</label>
                   <input type="text" value={donationForm.note} onChange={e=>setDonationForm({...donationForm, note: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-green-500 outline-none transition-all shadow-sm" placeholder="e.g. Monthly Seva" />
                 </div>

                 <div className="pt-2">
                   <button type="submit" disabled={submitting} className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 sm:py-5 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none">
                     {submitting ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18}/> {safeTranslate('btn_confirm_chanda', 'Confirm Income')}</>}
                   </button>
                 </div>
               </form>
             </div>
          </div>
        </div>, document.body
      )}

      {/* ✨ ENTERPRISE EXPENSE MODAL */}
      {showExpenseModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-red-500 flex flex-col h-full max-h-[95dvh] sm:max-h-[90vh] animate-in zoom-in-95 ring-1 ring-white/20">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 tracking-tight"><TrendingDown className="text-red-600" size={24}/> {safeTranslate('btn_record_expense', 'Record Expense')}</h3>
               <button onClick={() => setShowExpenseModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
             </div>

             <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white scrollbar-hide pb-32 sm:pb-8">
               <form onSubmit={handleRecordExpense} className="space-y-5">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="relative" ref={eventDropdownRef}>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('event_name', 'Project / Event')} *</label>
                     <input type="text" required value={eventSearch} onChange={(e) => { setEventSearch(e.target.value); setShowEventDropdown(true); }} onFocus={() => setShowEventDropdown(true)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-50 outline-none transition-all shadow-sm" placeholder={safeTranslate('type_to_search', 'Type event name...')} />
                     {showEventDropdown && (
                       <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto ring-1 ring-black/5">
                         {events.filter(ev => ev.toLowerCase().includes(eventSearch.toLowerCase())).length > 0 ? (
                            events.filter(ev => ev.toLowerCase().includes(eventSearch.toLowerCase())).map((ev, i) => (
                              <div key={i} onClick={() => { setEventSearch(ev); setShowEventDropdown(false); }} className="p-3.5 hover:bg-red-50 border-b border-gray-50 cursor-pointer transition-colors flex items-center gap-2">
                                <CalendarDays size={14} className="text-gray-400"/>
                                <span className="text-sm font-bold text-gray-700">{ev}</span>
                              </div>
                            ))
                         ) : null}
                         {eventSearch && !events.some(ev => ev.toLowerCase() === eventSearch.toLowerCase()) && (
                           <div onClick={() => setShowEventDropdown(false)} className="p-3.5 text-red-600 font-black text-sm bg-red-50/50 hover:bg-red-100 cursor-pointer flex items-center gap-2 transition-colors sticky bottom-0 border-t border-red-100">
                             <Plus size={16} className="shrink-0"/> Create new project: "{eventSearch}"
                           </div>
                         )}
                       </div>
                     )}
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Accounting Category *</label>
                     <select required value={expenseForm.category} onChange={e=>setExpenseForm({...expenseForm, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-red-500 outline-none transition-all appearance-none cursor-pointer shadow-sm">
                       {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                     </select>
                   </div>
                 </div>

                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('item_purchased', 'Item / Vendor')} *</label>
                   <input type="text" required value={expenseForm.itemName} onChange={e=>setExpenseForm({...expenseForm, itemName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-red-500 outline-none transition-all shadow-sm" placeholder="e.g. Flowers, Transport, etc." />
                 </div>

                 <div className="relative" ref={expenseMemberDropdownRef}>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('handled_by', 'Handled By / Spender')} *</label>
                   <input type="text" required value={expenseForm.involvedPerson} onChange={(e) => { setExpenseForm({...expenseForm, involvedPerson: e.target.value}); setShowExpenseMemberDropdown(true); }} onFocus={() => setShowExpenseMemberDropdown(true)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-50 outline-none transition-all shadow-sm" placeholder={safeTranslate('search_name', "Name of person or vendor...")}/>
                   {showExpenseMemberDropdown && members.length > 0 && (
                     <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto ring-1 ring-black/5">
                       {members.filter(m => m.name && m.name.toLowerCase().includes(expenseForm.involvedPerson.toLowerCase())).map(m => (
                         <div key={m.id} onClick={() => { setExpenseForm({...expenseForm, involvedPerson: m.name}); setShowExpenseMemberDropdown(false); }} className="p-3.5 hover:bg-red-50 border-b border-gray-50 cursor-pointer transition-colors flex justify-between items-center">
                           <p className="text-sm font-bold text-gray-900">{m.name}</p>
                           <p className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded uppercase tracking-widest">{m.id}</p>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="bg-red-50/50 p-2 rounded-2xl border border-red-100">
                     <label className="block text-[10px] font-black text-red-800 uppercase tracking-widest mb-1.5 ml-2 mt-2">{safeTranslate('amount', 'Amount')} ({curSymbol}) *</label>
                     <input type="number" required value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm, amount: e.target.value})} className="w-full p-4 bg-white border border-red-300 rounded-xl text-xl font-black text-red-700 focus:border-red-500 focus:ring-4 focus:ring-red-100 outline-none transition-all shadow-sm" placeholder="0.00" />
                   </div>
                   <div className="pt-2">
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('payment_method', 'Payment Method')} *</label>
                     <select value={expenseForm.paymentMethod} onChange={e=>setExpenseForm({...expenseForm, paymentMethod: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-red-500 outline-none transition-all appearance-none cursor-pointer shadow-sm">
                       <option value="CASH">{safeTranslate('cash', 'CASH')}</option>
                       <option value="BANK_TRANSFER">{safeTranslate('bank_transfer', 'BANK TRANSFER')}</option>
                       <option value="MOBILE_BANKING">{safeTranslate('mobile_banking', 'MOBILE BANKING')}</option>
                     </select>
                   </div>
                 </div>

                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('memo_no', 'Memo No')} ({safeTranslate('optional', 'Optional')})</label>
                   <input type="text" value={expenseForm.voucherNo} onChange={e=>setExpenseForm({...expenseForm, voucherNo: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-red-500 outline-none transition-all shadow-sm" placeholder="e.g. V-102" />
                 </div>

                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 border-dashed hover:border-red-400 transition-colors">
                   <label className="flex flex-col items-center justify-center cursor-pointer relative">
                     <div className="flex items-center gap-2 text-xs font-black text-gray-600 uppercase tracking-widest mb-2">
                       <Camera size={16} className={expenseForm.receiptImage ? "text-green-500" : "text-gray-400"} /> 
                       {expenseForm.receiptImage ? safeTranslate('photo_attached', 'Photo Attached') : safeTranslate('attach_memo_photo', 'Attach Memo Photo')}
                     </div>
                     <input type="file" accept="image/*" capture="environment" onChange={handleImageCompression} className="hidden" />
                     {expenseForm.receiptImage ? (
                       <div className="relative group rounded-lg overflow-hidden border-2 border-green-500 shadow-sm">
                         <img src={expenseForm.receiptImage} alt="Memo Preview" className="h-24 object-contain bg-white" />
                         <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <span className="text-white text-[10px] font-black uppercase tracking-widest">{safeTranslate('change_photo', 'Change')}</span>
                         </div>
                       </div>
                     ) : (
                       <p className="text-[10px] font-bold text-gray-400 text-center">{safeTranslate('take_photo_desc', 'Click to snap a picture of the physical receipt.')}</p>
                     )}
                   </label>
                 </div>

                 <div className="pt-2">
                   <button type="submit" disabled={submitting} className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 sm:py-5 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none">
                     {submitting ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18}/> {safeTranslate('btn_confirm_expense', 'Confirm Expense')}</>}
                   </button>
                 </div>
               </form>
             </div>
          </div>
        </div>, document.body
      )}

      {/* ✨ ENTERPRISE IN-KIND ASSET (BHANDARA) MODAL */}
      {showAssetModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-indigo-500 flex flex-col h-full max-h-[95dvh] sm:max-h-[90vh] animate-in zoom-in-95 ring-1 ring-white/20">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 tracking-tight"><Package className="text-indigo-600" size={24}/> {safeTranslate('btn_record_asset', 'Record Physical Asset')}</h3>
               <button onClick={() => setShowAssetModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
             </div>

             <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white scrollbar-hide pb-32 sm:pb-8">
               <div className="flex bg-gray-100 p-1.5 rounded-xl mb-6">
                  <button type="button" onClick={() => setDonorType('MEMBER')} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all ${donorType === 'MEMBER' ? 'bg-white text-indigo-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}><UserCheck size={14}/> {safeTranslate('registered_devotee', 'Member')}</button>
                  <button type="button" onClick={() => setDonorType('GUEST')} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex justify-center items-center gap-2 transition-all ${donorType === 'GUEST' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}><User size={14}/> {safeTranslate('guest_donor', 'Guest')}</button>
               </div>

               <form onSubmit={handleRecordAsset} className="space-y-5">
                 {donorType === 'MEMBER' ? (
                   <div className="relative" ref={memberDropdownRef}>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('search_directory', 'Search Directory')} *</label>
                     <input 
                       type="text" required={donorType === 'MEMBER'} value={memberSearch}
                       onChange={(e) => { setMemberSearch(e.target.value); setShowMemberDropdown(true); setAssetForm({...assetForm, donorId: '', donorName: ''}); }}
                       onFocus={() => setShowMemberDropdown(true)}
                       className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all shadow-sm" 
                       placeholder={safeTranslate('type_to_search', 'Type to search...')}
                     />
                     {showMemberDropdown && memberSearch && (
                       <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto ring-1 ring-black/5">
                         {members.filter(m => (m.name && m.name.toLowerCase().includes(memberSearch.toLowerCase())) || (m.phone && m.phone.includes(memberSearch))).map(m => (
                           <div key={m.id} onClick={() => { setMemberSearch(`${m.name} (${m.phone || m.id})`); setAssetForm({...assetForm, donorId: m.id, donorName: m.name}); setShowMemberDropdown(false); }} className="p-3.5 hover:bg-indigo-50 border-b border-gray-50 cursor-pointer transition-colors flex items-center justify-between">
                             <div>
                               <p className="text-sm font-bold text-gray-900">{m.name}</p>
                               <p className="text-[10px] text-gray-500 font-mono mt-0.5">{m.phone || 'No Phone'}</p>
                             </div>
                             <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded uppercase tracking-widest">{m.id}</span>
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 ) : (
                   <div className="space-y-5">
                     <div>
                       <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('guest_name', 'Guest Name')} *</label>
                       <input type="text" required={donorType === 'GUEST'} value={assetForm.donorName} onChange={e=>setAssetForm({...assetForm, donorName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-sm" placeholder="e.g. Swopon Kumar" />
                     </div>
                     <div>
                       <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('guest_phone', 'Guest Phone')} ({safeTranslate('optional', 'Optional')})</label>
                       <input type="tel" value={assetForm.guestPhone} onChange={e=>setAssetForm({...assetForm, guestPhone: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-sm" placeholder="+880..." />
                     </div>
                   </div>
                 )}

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Asset Category *</label>
                     <select required value={assetForm.category} onChange={e=>setAssetForm({...assetForm, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all appearance-none cursor-pointer shadow-sm">
                       {ASSET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Item Name *</label>
                     <input type="text" required value={assetForm.itemName} onChange={e=>setAssetForm({...assetForm, itemName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-sm" placeholder="e.g. Basmati Rice" />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Quantity *</label>
                     <input type="number" required value={assetForm.quantity} onChange={e=>setAssetForm({...assetForm, quantity: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xl font-black text-indigo-700 focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-sm" placeholder="50" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Unit *</label>
                     <select required value={assetForm.unit} onChange={e=>setAssetForm({...assetForm, unit: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all appearance-none cursor-pointer shadow-sm">
                       <option value="KG">KG</option>
                       <option value="Liters">Liters</option>
                       <option value="Pieces">Pieces</option>
                       <option value="Bags">Bags</option>
                       <option value="Grams">Grams (Gold/Silver)</option>
                     </select>
                   </div>
                 </div>

                 <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100 shadow-inner mt-2">
                   <div className="flex justify-between items-center mb-1.5">
                     <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Est. Market Value ({curSymbol}) *</label>
                     <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">Adds to Seva Score</span>
                   </div>
                   <input type="number" required value={assetForm.estimatedValue} onChange={e=>setAssetForm({...assetForm, estimatedValue: e.target.value})} className="w-full p-4 bg-white border border-indigo-200 rounded-xl text-2xl font-black text-indigo-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all shadow-sm" placeholder="0.00" />
                 </div>

                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Allocated Purpose</label>
                   <input type="text" value={assetForm.allocatedTo} onChange={e=>setAssetForm({...assetForm, allocatedTo: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-sm" placeholder="e.g. Annadaan Bhandara" />
                 </div>

                 <div className="pt-2">
                   <button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 sm:py-5 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none">
                     {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Package size={18}/> Record Asset & Update Score</>}
                   </button>
                 </div>
               </form>
             </div>
          </div>
        </div>, document.body
      )}

      {/* ✨ ENTERPRISE PLEDGE (SUBSCRIPTION) MODAL */}
      {showPledgeModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-purple-500 flex flex-col h-full max-h-[95dvh] sm:max-h-[90vh] animate-in zoom-in-95 ring-1 ring-white/20">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 tracking-tight"><Repeat className="text-purple-600" size={24}/> {safeTranslate('btn_create_pledge', 'Create Pledge')}</h3>
               <button onClick={() => setShowPledgeModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
             </div>

             <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-white scrollbar-hide pb-32 sm:pb-8">
               <form onSubmit={handleCreatePledge} className="space-y-5">

                 <div className="relative" ref={memberDropdownRef}>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{safeTranslate('search_directory', 'Search Directory')} *</label>
                   <input 
                     type="text" required value={memberSearch}
                     onChange={(e) => { setMemberSearch(e.target.value); setShowMemberDropdown(true); setPledgeForm({...pledgeForm, memberId: '', memberName: '', memberPhone: ''}); }}
                     onFocus={() => setShowMemberDropdown(true)}
                     className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-50 outline-none transition-all shadow-sm" 
                     placeholder={safeTranslate('type_to_search', 'Type to search...')}
                   />
                   {showMemberDropdown && memberSearch && (
                     <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto ring-1 ring-black/5">
                       {members.filter(m => (m.name && m.name.toLowerCase().includes(memberSearch.toLowerCase())) || (m.phone && m.phone.includes(memberSearch))).map(m => (
                         <div key={m.id} onClick={() => { setMemberSearch(`${m.name} (${m.phone || m.id})`); setPledgeForm({...pledgeForm, memberId: m.id, memberName: m.name, memberPhone: m.phone}); setShowMemberDropdown(false); }} className="p-3.5 hover:bg-purple-50 border-b border-gray-50 cursor-pointer transition-colors flex items-center justify-between">
                           <div>
                             <p className="text-sm font-bold text-gray-900">{m.name}</p>
                             <p className="text-[10px] text-gray-500 font-mono mt-0.5">{m.phone || 'No Phone'}</p>
                           </div>
                           <span className="text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-1 rounded uppercase tracking-widest">{m.id}</span>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>

                 <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100 mt-2">
                   <label className="block text-[10px] font-black text-purple-800 uppercase tracking-widest mb-1.5">Committed Amount ({curSymbol}) *</label>
                   <input type="number" required value={pledgeForm.committedAmount} onChange={e=>setPledgeForm({...pledgeForm, committedAmount: e.target.value})} className="w-full p-4 bg-white border border-purple-300 rounded-xl text-2xl font-black text-purple-700 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all shadow-sm" placeholder="0.00" />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Frequency *</label>
                     <select required value={pledgeForm.frequency} onChange={e=>setPledgeForm({...pledgeForm, frequency: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-purple-500 outline-none transition-all appearance-none cursor-pointer shadow-sm">
                       <option value="MONTHLY">Monthly</option>
                       <option value="YEARLY">Yearly</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Due Day (1-28) *</label>
                     <input type="number" min="1" max="28" required value={pledgeForm.dueDay} onChange={e=>setPledgeForm({...pledgeForm, dueDay: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-purple-500 outline-none transition-all shadow-sm" placeholder="1" />
                   </div>
                 </div>

                 <div className="pt-2">
                   <button type="submit" disabled={submitting} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 sm:py-5 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none">
                     {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Repeat size={18}/> Create Subscription</>}
                   </button>
                 </div>
               </form>
             </div>
          </div>
        </div>, document.body
      )}

    </div>
  );
}