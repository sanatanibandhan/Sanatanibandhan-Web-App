import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, set, update } from 'firebase/database';
import { db } from '../firebase';
import { 
  BookOpen, GraduationCap, HeartHandshake, Plus, CheckCircle2, 
  AlertTriangle, Loader2, X, WifiOff, Search, ScrollText, Library, User
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function GurukulDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const [activeTab, setActiveTab] = useState('VIDYARTHIS'); // 'VIDYARTHIS' or 'SPONSORS'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 💾 Data States
  const [students, setStudents] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_gurukul_students_${session?.communityId}`)) || []; } catch { return []; }});
  const [sponsors, setSponsors] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_gurukul_sponsors_${session?.communityId}`)) || []; } catch { return []; }});

  // UI Modals
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showSponsorModal, setShowSponsorModal] = useState(false);

  // Form States
  const [studentForm, setStudentForm] = useState({ name: '', age: '', shastra: 'Rig Veda', enrollmentDate: new Date().toISOString().split('T')[0] });
  const [sponsorForm, setSponsorForm] = useState({ donorName: '', contact: '', studentId: '', amount: 2000, frequency: 'MONTHLY' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_gurukul_desk', { workspace_type: workspaceType });

    // Sync Students (Vidyarthis)
    const studRef = ref(db, `communities/${session.communityId}/gurukul_students`);
    const unsubStud = onValue(studRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const sArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.enrolledAt - a.enrolledAt);
        setStudents(sArray);
        localStorage.setItem(`sb_gurukul_students_${session.communityId}`, JSON.stringify(sArray));
      } else { setStudents([]); }
    });

    // Sync Sponsors (Vidyadaan)
    const sponsorRef = ref(db, `communities/${session.communityId}/gurukul_sponsors`);
    const unsubSponsor = onValue(sponsorRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const spArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.createdAt - a.createdAt);
        setSponsors(spArray);
        localStorage.setItem(`sb_gurukul_sponsors_${session.communityId}`, JSON.stringify(spArray));
      } else { setSponsors([]); }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubStud(); unsubSponsor(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    if (!isOnline) return showToast("Offline mode.", "error");
    setIsProcessing(true);
    try {
      const studentId = push(ref(db, `communities/${session.communityId}/gurukul_students`)).key;
      const newStudent = { 
        ...studentForm, 
        age: Number(studentForm.age),
        enrolledAt: Date.now(), 
        loggedBy: session.userName 
      };
      await set(ref(db, `communities/${session.communityId}/gurukul_students/${studentId}`), newStudent);
      showToast("Vidyarthi successfully registered!");
      setShowStudentModal(false);
      setStudentForm({ name: '', age: '', shastra: 'Rig Veda', enrollmentDate: new Date().toISOString().split('T')[0] });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  const handleSaveSponsor = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const sponsorId = push(ref(db, `communities/${session.communityId}/gurukul_sponsors`)).key;
      const linkedStudent = students.find(s => s.id === sponsorForm.studentId);
      
      const newSponsor = {
        ...sponsorForm,
        linkedStudentName: linkedStudent ? linkedStudent.name : 'General Gurukul Fund',
        status: 'ACTIVE',
        createdAt: Date.now(),
        loggedBy: session.userName
      };
      
      await set(ref(db, `communities/${session.communityId}/gurukul_sponsors/${sponsorId}`), newSponsor);
      pushToDataLayer('generate_lead', { content_type: 'Vidyadaan_Sponsor', value: newSponsor.amount });
      showToast("Vidyadaan sponsor successfully linked!");
      setShowSponsorModal(false);
      setSponsorForm({ donorName: '', contact: '', studentId: '', amount: 2000, frequency: 'MONTHLY' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.shastra.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <Library className="text-sanatani-orange" size={26} /> Gurukul Vidyapeeth
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Vidyarthi progress tracking & Vidyadaan sponsorships.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button onClick={() => setActiveTab('VIDYARTHIS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'VIDYARTHIS' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><GraduationCap size={14} className="inline mr-1"/> Vidyarthis ({students.length})</button>
            <button onClick={() => setActiveTab('SPONSORS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'SPONSORS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><HeartHandshake size={14} className="inline mr-1"/> Vidyadaan ({sponsors.length})</button>
          </div>

          {isManagerOrAdmin && activeTab === 'VIDYARTHIS' && (
            <button onClick={() => setShowStudentModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Enroll Student
            </button>
          )}
          {isManagerOrAdmin && activeTab === 'SPONSORS' && (
            <button onClick={() => setShowSponsorModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Link Sponsor
            </button>
          )}
        </div>
      </div>

      {/* 📜 TAB 1: VIDYARTHI LOG */}
      {activeTab === 'VIDYARTHIS' && (
        <div className="flex flex-col h-full space-y-4">
          <div className="relative w-full max-w-md">
             <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
             <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by Name or Shastra..." className="w-full bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl text-sm font-bold focus:border-sanatani-orange outline-none shadow-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-6">
            {filteredStudents.map(student => {
              // Find if this student has an active sponsor
              const linkedSponsor = sponsors.find(s => s.studentId === student.id);

              return (
                <div key={student.id} className="bg-white border border-gray-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:border-orange-300 transition-colors">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-orange-50 text-orange-700 text-[10px] font-black px-2.5 py-1 rounded border border-orange-200 uppercase tracking-widest flex items-center gap-1">
                        <ScrollText size={10}/> {student.shastra}
                      </span>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-1">{student.name}</h3>
                    <p className="text-xs font-bold text-gray-500 mb-4">Age: {student.age} Years</p>
                    
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Enrolled Date</span>
                        <span className="text-xs font-bold text-gray-800">{student.enrollmentDate}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vidyadaan Status</span>
                        {linkedSponsor ? (
                          <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase tracking-widest">Sponsored</span>
                        ) : (
                          <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-widest">Seeking Sponsor</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredStudents.length === 0 && (
              <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
                No Vidyarthis enrolled yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🤝 TAB 2: VIDYADAAN SPONSORS */}
      {activeTab === 'SPONSORS' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sponsors.map(sponsor => (
            <div key={sponsor.id} className="bg-blue-50/40 border border-blue-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-blue-100 text-blue-800 text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest flex items-center gap-1"><HeartHandshake size={10}/> Active Sponsor</span>
                  <span className="text-xs font-black text-green-600 bg-white px-2 py-0.5 rounded shadow-sm border border-green-100">৳{sponsor.amount} / {sponsor.frequency}</span>
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-1">{sponsor.donorName}</h3>
                <p className="text-[10px] font-mono font-bold text-gray-500 mb-4">{sponsor.contact}</p>
                
                <div className="space-y-2 bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Supporting Vidyarthi</p>
                  <p className="text-sm font-bold text-gray-800 flex items-center gap-2"><User size={14} className="text-blue-500"/> {sponsor.linkedStudentName}</p>
                </div>
              </div>
            </div>
          ))}
          {sponsors.length === 0 && (
            <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
              No Vidyadaan sponsors linked yet.
            </div>
          )}
        </div>
      )}

      {/* ✨ STUDENT ENROLLMENT MODAL */}
      {showStudentModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border-t-4 border-sanatani-orange animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><GraduationCap className="text-sanatani-orange" size={20}/> Enroll Vidyarthi</h3>
               <button onClick={() => setShowStudentModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveStudent} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Full Name *</label>
                 <input required type="text" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Ananya Tiwari" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Age *</label>
                   <input required type="number" value={studentForm.age} onChange={e => setStudentForm({...studentForm, age: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. 12" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Primary Shastra/Veda</label>
                   <select value={studentForm.shastra} onChange={e => setStudentForm({...studentForm, shastra: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                     <option value="Rig Veda">Rig Veda</option>
                     <option value="Sama Veda">Sama Veda</option>
                     <option value="Yajur Veda">Yajur Veda</option>
                     <option value="Atharva Veda">Atharva Veda</option>
                     <option value="Vyakarana">Vyakarana (Grammar)</option>
                     <option value="Nyaya">Nyaya (Logic)</option>
                     <option value="Jyotisha">Jyotisha (Astrology)</option>
                   </select>
                 </div>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Date of Enrollment</label>
                 <input type="date" value={studentForm.enrollmentDate} onChange={e => setStudentForm({...studentForm, enrollmentDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex items-center justify-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'REGISTER STUDENT'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ SPONSOR LINK MODAL */}
      {showSponsorModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 border-t-4 border-blue-600 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><HeartHandshake size={20} className="text-blue-600"/> Link Vidyadaan Sponsor</h3>
               <button onClick={() => setShowSponsorModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveSponsor} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Donor Name *</label>
                 <input required type="text" value={sponsorForm.donorName} onChange={e => setSponsorForm({...sponsorForm, donorName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Smt. Kavita Rao" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Contact Number *</label>
                 <input required type="text" value={sponsorForm.contact} onChange={e => setSponsorForm({...sponsorForm, contact: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="+880..." />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Amount *</label>
                   <input required type="number" value={sponsorForm.amount} onChange={e => setSponsorForm({...sponsorForm, amount: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Frequency</label>
                   <select value={sponsorForm.frequency} onChange={e => setSponsorForm({...sponsorForm, frequency: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                     <option value="MONTHLY">Monthly</option>
                     <option value="YEARLY">Yearly</option>
                     <option value="ONE_TIME">One-Time</option>
                   </select>
                 </div>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5">Sponsor a Specific Vidyarthi (Optional)</label>
                 <select value={sponsorForm.studentId} onChange={e => setSponsorForm({...sponsorForm, studentId: e.target.value})} className="w-full p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-sm font-bold outline-none cursor-pointer shadow-sm">
                   <option value="">General Gurukul Fund</option>
                   {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.shastra})</option>)}
                 </select>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex justify-center items-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'LINK SPONSOR'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
