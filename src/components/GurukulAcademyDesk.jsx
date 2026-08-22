import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  GraduationCap, BookOpen, Users, Calendar, Plus, X, Loader2, 
  HelpCircle, Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Sparkles, ShieldCheck, Heart
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function GurukulAcademyDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  // ✨ Dynamic Institution Label mapping for all 8 Organization Types
  const institutionLabel = useMemo(() => {
    switch (String(workspaceType || '').toUpperCase()) {
      case 'GOSHALA': return 'Goshala';
      case 'SANGHA': return 'Sangha';
      case 'ASHRAM': return 'Ashram';
      case 'GURUKUL': return 'Gurukul';
      case 'SATSANG': return 'Satsang';
      case 'YOGA': return 'Yoga Center';
      case 'TRUST': return 'Trust';
      case 'TIRTH': return 'Tirth / Dham';
      case 'MANDIR':
      default: return 'Mandir';
    }
  }, [workspaceType]);

  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [students, setStudents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_students_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Student Form State
  const [studentForm, setStudentForm] = useState({
    studentName: '',
    courseName: 'Vedic Sanskrit & Grammar',
    guardianName: '',
    phone: '',
    age: '14'
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_gurukul_academy', { workspace_type: workspaceType });

    const studRef = ref(db, `communities/${session.communityId}/gurukul_students`);
    const unsub = onValue(studRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ studentId: k, ...data[k] }));
        list.sort((a, b) => (b.enrolledAt || 0) - (a.enrolledAt || 0));
        setStudents(list);
        localStorage.setItem(`sb_students_${session.communityId}`, JSON.stringify(list));
      } else {
        setStudents([]);
        localStorage.removeItem(`sb_students_${session.communityId}`);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsub(); clearTimeout(failsafe); };
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
    try {
      await push(ref(db, `communities/${session.communityId}/audit_logs`), {
        managerName: session.userName, actionType, description, timestamp: Date.now()
      });
    } catch (e) {}
  };

  // ➕ Enroll Student
  const handleSaveStudent = async (e) => {
    e.preventDefault();
    if (!studentForm.studentName.trim() || !studentForm.courseName.trim()) {
      return showToast("Student Name and Course are required.", "error");
    }

    setSubmitting(true);
    try {
      const studKey = `STUD-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...studentForm,
        studentId: studKey,
        enrolledAt: timestamp,
        enrolledBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/gurukul_students/${studKey}`] = payload;

      await executeSafeUpdate(updates, "Student successfully enrolled in academy!");
      logAudit("STUDENT_ENROLLED", `Enrolled student: ${studentForm.studentName} in ${studentForm.courseName}`);

      setShowModal(false);
      setStudentForm({ studentName: '', courseName: 'Vedic Sanskrit & Grammar', guardianName: '', phone: '', age: '14' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full">

      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'error' ? 'Error' : 'Success'}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <GraduationCap className="text-sanatani-orange" size={32} /> {institutionLabel} Gurukul & Academy Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Manage student enrollments, Sanskrit and Vedic course registers, and attendance tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Enroll Student
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Gurukul Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Preserve and impart sacred knowledge. Register students into structured Vedic, Sanskrit, or yoga courses to maintain clean institutional records.
          </p>
        </div>
      )}

      {/* STUDENTS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {students.length > 0 ? (
          students.map(stud => (
            <div key={stud.studentId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                    {stud.courseName}
                  </span>
                  <span className="text-xs font-bold text-gray-400">Age: {stud.age} yrs</span>
                </div>

                <div>
                  <h3 className="text-2xl font-black text-gray-900">{stud.studentName}</h3>
                  <p className="text-xs font-bold text-gray-500 mt-0.5">Guardian: {stud.guardianName || 'N/A'}</p>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs font-bold text-gray-600">
                  <p>📞 Phone: {stud.phone || 'N/A'}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
            <GraduationCap size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
            <p className="text-lg font-black text-gray-800 mb-1">No students enrolled in academy.</p>
            <p className="text-xs uppercase tracking-widest">Click 'Enroll Student' to add learners to courses.</p>
          </div>
        )}
      </div>

      {/* MODAL: ENROLL STUDENT */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Enroll Student in Academy</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveStudent} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Student Full Name *</label>
                <input type="text" required value={studentForm.studentName} onChange={e=>setStudentForm({...studentForm, studentName: e.target.value})} placeholder="e.g. Anand Sharma" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Course / Class *</label>
                  <select value={studentForm.courseName} onChange={e=>setStudentForm({...studentForm, courseName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Vedic Sanskrit & Grammar">Vedic Sanskrit & Grammar</option>
                    <option value="Bhagavad Gita Study Circle">Bhagavad Gita Study Circle</option>
                    <option value="Yogic Sadhana & Pranayama">Yogic Sadhana & Pranayama</option>
                    <option value="Karmakand & Puja Vidhi">Karmakand & Puja Vidhi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Age</label>
                  <input type="number" value={studentForm.age} onChange={e=>setStudentForm({...studentForm, age: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Guardian Name</label>
                  <input type="text" value={studentForm.guardianName} onChange={e=>setStudentForm({...studentForm, guardianName: e.target.value})} placeholder="Parent / Guardian" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Phone Number</label>
                  <input type="tel" value={studentForm.phone} onChange={e=>setStudentForm({...studentForm, phone: e.target.value})} placeholder="017..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Complete Student Enrollment'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Gurukul Academy Desk
      </div>
    </div>
  );
}
