import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { Megaphone, X, Zap } from 'lucide-react';

export default function BackendMarketingNotice({ session }) {
  const [notice, setNotice] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const noticeRef = ref(db, 'global_settings/marketing_banner');
    const unsubscribe = onValue(noticeRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.active && (data.target === 'ALL' || (data.target === 'FREE' && session.role === 'ADMIN'))) {
          setNotice(data);
        } else {
          setNotice(null);
        }
      } else {
        setNotice(null);
      }
    });
    return () => unsubscribe();
  }, [session.role]);

  if (!notice || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 rounded-2xl shadow-md mb-6 flex items-center justify-between gap-4 fade-in">
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-2.5 rounded-xl">
          <Megaphone size={20} className="text-white animate-pulse" />
        </div>
        <div>
          <h4 className="text-sm font-black flex items-center gap-2">
            {notice.title} <span className="bg-white/30 text-[10px] px-2 py-0.5 rounded-full">Announcement</span>
          </h4>
          <p className="text-xs text-amber-100 mt-0.5 font-medium">{notice.message}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {notice.actionUrl && (
          <a href={notice.actionUrl} target="_blank" rel="noreferrer" className="bg-white text-orange-600 hover:bg-amber-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1">
            <Zap size={14} /> {notice.actionText || 'Upgrade Now'}
          </a>
        )}
        <button onClick={() => setDismissed(true)} className="text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
