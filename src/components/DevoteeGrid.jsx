import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom'; 
import { ref, onValue, update, increment, serverTimestamp, push, get } from 'firebase/database';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext'; 
import { 
  Users, Search, UserPlus, ShieldAlert, X, Loader2, Phone, Key, 
  Banknote, Edit, Trash2, CheckCircle2, Plus, Droplet, 
  UploadCloud, Download, ChevronLeft, ChevronRight, MapPin, Globe2, 
  WifiOff, Heart, MessageSquare, Camera, CreditCard, QrCode, Mail, 
  History, Award, Star, ShieldCheck, FileText, Activity, Crown, Filter,
  HelpCircle, Lightbulb, FileDigit, FileDown, AlertTriangle, LayoutGrid, List, Ticket,
  Ban, Flame, HeartHandshake
} from 'lucide-react';
import { pushToDataLayer } from '../utils/gtm'; 
import { usePlanGate } from '../hooks/usePlanGate';

// ✨ CSV ENGINE
import { generateGroupCSV } from '../utils/csvGenerator';

const encodeIdentity = (ident) => {
  if (!ident) return '';
  return ident.toString().trim().toLowerCase().replace(/\./g, ',');
};

export default function DevoteeGrid({ session, isOnline = navigator.onLine }) {
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

  // ✨ Dynamic Institution Label
  const institutionLabel = useMemo(() => {
    switch (String(workspaceType || '').toUpperCase()) {
      case 'GOSHALA': return safeTranslate('workspace_goshala', 'Goshala', 'গোশালা', 'गौशाला');
      case 'SANGHA': return safeTranslate('workspace_sangha', 'Sangha', 'সংঘ', 'संघ');
      case 'ASHRAM': return safeTranslate('workspace_ashram', 'Ashram', 'আশ্রম', 'आश्रम');
      case 'GURUKUL': return safeTranslate('workspace_gurukul', 'Gurukul', 'গুরকুল', 'गुरुकुल');
      case 'SATSANG': return safeTranslate('workspace_satsang', 'Satsang', 'সৎসঙ্গ', 'सत्संग');
      case 'YOGA': return safeTranslate('workspace_yoga', 'Yoga Center', 'যোগ কেন্দ্র', 'योग केंद्र');
      case 'TRUST': return safeTranslate('workspace_trust', 'Trust', 'ট্রাস্ট', 'ट्रस्ट');
      case 'TIRTH': return safeTranslate('workspace_tirth', 'Tirth / Dham', 'তীর্থ', 'तीर्थ');
      case 'SAMAJ': return safeTranslate('workspace_samaj', 'Samaj', 'সমাজ', 'समाज');
      case 'MANDIR':
      default: return safeTranslate('workspace_mandir', 'Mandir', 'মন্দির', 'मंदिर');
    }
  }, [workspaceType, language, t]);

  // 💾 OFFLINE CACHE INITIALIZATION
  const [members, setMembers] = useState(() => {
    try {
      const cached = localStorage.getItem(`sb_members_${session.communityId}`);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  const [devoteeCount, setDevoteeCount] = useState(() => {
    const cached = localStorage.getItem(`sb_count_${session.communityId}`);
    return cached ? parseInt(cached, 10) : 0;
  });

  const [loading, setLoading] = useState(!members.length);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'TABLE'

  const [memberLimit, setMemberLimit] = useState(50);
  const [mandirPlan, setMandirPlan] = useState(session.plan || 'FREE');

  const [showGuide, setShowGuide] = useState(false); 
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeMember, setActiveMember] = useState(null); 
  const [profileTab, setProfileTab] = useState('IDENTITY'); 
  const [activeMemberPin, setActiveMemberPin] = useState(null); 
  const [showQR, setShowQR] = useState(false); 
  const [showImporter, setShowImporter] = useState(false); 
  const [editModal, setEditModal] = useState(null); 
  const [submitting, setSubmitting] = useState(false);

  // ENTERPRISE TOAST & CONFIRM MODAL
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [formData, setFormData] = useState({ 
    name: '', phone: '', email: '', gotra: '', bloodGroup: '', 
    country: '', nid: '', address: '', role: 'MEMBER', designation: '', photoUrl: '' 
  });

  const [chandaData, setChandaData] = useState({ amount: '', note: '', paymentMethod: 'CASH', handledBy: session?.userName || '' });
  const [showHandledByDropdown, setShowHandledByDropdown] = useState(false);
  const [showChandaForm, setShowChandaForm] = useState(false);
  const [userTransactions, setUserTransactions] = useState([]); 

  const [activityFilterType, setActivityFilterType] = useState('ALL');
  const [activityDateRange, setActivityDateRange] = useState({ start: '', end: '' });

  const [currentPage, setCurrentPage] = useState(1);
  const devoteesPerPage = 12;

  const [csvPreview, setCsvPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const editPhotoRef = useRef(null);

  const curSymbol = session?.currency?.symbol || '৳';
  const isAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN';
  const isStaff = isAdmin || session?.role === 'MANAGER';

  useEffect(() => {
    pushToDataLayer('view_directory', { user_role: session.role, community_id: session.communityId });

    const memRef = ref(db, `communities/${session.communityId}/members`);
    const unsubMem = onValue(memRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const memArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        memArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setMembers(memArray);
        localStorage.setItem(`sb_members_${session.communityId}`, JSON.stringify(memArray));
      } else {
        setMembers([]);
        localStorage.removeItem(`sb_members_${session.communityId}`);
      }
      setLoading(false);
    });

    const infoRef = ref(db, `communities/${session.communityId}/info`);
    const unsubInfo = onValue(infoRef, (snapshot) => {
      if (snapshot.exists()) {
        setDevoteeCount(snapshot.val().devoteeCount || 0);
        setMandirPlan(snapshot.val().plan || 'FREE');
        localStorage.setItem(`sb_count_${session.communityId}`, snapshot.val().devoteeCount || 0);
      }
    });

    const globalRef = ref(db, 'app_config/global_settings');
    const unsubGlobal = onValue(globalRef, (snap) => {
      if (snap.exists() && snap.val().free_member_limit !== undefined) setMemberLimit(snap.val().free_member_limit);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubMem(); unsubInfo(); unsubGlobal(); clearTimeout(failsafe); };
  }, [session.communityId, session.role]);

  useEffect(() => {
    if (activeMember) {
      const cachedPin = localStorage.getItem(`sb_pin_${activeMember.id}`);
      setActiveMemberPin(cachedPin || null);

      const cachedTrans = localStorage.getItem(`sb_trans_${activeMember.id}`);
      if (cachedTrans) {
        try { setUserTransactions(JSON.parse(cachedTrans)); } catch (e) { setUserTransactions([]); }
      } else { setUserTransactions([]); }

      if (isStaff || session.uid === activeMember.id) {
        if (isOnline) {
          get(ref(db, `communities/${session.communityId}/logins/${activeMember.id}`)).then(snap => {
            if(snap.exists()) {
              setActiveMemberPin(snap.val());
              localStorage.setItem(`sb_pin_${activeMember.id}`, snap.val());
            }
          }).catch(()=>{}); 
        }
      }

      const transRef = ref(db, `communities/${session.communityId}/logs/Donation`);
      const unsubTrans = onValue(transRef, (snap) => {
        if(snap.exists()) {
           const allTrans = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
           const userTrans = allTrans.filter(t => t.donorId === activeMember.id || (t.name && t.name.includes(activeMember.name)));
           userTrans.sort((a,b) => b.timestamp - a.timestamp);
           setUserTransactions(userTrans);
           localStorage.setItem(`sb_trans_${activeMember.id}`, JSON.stringify(userTrans));
        } else {
           setUserTransactions([]);
           localStorage.removeItem(`sb_trans_${activeMember.id}`);
        }
      });
      return () => unsubTrans();
    } else {
      setShowQR(false);
      setProfileTab('IDENTITY');
    }
  }, [activeMember, session, isOnline, isStaff]);

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

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const matchSearch = (m.name && m.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (m.phone && m.phone.includes(searchTerm)) ||
                          (m.id && m.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (m.bloodGroup && m.bloodGroup.toLowerCase() === searchTerm.toLowerCase()) ||
                          (m.gotra && m.gotra.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchRole = roleFilter === 'ALL' || (m.role || 'MEMBER') === roleFilter;
      return matchSearch && matchRole;
    });
  }, [members, searchTerm, roleFilter]);

  const handledBySuggestions = useMemo(() => {
    if (!chandaData.handledBy.trim()) return members.slice(0, 5);
    return members.filter(m => m.name && m.name.toLowerCase().includes(chandaData.handledBy.toLowerCase())).slice(0, 5);
  }, [members, chandaData.handledBy]);

  const filteredTransactions = useMemo(() => {
    return userTransactions.filter(tr => {
      if (activityFilterType === 'INCOME' && tr.amount <= 0) return false;
      if (activityFilterType === 'EXPENSE' && tr.amount > 0) return false;

      if (activityDateRange.start) {
        const startDate = new Date(activityDateRange.start).getTime();
        if (tr.timestamp < startDate) return false;
      }
      if (activityDateRange.end) {
        const endDate = new Date(activityDateRange.end).setHours(23, 59, 59, 999);
        if (tr.timestamp > endDate) return false;
      }
      return true;
    });
  }, [userTransactions, activityFilterType, activityDateRange]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, roleFilter]);

  const totalPages = Math.ceil(filteredMembers.length / devoteesPerPage) || 1;
  const indexOfLast = currentPage * devoteesPerPage;
  const indexOfFirst = indexOfLast - devoteesPerPage;
  const currentDevotees = filteredMembers.slice(indexOfFirst, indexOfLast);

  const getQrPayloadUrl = () => {
    if (!activeMember || !activeMemberPin) return '';
    return `https://sanatanibandhan.web.app/?action=autologin&id=${activeMember.id}&pin=${activeMemberPin}&workspace=${encodeURIComponent(session.communityName)}`;
  };

  const calculateSevaScore = (donated, transactionCount, attendanceCount = 0) => {
    const base = 50; 
    const volumePoints = Math.floor((donated || 0) / 1000) * 5; 
    const habitPoints = (transactionCount || 0) * 10;
    const attendancePoints = (attendanceCount || 0) * 20;
    return base + volumePoints + habitPoints + attendancePoints;
  };

  const getHaloDesign = (score) => {
    if(score >= 1500) return { color: 'from-yellow-400 via-amber-500 to-purple-600', name: 'Ratna (Pillar)', icon: <Crown size={12}/> };
    if(score >= 500) return { color: 'from-slate-300 to-blue-500', name: 'Vishesh (Core)', icon: <Star size={12}/> };
    if(score >= 100) return { color: 'from-orange-400 to-red-500', name: 'Kormi (Active)', icon: <Activity size={12}/> };
    return { color: 'from-gray-200 to-gray-300', name: 'Sadharan (Member)', icon: <Users size={12}/> };
  };

  // CSV Engine Hooks
  const downloadCsvTemplate = () => {
    const csvContent = "Name,Phone,Email,Gotra,BloodGroup,Country,Address,NID\nRam Roy,+8801700000000,ram@example.com,Kashyap,O+,Bangladesh,Dhaka,1234567890";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Sanatani_Bulk_Template.csv";
    link.click();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) return showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": CSV is empty or missing data rows.", "error");

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIdx = headers.indexOf('name');
      const phoneIdx = headers.indexOf('phone');

      if (nameIdx === -1 || phoneIdx === -1) return showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": CSV must contain 'Name' and 'Phone' headers.", "error");

      const parsedData = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(v => v.trim());
        if (row[nameIdx] && row[phoneIdx]) {
          parsedData.push({
            name: row[nameIdx], phone: row[phoneIdx],
            email: headers.indexOf('email') > -1 ? row[headers.indexOf('email')] : '',
            gotra: headers.indexOf('gotra') > -1 ? row[headers.indexOf('gotra')] : '',
            bloodGroup: headers.indexOf('bloodgroup') > -1 ? row[headers.indexOf('bloodgroup')] : '',
            country: headers.indexOf('country') > -1 ? row[headers.indexOf('country')] : '',
            address: headers.indexOf('address') > -1 ? row[headers.indexOf('address')] : '',
            nid: headers.indexOf('nid') > -1 ? row[headers.indexOf('nid')] : ''
          });
        }
      }
      setCsvPreview(parsedData);
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const executeBulkImport = async () => {
    if (csvPreview.length === 0) return;
    if (!isOnline) return showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": Internet required for global identity validation.", "error");

    const remainingSlots = mandirPlan === 'PREMIUM' ? Infinity : (memberLimit - devoteeCount);
    if (csvPreview.length > remainingSlots) {
      return setConfirmDialog({
        title: safeTranslate('upgrade_title', 'Ready to Scale?', 'স্কেল করতে প্রস্তুত?', 'स्केल करने के लिए तैयार हैं?'),
        message: `You are trying to import ${csvPreview.length} profiles, but your FREE plan only has ${remainingSlots} slots left. Upgrade your workspace to add unlimited members.`,
        confirmText: safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें'),
        isDanger: true,
        onConfirm: () => setConfirmDialog(null)
      });
    }

    setImporting(true);
    try {
      const checks = [];
      csvPreview.forEach(dev => {
        checks.push(get(ref(db, `identity_map/${encodeIdentity(dev.phone)}`)));
        if (dev.email) checks.push(get(ref(db, `identity_map/${encodeIdentity(dev.email)}`)));
      });

      const results = await Promise.all(checks);
      for (const snap of results) {
        if (snap.exists()) throw new Error(`COLLISION: The identity ${snap.key.replace(',', '.')} is already registered.`);
      }

      const updates = {};
      const ts = Date.now();

      for (const dev of csvPreview) {
        const encodedPhone = encodeIdentity(dev.phone);
        const encodedEmail = encodeIdentity(dev.email);
        const memberId = `SB-${Math.floor(1000 + Math.random() * 9000)}`;
        const pinPassword = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');

        updates[`communities/${session.communityId}/members/${memberId}`] = {
          id: memberId, name: dev.name, phone: dev.phone, email: dev.email, gotra: dev.gotra,
          bloodGroup: dev.bloodGroup, country: dev.country, nid: dev.nid, address: dev.address, 
          role: 'MEMBER', designation: '', addedBySignature: `${session.role} - ${session.userName} (Bulk)`, 
          totalDonated: 0, lastDonationAmount: 0, timestamp: ts, lastDonationTimestamp: 0
        };
        updates[`communities/${session.communityId}/logins/${memberId}`] = pinPassword;

        updates[`identity_map/${encodedPhone}`] = { commId: session.communityId, memberId, type: 'DEVOTEE' };
        if (encodedEmail) updates[`identity_map/${encodedEmail}`] = { commId: session.communityId, memberId, type: 'DEVOTEE' };
      }

      updates[`communities/${session.communityId}/info/devoteeCount`] = increment(csvPreview.length); 
      await update(ref(db), updates);
      pushToDataLayer('bulk_import_success', { import_count: csvPreview.length, community_id: session.communityId });
      logAudit("BULK_IMPORT", `Successfully imported ${csvPreview.length} records via CSV.`);

      showToast(`${csvPreview.length} Profiles successfully imported!`);
      setCsvPreview([]);
      setShowImporter(false);
    } catch (e) { showToast(e.message, "error"); } finally { setImporting(false); }
  };

  const handlePhotoUpload = (e, isEdit = false) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      // 🚀 CRITICAL FIX: Replaced "new Image()" with "document.createElement('img')" to prevent mobile WebView crashes
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

        if (isEdit && activeMember) {
           await executeSafeUpdate({ [`communities/${session.communityId}/members/${activeMember.id}/photoUrl`]: compressedBase64 }, safeTranslate('record_updated', 'Record updated successfully.', 'সফলভাবে আপডেট করা হয়েছে।', 'सफलतापूर्वक अपडेट किया गया।'));
           setActiveMember(prev => ({ ...prev, photoUrl: compressedBase64 }));
           pushToDataLayer('edit_photo', { community_id: session.communityId });
        } else {
           setFormData(prev => ({ ...prev, photoUrl: compressedBase64 }));
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  };

  const logAudit = async (actionType, description) => {
    try { push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.email || !formData.bloodGroup || !formData.country) {
      return showToast(safeTranslate('err_all_fields_req', 'All fields are required.', 'সব ফিল্ড পূরণ করা আবশ্যক।', 'सभी फ़ील्ड आवश्यक हैं।'), "error");
    }
    if (!checkQuota('free_member_limit', devoteeCount + 1)) return;

    setSubmitting(true);
    try {
      const encodedPhone = encodeIdentity(formData.phone);
      const encodedEmail = encodeIdentity(formData.email);

      if (isOnline) {
        const phoneCheck = await get(ref(db, `identity_map/${encodedPhone}`));
        if (phoneCheck.exists()) throw new Error(safeTranslate('error', 'Error') + ": This phone number is already registered globally.");
        const emailCheck = await get(ref(db, `identity_map/${encodedEmail}`));
        if (emailCheck.exists()) throw new Error(safeTranslate('error', 'Error') + ": This email is already registered globally.");
      }

      const memberId = `SB-${Math.floor(1000 + Math.random() * 9000)}`;
      const pinPassword = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
      const ts = Date.now();

      const newMemberObj = {
        id: memberId, name: formData.name.trim(), phone: formData.phone.trim(), 
        email: formData.email.trim(), gotra: formData.gotra.trim(), bloodGroup: formData.bloodGroup.trim(), 
        country: formData.country.trim(), nid: formData.nid.trim(), address: formData.address.trim(), 
        photoUrl: formData.photoUrl, role: formData.role, designation: formData.designation.trim(), 
        addedBySignature: `${session.role} - ${session.userName}`, totalDonated: 0, lastDonationAmount: 0,
        timestamp: ts, lastDonationTimestamp: 0
      };

      const updates = {};
      updates[`communities/${session.communityId}/members/${memberId}`] = newMemberObj;
      updates[`communities/${session.communityId}/logins/${memberId}`] = pinPassword;
      updates[`communities/${session.communityId}/info/devoteeCount`] = increment(1); 

      const typeIdent = formData.role === 'ADMIN' ? 'ADMIN' : (formData.role === 'MANAGER' ? 'MANAGER' : 'DEVOTEE');
      updates[`identity_map/${encodedPhone}`] = { commId: session.communityId, memberId, type: typeIdent };
      updates[`identity_map/${encodedEmail}`] = { commId: session.communityId, memberId, type: typeIdent };

      await executeSafeUpdate(updates, safeTranslate('recorded_success', 'Record saved successfully!', 'সফলভাবে রেকর্ড করা হয়েছে!', 'सफलतापूर्वक दर्ज किया गया!'), "Profile saved to offline cache.");
      pushToDataLayer('add_member', { member_role: formData.role, community_id: session.communityId });

      import('../utils/pdfGenerator').then(({ generateLoginCredentialsPdf }) => {
         if (generateLoginCredentialsPdf) generateLoginCredentialsPdf(session.communityName, formData.name.trim(), memberId, pinPassword, session.userName);
      });

      logAudit("MEMBER_ADDED", `Created profile and generated PIN for ${memberId}`);

      setShowAddModal(false);
      setFormData({ name: '', phone: '', email: '', gotra: '', bloodGroup: '', country: '', nid: '', address: '', role: 'MEMBER', designation: '', photoUrl: '' });
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  const handleRecordChanda = async (e) => {
    e.preventDefault();
    if (!chandaData.amount || !chandaData.handledBy) return;
    setSubmitting(true);
    try {
      const amt = parseFloat(chandaData.amount);
      const ts = Date.now();
      const transId = push(ref(db, `communities/${session.communityId}/logs/Donation`)).key;

      const dynamicNote = `${chandaData.note.trim()} | Via: ${chandaData.paymentMethod}`;
      const collectorName = chandaData.handledBy.trim() || session?.userName || 'System';

      const updates = {};
      updates[`communities/${session.communityId}/members/${activeMember.id}/totalDonated`] = increment(amt);
      updates[`communities/${session.communityId}/members/${activeMember.id}/lastDonationTimestamp`] = ts;
      updates[`communities/${session.communityId}/members/${activeMember.id}/lastDonationAmount`] = amt; 
      updates[`communities/${session.communityId}/logs/Donation/${transId}`] = {
        id: transId, donorId: activeMember.id, name: `${activeMember.name || 'User'} [Member]`, amount: amt, 
        note: dynamicNote, paymentMethod: chandaData.paymentMethod, handledBy: collectorName,
        collector: `${collectorName} (${session.uid})`, timestamp: ts, role: session.role
      };

      await executeSafeUpdate(updates, `${curSymbol}${amt} recorded to profile.`, `Donation saved offline.`);
      pushToDataLayer('purchase', { transaction_id: transId, affiliation: session.communityName, value: amt, currency: 'BDT', items: [{ item_name: 'Community Donation', item_category: 'Chanda', price: amt, quantity: 1 }] });
      logAudit("CHANDA_RECORDED", `Recorded ৳${amt} from ${activeMember.name}`);

      setConfirmDialog({
        title: safeTranslate('btn_confirm_chanda', 'Confirm', 'নিশ্চিত করুন', 'पुष्टि करें'),
        message: `✅ ${curSymbol}${amt} ${safeTranslate('recorded_success', 'recorded successfully!', 'সফলভাবে রেকর্ড করা হয়েছে!', 'सफलतापूर्वक दर्ज किया गया!')}\n\nWould you like to download the official PDF receipt now?`,
        confirmText: safeTranslate('download_receipt', 'Download Receipt', 'রসিদ ডাউনলোড করুন', 'रसीद डाउनलोड करें'),
        isDanger: false,
        onConfirm: async () => {
          setConfirmDialog(null);
          import('../utils/pdfGenerator').then(({ generateReceiptPdf }) => {
              if (generateReceiptPdf) generateReceiptPdf(activeMember, amt, dynamicNote, transId, ts);
          });
        }
      });

      setShowChandaForm(false);
      setChandaData({ amount: '', note: '', paymentMethod: 'CASH', handledBy: session?.userName || '' });
      setActiveMember(prev => ({ ...prev, totalDonated: (prev?.totalDonated || 0) + amt, lastDonationTimestamp: ts, lastDonationAmount: amt }));
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  const handleViewOrGeneratePin = async () => {
    try {
      if (activeMemberPin) {
        import('../utils/pdfGenerator').then(({ generateLoginCredentialsPdf }) => {
           if (generateLoginCredentialsPdf) generateLoginCredentialsPdf(session.communityName, activeMember.name, activeMember.id, activeMemberPin, session.userName);
        });
        pushToDataLayer('export_qr_pdf', { community_id: session.communityId });
      } else {
        setConfirmDialog({
          title: safeTranslate('reset_pin', 'Generate Secure PIN', 'নিরাপদ পিন তৈরি করুন', 'सुरक्षित पिन बनाएँ'),
          message: safeTranslate('no_pin_found', '⚠️ No PIN found. Generate a new secure 4-digit PIN for instant access?', '⚠️ কোনো পিন পাওয়া যায়নি। নতুন পিন তৈরি করবেন?', '⚠️ कोई पिन नहीं मिला। क्या नया पिन जनरेट करें?'),
          confirmText: safeTranslate('generate_pin', 'GENERATE PIN', 'পিন তৈরি করুন', 'पिन जनरेट करें'),
          isDanger: false,
          onConfirm: async () => {
            setConfirmDialog(null);
            const newPin = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
            await executeSafeUpdate({ [`communities/${session.communityId}/logins/${activeMember.id}`]: newPin }, safeTranslate('pass_updated_success', 'Secure Password Updated Successfully!', 'পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!', 'पासवर्ड सफलतापूर्वक अपडेट किया गया!'), "PIN generated offline.");
            setActiveMemberPin(newPin);
            localStorage.setItem(`sb_pin_${activeMember.id}`, newPin);

            import('../utils/pdfGenerator').then(({ generateLoginCredentialsPdf }) => {
               if (generateLoginCredentialsPdf) generateLoginCredentialsPdf(session.communityName, activeMember.name, activeMember.id, newPin, session.userName);
            });
          }
        });
      }
    } catch (e) { showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + e.message, "error"); }
  };

  const canEdit = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN' || session.role === 'MANAGER' || session.uid === activeMember?.id;

  const handleEditField = (field, displayName) => {
    if (!canEdit) return showToast(safeTranslate('err_unauthorized', 'Unauthorized.', 'অননুমোদিত অ্যাক্সেস।', 'अनाधिकृत।'), "error");
    setEditModal({ field, displayName, value: activeMember[field] || '' });
  };

  const submitEditField = async () => {
    if (!editModal || !editModal.value.trim()) return;
    const { field, displayName, value } = editModal;
    const trimmedVal = value.trim();

    if (trimmedVal === (activeMember[field] || '')) {
      setEditModal(null);
      return;
    }

    try {
      const updates = {};
      if (field === 'phone' || field === 'email') {
         const encodedNew = encodeIdentity(trimmedVal);
         if (isOnline) {
           const checkSnap = await get(ref(db, `identity_map/${encodedNew}`));
           if (checkSnap.exists()) {
             showToast(safeTranslate('error', 'Error') + ` This ${displayName} is already registered globally!`, "error");
             return;
           }
         }
         const oldVal = activeMember[field];
         if (oldVal) updates[`identity_map/${encodeIdentity(oldVal)}`] = null; 

         const typeIdent = activeMember.role === 'ADMIN' ? 'ADMIN' : (activeMember.role === 'MANAGER' ? 'MANAGER' : 'DEVOTEE');
         updates[`identity_map/${encodedNew}`] = { commId: session.communityId, memberId: activeMember.id, type: typeIdent };
      }

      updates[`communities/${session.communityId}/members/${activeMember.id}/${field}`] = trimmedVal;
      await executeSafeUpdate(updates, safeTranslate('record_updated', 'Record updated successfully.', 'সফলভাবে আপডেট করা হয়েছে।', 'सफलतापूर्वक अपडेट किया गया।'), "Profile update saved offline.");

      pushToDataLayer('edit_member', { field_edited: field, community_id: session.communityId });
      logAudit("MEMBER_EDITED", `Updated ${displayName} for ${activeMember.id}`);
      setActiveMember(prev => ({ ...prev, [field]: trimmedVal })); 
      setEditModal(null);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleRoleChange = async (newRole) => {
    if (activeMember.role === 'ADMIN') return showToast(safeTranslate('err_unauthorized', 'Unauthorized.'), "error");

    setConfirmDialog({
      title: "Update System Role",
      message: `Change permission level to ${newRole}?`,
      confirmText: "UPDATE ROLE",
      isDanger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        const updates = {};
        updates[`communities/${session.communityId}/members/${activeMember.id}/role`] = newRole;

        const typeIdent = newRole === 'ADMIN' ? 'ADMIN' : (newRole === 'MANAGER' ? 'MANAGER' : 'DEVOTEE');
        if (activeMember.phone) updates[`identity_map/${encodeIdentity(activeMember.phone)}/type`] = typeIdent;
        if (activeMember.email) updates[`identity_map/${encodeIdentity(activeMember.email)}/type`] = typeIdent;

        await executeSafeUpdate(updates, safeTranslate('record_updated', 'Record updated successfully.'), "Role change saved offline.");
        pushToDataLayer('change_member_role', { new_role: newRole });
        logAudit("ROLE_CHANGED", `Changed system role to ${newRole} for ${activeMember.id}`);
        setActiveMember(prev => ({ ...prev, role: newRole }));
      }
    });
  };

  const handleDeleteMember = async () => {
    if (activeMember.role === 'ADMIN') return showToast(safeTranslate('err_unauthorized', 'Unauthorized.'), "error");
    if (!isOnline) return showToast(safeTranslate('error', 'Error') + ": Internet connection required to delete accounts.", "error");

    if (session.role === 'MANAGER') {
      setConfirmDialog({
        title: "Request Deletion",
        message: `Send a deletion request to the Head Admin for ${activeMember.name}?`,
        confirmText: "SEND REQUEST",
        isDanger: true,
        onConfirm: async () => {
          try {
            setConfirmDialog(null);
            const newReqRef = push(ref(db, `communities/${session.communityId}/access_requests`));
            await update(newReqRef, {
              uid: session.uid, userName: session.userName, requestType: `DELETE_PROFILE: ${activeMember.id}`,
              targetId: activeMember.id, status: 'PENDING', timestamp: serverTimestamp()
            });
            logAudit("DELETE_REQUESTED", `Manager ${session.userName} requested to delete profile ${activeMember.id}`);
            showToast(safeTranslate('req_submitted', 'Request Submitted!'));
          } catch (e) { showToast(safeTranslate('error', 'Error'), "error"); }
        }
      });
    } else if (isAdmin) {
      setConfirmDialog({
        title: safeTranslate('delete_record', 'Permanently Erase Record'),
        message: `🚨 DANGER: This will completely erase ${activeMember.name}. Are you sure?`,
        confirmText: "DELETE PERMANENTLY",
        isDanger: true,
        onConfirm: async () => {
          try {
            setConfirmDialog(null);
            const updates = {};
            updates[`communities/${session.communityId}/members/${activeMember.id}`] = null;
            updates[`communities/${session.communityId}/logins/${activeMember.id}`] = null;
            updates[`communities/${session.communityId}/info/devoteeCount`] = increment(-1); 

            if (activeMember.phone) updates[`identity_map/${encodeIdentity(activeMember.phone)}`] = null;
            if (activeMember.email) updates[`identity_map/${encodeIdentity(activeMember.email)}`] = null;

            await update(ref(db), updates);
            pushToDataLayer('delete_member', { community_id: session.communityId });
            logAudit("MEMBER_DELETED", `Admin erased member record: ${activeMember.name}`);
            setActiveMember(null);
            showToast(safeTranslate('success', 'Success'));
          } catch (e) { showToast(e.message, "error"); }
        }
      });
    }
  };

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : 'ॐ';

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full flex flex-col min-h-[90vh]">

      {/* TOAST PORTAL */}
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

      {/* ✨ ENTERPRISE CONFIRM MODAL PORTAL */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center border-t-4 border-sanatani-orange">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner ${confirmDialog.isDanger ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
              {confirmDialog.isDanger ? <Ban size={32}/> : <CheckCircle2 size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors">{safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें')}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6 bg-white p-5 sm:p-6 rounded-3xl shadow-sm ring-1 ring-black/5 shrink-0">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Users className="text-sanatani-orange" size={32} /> {institutionLabel} {safeTranslate('nav_directory', 'Directory & CRM', 'ডিরেক্টরি', 'निर्देशिका')}
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            {safeTranslate('guest_crm_subtitle', 'Manage your community network, view engagement scores, and export custom audiences.', 'আপনার কমিউনিটি নেটওয়ার্ক পরিচালনা করুন', 'अपने समुदाय नेटवर्क को प्रबंधित करें')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200 w-full sm:w-auto overflow-x-auto">
            <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 whitespace-nowrap transition-colors">
              <HelpCircle size={14}/> {safeTranslate('quick_guide', 'Guide', 'গাইড', 'गाइड')}
            </button>
            <button onClick={() => setViewMode('GRID')} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 whitespace-nowrap ${viewMode === 'GRID' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <LayoutGrid size={14}/> Grid
            </button>
            <button onClick={() => setViewMode('TABLE')} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 whitespace-nowrap ${viewMode === 'TABLE' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <List size={14}/> Table
            </button>
          </div>

          {isAdmin && (
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => {setShowImporter(true); setCsvPreview([]);}} className="flex-1 sm:flex-none bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all hover:-translate-y-0.5 shrink-0">
                <UploadCloud size={16}/> {safeTranslate('bulk_csv_importer', 'CSV Import', 'CSV ইম্পোর্টার', 'बल्क CSV आयातक')}
              </button>
              <button onClick={() => setShowAddModal(true)} className="flex-1 sm:flex-none bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all hover:-translate-y-0.5 shrink-0">
                <Plus size={16}/> Add {safeTranslate(workspaceType === 'Goshala' ? 'gau_sevaks' : 'members', 'Members', 'সদস্যবৃন্দ', 'सदस्य')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-5 sm:p-6 rounded-2xl shadow-inner relative animate-in slide-in-from-top-2 shrink-0">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors"><X size={18}/></button>
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 mb-3 uppercase tracking-widest"><Lightbulb size={18} className="text-blue-500"/> CRM Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed mb-5 max-w-4xl">
            This module replaces scattered Excel sheets. Tap any profile to access their full "My Space" interface, view their Seva Index, assign roles, or generate their Digital Gate Pass.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
             <div className="bg-white/80 p-4 rounded-xl border border-blue-100 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
               <UploadCloud size={20} className="text-blue-500 shrink-0"/> 
               <div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-blue-900 mb-0.5">{safeTranslate('guide_devotee_step1_title', '1. Provision Profiles', '১. প্রোফাইল তৈরি করুন', '1. प्रोफाइल बनाएं')}</p>
                 <p className="text-[9px] font-bold text-gray-500 leading-tight">{safeTranslate('guide_devotee_step1_desc', 'Add devotees to your digital workspace securely.', 'আপনার ডিজিটাল ওয়ার্কস্পেসে সদস্যদের যুক্ত করুন।', 'अपने डिजिटल कार्यक्षेत्र में सदस्यों को सुरक्षित रूप से जोड़ें।')}</p>
               </div>
             </div>
             <div className="bg-white/80 p-4 rounded-xl border border-blue-100 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
               <Banknote size={20} className="text-blue-500 shrink-0"/> 
               <div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-blue-900 mb-0.5">{safeTranslate('guide_devotee_step2_title', '2. Log Chanda', '২. তহবিল সংগ্রহ', '2. योगदान दर्ज करें')}</p>
                 <p className="text-[9px] font-bold text-gray-500 leading-tight">{safeTranslate('guide_devotee_step2_desc', 'Record incoming donations directly to a member\'s profile.', 'সরাসরি একজন সদস্যের প্রোফাইলে চাঁদা বা দান লগ করুন।', 'सीधे सदस्य की प्रोफ़ाइल पर दान लॉग करें।')}</p>
               </div>
             </div>
             <div className="bg-white/80 p-4 rounded-xl border border-blue-100 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
               <ShieldCheck size={20} className="text-blue-500 shrink-0"/> 
               <div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-blue-900 mb-0.5">{safeTranslate('guide_devotee_step3_title', '3. Admin Controls', '৩. অ্যাডমিন কন্ট্রোল', '3. व्यवस्थापक नियंत्रण')}</p>
                 <p className="text-[9px] font-bold text-gray-500 leading-tight">{safeTranslate('guide_devotee_step3_desc', 'Assign roles, reset secure PINs, or update identity details.', 'ম্যানেজার/অ্যাডমিন রোল সেট করুন, পিন রিসেট করুন।', 'भूमिकाएं असाइन करें, सुरक्षित पिन रीसेट करें।')}</p>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-200 shadow-sm shrink-0">
        <div className="relative w-full sm:w-96">
          <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder={safeTranslate('search_directory', "Search by name, phone, or gotra...", "ডিরেক্টরি খুঁজুন", "निर्देशिका खोजें")}
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-sanatani-orange transition-colors shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
          <Filter size={14} className="text-gray-400 shrink-0 hidden sm:block"/>
          {['ALL', 'MEMBER', 'MANAGER', 'ADMIN'].map(role => (
            <button 
              key={role} 
              onClick={() => setRoleFilter(role)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border shadow-sm ${roleFilter === role ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}
            >
              {role === 'ALL' ? (safeTranslate('filter_all', 'All', 'সব', 'सभी')) : role}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: GRID MODE                                                         */}
      {/* ========================================================================= */}
      {viewMode === 'GRID' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 animate-in fade-in flex-1">
            {currentDevotees.length > 0 ? (
              currentDevotees.map(m => {
                const liveScore = calculateSevaScore(m.totalDonated, 0, m.attendanceCount); 
                const halo = getHaloDesign(liveScore);

                return (
                  <div key={m.id} onClick={() => setActiveMember(m)} className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer relative overflow-hidden group">
                    <div className={`absolute top-0 left-0 w-full h-1.5 transition-colors ${m.role === 'ADMIN' ? 'bg-red-500' : m.role === 'MANAGER' ? 'bg-blue-500' : 'bg-gray-200 group-hover:bg-sanatani-orange'}`}></div>

                    <div>
                      <div className="flex justify-between items-start mb-5">
                        <div className={`w-16 h-16 rounded-full p-1 bg-gradient-to-tr ${halo.color} shadow-md shrink-0`}>
                          <div className="bg-white rounded-full h-full w-full overflow-hidden border-2 border-white flex items-center justify-center">
                            {m.photoUrl ? (
                              <img src={m.photoUrl} alt={m.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl font-black text-gray-400">{m.name ? m.name.charAt(0).toUpperCase() : 'ॐ'}</span>
                            )}
                          </div>
                        </div>
                        <span className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-md border shadow-sm ${m.role === 'ADMIN' ? 'bg-red-50 text-red-700 border-red-200' : m.role === 'MANAGER' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {safeTranslate('sys_role', 'Sys', 'রোল', 'रोल')}: {m.role || 'MEMBER'}
                        </span>
                      </div>

                      <h3 className="text-lg font-black text-gray-900 truncate mb-1.5 group-hover:text-sanatani-orange transition-colors" title={m.name}>{m.name}</h3>
                      <div className="space-y-2 mb-4">
                        {m.phone && <p className="text-[11px] font-bold text-gray-500 flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-md border border-gray-100 w-fit"><Phone size={12} className="text-gray-400"/> {m.phone}</p>}
                        {m.gotra && <p className="text-[11px] font-bold text-gray-500 flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-md border border-gray-100 w-fit"><ShieldCheck size={12} className="text-gray-400"/> {safeTranslate('gotra', 'Gotra', 'গোত্র', 'गोत्र')}: {m.gotra}</p>}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50 -mx-6 -mb-6 px-6 py-4 group-hover:bg-orange-50/30 transition-colors">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5 truncate">Lifetime {safeTranslate('funds', 'Funds', 'তহবিল', 'निधि')}</p>
                        <p className="text-xl font-black text-green-600 tracking-tight truncate">{curSymbol}{(m.totalDonated || 0).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100 shadow-sm shrink-0" title="Event Attendance Count">
                        <Activity size={12}/> {m.attendanceCount || 0}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="col-span-full py-20 text-center text-gray-400 font-bold bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
                <Users size={48} className="mx-auto mb-4 opacity-20 text-sanatani-orange"/>
                <p className="text-xl font-black text-gray-800 mb-1">{safeTranslate('no_data_found', 'No data found.', 'কোনো ডেটা পাওয়া যায়নি', 'कोई डेटा नहीं मिला')}</p>
                <p className="text-xs uppercase tracking-widest">{safeTranslate('adjust_filters', 'Adjust filters to see results', 'ফলাফল দেখতে ফিল্টার পরিবর্তন করুন', 'परिणाम देखने के लिए फ़िल्टर बदलें')}</p>
              </div>
            )}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-3xl border border-gray-100 shadow-sm mt-6 shrink-0">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2 mb-4 sm:mb-0">{safeTranslate('page', 'Page', 'পৃষ্ঠা', 'पृष्ठ')} {currentPage} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"><ChevronLeft size={20}/></button>
                <div className="flex gap-1 hidden sm:flex">
                  {[...Array(totalPages)].map((_, i) => {
                    if (totalPages > 5 && i !== 0 && i !== totalPages - 1 && Math.abs(currentPage - 1 - i) > 1) {
                      if (i === 1 || i === totalPages - 2) return <span key={i} className="px-2 text-gray-400">...</span>;
                      return null;
                    }
                    return (
                      <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-10 h-10 rounded-xl text-xs font-black transition-all shadow-sm ${currentPage === i + 1 ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"><ChevronRight size={20}/></button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: TABLE MODE                                                        */}
      {/* ========================================================================= */}
      {viewMode === 'TABLE' && (
        <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden animate-in fade-in flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  <th className="p-4 pl-6">{safeTranslate('full_name', 'Full Name', 'সম্পূর্ণ নাম', 'पूरा नाम')}</th>
                  <th className="p-4">{safeTranslate('contact_geo', 'Contact & Location', 'যোগাযোগ ও ভৌগলিক তথ্য', 'संपर्क और भौगोलिक जानकारी')}</th>
                  <th className="p-4">{safeTranslate('gotra_lineage', 'Gotra Lineage', 'গোত্র', 'गोत्र')} & Identity</th>
                  <th className="p-4">{safeTranslate('sys_role', 'System Role', 'সিস্টেম অ্যাক্সেস রোল', 'सिस्टम एक्सेस रोल')}</th>
                  <th className="p-4 text-right">{safeTranslate('lifetime_donated', 'Lifetime Donated', 'মোট অনুদান', 'कुल दान')}</th>
                  <th className="p-4 pr-6 text-center">{safeTranslate('my_profile', 'Profile', 'আমার প্রোফাইল', 'मेरी प्रोफ़ाइल')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                {currentDevotees.length > 0 ? (
                  currentDevotees.map(m => (
                    <tr key={m.id} onClick={() => setActiveMember(m)} className="hover:bg-orange-50/50 transition-colors group cursor-pointer">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-black overflow-hidden shrink-0 border border-gray-200 shadow-sm">
                            {m.photoUrl ? <img src={m.photoUrl} alt="Avatar" className="w-full h-full object-cover"/> : (m.name ? m.name.charAt(0).toUpperCase() : 'ॐ')}
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900 group-hover:text-sanatani-orange transition-colors">{m.name}</p>
                            <p className="text-[9px] text-gray-400 font-mono tracking-widest mt-0.5">ID: {m.id.substring(0,8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded border border-gray-100 w-fit mb-1"><Phone size={12} className="text-gray-400"/> {m.phone || 'N/A'}</p>
                        {m.country && <p className="text-[10px] text-gray-500 font-medium flex items-center gap-1.5 pl-1"><MapPin size={10} className="text-gray-400"/> {m.country}</p>}
                      </td>
                      <td className="p-4">
                        <p className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-purple-400"/> {m.gotra || 'N/A'}</p>
                        {m.bloodGroup && <p className="text-[10px] text-red-500 font-black mt-1 flex items-center gap-1.5"><Droplet size={10} className="text-red-400"/> {m.bloodGroup}</p>}
                      </td>
                      <td className="p-4">
                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border shadow-sm ${m.role === 'ADMIN' ? 'bg-red-50 text-red-700 border-red-200' : m.role === 'MANAGER' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {m.role || 'MEMBER'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-black text-green-600 text-sm">
                        {curSymbol}{(m.totalDonated || 0).toLocaleString()}
                      </td>
                      <td className="p-4 pr-6 text-center">
                        <div className="p-2 bg-gray-100 text-gray-400 group-hover:bg-sanatani-orange group-hover:text-white rounded-xl transition-all shadow-sm inline-block border border-gray-200 group-hover:border-transparent">
                          <ChevronRight size={16} />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="p-16 text-center text-gray-400 font-bold uppercase tracking-widest text-xs border-b border-gray-100">
                      {safeTranslate('no_data_found', 'No records match the selected filters.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* TABLE PAGINATION */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center p-4 bg-gray-50/50 shrink-0 border-t border-gray-200">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2 mb-4 sm:mb-0">{safeTranslate('page', 'Page', 'পৃষ্ঠা', 'पृष्ठ')} {currentPage} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all shadow-sm"><ChevronLeft size={20}/></button>
                <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all shadow-sm"><ChevronRight size={20}/></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: "MY SPACE" COMPREHENSIVE CRM PROFILE VIEW                          */}
      {/* ========================================================================= */}
      {activeMember && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-0 sm:p-4 pt-safe pb-safe">
          <div className="bg-white w-[95%] sm:w-full max-w-4xl h-full sm:h-auto max-h-[95dvh] sm:max-h-[90vh] mx-auto rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 ring-1 ring-white/20">

            {/* DYNAMIC SANATANI GRADIENT COVER FLOW */}
            <div className="h-32 sm:h-40 bg-gradient-to-br from-gray-900 via-gray-800 to-black relative shrink-0 overflow-hidden">
               <div className="absolute inset-0 opacity-10 flex items-center justify-center pointer-events-none">
                 <span className="text-[120px] font-black text-sanatani-orange drop-shadow-2xl">ॐ</span>
               </div>
               <button onClick={() => {setActiveMember(null); setShowChandaForm(false); setShowQR(false);}} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur-sm z-10 shadow-sm"><X size={20}/></button>
            </div>

            {/* PROFILE HEADER */}
            <div className="px-5 sm:px-10 relative bg-white border-b border-gray-100 z-10 shrink-0">
               <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">

                 <div className="-mt-12 sm:-mt-16 relative w-24 h-24 sm:w-32 sm:h-32 mx-auto sm:mx-0 shrink-0 group cursor-pointer rounded-full border-4 border-white bg-white shadow-md z-20" onClick={() => (session.role === 'ADMIN' || session.role === 'MANAGER' || session.uid === activeMember.id) && editPhotoRef.current?.click()}>
                   <div className={`w-full h-full rounded-full p-1 bg-gradient-to-tr ${getHaloDesign(calculateSevaScore(activeMember.totalDonated, userTransactions.length, activeMember.attendanceCount)).color}`}>
                     {activeMember.photoUrl ? (
                       <img src={activeMember.photoUrl} alt="Profile" className="w-full h-full object-cover rounded-full border-2 border-white" />
                     ) : (
                       <div className="w-full h-full bg-white text-gray-400 rounded-full flex items-center justify-center font-black text-4xl sm:text-5xl border-2 border-white">
                         {getInitial(activeMember.name)}
                       </div>
                     )}
                   </div>
                   {(session.role === 'ADMIN' || session.role === 'MANAGER' || session.uid === activeMember.id) && (
                     <div className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md border border-gray-100 text-gray-700 hover:text-sanatani-orange transition-colors z-10">
                       <Camera size={16}/>
                     </div>
                   )}
                   <input type="file" accept="image/*" className="hidden" ref={editPhotoRef} onChange={(e) => handlePhotoUpload(e, true)} />
                 </div>

                 <div className="pb-4 pt-2 sm:pt-4 text-center sm:text-left flex-1 min-w-0 z-10">
                   <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mb-2 whitespace-normal break-words">{activeMember.name || 'Unnamed Profile'}</h2>
                   <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                     <span className="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest bg-gray-100 text-gray-700 border border-gray-200">
                        {activeMember.designation ? activeMember.designation : safeTranslate('members', 'Member', 'সদস্য', 'सदस्य')}
                     </span>
                     <span className="text-[10px] text-gray-500 font-mono font-bold tracking-wider px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm">ID: {activeMember.id}</span>
                     {activeMember.phone && (
                       <a href={`https://wa.me/${activeMember.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Namaskar ${activeMember.name} 🙏,\n\nMessage from ${session.communityName}:`)}`} target="_blank" rel="noreferrer" className="hidden sm:flex bg-[#25D366] hover:bg-[#1da851] text-white font-black py-1.5 px-3 rounded-md text-[9px] uppercase tracking-widest items-center gap-1 shadow-sm transition-all ml-auto">
                         <MessageSquare size={12}/> {safeTranslate('msg_whatsapp', 'WhatsApp', 'হোয়াটসঅ্যাপ', 'व्हाट्सएप')}
                       </a>
                     )}
                   </div>
                 </div>
               </div>

               {/* TAB NAVIGATION */}
               <div className="flex items-center justify-start gap-4 sm:gap-6 pt-2 overflow-x-auto scrollbar-hide w-full px-2 sm:px-0">
                  <button onClick={()=>setProfileTab('PASS')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap flex items-center gap-1.5 ${profileTab === 'PASS' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-700'}`}><Ticket size={14} className="mb-0.5"/> {safeTranslate('gate_pass', 'Gate Pass', 'গেট পাস', 'गेट पास')}</button>
                  <button onClick={()=>setProfileTab('IDENTITY')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${profileTab === 'IDENTITY' ? 'text-sanatani-orange border-b-2 border-sanatani-orange' : 'text-gray-400 hover:text-gray-700'}`}>{safeTranslate('identity_tab', 'Identity', 'পরিচয়', 'पहचान')}</button>
                  <button onClick={()=>setProfileTab('ACTIVITY')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${profileTab === 'ACTIVITY' ? 'text-sanatani-orange border-b-2 border-sanatani-orange' : 'text-gray-400 hover:text-gray-700'}`}>{safeTranslate('activity_tab', 'Activity', 'অ্যাক্টিভিটি', 'गतिविधि')}</button>

                  {/* ADMINS CAN SEE VEDIC HUB FOR OTHER USERS TO MANAGE MATRIMONIAL/PUROHIT STATUS */}
                  {(isAdmin || session.role === 'MANAGER') && (
                    <button onClick={()=>setProfileTab('GLOBAL')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap flex items-center gap-1.5 ${profileTab === 'GLOBAL' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400 hover:text-gray-700'}`}><Globe2 size={14} className="mb-0.5"/> {safeTranslate('vedic_hub', 'Vedic Hub', 'বেদিক হাব', 'वैदिक हब')}</button>
                  )}

                  {(isAdmin || session.uid === activeMember.id) && <button onClick={()=>setProfileTab('SECURITY')} className={`pb-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors whitespace-nowrap ${profileTab === 'SECURITY' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-700'}`}>{safeTranslate('security_tab', 'Security', 'নিরাপত্তা', 'सुरक्षा')}</button>}
               </div>
            </div>

            <div className="p-4 sm:p-8 overflow-y-auto bg-gray-50/50 flex-1 min-h-0 pb-32 sm:pb-12 scrollbar-hide">

              {/* ✨ NEW TAB: SAFE GATE PASS */}
              {profileTab === 'PASS' && (
                <div className="space-y-6 animate-in fade-in flex flex-col items-center justify-center py-4">
                   <div className="bg-white rounded-3xl shadow-xl border border-gray-200 w-full max-w-sm overflow-hidden relative">
                      <div className="bg-gradient-to-r from-orange-500 to-red-600 p-6 text-center">
                         <h3 className="text-2xl font-black text-white tracking-widest uppercase">Gate Pass</h3>
                         <p className="text-orange-100 text-xs font-bold mt-1">{session.communityName}</p>
                      </div>
                      <div className="p-8 flex flex-col items-center bg-white relative">
                         <div className="absolute -left-4 top-0 w-8 h-8 bg-gray-50 rounded-full shadow-inner border border-gray-100"></div>
                         <div className="absolute -right-4 top-0 w-8 h-8 bg-gray-50 rounded-full shadow-inner border border-gray-100"></div>

                         <img
                           src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`https://sanatanibandhan.web.app/?action=verify&id=${activeMember.id}`)}`}
                           alt="Safe Gate Pass QR"
                           className="w-48 h-48 rounded-2xl shadow-md border-4 border-white mb-6 bg-white p-2"
                         />
                         <h4 className="text-xl font-black text-gray-900 text-center">{activeMember.name}</h4>
                         <p className="text-sm font-mono font-bold text-gray-500 tracking-widest mt-1 text-center">{activeMember.id}</p>

                         <p className="text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-3 py-1.5 rounded-full mt-5 border border-green-200 flex items-center gap-1.5">
                           <ShieldCheck size={14}/> Identity Verified
                         </p>
                      </div>
                      <div className="bg-gray-50 p-5 border-t border-gray-100 text-center">
                         <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
                           Scan this secure pass at any event gate. It contains <strong className="text-red-500">no</strong> sensitive login credentials.
                         </p>
                      </div>
                   </div>
                </div>
              )}

              {/* TAB 1: IDENTITY */}
              {profileTab === 'IDENTITY' && (
                <div className="space-y-6 animate-in fade-in">
                  {activeMember.phone && (
                     <a 
                       href={`https://wa.me/${activeMember.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Namaskar ${activeMember.name} 🙏,\n\nMessage from ${session.communityName}:`)}`} 
                       target="_blank" rel="noreferrer"
                       className="sm:hidden w-full bg-[#25D366] hover:bg-[#1da851] text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-md transition-all"
                     >
                       <MessageSquare size={16}/> {safeTranslate('msg_whatsapp', 'WhatsApp', 'হোয়াটসঅ্যাপ', 'व्हाट्सएप')}
                     </a>
                  )}

                  <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                    <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><MapPin size={14}/> {safeTranslate('contact_geo', 'Contact & Geo', 'যোগাযোগ ও ভৌগলিক তথ্য', 'संपर्क और भौगोलिक जानकारी')}</span>
                    </div>
                    <div className="divide-y divide-gray-100">

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('full_name', 'Full Name', 'সম্পূর্ণ নাম', 'पूरा नाम')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><User size={14} className="text-gray-400 shrink-0"/> {activeMember.name}</p></div>
                        {(isAdmin || session.role === 'MANAGER' || session.uid === activeMember.id) && <button onClick={() => handleEditField('name', safeTranslate('full_name', 'Full Name', 'সম্পূর্ণ নাম', 'पूरा नाम'))} className="text-blue-600 bg-blue-50 p-2.5 rounded-xl shrink-0 ml-2 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={14}/></button>}
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0 bg-gray-50/50">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('phone_number', 'Phone Number', 'ফোন নম্বর', 'फ़ोन नंबर')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><Phone size={14} className="text-gray-400 shrink-0"/> {activeMember.phone || 'N/A'}</p></div>
                        <Lock size={16} className="text-gray-300 shrink-0 ml-2" title="Contact Admin to update secure login identity."/>
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0 bg-gray-50/50">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('email', 'Email Address', 'ইমেইল', 'ईमेल')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><Mail size={14} className="text-gray-400 shrink-0"/> {activeMember.email || 'N/A'}</p></div>
                        <Lock size={16} className="text-gray-300 shrink-0 ml-2" title="Contact Admin to update secure login identity."/>
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('nid', 'Govt ID / NID', 'জাতীয় পরিচয়পত্র', 'राष्ट्रीय पहचान पत्र')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><CreditCard size={14} className="text-gray-400 shrink-0"/> {activeMember.nid || safeTranslate('not_provided', 'Not Provided', 'দেওয়া হয়নি', 'उपलब्ध नहीं है')}</p></div>
                        {(isAdmin || session.role === 'MANAGER' || session.uid === activeMember.id) && <button onClick={() => handleEditField('nid', safeTranslate('nid', 'Govt ID / NID', 'জাতীয় পরিচয়পত্র', 'राष्ट्रीय पहचान पत्र'))} className="text-blue-600 bg-blue-50 p-2.5 rounded-xl shrink-0 ml-2 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={14}/></button>}
                      </div>

                      <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                        <div className="w-full overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('full_address', 'Full Address', 'সম্পূর্ণ ঠিকানা', 'पूरा पता')}</p><p className="text-sm font-black text-gray-900 flex items-start gap-2 max-w-lg leading-snug"><MapPin size={14} className="text-gray-400 shrink-0 mt-0.5"/> <span className="break-words">{activeMember.address || safeTranslate('not_provided', 'Not Provided', 'দেওয়া হয়নি', 'उपलब्ध नहीं है')}</span></p></div>
                        {(isAdmin || session.role === 'MANAGER' || session.uid === activeMember.id) && <button onClick={() => handleEditField('address', safeTranslate('full_address', 'Full Address', 'সম্পূর্ণ ঠিকানা', 'पूरा पता'))} className="text-blue-600 bg-blue-50 p-2.5 rounded-xl shrink-0 ml-2 hover:bg-blue-100 transition-colors border border-transparent hover:border-blue-200"><Edit size={14}/></button>}
                      </div>

                      <div className="grid grid-cols-2 divide-x divide-gray-100">
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('blood_group', 'Blood Group', 'রক্তের গ্রুপ', 'रक्त समूह')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><Droplet size={14} className="text-red-400 shrink-0"/> {activeMember.bloodGroup || 'N/A'}</p></div>
                          {(isAdmin || session.role === 'MANAGER' || session.uid === activeMember.id) && <button onClick={() => handleEditField('bloodGroup', safeTranslate('blood_group', 'Blood Group', 'রক্তের গ্রুপ', 'रक्त समूह'))} className="text-blue-600 bg-blue-50 p-2 rounded-lg shrink-0 hover:bg-blue-100 transition-colors"><Edit size={12}/></button>}
                        </div>
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0 bg-gray-50/50">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('country', 'Country', 'দেশ', 'देश')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><Globe2 size={14} className="text-blue-400 shrink-0"/> {activeMember.country || 'N/A'}</p></div>
                          <Lock size={14} className="text-gray-300 shrink-0 ml-2" title="Contact Master Support to migrate workspace region."/>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 divide-x divide-gray-100">
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('gotra_lineage', 'Gotra Lineage', 'গোত্র', 'गोत्र')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><ShieldCheck size={14} className="text-purple-400 shrink-0"/> {activeMember.gotra || 'N/A'}</p></div>
                          {(isAdmin || session.role === 'MANAGER' || session.uid === activeMember.id) && <button onClick={() => handleEditField('gotra', safeTranslate('gotra_lineage', 'Gotra Lineage', 'গোত্র', 'गोत्र'))} className="text-blue-600 bg-blue-50 p-2 rounded-lg shrink-0 hover:bg-blue-100 transition-colors"><Edit size={12}/></button>}
                        </div>
                        <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors min-w-0">
                          <div className="overflow-hidden min-w-0"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{safeTranslate('cultural_desig', 'Designation', 'পদবী', 'पदनाम')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-1.5 truncate"><Award size={14} className="text-yellow-500 shrink-0"/> {activeMember.designation || 'Member'}</p></div>
                          {isAdmin && <button onClick={() => handleEditField('designation', safeTranslate('cultural_desig', 'Designation', 'পদবী', 'पदनाम'))} className="text-blue-600 bg-blue-50 p-2 rounded-lg shrink-0 hover:bg-blue-100 transition-colors"><Edit size={12}/></button>}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ACTIVITY & GAMIFICATION */}
              {profileTab === 'ACTIVITY' && (
                <div className="space-y-6 animate-in fade-in">

                  <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-6">
                     {(() => {
                        const score = calculateSevaScore(activeMember.totalDonated, userTransactions.length, activeMember.attendanceCount);
                        const halo = getHaloDesign(score);
                        return (
                          <>
                            <div className={`w-16 h-16 rounded-full bg-gradient-to-tr ${halo.color} text-white flex items-center justify-center shrink-0 shadow-lg`}>
                              {halo.icon || <Award size={28}/>}
                            </div>
                            <div className="flex-1 text-center md:text-left">
                              <h3 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('seva_index', 'Seva Index Score', 'সেবা সূচক', 'सेवा सूचकांक')}: <span className="text-sanatani-orange">{score}</span></h3>
                              <p className="text-xs font-bold text-gray-500">{safeTranslate('seva_desc', 'Current Devotee Rank:', 'আপনার বর্তমান র‍্যাঙ্ক হলো', 'आपकी वर्तमान रैंक है')} <strong className="text-gray-800">{halo.name}</strong></p>
                              {activeMember.attendanceCount > 0 && (
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2 bg-emerald-50 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 border border-emerald-100 shadow-sm">
                                  <Flame size={12}/> {activeMember.attendanceCount} {safeTranslate('events_attended', 'Events Attended', 'ইভেন্টে অংশগ্রহণ করেছেন', 'इवेंट में भाग लिया')}
                                </p>
                              )}
                            </div>
                          </>
                        )
                     })()}
                  </div>

                  <div className="bg-white border border-green-200 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-sm relative overflow-hidden">
                     <div className="absolute top-0 right-0 -mt-6 -mr-6 opacity-5 pointer-events-none"><Banknote size={120} className="text-green-600"/></div>
                     <div className="text-center sm:text-left relative z-10">
                       <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-1.5 flex items-center justify-center sm:justify-start gap-1.5"><Banknote size={14}/> {safeTranslate('lifetime_donated', 'Lifetime Donated', 'মোট অনুদান', 'कुल दान')}</p>
                       <p className="text-4xl font-black text-green-600 tracking-tight">{curSymbol}{(activeMember.totalDonated || 0).toLocaleString()}</p>
                     </div>
                     {(session.role === 'ADMIN' || session.role === 'MANAGER') && (
                       <button onClick={() => setShowChandaForm(!showChandaForm)} className={`w-full sm:w-auto text-white font-black px-6 py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 relative z-10 ${showChandaForm ? 'bg-gray-900 hover:bg-black' : 'bg-green-600 hover:bg-green-700 hover:-translate-y-0.5'}`}>
                         {showChandaForm ? <X size={16}/> : <Plus size={16}/>} {safeTranslate('btn_record_chanda', 'Record Income', 'আয় রেকর্ড করুন', 'आय दर्ज करें')}
                       </button>
                     )}
                  </div>

                  {showChandaForm && (
                     <form onSubmit={handleRecordChanda} className="bg-white border-2 border-green-500 rounded-3xl p-6 shadow-xl animate-in zoom-in-95 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
                        <div className="flex flex-col sm:flex-row gap-4 mb-4">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{safeTranslate('amount_bdt', 'Amount (৳)', 'পরিমাণ (৳)', 'राशि (৳)')} ({curSymbol})</label>
                            <input type="number" required value={chandaData.amount} onChange={e=>setChandaData({...chandaData, amount: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-lg font-black text-green-700 focus:bg-white focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all shadow-sm" />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{safeTranslate('payment_method', 'Payment Method', 'পেমেন্ট মাধ্যম', 'भुगतान विधि')}</label>
                            <select value={chandaData.paymentMethod} onChange={e=>setChandaData({...chandaData, paymentMethod: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold focus:bg-white focus:border-green-500 transition-all shadow-sm cursor-pointer appearance-none">
                              <option value="CASH">{safeTranslate('cash', 'CASH', 'নগদ', 'नकद')}</option>
                              <option value="BANK_TRANSFER">{safeTranslate('bank_transfer', 'BANK TRANSFER', 'ব্যাংক ট্রান্সফার', 'बैंक ट्रांसफर')}</option>
                              <option value="MOBILE_BANKING">{safeTranslate('mobile_banking', 'MOBILE BANKING', 'মোবাইল ব্যাংকিং', 'मोबाइल बैंकिंग')}</option>
                              <option value="CHEQUE">CHEQUE</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mb-6 relative">
                          <div className="flex-[2]">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{safeTranslate('note_optional', 'Note (Optional)', 'বিবরণ (ঐচ্ছিক)', 'विवरण (वैकल्पिक)')}</label>
                            <input type="text" value={chandaData.note} onChange={e=>setChandaData({...chandaData, note: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold focus:bg-white focus:border-green-500 transition-all shadow-sm" placeholder="e.g. Monthly Seva" />
                          </div>

                          <div className="flex-1 relative">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{safeTranslate('handled_by', 'Handled By', 'সংগ্রহকারী', 'संग्रहकर्ता')} *</label>
                            <input 
                              type="text" required 
                              value={chandaData.handledBy} 
                              onFocus={() => setShowHandledByDropdown(true)}
                              onChange={e => {
                                setChandaData({...chandaData, handledBy: e.target.value});
                                setShowHandledByDropdown(true);
                              }} 
                              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold focus:bg-white focus:border-green-500 transition-all shadow-sm" 
                              placeholder="Name"
                            />
                            {showHandledByDropdown && handledBySuggestions.length > 0 && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto ring-1 ring-black/5">
                                {handledBySuggestions.map(s => (
                                  <div 
                                    key={s.id} 
                                    onClick={() => {
                                      setChandaData({...chandaData, handledBy: s.name});
                                      setShowHandledByDropdown(false);
                                    }}
                                    className="p-3 hover:bg-green-50 text-xs font-bold text-gray-800 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
                                  >
                                    {s.name} <span className="text-[10px] text-gray-400 font-bold ml-1 uppercase tracking-widest">({s.role})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <button type="submit" disabled={submitting} className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-50 transition-all hover:-translate-y-0.5">
                          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16}/>} Generate E-Receipt
                        </button>
                     </form>
                  )}

                  {/* FILTER BAR FOR TRANSACTIONS */}
                  <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                    <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex flex-col gap-3">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Filter size={14}/> {safeTranslate('filters', 'Filters', 'ফিল্টার করুন', 'फ़िल्टर')}</span>

                      <div className="grid grid-cols-2 md:flex md:flex-row items-center gap-3 w-full">
                        <select 
                          value={activityFilterType} 
                          onChange={e => setActivityFilterType(e.target.value)}
                          className="col-span-2 md:col-span-1 p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none cursor-pointer shadow-sm transition-colors focus:border-sanatani-orange"
                        >
                          <option value="ALL">{safeTranslate('filter_all', 'All Activities', 'সকল লেনদেন', 'सभी गतिविधियां')}</option>
                          <option value="INCOME">{safeTranslate('filter_income', 'Income Only', 'শুধুমাত্র আয়', 'केवल आय')}</option>
                          <option value="EXPENSE">{safeTranslate('filter_expense', 'Expenses Only', 'শুধুমাত্র ব্যয়', 'केवल व्यय')}</option>
                        </select>

                        <div className="col-span-2 md:w-auto flex items-center bg-white border border-gray-200 p-1.5 rounded-xl shadow-sm overflow-x-auto">
                          <input type="date" value={activityDateRange.start} onChange={e => setActivityDateRange({ ...activityDateRange, start: e.target.value })} className="p-1.5 bg-transparent text-xs text-gray-700 font-bold outline-none flex-1 min-w-[110px]" />
                          <span className="text-gray-300 font-bold px-2">-</span>
                          <input type="date" value={activityDateRange.end} onChange={e => setActivityDateRange({ ...activityDateRange, end: e.target.value })} className="p-1.5 bg-transparent text-xs text-gray-700 font-bold outline-none flex-1 min-w-[110px]" />
                          {(activityDateRange.start || activityDateRange.end) && (
                            <button onClick={() => setActivityDateRange({start:'', end:''})} className="bg-gray-100 hover:bg-gray-200 p-1.5 rounded-lg transition-colors ml-1"><X size={14}/></button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-3 scrollbar-hide">
                       {filteredTransactions.length > 0 ? (
                         <div className="space-y-2">
                           {filteredTransactions.map(tr => (
                             <div key={tr.id} className="p-4 bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm rounded-2xl transition-all flex justify-between items-center group min-w-0">
                               <div className="min-w-0 pr-4">
                                 <p className="text-sm font-black text-gray-900 truncate">{tr.note || safeTranslate('general_donation', 'General Donation', 'সাধারণ অনুদান', 'सामान्य दान')}</p>
                                 <p className="text-[10px] font-bold text-gray-400 tracking-wider mt-1">{new Date(tr.timestamp).toLocaleString()}</p>
                               </div>

                               <div className="flex items-center gap-4 shrink-0">
                                 <div className="text-right">
                                   <p className={`text-base font-black ${tr.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{tr.amount >= 0 ? '+' : ''}{curSymbol}{Math.abs(tr.amount)}</p>
                                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">By {tr.collector?.split(' ')[0] || 'System'}</p>
                                 </div>
                                 <button onClick={(e) => { e.stopPropagation(); 
                                     const type = tr.amount >= 0 ? 'INCOME' : 'EXPENSE';
                                     pushToDataLayer('download_receipt', { transaction_id: tr.id, transaction_type: type, value: Math.abs(tr.amount) });
                                     try {
                                       import('../utils/pdfGenerator').then(({ generateReceiptPdf }) => {
                                          generateReceiptPdf(activeSession.communityName, tr, type);
                                       });
                                     } catch (err) { showToast(safeTranslate('error', 'Error', 'ত্রুটি', 'त्रुटि') + ": " + err.message, "error"); }
                                  }} className="text-gray-500 hover:text-sanatani-orange hover:bg-orange-50 p-2.5 rounded-xl border border-transparent hover:border-orange-200 transition-all shadow-sm" title={safeTranslate('download_receipt', 'Download Receipt', 'রসিদ ডাউনলোড করুন', 'रसीद डाउनलोड करें')}>
                                   <FileDigit size={16}/>
                                 </button>
                               </div>

                             </div>
                           ))}
                         </div>
                       ) : (
                         <div className="py-12 text-center text-gray-400">
                           <History size={32} className="mx-auto mb-3 opacity-20"/>
                           <p className="text-xs font-bold uppercase tracking-widest">{safeTranslate('no_matching_activities', 'No activities found.', 'কোনো লেনদেন পাওয়া যায়নি।', 'कोई रिकॉर्ड नहीं मिला।')}</p>
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              )}

              {/* ✨ TAB 3: THE VEDIC HUB (GLOBAL ACCOUNTS - ADMIN VIEW) */}
              {profileTab === 'GLOBAL' && (isAdmin || session.role === 'MANAGER') && (
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
                        Manage this devotee's matrimonial identity and assist them with finding verified matches within the Sanatan community.
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <span className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-inner border border-gray-200 flex items-center gap-1.5">
                          <Search size={14}/> Check Status in Matrimonial Desk
                        </span>
                      </div>
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
                        Verify if this devotee is a registered Acharya, Pandit, or Vedic Scholar on the global network.
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <span className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-inner border border-gray-200 flex items-center gap-1.5">
                          <Search size={14}/> Check Status in Master Admin
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 4: SECURITY & ACCESS */}
              {profileTab === 'SECURITY' && (isAdmin || session.uid === activeMember.id) && (
                <div className="space-y-6 animate-in fade-in">

                  <div className="bg-white border border-blue-100 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col sm:flex-row items-center gap-6 sm:gap-8 relative overflow-hidden text-center sm:text-left">
                     <div className="absolute top-0 left-0 w-1 sm:w-full h-full sm:h-1 bg-blue-500"></div>

                     {showQR ? (
                       <div className="flex flex-col items-center bg-gray-50 p-4 rounded-2xl shadow-inner border border-gray-200 shrink-0 animate-in zoom-in-95 relative overflow-hidden">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getQrPayloadUrl())}`} 
                            alt="Secure Auto-Login URL QR" 
                            className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl mb-3 border border-gray-200 shadow-sm blur-sm hover:blur-none transition-all duration-300"
                          />
                          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-200">Auto-Login Active</p>
                       </div>
                     ) : (
                       <div className="w-32 h-32 sm:w-40 sm:h-40 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center text-blue-300 shrink-0 shadow-inner">
                         <QrCode size={48}/>
                       </div>
                     )}

                     <div className="flex flex-col justify-center w-full">
                        <h3 className="text-lg font-black text-gray-900 mb-1">{safeTranslate('account_recovery_qr', 'Account Recovery QR', 'অ্যাকাউন্ট রিকভারি QR', 'खाता पुनर्प्राप्ति QR')}</h3>
                        <p className="text-xs font-bold text-gray-500 mb-4 max-w-sm mx-auto sm:mx-0">{safeTranslate('qr_recovery_desc', 'Download or scan this to automatically log back into the workspace if the PIN is forgotten.', 'আপনার পিন ভুলে গেলে স্বয়ংক্রিয়ভাবে লগ ইন করতে এটি ডাউনলোড বা স্ক্যান করুন।', 'यदि आप अपना पिन भूल जाते हैं तो स्वचालित रूप से लॉग इन करने के लिए इसे डाउनलोड या स्कैन करें।')}</p>

                        <p className="text-[10px] font-bold text-red-500 mb-6 bg-red-50 p-3 rounded-xl border border-red-100 text-left flex items-start gap-2 leading-relaxed">
                          <AlertTriangle size={16} className="shrink-0 mt-0.5"/> 
                          {safeTranslate('qr_warning', 'WARNING: This QR code contains your secure PIN. Do not show this to volunteers at the gate. Use the "Gate Pass" tab instead.', 'সতর্কতা: এই QR কোডে আপনার পিন রয়েছে। এটি গেটে স্বেচ্ছাসেবকদের দেখাবেন না।', 'चेतावनी: इस QR कोड में आपका पिन है। इसे गेट पर न दिखाएं।')}
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                           <button onClick={() => { setShowQR(!showQR); pushToDataLayer('view_personal_qr', { community_id: session.communityId }); }} className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-sm">
                             {showQR ? safeTranslate('hide_qr', 'Hide QR', 'QR লুকান', 'QR छिपाएं') : safeTranslate('view_qr', 'View QR', 'QR দেখুন', 'QR देखें')}
                           </button>
                           <button onClick={handleViewOrGeneratePin} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                             <Download size={14}/> {safeTranslate('download_pdf_card', 'Download PDF Card', 'PDF ডাউনলোড করুন', 'PDF डाउनलोड करें')}
                           </button>
                        </div>
                     </div>
                  </div>

                  {isAdmin && (
                    <div className="border border-red-100 bg-red-50/50 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                      <p className="text-[10px] font-black text-red-600 flex items-center gap-2 uppercase tracking-widest mb-6 border-b border-red-100 pb-3"><ShieldAlert size={16}/> {safeTranslate('admin_controls', 'Admin Controls', 'অ্যাডমিন কন্ট্রোল', 'व्यवस्थापक नियंत्रण')}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <button onClick={handleViewOrGeneratePin} className="bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest flex justify-center items-center gap-2 shadow-md transition-all hover:-translate-y-0.5">
                          <Key size={14}/> {safeTranslate('reset_pin', 'Reset Secure PIN', 'নিরাপদ পিন রিসেট করুন', 'सुरक्षित पिन रीसेट करें')}
                        </button>
                        {activeMember.role === 'MANAGER' ? (
                          <button onClick={() => handleRoleChange('MEMBER')} className="bg-white border border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50 font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-sm hover:-translate-y-0.5">
                            {safeTranslate('demote_member', 'Demote to Member', 'সদস্য হিসেবে ডিমোট করুন', 'सदस्य के रूप में डिमोट करें')}
                          </button>
                        ) : (
                          <button onClick={() => handleRoleChange('MANAGER')} className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 text-sanatani-orange hover:from-orange-100 hover:to-red-100 font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-sm hover:-translate-y-0.5">
                            {safeTranslate('promote_manager', 'Promote to Manager', 'ম্যানেজার হিসেবে প্রমোট করুন', 'प्रबंधक के रूप में प्रमोट करें')}
                          </button>
                        )}
                      </div>

                      <button onClick={handleDeleteMember} className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-sm hover:-translate-y-0.5 mt-2">
                        <Trash2 size={16}/> {safeTranslate('delete_record', 'Erase Devotee Record', 'রেকর্ড স্থায়ীভাবে মুছুন', 'रिकॉर्ड स्थायी रूप से मिटाएं')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* ========================================================================= */}
      {/* MODAL: INLINE EDIT                                                        */}
      {/* ========================================================================= */}
      {editModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 ring-1 ring-white/20 relative">
              <button onClick={() => setEditModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full"><X size={16}/></button>

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

      {/* ========================================================================= */}
      {/* MODAL: BULK IMPORTER (ENTERPRISE UPGRADE)                                 */}
      {/* ========================================================================= */}
      {showImporter && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-[95%] sm:w-full max-w-2xl mx-auto overflow-hidden fade-in flex flex-col h-full max-h-[95dvh] sm:max-h-[90vh] ring-1 ring-white/20">

            <div className="bg-gradient-to-r from-gray-900 to-black p-6 sm:p-8 relative shrink-0 border-b-4 border-sanatani-orange">
               <button onClick={() => setShowImporter(false)} className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2.5 rounded-full backdrop-blur-sm shadow-sm"><X size={20}/></button>
               <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3 tracking-tight"><UploadCloud className="text-sanatani-orange" size={28}/> {safeTranslate('bulk_csv_importer', 'Bulk CSV Importer', 'বাল্ক CSV ইম্পোর্টার', 'बल्क CSV आयातक')}</h2>
               <p className="text-[10px] sm:text-xs font-bold text-gray-400 mt-2 tracking-widest uppercase">{safeTranslate('csv_subtitle', 'Quickly populate your directory.', 'কাগজের খাতা নিমিষেই ডিজিটাল করুন।', 'कागजी रजिस्टरों को तुरंत डिजिटल करें।')}</p>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto bg-gray-50/50 pb-32 sm:pb-12 flex-1 min-h-0 scrollbar-hide">
              {!csvPreview.length > 0 && (
                <div className="space-y-6 sm:space-y-8">
                  <div className="flex gap-4 items-start bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="bg-orange-100 text-sanatani-orange font-black w-8 h-8 rounded-full flex justify-center items-center shrink-0 shadow-inner">1</div>
                    <div>
                      <h4 className="text-sm font-black text-gray-900">{safeTranslate('download_template', 'Download Template', 'টেমপ্লেট ডাউনলোড করুন', 'टेम्पलेट डाउनलोड करें')}</h4>
                      <p className="text-[10px] text-gray-500 font-bold mb-3 uppercase tracking-wider">Get the exact column structure required.</p>
                      <button onClick={downloadCsvTemplate} className="flex items-center gap-2 bg-white border border-gray-200 hover:border-sanatani-orange hover:text-sanatani-orange text-gray-700 px-4 py-2.5 rounded-xl text-xs font-black shadow-sm transition-all"><Download size={14}/> Download CSV</button>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="bg-orange-100 text-sanatani-orange font-black w-8 h-8 rounded-full flex justify-center items-center shrink-0 shadow-inner">2</div>
                    <div>
                      <h4 className="text-sm font-black text-gray-900">{safeTranslate('format_data', 'Format Data', 'ডেটা ফরম্যাট করুন', 'डेटा को प्रारूपित करें')}</h4>
                      <p className="text-xs text-gray-500 font-bold leading-relaxed mt-1">Ensure <code className="bg-gray-100 px-1.5 py-0.5 rounded-md text-gray-700 border border-gray-200">Name</code> and <code className="bg-gray-100 px-1.5 py-0.5 rounded-md text-gray-700 border border-gray-200">Phone</code> columns are completely filled.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="bg-orange-100 text-sanatani-orange font-black w-8 h-8 rounded-full flex justify-center items-center shrink-0 shadow-inner">3</div>
                    <div className="w-full">
                      <h4 className="text-sm font-black text-gray-900 mb-3">{safeTranslate('upload_file', 'Upload File', 'ফাইল আপলোড করুন', 'फ़ाइल अपलोड करें')}</h4>
                      <label className="border-2 border-dashed border-gray-300 hover:border-sanatani-orange hover:bg-orange-50/30 bg-gray-50 rounded-2xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center w-full group">
                        <UploadCloud size={48} className="text-gray-300 mb-4 group-hover:text-sanatani-orange transition-colors group-hover:scale-110" />
                        <p className="text-xs font-black text-gray-600 uppercase tracking-widest">Click or drag your .csv file here.</p>
                        <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {csvPreview.length > 0 && (
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-xl animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h4 className="text-sm sm:text-base font-black text-green-600 flex items-center gap-2"><CheckCircle2 size={20}/> {safeTranslate('data_validated', 'Data Validated', 'ডেটা যাচাই সম্পন্ন', 'डेटा सत्यापित')}</h4>
                    <span className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest shadow-sm">{csvPreview.length} {safeTranslate('records', 'Records', 'টি প্রোফাইল', 'प्रोफाइल')}</span>
                  </div>

                  <div className="max-h-64 overflow-y-auto mb-6 space-y-2 pr-2 scrollbar-hide">
                    {csvPreview.slice(0, 15).map((row, i) => (
                      <div key={i} className="flex justify-between items-center text-xs font-mono bg-gray-50 border border-gray-100 p-3.5 rounded-xl min-w-0 gap-2 hover:border-gray-200 transition-colors">
                        <span className="text-gray-900 font-bold truncate flex-1 min-w-0">{row.name}</span>
                        <span className="text-gray-500 shrink-0 bg-white px-2 py-1 rounded shadow-sm border border-gray-100">{row.phone}</span>
                      </div>
                    ))}
                    {csvPreview.length > 15 && <p className="text-center text-[10px] text-gray-400 italic pt-4 font-black uppercase tracking-widest">...and {csvPreview.length - 15} more records ready.</p>}
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                    <button onClick={() => setCsvPreview([])} className="px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shadow-sm">{safeTranslate('btn_cancel', 'Cancel', 'বাতিল', 'रद्द करें')}</button>
                    <button onClick={executeBulkImport} disabled={importing} className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest bg-gray-900 text-white hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none">
                      {importing ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} {safeTranslate('btn_import', 'Import Now', 'ইমপোর্ট করুন', 'आयात (Import)')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* ========================================================================= */}
      {/* MODAL: PROVISION NEW MEMBER                                               */}
      {/* ========================================================================= */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white w-[95%] sm:w-full max-w-4xl h-full sm:h-auto max-h-[95dvh] sm:max-h-[90vh] mx-auto rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 ring-1 ring-white/20">

            <div className="flex justify-between items-center p-5 sm:p-8 border-b border-gray-100 shrink-0 bg-gray-50/50">
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
                <UserPlus size={24} className="text-sanatani-orange" /> {safeTranslate('prov_profile', 'Provision Profile', 'নিরাপদ প্রোফাইল তৈরি করুন', 'प्रोफ़ाइल बनाएँ')}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-800 bg-gray-100 p-2.5 rounded-full transition-colors shadow-sm"><X size={20}/></button>
            </div>

            <div className="p-5 sm:p-8 overflow-y-auto flex-1 min-h-0 bg-white pb-32 sm:pb-12 scrollbar-hide">
              <form onSubmit={handleAddMember} className="space-y-6 sm:space-y-8">

                <div className="flex flex-col items-center justify-center">
                   <label className="relative group cursor-pointer w-24 h-24 sm:w-32 sm:h-32 bg-gray-50 border-4 border-gray-100 rounded-full flex flex-col items-center justify-center hover:border-sanatani-orange transition-all shadow-inner overflow-hidden">
                     {formData.photoUrl ? (
                       <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                     ) : (
                       <Camera size={32} className="text-gray-300 mb-1 group-hover:text-sanatani-orange transition-colors" />
                     )}
                     <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{formData.photoUrl ? 'Change' : 'Upload'}</span>
                     </div>
                     <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e, false)} />
                   </label>
                   <span className="text-[10px] font-bold text-gray-400 mt-3 uppercase tracking-widest">Profile Photo (Optional)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                   <div className="sm:col-span-2 flex items-center gap-3 border-b border-gray-100 pb-2">
                      <ShieldCheck size={16} className="text-green-500" />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{safeTranslate('req_identity_data', 'Required Identity Data', 'প্রয়োজনীয় পরিচয় তথ্য', 'आवश्यक पहचान डेटा')}</span>
                   </div>

                   <div>
                     <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('full_name', 'Full Name', 'সম্পূর্ণ নাম', 'पूरा नाम')} *</label>
                     <input type="text" required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. Adesh Chandra" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('phone_number', 'Phone Number', 'ফোন নম্বর', 'फ़ोन नंबर')} *</label>
                     <input type="tel" required value={formData.phone} onChange={e=>setFormData({...formData, phone: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. +88017000000" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('email', 'Email Address', 'ইমেইল', 'ईमेल')} *</label>
                     <input type="email" required value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="email@domain.com" />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('blood_group', 'Blood Group', 'রক্তের গ্রুপ', 'रक्त समूह')} *</label>
                       <input type="text" required value={formData.bloodGroup} onChange={e=>setFormData({...formData, bloodGroup: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. O+" />
                     </div>
                     <div>
                       <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('country', 'Country', 'দেশ', 'देश')} *</label>
                       <input type="text" required value={formData.country} onChange={e=>setFormData({...formData, country: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. Bangladesh" />
                     </div>
                   </div>

                   <div className="sm:col-span-2 flex items-center gap-3 border-b border-gray-100 pb-2 mt-2">
                      <MapPin size={16} className="text-gray-400" />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{safeTranslate('ext_details', 'Extended Details (Optional)', 'অতিরিক্ত তথ্য (ঐচ্ছিক)', 'विस्तृत जानकारी (वैकल्पिक)')}</span>
                   </div>

                   <div>
                     <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('nid', 'Govt ID / NID', 'জাতীয় পরিচয়পত্র', 'राष्ट्रीय पहचान पत्र')}</label>
                     <input type="text" value={formData.nid} onChange={e=>setFormData({...formData, nid: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="ID Number" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('gotra_lineage', 'Gotra Lineage', 'গোত্র', 'गोत्र')}</label>
                     <input type="text" value={formData.gotra} onChange={e=>setFormData({...formData, gotra: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. Kashyap" />
                   </div>
                   <div className="sm:col-span-2">
                     <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('full_address', 'Full Address', 'সম্পূর্ণ ঠিকানা', 'पूरा पता')}</label>
                     <input type="text" value={formData.address} onChange={e=>setFormData({...formData, address: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="House, Street, City, Region..." />
                   </div>
                   <div className="sm:col-span-2">
                     <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{safeTranslate('cultural_desig', 'Designation', 'পদবী', 'पदनाम')}</label>
                     <input type="text" value={formData.designation} onChange={e=>setFormData({...formData, designation: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. Chief Pujari, Cashier, Advisor..." />
                   </div>

                   {isAdmin && (
                     <div className="sm:col-span-2 p-5 sm:p-6 bg-orange-50 border border-orange-100 rounded-3xl mt-4 relative overflow-hidden shadow-inner">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-sanatani-orange"></div>
                        <label className="block text-[10px] font-black text-orange-800 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Key size={14}/> {safeTranslate('sys_role', 'System Access Role', 'সিস্টেম অ্যাক্সেস রোল', 'सिस्टम एक्सेस रोल')}</label>
                        <select value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value})} className="w-full p-4 bg-white border border-orange-200 rounded-xl text-sm font-black text-orange-900 outline-none shadow-sm cursor-pointer focus:border-sanatani-orange focus:ring-4 focus:ring-orange-100 transition-all appearance-none">
                          <option value="MEMBER">MEMBER (Read Only / Basic Profile)</option>
                          <option value="MANAGER">MANAGER (Can log funds & events)</option>
                          <option value="ADMIN">ADMIN (Full Superuser Access)</option>
                        </select>
                     </div>
                   )}
                </div>

                <div className="pt-6 mt-8 border-t border-gray-100">
                  <button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-black py-4 rounded-2xl text-sm uppercase tracking-widest flex justify-center items-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 disabled:opacity-50 disabled:transform-none">
                    {submitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20}/>} {submitting ? 'PROCESSING...' : (safeTranslate('prov_profile', 'Provision Secure Profile', 'নিরাপদ প্রোফাইল তৈরি করুন', 'प्रोफ़ाइल बनाएँ'))}
                  </button>
                  <p className="text-center text-[10px] font-bold text-gray-400 mt-4 uppercase tracking-widest">Auto-Login QR & Credentials PDF will generate automatically.</p>
                </div>
              </form>
            </div>
          </div>
        </div>
      , document.body)}

      {/* 🏛️ ENTERPRISE FOOTER CREDIT */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500 shrink-0">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Universal Directory & CRM
      </div>

    </div>
  );
}
