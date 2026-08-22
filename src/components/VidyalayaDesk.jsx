import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, remove } from 'firebase/database';
import { db } from '../firebase';
import { 
  Library, GraduationCap, Users, BookOpen, Plus, X, Loader2, 
  HelpCircle, Lightbulb, CheckCircle2, AlertTriangle, WifiOff, 
  Search, Phone, Banknote, Edit, Trash2, ShieldCheck, Heart, ScrollText
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function VidyalayaDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('STUDENTS'); // 'STUDENTS' | 'ACHARYAS'
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [students, setStudents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_vidyarthi_${session?.communityId}`)) || []; } catch { return []; }
  });
  const [acharyas, setAcharyas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_acharyas_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  // Form States
  const [studentForm, setStudentForm] = useState({
    name: '', age: '', classGrade: 'Prathama (Grade 1)', parentName: '', phone: '', feesStatus: 'PAID', address: ''
  });
  const [acharyaForm, setAcharyaForm] = useState({
    name: '', subject: 'Sanskrit & Dharma Shiksha', phone: '', qualification: '', experience: ''
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_vidyalaya_desk', { workspace_type: workspaceType });

    // Fetch Students (Vidyarthi)
    const studRef = ref(db, `communities/${session.communityId}/vidyalaya_students`);
    const unsubStud = onValue(studRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        list.sort((a, b) => (b.enrolledAt || 0) - (a.enrolledAt || 0));
        setStudents(list);
        localStorage.setItem(`sb_vidyarthi_${session.communityId}`, JSON.stringify(list));
      } else {
        setStudents([]);
      }
    });

    // Fetch Teachers (Acharyas)
    const acharyaRef = ref(db, `communities/${session.communityId}/vidyalaya_acharyas`);
    const unsubAcharya = onValue(acharyaRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setAcharyas(list);
        localStorage.setItem(`sb_acharyas_${session.communityId}`, JSON.stringify(list));
      } else {
        setAcharyas([]);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubStud(); unsubAcharya(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(t('offline_saved') || "Action cached offline. Syncing soon.", 'offline');
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast((t('error') || "Error") + ": " + e.message, "error");
      throw e;
    }
  };

  const logAudit = async (actionType, description) => {
    try { push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  const handleSaveData = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const updates = {};
      const timestamp = Date.now();

      if (activeTab === 'STUDENTS') {
        if (!studentForm.name || !studentForm.classGrade) throw new Error("Name and Class are required.");
        if (!checkQuota('free_member_limit', students.length + 1)) return setSubmitting(false);

        const newId = `VID-${Math.floor(1000 + Math.random() * 9000)}`;
        updates[`communities/${session.communityId}/vidyalaya_students/${newId}`] = {
          ...studentForm, id: newId, enrolledAt: timestamp, addedBy: session.userName
        };
        await executeSafeUpdate(updates, "Vidyarthi (Student) successfully enrolled!");
        logAudit("STUDENT_ENROLLED", `Enrolled ${studentForm.name} in ${studentForm.classGrade}`);
        setStudentForm({ name: '', age: '', classGrade: 'Prathama (Grade 1)', parentName: '', phone: '', feesStatus: 'PAID', address: '' });
      } else {
        if (!acharyaForm.name || !acharyaForm.subject) throw new Error("Name and Subject are required.");
        
        const newId = `ACH-${Math.floor(1000 + Math.random() * 9000)}`;
        updates[`communities/${session.communityId}/vidyalaya_acharyas/${newId}`] = {
          ...acharyaForm, id: newId, joinedAt: timestamp, addedBy: session.userName
        };
        await executeSafeUpdate(updates, "Acharya (Teacher) successfully onboarded!");
        logAudit("ACHARYA_ADDED", `Added Acharya ${acharyaForm.name} for ${acharyaForm.subject}`);
        setAcharyaForm({ name: '', subject: 'Sanskrit & Dharma Shiksha', phone: '', qualification: '', experience: '' });
      }

      setShowModal(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name, type) => {
    if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;
    try {
      const path = type === 'STUDENT' ? `vidyalaya_students/${id}` : `vidyalaya_acharyas/${id}`;
      await executeSafeUpdate({ [`communities/${session.communityId}/${path}`]: null }, "Record deleted.");
      logAudit("RECORD_DELETED", `Removed ${type.toLowerCase()}: ${name}`);
    } catch (e) { showToast(e.message, "error"); }
  };

  const filteredStudents = useMemo(() => students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.classGrade.toLowerCase().includes(searchTerm.toLowerCase())), [students, searchTerm]);
  const filteredAcharyas = useMemo(() => acharyas.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.subject.toLowerCase().includes(searchTerm.toLowerCase())), [acharyas, searchTerm]);

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full">
      {/* TOAST */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{toast.type === 'error' ? 'Error' : 'Success'}</p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>, document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Library className="text-sky-600" size={32} /> Vidyalaya Shiksha Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest flex items-center gap-1.5">
            <ScrollText size={14}/> "Sa Vidya Ya Vimuktaye" — Manage students, fees, and Acharyas.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200 w-full sm:w-auto">
            <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 whitespace-nowrap">
              <HelpCircle size={14}/> Guide
            </button>
            <button onClick={() => setActiveTab('STUDENTS')} className={`flex-1 sm:w-auto px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'STUDENTS' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
              Vidyarthi ({students.length})
            </button>
            <button onClick={() => setActiveTab('ACHARYAS')} className={`flex-1 sm:w-auto px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'ACHARYAS' ? 'bg-white text-sky-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
              Acharyas ({acharyas.length})
            </button>
          </div>

          {isManagerOrAdmin && (
            <button onClick={() => setShowModal(true)} className="w-full sm:w-auto bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all shrink-0">
              <Plus size={16}/> {activeTab === 'STUDENTS' ? 'Enroll Student' : 'Add Acharya'}
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 p-5 rounded-2xl shadow-inner relative animate-in slide-in-from-top-2">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-sky-400 hover:text-sky-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-sky-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-sky-500"/> Vidyalaya Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Foster Sanatan education securely. Use the <strong>Vidyarthi</strong> tab to track student admissions and Shulk (fee) status. Use the <strong>Acharyas</strong> tab to manage your teaching faculty and their specialized subjects (e.g., Sanskrit, Veda, Yoga).
          </p>
        </div>
      )}

      {/* SEARCH */}
      <div className="relative w-full sm:w-96 bg-gray-50 p-3 rounded-2xl border border-gray-200">
        <Search size={16} className="absolute left-6 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input 
          type="text" 
          placeholder={`Search ${activeTab === 'STUDENTS' ? 'students, grades...' : 'acharyas, subjects...'}`}
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-sky-500 shadow-sm"
        />
      </div>

      {/* GRID CONTENT */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in">
        
        {/* STUDENTS TAB */}
        {activeTab === 'STUDENTS' && (
          filteredStudents.length > 0 ? filteredStudents.map(s => (
            <div key={s.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow flex flex-col justify-between group">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 border border-sky-200">{s.classGrade}</span>
                  <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border ${s.feesStatus === 'PAID' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    Shulk: {s.feesStatus}
                  </span>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-1">{s.name} <span className="text-xs text-gray-400 font-bold ml-1">({s.age}y)</span></h3>
                
                <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 mt-4 space-y-1.5 text-xs font-bold text-gray-600">
                  <p className="flex items-center gap-2"><Users size={14} className="text-gray-400"/> Parent: {s.parentName || 'N/A'}</p>
                  <p className="flex items-center gap-2"><Phone size={14} className="text-gray-400"/> {s.phone || 'N/A'}</p>
                </div>
              </div>
              {isManagerOrAdmin && (
                <div className="pt-4 mt-4 border-t border-gray-100 flex justify-end">
                  <button onClick={() => handleDelete(s.id, s.name, 'STUDENT')} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 size={16}/></button>
                </div>
              )}
            </div>
          )) : (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
              <GraduationCap size={40} className="mx-auto mb-3 opacity-30 text-sky-600"/>
              <p className="text-lg font-black text-gray-800 mb-1">No Vidyarthi Found.</p>
              <p className="text-xs uppercase tracking-widest">Enroll students to build your academy roster.</p>
            </div>
          )
        )}

        {/* ACHARYAS TAB */}
        {activeTab === 'ACHARYAS' && (
          filteredAcharyas.length > 0 ? filteredAcharyas.map(a => (
            <div key={a.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow flex flex-col justify-between group">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1"><BookOpen size={12}/> Faculty</span>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-1">Acharya {a.name}</h3>
                <p className="text-xs font-bold text-sky-600">{a.subject}</p>
                
                <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 mt-4 space-y-1.5 text-xs font-bold text-gray-600">
                  {a.qualification && <p className="truncate">🎓 Qual: {a.qualification}</p>}
                  {a.experience && <p className="truncate">⏳ Exp: {a.experience}</p>}
                  <p className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-2"><Phone size={14} className="text-gray-400"/> {a.phone || 'N/A'}</p>
                </div>
              </div>
              {isManagerOrAdmin && (
                <div className="pt-4 mt-4 border-t border-gray-100 flex justify-end">
                  <button onClick={() => handleDelete(a.id, a.name, 'ACHARYA')} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 size={16}/></button>
                </div>
              )}
            </div>
          )) : (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
              <ShieldCheck size={40} className="mx-auto mb-3 opacity-30 text-indigo-600"/>
              <p className="text-lg font-black text-gray-800 mb-1">No Acharyas Found.</p>
              <p className="text-xs uppercase tracking-widest">Onboard teaching faculty to manage classes.</p>
            </div>
          )
        )}
      </div>

      {/* MODALS */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sky-600 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">{activeTab === 'STUDENTS' ? 'Enroll Vidyarthi' : 'Onboard Acharya'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveData} className="p-6 overflow-y-auto space-y-4 flex-1 scrollbar-hide">
              {activeTab === 'STUDENTS' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Student Full Name *</label>
                    <input type="text" required value={studentForm.name} onChange={e=>setStudentForm({...studentForm, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="e.g. Anand Sharma"/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Class / Grade *</label>
                      <input type="text" required value={studentForm.classGrade} onChange={e=>setStudentForm({...studentForm, classGrade: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="e.g. Prathama (Grade 1)"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Age</label>
                      <input type="number" value={studentForm.age} onChange={e=>setStudentForm({...studentForm, age: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="e.g. 10"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Parent Name</label>
                      <input type="text" value={studentForm.parentName} onChange={e=>setStudentForm({...studentForm, parentName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="Father/Mother Name"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Contact Phone</label>
                      <input type="tel" value={studentForm.phone} onChange={e=>setStudentForm({...studentForm, phone: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="+8801..."/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Shulk (Fees) Status</label>
                    <select value={studentForm.feesStatus} onChange={e=>setStudentForm({...studentForm, feesStatus: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500 cursor-pointer">
                      <option value="PAID">Paid (Clear)</option>
                      <option value="PENDING">Pending (Due)</option>
                      <option value="SCHOLARSHIP">Scholarship (Free)</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Acharya Full Name *</label>
                    <input type="text" required value={acharyaForm.name} onChange={e=>setAcharyaForm({...acharyaForm, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="e.g. Pt. Ramchandra"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Subject / Specialization *</label>
                    <input type="text" required value={acharyaForm.subject} onChange={e=>setAcharyaForm({...acharyaForm, subject: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="e.g. Veda & Sanskrit"/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Qualifications</label>
                      <input type="text" value={acharyaForm.qualification} onChange={e=>setAcharyaForm({...acharyaForm, qualification: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="e.g. Acharya Degree"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Experience</label>
                      <input type="text" value={acharyaForm.experience} onChange={e=>setAcharyaForm({...acharyaForm, experience: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="e.g. 10 Years"/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Contact Phone</label>
                    <input type="tel" value={acharyaForm.phone} onChange={e=>setAcharyaForm({...acharyaForm, phone: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500" placeholder="+8801..."/>
                  </div>
                </>
              )}

              <button type="submit" disabled={submitting} className="w-full py-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-4 transition-all hover:-translate-y-0.5">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : (activeTab === 'STUDENTS' ? 'Enroll Vidyarthi' : 'Add Acharya')}
              </button>
            </form>
          </div>
        </div>, document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Shiksha Desk
      </div>
    </div>
  );
}