import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { ref, get, update, serverTimestamp } from 'firebase/database';
import { auth, db } from '../firebase';
import { 
  Loader2, ShieldCheck, Building2, User, Key, Mail, Phone, 
  Lock, ArrowLeft, AlertTriangle, MapPin, AlignLeft, Languages, Globe2, Navigation,
  QrCode, Camera, X, WifiOff, CheckCircle2 
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { trackLogin, trackSignUp, pushToDataLayer } from '../utils/gtm'; 
import jsQR from 'jsqr'; 

const encodeIdentity = (ident) => {
  if (!ident) return '';
  return ident.toString().trim().toLowerCase().replace(/\./g, ',');
};

const getCurrencyDetails = (country) => {
  switch(country) {
    case 'India': return { code: 'INR', symbol: '₹' };
    case 'Bangladesh': return { code: 'BDT', symbol: '৳' };
    case 'Nepal': return { code: 'NPR', symbol: 'रु' };
    case 'UK': return { code: 'GBP', symbol: '£' };
    case 'USA': return { code: 'USD', symbol: '$' };
    default: return { code: 'USD', symbol: '$' }; 
  }
};

export default function PortalLogin({ onLoginSuccess, onBackClick }) {
  const { language, setLanguage, t } = useLanguage(); 

  const [activeView, setActiveView] = useState('LOGIN'); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine); 

  // ENTERPRISE TOAST ENGINE
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // UNIFIED LOGIN STATES
  const [loginIdentity, setLoginIdentity] = useState(''); 
  const [loginCredential, setLoginCredential] = useState(''); 

  // QR SCANNER STATES
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // REGISTRATION STATES
  const [regData, setRegData] = useState({
    commName: '', type: 'Mandir', description: '', 
    adminName: '', email: '', phone: '', password: '',
    country: '', state: '', city: '', street: '',
    currency: { code: 'BDT', symbol: '৳' }
  });

  // OFFLINE SENTINEL
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

  const clearErrors = () => setError('');

  const handleError = (err) => {
    const msg = err.message || '';
    if (msg.includes('email-already-in-use')) {
      setError("This email is already registered. Please go to Secure Login.");
    } else if (msg.includes('Admin Profile missing')) {
      setError("Account setup incomplete. Please contact Master Support.");
    } else if (msg.includes('wrong-password') || msg.includes('invalid-credential') || msg.includes('user-not-found')) {
      setError("Invalid credentials. Please check your details and try again.");
    } else if (msg.includes('too-many-requests')) {
      setError("Too many failed attempts. Please try again later.");
    } else {
      setError(msg.replace('Firebase:', '').trim());
    }
  };

  const handleCountryChange = (e) => {
    const selectedCountry = e.target.value;
    const currencyDetails = getCurrencyDetails(selectedCountry);

    setRegData({ ...regData, country: selectedCountry, currency: currencyDetails });

    if (selectedCountry) {
      pushToDataLayer('location_selected', { 
        country: selectedCountry, 
        currency: currencyDetails.code,
        form_type: 'Workspace Registration' 
      });
    }
  };

  // ==========================================
  // 📸 QR SCANNER ENGINE
  // ==========================================
  const startScanner = async () => {
    setIsScanning(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", true);
        videoRef.current.play();
        requestAnimationFrame(tick);
      }
    } catch (err) {
      setIsScanning(false);
      setError("Camera access denied or unavailable.");
    }
  };

  const stopScanner = () => {
    setIsScanning(false);
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const tick = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      canvas.height = videoRef.current.videoHeight;
      canvas.width = videoRef.current.videoWidth;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

      if (code) {
        stopScanner();
        handleQRLogin(code.data);
        return;
      }
    }
    if (isScanning) requestAnimationFrame(tick);
  };

  const handleQRLogin = async (qrDataString) => {
    try {
      const qrPayload = JSON.parse(qrDataString);
      if (qrPayload.action !== "autologin" || !qrPayload.id || !qrPayload.pin) {
         throw new Error("Invalid QR Code Format.");
      }
      setLoginIdentity(qrPayload.id);
      setLoginCredential(qrPayload.pin);

      if(navigator.onLine) {
         handleSmartLogin(null, qrPayload.id, qrPayload.pin, true);
      } else {
         setError("Credentials scanned. Please tap Login to use offline cache.");
      }
    } catch (err) {
      setError("Unrecognized QR Code. Please scan an official Sanatani ID Card.");
    }
  };

  // ==========================================
  // 🚀 GLOBAL OMNI-LOGIN (GA4 TRACKED)
  // ==========================================
  const handleSmartLogin = async (e, forceId = null, forcePin = null, isQR = false) => {
    if (e) e.preventDefault();
    clearErrors();

    const identTrim = (forceId || loginIdentity).trim();
    const credTrim = (forcePin || loginCredential).trim();

    if (!identTrim || !credTrim) return setError("Please provide your login details.");

    setLoading(true);

    if (!navigator.onLine) {
      try {
         const cachedSession = localStorage.getItem('sb_active_session');
         if (cachedSession) {
            const parsedSession = JSON.parse(cachedSession);
            if (parsedSession.email === identTrim || parsedSession.uid === identTrim) {
               onLoginSuccess(parsedSession);
               return;
            }
         }
         throw new Error("No offline cache available for this ID. Please connect to internet for first-time login.");
      } catch (err) {
         setLoading(false);
         return handleError(err);
      }
    }

    try {
      const encodedIdent = encodeIdentity(identTrim);
      const mapSnap = await get(ref(db, `identity_map/${encodedIdent}`));

      let commId, memberId, type, authEmail;

      if (mapSnap.exists()) {
        const mapData = mapSnap.val();
        commId = mapData.commId;
        memberId = mapData.memberId;
        type = mapData.type; 
        authEmail = mapData.authEmail; 
      } else {
        if (identTrim.includes('@')) {
          type = 'ADMIN';
          authEmail = identTrim;
        } else {
          if(identTrim.startsWith('SB-') || identTrim.startsWith('MD-') || identTrim.startsWith('ORG-') || identTrim.startsWith('GS-') || identTrim.startsWith('AS-') || identTrim.startsWith('GK-') || identTrim.startsWith('SK-') || identTrim.startsWith('YK-') || identTrim.startsWith('TR-') || identTrim.startsWith('VD-') || identTrim.startsWith('PR-')) {
             throw new Error("Direct ID login requires workspace scanning. Use Phone/Email or Scan QR.");
          }
          throw new Error("Account not found. Please check your Phone or Email.");
        }
      }

      let sessionData = {};
      const loginMethod = isQR ? 'QR_Scan' : (identTrim.includes('@') ? 'Email' : 'Phone');

      if (type === 'ADMIN') {
        const userCred = await signInWithEmailAndPassword(auth, authEmail, credTrim);
        const uid = userCred.user.uid;
        const userSnap = await get(ref(db, `users/${uid}`)); 
        if (!userSnap.exists()) throw new Error("Admin Profile missing from database.");

        const userData = userSnap.val();
        commId = userData.communityId;

        const infoSnapAdmin = await get(ref(db, `communities/${commId}/info`));
        const infoDataAdmin = infoSnapAdmin.exists() ? infoSnapAdmin.val() : {};

        if (infoDataAdmin.status === 'BANNED') throw new Error("🚫 ACCESS DENIED: Your workspace is banned.");

        // 🎯 GA4 RECOMMENDED EVENT: login
        trackLogin(loginMethod, true, '');

        sessionData = {
          communityId: commId,
          role: userData.role || 'ADMIN',
          communityName: userData.communityName,
          userName: userData.name,
          uid: 'ADMIN-001',
          email: authEmail,
          plan: infoDataAdmin.plan || 'FREE',
          currency: infoDataAdmin.currency || { code: 'BDT', symbol: '৳' } 
        };

      } else {
        const infoSnap = await get(ref(db, `communities/${commId}/info`));
        const infoData = infoSnap.exists() ? infoSnap.val() : {};

        if (infoData.status === 'BANNED') throw new Error("🚫 ACCESS DENIED: This workspace is banned.");

        const pinSnap = await get(ref(db, `communities/${commId}/logins/${memberId}`));
        const memberSnap = await get(ref(db, `communities/${commId}/members/${memberId}`));

        if (!pinSnap.exists() || !memberSnap.exists()) throw new Error("Profile integrity error. Contact Admin.");

        const dbPin = pinSnap.val();
        const memberData = memberSnap.val();
        const dbPassword = memberData.password; 

        if ((dbPin && dbPin === credTrim) || (dbPassword && dbPassword === credTrim)) {

          // 🎯 GA4 RECOMMENDED EVENT: login
          trackLogin(loginMethod, true, '');

          sessionData = {
            communityId: commId,
            role: memberData.role,
            communityName: infoData.communityName || t('workspace'),
            userName: memberData.name,
            uid: memberData.id,
            email: memberData.email || '',
            plan: infoData.plan || 'FREE',
            currency: infoData.currency || { code: 'BDT', symbol: '৳' } 
          };
        } else {
          throw new Error("Invalid Password or Secure PIN.");
        }
      }

      localStorage.setItem('sb_active_session', JSON.stringify(sessionData));
      onLoginSuccess(sessionData);

    } catch (err) {
      trackLogin('Login_Attempt', false, err.message);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 📝 REGISTRATION ENGINE (GA4 TRACKED)
  // ==========================================
  const handleRegister = async (e) => {
    e.preventDefault();
    clearErrors();

    if (!navigator.onLine) return setError("Internet connection required to create a new workspace.");

    const { commName, type, description, adminName, email, phone, password, country, state, city, street, currency } = regData;

    if (!commName || !adminName || !email || !phone || !password) return setError("Please fill all core required fields.");
    if (!country || !state || !city) return setError("Please complete the Location / Address Picker section.");

    setLoading(true);
    try {
      const encodedEmail = encodeIdentity(email);
      const encodedPhone = encodeIdentity(phone);

      const emailCheck = await get(ref(db, `identity_map/${encodedEmail}`));
      const phoneCheck = await get(ref(db, `identity_map/${encodedPhone}`));

      if (emailCheck.exists()) throw new Error("This email is already registered. Please go to Secure Login.");
      if (phoneCheck.exists()) throw new Error("This phone number is already registered to another account.");

      const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCred.user.uid;

      // ✨ UPDATED: DYNAMIC PREFIX INCLUDES VIDYALAYA AND PUROHIT
      let prefix = 'OT-';
      if (type === 'Mandir') prefix = 'MD-';
      else if (type === 'Sangha') prefix = 'ORG-';
      else if (type === 'Goshala') prefix = 'GS-';
      else if (type === 'Ashram') prefix = 'AS-';
      else if (type === 'Gurukul') prefix = 'GK-';
      else if (type === 'Satsang') prefix = 'SK-';
      else if (type === 'Yoga') prefix = 'YK-';
      else if (type === 'Trust') prefix = 'TR-';
      else if (type === 'Vidyalaya') prefix = 'VD-';
      else if (type === 'Purohit') prefix = 'PR-';

      const commId = prefix + Math.floor(1000 + Math.random() * 9000);
      const ts = Date.now();

      const fullFormattedAddress = [street, city, state, country].filter(Boolean).join(', ').trim();

      const updates = {};

      updates[`communities/${commId}/name`] = commName.trim();
      updates[`communities/${commId}/info`] = {
        type, 
        communityName: commName.trim(), 
        address: fullFormattedAddress,
        location: { country, state, city, street },
        currency: currency, 
        description: description.trim(), 
        email: email.trim(), 
        phone: phone.trim(),
        plan: "FREE", 
        devoteeCount: 1, 
        createdAt: ts, 
        pdfsGeneratedThisMonth: 0, 
        broadcastsSentThisMonth: 0
      };

      updates[`communities/${commId}/members/ADMIN-001`] = {
        id: "ADMIN-001", name: adminName.trim(), email: email.trim(),
        phone: phone.trim(), role: "ADMIN", designation: type === 'Purohit' ? 'Head Purohit' : t('head_admin'),
        timestamp: serverTimestamp(), totalDonated: 0, lastDonationTimestamp: 0
      };

      updates[`users/${uid}`] = {
        communityId: commId, communityName: commName.trim(),
        role: "ADMIN", name: adminName.trim(), email: email.trim(), phone: phone.trim()
      };

      // Purohits are registered securely as the workspace ADMIN of their own instance
      updates[`identity_map/${encodedEmail}`] = { commId, memberId: "ADMIN-001", type: "ADMIN", authEmail: email.trim() };
      updates[`identity_map/${encodedPhone}`] = { commId, memberId: "ADMIN-001", type: "ADMIN", authEmail: email.trim() };

      await update(ref(db), updates);

      // 🎯 GA4 RECOMMENDED EVENT: sign_up
      trackSignUp(type, 'FREE', 'Email');

      const sessionData = {
        communityId: commId, role: "ADMIN", communityName: commName.trim(),
        userName: adminName.trim(), uid: "ADMIN-001", email: email.trim(), plan: "FREE",
        currency: currency 
      };

      localStorage.setItem('sb_active_session', JSON.stringify(sessionData));
      onLoginSuccess(sessionData);

    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!navigator.onLine) return showToast("Internet required to reset password.", "error");
    if (!loginIdentity.includes('@')) {
      return setError("Please enter your Admin Email Address in the Identity field first.");
    }
    try {
      await sendPasswordResetEmail(auth, loginIdentity.trim());
      pushToDataLayer('password_reset_requested', { email: loginIdentity.trim() });
      showToast("Reset link sent to your email inbox!", "success");
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4 sm:p-8 selection:bg-orange-100 selection:text-sanatani-orange relative">

      {/* GLOBAL CUSTOM TOAST ENGINE */}
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'offline' ? 'bg-orange-500/20 text-sanatani-orange' : toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'offline' ? <WifiOff size={20}/> : toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'offline' ? 'text-orange-400' : toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
               {toast.type === 'offline' ? 'Offline Cache' : toast.type === 'error' ? 'Error' : 'Success'}
             </p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* OFFLINE BANNER */}
      {!isOnline && (
        <div className="absolute top-0 w-full bg-red-600 text-white p-2 text-center flex items-center justify-center gap-2 shadow-sm z-[110]">
          <WifiOff size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest">Offline Mode: Cached Login Active</span>
        </div>
      )}

      {onBackClick && (
        <button onClick={onBackClick} className="absolute top-10 sm:top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-sanatani-orange text-xs font-black uppercase tracking-widest transition-colors bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200 z-10">
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {/* LANGUAGE POD */}
      <div className="absolute top-10 sm:top-6 right-6 z-50 group">
        <div className="relative">
          <button className="bg-white/90 backdrop-blur-md border border-gray-200 p-2.5 sm:p-3 rounded-full shadow-lg flex items-center justify-center hover:bg-orange-50 transition-all hover:scale-110 hover:border-orange-200">
            <Languages size={20} className="text-sanatani-orange" />
            <span className="absolute -top-1 -right-1 bg-gray-900 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white uppercase">
              {language === 'en' ? 'EN' : language === 'bn' ? 'বাং' : 'हि'}
            </span>
          </button>
          <div className="absolute top-full right-0 mt-2 w-40 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform -translate-y-4 group-hover:translate-y-0 overflow-hidden ring-1 ring-black/5 origin-top-right">
            <div className="p-3 bg-gray-50/80 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center flex items-center justify-center gap-1.5"><Globe2 size={12}/> Language</div>
            <button onClick={() => setLanguage('en')} className={`w-full text-left px-5 py-4 text-xs font-black tracking-widest transition-colors ${language === 'en' ? 'text-sanatani-orange bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>English</button>
            <button onClick={() => setLanguage('bn')} className={`w-full text-left px-5 py-4 text-xs font-black tracking-widest transition-colors ${language === 'bn' ? 'text-sanatani-orange bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>বাংলা</button>
            <button onClick={() => setLanguage('hi')} className={`w-full text-left px-5 py-4 text-xs font-black tracking-widest transition-colors ${language === 'hi' ? 'text-sanatani-orange bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>हिन्दी</button>
          </div>
        </div>
      </div>

      <div className="text-center mb-8 fade-in flex flex-col items-center mt-20 sm:mt-0">
        <img src="/icon-512x512.png" alt={t('app_name')} className="w-20 h-20 object-contain rounded-2xl shadow-lg mb-4" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
        <div className="hidden w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl items-center justify-center shadow-lg text-white text-4xl font-black mb-4">ॐ</div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{t('app_name')}</h1>
        <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{t('portal_subtitle')}</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden fade-in-up">

        {/* TOP TOGGLE */}
        <div className="flex bg-gray-50/80 border-b border-gray-100 p-2">
          <button onClick={() => { setActiveView('LOGIN'); clearErrors(); }} className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-2xl transition-all ${activeView === 'LOGIN' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            {t('login_secure')}
          </button>
          <button onClick={() => { setActiveView('REGISTER'); clearErrors(); }} className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-2xl transition-all ${activeView === 'REGISTER' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            {t('login_create')}
          </button>
        </div>

        <div className="p-6 sm:p-8 max-h-[65vh] overflow-y-auto scrollbar-hide relative">

          {/* FULLSCREEN QR SCANNER OVERLAY */}
          {isScanning && (
            <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center">
               <button onClick={stopScanner} className="absolute top-4 right-4 bg-white/20 text-white p-2 rounded-full hover:bg-red-500 transition-colors z-50">
                 <X size={24}/>
               </button>
               <h3 className="text-white font-black uppercase tracking-widest mb-4 flex items-center gap-2"><QrCode/> Scan Official ID</h3>
               <div className="relative w-64 h-64 rounded-2xl overflow-hidden border-4 border-sanatani-orange shadow-[0_0_50px_rgba(234,88,12,0.3)]">
                  <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute inset-0 border-[3px] border-white/30 m-8 rounded-lg pointer-events-none"></div>
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-sanatani-orange/50 shadow-[0_0_8px_#ea580c] animate-pulse"></div>
               </div>
               <p className="text-gray-400 text-xs mt-6 font-bold">Align QR code within the frame</p>
            </div>
          )}

          {activeView === 'LOGIN' ? (
            <form onSubmit={handleSmartLogin} className={`space-y-4 transition-opacity duration-300 ${isScanning ? 'opacity-0' : 'opacity-100'}`}>

              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl mb-4 text-center">
                <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center justify-center gap-1.5"><ShieldCheck size={12}/> Universal Access</p>
                <p className="text-xs text-blue-600 mt-1 font-bold">Admins, Members, and Purohits can securely login here using their Email, Phone, or ID.</p>
              </div>

              {/* QR SCAN BUTTON */}
              <button type="button" onClick={startScanner} className="w-full bg-gradient-to-r from-orange-50 to-red-50 hover:from-orange-100 hover:to-red-100 text-sanatani-orange font-black py-4 rounded-2xl border border-orange-200 text-xs uppercase tracking-widest transition-all flex justify-center items-center gap-2 shadow-sm mb-2">
                <QrCode size={20}/> {t('scan_auto_login') || 'Scan QR to Login'}
              </button>

              <div className="flex items-center gap-3 py-2 opacity-70">
                 <div className="h-px bg-gray-200 flex-1"></div>
                 <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">OR USE CREDENTIALS</span>
                 <div className="h-px bg-gray-200 flex-1"></div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{t('login_identity')}</label>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="text" required value={loginIdentity} onChange={e=>setLoginIdentity(e.target.value)} placeholder="Email, Phone, or ID" className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-800 focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm focus:ring-4 focus:ring-orange-50" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Password or PIN</label>
                <div className="relative">
                  <Key size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="password" required value={loginCredential} onChange={e=>setLoginCredential(e.target.value)} placeholder="Enter Password or 4-Digit PIN" className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-800 focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm focus:ring-4 focus:ring-orange-50" />
                </div>
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3.5 rounded-xl text-xs font-bold text-center animate-in zoom-in shadow-sm mt-2">{error}</div>}

              <button type="submit" disabled={loading} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-gray-700 hover:-translate-y-0.5 text-xs uppercase tracking-widest transition-all flex justify-center items-center gap-2 mt-6 disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin" /> : t('btn_access_portal')}
              </button>

              <div className="text-center mt-6">
                <button type="button" onClick={handleForgotPassword} className="text-xs font-bold text-gray-400 hover:text-sanatani-orange transition-colors">
                  {t('login_forgot')}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-6 animate-in fade-in duration-300">

              <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
                <AlertTriangle className="text-sanatani-orange shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">{t('reg_warning_title')}</h4>
                  <p className="text-xs font-bold text-orange-800 leading-relaxed">
                    {t('reg_warning_desc_1')}<strong>{regData.type}</strong>{t('reg_warning_desc_2')}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-4">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 flex items-center gap-2"><Building2 size={14}/> {t('reg_step1')}</h4>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{t('reg_org_type')}</label>
                  {/* ✨ EXPANDED 10-ITEM ORGANIZATION GRID */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {['Mandir', 'Goshala', 'Sangha', 'Ashram', 'Gurukul', 'Satsang', 'Yoga', 'Trust', 'Vidyalaya', 'Purohit'].map(type => (
                      <label key={type} className={`flex items-center justify-center py-2.5 px-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest cursor-pointer border transition-all ${regData.type === type ? 'bg-white border-sanatani-orange text-sanatani-orange shadow-sm ring-2 ring-orange-50' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                        <input type="radio" name="type" value={type} checked={regData.type === type} onChange={e => setRegData({...regData, type: e.target.value})} className="hidden" />
                        {type}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{regData.type} {t('reg_org_name')} *</label>
                  <input type="text" required value={regData.commName} onChange={e=>setRegData({...regData, commName: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:border-sanatani-orange outline-none shadow-sm transition-colors" placeholder={regData.type === 'Purohit' ? 'e.g. Pt. Ramchandra Services' : `e.g. Sri Krishna ${regData.type}`} />
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                   <div className="flex items-center gap-2 text-[10px] font-black text-sanatani-orange uppercase tracking-widest border-b border-gray-100 pb-2 mb-2">
                     <MapPin size={14}/> Location Details
                   </div>

                   <div>
                     <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Country *</label>
                     <div className="relative">
                       <Globe2 size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                       <select required value={regData.country} onChange={handleCountryChange} className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-sanatani-orange outline-none transition-all cursor-pointer appearance-none">
                         <option value="" disabled>Select Country...</option>
                         <option value="India">India (भारत)</option>
                         <option value="Bangladesh">Bangladesh (বাংলাদেশ)</option>
                         <option value="Nepal">Nepal (नेपाल)</option>
                         <option value="USA">United States</option>
                         <option value="UK">United Kingdom</option>
                         <option value="Other">Other Region</option>
                       </select>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">State / Division *</label>
                       <input type="text" required value={regData.state} onChange={e=>setRegData({...regData, state: e.target.value})} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-sanatani-orange outline-none transition-all" placeholder="e.g. West Bengal" />
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">City / District *</label>
                       <input type="text" required value={regData.city} onChange={e=>setRegData({...regData, city: e.target.value})} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-sanatani-orange outline-none transition-all" placeholder="e.g. Kolkata" />
                     </div>
                   </div>

                   <div>
                     <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Local Address (Optional)</label>
                     <div className="relative">
                       <Navigation size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                       <input type="text" value={regData.street} onChange={e=>setRegData({...regData, street: e.target.value})} className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:bg-white focus:border-sanatani-orange outline-none transition-all" placeholder="Street name, landmark..." />
                     </div>
                   </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('reg_desc')}</label>
                  <div className="relative">
                    <AlignLeft size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <textarea rows="2" value={regData.description} onChange={e=>setRegData({...regData, description: e.target.value})} className="w-full pl-10 pr-4 p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:border-sanatani-orange outline-none shadow-sm transition-colors resize-none" placeholder={regData.type === 'Purohit' ? 'Short description of your services...' : 'Short description of your community...'} />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-4">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 flex items-center gap-2"><User size={14}/> {t('reg_step2')}</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('reg_your_name')}</label>
                    <input type="text" required value={regData.adminName} onChange={e=>setRegData({...regData, adminName: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:border-sanatani-orange outline-none shadow-sm transition-colors" placeholder="Full Name" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('reg_your_phone')}</label>
                    <input type="tel" required value={regData.phone} onChange={e=>setRegData({...regData, phone: e.target.value})} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:border-sanatani-orange outline-none shadow-sm transition-colors" placeholder="Mobile Number" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('reg_official_email')}</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <input type="email" required value={regData.email} onChange={e=>setRegData({...regData, email: e.target.value})} className="w-full pl-10 pr-4 p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:border-sanatani-orange outline-none shadow-sm transition-colors" placeholder="admin@example.com" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{t('login_pass')} *</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <input type="password" required value={regData.password} onChange={e=>setRegData({...regData, password: e.target.value})} className="w-full pl-10 pr-4 p-3.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:border-sanatani-orange outline-none shadow-sm transition-colors" placeholder="Create a strong password" />
                  </div>
                </div>
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3.5 rounded-xl text-xs font-bold text-center animate-in zoom-in shadow-sm">{error}</div>}

              <button type="submit" disabled={loading} className="w-full bg-sanatani-orange hover:bg-orange-600 text-white font-black py-4 rounded-2xl shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 text-xs uppercase tracking-widest flex justify-center items-center gap-2 mt-6 disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin" /> : t('btn_create_dynamic').replace('{X}', regData.type.toUpperCase())}
              </button>
            </form>
          )}

        </div>

        <div className="bg-gray-50 border-t border-gray-100 p-4 sm:p-5 flex justify-center items-center gap-2 text-[9px] sm:text-[10px] font-black text-green-600 uppercase tracking-widest">
           <ShieldCheck size={16} /> AES-256 Encrypted Connection
        </div>
      </div>
    </div>
  );
}