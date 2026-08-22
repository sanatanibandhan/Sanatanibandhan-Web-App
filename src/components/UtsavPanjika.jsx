import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, increment } from 'firebase/database'; 
import { db } from '../firebase';
import { 
  CalendarDays, MapPin, Clock, Plus, Trash2, Edit, X, Loader2, 
  Sun, BellRing, Calendar, Flame, AlertCircle, Search, History, Bell,
  FileDown, FileText, WifiOff, AlertTriangle, CheckCircle2, Heart, HelpCircle, Lightbulb, Share2,
  Users, UserCheck, UserX, MinusCircle, FileSignature, Flag, Lock, BrainCircuit, Ticket, ShieldPlus,
  UsersRound, CheckSquare, ShieldCheck
} from 'lucide-react';
import { pushToDataLayer } from '../utils/gtm';
import { useLanguage } from '../context/LanguageContext'; 
import { usePlanGate } from '../hooks/usePlanGate'; 

// Enterprise Exports
import { generateMeetingReportPDF, generateBulkEventTicketsPDF } from '../utils/pdfGenerator';
import { generateMeetingReportCSV } from '../utils/csvGenerator';

export default function UtsavPanjika({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage(); 
  const { checkQuota } = usePlanGate(session); 

  // ✨ Dynamic Institution Label
  const institutionLabel = useMemo(() => {
    switch (String(workspaceType || '').toUpperCase()) {
      case 'GOSHALA': return t('workspace_goshala') || 'Goshala';
      case 'SANGHA': return t('workspace_sangha') || 'Sangha';
      case 'ASHRAM': return t('workspace_ashram') || 'Ashram';
      case 'GURUKUL': return t('workspace_gurukul') || 'Gurukul';
      case 'SATSANG': return t('workspace_satsang') || 'Satsang';
      case 'YOGA': return t('workspace_yoga') || 'Yoga Center';
      case 'TRUST': return t('workspace_trust') || 'Trust';
      case 'TIRTH': return t('workspace_tirth') || 'Tirth / Dham';
      case 'SAMAJ': return t('workspace_samaj') || 'Samaj';
      case 'MANDIR':
      default: return t('workspace_mandir') || 'Mandir';
    }
  }, [workspaceType, t]);

  const [loading, setLoading] = useState(true);

  // 💾 OFFLINE CACHE INITIALIZATION
  const [events, setEvents] = useState(() => {
    try { const cached = localStorage.getItem(`sb_events_list_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });
  const [members, setMembers] = useState(() => {
    try { const cached = localStorage.getItem(`sb_full_members_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });

  // UI States
  const [activeTab, setActiveTab] = useState('UPCOMING'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false); 
  const [submitting, setSubmitting] = useState(false);

  // CONCLUDE MEETING MODAL STATES
  const [showConcludeModal, setShowConcludeModal] = useState(false);
  const [concludeData, setConcludeData] = useState({ id: null, title: '', minutes: '' });

  // ATTENDANCE & VOLUNTEER MODAL STATES
  const [attendanceEvent, setAttendanceEvent] = useState(null);
  const [attendanceSearch, setAttendanceSearch] = useState('');

  // SEVADAR (VOLUNTEER) ROSTER STATES
  const [sevadarEvent, setSevadarEvent] = useState(null);
  const [sevadarForm, setSevadarForm] = useState({ memberId: '', role: 'General Seva' });

  // ENTERPRISE TOAST & CONFIRM MODAL ENGINE
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null); 

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // UPGRADED FORM STATE (Includes Targeted Invitations)
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    title: '', date: '', time: '', location: '', description: '', adminComment: '', meetingMinutes: '',
    requiresTickets: false, maxCapacity: ''
  });
  const [inviteMode, setInviteMode] = useState('ALL'); // 'ALL' or 'SPECIFIC'
  const [selectedInvitees, setSelectedInvitees] = useState([]);
  const [inviteSearch, setInviteSearch] = useState('');

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const isAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_events', { user_role: session.role, community_id: session.communityId });

    // 1. Fetch Events
    const eventRef = ref(db, `communities/${session.communityId}/events`);
    const unsubEvents = onValue(eventRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const eventArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setEvents(eventArray);
        localStorage.setItem(`sb_events_list_${session.communityId}`, JSON.stringify(eventArray));
      } else {
        setEvents([]);
        localStorage.removeItem(`sb_events_list_${session.communityId}`);
      }
      setLoading(false);
    });

    // 2. Fetch Full Members for Attendance, Sevadar & Invitation Engine
    if (isManagerOrAdmin) {
      const memRef = ref(db, `communities/${session.communityId}/members`);
      onValue(memRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const memArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
          setMembers(memArray);
          localStorage.setItem(`sb_full_members_${session.communityId}`, JSON.stringify(memArray));
        }
      });
    }

    return () => unsubEvents();
  }, [session?.communityId, session?.role, isManagerOrAdmin]);

  const executeSafeUpdate = async (updates, successMsg = null, offlineMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(offlineMsg || t('offline_saved') || "Saved offline. Syncing soon.", 'offline');
      return Promise.resolve(); 
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast(t('error') + ": " + e.message, 'error');
      throw e;
    }
  };

  const logAudit = async (actionType, description) => {
    try { push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  // ✨ TARGETED BROADCAST NOTIFICATIONS
  const broadcastNotifications = async (eventTitle, dateStr, timeStr, targetMembersList) => {
    const ts = Date.now();
    const safeTitle = eventTitle || t('event') || "Event";
    const safeDate = dateStr || "Date TBA";
    const safeTime = timeStr || "Time TBA";

    const message = `🎟️ Official Invite: You are invited to ${safeTitle} on ${safeDate} at ${safeTime}. Open your 'Gate Pass' tab in the app to view your digital ticket for entry.`;

    const updates = {};
    targetMembersList.forEach(m => {
      const notifId = push(ref(db, `communities/${session.communityId}/notifications/${m.id}`)).key;
      updates[`communities/${session.communityId}/notifications/${m.id}/${notifId}`] = {
        id: notifId, title: `🛕 ${session.communityName} Event Invite`, message: message, timestamp: ts, type: "EVENT", isRead: false
      };
    });

    if (Object.keys(updates).length > 0) {
      executeSafeUpdate(updates).catch(e => console.error("Broadcast Offline Queued"));
    }
  };

  // ✨ EVENT SCHEDULER WITH AUTOMATIC ROSTER GENERATION
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.date) return showToast(t('err_all_fields_req') || "Title and Date are required!", "error");
    if (inviteMode === 'SPECIFIC' && selectedInvitees.length === 0) return showToast(t('err_no_invitees') || "Please select at least one invitee.", "error");

    setSubmitting(true);
    try {
      const dateTimeString = formData.time ? `${formData.date}T${formData.time}` : `${formData.date}T00:00`;
      const eventDateObj = new Date(dateTimeString);
      const timestampMs = eventDateObj.getTime();

      const dateOptions = { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' };
      const dateStr = eventDateObj.toLocaleDateString('en-GB', dateOptions).replace(',', ''); 
      const timeStr = formData.time ? eventDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'All Day';

      const existingEvent = isEditing ? events.find(ev => ev.id === editId) : null;

      // 1. Build the Door Roster (guestList) based on Invitee Selection
      let finalGuestList = { ...(existingEvent?.guestList || {}) };

      if (inviteMode === 'SPECIFIC') {
         Object.keys(finalGuestList).forEach(k => {
            if (!selectedInvitees.includes(k) && finalGuestList[k].category !== 'WALK_IN_PASS') delete finalGuestList[k];
         });
         selectedInvitees.forEach(mId => {
            if (!finalGuestList[mId]) {
               const m = members.find(x => x.id === mId);
               if(m) finalGuestList[mId] = { id: m.id, name: m.name, phone: m.phone || 'N/A', checkedIn: false, category: 'INVITED_MEMBER' };
            }
         });
      } else {
         members.forEach(m => {
            if (!finalGuestList[m.id]) {
               finalGuestList[m.id] = { id: m.id, name: m.name, phone: m.phone || 'N/A', checkedIn: false, category: 'MEMBER' };
            }
         });
      }

      const eventPayload = {
        title: formData.title.trim(),
        dateStr: dateStr,
        timeStr: timeStr,
        location: formData.location.trim(),
        description: formData.description.trim(),
        adminComment: formData.adminComment.trim(),
        meetingMinutes: formData.meetingMinutes.trim(), 
        requiresTickets: formData.requiresTickets,
        maxCapacity: formData.requiresTickets ? Number(formData.maxCapacity) : 0,
        inviteMode: inviteMode,
        guestList: finalGuestList, 
        timestamp: timestampMs, 
        eventDateTs: timestampMs, 
        createdBy: session.userName
      };

      const updates = {};
      let targetMembersToNotify = inviteMode === 'ALL' ? members : members.filter(m => selectedInvitees.includes(m.id));

      if (isEditing && editId) {
        if(existingEvent) {
          eventPayload.notificationCount = existingEvent.notificationCount || 0;
          eventPayload.status = existingEvent.status || 'UPCOMING';
          if (existingEvent.attendance) eventPayload.attendance = existingEvent.attendance; 
          if (existingEvent.sevadars) eventPayload.sevadars = existingEvent.sevadars;
        }

        updates[`communities/${session.communityId}/events/${editId}`] = eventPayload;
        await executeSafeUpdate(updates, t('event_updated_success') || "Event Updated Successfully!", "Event update saved offline.");

        logAudit("EVENT_UPDATED", `Updated Utsav & Roster: ${formData.title}`);
        pushToDataLayer('update_event', { event_name: formData.title, community_id: session.communityId });
      } else {
        const newId = push(ref(db, `communities/${session.communityId}/events`)).key;
        eventPayload.id = newId;
        eventPayload.notificationCount = 1;
        eventPayload.status = 'UPCOMING';

        updates[`communities/${session.communityId}/events/${newId}`] = eventPayload;
        await executeSafeUpdate(updates, t('event_scheduled_success') || "Event Scheduled & VIP Tickets Issued!", "Event saved offline.");

        logAudit("EVENT_CREATED", `Scheduled Utsav: ${formData.title}`);
        pushToDataLayer('create_event', { event_name: formData.title, community_id: session.communityId });

        // Trigger notifications
        broadcastNotifications(formData.title.trim(), dateStr, timeStr, targetMembersToNotify);
      }

      closeModal();
    } catch (err) {
      showToast((t('error') || "Error saving event") + ": " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ✨ CONCLUDE MEETING ENGINE
  const handleConcludeMeeting = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updates = {};
      updates[`communities/${session.communityId}/events/${concludeData.id}/status`] = 'CONCLUDED';
      updates[`communities/${session.communityId}/events/${concludeData.id}/meetingMinutes`] = concludeData.minutes.trim();

      await executeSafeUpdate(updates, t('meeting_concluded_success') || "Meeting Concluded & Locked!", "Conclusion saved offline.");
      logAudit("EVENT_CONCLUDED", `Concluded Meeting: ${concludeData.title}`);

      setShowConcludeModal(false);
      setConcludeData({ id: null, title: '', minutes: '' });
      setActiveTab('PAST'); 
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ✨ ATTENDANCE UI & GAMIFICATION
  const handleToggleAttendance = async (memberId, currentStatus, newStatus) => {
    if (currentStatus === newStatus || !attendanceEvent) return;

    setAttendanceEvent(prev => {
      const updatedAttendance = { ...(prev.attendance || {}) };
      if (newStatus === 'CLEAR') delete updatedAttendance[memberId];
      else updatedAttendance[memberId] = newStatus;
      return { ...prev, attendance: updatedAttendance };
    });

    try {
      const updates = {};
      updates[`communities/${session.communityId}/events/${attendanceEvent.id}/attendance/${memberId}`] = newStatus === 'CLEAR' ? null : newStatus;

      if (newStatus === 'PRESENT' && currentStatus !== 'PRESENT') {
        updates[`communities/${session.communityId}/members/${memberId}/attendanceCount`] = increment(1);
      } else if (currentStatus === 'PRESENT' && newStatus !== 'PRESENT') {
        updates[`communities/${session.communityId}/members/${memberId}/attendanceCount`] = increment(-1);
      }

      await executeSafeUpdate(updates, null, null); 
    } catch (e) {
      showToast(t('error') || "Error syncing attendance.", "error");
    }
  };

  // ✨ SEVADAR ASSIGNMENT LOGIC
  const handleAssignSevadar = async (e) => {
    e.preventDefault();
    if (!sevadarForm.memberId || !sevadarEvent) return showToast(t('err_select_member') || "Please select a volunteer.", "error");

    setSubmitting(true);
    try {
      const updates = {};
      const memObj = members.find(m => m.id === sevadarForm.memberId);

      updates[`communities/${session.communityId}/events/${sevadarEvent.id}/sevadars/${sevadarForm.memberId}`] = {
        name: memObj.name,
        role: sevadarForm.role.trim(),
        assignedAt: Date.now()
      };

      const notifId = push(ref(db, `communities/${session.communityId}/notifications/${sevadarForm.memberId}`)).key;
      updates[`communities/${session.communityId}/notifications/${sevadarForm.memberId}/${notifId}`] = {
        id: notifId, 
        title: `Seva Duty Assigned 🕉️`, 
        message: `You have been assigned to "${sevadarForm.role}" for ${sevadarEvent.title}.`, 
        timestamp: Date.now(), 
        type: "SYSTEM", 
        isRead: false
      };

      await executeSafeUpdate(updates, t('volunteer_assigned_success') || "Volunteer Assigned Successfully.");
      logAudit("SEVADAR_ASSIGNED", `Assigned ${memObj.name} to ${sevadarEvent.title}`);

      setSevadarEvent(prev => ({
        ...prev,
        sevadars: { ...prev.sevadars, [sevadarForm.memberId]: { name: memObj.name, role: sevadarForm.role } }
      }));
      setSevadarForm({ memberId: '', role: 'General Seva' });
    } catch (err) {
      showToast((t('error') || "Error assigning volunteer"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ✨ REPLACED: Native window.confirm with Enterprise ConfirmDialog
  const handleRemoveSevadar = (memberId) => {
    setConfirmDialog({
      title: t('remove_sevadar_title') || "Remove Volunteer",
      message: t('remove_sevadar_msg') || "Are you sure you want to remove this volunteer's duty?",
      confirmText: t('btn_remove') || "REMOVE",
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const updates = {};
          updates[`communities/${session.communityId}/events/${sevadarEvent.id}/sevadars/${memberId}`] = null;
          await executeSafeUpdate(updates, t('volunteer_removed_success') || "Volunteer duty removed.");

          setSevadarEvent(prev => {
            const newSevadars = { ...prev.sevadars };
            delete newSevadars[memberId];
            return { ...prev, sevadars: newSevadars };
          });
        } catch (e) {
          showToast((t('error') || "Error removing volunteer"), "error");
        }
      }
    });
  };

  // ✨ PAYWALL PROTECTED: RESEND ALERTS (Replaced native window.confirm)
  const handleResendAlert = (event) => {
    if (!checkQuota('free_sandesh_limit')) return;

    setConfirmDialog({
      title: t('broadcast_digital_invite') || "Broadcast Digital Invitation",
      message: `${t('resend_alert_msg') || "Send an instant push notification reminder to all invited guests' phones for"} "${event.title}"?`,
      confirmText: t('send_alert_now') || "SEND ALERT NOW",
      isDanger: false,
      onConfirm: async () => {
        try {
          setConfirmDialog(null);
          const targetIds = event.guestList ? Object.keys(event.guestList) : [];
          const targetMembersList = members.filter(m => targetIds.includes(m.id));

          broadcastNotifications(event.title, event.dateStr, event.timeStr, targetMembersList.length > 0 ? targetMembersList : members);

          await executeSafeUpdate({ 
            [`communities/${session.communityId}/events/${event.id}/notificationCount`]: increment(1),
            [`communities/${session.communityId}/usage_tracking/sandesh_sent`]: increment(1)
          }, t('alert_sent_success') || "App Alert successfully blasted to invitees.");

          logAudit("EVENT_ALERT_RESENT", `Resent notification for Utsav: ${event.title}`);
          pushToDataLayer('send_event_alert', { event_name: event.title, community_id: session.communityId });
        } catch (e) {
          showToast((t('error') || "Error sending alert") + ": " + e.message, "error");
        }
      }
    });
  };

  // ✨ REPLACED: Native window.confirm with Enterprise ConfirmDialog
  const handleDeleteEvent = (id, title) => {
    setConfirmDialog({
      title: t('cancel_delete_event') || "Cancel & Delete Event",
      message: `${t('delete_event_msg') || "Are you absolutely sure you want to permanently delete"} "${title}"? ${t('cannot_be_undone') || "This action cannot be undone."}`,
      confirmText: t('delete_event') || "DELETE EVENT",
      isDanger: true,
      onConfirm: async () => {
        try {
          setConfirmDialog(null);
          await executeSafeUpdate({ [`communities/${session.communityId}/events/${id}`]: null }, t('event_deleted_success') || "Event deleted successfully.", "Deletion queued offline.");
          logAudit("EVENT_DELETED", `Canceled/Deleted Utsav: ${title}`);
          pushToDataLayer('delete_event', { event_name: title, community_id: session.communityId });
        } catch (e) {
          showToast((t('error') || "Error deleting event") + ": " + e.message, "error");
        }
      }
    });
  };

  const handleShareEvent = (ev) => {
    let formattedDate = ev.dateStr;
    if (ev.timestamp) {
       formattedDate = new Date(ev.timestamp).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    const text = `✨ *Jai Sanatan!* ✨\n\nNamaskar 🙏,\nYou are warmly invited to join us for our upcoming event at *${session.communityName}*!\n\n🛕 *Event:* ${ev.title}\n📅 *Date:* ${formattedDate}\n⏰ *Time:* ${ev.timeStr || 'TBA'}\n📍 *Venue:* ${ev.location || `${t('workspace') || 'Workspace'} Premises`}\n\n${ev.description ? `📝 *Details:* ${ev.description}\n\n` : ''}Please mark your calendar and join us to seek divine blessings. 🌺\n\n*— ${session.communityName} Committee*`;

    if (navigator.share) {
      navigator.share({ title: ev.title, text: text }).catch(()=>{});
    } else {
      navigator.clipboard.writeText(text);
      showToast(t('wa_invite_copied') || "Beautiful WhatsApp invite copied to clipboard!");
    }
  };

  const handleExportCSV = () => {
    pushToDataLayer('export_data', { export_type: 'CSV', data_category: 'EVENTS', community_id: session.communityId });
    let csvContent = "data:text/csv;charset=utf-8,Date,Time,Event Title,Location,Created By\n";
    displayEvents.forEach(ev => {
      csvContent += `"${ev.dateStr}","${ev.timeStr}","${ev.title}","${ev.location || ''}","${ev.createdBy || ''}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Sanatani_Events_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!checkQuota('free_pdf_limit')) return; 

    pushToDataLayer('export_data', { export_type: 'PDF', data_category: 'EVENTS', community_id: session.communityId });
    import('../utils/pdfGenerator').then(({ generateMasterEventReportPdf }) => {
        if(generateMasterEventReportPdf) {
          generateMasterEventReportPdf(session.communityName, displayEvents, activeTab);
          if(isOnline) update(ref(db), { [`communities/${session.communityId}/usage_tracking/pdfs_generated`]: increment(1) });
        }
    });
  };

  const handleExportBulkTickets = (ev) => {
    if (!checkQuota('free_pdf_limit')) return; 

    pushToDataLayer('export_data', { export_type: 'PDF', data_category: 'BULK_TICKETS', community_id: session.communityId });

    const invitedMembers = ev.guestList ? Object.keys(ev.guestList).map(k => ({ id: k, ...ev.guestList[k] })) : [];

    if (invitedMembers.length === 0) return showToast(t('err_no_invitees') || "No guests invited to this event yet.", "error");

    import('../utils/pdfGenerator').then(({ generateBulkEventTicketsPDF }) => {
        if(generateBulkEventTicketsPDF) {
          generateBulkEventTicketsPDF(ev, invitedMembers, session.communityName);
          showToast(`Generating ${invitedMembers.length} PDF tickets...`);
          if(isOnline) update(ref(db), { [`communities/${session.communityId}/usage_tracking/pdfs_generated`]: increment(1) });
        } else {
          showToast(t('error') || "PDF Generator utility missing.", "error");
        }
    });
  };

  const exportMeetingToPDF = (ev) => {
    if (!checkQuota('free_pdf_limit')) return; 

    pushToDataLayer('export_data', { export_type: 'PDF', data_category: 'MEETING_REPORT', community_id: session.communityId });
    import('../utils/pdfGenerator').then(({ generateMeetingReportPDF }) => {
        if(generateMeetingReportPDF) {
          generateMeetingReportPDF(ev, members, session.communityName, t('workspace') || 'Workspace');
          if(isOnline) update(ref(db), { [`communities/${session.communityId}/usage_tracking/pdfs_generated`]: increment(1) });
        }
    });
  };

  const exportMeetingToCSV = (ev) => {
    pushToDataLayer('export_data', { export_type: 'CSV', data_category: 'MEETING_REPORT', community_id: session.communityId });
    import('../utils/csvGenerator').then(({ generateMeetingReportCSV }) => {
        if(generateMeetingReportCSV) generateMeetingReportCSV(ev, members, session.communityName);
    });
  };

  const openEditModal = (ev) => {
    setIsEditing(true);
    setEditId(ev.id);

    let dStr = '';
    let tStr = '';
    if (ev.timestamp) {
      const d = new Date(ev.timestamp);
      const tzOffset = d.getTimezoneOffset() * 60000; 
      const localISOTime = (new Date(d - tzOffset)).toISOString().slice(0, -1);
      dStr = localISOTime.split('T')[0];
      if (ev.timeStr && ev.timeStr !== 'All Day') tStr = d.toTimeString().slice(0,5);
    }

    setFormData({
      title: ev.title || '', date: dStr, time: tStr,
      location: ev.location || '', description: ev.description || '', adminComment: ev.adminComment || '', meetingMinutes: ev.meetingMinutes || '',
      requiresTickets: ev.requiresTickets || false, maxCapacity: ev.maxCapacity || ''
    });

    setInviteMode(ev.inviteMode || 'ALL');

    if (ev.inviteMode === 'SPECIFIC' && ev.guestList) {
       setSelectedInvitees(Object.keys(ev.guestList));
    } else {
       setSelectedInvitees([]);
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsEditing(false);
    setEditId(null);
    setFormData({ title: '', date: '', time: '', location: '', description: '', adminComment: '', meetingMinutes: '', requiresTickets: false, maxCapacity: '' });
    setInviteMode('ALL');
    setSelectedInvitees([]);
  };

  const toggleInvitee = (memberId) => {
    setSelectedInvitees(prev => 
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const nowTs = Date.now();
  const filteredEvents = events.filter(e => e.title.toLowerCase().includes(searchTerm.toLowerCase()));

  const upcomingEvents = filteredEvents.filter(e => e.timestamp >= nowTs - 86400000 && e.status !== 'CONCLUDED').sort((a, b) => a.timestamp - b.timestamp); 
  const pastEvents = filteredEvents.filter(e => e.timestamp < nowTs - 86400000 || e.status === 'CONCLUDED').sort((a, b) => b.timestamp - a.timestamp); 

  const displayEvents = activeTab === 'UPCOMING' ? upcomingEvents : pastEvents;

  const getCountdown = (targetTs) => {
    const diff = targetTs - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    if (days === 0) return `In ${hours} Hours`;
    return `In ${days} Days, ${hours} Hours`;
  };

  const smartInsights = useMemo(() => {
    const concludedEvents = events.filter(e => e.status === 'CONCLUDED' || (e.timestamp < nowTs && e.attendance));
    if (concludedEvents.length < 2) return null; 

    let totalAttendance = 0;
    const daysCount = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }; 

    concludedEvents.forEach(ev => {
      if (ev.attendance) {
        totalAttendance += Object.values(ev.attendance).filter(s => s === 'PRESENT').length;
      }
      const dayOfWeek = new Date(ev.timestamp).getDay();
      daysCount[dayOfWeek]++;
    });

    const avgAttendance = Math.round(totalAttendance / concludedEvents.length);
    const bestDayIndex = parseInt(Object.keys(daysCount).reduce((a, b) => daysCount[a] > daysCount[b] ? a : b));
    const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

    return { average: avgAttendance, bestDay: dayNames[bestDayIndex] };
  }, [events, nowTs]);

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
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'error' ? t('error') || 'Error' : t('success') || 'Success'}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* ✨ ENTERPRISE CONFIRMATION MODAL ENGINE */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmDialog.isDanger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
              {confirmDialog.isDanger ? <AlertTriangle size={32}/> : <BellRing size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors">{t('btn_cancel') || 'Cancel'}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🚀 HEADER SECTION */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div className="w-full xl:w-auto">
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <CalendarDays className="text-sanatani-orange" size={28} /> {institutionLabel} {t('nav_panjika') || 'Utsav Panjika'}
          </h2>
          <p className="text-[10px] sm:text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">{t('panjika_subtitle') || 'Master calendar for festivals, meetings, and timelines.'}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={() => { setShowGuide(!showGuide); if(!showGuide) pushToDataLayer('open_quick_guide', { module: 'UtsavPanjika' }); }} 
              className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-3 sm:py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-sm whitespace-nowrap"
            >
              <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
            </button>

            <div className="flex flex-1 sm:flex-none bg-gray-100 p-1 rounded-xl shadow-sm">
              <button onClick={handleExportCSV} className="flex-1 sm:flex-none bg-white hover:bg-gray-50 text-gray-700 font-black py-2 px-3 sm:py-2.5 sm:px-4 rounded-lg text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-all border border-gray-200">
                <FileDown size={14} /> {t('export_csv') || 'CSV'}
              </button>
              <button onClick={handleExportPDF} className="flex-1 sm:flex-none bg-gray-900 hover:bg-black text-white font-black py-2 px-3 sm:py-2.5 sm:px-4 rounded-lg text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-all ml-1">
                <FileText size={14} /> {t('export_pdf') || 'PDF'}
              </button>
            </div>
          </div>

          <div className="hidden lg:flex bg-gradient-to-r from-orange-50 to-red-50 border border-orange-100 px-3 py-2 rounded-xl items-center gap-2.5 shadow-sm">
             <div className="bg-white p-1 rounded-md shadow-sm"><Sun size={14} className="text-orange-500"/></div>
             <div>
               <p className="text-[8px] font-black text-orange-600 uppercase tracking-widest mb-0.5">{t('today') || 'Today'}</p>
               <p className="text-[10px] font-black text-gray-900">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
             </div>
          </div>

          {isManagerOrAdmin && (
            <button 
              onClick={() => { setIsEditing(false); setShowModal(true); }}
              className="w-full sm:w-auto text-white font-black py-3 sm:py-3.5 px-6 rounded-xl text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md transition-all hover:-translate-y-0.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shrink-0"
            >
              <Plus size={16} /> {t('schedule_event') || 'SCHEDULE EVENT'}
            </button>
          )}
        </div>
      </div>

      {/* ✨ DECISION MAKING ASSISTANT */}
      {isManagerOrAdmin && smartInsights && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center gap-4 animate-in slide-in-from-top-2">
          <div className="bg-purple-100 text-purple-600 p-3 rounded-xl shrink-0 self-start sm:self-auto">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h3 className="text-xs font-black text-purple-900 uppercase tracking-widest mb-1">Smart Scheduling Assistant</h3>
            <p className="text-sm font-bold text-gray-700 leading-snug">
              Based on past event data, your highest attendance typically occurs on <strong className="text-gray-900">{smartInsights.bestDay}</strong>. 
              Expect an average turnout of <strong className="text-gray-900">{smartInsights.average} {t('members') || 'Members'}</strong> per event.
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
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Ticket size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">1. Event Capacity & RSVPs</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Schedule events and specifically target VIPs or entire networks. They will receive a notification to use their Digital Gate Pass.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><ShieldPlus size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">2. Assign Sevadars</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Click "Assign Sevadar" on an event card to delegate duties (e.g. Shoe Counter) to volunteers.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Users size={16}/></div>
              <div>
                <p className="text-xs font-black text-gray-900 mb-1">3. Upasthiti (Attendance)</p>
                <p className="text-[10px] font-bold text-gray-600 leading-relaxed">Mark {t('members') || 'members'} present manually here, or switch to the Guest CRM module to use the live QR Gate Scanner.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FILTER TABS */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-200">
        <div className="flex w-full lg:w-auto bg-gray-200/80 p-1.5 rounded-xl">
          <button onClick={() => setActiveTab('UPCOMING')} className={`flex-1 sm:w-40 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'UPCOMING' ? 'bg-white text-sanatani-orange shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}>
            <Flame size={14} /> {t('upcoming') || 'UPCOMING'} ({upcomingEvents.length})
          </button>
          <button onClick={() => setActiveTab('PAST')} className={`flex-1 sm:w-40 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'PAST' ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}>
            <History size={14} /> {t('past') || 'PAST'} ({pastEvents.length})
          </button>
        </div>

        <div className="relative w-full lg:w-72">
          <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input 
            type="text" placeholder={t('search_events') || "Search events..."}
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:border-sanatani-orange focus:ring-2 focus:ring-orange-50 outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      {/* EVENT GRID */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-8 pt-2 scrollbar-hide">
        {displayEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
            {displayEvents.map((ev) => {
              const evDateObj = ev.timestamp ? new Date(ev.timestamp) : new Date();
              const day = evDateObj.getDate();
              const month = evDateObj.toLocaleString('en-US', { month: 'short' });

              const totalAttended = ev.attendance ? Object.values(ev.attendance).filter(s => s === 'PRESENT').length : 0;
              const isConcluded = ev.status === 'CONCLUDED';
              const canEditAttendance = isAdmin || !isConcluded;
              const assignedSevadars = ev.sevadars ? Object.keys(ev.sevadars).length : 0;

              // Determine how many were invited
              const totalInvited = ev.guestList ? Object.keys(ev.guestList).length : 0;

              return (
              <div key={ev.id} className={`bg-white border rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-xl transition-all duration-300 ring-1 ring-black/5 flex flex-col justify-between group ${activeTab === 'UPCOMING' ? 'border-orange-100 hover:border-orange-300' : 'border-gray-200 opacity-90 hover:border-gray-300'}`}>

                <div className="flex gap-4 sm:gap-5 mb-5">
                  <div className={`flex flex-col items-center justify-center w-16 h-20 sm:w-20 sm:h-24 rounded-2xl shrink-0 shadow-inner border relative overflow-hidden ${activeTab === 'UPCOMING' ? 'bg-gradient-to-b from-orange-50 to-orange-100 border-orange-200 text-sanatani-orange' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                     <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest relative z-10">{month}</span>
                     <span className="text-2xl sm:text-3xl font-black tracking-tight relative z-10">{day}</span>
                     {ev.requiresTickets && <div className="absolute bottom-0 w-full bg-blue-500 text-white text-[8px] font-black uppercase tracking-widest text-center py-0.5 z-10">TICKETED</div>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className={`text-base sm:text-xl font-black whitespace-normal break-words line-clamp-2 pr-2 leading-tight ${activeTab === 'UPCOMING' ? 'text-gray-900 group-hover:text-sanatani-orange transition-colors' : 'text-gray-600'}`} title={ev.title}>
                        {ev.title}
                      </h3>
                      <button onClick={() => handleShareEvent(ev)} className="p-2 bg-gray-50 text-gray-400 hover:text-sanatani-orange hover:bg-orange-50 rounded-xl transition-all shrink-0 shadow-sm" title="Copy Event Details for WhatsApp">
                        <Share2 size={16}/>
                      </button>
                    </div>
                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 mb-3 truncate">By: {ev.createdBy}</p>

                    <div className="space-y-1.5">
                      <p className="text-[11px] sm:text-xs font-bold text-gray-600 flex items-center gap-2 truncate">
                        <Clock size={14} className="text-gray-400 shrink-0"/> {ev.timeStr || 'Time TBA'}
                      </p>
                      {ev.location && (
                        <p className="text-[11px] sm:text-xs font-bold text-gray-600 flex items-center gap-2 truncate">
                          <MapPin size={14} className="text-gray-400 shrink-0"/> {ev.location}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  {/* CAPACITY PROGRESS BAR IF TICKETED */}
                  {ev.requiresTickets && activeTab === 'UPCOMING' && (
                    <div className="mb-4 bg-blue-50/50 border border-blue-100 p-3 rounded-xl shadow-sm">
                      <div className="flex justify-between items-end mb-1">
                        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1.5"><Ticket size={12}/> Capacity Limit</p>
                        <p className="text-[10px] font-black text-gray-700">{totalInvited} / {ev.maxCapacity}</p>
                      </div>
                      <div className="w-full bg-blue-200/50 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min((totalInvited / (ev.maxCapacity || 1)) * 100, 100)}%` }}></div>
                      </div>
                    </div>
                  )}

                  {/* TARGETED INVITATION BADGE */}
                  {activeTab === 'UPCOMING' && (
                    <div className="flex items-center gap-2 mb-4">
                      {ev.inviteMode === 'SPECIFIC' ? (
                        <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                          <ShieldCheck size={12}/> Private Event ({totalInvited} Invited)
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                          <UsersRound size={12}/> Open To All ({totalInvited} Registered)
                        </span>
                      )}
                    </div>
                  )}

                  {ev.description && (
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-500 mb-4 line-clamp-2 leading-relaxed">
                      {ev.description}
                    </p>
                  )}

                  {ev.adminComment && isManagerOrAdmin && (
                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-xl mb-3 flex items-start gap-2 shadow-inner">
                      <AlertCircle size={16} className="text-yellow-600 mt-0.5 shrink-0"/>
                      <p className="text-[10px] font-bold text-yellow-800 uppercase tracking-wide leading-relaxed">{t('admin_note') || 'Admin Note'}: <span className="font-medium text-yellow-700 lowercase capitalize-first">{ev.adminComment}</span></p>
                    </div>
                  )}

                  {/* POST MEETING MINUTES */}
                  {ev.meetingMinutes && (
                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl mb-4 flex items-start gap-2 shadow-sm">
                      <FileSignature size={16} className="text-blue-500 mt-0.5 shrink-0"/>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-blue-800 uppercase tracking-widest mb-1">{t('post_meeting_notes') || 'Post-Meeting Decisions & Notes'}</p>
                        <p className="text-[11px] font-medium text-blue-900 leading-relaxed whitespace-pre-wrap">{ev.meetingMinutes}</p>
                      </div>
                    </div>
                  )}

                  {/* Action Footer */}
                  <div className="border-t border-gray-100 pt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="w-full sm:w-auto">
                      {activeTab === 'UPCOMING' ? (
                         <div className="flex items-center justify-center sm:justify-start gap-3">
                           <p className="text-[10px] sm:text-[11px] font-black text-sanatani-orange uppercase tracking-widest flex items-center gap-1.5">
                              <Clock size={14}/> {getCountdown(ev.timestamp) || 'Happening Now'}
                           </p>
                           {assignedSevadars > 0 && (
                             <span className="text-[9px] font-black text-purple-700 uppercase tracking-widest bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                               <ShieldPlus size={10}/> {assignedSevadars} Sevadars
                             </span>
                           )}
                         </div>
                      ) : (
                         <div className="flex items-center justify-center sm:justify-start gap-3">
                           <p className="text-[10px] sm:text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                              <History size={14}/> {t('concluded') || 'Concluded'}
                           </p>
                           <p className="text-[10px] sm:text-[11px] font-black text-green-600 uppercase tracking-widest flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-lg border border-green-200 shadow-sm">
                              <Users size={14}/> {totalAttended} {t('attended') || 'Attended'}
                           </p>
                         </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto opacity-100 xl:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => exportMeetingToCSV(ev)} className="bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-200 p-2 sm:p-2.5 rounded-xl transition-all border border-gray-200 shadow-sm" title="Download Report (CSV)">
                        <FileDown size={14}/>
                      </button>
                      <button onClick={() => exportMeetingToPDF(ev)} className="bg-gray-50 text-gray-500 hover:text-red-600 hover:bg-red-50 p-2 sm:p-2.5 rounded-xl transition-all border border-gray-200 shadow-sm" title="Download Report (PDF)">
                        <FileText size={14}/>
                      </button>

                      {isManagerOrAdmin && (
                        <>
                          {/* BULK TICKET DOWNLOAD BUTTON */}
                          {activeTab === 'UPCOMING' && (
                            <button 
                              onClick={() => handleExportBulkTickets(ev)} 
                              className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white p-2 sm:p-2.5 rounded-xl transition-all border border-blue-200 shadow-sm" 
                              title="Download Printable PDF Tickets"
                            >
                              <Ticket size={14}/>
                            </button>
                          )}

                          {/* SEVADAR ASSIGNMENT BUTTON */}
                          {activeTab === 'UPCOMING' && (
                            <button 
                              onClick={() => setSevadarEvent(ev)} 
                              className="bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white p-2 sm:p-2.5 rounded-xl transition-all border border-purple-200 shadow-sm" 
                              title="Assign Sevadars (Volunteers)"
                            >
                              <ShieldPlus size={14}/>
                            </button>
                          )}

                          <button 
                            onClick={() => {
                              if (!canEditAttendance) return showToast(t('err_attendance_locked') || "Event is concluded. Only Admins can modify attendance.", "error");
                              setAttendanceEvent(ev); 
                              setAttendanceSearch(''); 
                            }} 
                            className={`p-2 sm:p-2.5 rounded-xl transition-all border flex items-center justify-center shadow-sm ${canEditAttendance ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border-emerald-200' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`} 
                            title={canEditAttendance ? "Mark Attendance manually" : "Attendance Locked"}
                          >
                            {canEditAttendance ? <UserCheck size={14}/> : <Lock size={14}/>}
                          </button>

                          {activeTab === 'UPCOMING' && (
                            <>
                              <button onClick={() => { setConcludeData({ id: ev.id, title: ev.title, minutes: '' }); setShowConcludeModal(true); }} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white p-2 sm:p-2.5 rounded-xl transition-all border border-indigo-200 shadow-sm" title="Conclude Meeting & Add Notes">
                                <Flag size={14}/>
                              </button>

                              <button onClick={() => handleResendAlert(ev)} className="bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white p-2 sm:p-2.5 rounded-xl transition-all border border-orange-200 flex items-center gap-1.5 shadow-sm" title="Resend App Notification to Invitees">
                                <BellRing size={14}/> <span className="text-[10px] font-black">({ev.notificationCount || 1})</span>
                              </button>
                            </>
                          )}
                          <button onClick={() => openEditModal(ev)} className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white p-2 sm:p-2.5 rounded-xl transition-all border border-blue-200 shadow-sm" title="Edit Event & Notes"><Edit size={14}/></button>
                          <button onClick={() => handleDeleteEvent(ev.id, ev.title)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2 sm:p-2.5 rounded-xl transition-all border border-red-200 shadow-sm" title="Delete"><Trash2 size={14}/></button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )})}
          </div>
        ) : (
          <div className="text-center p-16 text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100 shadow-inner flex flex-col items-center justify-center h-64">
            <CalendarDays size={48} className="text-gray-300 mb-4" />
            <p className="text-lg sm:text-xl font-black text-gray-900 mb-2">{t('no_events_found') || `No ${activeTab.toLowerCase()} events found.`}</p>
            <p className="text-[10px] sm:text-xs uppercase tracking-widest">{t('schedule_new') || "Click 'Schedule' to add a new event."}</p>
          </div>
        )}
      </div>

      {/* FOOTER CREDIT */}
      <div className="pt-8 pb-4 flex flex-col items-center justify-center text-center opacity-70 border-t border-gray-200 mt-auto">
         <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1">
           Made with <Heart size={12} className="text-red-500 fill-current"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span>
         </div>
         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">© {new Date().getFullYear()} Sanatani Bandhan. Enterprise Edition.</p>
      </div>

      {/* ✨ ATTENDANCE (UPASTHITI) MODAL */}
      {attendanceEvent && createPortal(
        <div className="fixed inset-0 bg-gray-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-0 sm:p-4 pt-safe pb-safe">
          <div className="bg-white w-full sm:w-[95%] max-w-2xl h-full sm:h-[85vh] mx-auto rounded-none sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 ring-1 ring-white/20">

            <div className="bg-emerald-600 p-5 sm:p-6 relative shrink-0">
               <button onClick={() => setAttendanceEvent(null)} className="absolute top-5 right-5 text-emerald-100 hover:text-white transition-colors bg-black/10 hover:bg-black/20 p-2.5 rounded-full"><X size={20}/></button>
               <h2 className="text-xl font-black text-white flex items-center gap-3 tracking-tight"><UserCheck size={24}/> Upasthiti / Attendance</h2>
               <p className="text-xs font-bold text-emerald-100 mt-1 truncate max-w-[85%]">{attendanceEvent.title} • {attendanceEvent.dateStr}</p>
               <p className="text-[10px] text-emerald-200 uppercase tracking-widest font-black mt-2 bg-emerald-700 inline-block px-3 py-1 rounded-lg shadow-inner">Use Event Door/Gate Roster for QR Check-ins.</p>
            </div>

            <div className="bg-gray-50 p-4 border-b border-gray-200 shrink-0">
               <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-gray-100 mb-4">
                 <div className="text-center flex-1 border-r border-gray-100">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total</p>
                   <p className="text-lg font-black text-gray-800">{members.length}</p>
                 </div>
                 <div className="text-center flex-1 border-r border-gray-100">
                   <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-1">Present</p>
                   <p className="text-lg font-black text-green-600">{attendanceEvent.attendance ? Object.values(attendanceEvent.attendance).filter(s => s === 'PRESENT').length : 0}</p>
                 </div>
                 <div className="text-center flex-1 border-r border-gray-100">
                   <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Absent</p>
                   <p className="text-lg font-black text-red-500">{attendanceEvent.attendance ? Object.values(attendanceEvent.attendance).filter(s => s === 'ABSENT').length : 0}</p>
                 </div>
                 <div className="text-center flex-1">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Unmarked</p>
                   <p className="text-lg font-black text-gray-400">{members.length - (attendanceEvent.attendance ? Object.keys(attendanceEvent.attendance).length : 0)}</p>
                 </div>
               </div>

               <div className="relative">
                 <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                 <input 
                   type="text" placeholder={t('search_directory') || "Search members to mark attendance..."}
                   value={attendanceSearch} onChange={(e) => setAttendanceSearch(e.target.value)}
                   className="w-full pl-9 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none transition-all shadow-sm"
                 />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50 pb-24 scrollbar-hide">
               {members.filter(m => m.name && m.name.toLowerCase().includes(attendanceSearch.toLowerCase())).map(m => {
                  const status = attendanceEvent.attendance?.[m.id] || 'UNMARKED';

                  return (
                    <div key={m.id} className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gray-200 transition-colors">

                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 shrink-0 flex items-center justify-center overflow-hidden">
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt={m.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-sm font-black text-emerald-600">{m.name ? m.name.charAt(0).toUpperCase() : 'ॐ'}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-gray-900 truncate">{m.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-gray-500 font-mono font-bold">{m.id}</span>
                            {m.phone && (
                              <>
                                <span className="text-gray-300">•</span>
                                <span className="text-[9px] text-gray-500 font-mono font-bold truncate">{m.phone}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex bg-gray-100 p-1 rounded-xl shrink-0 w-full sm:w-auto shadow-sm">
                        <button 
                          onClick={() => handleToggleAttendance(m.id, status, 'PRESENT')}
                          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${status === 'PRESENT' ? 'bg-green-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}
                        >
                          <UserCheck size={14}/> <span className="sm:hidden">Present</span>
                        </button>
                        <button 
                          onClick={() => handleToggleAttendance(m.id, status, 'ABSENT')}
                          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${status === 'ABSENT' ? 'bg-red-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}
                        >
                          <UserX size={14}/> <span className="sm:hidden">Absent</span>
                        </button>
                        <button 
                          onClick={() => handleToggleAttendance(m.id, status, 'CLEAR')}
                          className={`px-3 py-2.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all ${status === 'UNMARKED' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={status === 'UNMARKED'} title="Clear Record"
                        >
                          <MinusCircle size={14}/>
                        </button>
                      </div>
                    </div>
                  );
               })}
               {members.length === 0 && <p className="text-center text-xs text-gray-400 py-10 font-bold uppercase tracking-widest">No members found in directory.</p>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ SEVADAR / VOLUNTEER ASSIGNMENT MODAL */}
      {sevadarEvent && createPortal(
        <div className="fixed inset-0 bg-gray-900/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 fade-in border-t-4 border-purple-500 ring-1 ring-white/20 max-h-[90vh] flex flex-col">
             <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4 shrink-0">
               <div>
                 <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                   <ShieldPlus className="text-purple-600" size={24}/> Assign Sevadars
                 </h3>
                 <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1 truncate">Delegate duties for {sevadarEvent.title}</p>
               </div>
               <button onClick={() => setSevadarEvent(null)} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
             </div>

             <div className="overflow-y-auto pr-2 scrollbar-hide pb-4 flex-1">
               <form onSubmit={handleAssignSevadar} className="space-y-4 mb-8 bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Select Devotee *</label>
                   <select required value={sevadarForm.memberId} onChange={e=>setSevadarForm({...sevadarForm, memberId: e.target.value})} className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:border-purple-500 focus:ring-4 focus:ring-purple-50 outline-none shadow-sm cursor-pointer transition-all">
                     <option value="" disabled>Select a registered member...</option>
                     {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.phone})</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Duty / Role *</label>
                   <select required value={sevadarForm.role} onChange={e=>setSevadarForm({...sevadarForm, role: e.target.value})} className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:border-purple-500 focus:ring-4 focus:ring-purple-50 outline-none shadow-sm cursor-pointer transition-all">
                     <option value="Gate Check-In (Scanner)">Gate Check-In (Scanner)</option>
                     <option value="Prasad Distribution">Prasad Distribution</option>
                     <option value="Security / Crowd Control">Security / Crowd Control</option>
                     <option value="Puja Setup">Puja Setup</option>
                     <option value="General Seva">General Seva</option>
                   </select>
                 </div>
                 <button type="submit" disabled={submitting} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 mt-2">
                   {submitting ? <Loader2 size={16} className="animate-spin"/> : <ShieldPlus size={16}/>} ASSIGN SEVADAR
                 </button>
               </form>

               <div>
                 <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">Currently Assigned Volunteers</h4>
                 {sevadarEvent.sevadars && Object.keys(sevadarEvent.sevadars).length > 0 ? (
                   <div className="space-y-3">
                     {Object.keys(sevadarEvent.sevadars).map(uid => (
                       <div key={uid} className="flex justify-between items-center bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-gray-300 transition-colors">
                         <div>
                           <p className="text-sm font-black text-gray-900">{sevadarEvent.sevadars[uid].name}</p>
                           <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mt-0.5">{sevadarEvent.sevadars[uid].role}</p>
                         </div>
                         <button onClick={() => handleRemoveSevadar(uid)} className="text-red-400 hover:text-white hover:bg-red-600 p-2.5 rounded-lg transition-colors border border-transparent hover:border-red-600"><Trash2 size={16}/></button>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <p className="text-xs font-bold text-gray-400 text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">No Sevadars assigned yet.</p>
                 )}
               </div>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ CONCLUDE MEETING MODAL */}
      {showConcludeModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 border-t-4 border-indigo-500">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
                 <Flag className="text-indigo-600" size={24}/> {t('conclude_meeting') || 'Conclude Meeting'}
              </h3>
              <button onClick={() => setShowConcludeModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
            </div>

            <form onSubmit={handleConcludeMeeting}>
               <p className="text-xs font-bold text-gray-500 mb-4 leading-relaxed">
                 You are concluding <strong className="text-gray-800">{concludeData.title}</strong>. This will move the event to the PAST tab and lock attendance for non-admins.
               </p>

               <div className="mb-6">
                 <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 flex items-center gap-1"><FileSignature size={12}/> {t('post_meeting_notes') || 'Post-Meeting Notes / Decisions'}</label>
                 <textarea required rows="4" value={concludeData.minutes} onChange={e => setConcludeData({...concludeData, minutes: e.target.value})} className="w-full p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none transition-all resize-none shadow-sm" placeholder="Record what was discussed or decided..."></textarea>
               </div>

               <div className="flex gap-3">
                 <button type="button" onClick={() => setShowConcludeModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors">{t('btn_cancel') || 'Cancel'}</button>
                 <button type="submit" disabled={submitting} className="flex-[2] font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                   {submitting ? <Loader2 size={16} className="animate-spin"/> : <><CheckCircle2 size={16}/> {t('btn_save') || 'CONCLUDE & LOCK'}</>}
                 </button>
               </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ GOD-MODE SMART SCHEDULING MODAL (UPGRADED WITH TARGETED INVITATIONS) */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9000] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 fade-in border-t-4 border-sanatani-orange ring-1 ring-white/20 max-h-[90vh] flex flex-col">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4 shrink-0">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                 <Calendar className="text-sanatani-orange" size={24}/> {isEditing ? (t('update_event') || 'Update Event') : (t('schedule_event') || 'Schedule New Event')}
               </h3>
               <button onClick={closeModal} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
             </div>

             <div className="overflow-y-auto pr-2 scrollbar-hide pb-4">
               <form onSubmit={handleSaveEvent} className="space-y-6">
                 
                 <div className="space-y-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('event_title') || 'Event Title'} *</label>
                     <input type="text" required value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all shadow-sm" placeholder="e.g. Executive Committee Meeting" />
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                       <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><CalendarDays size={12}/> {t('date') || 'Date'} *</label>
                       <input type="date" required value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm text-gray-700" />
                     </div>
                     <div>
                       <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Clock size={12}/> {t('time_optional') || 'Time (Optional)'}</label>
                       <input type="time" value={formData.time} onChange={e=>setFormData({...formData, time: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm text-gray-700" />
                     </div>
                   </div>

                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><MapPin size={12}/> {t('location') || 'Location'}</label>
                     <input type="text" value={formData.location} onChange={e=>setFormData({...formData, location: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm" placeholder={`e.g. Main ${t('workspace') || 'Workspace'} Hall`} />
                   </div>
                 </div>

                 {/* ✨ TARGETED INVITATION ENGINE */}
                 <div className="bg-purple-50/50 border border-purple-200 p-5 rounded-2xl space-y-4 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-purple-900 flex items-center gap-1.5"><ShieldCheck size={16}/> Target Audience</h4>
                        <p className="text-[9px] font-bold text-purple-600 uppercase tracking-widest mt-0.5">Control who sees this event</p>
                      </div>
                    </div>

                    <div className="flex bg-white rounded-xl shadow-sm border border-purple-100 p-1">
                      <button 
                        type="button" 
                        onClick={() => setInviteMode('ALL')} 
                        className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${inviteMode === 'ALL' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-purple-50'}`}
                      >
                        Open To All
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setInviteMode('SPECIFIC')} 
                        className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${inviteMode === 'SPECIFIC' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-purple-50'}`}
                      >
                        Specific Members
                      </button>
                    </div>

                    {inviteMode === 'SPECIFIC' && (
                      <div className="animate-in slide-in-from-top-2 space-y-3 pt-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text" 
                            placeholder="Search members to invite..." 
                            value={inviteSearch}
                            onChange={(e) => setInviteSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-3 bg-white border border-purple-200 rounded-xl text-xs font-bold focus:border-purple-500 outline-none shadow-sm transition-all"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto bg-white border border-purple-100 rounded-xl p-2 space-y-1 shadow-inner scrollbar-hide">
                          <button 
                            type="button" 
                            onClick={() => setSelectedInvitees(selectedInvitees.length === members.length ? [] : members.map(m => m.id))}
                            className="w-full text-left px-3 py-2 text-[10px] font-black text-purple-600 uppercase tracking-widest hover:bg-purple-50 rounded-lg transition-colors border border-transparent hover:border-purple-100"
                          >
                            {selectedInvitees.length === members.length ? 'Deselect All' : 'Select All'}
                          </button>
                          {members.filter(m => m.name.toLowerCase().includes(inviteSearch.toLowerCase())).map(m => (
                            <label key={m.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-100">
                              <input 
                                type="checkbox" 
                                checked={selectedInvitees.includes(m.id)} 
                                onChange={() => toggleInvitee(m.id)}
                                className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                              />
                              <span className="text-xs font-bold text-gray-700">{m.name} <span className="text-[10px] text-gray-400 ml-1 font-mono">({m.phone})</span></span>
                            </label>
                          ))}
                        </div>
                        <p className="text-[9px] font-black text-purple-600 text-right uppercase tracking-widest">{selectedInvitees.length} Selected</p>
                      </div>
                    )}
                 </div>

                 {/* ENTERPRISE FEATURE: TICKETING LIMIT */}
                 <div className="bg-blue-50/50 border border-blue-200 p-5 rounded-2xl space-y-4 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-blue-900 flex items-center gap-1.5"><Ticket size={16}/> Require RSVP / Tickets</h4>
                        <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">Limit capacity for this event</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={formData.requiresTickets} onChange={e => setFormData({...formData, requiresTickets: e.target.checked})} />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {formData.requiresTickets && (
                      <div className="animate-in slide-in-from-top-2">
                        <label className="block text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1.5">Maximum Capacity Limit *</label>
                        <input type="number" required min="1" value={formData.maxCapacity} onChange={e=>setFormData({...formData, maxCapacity: e.target.value})} className="w-full p-4 bg-white border border-blue-200 rounded-xl text-sm font-bold focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all shadow-sm" placeholder="e.g. 100" />
                      </div>
                    )}
                 </div>

                 <div className="space-y-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('description') || 'Public Description / Agenda'}</label>
                     <textarea rows="2" value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 outline-none transition-all resize-none shadow-sm" placeholder="Meeting agenda or details..."></textarea>
                   </div>

                   {isEditing && (
                     <div>
                       <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 flex items-center gap-1"><FileSignature size={12}/> {t('post_meeting_notes') || 'Post-Meeting Notes / Decisions'}</label>
                       <textarea rows="3" value={formData.meetingMinutes} onChange={e=>setFormData({...formData, meetingMinutes: e.target.value})} className="w-full p-4 bg-blue-50/50 border border-blue-200 rounded-xl text-sm font-bold text-blue-900 focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none shadow-sm" placeholder="Record what was discussed or decided..."></textarea>
                     </div>
                   )}

                   {isManagerOrAdmin && (
                     <div>
                       <label className="block text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-1.5 flex items-center gap-1"><AlertCircle size={12}/> {t('admin_note') || 'Admin Notes (Private)'}</label>
                       <input type="text" value={formData.adminComment} onChange={e=>setFormData({...formData, adminComment: e.target.value})} className="w-full p-4 bg-yellow-50/50 border border-yellow-200 rounded-xl text-sm font-bold text-yellow-800 focus:bg-yellow-50 focus:border-yellow-400 outline-none transition-all shadow-sm" placeholder="e.g. Needs floral arrangements by 8 AM" />
                     </div>
                   )}
                 </div>

                 <div className="pt-2 pb-2">
                   <button type="submit" disabled={submitting} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none">
                     {submitting ? <Loader2 size={18} className="animate-spin" /> : (isEditing ? (t('update_event') || 'UPDATE EVENT DETAILS') : <><Bell size={16}/> {t('schedule_notify') || 'SCHEDULE & NOTIFY APP USERS'}</>)}
                   </button>
                 </div>
               </form>
             </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
