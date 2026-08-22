import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { Sparkles, Share2, Heart, WifiOff, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

// ✨ TIER 1: LOCAL SEED VAULT (100% Offline, Zero Latency)
// Hand-picked verses emphasizing action, unity, and strength.
const LOCAL_VAULT = [
  {
    source: "Rig Veda (10.191.2)",
    sanskrit: "संगच्छध्वं संवदध्वं सं वो मनांसि जानताम्।",
    translations: {
      en: "Walk together, speak together, let your minds be in harmony.",
      bn: "একসাথে চলো, একসাথে কথা বলো, তোমাদের মন যেন এক হয়।",
      hi: "साथ चलो, साथ बोलो, तुम्हारे मन एक हों।"
    }
  },
  {
    source: "Bhagavad Gita (2.47)",
    sanskrit: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।",
    translations: {
      en: "You have a right to perform your prescribed duty, but you are not entitled to the fruits of action.",
      bn: "কর্মেই তোমার অধিকার, কর্মফলে নয়।",
      hi: "कर्म पर ही तुम्हारा अधिकार है, कर्म के फलों में कभी नहीं।"
    }
  },
  {
    source: "Mundaka Upanishad (3.1.6)",
    sanskrit: "सत्यमेव जयते नानृतं।",
    translations: {
      en: "Truth alone triumphs; not falsehood.",
      bn: "সত্যেরই জয় হয়, মিথ্যার নয়।",
      hi: "सत्य की ही विजय होती है, झूठ की नहीं।"
    }
  },
  {
    source: "Bhagavad Gita (6.5)",
    sanskrit: "उद्धरेदात्मनात्मानं नात्मानमवसादयेत्।",
    translations: {
      en: "Elevate yourself through the power of your mind, and not degrade yourself.",
      bn: "নিজের মনের শক্তি দিয়ে নিজেকে উন্নত করো, নিজেকে অবনমিত কোরো না।",
      hi: "अपने मन की शक्ति से स्वयं का उद्धार करो, स्वयं को नीचा मत गिराओ।"
    }
  },
  {
    source: "Maha Upanishad (6.71)",
    sanskrit: "उदारचरितानां तु वसुधैव कुटुम्बकम्॥",
    translations: {
      en: "For the noble-hearted, the entire world is one family.",
      bn: "উদার মনের মানুষের কাছে সমগ্র বিশ্বই এক পরিবার।",
      hi: "उदार चरित्र वालों के लिए तो संपूर्ण विश्व ही एक परिवार है।"
    }
  }
];

export default function ShlokaFeed({ session, isOnline = navigator.onLine }) {
  const { language } = useLanguage();
  const [shloka, setShloka] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  useEffect(() => {
    // ✨ TIER 2: FIREBASE WORKSPACE SYNC (Listens to Admin's Marketing Desk)
    const baniRef = ref(db, `communities/${session.communityId}/info/dailyBani`);
    
    const unsub = onValue(baniRef, (snapshot) => {
      if (snapshot.exists()) {
        const adminBani = snapshot.val();
        
        // Check if Admin Bani is fresh (updated within the last 24 hours)
        const isFresh = (Date.now() - adminBani.updatedAt) < (24 * 60 * 60 * 1000);
        
        if (isFresh) {
          setShloka({
            sanskrit: adminBani.sanskrit,
            meaning: adminBani.translation,
            source: adminBani.source || "Workspace Admin",
            isOfficial: true
          });
          setLoading(false);
          return;
        }
      }
      
      // If no fresh Admin Bani, fall back to the Autonomous Fetch Engine
      executeAutonomousRoutine();
    });

    return () => unsub();
  }, [session.communityId, language]);

  // ✨ TIER 3: AUTONOMOUS CLOUD-TO-CACHE ENGINE
  const executeAutonomousRoutine = async () => {
    const todayStr = new Date().toDateString();
    
    // Check LocalStorage Cache First
    try {
      const cachedData = JSON.parse(localStorage.getItem('sb_daily_shloka'));
      if (cachedData && cachedData.date === todayStr) {
        setShloka(cachedData.data);
        setLoading(false);
        return;
      }
    } catch (e) { console.error("Cache read error"); }

    // If Online, attempt to fetch from Free Bhagavad Gita API
    if (isOnline) {
      try {
        const ch = Math.floor(Math.random() * 18) + 1;
        const bgVerseCount = [47,72,43,42,29,47,30,28,34,42,55,20,35,27,20,24,28,78];
        const v = Math.floor(Math.random() * bgVerseCount[ch-1]) + 1;

        const response = await fetch(`https://bhagavadgitaapi.in/slok/${ch}/${v}`);
        if (!response.ok) throw new Error("API Limit");
        
        const data = await response.json();
        
        // Intelligent Language Parsing based on user context
        let fetchedMeaning = data.tej?.ht || data.siva?.et || "Translation unavailable.";
        if (language === 'hi' && data.tej?.hi) fetchedMeaning = data.tej.hi;
        if (language === 'en' && data.siva?.et) fetchedMeaning = data.siva.et;

        const newShloka = {
          sanskrit: data.slok,
          meaning: fetchedMeaning,
          source: `Bhagavad Gita (${ch}.${v})`,
          isOfficial: false
        };

        setShloka(newShloka);
        localStorage.setItem('sb_daily_shloka', JSON.stringify({ date: todayStr, data: newShloka }));
        setLoading(false);
        return;

      } catch (err) {
        console.warn("API Busy or Offline. Falling back to Local Vault.");
      }
    }

    // ✨ TIER 1 FALLBACK: Local Seed Vault (Zero Latency Offline Mode)
    loadFromVault();
  };

  const loadFromVault = () => {
    const todayInt = new Date().getDate();
    const vaultItem = LOCAL_VAULT[todayInt % LOCAL_VAULT.length];
    
    setShloka({
      sanskrit: vaultItem.sanskrit,
      meaning: vaultItem.translations[language] || vaultItem.translations['en'],
      source: vaultItem.source,
      isOfficial: false
    });
    setIsOfflineFallback(!isOnline);
    setLoading(false);
  };

  // 🚀 DIGITAL MARKETING SHARING ENGINE
  const handleShare = async () => {
    if (!shloka) return;

    // GA4 Viral Event Tracking
    pushToDataLayer('share', { 
      method: 'Native_Share', 
      content_type: 'Daily_Bani', 
      item_id: shloka.source 
    });

    const shareText = `✨ "${shloka.sanskrit}" ✨\n\n🌺 ${shloka.meaning}\n\n📖 — ${shloka.source}\n\n🙏 Start your spiritual journey today on the Sanatani Bandhan app.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Daily Sanatani Wisdom',
          text: shareText
        });
      } catch (e) {
        if (e.name !== 'AbortError') fallbackCopy(shareText);
      }
    } else {
      fallbackCopy(shareText);
    }
  };

  const fallbackCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert("✨ Shloka copied! Paste it on WhatsApp or Facebook to inspire others.");
  };

  if (loading || !shloka) {
    return (
      <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-3xl p-8 flex justify-center items-center h-48 shadow-lg">
        <Loader2 size={32} className="animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-orange-500 to-amber-600 text-white p-6 sm:p-8 rounded-3xl shadow-lg relative overflow-hidden group transition-all duration-300 hover:shadow-xl">
      
      {/* Decorative Background Element */}
      <div className="absolute -right-6 -bottom-8 opacity-10 text-[12rem] font-black leading-none select-none pointer-events-none transition-transform duration-700 group-hover:scale-110">
        ॐ
      </div>
      
      {/* Header Badge */}
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-xl text-amber-50 text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-sm">
          <Sparkles size={14} className="text-amber-200" /> 
          {shloka.isOfficial ? 'Official Community Bani' : 'Daily Vedic Inspiration'}
        </div>
        
        {isOfflineFallback && (
          <div className="text-white/50" title="Running in Offline Mode">
            <WifiOff size={16} />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="relative z-10 mb-6">
        <p className="text-xl sm:text-2xl font-serif font-bold mb-4 leading-relaxed tracking-wide text-white drop-shadow-sm whitespace-pre-wrap">
          "{shloka.sanskrit}"
        </p>
        <p className="text-sm sm:text-base text-amber-100 font-medium leading-relaxed italic border-l-2 border-amber-400/50 pl-4">
          {shloka.meaning}
        </p>
      </div>

      {/* Footer & Viral CTA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-orange-400/50 relative z-10">
        
        <span className="text-[10px] sm:text-xs font-black bg-orange-900/40 text-amber-100 px-3 py-1.5 rounded-lg border border-orange-800/30 shadow-inner flex items-center gap-1.5 uppercase tracking-widest">
          <BookOpen size={12}/> {shloka.source}
        </span>
        
        <button 
          onClick={handleShare}
          className="w-full sm:w-auto bg-white hover:bg-gray-50 text-orange-600 px-4 py-3 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2 shadow-md hover:shadow-lg hover:-translate-y-0.5"
        >
          <Share2 size={16} /> Inspire Others
        </button>
      </div>
      
    </div>
  );
}
