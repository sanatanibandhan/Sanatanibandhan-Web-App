import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { trackQuotaExceeded, trackUpgradeModalView } from '../utils/gtm';

export function usePlanGate(session) {
  const [plan, setPlan] = useState('FREE');
  const [usage, setUsage] = useState({});
  
  // Default fallback limits matching your live database structure
  const [globalLimits, setGlobalLimits] = useState({
    free_member_limit: 50,
    free_sandesh_limit: 5,
    free_poll_limit: 2,
    free_pdf_limit: 4,
    free_audit_limit: 3
  });

  useEffect(() => {
    if (!session?.communityId) return;

    // 1. Fetch workspace plan & real-time usage
    const commRef = ref(db, `communities/${session.communityId}`);
    const unsubComm = onValue(commRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        // Checks both locations where you store plans (info.plan or direct plan)
        setPlan(val.info?.plan || val.plan || 'FREE'); 
        setUsage(val.usage_tracking || {});
      }
    });

    // 2. Fetch your live global limits from app_config
    const globalRef = ref(db, 'app_config/global_settings');
    const unsubGlobal = onValue(globalRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setGlobalLimits({
          free_member_limit: data.free_member_limit || 50,
          free_sandesh_limit: data.free_sandesh_limit || 5,
          free_poll_limit: data.free_poll_limit || 2,
          free_pdf_limit: data.free_pdf_limit || 4,
          free_audit_limit: data.free_audit_limit || 3
        });
      }
    });

    return () => {
      unsubComm();
      unsubGlobal();
    };
  }, [session?.communityId]);

  // Define which plans bypass the gate completely
  const isUnlimited = plan === 'SAMRAT_PRO' || plan === 'PREMIUM';

  const checkQuota = (metricKey, onLimitReached) => {
    if (isUnlimited) return true;

    const current = usage[metricKey] || 0;
    const limit = globalLimits[metricKey] || Infinity;

    if (current >= limit) {
      // Trigger GA4 eCommerce analytics and show the paywall
      trackQuotaExceeded(metricKey, current, limit, session?.communityId);
      trackUpgradeModalView('Samrat Pro', 500, 'BDT'); 
      
      if (onLimitReached) onLimitReached({ current, limit, metricKey });
      
      // Return false to block the restricted action
      return false;
    }
    
    // Return true to allow the action to proceed
    return true;
  };

  return { plan, usage, globalLimits, isUnlimited, checkQuota };
}
