import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, Users, Receipt, Settings, LogOut, Menu, X, 
  WifiOff, AlertTriangle, CheckCircle2, Heart, GitBranch, 
  ScrollText, CalendarDays, Sparkles, Banknote, ShieldCheck, 
  Megaphone, ChevronRight, Globe2
} from 'lucide-react';
import { resolveWorkspacePlugin } from '../config/workspaceRegistry';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

// ✨ IMPORT UNIVERSAL CORE COMPONENTS
import DashboardHome from './DashboardHome'; 
import DevoteeGrid from './DevoteeGrid'; 
import VivahBandhanDesk from './VivahBandhanDesk';
import VanshavaliDesk from './VanshavaliDesk';
import PitruShradhDesk from './PitruShradhDesk';
import UtsavPanjika from './UtsavPanjika';
import PoojaBookingDesk from './PoojaBookingDesk';
import TreasuryLedger from './TreasuryLedger';
import TaxReceiptDesk from './TaxReceiptDesk';
import LegalVaultDesk from './LegalVaultDesk';
import SandeshDesk from './SandeshDesk';
import MasterSettings from './MasterSettings'; 

export default function ClientDashboardLayout({ session, isOnline = navigator.onLine }) {
  const { t, language, setLanguage } = useLanguage();

  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState(isOnline);

  // ✨ RESOLVE THE DYNAMIC PLUGIN BASED ON WORKSPACE TYPE
  const orgType = session?.type || session?.workspaceType || 'Mandir';
  const activePlugin = resolveWorkspacePlugin(orgType);
  const PluginIcon = activePlugin?.icon || LayoutDashboard;
  const PluginComponent = activePlugin?.component || DashboardHome;

  useEffect(() => {
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { 
      window.removeEventListener('online', handleOnline); 
      window.removeEventListener('offline', handleOffline); 
    };
  }, []);

  const handleLogout = async () => {
    if (window.confirm(t('confirm_logout') || "Are you sure you want to log out of your workspace?")) {
      await signOut(auth);
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setIsMobileMenuOpen(false);
    pushToDataLayer('navigate_tab', { tab_name: tabId });
  };

  // ✨ VISIBILITY LOGIC: Determine which specialized tabs to show
  const isCommunityOrg = useMemo(() => ['Mandir', 'Samaj', 'Sangha', 'Purohit'].includes(orgType), [orgType]);
  const isDhamOrAshram = useMemo(() => ['Ashram', 'Tirth', 'Mandir'].includes(orgType), [orgType]);

  // ✨ CATEGORIZED ENTERPRISE NAVIGATION STRUCTURE (Dynamic & Translated)
  const navGroups = useMemo(() => [
    {
      group: t('nav_group_core') || 'Core Workspace',
      items: [
        { id: 'OVERVIEW', label: t('nav_home') || 'Dashboard Home', icon: LayoutDashboard },
        { id: 'PLUGIN_DESK', label: activePlugin?.navTitle || `${orgType} Desk`, icon: PluginIcon, isSpecial: true }
      ]
    },
    {
      group: t('nav_group_community') || 'Community & Devotees',
      items: [
        { id: 'MEMBERS', label: t('nav_directory') || 'Devotee Directory', icon: Users },
        // Conditionally inject Matrimonial & Lineage for relevant orgs
        ...(isCommunityOrg ? [
          { id: 'VIVAH', label: t('nav_vivah') || 'Vivah Matrimonial', icon: Heart },
          { id: 'VANSHAVALI', label: t('nav_vanshavali') || 'Lineage Registry', icon: GitBranch }
        ] : []),
        // Conditionally inject Shradh for Ashrams and Mandirs
        ...(isDhamOrAshram ? [
          { id: 'SHRADH', label: t('nav_shradh') || 'Pitru Shradh Desk', icon: ScrollText }
        ] : [])
      ]
    },
    {
      group: t('nav_group_logistics') || 'Rituals & Logistics',
      items: [
        { id: 'PANJIKA', label: t('nav_panjika')?.split('&')[0] || 'Utsav Panjika', icon: CalendarDays },
        { id: 'POOJA', label: t('nav_pooja')?.split('&')[0] || 'Pooja Bookings', icon: Sparkles }
      ]
    },
    {
      group: t('nav_group_finance') || 'Finance & Legal',
      items: [
        { id: 'TREASURY', label: t('nav_treasury') || 'Treasury Ledger', icon: Banknote },
        { id: 'TAX', label: t('nav_tax') || 'Tax E-Receipts', icon: Receipt },
        { id: 'VAULT', label: t('nav_vault') || 'Legal Vault', icon: ShieldCheck }
      ]
    },
    {
      group: t('nav_group_settings') || 'Outreach & Settings',
      items: [
        { id: 'SANDESH', label: t('nav_prachar') || 'Sandesh Broadcast', icon: Megaphone },
        { id: 'SETTINGS', label: t('nav_settings') || 'Master Settings', icon: Settings }
      ]
    }
  ], [t, orgType, activePlugin, isCommunityOrg, isDhamOrAshram]);

  const renderContent = () => {
    switch (activeTab) {
      case 'OVERVIEW': return <DashboardHome session={session} isOnline={onlineStatus} setActiveTab={handleTabChange} />;
      case 'PLUGIN_DESK': return <PluginComponent session={session} isOnline={onlineStatus} />;
      case 'MEMBERS': return <DevoteeGrid session={session} isOnline={onlineStatus} />;
      case 'VIVAH': return <VivahBandhanDesk session={session} isOnline={onlineStatus} />;
      case 'VANSHAVALI': return <VanshavaliDesk session={session} isOnline={onlineStatus} />;
      case 'SHRADH': return <PitruShradhDesk session={session} isOnline={onlineStatus} />;
      case 'PANJIKA': return <UtsavPanjika session={session} isOnline={onlineStatus} />;
      case 'POOJA': return <PoojaBookingDesk session={session} isOnline={onlineStatus} />;
      case 'TREASURY': return <TreasuryLedger session={session} isOnline={onlineStatus} />;
      case 'TAX': return <TaxReceiptDesk session={session} isOnline={onlineStatus} />;
      case 'VAULT': return <LegalVaultDesk session={session} isOnline={onlineStatus} />;
      case 'SANDESH': return <SandeshDesk session={session} isOnline={onlineStatus} />;
      case 'SETTINGS': return <MasterSettings session={session} isOnline={onlineStatus} />;
      default: return <DashboardHome session={session} isOnline={onlineStatus} setActiveTab={handleTabChange} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans relative selection:bg-orange-500 selection:text-white">

      {/* ✨ OFFLINE BANNER */}
      {!onlineStatus && (
        <div className="absolute top-0 left-0 w-full bg-red-600 text-white p-2.5 text-center flex items-center justify-center gap-2 shadow-lg z-[100] animate-pulse">
          <WifiOff size={16} />
          <span className="text-[11px] font-black uppercase tracking-widest">Offline Mode: Operating securely from local cache</span>
        </div>
      )}

      {/* 📱 MOBILE TOP HEADER */}
      <div className={`md:hidden fixed left-0 right-0 h-16 bg-white/90 backdrop-blur-md border-b border-gray-200 z-50 flex items-center justify-between px-4 shadow-sm ${!onlineStatus ? 'top-10' : 'top-0'}`}>
        <div className="flex items-center gap-3 truncate">
          <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm shrink-0">
             {session?.communityName ? session.communityName.charAt(0).toUpperCase() : 'ॐ'}
          </div>
          <span className="font-black text-sm text-gray-900 truncate">{session?.communityName || 'Workspace'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile Language Switcher */}
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-gray-100 border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="en">EN</option>
            <option value="bn">বাং</option>
            <option value="hi">हि</option>
          </select>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            className="p-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors active:scale-95"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* 🖥️ SIDEBAR NAVIGATION (RESPONSIVE DRAWER ON MOBILE) */}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col shadow-sm ${isMobileMenuOpen ? 'translate-x-0 pt-16 md:pt-0' : '-translate-x-full md:translate-x-0'} ${!onlineStatus && window.innerWidth < 768 ? 'pt-24' : ''}`}>

        {/* Desktop Branding Header */}
        <div className="hidden md:flex flex-col items-center justify-center py-8 border-b border-gray-100 px-6 text-center bg-gradient-to-b from-gray-50/50 to-white shrink-0">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-md mb-3 ring-4 ring-orange-100">
             {session?.communityName ? session.communityName.charAt(0).toUpperCase() : 'ॐ'}
          </div>
          <h1 className="font-black text-base text-gray-900 tracking-tight leading-tight truncate w-full">{session?.communityName || 'Workspace'}</h1>
          <span className="text-[10px] font-black text-sanatani-orange uppercase tracking-widest mt-1.5 border border-orange-200 bg-orange-50 px-3 py-1 rounded-full">
            {orgType} Workspace
          </span>
        </div>

        {/* Nested Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-5 scrollbar-hide">
          {navGroups.map((section, idx) => (
            <div key={idx} className="space-y-1.5">
               <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2">{section.group}</h4>
               {section.items.map((item) => {
                 const isActive = activeTab === item.id;
                 const Icon = item.icon;
                 return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 ${
                        isActive 
                          ? item.isSpecial 
                            ? `${activePlugin?.bg || 'bg-orange-50'} ${activePlugin?.accent || 'text-orange-700'} border ${activePlugin?.border || 'border-orange-200'} shadow-sm` 
                            : 'bg-gray-900 text-white shadow-md'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Icon size={16} className={isActive && !item.isSpecial ? 'text-white' : item.isSpecial ? activePlugin?.accent : 'text-gray-400'} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {isActive && <ChevronRight size={14} className="opacity-50 shrink-0" />}
                    </button>
                 );
               })}
            </div>
          ))}
        </nav>

        {/* User Profile & Secure Logout Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <div className="bg-white border border-gray-200 p-3.5 rounded-2xl mb-3 shadow-sm flex justify-between items-center">
            <div className="min-w-0">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Logged in as</p>
              <p className="text-xs font-black text-gray-900 truncate">{session?.userName || 'Admin'}</p>
            </div>
            {/* Desktop Language Switcher */}
            <div className="hidden md:flex items-center gap-1 text-gray-400 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
              <Globe2 size={14}/>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer"
              >
                <option value="en">EN</option>
                <option value="bn">BN</option>
                <option value="hi">HI</option>
              </select>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-white text-red-600 font-black rounded-xl hover:bg-red-50 hover:border-red-200 border border-gray-200 transition-all text-xs uppercase tracking-widest shadow-sm active:scale-95"
          >
            <LogOut size={16} /> Secure Logout
          </button>
        </div>
      </aside>

      {/* 📄 MAIN CONTENT VIEWPORT AREA */}
      <main className={`flex-1 h-screen overflow-y-auto ${!onlineStatus ? 'pt-24 md:pt-10' : 'pt-16 md:pt-0'} bg-gray-50 relative flex flex-col justify-between`}>
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full animate-in fade-in duration-300 flex-1">
          {renderContent()}
        </div>

        <footer className="py-6 px-6 text-center text-xs font-bold text-gray-400 border-t border-gray-200 bg-white shrink-0">
          Sanatani Bandhan Enterprise • Powered by <span className="text-sanatani-orange font-black">TrackIQ Academy</span>
        </footer>
      </main>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-200" onClick={() => setIsMobileMenuOpen(false)} />
      )}
    </div>
  );
}
