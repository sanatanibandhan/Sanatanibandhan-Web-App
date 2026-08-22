import React, { useEffect } from 'react';
import { pushToDataLayer } from '../utils/gtm';
import CryptoJS from 'crypto-js';

export default function TawkToWidget({ session }) {
  useEffect(() => {
    // ⚠️ Updated Tawk.to Credentials from your dashboard
    const PROPERTY_ID = '6a79d630a971d21d457a02c7';
    const WIDGET_ID = '1jvlupc5u'; 
    const TAWK_API_KEY = '4fb3b36ead7e74cbac408a7aa14d834fdd787b4';

    // 1. Initialize Tawk.to Engine
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const s1 = document.createElement("script");
    const s0 = document.getElementsByTagName("script")[0];

    s1.async = true;
    s1.src = `https://embed.tawk.to/${PROPERTY_ID}/${WIDGET_ID}`; 
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');

    if (s0 && s0.parentNode) {
        s0.parentNode.insertBefore(s1, s0);
    } else {
        document.head.appendChild(s1);
    }

    // ✨ 2. INJECT MOBILE CSS FIX (Pushes widget above the bottom nav bar)
    const styleTag = document.createElement('style');
    styleTag.innerHTML = `
      @media (max-width: 768px) {
        #tawkchat-container, iframe[src*="tawk.to"] {
          bottom: 85px !important; /* Clears the mobile bottom navigation bar */
          right: 15px !important;
        }
      }
    `;
    document.head.appendChild(styleTag);

    // 3. Smart User Identification & SECURE MODE Authentication
    window.Tawk_API.onLoad = function() {
      if (session && (session.email || session.uid)) {
        // ✨ TAWK.TO SECURE MODE HASH GENERATION
        const userIdentifier = session.email || session.uid;
        const secureHash = CryptoJS.HmacSHA256(userIdentifier, TAWK_API_KEY).toString(CryptoJS.enc.Hex);

        // Push enriched data to your Tawk dashboard
        window.Tawk_API.setAttributes({
          'name': session.userName || 'Unknown Devotee',
          'email': session.email || '',
          'hash': secureHash, // Fulfills the Secure Mode requirement
          'Workspace ID': session.communityId || 'N/A',
          'Community Name': session.communityName || 'N/A',
          'Role': session.role || 'MEMBER',
          'Plan': session.plan || 'FREE'
        }, function (error) {
           if(error) console.error("Tawk.to attribute sync error:", error);
        });
      }
    };

    // 4. GTM Tracking: Fire event when user starts a chat
    window.Tawk_API.onChatStarted = function() {
      pushToDataLayer('support_chat_started', {
        user_type: session ? 'Registered' : 'Guest',
        community_id: session ? session.communityId : 'N/A'
      });
    };

    // Cleanup: Removes widget instances and style tag if component unmounts
    return () => {
      window.Tawk_API = {};
      const tawkIframes = document.querySelectorAll('iframe[src*="tawk.to"]');
      tawkIframes.forEach(iframe => iframe.remove());
      if (s1.parentNode) s1.parentNode.removeChild(s1);
      if (styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
    };
  }, [session]);

  return null; 
}
