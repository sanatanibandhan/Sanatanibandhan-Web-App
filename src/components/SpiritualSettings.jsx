import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import { 
  BookOpen, Sparkles, Calendar, Sun, CheckCircle2, 
  AlertTriangle, WifiOff, Loader2, HelpCircle, Lightbulb, 
  X, Save, Bookmark, Feather, ShieldCheck, RefreshCw
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { usePlanGate } from '../hooks/usePlanGate';

export default function SpiritualSettings({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const { checkQuota } = usePlanGate(session);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [toast, setToast] = useState(null);

  // Spiritual Config State (Mapped to your live database schema)
  const [configForm, setConfigForm] = useState({
    daily_quote_text: '',
    daily_quote_source: '',
    quote_source_preference: 'UPANISHADS',
    tithi_override_text: ''
  });

  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 🔄 Realtime Data Synchronization with LocalStorage Offline Fallback
  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_spiritual_settings', { workspace_type: workspaceType });

    const configRef = ref(db, `communities/${session.communityId}/dashboard_config`);
    const unsubConfig = onValue(configRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setConfigForm({
          daily_quote_text: data.daily_quote_text || '',
          daily_quote_source: data.daily_quote_source || '',
          quote_source_preference: data.quote_source_preference || 'UPANISHADS',
          tithi_override_text: data.tithi_override_text || ''
        });
        localStorage.setItem(`sb_spiritual_${session.communityId}`, JSON.stringify(data));
      } else {
        // Fallback to cache if offline
        try {
          const cached = localStorage.getItem(`sb_spiritual_${session.communityId}`);
          if (cached) setConfigForm(JSON.parse(cached));
        } catch (e) {}
      }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1200);
    return () => { unsubConfig(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const executeSafeUpdate = async (updates, successMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline sync error:", e));
      showToast("Saved offline. Will sync when online.", "offline");
      return Promise.resolve();
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast("Error updating spiritual settings: " + e.message, "error");
      throw e;
    }
  };

  // 💾 Save Configuration Handler
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!isManagerOrAdmin) return showToast("Unauthorized action.", "error");

    setSubmitting(true);
    try {
      const updates = {};
      const payload = {
        ...configForm,
        last_updated_by_web: Date.now()
      };

      updates[`communities/${session.communityId}/dashboard_config`] = payload;

      await executeSafeUpdate(updates, "Spiritual Engine configuration updated successfully!");
      pushToDataLayer('update_spiritual_settings', { source_pref: configForm.quote_source_preference });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5 min-h-[90vh]">

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

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg animate-pulse">
          <WifiOff size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Offline Mode: Operating from local spiritual vault.</span>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <Feather className="text-sanatani-orange" size={32} /> Spiritual & Tithi Engine
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Configure daily scriptural Bani, Tithi calendars, and Vedic text preferences for your {t('workspace') || 'community'}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <HelpCircle size={14}/> Guide
          </button>
        </div>
      </div>

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-5 rounded-2xl shadow-inner relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-orange-400 hover:text-orange-700"><X size={18}/></button>
          <h3 className="text-sm font-black text-orange-900 flex items-center gap-2 mb-2 uppercase tracking-widest"><Lightbulb size={18} className="text-orange-500"/> Spiritual Engine Protocol</h3>
          <p className="text-xs font-bold text-gray-700 leading-relaxed">
            The text configured here automatically populates on every devotee's home dashboard upon opening the app. Use this to broadcast daily scriptural inspiration, Tithi notices, and festival dates.
          </p>
        </div>
      )}

      {/* CONFIGURATION FORM */}
      <form onSubmit={handleSaveConfig} className="max-w-3xl space-y-6">

        {/* 1. Daily Bani / Quote Box */}
        <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 space-y-4 shadow-sm">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <Sparkles size={16} className="text-sanatani-orange"/> Daily Devotional Bani (Thought for the Day)
          </h3>

          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Quote / Shloka Text *</label>
            <textarea 
              rows="3" 
              required
              value={configForm.daily_quote_text} 
              onChange={e => setConfigForm({...configForm, daily_quote_text: e.target.value})} 
              placeholder='"Satyameva Jayate" (Truth alone triumphs).'
              className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange resize-none shadow-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Source Scripture *</label>
              <input 
                type="text" 
                required
                value={configForm.daily_quote_source} 
                onChange={e => setConfigForm({...configForm, daily_quote_source: e.target.value})} 
                placeholder="e.g. - Mundaka Upanishad"
                className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Primary Vedic Tradition</label>
              <select 
                value={configForm.quote_source_preference} 
                onChange={e => setConfigForm({...configForm, quote_source_preference: e.target.value})} 
                className="w-full p-4 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-sm appearance-none"
              >
                <option value="UPANISHADS">Upanishads</option>
                <option value="BHAGAVAD_GITA">Bhagavad Gita</option>
                <option value="VEDAS">Vedas</option>
                <option value="PURANAS">Puranas / Itihasa</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. Tithi & Calendar Override */}
        <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 space-y-4 shadow-sm">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <Calendar size={16} className="text-blue-600"/> Tithi & Festival Notice Override
          </h3>

          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Today's Tithi / Special Notice Bar</label>
            <input 
              type="text" 
              value={configForm.tithi_override_text} 
              onChange={e => setConfigForm({...configForm, tithi_override_text: e.target.value})} 
              placeholder="e.g. Shukla Paksha Ekadashi | Fasting Day"
              className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-sanatani-orange shadow-sm"
            />
            <p className="text-[10px] text-gray-400 font-bold mt-1">This text appears right at the top of the mobile home screen for all members.</p>
          </div>
        </div>

        {isManagerOrAdmin && (
          <button 
            type="submit" 
            disabled={submitting} 
            className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} SAVE SPIRITUAL CONFIGURATION
          </button>
        )}
      </form>

      {/* FOOTER */}
      <div className="pt-12 pb-6 text-center opacity-70 border-t border-gray-200 mt-auto text-xs font-bold text-gray-500">
        Made with <Heart size={12} className="text-red-500 fill-current inline"/> by <span className="font-black text-sanatani-orange">TrackIQ Academy</span> • Spiritual Engine
      </div>
    </div>
  );
}
