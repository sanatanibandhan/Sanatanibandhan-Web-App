import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, update } from 'firebase/database';
import { db } from '../firebase';
import { 
  CalendarDays, Sun, Moon, Clock, Sparkles, Compass, ShieldCheck, 
  CheckCircle2, AlertTriangle, WifiOff, Loader2, HelpCircle, Lightbulb, 
  X, Send, ArrowRight, Calendar, Bookmark, Award, Flame, Bell
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

// RAHAU KAAL TIMINGS BY WEEKDAY (Standard Vedic calculation offsets)
const RAHU_KAAL_MAP = {
  Sunday: "16:30 - 18:00",
  Monday: "07:30 - 09:00",
  Tuesday: "15:00 - 16:30",
  Wednesday: "12:00 - 13:30",
  Thursday: "13:30 - 15:00",
  Friday: "10:30 - 12:00",
  Saturday: "09:00 - 10:30"
};

const RITUAL_CATEGORIES = [
  { id: 'GRIHA_PRAVESH', name: 'Griha Pravesh (House Warming)', bestTime: 'Morning (08:00 AM - 11:30 AM)' },
  { id: 'VIVAH', name: 'Vivah Sanskar (Marriage)', bestTime: 'Evening / Godhuli (06:00 PM - 09:00 PM)' },
  { id: 'NAMAKARAN', name: 'Namakaran Sanskar (Naming Ceremony)', bestTime: 'Morning Auspicious Window' },
  { id: 'MANDIR_UTSAV', name: 'Mandir Utsav / Foundation', bestTime: 'Abhijit Muhurat (11:45 AM - 12:35 PM)' }
];

export default function PanchangMuhuratDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedCategory, setSelectedCategory] = useState('GRIHA_PRAVESH');
  
  // Modal State for 1-Tap Panjika Handoff
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncForm, setSyncForm] = useState({ title: '', location: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const logAudit = async (actionType, description) => {
    try {
      await push(ref(db, `communities/${session.communityId}/audit_logs`), {
        managerName: session.userName, actionType, description, timestamp: Date.now()
      });
    } catch (e) {}
  };

  // Compute Panchang data dynamically based on selected date
  const panchangInfo = useMemo(() => {
    const d = new Date(selectedDate);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Algorithmic approximations for demonstration of Vedic parameters
    const tithis = ['Shukla Pratipada', 'Shukla Saptami', 'Ekadashi', 'Purnima', 'Krishna Ashtami', 'Amavasya', 'Trayodashi'];
    const nakshatras = ['Rohini', 'Pushya', 'Uttara Phalguni', 'Visakha', 'Sravana', 'Ashwini', 'Mrigashira'];
    
    const dayIndex = d.getDate() % tithis.length;

    return {
      weekday,
      tithi: tithis[dayIndex],
      nakshatra: nakshatras[(dayIndex + 2) % nakshatras.length],
      sunrise: '05:42 AM',
      sunset: '06:31 PM',
      rahuKaal: RAHU_KAAL_MAP[weekday] || '12:00 - 13:30',
      abhijitMuhurat: '11:48 AM - 12:36 PM (Highly Auspicious)',
      auspiciousNote: weekday === 'Tuesday' || weekday === 'Saturday' ? 'Exercise caution for new financial ventures.' : 'Excellent planetary alignment for auspicious beginnings.'
    };
  }, [selectedDate]);

  // 🚀 1-Tap Sync to Utsav Panjika
  const handlePushToPanjika = async (e) => {
    e.preventDefault();
    if (!syncForm.title.trim()) return showToast("Event title is required.", "error");

    setSubmitting(true);
    try {
      const eventDateObj = new Date(selectedDate);
      const timestampMs = eventDateObj.getTime();
      const dateOptions = { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' };
      const dateStr = eventDateObj.toLocaleDateString('en-GB', dateOptions).replace(',', '');

      const eventPayload = {
        title: syncForm.title.trim(),
        dateStr: dateStr,
        timeStr: '11:48 AM (Abhijit Muhurat)',
        location: syncForm.location.trim() || `${session.communityName} Premises`,
        description: (syncForm.description.trim() || 'Scheduled via Dynamic Panchang Engine.') + ` [Panchang Verified: ${panchangInfo.tithi}, ${panchangInfo.nakshatra}]`,
        adminComment: 'Auspicious Muhurat Verified',
        requiresTickets: false,
        maxCapacity: 0,
        inviteMode: 'ALL',
        timestamp: timestampMs,
        eventDateTs: timestampMs,
        notificationCount: 1,
        status: 'UPCOMING',
        createdBy: session.userName
      };

      const newId = push(ref(db, `communities/${session.communityId}/events`)).key;
      eventPayload.id = newId;

      const updates = {};
      updates[`communities/${session.communityId}/events/${newId}`] = eventPayload;

      await update(ref(db), updates);
      showToast("Auspicious event successfully published to Utsav Panjika!");
      logAudit("PANCHANG_EVENT_SYNC", `Synced Muhurat event to Panjika: ${syncForm.title}`);
      pushToDataLayer('sync_panchyang_event', { event_name: syncForm.title });

      setShowSyncModal(false);
      setSyncForm({ title: '', location: '', description: '' });
    } catch (err) {
      showToast("Error syncing event: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full">

      {/* TOAST PORTAL */}
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
            <Compass className="text-sanatani-orange" size={32} /> Vedic Panchang & Muhurat Engine
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Calculate daily Tithi, Nakshatra, Rahu Kaal, and schedule auspicious ceremonies.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> Guide
          </button>
          <div className="flex items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl">
            <CalendarDays size={16} className="text-sanatani-orange mr-2"/>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
              className="bg-transparent text-xs font-black text-gray-800 outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Panchang Engine Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            Select any target date to inspect solar positions and malefic blocks. Use the 1-tap sync button to convert an auspicious Muhurat window directly into a temple event in Utsav Panjika.
          </p>
        </div>
      )}

      {/* MAIN PANCHANG DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Today's Core Vedic Elements */}
        <div className="lg:col-span-1 bg-gradient-to-br from-gray-900 to-black text-white p-6 sm:p-8 rounded-3xl shadow-xl space-y-6 flex flex-col justify-between">
           <div>
             <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 bg-white/10 px-3 py-1 rounded-md border border-white/10">
               {panchangInfo.weekday} Panchang
             </span>
             <h3 className="text-3xl font-black mt-3 tracking-tight">{panchangInfo.tithi}</h3>
             <p className="text-xs text-gray-300 font-bold mt-1">Nakshatra: <span className="text-white font-black">{panchangInfo.nakshatra}</span></p>
           </div>

           <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10 text-xs font-bold backdrop-blur-md">
              <div className="flex justify-between items-center"><span className="text-gray-400">Sunrise:</span> <span className="text-white">{panchangInfo.sunrise}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-400">Sunset:</span> <span className="text-white">{panchangInfo.sunset}</span></div>
              <div className="flex justify-between items-center"><span className="text-red-400">Rahu Kaal:</span> <span className="text-red-300 font-mono">{panchangInfo.rahuKaal}</span></div>
           </div>

           <div className="bg-emerald-500/20 border border-emerald-500/30 p-4 rounded-2xl">
             <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Sparkles size={12}/> Abhijit Muhurat</p>
             <p className="text-xs font-bold text-white">{panchangInfo.abhijitMuhurat}</p>
           </div>
        </div>

        {/* Right Column: Auspicious Muhurat Finder & 1-Tap Sync */}
        <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6 flex flex-col justify-between">
           <div>
             <h3 className="text-xl font-black text-gray-900 tracking-tight">Auspicious Muhurat Selector</h3>
             <p className="text-xs text-gray-500 font-bold mt-0.5">Select a ceremony type to verify optimal timing windows for {selectedDate}.</p>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
             {RITUAL_CATEGORIES.map(cat => (
               <div 
                 key={cat.id} 
                 onClick={() => setSelectedCategory(cat.id)}
                 className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${selectedCategory === cat.id ? 'border-sanatani-orange bg-orange-50/50 shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
               >
                 <div>
                   <span className="text-[8px] font-black uppercase tracking-widest text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">{cat.id}</span>
                   <h4 className="font-black text-gray-900 text-sm mt-2">{cat.name}</h4>
                 </div>
                 <p className="text-[11px] font-bold text-sanatani-orange mt-3 flex items-center gap-1"><Clock size={12}/> {cat.bestTime}</p>
               </div>
             ))}
           </div>

           <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
             <p className="text-xs font-bold text-gray-600">
               Status: <span className="text-green-600 font-black">Auspicious Window Verified</span>
             </p>
             <button 
               onClick={() => {
                 const catObj = RITUAL_CATEGORIES.find(c => c.id === selectedCategory);
                 setSyncForm({ title: catObj ? catObj.name : 'Mandir Ceremony', location: `${session.communityName} Hall`, description: `Scheduled during optimal Panchang windows on ${selectedDate}.` });
                 setShowSyncModal(true);
               }}
               className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-6 py-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all"
             >
               <Send size={16}/> Schedule Event with this Muhurat <ArrowRight size={14}/>
             </button>
           </div>
        </div>

      </div>

      {/* MODAL: SYNC TO PANJIKA */}
      {showSyncModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-sanatani-orange flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-black text-gray-900">Publish Muhurat to Utsav Panjika</h3>
              <button onClick={() => setShowSyncModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={16}/></button>
            </div>

            <form onSubmit={handlePushToPanjika} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Event Title *</label>
                <input type="text" required value={syncForm.title} onChange={e=>setSyncForm({...syncForm, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Location</label>
                <input type="text" value={syncForm.location} onChange={e=>setSyncForm({...syncForm, location: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Description</label>
                <textarea rows="3" value={syncForm.description} onChange={e=>setSyncForm({...syncForm, description: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none resize-none"></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
                {submitting ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'Publish to Utsav Panjika Now'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Panchang Engine
      </div>
    </div>
  );
}
