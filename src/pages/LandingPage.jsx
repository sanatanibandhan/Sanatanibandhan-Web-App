import React, { useState, useEffect } from 'react';
import { ref, onValue, push, serverTimestamp } from 'firebase/database';
import { db } from '../firebase'; 
import { 
  ShieldCheck, Users, Megaphone, BarChart3, ChevronRight, 
  Crown, CheckCircle2, Lock, Globe2, ArrowRight, PlayCircle, 
  X, Mail, Send, Shield, Server, Languages, MessageSquare, Menu,
  Smartphone, QrCode, Zap, Headphones, Loader2, WifiOff
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { trackLeadGen, pushToDataLayer } from '../utils/gtm';

export default function LandingPage({ onLoginClick }) {
  const { language, setLanguage, t } = useLanguage(); 
  const [isHovered, setIsHovered] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [currentFeature, setCurrentFeature] = useState(0);

  // ✨ MOBILE MENU & OFFLINE STATES
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // ✨ LEAD GENERATION STATES
  const [leadForm, setLeadForm] = useState({ name: '', contact: '', message: '' });
  const [isSending, setIsSending] = useState(false);

  // ✨ OFFLINE CACHE INITIALIZATION FOR PRICING
  const [limits, setLimits] = useState(() => {
    try {
      const cached = localStorage.getItem('sb_global_limits');
      return cached ? JSON.parse(cached) : { members: 50, pdfs: 3, polls: 2 };
    } catch { return { members: 50, pdfs: 3, polls: 2 }; }
  });

  const [proPlan, setProPlan] = useState(() => {
    try {
      const cached = localStorage.getItem('sb_pro_plan');
      return cached ? JSON.parse(cached) : {
        priceBdt: 5000, priceUsd: 50,
        originalBdtPrice: 8000,
        duration: "LIFETIME ACCESS",
        subtitle: "NO HIDDEN FEES",
        features: ["Unlimited Profiles", "Unlimited Automated PDF Reports", "Unlimited Polls & Voting", "Priority Support Channel", "Verified Organization Badge"]
      };
    } catch {
      return { 
        priceBdt: 5000, priceUsd: 50, 
        originalBdtPrice: 8000,
        duration: "LIFETIME ACCESS", 
        subtitle: "NO HIDDEN FEES",
        features: ["Unlimited Profiles", "Unlimited Automated PDF Reports", "Unlimited Polls & Voting", "Priority Support Channel", "Verified Organization Badge"] 
      };
    }
  });

  // ✨ NETWORK SENTINEL
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { 
      window.removeEventListener('online', handleOnline); 
      window.removeEventListener('offline', handleOffline); 
    };
  }, []);

  // ✨ FIREBASE SYNC WITH LOCAL STORAGE
  useEffect(() => {
    const configRef = ref(db, 'app_config/global_settings');
    const unsubConfig = onValue(configRef, (snapshot) => {
      if (snapshot.exists()) {
        const conf = snapshot.val();
        const newLimits = {
          members: conf.free_member_limit !== undefined ? conf.free_member_limit : 50,
          pdfs: conf.free_pdf_limit !== undefined ? conf.free_pdf_limit : 3,
          polls: conf.free_poll_limit !== undefined ? conf.free_poll_limit : 2
        };
        setLimits(newLimits);
        localStorage.setItem('sb_global_limits', JSON.stringify(newLimits));
      }
    });

    const settingsRef = ref(db, 'platform_settings/smart_pro');
    const unsubSettings = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const newPlan = {
          priceBdt: data.price_bdt || 5000, 
          priceUsd: data.price_usd || 50,
          originalBdtPrice: data.original_price_bdt || 8000,
          duration: data.duration || "LIFETIME ACCESS",
          subtitle: data.subtitle || "NO HIDDEN FEES",
          features: data.features ? (Array.isArray(data.features) ? data.features : Object.values(data.features)) : proPlan.features
        };
        setProPlan(newPlan);
        localStorage.setItem('sb_pro_plan', JSON.stringify(newPlan));
      }
    });
    return () => { unsubConfig(); unsubSettings(); };
  }, []);

  const featuresData = [
    { icon: <Users size={32} />, color: "text-orange-500", bg: "bg-orange-50", title: t('feat_1_title'), pain: t('feat_1_pain'), solution: t('feat_1_sol') },
    { icon: <BarChart3 size={32} />, color: "text-green-600", bg: "bg-green-50", title: t('feat_2_title'), pain: t('feat_2_pain'), solution: t('feat_2_sol') },
    { icon: <Megaphone size={32} />, color: "text-blue-600", bg: "bg-blue-50", title: t('feat_3_title'), pain: t('feat_3_pain'), solution: t('feat_3_sol') },
    { icon: <Lock size={32} />, color: "text-purple-600", bg: "bg-purple-50", title: t('feat_4_title'), pain: t('feat_4_pain'), solution: t('feat_4_sol') }
  ];

  useEffect(() => {
    const timer = setInterval(() => { setCurrentFeature((prev) => (prev + 1) % featuresData.length); }, 5000); 
    return () => clearInterval(timer);
  }, [featuresData.length]);

  const handleFreeSignupClick = () => {
    pushToDataLayer('select_promotion', {
      ecommerce: { items: [{ promotion_id: "free_tier", promotion_name: "Community Free Signup Click" }] }
    });
    onLoginClick();
  };

  const handleProUpgradeClick = () => {
    pushToDataLayer('select_promotion', {
      ecommerce: { items: [{ promotion_id: "smart_pro", promotion_name: "Smart Pro Upgrade Click" }] }
    });
    onLoginClick();
  };

  const handleWatchDemoClick = () => {
    pushToDataLayer('select_content', { content_type: 'video_modal', content_id: 'system_demo' });
    setActiveModal('demo');
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      alert("⚠️ You are currently offline. Please connect to the internet to send a message.");
      return;
    }
    if (!leadForm.name || !leadForm.contact || !leadForm.message) return;

    setIsSending(true);
    try {
      await push(ref(db, 'platform_leads'), {
        name: leadForm.name.trim(),
        contact: leadForm.contact.trim(),
        message: leadForm.message.trim(),
        status: 'UNREAD', 
        timestamp: serverTimestamp()
      });

      trackLeadGen('Contact Form', 'LandingPage'); 
      alert("✅ Message sent successfully! Our team will contact you shortly.");
      setLeadForm({ name: '', contact: '', message: '' });
      setActiveModal(null);
    } catch (error) {
      alert("Error sending message. Please try WhatsApp instead.");
    } finally {
      setIsSending(false);
    }
  };

  const getWhatsAppLink = () => {
    const message = `Namaskar TrackIQ Academy! 🙏\n\nI am interested in using Sanatani Bandhan for my community.\n\n*Name:* ${leadForm.name || ''}\n*Contact:* ${leadForm.contact || ''}\n*My Query:* ${leadForm.message || ''}\n`;
    return `https://wa.me/8801608533529?text=${encodeURIComponent(message)}`;
  };

  const renderModal = () => {
    if (!activeModal) return null;
    const closeModal = () => setActiveModal(null);

    return (
      <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden fade-in relative ring-1 ring-white/20 flex flex-col max-h-[90vh]">
          <button onClick={closeModal} className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors z-10"><X size={20}/></button>

          {activeModal === 'demo' && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-gray-100 bg-gray-50"><h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><PlayCircle className="text-sanatani-orange"/> {t('btn_watch_demo')}</h3></div>
              <div className="p-6 bg-gray-900 aspect-video flex items-center justify-center"><div className="text-center"><PlayCircle size={64} className="text-gray-600 mx-auto mb-4 animate-pulse"/><p className="text-white font-bold tracking-widest uppercase text-xs">Video Demo Coming Soon</p></div></div>
            </div>
          )}

          {activeModal === 'security' && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-gray-100 bg-gray-50"><h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Server className="text-sanatani-orange"/> Enterprise Security Vault</h3></div>
              <div className="p-6 overflow-y-auto space-y-6 text-sm font-medium text-gray-600 leading-relaxed bg-white">
                <div className="flex items-start gap-4"><div className="bg-orange-50 text-sanatani-orange p-3 rounded-xl shrink-0"><Lock size={20}/></div><div><h4 className="font-black text-gray-900 text-base mb-1">Multi-Tenant Vault Isolation</h4><p>Every organization operates in a strictly isolated database vault. It is mathematically impossible for another Mandir to access your devotee directory.</p></div></div>
                <div className="flex items-start gap-4"><div className="bg-blue-50 text-blue-600 p-3 rounded-xl shrink-0"><ShieldCheck size={20}/></div><div><h4 className="font-black text-gray-900 text-base mb-1">Role-Based Access Control (RBAC)</h4><p>The system enforces strict hierarchies (Admin, Manager, Member). Only authorized personnel can modify financial ledgers.</p></div></div>
              </div>
            </div>
          )}

          {activeModal === 'privacy' && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-gray-100 bg-gray-50"><h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="text-sanatani-orange"/> {t('footer_privacy')}</h3></div>
              <div className="p-6 overflow-y-auto space-y-5 text-sm font-medium text-gray-600 leading-relaxed">
                <p><strong>1. Data Protection as Dharma:</strong> At Sanatani Bandhan, managed by TrackIQ Academy, we treat your community's data as sacred. We employ AES-256 equivalent enterprise-grade encryption to protect devotee directories, contact numbers, and financial ledgers.</p>
                <p><strong>2. Zero Data Brokering:</strong> We will never sell, rent, or share your organization's data with third-party advertisers or external agencies. Your workspace is an isolated, secure vault solely owned by your registered Head Admin.</p>
              </div>
            </div>
          )}

          {activeModal === 'terms' && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-gray-100 bg-gray-50"><h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Shield className="text-sanatani-orange"/> {t('footer_terms')}</h3></div>
              <div className="p-6 overflow-y-auto space-y-5 text-sm font-medium text-gray-600 leading-relaxed">
                <p><strong>1. Platform Purpose:</strong> By establishing a workspace on Sanatani Bandhan, you agree to utilize the platform strictly for the betterment, organization, and transparent management of Hindu communities, Ashrams, and Sanghas.</p>
                <p><strong>2. Administrative Responsibility:</strong> The Head Admin is entirely responsible for maintaining the confidentiality of their workspace PINs and managing the access levels of their committee members.</p>
              </div>
            </div>
          )}

          {activeModal === 'contact' && (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-gray-100 bg-gray-50">
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Mail className="text-sanatani-orange"/> {t('contact_title')}</h3>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="bg-[#25D366]/10 border border-[#25D366]/20 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="text-[#25D366] shrink-0 mt-1" size={24}/>
                    <div>
                      <h4 className="font-black text-gray-900">{t('contact_wa')}</h4>
                      <p className="text-xs text-gray-600 mt-1">{t('contact_wa_desc')}</p>
                    </div>
                  </div>
                  <a 
                    href={getWhatsAppLink()} 
                    target="_blank" rel="noreferrer"
                    onClick={() => trackLeadGen('WhatsApp Button', 'LandingPage')} 
                    className="w-full sm:w-auto bg-[#25D366] hover:bg-[#1da851] text-white text-xs font-black uppercase tracking-widest py-3 px-5 rounded-xl transition-all text-center shadow-md shadow-[#25D366]/20 hover:-translate-y-0.5 shrink-0"
                  >
                    {t('contact_wa_btn')}
                  </a>
                </div>

                <div className="flex items-center gap-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                  <div className="h-px bg-gray-200 flex-1"></div> OR LEAVE A MESSAGE <div className="h-px bg-gray-200 flex-1"></div>
                </div>

                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('contact_name')}</label>
                      <input type="text" required value={leadForm.name} onChange={e=>setLeadForm({...leadForm, name: e.target.value})} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm" placeholder="e.g. Rahul Sharma" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('contact_info')}</label>
                      <input type="text" required value={leadForm.contact} onChange={e=>setLeadForm({...leadForm, contact: e.target.value})} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm" placeholder="+880 / email@domain.com" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('contact_msg')}</label>
                    <textarea required rows="3" value={leadForm.message} onChange={e=>setLeadForm({...leadForm, message: e.target.value})} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all resize-none shadow-sm" placeholder="Tell us about your community needs..."></textarea>
                  </div>
                  <button type="submit" disabled={isSending} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-50">
                    {isSending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} {t('contact_send')}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-orange-100 selection:text-orange-900 overflow-x-hidden relative">
      {renderModal()}

      {/* ✨ OFFLINE BANNER */}
      {!isOnline && (
        <div className="bg-red-600 text-white p-2 text-center flex items-center justify-center gap-2 shadow-sm relative z-[60]">
          <WifiOff size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest">Offline Mode</span>
        </div>
      )}

      {/* ✨ FLOATING LANGUAGE POD */}
      <div className="fixed bottom-6 left-6 z-50 group hidden md:block">
        <div className="relative">
          <button className="bg-white/90 backdrop-blur-md border border-gray-200 p-3.5 rounded-full shadow-2xl flex items-center justify-center hover:bg-orange-50 transition-all hover:scale-110 hover:border-orange-200">
            <Languages size={24} className="text-sanatani-orange" />
            <span className="absolute -top-1 -right-1 bg-gray-900 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white uppercase">
              {language === 'en' ? 'EN' : language === 'bn' ? 'বাং' : 'হি'}
            </span>
          </button>
          <div className="absolute bottom-full left-0 mb-4 w-40 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform translate-y-4 group-hover:translate-y-0 overflow-hidden ring-1 ring-black/5 origin-bottom-left">
            <div className="p-3 bg-gray-50/80 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center flex items-center justify-center gap-1.5"><Globe2 size={12}/> Language</div>
            <button onClick={() => setLanguage('en')} className={`w-full text-left px-5 py-4 text-xs font-black tracking-widest transition-colors ${language === 'en' ? 'text-sanatani-orange bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>English</button>
            <button onClick={() => setLanguage('bn')} className={`w-full text-left px-5 py-4 text-xs font-black tracking-widest transition-colors ${language === 'bn' ? 'text-sanatani-orange bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>বাংলা</button>
            <button onClick={() => setLanguage('hi')} className={`w-full text-left px-5 py-4 text-xs font-black tracking-widest transition-colors ${language === 'hi' ? 'text-sanatani-orange bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>हिन्दी</button>
          </div>
        </div>
      </div>

      {/* 🚀 UPGRADED NAVBAR (RESPONSIVE BRANDING & TRUE LOGO) */}
      <nav className={`fixed w-full bg-white/90 backdrop-blur-md z-40 border-b border-gray-100 transition-all ${!isOnline ? 'top-8' : 'top-0'}`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer shrink-0">
            {/* ✨ SINGLE UNIFIED LOGO */}
            <img src="/icon-512x512.png" alt="Sanatani Bandhan Logo" className="h-8 sm:h-10 w-auto object-contain rounded-xl shadow-sm" />
            <span className="text-xs sm:text-xl font-black text-gray-900 tracking-tight whitespace-nowrap">
              Sanatani <span className="text-sanatani-orange">Bandhan</span>
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-bold text-gray-600 hover:text-sanatani-orange transition-colors uppercase tracking-widest">{t('nav_features')}</a>
            <a href="#pricing" className="text-sm font-bold text-gray-600 hover:text-sanatani-orange transition-colors uppercase tracking-widest">{t('nav_pricing')}</a>
            <button onClick={() => setActiveModal('security')} className="text-sm font-bold text-gray-600 hover:text-sanatani-orange transition-colors uppercase tracking-widest">{t('nav_security')}</button>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <button onClick={onLoginClick} className="text-sm font-black text-gray-900 hover:text-sanatani-orange transition-colors uppercase tracking-widest">{t('btn_login')}</button>
            <button onClick={handleFreeSignupClick} className="bg-gray-900 hover:bg-black text-white font-black px-6 py-3.5 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 text-xs uppercase tracking-widest flex items-center gap-2">
              {t('btn_establish')} <ArrowRight size={14}/>
            </button>
          </div>

          {/* ✨ Mobile Actions */}
          <div className="md:hidden flex items-center gap-2">
            <button onClick={onLoginClick} className="text-[10px] font-black bg-gray-900 text-white px-3 py-2.5 rounded-xl uppercase tracking-widest shadow-sm">
              {t('btn_login')}
            </button>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-900 hover:text-sanatani-orange transition-colors bg-gray-100 rounded-xl">
              {isMobileMenuOpen ? <X size={20}/> : <Menu size={20}/>}
            </button>
          </div>
        </div>

        {/* ✨ Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-white border-b border-gray-100 shadow-xl py-4 px-6 flex flex-col gap-4 animate-in slide-in-from-top-2">
            <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-black text-gray-600 uppercase tracking-widest border-b border-gray-50 pb-3">{t('nav_features')}</a>
            <a href="#pricing" onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-black text-gray-600 uppercase tracking-widest border-b border-gray-50 pb-3">{t('nav_pricing')}</a>
            <button onClick={() => {setActiveModal('security'); setIsMobileMenuOpen(false);}} className="text-left text-sm font-black text-gray-600 uppercase tracking-widest border-b border-gray-50 pb-3">{t('nav_security')}</button>
            <button onClick={() => {setActiveModal('contact'); setIsMobileMenuOpen(false);}} className="text-left text-sm font-black text-gray-600 uppercase tracking-widest border-b border-gray-50 pb-3">{t('footer_contact')}</button>

            <div className="flex gap-2 pt-2">
              {['en', 'bn', 'hi'].map(lang => (
                <button key={lang} onClick={() => {setLanguage(lang); setIsMobileMenuOpen(false);}} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest border ${language === lang ? 'bg-orange-50 border-orange-200 text-sanatani-orange' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  {lang === 'en' ? 'EN' : lang === 'bn' ? 'বাংলা' : 'हिन्दी'}
                </button>
              ))}
            </div>

            <button onClick={handleFreeSignupClick} className="w-full bg-sanatani-orange text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest mt-2 flex justify-center items-center gap-2 shadow-md">
              {t('btn_establish')} <ArrowRight size={14}/>
            </button>
          </div>
        )}
      </nav>

      {/* 🌟 HERO SECTION */}
      <section className="pt-32 pb-16 md:pt-40 md:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-gradient-to-b from-orange-500/10 via-red-500/5 to-transparent blur-3xl -z-10 rounded-full"></div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 border border-orange-200 text-sanatani-orange text-[10px] font-black uppercase tracking-widest mb-8 shadow-sm">
          <SparkleIcon /> {t('hero_badge')}
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-gray-900 tracking-tight mb-8 leading-tight max-w-5xl mx-auto">
          {t('hero_title_1')} <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">{t('hero_title_2')}</span>
        </h1>
        <p className="text-base md:text-xl font-bold text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">{t('hero_subtitle')}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={handleFreeSignupClick} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-600 text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-orange-500/20 hover:shadow-2xl transition-all hover:-translate-y-1 text-sm uppercase tracking-widest flex items-center justify-center gap-3">
            {t('btn_create_free')} <ChevronRight size={18} className={`transition-transform duration-300 ${isHovered ? 'translate-x-1' : ''}`}/>
          </button>
          <button onClick={handleWatchDemoClick} className="w-full sm:w-auto bg-white border-2 border-gray-200 text-gray-800 hover:border-sanatani-orange hover:text-sanatani-orange font-black px-8 py-4 rounded-2xl shadow-sm transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2">
            <PlayCircle size={18}/> {t('btn_watch_demo')}
          </button>
        </div>
      </section>

      {/* ✨ MULTI-LANGUAGE SYNCHRONIZED: GOD-MODE ECOSYSTEM CAPABILITIES SHOWCASE */}
      <section className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-xs font-black text-sanatani-orange uppercase tracking-widest mb-2">{t('enterprise_badge')}</h3>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{t('enterprise_title')}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gray-50/80 p-6 rounded-2xl border border-gray-100 hover:border-orange-200 transition-all flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-orange-100 text-sanatani-orange rounded-xl flex items-center justify-center mb-4"><Smartphone size={24}/></div>
              <h4 className="font-black text-gray-900 mb-2">{t('feat_apk_title')}</h4>
              <p className="text-xs font-bold text-gray-500 leading-relaxed">{t('feat_apk_desc')}</p>
            </div>

            <div className="bg-gray-50/80 p-6 rounded-2xl border border-gray-100 hover:border-orange-200 transition-all flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-4"><Zap size={24}/></div>
              <h4 className="font-black text-gray-900 mb-2">{t('feat_memo_title')}</h4>
              <p className="text-xs font-bold text-gray-500 leading-relaxed">{t('feat_memo_desc')}</p>
            </div>

            <div className="bg-gray-50/80 p-6 rounded-2xl border border-gray-100 hover:border-orange-200 transition-all flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4"><QrCode size={24}/></div>
              <h4 className="font-black text-gray-900 mb-2">{t('feat_qr_title')}</h4>
              <p className="text-xs font-bold text-gray-500 leading-relaxed">{t('feat_qr_desc')}</p>
            </div>

            <div className="bg-gray-50/80 p-6 rounded-2xl border border-gray-100 hover:border-orange-200 transition-all flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-4"><Headphones size={24}/></div>
              <h4 className="font-black text-gray-900 mb-2">{t('feat_support_title')}</h4>
              <p className="text-xs font-bold text-gray-500 leading-relaxed">{t('feat_support_desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 🛡️ TRUST BANNER */}
      <section className="bg-gray-950 py-10 border-b border-gray-800 relative z-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">{t('trust_banner')}</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
            <div className="flex items-center gap-2 text-white font-black text-lg md:text-xl"><ShieldCheck/> Ramakrishna Mission</div>
            <div className="flex items-center gap-2 text-white font-black text-lg md:text-xl"><ShieldCheck/> Local ISKCON</div>
            <div className="flex items-center gap-2 text-white font-black text-lg md:text-xl"><ShieldCheck/> Sanatani Sangha</div>
          </div>
        </div>
      </section>

      {/* 🚀 INTERACTIVE FEATURES CAROUSEL */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-4">{t('features_title')}</h2>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">{t('features_subtitle')}</p>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden ring-1 ring-black/5 max-w-5xl mx-auto flex flex-col md:flex-row">
          <div className="md:w-1/3 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100 flex flex-row md:flex-col overflow-x-auto md:overflow-visible">
            {featuresData.map((feature, index) => (
              <button key={index} onClick={() => setCurrentFeature(index)} className={`w-full text-left p-6 transition-all border-b md:border-b-0 md:border-l-4 border-transparent min-w-[200px] md:min-w-0 flex-shrink-0 ${currentFeature === index ? 'bg-white md:border-l-sanatani-orange shadow-sm' : 'hover:bg-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${currentFeature === index ? feature.bg + ' ' + feature.color : 'bg-gray-200 text-gray-500'}`}>{React.cloneElement(feature.icon, { size: 20 })}</div>
                  <h4 className={`text-sm font-black tracking-tight ${currentFeature === index ? 'text-gray-900' : 'text-gray-500'}`}>{feature.title}</h4>
                </div>
              </button>
            ))}
          </div>

          <div className="md:w-2/3 p-8 md:p-12 flex items-center relative overflow-hidden bg-white min-h-[400px]">
            <div className={`absolute -right-20 -bottom-20 w-64 h-64 rounded-full blur-3xl opacity-20 transition-colors duration-500 ${featuresData[currentFeature].bg}`}></div>
            <div className="relative z-10 w-full animate-in fade-in slide-in-from-right-4 duration-500 text-center md:text-left" key={currentFeature}>
              {/* ✨ Centered Icon on Mobile */}
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-white/50 mx-auto md:mx-0 ${featuresData[currentFeature].bg} ${featuresData[currentFeature].color}`}>{featuresData[currentFeature].icon}</div>
              <h3 className="text-3xl font-black text-gray-900 mb-6 tracking-tight leading-tight">{featuresData[currentFeature].title}</h3>
              <div className="space-y-6 text-left">
                <div className="bg-red-50/50 border-l-4 border-red-400 p-4 rounded-r-xl">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">The Problem</p>
                  <p className="text-sm font-bold text-gray-700 leading-relaxed">{featuresData[currentFeature].pain}</p>
                </div>
                <div className="bg-green-50/50 border-l-4 border-green-500 p-4 rounded-r-xl shadow-sm">
                  <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-1">The Solution</p>
                  <p className="text-sm font-bold text-gray-800 leading-relaxed">{featuresData[currentFeature].solution}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 💰 PRICING SECTION */}
      <section id="pricing" className="py-24 bg-gray-950 px-4 sm:px-6 lg:px-8 text-white relative z-10">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">{t('pricing_title')}</h2>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t('pricing_subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto items-stretch">
            <div className="bg-gray-900 p-8 md:p-10 rounded-3xl border border-gray-800 shadow-xl flex flex-col h-full">
              <div className="flex items-center gap-3 mb-4"><ShieldCheck className="text-gray-400" size={24}/><h3 className="text-2xl font-black text-white">Community Free</h3></div>
              <div className="mb-8"><span className="text-5xl font-black">৳0</span><span className="text-gray-400 font-bold ml-2 uppercase tracking-widest text-xs">{t('pricing_forever')}</span></div>
              <ul className="space-y-5 mb-10 flex-1">
                <li className="flex items-center gap-3 text-sm font-bold text-gray-300"><CheckCircle2 size={18} className="text-gray-600 shrink-0"/> {t('free_feat_1').replace('{X}', limits.members)}</li>
                <li className="flex items-center gap-3 text-sm font-bold text-gray-300"><CheckCircle2 size={18} className="text-gray-600 shrink-0"/> {t('free_feat_2')}</li>
                <li className="flex items-center gap-3 text-sm font-bold text-gray-300"><CheckCircle2 size={18} className="text-gray-600 shrink-0"/> {t('free_feat_3').replace('{X}', limits.polls)}</li>
                <li className="flex items-center gap-3 text-sm font-bold text-gray-300"><CheckCircle2 size={18} className="text-gray-600 shrink-0"/> {t('free_feat_4').replace('{X}', limits.pdfs)}</li>
              </ul>
              <button onClick={handleFreeSignupClick} className="w-full bg-white text-gray-900 font-black py-4 rounded-xl transition-colors hover:bg-gray-200 text-xs uppercase tracking-widest shadow-md mt-auto">
                {t('btn_start_free')}
              </button>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-red-600 p-8 md:p-10 rounded-3xl shadow-2xl relative flex flex-col h-full ring-4 ring-orange-500/30">
              <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-gray-950 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-gray-700 shadow-lg">Most Popular</div>
              <div className="flex items-center gap-3 mb-4"><Crown className="text-white" size={24}/><h3 className="text-2xl font-black text-white">Smart Pro</h3></div>
              <div className="mb-8">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black">৳{Number(proPlan.priceBdt).toLocaleString()}</span>
                  <span className="text-lg font-bold text-gray-300 line-through decoration-red-900 decoration-2">৳{Number(proPlan.originalBdtPrice).toLocaleString()}</span>
                </div>
                <span className="text-orange-100 font-bold uppercase tracking-widest text-[10px] bg-black/20 px-2 py-1 rounded-md inline-block mt-2">
                  {proPlan.duration} • {proPlan.subtitle}
                </span>
              </div>
              <ul className="space-y-5 mb-10 flex-1">
                {proPlan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-black text-white"><CheckCircle2 size={18} className="text-orange-200 shrink-0"/> {feature}</li>
                ))}
              </ul>
              <button onClick={handleProUpgradeClick} className="w-full bg-gray-950 text-white font-black py-4 rounded-xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 text-xs uppercase tracking-widest border border-gray-800 mt-auto">
                {t('btn_upgrade_pro')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 🕉️ FOOTER */}
      <footer className="bg-gray-950 py-16 border-t border-gray-900 text-white relative z-10 pb-32 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            {/* ✨ SINGLE UNIFIED LOGO IN FOOTER */}
            <img src="/icon-512x512.png" alt="Sanatani Bandhan Logo" className="h-10 w-auto object-contain rounded-xl shadow-sm" />
            <div className="text-2xl font-black tracking-tight">Sanatani <span className="text-sanatani-orange">Bandhan</span></div>
          </div>
          <p className="text-sm font-black text-gray-500 uppercase tracking-widest mb-10">"Dharmo Rakshati Rakshitah"</p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mb-12">
            <button onClick={() => setActiveModal('privacy')} className="text-xs font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-widest">{t('footer_privacy')}</button>
            <button onClick={() => setActiveModal('terms')} className="text-xs font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-widest">{t('footer_terms')}</button>
            <button onClick={() => setActiveModal('contact')} className="text-xs font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-widest">{t('footer_contact')}</button>
          </div>
          <div className="pt-8 border-t border-gray-900 flex flex-col items-center">
            <p className="text-xs font-bold text-gray-500">© {new Date().getFullYear()} Sanatani Bandhan. Built with devotion by <span className="text-sanatani-orange font-black">TrackIQ Academy</span>.</p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900 border border-gray-800 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <Globe2 size={12}/> {t('trust_banner')}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0L13.7915 8.20846L22 10L13.7915 11.7915L12 20L10.2085 11.7915L2 10L10.2085 8.20846L12 0Z" fill="currentColor"/>
    </svg>
  );
}
