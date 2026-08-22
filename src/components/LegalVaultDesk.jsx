import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  Shield, Lock, FileCheck, Calendar, Plus, X, Loader2, 
  HelpCircle, Lightbulb, CheckCircle2, AlertTriangle, WifiOff, Sparkles, FileText, Heart
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function LegalVaultDesk({ session, isOnline = navigator.onLine }) {
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
  const [documents, setDocuments] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_vault_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [toast, setToast] = useState(null);

  // Document Form State
  const [docForm, setDocForm] = useState({
    title: '',
    category: 'Trust Bylaws & Deed',
    documentUrl: '',
    expiryDate: '',
    notes: ''
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_legal_vault', { workspace_type: workspaceType });

    const vaultRef = ref(db, `communities/${session.communityId}/legal_vault`);
    const unsub = onValue(vaultRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ docId: k, ...data[k] }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setDocuments(list);
        localStorage.setItem(`sb_vault_${session.communityId}`, JSON.stringify(list));
      } else {
        setDocuments([]);
        localStorage.removeItem(`sb_vault_${session.communityId}`);
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

  // ➕ Register Legal Document
  const handleSaveDocument = async (e) => {
    e.preventDefault();
    if (!docForm.title.trim()) {
      return showToast("Document Title is required.", "error");
    }

    setSubmitting(true);
    try {
      const docKey = `DOC-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...docForm,
        docId: docKey,
        timestamp: timestamp,
        uploadedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/legal_vault/${docKey}`] = payload;

      await executeSafeUpdate(updates, "Legal document securely registered in vault!");
      logAudit("VAULT_DOC_ADDED", `Secured document: ${docForm.title}`);

      setShowModal(false);
      setDocForm({ title: '', category: 'Trust Bylaws & Deed', documentUrl: '', expiryDate: '', notes: '' });
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
            <Shield className="text-sanatani-orange" size={32} /> {institutionLabel} Legal Vault & Deed Registry
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Securely store land deeds, trust bylaws, government approvals, and audit reports with strict access logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Secure New Document
            </button>
          )}
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Legal Vault Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Institutional longevity depends on legal clarity. Keep all registration deeds and audit documents encrypted and accessible exclusively to verified committee executives.
          </p>
        </div>
      )}

      {/* DOCUMENTS GRID */}
      <div className="space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <FileCheck size={18} className="text-sanatani-orange"/> Secured Legal Documents ({documents.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {documents.length > 0 ? (
            documents.map(doc => (
              <div key={doc.docId} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                      {doc.category}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">ID: {doc.docId}</span>
                  </div>

                  <div>
                    <h4 className="text-xl font-black text-gray-900">{doc.title}</h4>
                    {doc.expiryDate && <p className="text-xs font-bold text-red-600 mt-1">Expiry/Renewal: {doc.expiryDate}</p>}
                  </div>

                  {doc.notes && <p className="text-xs text-gray-600 italic">{doc.notes}</p>}
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-bold">Uploaded by: {doc.uploadedBy}</span>
                  {doc.documentUrl && (
                    <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer" className="bg-gray-900 text-white px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                      View File ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
              <Shield size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
              <p className="text-lg font-black text-gray-800 mb-1">No legal documents secured in vault.</p>
              <p className="text-xs uppercase tracking-widest">Click 'Secure New Document' to upload institutional deeds.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: SECURE DOCUMENT */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Secure Legal Document</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveDocument} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Document Title *</label>
                <input type="text" required value={docForm.title} onChange={e=>setDocForm({...docForm, title: e.target.value})} placeholder="e.g. Mandir Land Registry Deed (1998)" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Category</label>
                  <select value={docForm.category} onChange={e=>setDocForm({...docForm, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Trust Bylaws & Deed">Trust Bylaws & Deed</option>
                    <option value="Land & Property Deed">Land & Property Deed</option>
                    <option value="Government Tax Exemption">Government Tax Exemption</option>
                    <option value="Annual Audit Report">Annual Audit Report</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Expiry / Renewal Date</label>
                  <input type="date" value={docForm.expiryDate} onChange={e=>setDocForm({...docForm, expiryDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Document / Cloud Storage URL</label>
                <input type="url" value={docForm.documentUrl} onChange={e=>setDocForm({...docForm, documentUrl: e.target.value})} placeholder="https://drive.google.com/..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Summary / Notes</label>
                <textarea rows="3" value={docForm.notes} onChange={e=>setDocForm({...docForm, notes: e.target.value})} placeholder="Key details regarding survey numbers, trustees, or terms..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none resize-none"></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Secure Document in Vault'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Legal Vault Desk
      </div>
    </div>
  );
}
