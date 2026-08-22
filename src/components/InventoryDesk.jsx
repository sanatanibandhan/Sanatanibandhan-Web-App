import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, remove } from 'firebase/database';
import { db } from '../firebase';
import { 
  Package, Plus, Search, Filter, AlertTriangle, CheckCircle2, 
  WifiOff, Edit, Trash2, ArrowRight, TrendingUp, TrendingDown,
  Download, FileText, LayoutGrid, Box, ShoppingBag, Speaker,
  HelpCircle, Lightbulb, BrainCircuit, Loader2, X, BellRing, Scale
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function InventoryDesk({ session, isOnline = navigator.onLine }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);

  // 💾 OFFLINE CACHE INITIALIZATION
  const [inventory, setInventory] = useState(() => {
    try { const cached = localStorage.getItem(`sb_inventory_${session?.communityId}`); return cached ? JSON.parse(cached) : []; } catch { return []; }
  });

  // UI States
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, CONSUMABLE, FIXED_ASSET, STORE
  const [searchTerm, setSearchTerm] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Modals & Action States
  const [showItemModal, setShowItemModal] = useState(false);
  const [adjustStockModal, setAdjustStockModal] = useState({ show: false, item: null, action: 'ADD', amount: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    name: '', category: 'CONSUMABLE', quantity: '', unit: 'pcs', minThreshold: '', valuePerUnit: '', location: ''
  });

  const isManagerOrAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN' || session?.role === 'MANAGER';
  const curSymbol = session?.currency?.symbol || '৳';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_inventory', { user_role: session.role, community_id: session.communityId });

    const invRef = ref(db, `communities/${session.communityId}/inventory`);
    const unsubInv = onValue(invRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const arr = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        arr.sort((a, b) => b.lastUpdated - a.lastUpdated);
        setInventory(arr);
        localStorage.setItem(`sb_inventory_${session.communityId}`, JSON.stringify(arr));
      } else {
        setInventory([]);
        localStorage.removeItem(`sb_inventory_${session.communityId}`);
      }
      setLoading(false);
    });

    const failsafeTimer = setTimeout(() => setLoading(false), 1500);
    return () => { unsubInv(); clearTimeout(failsafeTimer); };
  }, [session?.communityId, session?.role]);

  const executeSafeUpdate = async (updates, successMsg = null, offlineMsg = null) => {
    if (!isOnline) {
      update(ref(db), updates).catch(e => console.error("Offline Sync Queued:", e));
      showToast(offlineMsg || t('offline_saved') || "Saved offline. Syncing soon.", 'offline');
      return Promise.resolve(); 
    }
    try {
      await update(ref(db), updates);
      if (successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast(t('error') + ": " + e.message, 'error');
      throw e;
    }
  };

  const logAudit = async (actionType, description) => {
    try { push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  // 📝 ADD / UPDATE ITEM
  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!isManagerOrAdmin) return showToast(t('err_unauthorized') || "Unauthorized.", "error");

    setIsProcessing(true);
    try {
      const ts = Date.now();
      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        quantity: Number(formData.quantity) || 0,
        unit: formData.unit,
        minThreshold: Number(formData.minThreshold) || 0,
        valuePerUnit: Number(formData.valuePerUnit) || 0,
        location: formData.location.trim() || 'Main Storage',
        lastUpdated: ts,
        updatedBy: session.userName
      };

      const updates = {};
      if (isEditing && editId) {
        updates[`communities/${session.communityId}/inventory/${editId}`] = payload;
        await executeSafeUpdate(updates, "Item updated successfully!", "Item update saved offline.");
        logAudit("INVENTORY_UPDATED", `Updated item: ${payload.name}`);
        pushToDataLayer('update_inventory', { item_name: payload.name, category: payload.category });
      } else {
        const newId = push(ref(db, `communities/${session.communityId}/inventory`)).key;
        payload.id = newId;
        payload.createdAt = ts;
        updates[`communities/${session.communityId}/inventory/${newId}`] = payload;
        await executeSafeUpdate(updates, "New item added to inventory!", "Item creation saved offline.");
        logAudit("INVENTORY_ADDED", `Added new item: ${payload.name}`);
        pushToDataLayer('add_inventory', { item_name: payload.name, category: payload.category });
      }

      closeModal();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // ⚖️ QUICK STOCK ADJUSTMENT (+ / -)
  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!isManagerOrAdmin) return;
    
    setIsProcessing(true);
    try {
      const item = adjustStockModal.item;
      const adjustAmount = Number(adjustStockModal.amount);
      if (adjustAmount <= 0) throw new Error("Amount must be greater than 0");

      const newQty = adjustStockModal.action === 'ADD' ? item.quantity + adjustAmount : item.quantity - adjustAmount;
      if (newQty < 0) throw new Error("Stock cannot be negative.");

      const updates = {};
      updates[`communities/${session.communityId}/inventory/${item.id}/quantity`] = newQty;
      updates[`communities/${session.communityId}/inventory/${item.id}/lastUpdated`] = Date.now();
      updates[`communities/${session.communityId}/inventory/${item.id}/updatedBy`] = session.userName;

      await executeSafeUpdate(updates, `Stock adjusted. New quantity: ${newQty} ${item.unit}`);
      logAudit("STOCK_ADJUSTED", `${adjustStockModal.action === 'ADD' ? 'Added' : 'Removed'} ${adjustAmount} ${item.unit} of ${item.name}`);
      
      setAdjustStockModal({ show: false, item: null, action: 'ADD', amount: '' });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteItem = (id, name) => {
    if (!isManagerOrAdmin) return;
    setConfirmDialog({
      title: "Delete Asset / Item",
      message: `Are you sure you want to permanently delete "${name}" from the inventory ledger?`,
      confirmText: "DELETE ITEM",
      isDanger: true,
      onConfirm: async () => {
        try {
          setConfirmDialog(null);
          await executeSafeUpdate({ [`communities/${session.communityId}/inventory/${id}`]: null }, "Item deleted.", "Deletion queued offline.");
          logAudit("INVENTORY_DELETED", `Deleted item: ${name}`);
        } catch (e) { showToast(e.message, "error"); }
      }
    });
  };

  const exportToCSV = () => {
    pushToDataLayer('export_data', { export_type: 'CSV', data_category: 'INVENTORY' });
    let csvContent = "data:text/csv;charset=utf-8,Item Name,Category,Quantity,Unit,Min Threshold,Value Per Unit,Total Value,Location,Last Updated\n";
    inventory.forEach(item => {
      const totalVal = (item.quantity * (item.valuePerUnit || 0)).toFixed(2);
      const date = new Date(item.lastUpdated).toLocaleDateString();
      csvContent += `"${item.name}","${item.category}","${item.quantity}","${item.unit}","${item.minThreshold}","${item.valuePerUnit || 0}","${totalVal}","${item.location}","${date}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Sanatani_Inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openEditModal = (item) => {
    setIsEditing(true);
    setEditId(item.id);
    setFormData({
      name: item.name, category: item.category, quantity: item.quantity, unit: item.unit,
      minThreshold: item.minThreshold, valuePerUnit: item.valuePerUnit || '', location: item.location || ''
    });
    setShowItemModal(true);
  };

  const closeModal = () => {
    setShowItemModal(false);
    setIsEditing(false);
    setEditId(null);
    setFormData({ name: '', category: 'CONSUMABLE', quantity: '', unit: 'pcs', minThreshold: '', valuePerUnit: '', location: '' });
  };

  // ✨ FILTER LOGIC & SMART INSIGHTS
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || (item.location && item.location.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTab = activeTab === 'ALL' || item.category === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [inventory, searchTerm, activeTab]);

  const lowStockItems = useMemo(() => inventory.filter(item => item.minThreshold > 0 && item.quantity <= item.minThreshold), [inventory]);
  
  const totalAssetValue = useMemo(() => {
    return inventory.reduce((total, item) => total + (item.quantity * (item.valuePerUnit || 0)), 0);
  }, [inventory]);

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5 min-h-[90vh]">

      {/* TOASTS & OFFLINE BANNERS */}
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
        </div>, document.body
      )}

      {!isOnline && !toast && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg mb-2 animate-pulse">
          <WifiOff size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Offline Mode: Operating from local vault.</span>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div className="w-full xl:w-auto">
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Package className="text-sanatani-orange" size={28} /> {t('inventory_desk') || 'Inventory & Assets'}
          </h2>
          <p className="text-[10px] sm:text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Track Bhandara supplies, spiritual stores, and fixed assets.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => { setShowGuide(!showGuide); if(!showGuide) pushToDataLayer('open_quick_guide', { module: 'Inventory' }); }} className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-3 sm:py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-sm whitespace-nowrap">
              <HelpCircle size={14}/> {t('quick_guide') || 'Guide'}
            </button>
            <div className="flex flex-1 sm:flex-none bg-gray-100 p-1 rounded-xl shadow-sm">
              <button onClick={exportToCSV} className="flex-1 sm:flex-none bg-white hover:bg-gray-50 text-gray-700 font-black py-2 px-3 sm:py-2.5 sm:px-4 rounded-lg text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-all border border-gray-200">
                <Download size={14} /> CSV
              </button>
            </div>
          </div>
          {isManagerOrAdmin && (
            <button onClick={() => { setIsEditing(false); setShowItemModal(true); }} className="w-full sm:w-auto text-white font-black py-3 sm:py-3.5 px-6 rounded-xl text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md transition-all hover:-translate-y-0.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shrink-0">
              <Plus size={16} /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* ✨ SMART INSIGHTS: LOW STOCK ALERT ENGINE */}
      {isManagerOrAdmin && lowStockItems.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 p-4 sm:p-5 rounded-2xl shadow-inner flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-2">
          <div className="flex gap-4 items-center">
             <div className="bg-red-100 text-red-600 p-3 rounded-xl shrink-0">
               <BellRing size={24} className="animate-pulse"/>
             </div>
             <div>
               <h3 className="text-xs font-black text-red-900 uppercase tracking-widest mb-1">Low Stock Alert</h3>
               <p className="text-sm font-bold text-gray-700 leading-snug">
                 You have <strong className="text-red-600">{lowStockItems.length} items</strong> running critically low (below minimum threshold).
               </p>
             </div>
          </div>
        </div>
      )}

      {/* QUICK GUIDE */}
      {showGuide && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-6 rounded-2xl shadow-inner animate-in slide-in-from-top-2 relative">
          <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-blue-400 hover:text-blue-700 transition-colors"><X size={18}/></button>
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 mb-4 uppercase tracking-widest"><Lightbulb size={18} className="text-blue-500"/> {t('quick_guide_title') || 'Command Center Guide'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Box size={16}/></div>
              <div><p className="text-xs font-black text-gray-900 mb-1">1. Consumables</p><p className="text-[10px] font-bold text-gray-600 leading-relaxed">Track Langar items (Rice, Ghee). Set a Minimum Threshold to get automated restock alerts.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><Speaker size={16}/></div>
              <div><p className="text-xs font-black text-gray-900 mb-1">2. Fixed Assets</p><p className="text-[10px] font-bold text-gray-600 leading-relaxed">Log heavy equipment (Sound Systems, ACs, Vehicles) along with their unit value for official trust audits.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-lg shrink-0"><ShoppingBag size={16}/></div>
              <div><p className="text-xs font-black text-gray-900 mb-1">3. Spiritual Store</p><p className="text-[10px] font-bold text-gray-600 leading-relaxed">Manage books, Malas, and Puja Samagri available for distribution or sale.</p></div>
            </div>
          </div>
        </div>
      )}

      {/* FILTER TABS & KPI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex bg-gray-100 p-1.5 rounded-2xl h-16 shadow-inner border border-gray-200 overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('ALL')} className={`flex-1 rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 min-w-[100px] ${activeTab === 'ALL' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <LayoutGrid size={14} className="hidden sm:block" /> All
          </button>
          <button onClick={() => setActiveTab('CONSUMABLE')} className={`flex-1 rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 min-w-[100px] ${activeTab === 'CONSUMABLE' ? 'bg-white text-orange-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <Box size={14} className="hidden sm:block" /> Kitchen
          </button>
          <button onClick={() => setActiveTab('FIXED_ASSET')} className={`flex-1 rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 min-w-[100px] ${activeTab === 'FIXED_ASSET' ? 'bg-white text-blue-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <Speaker size={14} className="hidden sm:block" /> Assets
          </button>
          <button onClick={() => setActiveTab('STORE')} className={`flex-1 rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 min-w-[100px] ${activeTab === 'STORE' ? 'bg-white text-purple-600 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <ShoppingBag size={14} className="hidden sm:block" /> Store
          </button>
        </div>

        <div className="lg:col-span-1 bg-gradient-to-br from-gray-900 to-black rounded-2xl p-4 flex items-center justify-between shadow-xl">
           <div>
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Scale size={12}/> Total Asset Valuation</p>
             <p className="text-2xl font-black text-white tracking-tight">{curSymbol}{totalAssetValue.toLocaleString()}</p>
           </div>
        </div>
      </div>

      <div className="relative w-full">
        <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input 
          type="text" placeholder="Search items or locations..." 
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:border-sanatani-orange focus:ring-4 focus:ring-orange-50 transition-all shadow-sm" 
        />
      </div>

      {/* INVENTORY GRID */}
      <div className="flex-1 overflow-y-auto pb-8 pt-2">
        {filteredInventory.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredInventory.map((item) => {
              const isLowStock = item.minThreshold > 0 && item.quantity <= item.minThreshold;
              const totalVal = item.quantity * (item.valuePerUnit || 0);

              return (
              <div key={item.id} className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-black/5 flex flex-col justify-between ${isLowStock ? 'border-red-200 bg-red-50/10' : 'border-gray-200'}`}>
                
                <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-4">
                  <div className="min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                        item.category === 'CONSUMABLE' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        item.category === 'FIXED_ASSET' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-purple-50 text-purple-700 border-purple-200'
                      }`}>{item.category.replace('_', ' ')}</span>
                      {isLowStock && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded border bg-red-100 text-red-700 border-red-200 animate-pulse">Low Stock</span>}
                    </div>
                    <h3 className="text-lg font-black text-gray-900 truncate" title={item.name}>{item.name}</h3>
                    <p className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-widest truncate">{item.location}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Current Stock</p>
                    <p className={`text-xl font-black ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>{item.quantity} <span className="text-xs text-gray-500 font-bold">{item.unit}</span></p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Value</p>
                    <p className="text-xl font-black text-gray-900">{curSymbol}{totalVal.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-auto">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Last Updated By</span>
                    <span className="text-[10px] font-bold text-gray-600">{item.updatedBy?.split(' ')[0]}</span>
                  </div>

                  {isManagerOrAdmin && (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setAdjustStockModal({ show: true, item, action: 'REMOVE', amount: '' })} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg border border-red-200 transition-colors" title="Remove Stock"><TrendingDown size={14}/></button>
                      <button onClick={() => setAdjustStockModal({ show: true, item, action: 'ADD', amount: '' })} className="p-2 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-lg border border-green-200 transition-colors" title="Add Stock"><TrendingUp size={14}/></button>
                      <button onClick={() => openEditModal(item)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg border border-blue-200 transition-colors ml-2" title="Edit Item"><Edit size={14}/></button>
                      <button onClick={() => handleDeleteItem(item.id, item.name)} className="p-2 bg-gray-50 text-gray-400 hover:bg-red-600 hover:text-white rounded-lg border border-gray-200 transition-colors" title="Delete Item"><Trash2 size={14}/></button>
                    </div>
                  )}
                </div>
              </div>
            )})}
          </div>
        ) : (
          <div className="text-center p-16 text-gray-400 font-bold bg-gray-50 rounded-3xl border border-gray-100 shadow-inner flex flex-col items-center justify-center h-64">
            <Package size={48} className="text-gray-300 mb-4" />
            <p className="text-lg sm:text-xl font-black text-gray-900 mb-2">Inventory Empty</p>
            <p className="text-[10px] sm:text-xs uppercase tracking-widest">Add items to track your physical assets.</p>
          </div>
        )}
      </div>

      {/* ✨ ITEM ADD/EDIT MODAL */}
      {showItemModal && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[9000] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 fade-in border-t-4 border-sanatani-orange ring-1 ring-white/20 max-h-[85vh] flex flex-col">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4 shrink-0">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                 <Package className="text-sanatani-orange" size={24}/> {isEditing ? 'Update Asset' : 'Add to Inventory'}
               </h3>
               <button onClick={closeModal} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full text-gray-500 transition-colors"><X size={16}/></button>
             </div>

             <div className="overflow-y-auto pr-2 scrollbar-hide pb-4">
               <form onSubmit={handleSaveItem} className="space-y-5">
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Item / Asset Name *</label>
                   <input type="text" required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm" placeholder="e.g. Basmati Rice, Sound System..." />
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Category *</label>
                     <select required value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm cursor-pointer appearance-none">
                       <option value="CONSUMABLE">Consumable (Kitchen/Langar)</option>
                       <option value="FIXED_ASSET">Fixed Asset (Equipment)</option>
                       <option value="STORE">Spiritual Store (Merch)</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Storage Location</label>
                     <input type="text" value={formData.location} onChange={e=>setFormData({...formData, location: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm" placeholder="e.g. Main Hall Kitchen" />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                   <div className="col-span-1 sm:col-span-2">
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Current Qty *</label>
                     <input type="number" required min="0" step="any" value={formData.quantity} onChange={e=>setFormData({...formData, quantity: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black text-gray-900 focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm" placeholder="0" />
                   </div>
                   <div className="col-span-1 sm:col-span-2">
                     <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Unit Measure *</label>
                     <select required value={formData.unit} onChange={e=>setFormData({...formData, unit: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none transition-all shadow-sm cursor-pointer appearance-none">
                       <option value="pcs">Pieces (pcs)</option>
                       <option value="kg">Kilograms (kg)</option>
                       <option value="L">Liters (L)</option>
                       <option value="boxes">Boxes</option>
                       <option value="packets">Packets</option>
                     </select>
                   </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                     <label className="block text-[10px] font-black text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-1"><AlertTriangle size={12}/> Alert Threshold</label>
                     <input type="number" min="0" step="any" value={formData.minThreshold} onChange={e=>setFormData({...formData, minThreshold: e.target.value})} className="w-full p-3 bg-white border border-red-200 rounded-lg text-sm font-bold focus:border-red-500 outline-none transition-all shadow-sm" placeholder="Warn me if below..." />
                   </div>
                   <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                     <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Scale size={12}/> Value per Unit ({curSymbol})</label>
                     <input type="number" min="0" step="any" value={formData.valuePerUnit} onChange={e=>setFormData({...formData, valuePerUnit: e.target.value})} className="w-full p-3 bg-white border border-blue-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none transition-all shadow-sm" placeholder="0.00" />
                   </div>
                 </div>

                 <div className="pt-4">
                   <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50">
                     {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={16}/> {isEditing ? 'UPDATE ASSET' : 'SAVE TO INVENTORY'}</>}
                   </button>
                 </div>
               </form>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ QUICK STOCK ADJUSTMENT MODAL (+ / -) */}
      {adjustStockModal.show && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
           <div className={`bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 ring-1 ring-white/20 relative border-t-4 ${adjustStockModal.action === 'ADD' ? 'border-green-500' : 'border-red-500'}`}>
              <button onClick={() => setAdjustStockModal({ show: false, item: null, action: 'ADD', amount: '' })} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full"><X size={16}/></button>

              <div className="mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${adjustStockModal.action === 'ADD' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {adjustStockModal.action === 'ADD' ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
                </div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">{adjustStockModal.action === 'ADD' ? 'Add Stock' : 'Remove Stock'}</h3>
                <p className="text-xs font-bold text-gray-500 mt-1 truncate">{adjustStockModal.item?.name}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Current: {adjustStockModal.item?.quantity} {adjustStockModal.item?.unit}</p>
              </div>

              <form onSubmit={handleAdjustStock}>
                <div className="relative mb-8">
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Amount to {adjustStockModal.action} *</label>
                   <input 
                     type="number" required min="0.01" step="any"
                     value={adjustStockModal.amount} 
                     onChange={(e) => setAdjustStockModal({...adjustStockModal, amount: e.target.value})} 
                     autoFocus
                     className={`w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-lg font-black text-gray-900 focus:ring-4 transition-all shadow-sm ${adjustStockModal.action === 'ADD' ? 'focus:border-green-500 focus:ring-green-50' : 'focus:border-red-500 focus:ring-red-50'}`}
                   />
                </div>

                <div className="flex gap-3">
                   <button type="button" onClick={() => setAdjustStockModal({ show: false, item: null, action: 'ADD', amount: '' })} className="flex-1 px-4 py-3.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">Cancel</button>
                   <button type="submit" disabled={isProcessing} className={`flex-[2] px-4 py-3.5 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-md transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2 disabled:opacity-50 ${adjustStockModal.action === 'ADD' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                     {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <>{adjustStockModal.action} STOCK <CheckCircle2 size={16}/></>}
                  </button>
                </div>
              </form>
           </div>
        </div>,
        document.body
      )}

      {/* CONFIRMATION MODAL ENGINE */}
      {confirmDialog && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmDialog.isDanger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
              <AlertTriangle size={32}/>
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-colors">Cancel</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest text-white shadow-md transition-all hover:-translate-y-0.5 ${confirmDialog.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
