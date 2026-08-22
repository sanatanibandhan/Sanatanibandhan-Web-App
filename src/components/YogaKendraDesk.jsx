import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, set, update } from 'firebase/database';
import { db } from '../firebase';
import { 
  Activity, CalendarDays, HeartPulse, Plus, CheckCircle2, 
  AlertTriangle, Loader2, X, WifiOff, Search, Users, ShieldCheck, 
  Clock, CheckSquare
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function YogaKendraDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const [activeTab, setActiveTab] = useState('SHIVIR'); // 'SHIVIR' or 'WELLNESS'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 💾 Data States
  const [classes, setClasses] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_yoga_classes_${session?.communityId}`)) || []; } catch { return []; }});
  const [wellnessLogs, setWellnessLogs] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_yoga_logs_${session?.communityId}`)) || []; } catch { return []; }});
  const [members, setMembers] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_yoga_members_${session?.communityId}`)) || []; } catch { return []; }});

  // UI Modals
  const [showClassModal, setShowClassModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  // Form States
  const [classForm, setClassForm] = useState({ title: '', instructor: '', dateStr: new Date().toISOString().split('T')[0], timeStr: '06:00', capacity: 20 });
  const [logForm, setLogForm] = useState({ sadhakId: '', goal: 'General Fitness', chronicIssues: '', progressNote: '' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_yoga_desk', { workspace_type: workspaceType });

    // Sync Members (for Wellness CRM)
    const memRef = ref(db, `communities/${session.communityId}/members`);
    const unsubMem = onValue(memRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const memArray = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setMembers(memArray);
        localStorage.setItem(`sb_yoga_members_${session.communityId}`, JSON.stringify(memArray));
      }
    });

    // Sync Yoga Classes / Shivirs
    const classesRef = ref(db, `communities/${session.communityId}/yoga_classes`);
    const unsubClasses = onValue(classesRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const cArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => new Date(`${a.dateStr}T${a.timeStr}`) - new Date(`${b.dateStr}T${b.timeStr}`));
        
        // Auto-cleanup or filter past classes if needed, but here we just sort
        setClasses(cArray);
        localStorage.setItem(`sb_yoga_classes_${session.communityId}`, JSON.stringify(cArray));
      } else { setClasses([]); }
    });

    // Sync Wellness Logs
    const logsRef = ref(db, `communities/${session.communityId}/yoga_wellness_logs`);
    const unsubLogs = onValue(logsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const lArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.updatedAt - a.updatedAt);
        setWellnessLogs(lArray);
        localStorage.setItem(`sb_yoga_logs_${session.communityId}`, JSON.stringify(lArray));
      } else { setWellnessLogs([]); }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubMem(); unsubClasses(); unsubLogs(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const handleSaveClass = async (e) => {
    e.preventDefault();
    if (!isOnline) return showToast("Offline mode.", "error");
    setIsProcessing(true);
    try {
      const classId = push(ref(db, `communities/${session.communityId}/yoga_classes`)).key;
      const newClass = { 
        ...classForm, 
        capacity: Number(classForm.capacity),
        bookedSeats: 0,
        attendees: {}, // Will store uid: name
        createdAt: Date.now(), 
        loggedBy: session.userName 
      };
      await set(ref(db, `communities/${session.communityId}/yoga_classes/${classId}`), newClass);
      showToast("Shivir/Batch successfully scheduled!");
      setShowClassModal(false);
      setClassForm({ title: '', instructor: '', dateStr: new Date().toISOString().split('T')[0], timeStr: '06:00', capacity: 20 });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  const handleSaveLog = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const targetMember = members.find(m => m.id === logForm.sadhakId);
      if (!targetMember) throw new Error("Please select a valid Sadhak.");

      // Using sadhakId as the key so each member has one continuously updated master record
      const newLog = {
        sadhakId: targetMember.id,
        sadhakName: targetMember.name,
        goal: logForm.goal,
        chronicIssues: logForm.chronicIssues.trim() || 'None reported',
        progressNote: logForm.progressNote.trim(),
        updatedAt: Date.now(),
        updatedBy: session.userName
      };
      
      await set(ref(db, `communities/${session.communityId}/yoga_wellness_logs/${targetMember.id}`), newLog);
      pushToDataLayer('generate_lead', { content_type: 'Wellness_Profile_Updated' });
      showToast("Wellness profile updated successfully!");
      setShowLogModal(false);
      setLogForm({ sadhakId: '', goal: 'General Fitness', chronicIssues: '', progressNote: '' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  const handleBookSlot = async (yogaClass) => {
    if (!isOnline) return showToast("You must be online to book a slot.", "error");
    if (yogaClass.bookedSeats >= yogaClass.capacity) return showToast("This batch is full!", "error");
    if (yogaClass.attendees && yogaClass.attendees[session.uid]) return showToast("You have already booked this slot.", "error");

    try {
      const updates = {};
      updates[`communities/${session.communityId}/yoga_classes/${yogaClass.id}/attendees/${session.uid}`] = session.userName;
      updates[`communities/${session.communityId}/yoga_classes/${yogaClass.id}/bookedSeats`] = (yogaClass.bookedSeats || 0) + 1;
      
      await update(ref(db), updates);
      showToast("Slot successfully reserved!");
      pushToDataLayer('select_content', { content_type: 'Yoga_Slot_Booked', item_id: yogaClass.id });
    } catch (e) { showToast("Booking error: " + e.message, "error"); }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  const filteredLogs = wellnessLogs.filter(log => log.sadhakName.toLowerCase().includes(searchQuery.toLowerCase()));

  // Filter out classes that happened more than 24 hours ago
  const upcomingClasses = classes.filter(c => {
     const classTime = new Date(`${c.dateStr}T${c.timeStr}`).getTime();
     return classTime > Date.now() - (24 * 60 * 60 * 1000);
  });

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5">

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg">
          <WifiOff size={18} /> <span className="text-xs font-black uppercase tracking-widest">Offline Mode</span>
        </div>
      )}

      {toast && createPortal(
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl bg-gray-900 text-white flex items-center gap-3 animate-in slide-in-from-top-4">
           {toast.type === 'error' ? <AlertTriangle size={20} className="text-red-400"/> : <CheckCircle2 size={20} className="text-green-400"/>}
           <p className="text-sm font-bold">{toast.message}</p>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Activity className="text-teal-600" size={26} /> Yoga Kendra Operations
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Batch scheduling & personalized wellness CRM.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button onClick={() => setActiveTab('SHIVIR')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeTab === 'SHIVIR' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><CalendarDays size={14}/> Batches</button>
            
            {/* Privacy protection: Only Admins/Instructors can see medical/wellness data */}
            {isManagerOrAdmin && (
              <button onClick={() => setActiveTab('WELLNESS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeTab === 'WELLNESS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><HeartPulse size={14}/> Wellness CRM</button>
            )}
          </div>

          {isManagerOrAdmin && activeTab === 'SHIVIR' && (
            <button onClick={() => setShowClassModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Schedule Batch
            </button>
          )}
          {isManagerOrAdmin && activeTab === 'WELLNESS' && (
            <button onClick={() => setShowLogModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Update Profile
            </button>
          )}
        </div>
      </div>

      {/* 🧘‍♂️ TAB 1: BATCH / SHIVIR SCHEDULER */}
      {activeTab === 'SHIVIR' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingClasses.map(c => {
            const isFull = c.bookedSeats >= c.capacity;
            const fillPercentage = Math.round((c.bookedSeats / c.capacity) * 100);
            const myBooking = c.attendees && c.attendees[session.uid];

            return (
              <div key={c.id} className="bg-white border border-gray-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:border-teal-300 transition-colors">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="bg-teal-50 text-teal-700 text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest border border-teal-100 flex items-center gap-1">
                      <Clock size={10}/> {c.timeStr}
                    </span>
                    <span className="text-xs font-black text-gray-500">{c.dateStr}</span>
                  </div>
                  <h3 className="text-lg font-black text-gray-900 mb-1">{c.title}</h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Instructor: {c.instructor}</p>
                  
                  <div className="mt-2 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1.5">
                       <span className="text-gray-500">Reserved Spots</span>
                       <span className={isFull ? 'text-red-500' : 'text-teal-600'}>{c.bookedSeats} / {c.capacity}</span>
                     </div>
                     <div className="w-full bg-gray-200 rounded-full h-2">
                       <div className={`h-2 rounded-full transition-all ${isFull ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${fillPercentage}%` }}></div>
                     </div>
                  </div>
                </div>

                <div className="mt-2">
                  {myBooking ? (
                    <div className="w-full bg-green-50 text-green-700 border border-green-200 text-xs font-black py-3 rounded-xl uppercase tracking-widest flex items-center justify-center gap-2">
                      <CheckCircle2 size={16}/> Slot Confirmed
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleBookSlot(c)} 
                      disabled={isFull}
                      className="w-full bg-gray-900 hover:bg-black text-white text-xs font-black py-3 rounded-xl uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      {isFull ? 'Batch Full' : 'Reserve Spot'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {upcomingClasses.length === 0 && (
            <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
              No upcoming batches scheduled.
            </div>
          )}
        </div>
      )}

      {/* 🩺 TAB 2: WELLNESS CRM (Admin Only) */}
      {activeTab === 'WELLNESS' && isManagerOrAdmin && (
        <div className="flex flex-col h-full space-y-4">
          <div className="relative w-full max-w-md">
             <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
             <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search Sadhak by Name..." className="w-full bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl text-sm font-bold focus:border-teal-500 outline-none shadow-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-6">
            {filteredLogs.map(log => (
              <div key={log.id} className="bg-teal-50/30 border border-teal-100 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="bg-white text-gray-700 text-[9px] font-black px-2.5 py-1 rounded shadow-sm border border-gray-100 uppercase tracking-widest flex items-center gap-1">
                      <ShieldCheck size={10}/> Confidential
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-gray-900 mb-4">{log.sadhakName}</h3>
                  
                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded-xl border border-teal-50 shadow-sm">
                      <p className="text-[9px] font-black text-teal-600 uppercase tracking-widest mb-1">Wellness Goal</p>
                      <p className="text-sm font-bold text-gray-800">{log.goal}</p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-red-50 shadow-sm">
                      <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Reported Issues</p>
                      <p className="text-sm font-bold text-gray-800">{log.chronicIssues}</p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Progress Notes</p>
                      <p className="text-xs font-bold text-gray-600 italic whitespace-pre-wrap">{log.progressNote || 'No notes added.'}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-teal-100 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  Last Updated: {new Date(log.updatedAt).toLocaleDateString()} by {log.updatedBy}
                </div>
              </div>
            ))}
            {filteredLogs.length === 0 && (
              <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
                No wellness profiles recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ✨ SCHEDULE BATCH MODAL */}
      {showClassModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 border-t-4 border-teal-500 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><CalendarDays className="text-teal-600" size={20}/> Schedule Shivir</h3>
               <button onClick={() => setShowClassModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveClass} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Class / Batch Name *</label>
                 <input required type="text" value={classForm.title} onChange={e => setClassForm({...classForm, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Morning Pranayama" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Instructor (Acharya) *</label>
                 <input required type="text" value={classForm.instructor} onChange={e => setClassForm({...classForm, instructor: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Acharya Raj" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Date *</label>
                   <input required type="date" value={classForm.dateStr} onChange={e => setClassForm({...classForm, dateStr: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Time *</label>
                   <input required type="time" value={classForm.timeStr} onChange={e => setClassForm({...classForm, timeStr: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
                 </div>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Max Capacity (Seats) *</label>
                 <input required type="number" min="1" value={classForm.capacity} onChange={e => setClassForm({...classForm, capacity: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex items-center justify-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'PUBLISH SCHEDULE'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ WELLNESS LOG MODAL */}
      {showLogModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 border-t-4 border-gray-800 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><HeartPulse className="text-gray-700" size={20}/> Update Wellness Profile</h3>
               <button onClick={() => setShowLogModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveLog} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Select Sadhak *</label>
                 <select required value={logForm.sadhakId} onChange={e => setLogForm({...logForm, sadhakId: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                   <option value="">Select Member...</option>
                   {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                 </select>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Primary Goal</label>
                 <select value={logForm.goal} onChange={e => setLogForm({...logForm, goal: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                   <option value="General Fitness">General Fitness</option>
                   <option value="Stress Relief & Meditation">Stress Relief & Meditation</option>
                   <option value="Flexibility & Core Strength">Flexibility & Core Strength</option>
                   <option value="Pain Management (Therapy)">Pain Management (Therapy)</option>
                   <option value="Spiritual Awakening">Spiritual Awakening</option>
                 </select>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-red-500 uppercase tracking-widest mb-1.5">Chronic Issues / Injuries (Important)</label>
                 <input type="text" value={logForm.chronicIssues} onChange={e => setLogForm({...logForm, chronicIssues: e.target.value})} className="w-full p-4 bg-red-50 border border-red-200 text-red-900 rounded-xl text-sm font-bold outline-none placeholder-red-300" placeholder="e.g. Lower back pain, asthma..." />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Instructor Notes</label>
                 <textarea rows="3" value={logForm.progressNote} onChange={e => setLogForm({...logForm, progressNote: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none resize-none" placeholder="Track progress, suggested asanas, etc."></textarea>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex justify-center items-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'UPDATE PROFILE'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
