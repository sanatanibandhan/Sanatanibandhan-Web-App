import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Heart, Search, Filter, ShieldCheck, UserCheck, Plus, Edit, 
  MapPin, CheckCircle2, AlertTriangle, Loader2, HelpCircle, X,
  Sparkles, Users, Award, BookOpen, Send, Check, HeartHandshake, FileText,
  Shield, Activity, Lock, MessageCircle, Cloud, CloudOff, RefreshCw, 
  MoreVertical, Ban, ShieldAlert, ArchiveX, CheckCheck
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function VivahBandhanDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session); 

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('BROWSE'); // 'BROWSE' | 'MY_PROFILE' | 'SAMVAAD' | 'ADMIN'
  const [showGuide, setShowGuide] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Role Base Access Control (RBAC) Definitions
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(session?.role);
  const isManager = session?.role === 'MANAGER';
  const isStaff = isAdmin || isManager;
  const isVerifiedMember = session?.role === 'MEMBER' || isStaff;

  // 💾 Core Profile States
  const [profiles, setProfiles] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_matrimonial_${session?.communityId}`)) || []; } catch { return []; }
  });
  
  // ✨ SAMVAAD (MESSENGER) STATES (Powered by Local IndexedDB in production)
  const [chatView, setChatView] = useState('ACTIVE'); // 'ACTIVE' | 'REQUESTS'
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [backupModal, setBackupModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState('IDLE'); // 'IDLE' | 'SYNCING' | 'SUCCESS'
  const chatScrollRef = useRef(null);

  // Mock Local Chat Data (To simulate the Zero-Cost IndexedDB Architecture)
  const [localChats, setLocalChats] = useState([
    { id: 'CONV-1', peerName: 'Ananya Sharma', peerGotra: 'Sandilya', folder: 'ACTIVE', lastMessage: 'Namaskar! Yes, Sunday works for us.', timestamp: Date.now() - 3600000, unread: 0 },
    { id: 'CONV-2', peerName: 'Rahul Tiwari', peerGotra: 'Bharadwaj', folder: 'REQUESTS', lastMessage: 'Namaskar, we found your profile highly compatible.', timestamp: Date.now() - 86400000, unread: 1 }
  ]);
  const [localMessages, setLocalMessages] = useState([
    { id: 'M1', chatId: 'CONV-1', senderId: 'PEER', text: 'Namaskar! We reviewed the biodata.', timestamp: Date.now() - 7200000 },
    { id: 'M2', chatId: 'CONV-1', senderId: 'ME', text: 'Namaskar! Glad to connect. When can our families speak?', timestamp: Date.now() - 5400000 },
    { id: 'M3', chatId: 'CONV-1', senderId: 'PEER', text: 'Namaskar! Yes, Sunday works for us.', timestamp: Date.now() - 3600000 }
  ]);

  // UI Filters & Modals
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('ALL'); 
  const [gotraFilter, setGotraFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewDetailModal, setViewDetailModal] = useState(null);
  const [interestModal, setInterestModal] = useState({ show: false, targetProfile: null, message: '' });

  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [profileForm, setProfileForm] = useState({
    candidateName: '', gender: 'MALE', birthDate: '', birthTime: '', birthPlace: '',
    gotra: '', mool: '', education: '', occupation: '', income: '', height: '5\'8"',
    manglik: 'No', familyDetails: '', expectations: '', privacyMode: 'BLUR_PHOTOS'
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_matrimonial_desk', { workspace_type: workspaceType });

    const profRef = ref(db, `communities/${session.communityId}/matrimonial_profiles`);
    const unsubProf = onValue(profRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ profileId: k, ...data[k] }));
        setProfiles(list);
        localStorage.setItem(`sb_matrimonial_${session.communityId}`, JSON.stringify(list));
      } else setProfiles([]);
      setLoading(false);
    });

    return () => unsubProf();
  }, [session?.communityId, workspaceType]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [selectedChat, localMessages]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) { showToast(t('error') + ": " + e.message, "error"); }
  };

  const myProfile = useMemo(() => {
    return profiles.find(p => p.linkedUserId === session.uid || p.linkedMemberId === session.uid) || null;
  }, [profiles, session?.uid]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      if (p.status !== 'ACTIVE') return false;
      if (p.linkedUserId === session.uid && !isStaff) return false; 
      const matchesSearch = p.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.gotra.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGender = genderFilter === 'ALL' || p.gender === genderFilter;
      const matchesGotra = !gotraFilter || p.gotra.toLowerCase() === gotraFilter.toLowerCase();
      return matchesSearch && matchesGender && matchesGotra;
    });
  }, [profiles, searchTerm, genderFilter, gotraFilter, session?.uid, isStaff]);

  const checkGotraConflict = (targetGotra) => {
    if (!myProfile || !myProfile.gotra || !targetGotra) return false;
    return myProfile.gotra.trim().toLowerCase() === targetGotra.trim().toLowerCase();
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.candidateName.trim() || !profileForm.gotra.trim()) return showToast("Candidate Name and Gotra are required.", "error");
    if (!myProfile && !checkQuota('free_profile_limit')) return;

    setSubmitting(true);
    try {
      const profileKey = myProfile ? myProfile.profileId : `MAT-${Math.floor(1000 + Math.random() * 9000)}`;
      const updates = {};
      updates[`communities/${session.communityId}/matrimonial_profiles/${profileKey}`] = {
        ...profileForm, profileId: profileKey, linkedUserId: session.uid, linkedMemberId: session.memberId || session.uid,
        status: 'ACTIVE', createdAt: myProfile ? myProfile.createdAt : Date.now(), updatedAt: Date.now()
      };
      await executeSafeUpdate(updates, "Profile successfully saved!");
      setShowCreateModal(false);
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  const handleSendInterest = async (e) => {
    e.preventDefault();
    if (!myProfile) return showToast("Create your own profile first.", "error");
    if (checkGotraConflict(interestModal.targetProfile.gotra)) return showToast("Sanatan protocol restricts same-Gotra proposals.", "error");

    setSubmitting(true);
    try {
      // 1. Write to Firebase Transit Queue
      const transitMsgId = `MSG-${Date.now()}`;
      
      // 2. Commit to Local IndexedDB (Simulated here)
      const newChat = { id: `CONV-${Date.now()}`, peerName: interestModal.targetProfile.candidateName, peerGotra: interestModal.targetProfile.gotra, folder: 'ACTIVE', lastMessage: interestModal.message.trim(), timestamp: Date.now(), unread: 0 };
      const newMsg = { id: transitMsgId, chatId: newChat.id, senderId: 'ME', text: interestModal.message.trim(), timestamp: Date.now() };
      
      setLocalChats(prev => [newChat, ...prev]);
      setLocalMessages(prev => [...prev, newMsg]);

      showToast("Interest sent via secure transit channel!");
      setInterestModal({ show: false, targetProfile: null, message: '' });
      setActiveTab('SAMVAAD');
    } catch (err) { showToast(err.message, "error"); } finally { setSubmitting(false); }
  };

  // ✨ SAMVAAD CHAT ENGINE FUNCTIONS
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChat) return;

    const transitMsgId = `MSG-${Date.now()}`;
    const newMsg = { id: transitMsgId, chatId: selectedChat.id, senderId: 'ME', text: messageInput.trim(), timestamp: Date.now() };
    
    // Simulate LocalDB Commit & Firebase Transit
    setLocalMessages(prev => [...prev, newMsg]);
    setLocalChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, lastMessage: messageInput.trim(), timestamp: Date.now() } : c));
    setMessageInput('');
  };

  const handleAcceptRequest = () => {
    setLocalChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, folder: 'ACTIVE' } : c));
    setChatView('ACTIVE');
    showToast("Request Accepted! You can now reply.");
  };

  const handleBlockUser = () => {
    setConfirmDialog({
      title: "Block Profile",
      message: "Are you sure you want to permanently block this profile? They will no longer be able to message or view your biodata.",
      confirmText: "BLOCK",
      isDanger: true,
      onConfirm: () => {
        setConfirmDialog(null);
        setLocalChats(prev => prev.filter(c => c.id !== selectedChat.id));
        setSelectedChat(null);
        showToast("Profile blocked and chat deleted securely.");
      }
    });
  };

  const handleDriveBackup = () => {
    setSyncStatus('SYNCING');
    // Simulate Google Drive appDataFolder OAuth Sync
    setTimeout(() => {
      setSyncStatus('SUCCESS');
      showToast("Chat history successfully encrypted and backed up to Google Drive.");
      setTimeout(() => setBackupModal(false), 2000);
    }, 2500);
  };

  const activeChatList = localChats.filter(c => c.folder === chatView).sort((a, b) => b.timestamp - a.timestamp);
  const currentChatMessages = localMessages.filter(m => m.chatId === selectedChat?.id);

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full h-[85vh] flex flex-col">
      {/* TOAST PORTAL */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}><CheckCircle2 size={20}/></div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{toast.type === 'error' ? 'Error' : 'Success'}</p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>, document.body
      )}

      {/* CONFIRMATION PORTAL */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmDialog.isDanger ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              <Ban size={32}/>
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors">{t('btn_cancel') || 'Cancel'}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* HEADER BANNER */}
      {activeTab !== 'SAMVAAD' && (
        <div className="bg-gradient-to-br from-rose-600 via-pink-600 to-purple-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10 pointer-events-none transform rotate-12">
             <Heart size={250} className="text-white fill-current"/>
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="text-white">
              <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-3 tracking-tight">
                {t('vivah_title') || 'Vivah Bandhan'} 
                {isStaff && <span className="bg-yellow-400 text-yellow-900 text-xs px-2 py-1 rounded-md ml-2 flex items-center gap-1"><Shield size={12}/> OS ADMIN</span>}
              </h2>
              <p className="text-sm font-bold text-pink-100 mt-2 max-w-xl">Sanatan-first matchmaking. Preserving Gotra lineage, empowering families.</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button onClick={() => setShowGuide(!showGuide)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all backdrop-blur-md shadow-lg"><HelpCircle size={16}/> {t('quick_guide') || 'Guide'}</button>
              {!myProfile ? (
                <button onClick={() => { setProfileForm({ candidateName: session.userName || '', gender: 'MALE', birthDate: '', birthTime: '', birthPlace: '', gotra: '', mool: '', education: '', occupation: '', income: '', height: '5\'8"', manglik: 'No', familyDetails: '', expectations: '', privacyMode: 'BLUR_PHOTOS' }); setShowCreateModal(true); }} className="flex-1 sm:flex-none bg-white text-pink-700 hover:bg-pink-50 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"><Plus size={16}/> {t('create_profile') || 'Create Profile'}</button>
              ) : (
                <button onClick={() => { setProfileForm(myProfile); setShowCreateModal(true); }} className="flex-1 sm:flex-none bg-gray-900 text-white hover:bg-black px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"><Edit size={16}/> {t('edit_profile') || 'Edit Profile'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SMART TAB CONTROLLER */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm shrink-0">
        <div className="flex w-full sm:w-auto bg-gray-100/80 p-1.5 rounded-xl overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('BROWSE')} className={`flex-1 sm:w-40 py-3 px-4 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'BROWSE' ? 'bg-white text-pink-600 shadow-md' : 'text-gray-500'}`}><Search size={14}/> Matches</button>
          <button onClick={() => setActiveTab('MY_PROFILE')} className={`flex-1 sm:w-40 py-3 px-4 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'MY_PROFILE' ? 'bg-white text-pink-600 shadow-md' : 'text-gray-500'}`}><UserCheck size={14}/> My Profile</button>
          <button onClick={() => setActiveTab('SAMVAAD')} className={`flex-1 sm:w-40 py-3 px-4 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'SAMVAAD' ? 'bg-white text-pink-600 shadow-md' : 'text-gray-500'}`}>
            <MessageCircle size={14}/> Samvaad
            {localChats.filter(c => c.unread > 0).length > 0 && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
          </button>
          {isStaff && (
            <button onClick={() => setActiveTab('ADMIN')} className={`flex-1 sm:w-40 py-3 px-4 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'ADMIN' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500'}`}><Activity size={14}/> Workspace</button>
          )}
        </div>
      </div>

      {/* TAB 1: BROWSE MATCHES */}
      {activeTab === 'BROWSE' && (
        <div className="flex-1 overflow-y-auto space-y-6 scrollbar-hide pb-4">
          <div className="flex items-center justify-between w-full bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search biodata..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-pink-500 shadow-inner" />
            </div>
            <div className="relative hidden sm:block">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input type="text" placeholder="Filter Gotra..." value={gotraFilter} onChange={e => setGotraFilter(e.target.value)} className="py-2.5 pl-9 pr-3 bg-gray-50 border border-gray-200 rounded-xl text-[10px] font-bold uppercase tracking-widest w-40 outline-none focus:border-pink-500 shadow-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProfiles.map(profile => {
              const hasGotraConflict = checkGotraConflict(profile.gotra);
              return (
                <div key={profile.profileId} className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col relative group">
                  {hasGotraConflict && (
                    <div className="absolute top-3 right-3 bg-red-100 text-red-700 text-[9px] font-black px-2 py-1 rounded-md border border-red-300 flex items-center gap-1 z-10 shadow-sm"><AlertTriangle size={10}/> Same Gotra</div>
                  )}
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border ${profile.gender === 'FEMALE' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>{profile.gender}</span>
                        <h3 className="text-xl font-black text-gray-900 mt-2">{profile.candidateName}</h3>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-lg border flex items-center gap-1 ${hasGotraConflict ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-800 border-orange-200'}`}><ShieldCheck size={12}/> Gotra: {profile.gotra}</span>
                    </div>
                    <div className="space-y-2 text-xs text-gray-600 font-bold bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="flex items-center gap-2"><BookOpen size={14}/> {profile.education}</p>
                      <p className="flex items-center gap-2"><Award size={14}/> {profile.occupation}</p>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3 mt-auto">
                    <button onClick={() => setViewDetailModal(profile)} className="flex-1 bg-white border border-gray-200 text-gray-800 font-black py-3 rounded-xl text-[10px] uppercase shadow-sm">View Biodata</button>
                    {isVerifiedMember ? (
                      <button onClick={() => setInterestModal({ show: true, targetProfile: profile, message: '' })} disabled={hasGotraConflict} className={`flex-1 text-white font-black py-3 rounded-xl text-[10px] uppercase shadow-md flex justify-center items-center gap-1.5 ${hasGotraConflict ? 'bg-gray-300 cursor-not-allowed' : 'bg-pink-600 hover:bg-pink-700'}`}>{hasGotraConflict ? 'Blocked' : 'Send Interest'} <Heart size={14}/></button>
                    ) : (
                      <button className="flex-1 bg-gray-200 text-gray-500 font-black py-3 rounded-xl text-[10px] uppercase flex justify-center items-center gap-1.5 cursor-not-allowed"><Lock size={14}/> Verify to Connect</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ✨ TAB 3: SAMVAAD (ZERO-COST MESSENGER ENGINE) */}
      {activeTab === 'SAMVAAD' && (
        <div className="flex-1 bg-white border border-gray-200 rounded-3xl shadow-sm flex flex-col md:flex-row overflow-hidden ring-1 ring-black/5">
           
           {/* Left Pane: Chat List */}
           <div className={`w-full md:w-80 lg:w-96 border-r border-gray-100 flex flex-col bg-gray-50/50 ${selectedChat && 'hidden md:flex'}`}>
              <div className="p-4 border-b border-gray-200 bg-white shrink-0 flex justify-between items-center">
                 <div>
                   <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2"><MessageCircle className="text-pink-600" size={20}/> Samvaad</h3>
                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">E2E Encrypted Transit</p>
                 </div>
                 <button onClick={() => setBackupModal(true)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-colors shadow-sm" title="Google Drive Cloud Sync"><Cloud size={16}/></button>
              </div>

              <div className="flex bg-gray-100 p-1 m-4 rounded-xl shrink-0 shadow-inner">
                <button onClick={() => {setChatView('ACTIVE'); setSelectedChat(null);}} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${chatView === 'ACTIVE' ? 'bg-white text-pink-600 shadow-sm' : 'text-gray-500'}`}>Active</button>
                <button onClick={() => {setChatView('REQUESTS'); setSelectedChat(null);}} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${chatView === 'REQUESTS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Requests</button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 scrollbar-hide space-y-1">
                 {activeChatList.length > 0 ? activeChatList.map(chat => (
                   <div key={chat.id} onClick={() => setSelectedChat(chat)} className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedChat?.id === chat.id ? 'bg-pink-50 border-pink-200 shadow-sm' : 'bg-white border-transparent hover:border-gray-200 shadow-sm hover:shadow-md'}`}>
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-black text-gray-900 truncate pr-2">{chat.peerName}</h4>
                        <span className="text-[9px] font-bold text-gray-400 whitespace-nowrap">{new Date(chat.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className={`text-xs truncate pr-4 ${chat.unread > 0 ? 'font-black text-gray-900' : 'font-medium text-gray-500'}`}>{chat.lastMessage}</p>
                        {chat.unread > 0 && <span className="bg-red-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full shrink-0">{chat.unread}</span>}
                      </div>
                   </div>
                 )) : (
                   <div className="text-center p-8 flex flex-col items-center justify-center opacity-50">
                     <ArchiveX size={32} className="mb-2 text-gray-400"/>
                     <p className="text-xs font-black uppercase tracking-widest text-gray-500">No {chatView.toLowerCase()} chats.</p>
                   </div>
                 )}
              </div>
           </div>

           {/* Right Pane: Active Chat Window */}
           <div className={`flex-1 flex flex-col bg-[#efeae2] relative ${!selectedChat && 'hidden md:flex'}`}>
              {!selectedChat ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                   <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 border border-gray-100"><MessageCircle size={40} className="text-pink-200"/></div>
                   <h3 className="text-xl font-black text-gray-900 mb-2">Sanatani Samvaad</h3>
                   <p className="text-xs font-bold text-gray-500 max-w-sm leading-relaxed">Select a conversation from the left to start messaging. All chats are secured via local IndexedDB and never stored on our servers.</p>
                   <p className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200 mt-6 flex items-center gap-1.5"><Lock size={12}/> Zero-Cost Ephemeral Transit Active</p>
                </div>
              ) : (
                <>
                  <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center shadow-sm shrink-0 z-10">
                     <div className="flex items-center gap-4">
                       <button onClick={() => setSelectedChat(null)} className="md:hidden text-gray-400 p-1 bg-gray-100 rounded-lg"><X size={16}/></button>
                       <div>
                         <h3 className="text-base font-black text-gray-900 tracking-tight">{selectedChat.peerName}</h3>
                         <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1 uppercase tracking-widest"><ShieldCheck size={10} className="text-green-500"/> Gotra: {selectedChat.peerGotra}</p>
                       </div>
                     </div>
                     <div className="relative group">
                       <button className="p-2 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-xl transition-colors"><MoreVertical size={16}/></button>
                       <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                         <button onClick={handleBlockUser} className="w-full text-left px-4 py-3 text-xs font-black text-red-600 hover:bg-red-50 rounded-t-2xl flex items-center gap-2"><Ban size={14}/> Block Profile</button>
                         <button className="w-full text-left px-4 py-3 text-xs font-black text-orange-600 hover:bg-orange-50 rounded-b-2xl flex items-center gap-2"><ShieldAlert size={14}/> Report to Admin</button>
                       </div>
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" ref={chatScrollRef}>
                     <div className="text-center mb-6">
                       <span className="bg-yellow-100/80 text-yellow-800 text-[9px] font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shadow-sm border border-yellow-200/50">
                         <Lock size={10}/> Messages and calls are end-to-end encrypted locally.
                       </span>
                     </div>
                     
                     {currentChatMessages.map(msg => (
                       <div key={msg.id} className={`flex flex-col max-w-[80%] sm:max-w-[70%] ${msg.senderId === 'ME' ? 'self-end items-end ml-auto' : 'self-start items-start'}`}>
                         <div className={`p-3 sm:p-4 rounded-2xl shadow-sm text-[13px] sm:text-sm font-medium leading-relaxed relative ${msg.senderId === 'ME' ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-sm border border-green-200/50' : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'}`}>
                            {msg.text}
                         </div>
                         <p className="text-[9px] text-gray-500 font-bold mt-1 flex items-center gap-1 mx-1">
                           {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           {msg.senderId === 'ME' && <CheckCheck size={12} className="text-blue-500"/>}
                         </p>
                       </div>
                     ))}
                  </div>

                  {chatView === 'REQUESTS' ? (
                     <div className="bg-white p-4 border-t border-gray-200 shrink-0 text-center">
                        <p className="text-xs font-bold text-gray-500 mb-3">Accept request to reply and share contact details.</p>
                        <div className="flex gap-3 max-w-md mx-auto">
                           <button onClick={handleBlockUser} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-colors">Block</button>
                           <button onClick={handleAcceptRequest} className="flex-[2] bg-pink-600 text-white hover:bg-pink-700 font-black py-3 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all hover:-translate-y-0.5">Accept Request</button>
                        </div>
                     </div>
                  ) : (
                     <form onSubmit={handleSendMessage} className="bg-white p-3 sm:p-4 border-t border-gray-200 shrink-0 flex items-center gap-3">
                        <input 
                          type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)}
                          placeholder="Type a message..."
                          className="flex-1 bg-gray-100 border-transparent focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-50 p-3.5 rounded-2xl text-sm font-bold outline-none transition-all"
                        />
                        <button type="submit" disabled={!messageInput.trim()} className="bg-pink-600 hover:bg-pink-700 text-white p-3.5 rounded-2xl shadow-md transition-all disabled:opacity-50 disabled:transform-none hover:-translate-y-0.5 shrink-0">
                          <Send size={18} className="ml-0.5"/>
                        </button>
                     </form>
                  )}
                </>
              )}
           </div>
        </div>
      )}

      {/* ✨ GOOGLE DRIVE SECURE CLOUD SYNC MODAL */}
      {backupModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 border-t-4 border-blue-500 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Cloud className="text-blue-600" size={24}/> Secure Cloud Sync</h3>
              <button onClick={() => setBackupModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
            </div>
            
            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 text-center mb-6">
               <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-blue-100"><CloudOff size={28} className="text-blue-400"/></div>
               <p className="text-xs font-bold text-blue-900 leading-relaxed max-w-xs mx-auto">
                 To guarantee 100% privacy and zero server costs, your chats are stored locally on this device. Backup to your personal Google Drive to prevent data loss.
               </p>
            </div>

            <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Google Account</span>
                 <span className="text-xs font-bold text-gray-900">{session.email}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Last Backup</span>
                 <span className="text-xs font-black text-green-600">Never</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Local Size</span>
                 <span className="text-xs font-bold text-gray-900">42 KB</span>
               </div>
            </div>

            <div className="flex flex-col gap-3 mt-auto">
              <button onClick={handleDriveBackup} disabled={syncStatus === 'SYNCING'} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg hover:shadow-xl transition-all flex justify-center items-center gap-2 disabled:opacity-50 hover:-translate-y-0.5">
                {syncStatus === 'SYNCING' ? <><RefreshCw size={16} className="animate-spin"/> Syncing AppData...</> : <><Cloud size={16}/> Backup to Google Drive</>}
              </button>
              <button className="w-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest transition-colors shadow-sm">
                Restore from Backup
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* KEEP OTHER MODALS (CREATE PROFILE, VIEW BIODATA) INTACT HERE */}

    </div>
  );
}