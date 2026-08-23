import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, update } from 'firebase/database';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { 
  Banknote, TrendingDown, TrendingUp, Search, Filter, 
  Download, Plus, Camera, Loader2, X, AlertTriangle, 
  CheckCircle2, WifiOff, FileDigit, CalendarDays, Receipt, 
  FileText, ZoomIn, Package, Box, Flame, Sparkles, User
} from 'lucide-react';
import { generateTreasuryReportPdf, generateReceiptPdf } from '../utils/pdfGenerator';
import { usePlanGate } from '../hooks/usePlanGate';

export default function TreasuryLedger({ session, isOnline = navigator.onLine }) {
  const { t, language, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('INCOME'); // 'INCOME' | 'EXPENSE' | 'ASSETS' | 'INVENTORY'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data States
  const [incomeLogs, setIncomeLogs] = useState([]);
  const [expenseLogs, setExpenseLogs] = useState([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Modals & Forms
  const [showFormModal, setShowFormModal] = useState(false);
  const [formType, setFormType] = useState('INCOME'); // 'INCOME' | 'EXPENSE'
  const [submitting, setSubmitting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Form Data
  const [formData, setFormData] = useState({
    amount: '', note: '', name: '', paymentMethod: 'CASH', memoUrl: ''
  });
  const photoRef = useRef(null);

  // Toast & Confirm
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const curSymbol = session?.currency?.symbol || '৳';
  const isStaff = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  // ✨ FAIL-SAFE TRANSLATION HELPER
  const safeTranslate = (key, fallbackEn, fallbackBn, fallbackHi) => {
    const trans = t(key);
    if (trans !== key && trans) return trans;
    if (language === 'bn') return fallbackBn;
    if (language === 'hi') return fallbackHi;
    return fallbackEn;
  };

  // ✨ DYNAMIC TERMINOLOGY (Fixes the ReferenceError crash)
  const incomeTabLabel = useMemo(() => safeTranslate('tab_chanda', 'Income / Chanda', 'তহবিল সংগ্রহ', 'चंदा/आय'), [language, t]);
  const expenseTabLabel = useMemo(() => safeTranslate('tab_expenses', 'Expenses', 'ব্যয়', 'खर्च'), [language, t]);
  const assetTabLabel = useMemo(() => safeTranslate('nav_assets', 'Assets & Records', 'সম্পদ ও রেকর্ড', 'संपत्ति और रिकॉर्ड'), [language, t]);
  const inventoryTabLabel = useMemo(() => safeTranslate('nav_inventory', 'Store & Inventory', 'স্টোর ও ইনভেন্টরি', 'स्टोर और इन्वेंटरी'), [language, t]);

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_treasury', { workspace_type: workspaceType });

    const incRef = ref(db, `communities/${session.communityId}/logs/Donation`);
    const expRef = ref(db, `communities/${session.communityId}/logs/Expense`);

    const unsubInc = onValue(incRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        arr.sort((a, b) => b.timestamp - a.timestamp);
        setIncomeLogs(arr);
      } else setIncomeLogs([]);
    });

    const unsubExp = onValue(expRef, (snap) => {
      if (snap.exists()) {
        const arr = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] }));
        arr.sort((a, b) => b.timestamp - a.timestamp);
        setExpenseLogs(arr);
      } else setExpenseLogs([]);
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubInc(); unsubExp(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(successMsg ? successMsg + ' (Saved Offline)' : safeTranslate('offline_saved', 'Action cached offline.', 'অফলাইনে সেভ করা হয়েছে।', 'ऑफ़लाइन सहेजा गया।'), 'offline');
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

  const handleMemoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      // ✨ ZERO COST CANVAS COMPRESSION ENGINE
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 600; // Good balance for reading text on memos
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }

        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        setFormData(prev => ({ ...prev, memoUrl: compressedBase64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isStaff) return showToast(safeTranslate('err_unauthorized', 'Unauthorized.'), 'error');
    if (!formData.amount || !formData.note) return showToast(safeTranslate('err_all_fields_req', 'Amount and Note are required.'), 'error');

    setSubmitting(true);
    try {
      const amt = parseFloat(formData.amount);
      const ts = Date.now();
      const isIncome = formType === 'INCOME';
      const path = isIncome ? 'Donation' : 'Expense';
      
      const transId = push(ref(db, `communities/${session.communityId}/logs/${path}`)).key;
      const updates = {};
      
      const basePayload = {
        id: transId,
        amount: amt,
        note: formData.note.trim() + ` | Via: ${formData.paymentMethod}`,
        timestamp: ts,
        paymentMethod: formData.paymentMethod,
        collector: `${session.userName} (${session.uid})`,
        role: session.role
      };

      if (isIncome) {
        basePayload.name = formData.name.trim() || 'Anonymous Devotee';
      } else {
        basePayload.itemName = formData.name.trim() || 'General Expense';
        if (formData.memoUrl) basePayload.memoUrl = formData.memoUrl;
      }

      updates[`communities/${session.communityId}/logs/${path}/${transId}`] = basePayload;

      // Audit Log
      const auditId = push(ref(db, `communities/${session.communityId}/audit_logs`)).key;
      updates[`communities/${session.communityId}/audit_logs/${auditId}`] = {
        id: auditId,
        actionType: isIncome ? 'INCOME_LOGGED' : 'EXPENSE_LOGGED',
        managerName: session.userName,
        description: `Logged ${curSymbol}${amt} for ${formData.note}`,
        timestamp: ts
      };

      await executeSafeUpdate(updates, `${curSymbol}${amt} ${safeTranslate('recorded_success', 'recorded successfully!')}`);
      pushToDataLayer('treasury_transaction', { type: formType, amount: amt });

      setConfirmDialog({
        title: safeTranslate('btn_confirm_chanda', 'Transaction Confirmed'),
        message: `Would you like to download the official PDF voucher for this ${isIncome ? 'income' : 'expense'}?`,
        confirmText: safeTranslate('download_receipt', 'Download PDF'),
        isDanger: false,
        onConfirm: async () => {
          setConfirmDialog(null);
          await generateReceiptPdf(session.communityName, basePayload, formType);
        }
      });

      setShowFormModal(false);
      setFormData({ amount: '', note: '', name: '', paymentMethod: 'CASH', memoUrl: '' });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadMasterReport = async () => {
    try {
      pushToDataLayer('export_master_treasury', { type: activeTab });
      const currentList = activeTab === 'INCOME' ? filteredIncome : filteredExpense;
      const totalAmt = currentList.reduce((sum, item) => sum + (item.amount || 0), 0);
      
      const dummyGroup = [{ history: currentList }];
      await generateTreasuryReportPdf(dummyGroup, activeTab, session.communityName, totalAmt, dateRange);
      showToast("Master Report Generated Successfully!");
    } catch (e) {
      showToast("Error generating report: " + e.message, "error");
    }
  };

  // Filters & Calculations
  const filteredIncome = useMemo(() => {
    return incomeLogs.filter(log => {
      const matchSearch = (log.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (log.note || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchDate = (!dateRange.start || log.timestamp >= new Date(dateRange.start).getTime()) && (!dateRange.end || log.timestamp <= new Date(dateRange.end).setHours(23,59,59,999));
      return matchSearch && matchDate;
    });
  }, [incomeLogs, searchTerm, dateRange]);

  const filteredExpense = useMemo(() => {
    return expenseLogs.filter(log => {
      const matchSearch = (log.itemName || '').toLowerCase().includes(searchTerm.toLowerCase()) || (log.note || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchDate = (!dateRange.start || log.timestamp >= new Date(dateRange.start).getTime()) && (!dateRange.end || log.timestamp <= new Date(dateRange.end).setHours(23,59,59,999));
      return matchSearch && matchDate;
    });
  }, [expenseLogs, searchTerm, dateRange]);

  const totalIncome = incomeLogs.reduce((sum, item) => sum + (item.amount || 0), 0);
  const totalExpense = expenseLogs.reduce((sum, item) => sum + (item.amount || 0), 0);
  const netBalance = totalIncome - totalExpense;

  const displayList = activeTab === 'INCOME' ? filteredIncome : filteredExpense;

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full flex flex-col min-h-[90vh]">

      {/* ✨ TOAST PORTAL */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'offline' ? 'bg-orange-500/20 text-sanatani-orange' : toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'offline' ? <WifiOff size={20}/> : toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'offline' ? 'text-orange-400' : toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'offline' ? 'Offline Cache' : toast.type === 'error' ? safeTranslate('error', 'Error') : safeTranslate('success', 'Success')}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>, document.body
      )}

      {/* ✨ CONFIRMATION DIALOG PORTAL */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center border-t-4 border-sanatani-orange">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner ${confirmDialog.isDanger ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
              {confirmDialog.isDanger ? <AlertTriangle size={32}/> : <CheckCircle2 size={32}/>}
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-sm">{safeTranslate('btn_cancel', 'Cancel')}</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* LIGHTBOX PORTAL FOR MEMOS */}
      {lightboxImage && createPortal(
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[11000] flex items-center justify-center p-4">
          <button onClick={() => setLightboxImage(null)} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"><X size={24}/></button>
          <img src={lightboxImage} alt="Memo Proof" className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95" />
        </div>, document.body
      )}

      {/* HEADER MATRIX */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden ring-1 ring-white/10 shrink-0">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10 pointer-events-none transform rotate-12">
           <Banknote size={250} className="text-white"/>
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full border border-white/20 backdrop-blur-md mb-3 inline-block text-green-300 shadow-sm">
              <ShieldCheck size={10} className="inline mr-1 mb-0.5"/> Audited Financials
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
              {safeTranslate('nav_treasury', 'Treasury & Ledger', 'ট্রেজারি লেজার', 'ट्रेजरी लेजर')}
            </h2>
            <p className="text-sm font-bold text-gray-400 mt-2 max-w-xl leading-relaxed">
              Cryptographically secure double-entry accounting. Download master PDFs and capture physical memos directly into the immutable ledger.
            </p>
          </div>

          <div className="flex gap-3 w-full lg:w-auto">
            {isStaff && (
              <>
                <button onClick={() => { setFormType('EXPENSE'); setShowFormModal(true); }} className="flex-1 sm:flex-none bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 text-red-100 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all backdrop-blur-md hover:-translate-y-0.5">
                  <TrendingDown size={16}/> {safeTranslate('btn_record_expense', 'Record Expense', 'ব্যয় রেকর্ড করুন', 'खर्च दर्ज करें')}
                </button>
                <button onClick={() => { setFormType('INCOME'); setShowFormModal(true); }} className="flex-1 sm:flex-none bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5">
                  <TrendingUp size={16}/> {safeTranslate('btn_record_chanda', 'Record Income', 'আয় রেকর্ড করুন', 'आय दर्ज करें')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between group">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total {incomeTabLabel}</p>
            <p className="text-3xl font-black text-gray-900 tracking-tight">{curSymbol}{totalIncome.toLocaleString()}</p>
          </div>
          <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center border border-green-100 shadow-inner group-hover:scale-110 transition-transform"><TrendingUp size={24}/></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between group">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total {expenseTabLabel}</p>
            <p className="text-3xl font-black text-gray-900 tracking-tight">{curSymbol}{totalExpense.toLocaleString()}</p>
          </div>
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center border border-red-100 shadow-inner group-hover:scale-110 transition-transform"><TrendingDown size={24}/></div>
        </div>
        <div className={`p-6 rounded-3xl border shadow-sm flex items-center justify-between group ${netBalance >= 0 ? 'bg-gradient-to-br from-green-50 to-emerald-100 border-green-200' : 'bg-gradient-to-br from-red-50 to-rose-100 border-red-200'}`}>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${netBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>Net Balance</p>
            <p className={`text-3xl font-black tracking-tight ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{curSymbol}{Math.abs(netBalance).toLocaleString()}</p>
          </div>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-inner border group-hover:scale-110 transition-transform ${netBalance >= 0 ? 'bg-white text-green-600 border-green-100' : 'bg-white text-red-600 border-red-100'}`}><Banknote size={24}/></div>
        </div>
      </div>

      {/* FILTER & TAB BAR */}
      <div className="flex flex-col xl:flex-row justify-between items-center gap-4 bg-white p-3 rounded-2xl border border-gray-200 shadow-sm shrink-0">
        
        <div className="flex w-full xl:w-auto bg-gray-100/80 p-1.5 rounded-xl overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('INCOME')} className={`flex-1 sm:w-40 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'INCOME' ? 'bg-white text-green-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}>
            <TrendingUp size={14}/> {incomeTabLabel}
          </button>
          <button onClick={() => setActiveTab('EXPENSE')} className={`flex-1 sm:w-40 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'EXPENSE' ? 'bg-white text-red-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}>
            <TrendingDown size={14}/> {expenseTabLabel}
          </button>
          <button onClick={() => setActiveTab('ASSETS')} className={`flex-1 sm:w-40 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'ASSETS' ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}>
            <Box size={14}/> {assetTabLabel}
          </button>
          <button onClick={() => setActiveTab('INVENTORY')} className={`flex-1 sm:w-40 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4 ${activeTab === 'INVENTORY' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-800'}`}>
            <Package size={14}/> {inventoryTabLabel}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder={safeTranslate('search_records', "Search records...")} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-sanatani-orange transition-colors shadow-inner" />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto bg-gray-50 border border-gray-200 p-1.5 rounded-xl shadow-inner overflow-x-auto">
            <Filter size={12} className="text-gray-400 ml-2 hidden sm:block"/>
            <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="p-1 bg-transparent text-[10px] text-gray-700 font-bold outline-none flex-1 min-w-[90px] cursor-pointer" />
            <span className="text-gray-300 font-bold">-</span>
            <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="p-1 bg-transparent text-[10px] text-gray-700 font-bold outline-none flex-1 min-w-[90px] cursor-pointer" />
            {(dateRange.start || dateRange.end) && (
              <button onClick={() => setDateRange({start:'', end:''})} className="bg-gray-200 hover:bg-gray-300 p-1.5 rounded-lg transition-colors mr-1"><X size={12}/></button>
            )}
          </div>

          {(activeTab === 'INCOME' || activeTab === 'EXPENSE') && isStaff && (
            <button onClick={handleDownloadMasterReport} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all hover:-translate-y-0.5 shrink-0">
              <Download size={14}/> Master PDF
            </button>
          )}
        </div>
      </div>

      {/* DATA LIST AREA */}
      {(activeTab === 'INCOME' || activeTab === 'EXPENSE') && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  <th className="p-5 pl-8">Date & Time</th>
                  <th className="p-5">{activeTab === 'INCOME' ? 'Devotee / Source' : 'Item / Service'}</th>
                  <th className="p-5">Note / Particulars</th>
                  <th className="p-5 text-right">Amount</th>
                  <th className="p-5 pr-8 text-center">Documentation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                {displayList.length > 0 ? displayList.map(item => (
                  <tr key={item.id} className="hover:bg-orange-50/30 transition-colors group">
                    <td className="p-5 pl-8 whitespace-nowrap">
                      <p className="text-sm font-black text-gray-900">{new Date(item.timestamp).toLocaleDateString()}</p>
                      <p className="text-[9px] text-gray-400 font-mono tracking-widest mt-0.5">{new Date(item.timestamp).toLocaleTimeString()}</p>
                    </td>
                    <td className="p-5">
                      <p className="text-sm font-black text-gray-900">{activeTab === 'INCOME' ? item.name : item.itemName}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5 flex items-center gap-1"><User size={10}/> Auth: {item.collector?.split(' ')[0] || item.loggedBy?.split(' ')[0] || 'System'}</p>
                    </td>
                    <td className="p-5 max-w-xs">
                      <p className="truncate" title={item.note}>{item.note}</p>
                      <span className="inline-block mt-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-gray-200 shadow-sm">{item.paymentMethod || 'CASH'}</span>
                    </td>
                    <td className={`p-5 text-right font-black text-sm whitespace-nowrap ${activeTab === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                      {activeTab === 'INCOME' ? '+' : '-'}{curSymbol}{item.amount.toLocaleString()}
                    </td>
                    <td className="p-5 pr-8">
                      <div className="flex items-center justify-center gap-2">
                        {activeTab === 'EXPENSE' && item.memoUrl && (
                          <button onClick={() => setLightboxImage(item.memoUrl)} className="p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm border border-blue-100" title="View Uploaded Memo">
                            <Camera size={16}/>
                          </button>
                        )}
                        <button 
                          onClick={() => generateReceiptPdf(session.communityName, item, activeTab)}
                          className="p-2.5 bg-gray-50 border border-gray-200 text-gray-500 hover:bg-sanatani-orange hover:border-sanatani-orange hover:text-white rounded-xl transition-all shadow-sm" title="Download Official Voucher"
                        >
                          <FileDigit size={16}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="p-20 text-center text-gray-400">
                      <Receipt size={48} className="mx-auto mb-4 opacity-20 text-sanatani-orange"/>
                      <p className="text-lg font-black text-gray-800 mb-1">No {activeTab.toLowerCase()} records found.</p>
                      <p className="text-[10px] uppercase tracking-widest font-bold">Adjust filters or record a new transaction.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STUBS FOR ASSETS & INVENTORY */}
      {(activeTab === 'ASSETS' || activeTab === 'INVENTORY') && (
        <div className="flex-1 bg-white rounded-3xl border border-dashed border-gray-300 flex flex-col items-center justify-center p-20 animate-in fade-in shadow-sm">
           {activeTab === 'ASSETS' ? <Box size={64} className="text-gray-300 mb-4"/> : <Package size={64} className="text-gray-300 mb-4"/>}
           <h3 className="text-2xl font-black text-gray-900 mb-2">{activeTab === 'ASSETS' ? assetTabLabel : inventoryTabLabel} Ledger</h3>
           <p className="text-sm font-bold text-gray-500 max-w-md text-center">This specialized ledger module is currently locked in your environment. Contact Master Admin to activate asset and inventory tracking.</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECORD INCOME OR EXPENSE                                           */}
      {/* ========================================================================= */}
      {showFormModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 pt-safe pb-safe">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh] ring-1 ring-white/20">
            
            <div className={`p-6 sm:p-8 flex justify-between items-center shrink-0 border-b-4 ${formType === 'INCOME' ? 'bg-green-50 border-green-500 text-green-900' : 'bg-red-50 border-red-500 text-red-900'}`}>
              <h3 className="text-xl sm:text-2xl font-black flex items-center gap-3 tracking-tight">
                {formType === 'INCOME' ? <TrendingUp size={28}/> : <TrendingDown size={28}/>}
                {formType === 'INCOME' ? safeTranslate('btn_record_chanda', 'Record Income') : safeTranslate('btn_record_expense', 'Record Expense')}
              </h3>
              <button onClick={() => setShowFormModal(false)} className="p-2.5 bg-white/50 hover:bg-white rounded-full transition-colors shadow-sm"><X size={20}/></button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto flex-1 scrollbar-hide">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="bg-gray-50 p-6 rounded-3xl shadow-inner border border-gray-200">
                  <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${formType === 'INCOME' ? 'text-green-700' : 'text-red-700'}`}>Amount ({curSymbol}) *</label>
                  <input type="number" required value={formData.amount} onChange={e=>setFormData({...formData, amount: e.target.value})} className={`w-full p-4 bg-white border-2 rounded-2xl text-3xl font-black outline-none transition-all shadow-sm ${formType === 'INCOME' ? 'border-green-200 text-green-600 focus:border-green-500 focus:ring-4 focus:ring-green-50' : 'border-red-200 text-red-600 focus:border-red-500 focus:ring-4 focus:ring-red-50'}`} placeholder="0.00" autoFocus />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{formType === 'INCOME' ? 'Devotee / Source Name' : 'Item / Service Name'} *</label>
                    <input type="text" required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm" placeholder={formType === 'INCOME' ? 'e.g. Adesh Chandra' : 'e.g. Flower Garland'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Payment Method *</label>
                    <select value={formData.paymentMethod} onChange={e=>setFormData({...formData, paymentMethod: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm cursor-pointer appearance-none">
                      <option value="CASH">CASH</option>
                      <option value="BANK_TRANSFER">BANK TRANSFER</option>
                      <option value="MOBILE_BANKING">MOBILE BANKING</option>
                      <option value="CHEQUE">CHEQUE</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Purpose / Note *</label>
                  <input type="text" required value={formData.note} onChange={e=>setFormData({...formData, note: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm" placeholder="Detailed description of transaction..." />
                </div>

                {/* ZERO-COST CANVAS MEMO UPLOAD (ONLY FOR EXPENSES) */}
                {formType === 'EXPENSE' && (
                  <div className="bg-orange-50/50 border border-orange-100 p-5 rounded-2xl">
                    <label className="block text-[10px] font-black text-orange-800 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Camera size={14}/> Attach Physical Memo (Optional)</label>
                    <div 
                      onClick={() => photoRef.current?.click()}
                      className="w-full border-2 border-dashed border-orange-200 hover:border-orange-400 bg-white rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors"
                    >
                      {formData.memoUrl ? (
                        <div className="relative w-full h-32 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                          <img src={formData.memoUrl} alt="Memo Preview" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <span className="text-white text-xs font-black uppercase tracking-widest">Change Image</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <UploadCloud size={24} className="text-orange-400 mx-auto mb-2"/>
                          <p className="text-xs font-bold text-gray-700">Tap to capture memo</p>
                          <p className="text-[9px] text-gray-500 mt-1">Image will be heavily compressed to save storage.</p>
                        </div>
                      )}
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={photoRef} onChange={handleMemoUpload} />
                  </div>
                )}

                <div className="pt-6 mt-8 border-t border-gray-100">
                  <button type="submit" disabled={submitting} className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest flex justify-center items-center gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 disabled:opacity-50 text-white ${formType === 'INCOME' ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700' : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700'}`}>
                    {submitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20}/>} 
                    {submitting ? 'PROCESSING...' : `CONFIRM ${formType}`}
                  </button>
                  <p className="text-center text-[10px] font-bold text-gray-400 mt-4 uppercase tracking-widest">A cryptographic PDF voucher will be generated.</p>
                </div>

              </form>
            </div>
          </div>
        </div>
      , document.body)}

      {/* 🏛️ ENTERPRISE FOOTER CREDIT */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500 shrink-0">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Master Financial Ledger
      </div>
    </div>
  );
}
