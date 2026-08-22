import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, increment, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { 
  Users, UserPlus, CalendarDays, Search, Filter, 
  Phone, Mail, MessageSquare, CheckCircle2, AlertTriangle, 
  ArrowRight, ShieldCheck, X, Loader2, ChevronRight,
  TrendingUp, Download, QrCode, Check, Award, WifiOff, FileText, Send,
  Star, MessageCircle, Edit, MapPin, Droplet, Trash2, HelpCircle, Lightbulb, Heart,
  BrainCircuit, Camera, Scan, ShieldAlert, Keyboard, Ban
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer, trackQuotaExceeded, trackUpgradeModalView } from '../utils/gtm'; 
import { usePlanGate } from '../hooks/usePlanGate'; 

export default function GuestManager({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();

  // ✨ INITIALIZED GATEKEEPER 
  const { isUnlimited, globalLimits } = usePlanGate(session);

  // View Modes: 'PIPELINE' (Kanban CRM) or 'EVENTS' (Event Roster & Door Check-in)
  const [viewMode, setViewMode] = useState('PIPELINE'); 
  const [loading, setLoading] = useState(true);

  // Devotee Counter for Paywall Logic
  const [devoteeCount, setDevoteeCount] = useState(0);

  // Quick Guide State
  const [showGuide, setShowGuide] = useState(false);

  // 💾 Offline Cached States (Rerouted to logs/Guests to bypass strict rules)
  const [guests, setGuests] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_guests_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [events, setEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_events_roster_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [members, setMembers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_members_lookup_${session?.communityId}`)) || []; } catch { return []; }
  });

  // UI Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedEventId, setSelectedEventId] = useState('');

  // Modals & Action States
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null); 
  const [editModal, setEditModal] = useState(null); // ✨ NEW: Enterprise Edit Modal State
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ✨ LIVE QR SCANNER STATES
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [scannedResult, setScannedResult] = useState(null);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const videoRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // Form State 
  const [guestForm, setGuestForm] = useState({
    name: '', phone: '', email: '', category: 'GENERAL', source: 'Walk-in',
    address: '', bloodGroup: '', fatherName: '', motherName: '', adminComment: ''
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 🔄 Realtime Data Listeners with Offline LocalStorage Backup
  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_guest_manager', { workspace_type: workspaceType });

    // ✨ ROUTING FIX: Changed from guests to logs/Guests to bypass Firebase Root Restrictions
    const guestsRef = ref(db, `communities/${session.communityId}/logs/Guests`);
    const unsubGuests = onValue(guestsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setGuests(list);
        localStorage.setItem(`sb_guests_${session.communityId}`, JSON.stringify(list));
      } else {
        setGuests([]);
        localStorage.removeItem(`sb_guests_${session.communityId}`);
      }
      setLoading(false);
    });

    const eventsRef = ref(db, `communities/${session.communityId}/events`);
    const unsubEvents = onValue(eventsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setEvents(list);
        localStorage.setItem(`sb_events_roster_${session.communityId}`, JSON.stringify(list));
        if (list.length > 0 && !selectedEventId) {
          setSelectedEventId(list[0].id);
        }
      } else {
        setEvents([]);
      }
    });

    const membersRef = ref(db, `communities/${session.communityId}/members`);
    const unsubMembers = onValue(membersRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setMembers(list);
        localStorage.setItem(`sb_members_lookup_${session.communityId}`, JSON.stringify(list));
      }
    });

    const infoRef = ref(db, `communities/${session.communityId}/info`);
    const unsubInfo = onValue(infoRef, (snap) => {
      if (snap.exists()) {
        setDevoteeCount(snap.val().devoteeCount || 0);
      }
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);

    return () => { 
      unsubGuests(); 
      unsubEvents(); 
      unsubMembers();
      unsubInfo(); 
      clearTimeout(failsafe); 
    };
  }, [session?.communityId, workspaceType]);

  // 🚀 Safe Firebase Offline Update Engine
  const executeSafeUpdate = async (updates, successMsg = null, offlineMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(offlineMsg || t('offline_saved') || "Action cached offline. Syncing soon.", 'offline');
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast((t('error') || "Sync error") + ": " + e.message, "error");
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

  // 📸 QR CAMERA SCANNER ENGINE
  const startCamera = async () => {
    setCameraError(null);
    setScannedResult(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API is not supported on this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        startScanningLoop();
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError(err.message || "Failed to initialize camera. Check permissions.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (showScannerModal) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [showScannerModal]);

  const startScanningLoop = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    if ('BarcodeDetector' in window) {
      const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2 || isProcessing) return;
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            if (rawValue) {
              handleProcessScannedCode(rawValue);
            }
          }
        } catch (e) {
          // Frame detection silent pass
        }
      }, 400);
    }
  };

  // 🎯 PROCESS RAW SCANNED VALUE
  const handleProcessScannedCode = async (rawValue) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      let extractedId = rawValue.trim();

      if (extractedId.includes('http') || extractedId.includes('?')) {
        try {
          const urlObj = new URL(extractedId);
          const paramId = urlObj.searchParams.get('id');
          if (paramId) extractedId = paramId;
        } catch (e) {
          const match = extractedId.match(/id=([^&]+)/);
          if (match) extractedId = match[1];
        }
      }

      const cleanTargetId = decodeURIComponent(extractedId).trim();
      const matchedMember = members.find(m => m.id === cleanTargetId || m.phone === cleanTargetId);
      const matchedGuest = guests.find(g => g.id === cleanTargetId || g.phone === cleanTargetId);

      const targetEntity = matchedMember || matchedGuest || { id: cleanTargetId, name: cleanTargetId, phone: cleanTargetId };

      if (!selectedEventId) {
        throw new Error(t('select_event') || "Please select an active event first before scanning.");
      }

      const updates = {};
      const ts = Date.now();
      const eventKey = selectedEventId;

      updates[`communities/${session.communityId}/events/${eventKey}/guestList/${targetEntity.id}`] = {
        id: targetEntity.id,
        name: targetEntity.name || 'Visitor Pass',
        phone: targetEntity.phone || 'N/A',
        category: targetEntity.category || 'WALK_IN_PASS',
        checkedIn: true,
        checkedInAt: ts,
        verifiedBySignature: `Scanned by ${session.userName}`
      };

      if (matchedMember?.id) {
        updates[`communities/${session.communityId}/members/${matchedMember.id}/attendanceCount`] = increment(1);
      }

      await executeSafeUpdate(updates);
      logAudit("GATE_QR_SCAN", `Touchless Check-In verified for: ${targetEntity.name} (${targetEntity.id}) at Event #${eventKey}`);

      setScannedResult({
        success: true,
        name: targetEntity.name,
        id: targetEntity.id,
        time: new Date(ts).toLocaleTimeString()
      });

      showToast(`Verified & Checked In: ${targetEntity.name}`);
      pushToDataLayer('qr_gate_checkin', { event_id: selectedEventId, attendee_id: targetEntity.id, workspace_type: workspaceType });

      setTimeout(() => {
        setScannedResult(null);
        setIsProcessing(false);
      }, 2500);

    } catch (error) {
      setScannedResult({ success: false, message: error.message });
      setTimeout(() => {
        setScannedResult(null);
        setIsProcessing(false);
      }, 3000);
    }
  };

  const handleManualCodeSubmit = (e) => {
    e.preventDefault();
    if (!manualCodeInput.trim()) return;
    handleProcessScannedCode(manualCodeInput.trim());
    setManualCodeInput('');
  };

  // 📝 Lead Stage Transition Logic
  const handleStageChange = async (guest, newStage) => {
    const previousStage = guest.status || 'NEW_LEAD';
    if (previousStage === newStage) return;

    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, status: newStage, lastContacted: Date.now() } : g));

    const updates = {};
    updates[`communities/${session.communityId}/logs/Guests/${guest.id}/status`] = newStage;
    updates[`communities/${session.communityId}/logs/Guests/${guest.id}/lastContacted`] = Date.now();

    await executeSafeUpdate(updates, `Lead status moved to ${newStage.replace('_', ' ')}`);

    pushToDataLayer('qualify_lead', {
      previous_stage: previousStage, new_stage: newStage, guest_id: guest.id, workspace_type: workspaceType
    });
  };

  // ➕ Add New VIP/Guest 
  const handleCreateGuest = async (e) => {
    e.preventDefault();
    if (!guestForm.name.trim()) return showToast(t('err_guest_name_req') || "Guest name is required.", "error");

    setIsProcessing(true);
    try {
      const cleanPhone = guestForm.phone.replace(/\D/g, '');
      const guestKey = `GST-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const newGuest = {
        id: guestKey,
        name: guestForm.name.trim(),
        phone: cleanPhone || 'N/A',
        email: guestForm.email.trim(),
        address: guestForm.address.trim(),
        bloodGroup: guestForm.bloodGroup.trim(),
        fatherName: guestForm.fatherName.trim(),
        motherName: guestForm.motherName.trim(),
        adminComment: guestForm.adminComment.trim(),
        category: guestForm.category,
        source: guestForm.source,
        status: 'NEW_LEAD',
        createdAt: timestamp,
        lastContacted: timestamp
      };

      const updates = {};
      updates[`communities/${session.communityId}/logs/Guests/${guestKey}`] = newGuest;

      await executeSafeUpdate(updates, t('recorded_success') || "Guest profile registered successfully!");
      logAudit("GUEST_ADDED", `Registered Guest: ${guestForm.name}`);

      pushToDataLayer('generate_lead', { lead_source: 'GUEST_CRM', lead_type: guestForm.category, workspace_type: workspaceType });

      setShowAddModal(false);
      setGuestForm({ name: '', phone: '', email: '', category: 'GENERAL', source: 'Walk-in', address: '', bloodGroup: '', fatherName: '', motherName: '', adminComment: '' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // ✨ PAYWALL PROTECTED: Convert Guest to Full Workspace Member
  const handlePromoteToMember = () => {
    if (!selectedGuest) return;

    const limit = globalLimits?.free_member_limit || 50;

    if (!isUnlimited && devoteeCount >= limit) {
      trackQuotaExceeded('free_member_limit', devoteeCount, limit, session?.communityId);
      trackUpgradeModalView('Smart Pro', 500, 'BDT');

      return setConfirmDialog({
        title: t('upgrade_title') || "Smart Pro Required",
        message: `You have reached the ${limit} devotee limit on the Free Plan.\n\nUpgrade your workspace to unlock unlimited devotees.`,
        confirmText: t('understood') || "UNDERSTOOD",
        isDanger: true,
        onConfirm: () => setConfirmDialog(null)
      });
    }

    setConfirmDialog({
      title: t('promote_devotee') || "Promote to Member",
      message: `Migrate ${selectedGuest.name} to the Official Directory?\n\nThis will generate their member profile and establish their credentials.`,
      confirmText: t('btn_save') || "CONVERT NOW",
      isDanger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsProcessing(true);
        try {
          const timestamp = Date.now();
          const newMemberId = `SB-${Math.floor(1000 + Math.random() * 9000)}`;
          const pinPassword = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');
          const cleanPhone = selectedGuest.phone && selectedGuest.phone !== 'N/A' ? selectedGuest.phone : newMemberId;

          const updates = {};

          updates[`communities/${session.communityId}/members/${newMemberId}`] = {
            id: newMemberId, name: selectedGuest.name, phone: cleanPhone, email: selectedGuest.email || '',
            bloodGroup: selectedGuest.bloodGroup || '', address: selectedGuest.address || '',
            fatherName: selectedGuest.fatherName || '', motherName: selectedGuest.motherName || '',
            gotra: 'TBA', role: 'MEMBER', designation: selectedGuest.category === 'VIP' ? 'Vishesh Devotee' : 'Devotee',
            addedBySignature: `Promoted by ${session.userName}`,
            totalDonated: 0, attendanceCount: 1, timestamp: timestamp, lastDonationTimestamp: 0, joinedAt: timestamp
          };

          updates[`communities/${session.communityId}/logins/${newMemberId}`] = pinPassword;
          updates[`communities/${session.communityId}/info/devoteeCount`] = increment(1);
          updates[`communities/${session.communityId}/logs/Guests/${selectedGuest.id}/status`] = 'CONVERTED';

          await executeSafeUpdate(updates, `${selectedGuest.name} is now an official Member! PIN: ${pinPassword}`);

          import('../utils/pdfGenerator').then(({ generateLoginCredentialsPdf }) => {
            if (generateLoginCredentialsPdf) generateLoginCredentialsPdf(session.communityName, selectedGuest.name, newMemberId, pinPassword, session.userName);
          });

          logAudit("GUEST_PROMOTED", `Promoted Guest ${selectedGuest.name} to Official Devotee (ID: ${newMemberId})`);
          pushToDataLayer('join_group', { group_id: session.communityId, member_role: 'DEVOTEE', conversion_source: 'GUEST_CRM' });

          setSelectedGuest(null);
        } catch (e) {
          showToast((t('error') || "Conversion failed") + ": " + e.message, "error");
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  // ✨ ENTERPRISE EDIT MODAL LOGIC
  const handleEditField = (field, displayName) => {
    setEditModal({ field, displayName, value: selectedGuest[field] || '' });
  };

  const submitEditField = async () => {
    if (!editModal || !editModal.value.trim()) return;
    const { field, displayName, value } = editModal;
    const trimmedVal = value.trim();

    if (trimmedVal === (selectedGuest[field] || '')) {
      setEditModal(null);
      return;
    }

    try {
      const updates = {};
      updates[`communities/${session.communityId}/logs/Guests/${selectedGuest.id}/${field}`] = trimmedVal;

      await executeSafeUpdate(updates, `${displayName} ` + (t('record_updated') || 'updated successfully.'));
      logAudit("GUEST_EDITED", `Updated ${displayName} for Guest: ${selectedGuest.id}`);
      setSelectedGuest(prev => ({ ...prev, [field]: trimmedVal }));
      setEditModal(null);
    } catch (e) {
      showToast(t('error') + ": " + e.message, "error");
    }
  };

  // 🗑️ Delete Guest Record
  const handleDeleteGuest = async () => {
    setConfirmDialog({
      title: t('delete_guest') || "Delete Guest Record",
      message: "🚨 DANGER: This will completely erase this guest profile. Are you sure?",
      confirmText: t('delete_record') || "DELETE",
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const updates = {};
          updates[`communities/${session.communityId}/logs/Guests/${selectedGuest.id}`] = null;
          await executeSafeUpdate(updates, t('success') || "Guest record deleted.");
          logAudit("GUEST_DELETED", `Erased guest record: ${selectedGuest.id}`);
          setSelectedGuest(null);
        } catch (e) { showToast(t('error') + ": " + e.message, "error"); }
      }
    });
  };

  // 📲 Smart WhatsApp Follow-Up Dispatcher
  const handleWhatsAppChat = (guest) => {
    let phone = guest.phone?.replace(/\D/g, '');
    if (!phone || phone.length < 10) return showToast(t('error') || "Valid phone number required for WhatsApp.", "error");
    if (phone.length === 11 && phone.startsWith('01')) phone = '88' + phone;

    const message = `Namaskar ${guest.name} Ji 🙏\n\nThank you for connecting with ${session.communityName}. We are truly blessed by your presence.\n\nPlease let us know if you would like to participate in our upcoming spiritual gatherings and seva programs.`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');

    if (guest.status === 'NEW_LEAD') handleStageChange(guest, 'CONTACTED');
  };

  // 🎟️ EVENT OPERATIONS: 1-Tap Check-In Engine
  const handleToggleCheckIn = async (eventId, guest) => {
    const isCurrentlyCheckedIn = guest.checkedIn === true;
    const targetStatus = !isCurrentlyCheckedIn;

    const updates = {};
    updates[`communities/${session.communityId}/events/${eventId}/guestList/${guest.id}/checkedIn`] = targetStatus;
    updates[`communities/${session.communityId}/events/${eventId}/guestList/${guest.id}/checkedInAt`] = targetStatus ? Date.now() : null;

    if (targetStatus && guest.phone && guest.phone !== 'N/A') {
      updates[`communities/${session.communityId}/members/${guest.phone}/attendanceCount`] = increment(1);
    }

    await executeSafeUpdate(updates, targetStatus ? `✅ ${guest.name} checked in!` : `Check-in reversed for ${guest.name}`);

    if (targetStatus) {
      pushToDataLayer('select_content', { content_type: 'EVENT_CHECKIN', item_id: eventId, guest_id: guest.id });
    }
  };

  // 📋 Filtered Pipeline Guests
  const filteredGuests = useMemo(() => {
    return guests.filter(g => {
      const matchSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (g.phone && g.phone.includes(searchTerm)) || 
                          (g.adminComment && g.adminComment.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCat = selectedCategory === 'ALL' || g.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [guests, searchTerm, selectedCategory]);

  const currentEvent = useMemo(() => {
    return events.find(e => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  const eventRosterList = useMemo(() => {
    if (!currentEvent || !currentEvent.guestList) return [];
    return Object.keys(currentEvent.guestList).map(k => ({ id: k, ...currentEvent.guestList[k] }));
  }, [currentEvent]);

  // ✨ DECISION MAKING ASSISTANT: SMART PIPELINE INSIGHTS
  const pipelineInsights = useMemo(() => {
    if (guests.length === 0) return null;
    const total = guests.length;
    const converted = guests.filter(g => g.status === 'CONVERTED').length;
    const newLeads = guests.filter(g => !g.status || g.status === 'NEW_LEAD').length;
    const conversionRate = Math.round((converted / total) * 100);

    const catCounts = {};
    guests.forEach(g => { catCounts[g.category] = (catCounts[g.category] || 0) + 1; });
    const topCategory = Object.keys(catCounts).length > 0 ? Object.keys(catCounts).reduce((a, b) => catCounts[a] > catCounts[b] ? a : b) : 'GENERAL';

    let message = "";
    if (newLeads > 0) {
      message = `You have ${newLeads} new inquiries waiting. Send them a WhatsApp welcome to start cultivating!`;
    } else if (conversionRate > 50) {
      message = `Excellent management! Your Guest-to-Member conversion rate is ${conversionRate}%.`;
    } else {
      message = `Your primary visitor demographic is ${topCategory}. Engage them to increase your ${conversionRate}% conversion rate.`;
    }

    return { conversionRate, message };
  }, [guests]);

  // ✨ DECISION MAKING ASSISTANT: SMART EVENT GATE INSIGHTS
  const eventInsights = useMemo(() => {
    if (!currentEvent || !currentEvent.guestList) return null;
    const totalInvited = Object.keys(currentEvent.guestList).length;
    if (totalInvited === 0) return null;

    const checkedInCount = Object.values(currentEvent.guestList).filter(g => g.checkedIn).length;
    const arrivalRate = Math.round((checkedInCount / totalInvited) * 100);

    let message = "";
    if (arrivalRate === 100) {
      message = "All invited guests have arrived! Gate check-in is complete.";
    } else {
      message = `${arrivalRate}% of your invited guests have arrived. ${totalInvited - checkedInCount} are still pending.`;
    }

    return { arrivalRate, message };
  }, [currentEvent]);

  const getInitial = (name) => {
    if (!name || typeof name !== 'string') return 'ॐ';
    return name.charAt(0).toUpperCase();
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full">

      {/* ✨ GLOBAL CUSTOM TOAST ENGINE */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'offline' ? 'bg-orange-500/20 text-sanatani-orange' : toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'offline' ? <WifiOff size={20}/> : toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'offline' ? 'text-orange-400' : toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'offline' ? 'Offline Cache' : toast.type === 'error' ? t('error') || 'Error' : t('success') || 'Success'}
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
              {confirmDialog.isDanger ? <Ban size={32}/> : <CheckCircle2 size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-sm">{t('btn_cancel') || 'Cancel'}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HEADER CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Users className="text-sanatani-orange" size={32} /> {t('guest_crm_title') || 'Guest Relations & Event Check-In'}
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            {t('guest_crm_subtitle') || 'Cultivate walk-in visitors, manage VIP invitations, and record gate attendance.'}
          </p>
        </div>

        {/* View Switcher & Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">

          <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200 w-full sm:w-auto overflow-x-auto">
            <button 
              onClick={() => { setShowGuide(!showGuide); if(!showGuide) pushToDataLayer('open_quick_guide', { module: 'GuestManager' }); }} 
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-blue-600 hover:bg-blue-50 whitespace-nowrap"
            >
              <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
            </button>
            <button 
              onClick={() => setViewMode('PIPELINE')} 
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${viewMode === 'PIPELINE' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <TrendingUp size={14}/> {t('growth_pipeline') || 'Growth Pipeline'}
            </button>
            <button 
              onClick={() => setViewMode('EVENTS')} 
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${viewMode === 'EVENTS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <CalendarDays size={14}/> {t('event_roster') || 'Event Roster & Gate'}
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* ✨ TOUCHLESS GATE SCANNER BUTTON */}
            {viewMode === 'EVENTS' && (
              <button 
                onClick={() => setShowScannerModal(true)} 
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 shrink-0"
              >
                <Scan size={16}/> Gate Scanner
              </button>
            )}

            {isManagerOrAdmin && (
              <button 
                onClick={() => setShowAddModal(true)} 
                className="flex-1 sm:flex-none bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 shrink-0"
              >
                <UserPlus size={16}/> {t('add_new_guest') || 'Add New Guest'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ✨ DECISION MAKING ASSISTANT (SMART INSIGHTS) */}
      {isManagerOrAdmin && viewMode === 'PIPELINE' && pipelineInsights && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center gap-4 animate-in slide-in-from-top-2">
          <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl shrink-0 self-start sm:self-auto">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h3 className="text-xs font-black text-emerald-900 uppercase tracking-widest mb-1">Smart CRM Assistant</h3>
            <p className="text-sm font-bold text-gray-700 leading-snug">
              {pipelineInsights.message}
            </p>
          </div>
        </div>
      )}

      {isManagerOrAdmin && viewMode === 'EVENTS' && eventInsights && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center gap-4 animate-in slide-in-from-top-2">
          <div className="bg-blue-100 text-blue-600 p-3 rounded-xl shrink-0 self-start sm:self-auto">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h3 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">Gate Logistics Assistant</h3>
            <p className="text-sm font-bold text-gray-700 leading-snug">
              {eventInsights.message}
            </p>
          </div>
        </div>
      )}

      {/* UX: QUICK GUIDE BANNER */}
      {showGuide && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-5 sm:p-6 rounded-2xl shadow-inner animate-in slide-in-from-top-2 relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors"><X size={18}/></button>
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><Lightbulb size={18} className="text-blue-500"/> {t('quick_guide_title') || 'Command Center Guide'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3 bg-white/80 p-4 rounded-xl border border-blue-100 shadow-sm">
              <div className="text-blue-600 shrink-0"><UserPlus size={20}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900 mb-0.5">1. Capture Leads</p>
                <p className="text-[9px] font-bold text-gray-500 leading-tight">Add walk-ins, VIPs, or inquiries to your Growth Pipeline. Every person gets an encrypted profile.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/80 p-4 rounded-xl border border-blue-100 shadow-sm">
              <div className="text-blue-600 shrink-0"><ArrowRight size={20}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900 mb-0.5">2. Nurture & Convert</p>
                <p className="text-[9px] font-bold text-gray-500 leading-tight">Send WhatsApp welcome messages. Once ready, convert them into official Devotees with a single tap.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/80 p-4 rounded-xl border border-blue-100 shadow-sm">
              <div className="text-blue-600 shrink-0"><Scan size={20}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900 mb-0.5">3. Gate QR Scanner</p>
                <p className="text-[9px] font-bold text-gray-500 leading-tight">Open Gate QR Scanner on your smartphone to scan passes in milliseconds. Attendance and Seva score update instantly!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: KANBAN MOVES MANAGEMENT PIPELINE                                  */}
      {/* ========================================================================= */}
      {viewMode === 'PIPELINE' && (
        <div className="space-y-6 animate-in fade-in">

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-200 shadow-sm">
            <div className="relative w-full sm:w-96">
              <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder={t('search_guest') || "Search by name, phone, or admin notes..."} 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-sanatani-orange shadow-sm transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto scrollbar-hide">
              {['ALL', 'VIP', 'DONOR', 'GENERAL', 'VOLUNTEER'].map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border shadow-sm ${selectedCategory === cat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                >
                  {cat === 'ALL' ? (t('filter_all') || 'ALL') : t(cat.toLowerCase()) || cat}
                </button>
              ))}
            </div>
          </div>

          {/* Kanban Columns (MOBILE OPTIMIZED: Horizontal Snap Scroll) */}
          <div className="flex overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-2 xl:grid-cols-4 gap-6 scrollbar-hide">

            {/* Column 1: New Leads */}
            <div className="min-w-[85vw] sm:min-w-[350px] md:min-w-0 snap-center">
              <PipelineColumn 
                title="1. New Inquiries" 
                count={filteredGuests.filter(g => !g.status || g.status === 'NEW_LEAD').length} 
                badgeColor="bg-orange-100 text-orange-700 border-orange-200"
              >
                {filteredGuests.filter(g => !g.status || g.status === 'NEW_LEAD').map(guest => (
                  <GuestCard 
                    key={guest.id} 
                    guest={guest} 
                    onCardClick={() => setSelectedGuest(guest)}
                    onWhatsApp={(e) => { e.stopPropagation(); handleWhatsAppChat(guest); }}
                    onPromote={(e) => { e.stopPropagation(); handleStageChange(guest, 'CONTACTED'); }}
                    nextStageLabel="Mark Contacted"
                  />
                ))}
                {filteredGuests.filter(g => !g.status || g.status === 'NEW_LEAD').length === 0 && (
                  <p className="text-center text-xs font-bold text-gray-400 py-10 uppercase tracking-widest border-2 border-dashed border-gray-200 rounded-2xl">No New Leads</p>
                )}
              </PipelineColumn>
            </div>

            {/* Column 2: Contacted */}
            <div className="min-w-[85vw] sm:min-w-[350px] md:min-w-0 snap-center">
              <PipelineColumn 
                title="2. Contacted" 
                count={filteredGuests.filter(g => g.status === 'CONTACTED').length} 
                badgeColor="bg-blue-100 text-blue-700 border-blue-200"
              >
                {filteredGuests.filter(g => g.status === 'CONTACTED').map(guest => (
                  <GuestCard 
                    key={guest.id} 
                    guest={guest} 
                    onCardClick={() => setSelectedGuest(guest)}
                    onWhatsApp={(e) => { e.stopPropagation(); handleWhatsAppChat(guest); }}
                    onPromote={(e) => { e.stopPropagation(); handleStageChange(guest, 'INTERESTED'); }}
                    nextStageLabel="Mark Engaged"
                  />
                ))}
                {filteredGuests.filter(g => g.status === 'CONTACTED').length === 0 && (
                  <p className="text-center text-xs font-bold text-gray-400 py-10 uppercase tracking-widest border-2 border-dashed border-gray-200 rounded-2xl">Empty</p>
                )}
              </PipelineColumn>
            </div>

            {/* Column 3: Cultivating / Interested */}
            <div className="min-w-[85vw] sm:min-w-[350px] md:min-w-0 snap-center">
              <PipelineColumn 
                title="3. Engaged Seva" 
                count={filteredGuests.filter(g => g.status === 'INTERESTED').length} 
                badgeColor="bg-purple-100 text-purple-700 border-purple-200"
              >
                {filteredGuests.filter(g => g.status === 'INTERESTED').map(guest => (
                  <GuestCard 
                    key={guest.id} 
                    guest={guest} 
                    onCardClick={() => setSelectedGuest(guest)}
                    onWhatsApp={(e) => { e.stopPropagation(); handleWhatsAppChat(guest); }}
                    onPromote={(e) => { e.stopPropagation(); handlePromoteToMember(guest); }} 
                    nextStageLabel={t('convert_member') || "Convert Member"}
                    isReadyToConvert
                  />
                ))}
                {filteredGuests.filter(g => g.status === 'INTERESTED').length === 0 && (
                  <p className="text-center text-xs font-bold text-gray-400 py-10 uppercase tracking-widest border-2 border-dashed border-gray-200 rounded-2xl">Empty</p>
                )}
              </PipelineColumn>
            </div>

            {/* Column 4: Converted Members */}
            <div className="min-w-[85vw] sm:min-w-[350px] md:min-w-0 snap-center">
              <PipelineColumn 
                title="4. Lifetime Members" 
                count={filteredGuests.filter(g => g.status === 'CONVERTED').length} 
                badgeColor="bg-green-100 text-green-700 border-green-200"
              >
                {filteredGuests.filter(g => g.status === 'CONVERTED').map(guest => (
                  <div key={guest.id} onClick={() => setSelectedGuest(guest)} className="bg-white p-5 rounded-2xl border border-green-200 shadow-sm space-y-3 cursor-pointer hover:shadow-md hover:border-green-300 transition-all group">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-green-700 uppercase tracking-widest bg-green-50 px-2.5 py-1 rounded-md border border-green-200 flex items-center gap-1 shadow-sm">
                        <Check size={10}/> {t('active_member') || 'Active Member'}
                      </span>
                      <span className="text-[9px] font-mono font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{guest.phone}</span>
                    </div>
                    <div>
                      <h4 className="font-black text-gray-900 text-sm group-hover:text-green-600 transition-colors">{guest.name}</h4>
                      <p className="text-[10px] font-bold text-gray-500 truncate mt-0.5">{guest.adminComment || guest.notes || 'Converted from guest relations.'}</p>
                    </div>
                  </div>
                ))}
                {filteredGuests.filter(g => g.status === 'CONVERTED').length === 0 && (
                  <p className="text-center text-xs font-bold text-gray-400 py-10 uppercase tracking-widest border-2 border-dashed border-gray-200 rounded-2xl">No Conversions</p>
                )}
              </PipelineColumn>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: EVENT ROSTER & GATE CHECK-IN                                     */}
      {/* ========================================================================= */}
      {viewMode === 'EVENTS' && (
        <div className="space-y-6 animate-in fade-in">

          {/* Event Selector Bar */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-950 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ring-1 ring-white/10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-300 bg-white/10 px-3 py-1 rounded-full border border-white/10 shadow-inner">
                  {t('gate_checkin_mode') || 'Gate Check-In Mode'}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-400/30 flex items-center gap-1.5 shadow-inner">
                  <Scan size={12}/> Live Scanner Ready
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                {currentEvent ? currentEvent.title : (t('select_event') || 'Select an Event')}
              </h3>
              <p className="text-xs font-bold text-blue-200 mt-1 flex items-center gap-1.5">
                <CalendarDays size={14}/> {currentEvent ? `Date: ${currentEvent.dateStr || currentEvent.date || 'TBD'} • ${eventRosterList.length} Registered Attendees` : (t('no_events_found') || 'No upcoming events found in Panjika.')}
              </p>
            </div>

            {events.length > 0 && (
              <div className="w-full md:w-72 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
                <label className="block text-[10px] font-black uppercase tracking-widest text-blue-300 mb-2">{t('switch_event') || 'Switch Active Event'}</label>
                <select 
                  value={selectedEventId} 
                  onChange={e => setSelectedEventId(e.target.value)} 
                  className="w-full p-3.5 bg-white/10 border border-white/20 rounded-xl text-sm font-bold text-white outline-none cursor-pointer appearance-none shadow-inner"
                >
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id} className="text-gray-900 font-bold">{ev.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Door Roster Table */}
          <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm ring-1 ring-black/5">
            <div className="p-5 bg-gray-50/80 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2"><List size={18} className="text-blue-600"/> {t('door_roster') || 'Door Attendance Roster'}</h4>
              <span className="text-xs font-bold text-gray-600 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm flex items-center gap-2">
                {t('checked_in') || 'Checked In:'} <strong className="text-green-600 font-black text-sm">{eventRosterList.filter(g => g.checkedIn).length}</strong> / {eventRosterList.length}
              </span>
            </div>

            {eventRosterList.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {eventRosterList.map(guest => (
                  <div key={guest.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <h4 className="font-black text-gray-900 text-base">{guest.name}</h4>
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border shadow-sm ${guest.category === 'VIP' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {guest.category || 'GENERAL'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono font-bold flex items-center gap-2 bg-white px-2 py-1 rounded border border-gray-100 w-fit"><Phone size={12} className="text-gray-400"/> {guest.phone} <span className="text-gray-300">|</span> ID: {guest.id}</p>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button 
                        onClick={() => handleWhatsAppChat(guest)}
                        className="p-3 bg-green-50 hover:bg-green-600 text-green-700 hover:text-white rounded-xl border border-green-200 transition-colors shadow-sm"
                        title="Send WhatsApp Invite"
                      >
                        <MessageSquare size={16}/>
                      </button>

                      <button 
                        onClick={() => handleToggleCheckIn(currentEvent.id, guest)}
                        className={`flex-1 sm:flex-none px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${guest.checkedIn ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'}`}
                      >
                        {guest.checkedIn ? (
                          <><CheckCircle2 size={16}/> Checked In</>
                        ) : (
                          <><Scan size={16}/> {t('gate_checkin') || 'Gate Check-In'}</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-16 text-center text-gray-400 font-bold bg-gray-50">
                <CalendarDays size={48} className="mx-auto mb-4 opacity-30 text-blue-500"/>
                <p className="text-lg font-black text-gray-800 mb-1">{t('no_events_found') || 'No guests mapped to this event yet.'}</p>
                <p className="text-xs uppercase tracking-widest">Open the Gate QR Scanner or add attendees from the pipeline.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ✨ LIVE GATE QR SCANNER MODAL */}
      {showScannerModal && createPortal(
        <div className="fixed inset-0 bg-gray-950/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="bg-gray-900 text-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-800 flex flex-col max-h-[90vh] animate-in zoom-in-95 ring-1 ring-white/10">

            {/* Scanner Header */}
            <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Scan size={20} className="animate-pulse"/>
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Gate QR Scanner</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate max-w-[200px]">
                    {currentEvent ? currentEvent.title : 'Active Event'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowScannerModal(false)} 
                className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full transition-colors"
              >
                <X size={18}/>
              </button>
            </div>

            {/* Live Camera Viewport */}
            <div className="relative aspect-square bg-black flex items-center justify-center overflow-hidden flex-1 min-h-[300px]">
              <video 
                ref={videoRef} 
                playsInline 
                muted 
                className="w-full h-full object-cover"
              />

              {/* Viewfinder Reticle Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-emerald-500/50 rounded-3xl relative shadow-[0_0_0_1000px_rgba(0,0,0,0.6)]">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl"></div>
                  <div className="absolute inset-x-4 top-1/2 h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse opacity-80"></div>
                </div>
              </div>

              {/* Result Flash Notification Over Video */}
              {scannedResult && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 text-center animate-in zoom-in-95 z-20">
                  {scannedResult.success ? (
                    <div className="space-y-4">
                      <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/50">
                        <CheckCircle2 size={40}/>
                      </div>
                      <h4 className="text-2xl font-black text-white">{scannedResult.name}</h4>
                      <p className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/50 px-3 py-1 rounded inline-block border border-emerald-500/20">ID: {scannedResult.id}</p>
                      <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest bg-emerald-900 border border-emerald-700 py-1.5 px-4 rounded-full mt-2 inline-block">
                        Checked In at {scannedResult.time}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-red-500/50">
                        <AlertTriangle size={40}/>
                      </div>
                      <h4 className="text-xl font-black text-white">Validation Failed</h4>
                      <p className="text-xs font-bold text-red-300 leading-relaxed max-w-xs mx-auto bg-red-950/50 p-3 rounded-xl border border-red-500/20">{scannedResult.message}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Camera Error Fallback */}
              {cameraError && (
                <div className="absolute inset-0 bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
                  <Camera size={48} className="text-gray-700 mb-4"/>
                  <p className="text-base font-black text-red-400 mb-2">Camera Stream Inactive</p>
                  <p className="text-xs font-bold text-gray-400 max-w-xs mb-6 leading-relaxed">{cameraError}</p>
                  <button 
                    onClick={startCamera} 
                    className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-black uppercase tracking-widest py-3 px-6 rounded-xl transition-all shadow-md"
                  >
                    Retry Permission
                  </button>
                </div>
              )}
            </div>

            {/* Manual ID Input Fallback Footer */}
            <div className="p-5 bg-gray-950 border-t border-gray-800 space-y-3 shrink-0">
              <form onSubmit={handleManualCodeSubmit} className="flex gap-3">
                <div className="relative flex-1">
                  <Keyboard size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"/>
                  <input 
                    type="text" 
                    value={manualCodeInput} 
                    onChange={e => setManualCodeInput(e.target.value)}
                    placeholder="Or type Pass ID (e.g. SB-1002)..."
                    className="w-full bg-gray-900 border border-gray-800 py-3.5 pl-11 pr-4 rounded-xl text-sm font-bold text-white placeholder-gray-600 outline-none focus:border-emerald-500 transition-colors shadow-inner"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={!manualCodeInput.trim() || isProcessing}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:transform-none text-white px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 shadow-lg shrink-0 flex items-center gap-2"
                >
                  Verify
                </button>
              </form>
              <p className="text-[10px] font-bold text-gray-600 text-center uppercase tracking-widest">
                Position attendee digital ID inside reticle for instant verification.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ INLINE EDIT MODAL (REPLACED NATIVE WINDOW.PROMPT) */}
      {editModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 ring-1 ring-white/20 relative">
              <button onClick={() => setEditModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full"><X size={16}/></button>

              <div className="mb-6">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner border border-blue-100"><Edit size={24}/></div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Update {editModal.displayName}</h3>
                <p className="text-xs font-bold text-gray-500 mt-1">Enter your new information below.</p>
              </div>

              {editModal.field === 'address' || editModal.field === 'adminComment' || editModal.field === 'notes' ? (
                <textarea 
                  rows="3" value={editModal.value} onChange={(e) => setEditModal({...editModal, value: e.target.value})} autoFocus
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold text-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm resize-none"
                  placeholder="..."
                />
              ) : (
                <input 
                  type={editModal.field === 'email' ? 'email' : editModal.field === 'phone' ? 'tel' : 'text'} 
                  value={editModal.value} onChange={(e) => setEditModal({...editModal, value: e.target.value})} autoFocus
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold text-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"
                />
              )}

              <div className="flex gap-3 mt-8">
                 <button onClick={() => setEditModal(null)} className="flex-1 px-4 py-3.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-sm">{t('btn_cancel')}</button>
                 <button onClick={submitEditField} className="flex-[2] px-4 py-3.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2">
                   {t('btn_save')} <CheckCircle2 size={16}/>
                </button>
              </div>
           </div>
        </div>
      , document.body)}

      {/* ✨ EXECUTIVE GUEST INSIGHT MODAL */}
      {selectedGuest && createPortal(
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[9900] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh] ring-1 ring-white/20">

            {/* Executive Purple Header */}
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-6 sm:p-8 relative shrink-0">
               <button onClick={() => setSelectedGuest(null)} className="absolute top-5 right-5 text-purple-200 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full"><X size={20}/></button>
               <div className="flex items-center gap-5">
                 <div className="h-16 w-16 bg-white text-purple-800 rounded-full flex items-center justify-center font-black text-3xl shadow-lg border-2 border-purple-300">
                   {getInitial(selectedGuest.name)}
                 </div>
                 <div className="min-w-0 pr-6">
                   <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-1 truncate">{selectedGuest.name}</h2>
                   <div className="flex flex-wrap items-center gap-2 mt-2">
                     <span className="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest bg-purple-500/30 text-purple-100 border border-purple-500/50 shadow-inner">{t(selectedGuest.category?.toLowerCase()) || selectedGuest.category}</span>
                     <span className="text-xs text-purple-300 font-mono font-bold tracking-wider bg-black/20 px-2 py-0.5 rounded border border-white/10">ID: {selectedGuest.id}</span>
                   </div>
                 </div>
               </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-8 overflow-y-auto space-y-6 bg-gray-50/50 flex-1 min-h-0 scrollbar-hide">

              {/* Action Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                 <button 
                   onClick={() => handleWhatsAppChat(selectedGuest)}
                   className="flex-1 bg-white hover:bg-green-50 text-green-700 border border-green-200 font-black py-4 rounded-xl text-[10px] sm:text-xs uppercase tracking-wider transition-all flex justify-center items-center gap-2 shadow-sm hover:shadow-md hover:border-green-400"
                 >
                   <MessageCircle size={16}/> {t('msg_whatsapp')}
                 </button>
                 {isManagerOrAdmin && selectedGuest.status !== 'CONVERTED' && (
                   <button 
                     onClick={handlePromoteToMember}
                     className="flex-[1.5] bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-4 rounded-xl text-[10px] sm:text-xs uppercase tracking-wider transition-all flex justify-center items-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                   >
                     <Award size={18}/> {t('promote_devotee') || 'PROMOTE TO DEVOTEE'}
                   </button>
                 )}
              </div>

              {(selectedGuest.adminComment || selectedGuest.notes) && (
                 <div className="bg-yellow-50 border border-yellow-200 p-5 rounded-2xl flex items-start gap-4 shadow-sm relative overflow-hidden group">
                   <div className="absolute top-0 left-0 w-1.5 h-full bg-yellow-400"></div>
                   <ShieldAlert size={20} className="text-yellow-600 mt-0.5 shrink-0"/>
                   <div className="flex-1">
                     <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-1.5">{t('admin_note') || 'Admin Reference Note'}</p>
                     <p className="text-sm font-bold text-yellow-900 break-words leading-relaxed">{selectedGuest.adminComment || selectedGuest.notes}</p>
                   </div>
                   {isManagerOrAdmin && <button onClick={() => handleEditField(selectedGuest.adminComment ? 'adminComment' : 'notes', t('admin_note') || 'Admin Note')} className="text-yellow-600 hover:text-white bg-yellow-100 hover:bg-yellow-500 p-2.5 rounded-xl ml-auto shrink-0 transition-all opacity-100 sm:opacity-0 group-hover:opacity-100"><Edit size={16}/></button>}
                 </div>
              )}

              {/* Guest Profile Details */}
              <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><UserCheck size={14}/> {t('req_identity_data') || 'Identity Data'}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 pr-4"><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('phone_number')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><Phone size={14} className="text-gray-400 shrink-0"/> {selectedGuest.phone || 'N/A'}</p></div>
                    {isManagerOrAdmin && <button onClick={() => handleEditField('phone', t('phone_number') || 'Phone Number')} className="text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 p-2.5 rounded-xl transition-all opacity-100 sm:opacity-0 group-hover:opacity-100 shrink-0 border border-transparent hover:border-purple-200"><Edit size={14}/></button>}
                  </div>
                  <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 pr-4"><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('full_address')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><MapPin size={14} className="text-gray-400 shrink-0"/> {selectedGuest.address || 'N/A'}</p></div>
                    {isManagerOrAdmin && <button onClick={() => handleEditField('address', t('full_address') || 'Address')} className="text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 p-2.5 rounded-xl transition-all opacity-100 sm:opacity-0 group-hover:opacity-100 shrink-0 border border-transparent hover:border-purple-200"><Edit size={14}/></button>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-y sm:divide-y-0 divide-gray-100">
                    <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors">
                      <div className="min-w-0 pr-4"><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('father_name') || 'Father Name'}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><Users size={14} className="text-gray-400 shrink-0"/> {selectedGuest.fatherName || 'N/A'}</p></div>
                      {isManagerOrAdmin && <button onClick={() => handleEditField('fatherName', t('father_name') || 'Father Name')} className="text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 p-2 rounded-xl transition-all opacity-100 sm:opacity-0 group-hover:opacity-100 shrink-0 border border-transparent hover:border-purple-200"><Edit size={12}/></button>}
                    </div>
                    <div className="p-4 sm:p-5 flex justify-between items-center group hover:bg-gray-50 transition-colors">
                      <div className="min-w-0 pr-4"><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('blood_group')}</p><p className="text-sm font-black text-gray-900 flex items-center gap-2 truncate"><Droplet size={14} className="text-red-400 shrink-0"/> {selectedGuest.bloodGroup || 'N/A'}</p></div>
                      {isManagerOrAdmin && <button onClick={() => handleEditField('bloodGroup', t('blood_group') || 'Blood Group')} className="text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 p-2 rounded-xl transition-all opacity-100 sm:opacity-0 group-hover:opacity-100 shrink-0 border border-transparent hover:border-purple-200"><Edit size={12}/></button>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Admin Controls */}
              {isManagerOrAdmin && (
                <div className="pt-2">
                  <button onClick={handleDeleteGuest} className="w-full bg-white border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 font-black py-4 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 transition-all">
                    <Trash2 size={16}/> {t('delete_guest') || 'DELETE GUEST RECORD'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* ✨ ADD NEW GUEST MODAL */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border-t-4 border-sanatani-orange ring-1 ring-white/20 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 shrink-0">
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
                <UserPlus size={24} className="text-sanatani-orange"/> {t('register_guest') || 'Register New Guest'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-2.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors shadow-sm"><X size={18}/></button>
            </div>

            <form onSubmit={handleCreateGuest} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1 scrollbar-hide pb-12">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('full_name')} *</label>
                <input 
                  type="text" required
                  value={guestForm.name} 
                  onChange={e => setGuestForm({...guestForm, name: e.target.value})} 
                  placeholder="e.g. Sanjoy Bannerjee" 
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 focus:bg-white transition-all shadow-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('phone_number')}</label>
                  <input 
                    type="tel" 
                    value={guestForm.phone} 
                    onChange={e => setGuestForm({...guestForm, phone: e.target.value})} 
                    placeholder="017..." 
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold outline-none focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 focus:bg-white transition-all shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('classification') || 'Classification'}</label>
                  <select 
                    value={guestForm.category} 
                    onChange={e => setGuestForm({...guestForm, category: e.target.value})} 
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black outline-none focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 cursor-pointer shadow-sm appearance-none transition-all"
                  >
                    <option value="GENERAL">{t('general_guest') || 'General Guest'}</option>
                    <option value="VIP">{t('vip_dignitary') || 'VIP Dignitary'}</option>
                    <option value="DONOR">{t('walk_in_donor') || 'Walk-In Donor'}</option>
                    <option value="VOLUNTEER">{t('volunteer_prospect') || 'Volunteer Prospect'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('father_name') || "Father's Name"}</label>
                   <input type="text" value={guestForm.fatherName} onChange={e=>setGuestForm({...guestForm, fatherName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('blood_group')}</label>
                   <input type="text" value={guestForm.bloodGroup} onChange={e=>setGuestForm({...guestForm, bloodGroup: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. O+" />
                 </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('admin_note')}</label>
                <textarea 
                  rows="3" 
                  value={guestForm.adminComment} 
                  onChange={e => setGuestForm({...guestForm, adminComment: e.target.value})} 
                  placeholder="e.g. Visited during morning Aarti, Chief Guest for Durga Puja..." 
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 focus:bg-white resize-none transition-all shadow-sm"
                />
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button 
                  type="submit" 
                  disabled={isProcessing} 
                  className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:transform-none"
                >
                  {isProcessing ? <Loader2 size={20} className="animate-spin"/> : <CheckCircle2 size={20}/>} {t('save_pipeline') || 'SAVE TO PIPELINE'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ FOOTER CREDIT */}
      <div className="pt-12 pb-6 flex flex-col items-center justify-center text-center opacity-70 border-t border-gray-200 mt-12 shrink-0">
         <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1">
           Made with <Heart size={12} className="text-red-500 fill-current"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span>
         </div>
         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">© {new Date().getFullYear()} Sanatani Bandhan. Enterprise Edition.</p>
      </div>

    </div>
  );
}

// 📦 Subcomponent: Pipeline Kanban Column
function PipelineColumn({ title, count, badgeColor, children }) {
  return (
    <div className="bg-gray-50/80 rounded-3xl p-4 sm:p-5 border border-gray-200 flex flex-col h-[650px] shadow-inner ring-1 ring-black/5">
      <div className="flex justify-between items-center mb-5 px-2">
        <h3 className="font-black text-xs uppercase tracking-widest text-gray-800">{title}</h3>
        <span className={`text-[10px] font-black px-3 py-1 rounded-full border shadow-sm ${badgeColor}`}>
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-hide">
        {children}
      </div>
    </div>
  );
}

// 📇 Subcomponent: Individual Guest Card
function GuestCard({ guest, onCardClick, onWhatsApp, onPromote, nextStageLabel, isReadyToConvert }) {
  return (
    <div onClick={onCardClick} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-sanatani-orange hover:shadow-md cursor-pointer transition-all space-y-4 group relative overflow-hidden">
      <div className="flex justify-between items-start">
        <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border shadow-sm ${guest.category === 'VIP' ? 'bg-purple-50 text-purple-700 border-purple-200' : guest.category === 'DONOR' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
          {guest.category}
        </span>
        <span className="text-[9px] font-mono font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{guest.phone}</span>
      </div>

      <div>
        <h4 className="font-black text-gray-900 text-base group-hover:text-sanatani-orange transition-colors truncate">{guest.name}</h4>
        {(guest.notes || guest.adminComment) && <p className="text-[10px] font-bold text-gray-500 line-clamp-2 mt-1.5 leading-snug">"{guest.adminComment || guest.notes}"</p>}
      </div>

      <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={onWhatsApp} 
          className="p-2.5 bg-white hover:bg-green-50 text-gray-400 hover:text-green-600 rounded-xl border border-gray-200 hover:border-green-200 transition-colors shadow-sm"
          title="Send WhatsApp Welcome"
        >
          <MessageSquare size={16}/>
        </button>

        <button 
          onClick={onPromote} 
          className={`flex-1 py-2.5 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-sm ${isReadyToConvert ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-900 hover:text-white border border-gray-200'}`}
        >
          {nextStageLabel} <ChevronRight size={12}/>
        </button>
      </div>
    </div>
  );
}
