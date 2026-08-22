import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { 
  FileText, Printer, Download, Search, CheckCircle2, AlertTriangle, 
  WifiOff, Loader2, X, Sparkles, Award, ShieldCheck, Heart, Banknote
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function TaxReceiptDesk({ session, isOnline = navigator.onLine }) {
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
  const [donations, setDonations] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState(null);

  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_tax_receipts', { workspace_type: workspaceType });

    const donRef = ref(db, `communities/${session.communityId}/logs/Donation`);
    const unsub = onValue(donRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setDonations(list);
      } else {
        setDonations([]);
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsub(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const filteredDonations = useMemo(() => {
    return donations.filter(d => 
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.note && d.note.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [donations, searchTerm]);

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
            <FileText className="text-sanatani-orange" size={32} /> {institutionLabel} E-Receipt & Tax Certificate Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Generate formal serial-numbered contribution receipts and acknowledgment certificates for patrons.
          </p>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative w-full sm:w-96">
        <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input 
          type="text" 
          placeholder="Search by donor name, note..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-sanatani-orange shadow-sm"
        />
      </div>

      {/* DONATIONS TABLE */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Banknote size={18} className="text-green-600"/> Contribution Ledger Records ({filteredDonations.length})
        </h3>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {filteredDonations.length > 0 ? (
            filteredDonations.map(don => (
              <div key={don.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-green-50 text-green-700 border">{don.category || 'Donation'}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{new Date(don.timestamp).toLocaleDateString()}</span>
                  </div>
                  <h4 className="font-black text-gray-900 text-sm">{don.name}</h4>
                  <p className="text-xs text-gray-600">{don.note || 'General Institutional Contribution'}</p>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                  <span className="text-base font-black text-green-600">{curSymbol}{don.amount?.toLocaleString()}</span>
                  <button 
                    onClick={() => setSelectedReceipt(don)}
                    className="bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <FileText size={14}/> View E-Receipt
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100">
              <FileText size={40} className="mx-auto mb-3 opacity-30 text-sanatani-orange"/>
              <p className="text-lg font-black text-gray-800 mb-1">No contribution records found.</p>
              <p className="text-xs uppercase tracking-widest">Donations logged in the Treasury Desk will appear here.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: PRINTABLE E-RECEIPT */}
      {selectedReceipt && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">Official Institutional E-Receipt</h3>
                <p className="text-xs text-sanatani-orange font-bold">{session.communityName} ({institutionLabel})</p>
              </div>
              <button onClick={() => setSelectedReceipt(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            {/* Receipt Printable Card */}
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 space-y-4 text-xs font-bold text-gray-800">
              <div className="flex justify-between border-b border-gray-200 pb-3">
                <span>Receipt No: <strong className="font-mono text-gray-900">REC-{selectedReceipt.id.substring(0, 6).toUpperCase()}</strong></span>
                <span>Date: {new Date(selectedReceipt.timestamp).toLocaleDateString()}</span>
              </div>

              <div className="space-y-2">
                <p>Received with thanks from: <strong className="text-gray-900 text-sm">{selectedReceipt.name}</strong></p>
                <p>Towards Purpose / Note: <span className="text-gray-600 font-medium">{selectedReceipt.note || 'General Seva'}</span></p>
                <p>Category: <span className="text-sanatani-orange">{selectedReceipt.category || 'Donation'}</span></p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center">
                <span className="uppercase tracking-widest text-[10px] text-gray-400">Total Amount Received</span>
                <span className="text-xl font-black text-green-600">{curSymbol}{selectedReceipt.amount?.toLocaleString()}</span>
              </div>

              <div className="pt-4 border-t border-gray-200 flex justify-between items-end text-[10px] text-gray-500">
                <div>
                  <p className="font-black text-gray-800">{session.communityName}</p>
                  <p>Authorized Signature & Seal</p>
                </div>
                <div className="text-right">
                  <p className="font-mono">Generated via Sanatani Bandhan</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { window.print(); }} className="flex-1 bg-gray-900 hover:bg-black text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md flex items-center justify-center gap-2">
                <Printer size={16}/> Print / Save PDF
              </button>
              <button onClick={() => setSelectedReceipt(null)} className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • E-Receipt Desk
      </div>
    </div>
  );
}
