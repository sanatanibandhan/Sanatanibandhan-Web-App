import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push } from 'firebase/database';
import { db } from '../firebase';
import { 
  BookOpen, Bookmark, CheckCircle2, AlertTriangle, WifiOff, Loader2, 
  Plus, Search, X, Heart, User, Calendar, ShieldCheck, Sparkles, BookMarked
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

const DEFAULT_GRANTHS = [
  { id: 'GRANTH-01', title: 'Srimad Bhagavad Gita (Gita Press)', category: 'Itihasa & Philosophy', author: 'Maharshi Vyasa', totalCopies: 10, availableCopies: 8 },
  { id: 'GRANTH-02', title: 'Rigveda Samhita (Complete)', category: 'Vedas & Upanishads', author: 'Vedic Rishis', totalCopies: 3, availableCopies: 2 },
  { id: 'GRANTH-03', title: 'Sri Ramacharitamanas', category: 'Itihasa & Philosophy', author: 'Goswami Tulsidas', totalCopies: 15, availableCopies: 12 },
  { id: 'GRANTH-04', title: 'Upanishad Rahasya', category: 'Vedas & Upanishads', author: 'Ancient Sages', totalCopies: 5, availableCopies: 5 }
];

export default function GranthLibraryDesk({ session, isOnline = navigator.onLine }) {
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
      case 'MANDIR':
      default: return 'Mandir';
    }
  }, [workspaceType]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('CATALOG'); // 'CATALOG' | 'LOANS'
  const [showBookModal, setShowBookModal] = useState(false);
  const [issueModal, setIssueModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // 💾 Offline Cached States
  const [granths, setGranths] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_granths_${session?.communityId}`)) || DEFAULT_GRANTHS; } catch { return DEFAULT_GRANTHS; }
  });
  const [loans, setLoans] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`sb_granth_loans_${session?.communityId}`)) || []; } catch { return []; }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  // Book Form State
  const [bookForm, setBookForm] = useState({
    title: '',
    category: 'Vedas & Upanishads',
    author: '',
    totalCopies: '5'
  });

  // Issue Form State
  const [issueForm, setIssueForm] = useState({
    borrowerName: session?.userName || '',
    phone: '',
    dueDate: ''
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_granth_library', { workspace_type: workspaceType });

    const granthRef = ref(db, `communities/${session.communityId}/granth_catalog`);
    const unsubGranth = onValue(granthRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setGranths(list);
        localStorage.setItem(`sb_granths_${session.communityId}`, JSON.stringify(list));
      }
    });

    const loanRef = ref(db, `communities/${session.communityId}/granth_loans`);
    const unsubLoan = onValue(loanRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ loanId: k, ...data[k] }));
        list.sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));
        setLoans(list);
        localStorage.setItem(`sb_granth_loans_${session.communityId}`, JSON.stringify(list));
      } else {
        setLoans([]);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubGranth(); unsubLoan(); clearTimeout(failsafe); };
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

  // ➕ Add New Book to Catalog
  const handleSaveBook = async (e) => {
    e.preventDefault();
    if (!bookForm.title.trim() || !bookForm.author.trim()) {
      return showToast("Book Title and Author are required.", "error");
    }

    setSubmitting(true);
    try {
      const bookKey = `GRANTH-${Math.floor(1000 + Math.random() * 9000)}`;
      const copies = parseInt(bookForm.totalCopies) || 5;

      const payload = {
        ...bookForm,
        id: bookKey,
        totalCopies: copies,
        availableCopies: copies,
        addedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/granth_catalog/${bookKey}`] = payload;

      await executeSafeUpdate(updates, "Sacred text successfully added to library catalog!");
      logAudit("GRANTH_ADDED", `Added book: ${bookForm.title}`);

      setShowBookModal(false);
      setBookForm({ title: '', category: 'Vedas & Upanishads', author: '', totalCopies: '5' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 📖 Issue Book to Reader
  const handleIssueBookSubmit = async (e) => {
    e.preventDefault();
    if (!issueModal) return;
    if (!issueForm.borrowerName.trim() || !issueForm.dueDate) {
      return showToast("Borrower Name and Due Date are required.", "error");
    }

    if (issueModal.availableCopies <= 0) {
      return showToast("No available copies left for this text.", "error");
    }

    setSubmitting(true);
    try {
      const loanKey = `LOAN-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = Date.now();

      const payload = {
        ...issueForm,
        loanId: loanKey,
        bookId: issueModal.id,
        bookTitle: issueModal.title,
        issuedAt: timestamp,
        status: 'ISSUED',
        issuedBy: session.userName
      };

      const updates = {};
      updates[`communities/${session.communityId}/granth_loans/${loanKey}`] = payload;
      updates[`communities/${session.communityId}/granth_catalog/${issueModal.id}/availableCopies`] = issueModal.availableCopies - 1;

      await executeSafeUpdate(updates, "Sacred text successfully issued to reader!");
      logAudit("GRANTH_ISSUED", `Issued '${issueModal.title}' to ${issueForm.borrowerName}`);

      setIssueModal(null);
      setIssueForm({ borrowerName: session?.userName || '', phone: '', dueDate: '' });
      setActiveTab('LOANS');
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredGranths = useMemo(() => {
    return granths.filter(g => 
      g.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [granths, searchTerm]);

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
            <BookMarked className="text-sanatani-orange" size={32} /> {institutionLabel} Sacred Library & Granth Registry
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Catalog Vedas, Upanishads, and scriptures, manage lending, and track return dates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner border">
            <button onClick={() => setActiveTab('CATALOG')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'CATALOG' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500'}`}>
              Catalog ({granths.length})
            </button>
            <button onClick={() => setActiveTab('LOANS')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LOANS' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500'}`}>
              Active Loans ({loans.length})
            </button>
          </div>

          {isManagerOrAdmin && activeTab === 'CATALOG' && (
            <button onClick={() => setShowBookModal(true)} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
              <Plus size={16}/> Add New Book
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CATALOG                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'CATALOG' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Search Bar */}
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by title, author, category..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-sanatani-orange shadow-sm"
            />
          </div>

          {/* Granths Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredGranths.length > 0 ? (
              filteredGranths.map(book => (
                <div key={book.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-orange-50 text-sanatani-orange border border-orange-200">
                        {book.category}
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${book.availableCopies > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {book.availableCopies} / {book.totalCopies} Available
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-black text-gray-900">{book.title}</h3>
                      <p className="text-xs font-bold text-gray-500 mt-0.5">Author/Compiler: {book.author}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <button 
                      onClick={() => setIssueModal(book)}
                      disabled={book.availableCopies <= 0}
                      className="w-full bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all"
                    >
                      {book.availableCopies > 0 ? 'Issue Book to Reader' : 'Out of Stock'}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
                <BookOpen size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
                <p className="text-lg font-black text-gray-800 mb-1">No sacred texts found in catalog.</p>
                <p className="text-xs uppercase tracking-widest">Click 'Add New Book' to register scriptures.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACTIVE LOANS                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'LOANS' && (
        <div className="space-y-4 animate-in fade-in max-w-4xl mx-auto">
          <h3 className="text-xl font-black text-gray-900">Active Book Loans ({loans.length})</h3>

          <div className="space-y-3">
            {loans.length > 0 ? (
              loans.map(loan => (
                <div key={loan.loanId} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border">{loan.status}</span>
                    <h4 className="font-black text-gray-900 text-base pt-1">{loan.bookTitle}</h4>
                    <p className="text-xs text-gray-600 font-bold">Borrower: <span className="text-sanatani-orange">{loan.borrowerName}</span> • Due Date: {loan.dueDate}</p>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">ID: {loan.loanId}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-3xl border border-gray-100">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No active book loans recorded.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD BOOK */}
      {showBookModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Add Sacred Text to Library</h3>
              <button onClick={() => setShowBookModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleSaveBook} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Book Title *</label>
                <input type="text" required value={bookForm.title} onChange={e=>setBookForm({...bookForm, title: e.target.value})} placeholder="e.g. Srimad Bhagavata Purana" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Author / Rishi *</label>
                  <input type="text" required value={bookForm.author} onChange={e=>setBookForm({...bookForm, author: e.target.value})} placeholder="e.g. Maharshi Vyasa" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Category</label>
                  <select value={bookForm.category} onChange={e=>setBookForm({...bookForm, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer">
                    <option value="Vedas & Upanishads">Vedas & Upanishads</option>
                    <option value="Itihasa & Philosophy">Itihasa & Philosophy</option>
                    <option value="Stotras & Chants">Stotras & Chants</option>
                    <option value="Dharma Shastra">Dharma Shastra</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Total Copies</label>
                <input type="number" required value={bookForm.totalCopies} onChange={e=>setBookForm({...bookForm, totalCopies: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Save Book to Catalog'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: ISSUE BOOK */}
      {issueModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-sanatani-orange flex flex-col p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">Issue Book</h3>
                <p className="text-xs text-sanatani-orange font-bold truncate max-w-[280px]">{issueModal.title}</p>
              </div>
              <button onClick={() => setIssueModal(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handleIssueBookSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Borrower Name *</label>
                <input type="text" required value={issueForm.borrowerName} onChange={e=>setIssueForm({...issueForm, borrowerName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Phone Number</label>
                <input type="tel" value={issueForm.phone} onChange={e=>setIssueForm({...issueForm, phone: e.target.value})} placeholder="017..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Return Due Date *</label>
                <input type="date" required value={issueForm.dueDate} onChange={e=>setIssueForm({...issueForm, dueDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none" />
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg mt-2">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Confirm Issue & Update Stock'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Granth Library Desk
      </div>
    </div>
  );
}
