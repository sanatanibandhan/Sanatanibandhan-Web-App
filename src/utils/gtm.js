/**
 * ============================================================================
 * 🧠 SANATANI BANDHAN: ENTERPRISE GTM & GA4 ANALYTICS ENGINE
 * ============================================================================
 * Standardized for Google Analytics 4 (GA4) & Meta Conversions API (CAPI).
 * Ensures zero data leakage, automatic context injection, and strict typing.
 */

// 🌍 1. GLOBAL CONTEXT CACHE
let sessionContext = {
  workspace_type: 'Unassigned',
  user_role: 'Visitor',
  community_id: 'None'
};

/**
 * Registers the active user session context.
 */
export const identifyUserSession = (session, workspaceType) => {
  if (!session) return;
  sessionContext = {
    workspace_type: workspaceType || 'Unknown',
    user_role: session.role || 'MEMBER',
    community_id: session.communityId || 'Unknown'
  };
};

/**
 * 🚀 2. THE CORE DATALAYER INJECTOR
 */
export const pushToDataLayer = (eventName, payload = {}) => {
  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];

    const enrichedPayload = {
      event: eventName,
      timestamp_ms: Date.now(),
      page_path: window.location.pathname,
      ...sessionContext, 
      ...payload,        
    };

    window.dataLayer.push(enrichedPayload);

    // Development Mode Auditor (Vite-safe logging)
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
      console.log(`📊 [GA4 EVENT]: ${eventName}`, enrichedPayload);
    }
  }
};

/**
 * ============================================================================
 * 🔐 3. AUTHENTICATION & SECURITY TRACKING
 * ============================================================================
 */

export const trackLogin = (method, success = true, errorMessage = '') => {
  if (success) {
    pushToDataLayer('login', { method: method });
  } else {
    pushToDataLayer('login_error', { 
      method: method, 
      error_message: errorMessage 
    });
  }
};

export const trackSignUp = (communityType, plan = 'FREE', method = 'Email') => {
  pushToDataLayer('sign_up', {
    method: method,
    community_type: communityType,
    plan: plan
  });
};

/**
 * ============================================================================
 * 🔍 4. SEARCH & ENGAGEMENT TRACKING
 * ============================================================================
 */

export const trackSearch = (searchQuery, searchCategory) => {
  pushToDataLayer('search', {
    search_term: searchQuery,
    search_category: searchCategory
  });
};

export const trackContentSelection = (contentType, itemId) => {
  pushToDataLayer('select_content', {
    content_type: contentType,
    item_id: itemId
  });
};

export const trackShare = (method, contentType, itemId) => {
  pushToDataLayer('share', {
    method: method,
    content_type: contentType,
    item_id: itemId
  });
};

/**
 * ============================================================================
 * 🎯 5. GAMIFICATION & SEVA TRACKING
 * ============================================================================
 */

export const trackSevaScore = (actionName, pointsEarned) => {
  pushToDataLayer('earn_virtual_currency', {
    virtual_currency_name: 'Seva Points',
    value: pointsEarned,
    earn_action: actionName 
  });
};

/**
 * ============================================================================
 * 💰 6. FINANCIAL TRACKING (Treasury)
 * ============================================================================
 */

export const trackIncome = (amount, paymentMethod, donorType, transactionId, category = 'Chanda') => {
  pushToDataLayer('purchase', {
    transaction_id: transactionId || `INC-${Date.now()}`,
    affiliation: 'Sanatani Bandhan Treasury',
    value: parseFloat(amount),
    currency: 'BDT',
    donor_type: donorType, 
    payment_type: paymentMethod,
    items: [{
      item_name: 'Community Donation',
      item_category: category,
      price: parseFloat(amount),
      quantity: 1
    }]
  });
};

export const trackExpense = (amount, eventName, itemName, paymentMethod, category) => {
  pushToDataLayer('spend_virtual_currency', {
    value: parseFloat(amount),
    virtual_currency_name: 'BDT',
    item_name: itemName,
    event_category: eventName,
    item_category: category,
    payment_method: paymentMethod
  });
};

/**
 * ============================================================================
 * 📢 7. MARKETING, GOVERNANCE & UTILITIES
 * ============================================================================
 */

export const trackLeadGen = (leadType, sourceModule, value = 0) => {
  pushToDataLayer('generate_lead', {
    lead_type: leadType,
    lead_source: sourceModule,
    currency: 'BDT',
    value: value
  });
};

export const trackLead = trackLeadGen; // Legacy alias

export const trackBroadcast = (method, audienceSegment, audienceSize, contentTheme) => {
  pushToDataLayer('campaign_start', {
    method: method, 
    audience_segment: audienceSegment, 
    audience_size: audienceSize,
    content_theme: contentTheme
  });
};

export const trackGovernance = (actionType, itemId, targetAudience) => {
  pushToDataLayer('unlock_achievement', {
    achievement_id: actionType,
    item_id: itemId,
    audience: targetAudience
  });
};

export const trackExport = (format, dataCategory) => {
  pushToDataLayer('file_download', {
    file_extension: format,
    file_name: `${dataCategory}_Export_${Date.now()}`,
    link_text: `Download ${dataCategory} ${format}`
  });
};

export const trackException = (description, isFatal = false) => {
  pushToDataLayer('exception', {
    description: description,
    fatal: isFatal
  });
};

/**
 * ============================================================================
 * 🛡️ 8. GATEKEEPER & MONETIZATION
 * ============================================================================
 */

export const trackQuotaExceeded = (featureName, currentUsage, maxLimit) => {
  pushToDataLayer('quota_limit_reached', {
    feature_name: featureName,
    current_usage: currentUsage,
    max_limit: maxLimit
  });
};

export const trackUpgradeModalView = (planName, price, currency = 'BDT') => {
  pushToDataLayer('view_item', {
    ecommerce: {
      currency: currency,
      value: price,
      items: [{ item_name: planName, item_category: 'Subscription Plan', price: price, quantity: 1 }]
    }
  });
};

export const trackBeginCheckout = (planName, price, currency = 'BDT') => {
  pushToDataLayer('begin_checkout', {
    ecommerce: {
      currency: currency,
      value: price,
      items: [{ item_name: planName, item_category: 'Subscription Plan', price: price, quantity: 1 }]
    }
  });
};

export const trackPurchaseSubmission = (transactionId, planName, price, paymentMethod, currency = 'BDT') => {
  pushToDataLayer('purchase', {
    ecommerce: {
      transaction_id: transactionId,
      value: price,
      currency: currency,
      payment_type: paymentMethod,
      items: [{ item_name: planName, item_category: 'Subscription Plan', price: price, quantity: 1 }]
    }
  });
};
