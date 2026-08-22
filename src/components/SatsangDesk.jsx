import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { 
  Music, Video, FileText, Bus, MapPin, Plus, CheckCircle2, 
  AlertTriangle, Loader2, X, WifiOff, Search, PlayCircle, Users, ExternalLink
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function SatsangDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const [activeTab, setActiveTab] = useState('VAULT'); // 'VAULT' or 'YATRA'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 💾 Data States
  const [vaultItems, setVaultItems] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_satsang_vault_${session?.communityId}`)) || []; } catch { return []; }});
  const [yatras, setYatras] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_satsang_yatras_${session?.communityId}`)) || []; } catch { return []; }});

  // UI Modals
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showYatraModal, setShowYatraModal] = useState(false);

  // Form States
  const [vaultForm, setVaultForm] = useState({ title: '', speaker: '', mediaType: 'VIDEO', link: '', dateStr: new Date().toISOString().split('T')[0] });
  const [yatraForm, setYatraForm] = useState({ destination: '', departureDate: '', totalSeats: 50, bookedSeats: 0, pickupPoint: '' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_satsang_desk', { workspace_type: workspaceType });

    // Sync Pravachan Vault
    const vaultRef = ref(db, `communities/${session.communityId}/satsang_vault`);
    const unsubVault = onValue(vaultRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const vArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.createdAt - a.createdAt);
        setVaultItems(vArray);
        localStorage.setItem(`sb_satsang_vault_${session.communityId}`, JSON.stringify(vArray));
      } else { setVaultItems([]); }
    });

    // Sync Yatras (Transport)
    const yatraRef = ref(db, `communities/${session.communityId}/satsang_yatras`);
    const unsubYatra = onValue(yatraRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const yArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.createdAt - a.createdAt);
        setYatras(yArray);
        localStorage.setItem(`sb_satsang_yatras_${session.communityId}`, JSON.stringify(yArray));
      } else { setYatras([]); }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubVault(); unsubYatra(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const handleSaveVaultItem = async (e) => {
    e.preventDefault();
    if (!isOnline) return showToast("Offline mode.", "error");
    setIsProcessing(true);
    try {
      const vaultId = push(ref(db, `communities/${session.communityId}/satsang_vault`)).key;
      const newItem = { 
        ...vaultForm, 
        createdAt: Date.now(), 
        loggedBy: session.userName 
      };
      await set(ref(db, `communities/${session.communityId}/satsang_vault/${vaultId}`), newItem);
      showToast("Discourse added to the Digital Vault!");
      setShowVaultModal(false);
      setVaultForm({ title: '', speaker: '', mediaType: 'VIDEO', link: '', dateStr: new Date().toISOString().split('T')[0] });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  const handleSaveYatra = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const yatraId = push(ref(db, `communities/${session.communityId}/satsang_yatras`)).key;
      const newYatra = {
        ...yatraForm,
        totalSeats: Number(yatraForm.totalSeats),
        bookedSeats: Number(yatraForm.bookedSeats),
        status: 'SCHEDULED',
        createdAt: Date.now(),
        loggedBy: session.userName
      };
      await set(ref(db, `communities/${session.communityId}/satsang_yatras/${yatraId}`), newYatra);
      pushToDataLayer('generate_lead', { content_type: 'Yatra_Scheduled', value: newYatra.totalSeats });
      showToast("Yatra transport schedule created!");
      setShowYatraModal(false);
      setYatraForm({ destination: '', departureDate: '', totalSeats: 50, bookedSeats: 0, pickupPoint: '' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  const handleUpdateSeats = async (yatraId, currentBooked, totalSeats, increment) => {
    if (!isOnline) return;
    const newBooked = currentBooked + increment;
    if (newBooked < 0 || newBooked > totalSeats) return;
    try {
      await update(ref(db), { [`communities/${session.communityId}/satsang_yatras/${yatraId}/bookedSeats`]: newBooked });
    } catch (e) { showToast(e.message, "error"); }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  const filteredVault = vaultItems.filter(v => 
    v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.speaker.toLowerCase().includes(searchQuery.toLowerCase())
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
            <Music className="text-sanatani-orange" size={26} /> Satsang Coordinator
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Digital discourse library & Yatra transport logistics.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button onClick={() => setActiveTab('VAULT')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'VAULT' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><PlayCircle size={14} className="inline mr-1"/> Pravachan Vault</button>
            <button onClick={() => setActiveTab('YATRA')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'YATRA' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><Bus size={14} className="inline mr-1"/> Yatra & Travel</button>
          </div>

          {isManagerOrAdmin && activeTab === 'VAULT' && (
            <button onClick={() => setShowVaultModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Upload Media
            </button>
          )}
          {isManagerOrAdmin && activeTab === 'YATRA' && (
            <button onClick={() => setShowYatraModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md hover:-translate-y-0.5 transition-transform">
              <Plus size={16}/> Schedule Bus
            </button>
          )}
        </div>
      </div>

      {/* 📹 TAB 1: PRAVACHAN VAULT */}
      {activeTab === 'VAULT' && (
        <div className="flex flex-col h-full space-y-4">
          <div className="relative w-full max-w-md">
             <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
             <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search Kirtan or Speaker..." className="w-full bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl text-sm font-bold focus:border-sanatani-orange outline-none shadow-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-6">
            {filteredVault.map(item => (
              <div key={item.id} className="bg-white border border-gray-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:border-orange-300 transition-colors group">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded border uppercase tracking-widest flex items-center gap-1 ${item.mediaType === 'VIDEO' ? 'bg-red-50 text-red-600 border-red-200' : item.mediaType === 'AUDIO' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                      {item.mediaType === 'VIDEO' ? <Video size={10}/> : item.mediaType === 'AUDIO' ? <Music size={10}/> : <FileText size={10}/>} {item.mediaType}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">{item.dateStr}</span>
                  </div>
                  <h3 className="text-lg font-black text-gray-900 mb-1 leading-tight">{item.title}</h3>
                  <p className="text-xs font-bold text-gray-500 mb-4">By: {item.speaker}</p>
                </div>
                
                <a href={item.link} target="_blank" rel="noreferrer" className="w-full bg-gray-50 hover:bg-sanatani-orange hover:text-white text-gray-600 border border-gray-200 text-xs font-black py-3 rounded-xl uppercase tracking-widest transition-all flex justify-center items-center gap-2 group-hover:border-sanatani-orange">
                  Open Media <ExternalLink size={14}/>
                </a>
              </div>
            ))}
            {filteredVault.length === 0 && (
              <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
                No Satsang media uploaded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🚌 TAB 2: YATRA & TRANSPORT */}
      {activeTab === 'YATRA' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {yatras.map(yatra => {
            const isFull = yatra.bookedSeats >= yatra.totalSeats;
            const fillPercentage = Math.round((yatra.bookedSeats / yatra.totalSeats) * 100);

            return (
              <div key={yatra.id} className="bg-white border border-gray-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="bg-blue-100 text-blue-800 text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest flex items-center gap-1"><Bus size={10}/> {yatra.status}</span>
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-1">{yatra.destination}</h3>
                  
                  <div className="space-y-2 mt-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-xs font-bold text-gray-700 flex items-center gap-2"><MapPin size={14} className="text-gray-400"/> Pick-up: {yatra.pickupPoint}</p>
                    <p className="text-xs font-bold text-gray-700 flex items-center gap-2"><Clock size={14} className="text-gray-400"/> Departs: {yatra.departureDate}</p>
                  </div>

                  <div className="mt-5 mb-2">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                       <span className="text-gray-500">Seat Capacity</span>
                       <span className={isFull ? 'text-red-500' : 'text-green-600'}>{yatra.bookedSeats} / {yatra.totalSeats}</span>
                     </div>
                     <div className="w-full bg-gray-200 rounded-full h-2">
                       <div className={`h-2 rounded-full transition-all ${isFull ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${fillPercentage}%` }}></div>
                     </div>
                  </div>
                </div>

                {isManagerOrAdmin && (
                   <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-100">
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Adjust Bookings</span>
                     <div className="flex gap-1">
                       <button onClick={() => handleUpdateSeats(yatra.id, yatra.bookedSeats, yatra.totalSeats, -1)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black flex items-center justify-center transition-colors">-</button>
                       <button onClick={() => handleUpdateSeats(yatra.id, yatra.bookedSeats, yatra.totalSeats, 1)} disabled={isFull} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black flex items-center justify-center transition-colors disabled:opacity-50">+</button>
                     </div>
                   </div>
                )}
              </div>
            );
          })}
          {yatras.length === 0 && (
            <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-xs font-bold text-gray-400 uppercase tracking-widest">
              No Yatras scheduled.
            </div>
          )}
        </div>
      )}

      {/* ✨ UPLOAD VAULT MODAL */}
      {showVaultModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border-t-4 border-sanatani-orange animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><PlayCircle className="text-sanatani-orange" size={20}/> Upload Satsang Media</h3>
               <button onClick={() => setShowVaultModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveVaultItem} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Discourse Title *</label>
                 <input required type="text" value={vaultForm.title} onChange={e => setVaultForm({...vaultForm, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Bhagavad Gita Adhyay 1" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Speaker / Guru *</label>
                   <input required type="text" value={vaultForm.speaker} onChange={e => setVaultForm({...vaultForm, speaker: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Swami Ji" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Media Type</label>
                   <select value={vaultForm.mediaType} onChange={e => setVaultForm({...vaultForm, mediaType: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none cursor-pointer">
                     <option value="VIDEO">Video (YouTube)</option>
                     <option value="AUDIO">Audio (MP3/Spotify)</option>
                     <option value="DOCUMENT">Document (PDF/Drive)</option>
                   </select>
                 </div>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Media Link (URL) *</label>
                 <input required type="url" value={vaultForm.link} onChange={e => setVaultForm({...vaultForm, link: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="https://" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Date of Discourse</label>
                 <input type="date" value={vaultForm.dateStr} onChange={e => setVaultForm({...vaultForm, dateStr: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex items-center justify-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : 'ADD TO VAULT'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ SCHEDULE YATRA MODAL */}
      {showYatraModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 border-t-4 border-blue-600 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Bus size={20} className="text-blue-600"/> Schedule Transport</h3>
               <button onClick={() => setShowYatraModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveYatra} className="space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Destination / Event *</label>
                 <input required type="text" value={yatraForm.destination} onChange={e => setYatraForm({...yatraForm, destination: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Vrindavan Yatra" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Pick-up Location *</label>
                 <input required type="text" value={yatraForm.pickupPoint} onChange={e => setYatraForm({...yatraForm, pickupPoint: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" placeholder="e.g. Main Temple Gate" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Total Bus Seats *</label>
                   <input required type="number" min="1" value={yatraForm.totalSeats} onChange={e => setYatraForm({...yatraForm, totalSeats: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Departure Date</label>
                   <input required type="date" value={yatraForm.departureDate} onChange={e => setYatraForm({...yatraForm, departureDate: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none text-gray-700" />
                 </div>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all mt-4 flex justify-center items-center">
                 {isProcessing ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'SCHEDULE YATRA'}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
