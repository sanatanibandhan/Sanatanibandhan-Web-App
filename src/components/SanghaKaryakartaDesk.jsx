import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, update, push, set, increment, remove } from 'firebase/database';
import { db } from '../firebase';
import { 
  ClipboardList, Trophy, Box, Plus, CheckCircle2, Clock, 
  AlertTriangle, Users, ShieldCheck, Flame, Loader2, X, 
  WifiOff, Search, PlayCircle, Award, Medal, CheckSquare, Package
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function SanghaKaryakartaDesk({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  const isManagerOrAdmin = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(session?.role || '').toUpperCase());

  const [activeTab, setActiveTab] = useState('TASKS'); // 'TASKS', 'LEADERBOARD', 'ASSETS'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 💾 Core Data States (With Offline Cache)
  const [tasks, setTasks] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_sangha_tasks_${session?.communityId}`)) || []; } catch { return []; }});
  const [assets, setAssets] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_sangha_assets_${session?.communityId}`)) || []; } catch { return []; }});
  const [members, setMembers] = useState(() => { try { return JSON.parse(localStorage.getItem(`sb_sangha_members_${session?.communityId}`)) || []; } catch { return []; }});

  // UI Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);

  // Form States
  const [taskForm, setTaskForm] = useState({ title: '', description: '', points: 10, assigneeId: '' });
  const [assetForm, setAssetForm] = useState({ itemName: '', status: 'AVAILABLE', borrowedBy: '' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 🔄 Realtime Sync Engine
  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_sangha_desk', { workspace_type: workspaceType });

    // Sync Members (for points & assignments)
    const memRef = ref(db, `communities/${session.communityId}/members`);
    const unsubMem = onValue(memRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const memArray = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        setMembers(memArray);
        localStorage.setItem(`sb_sangha_members_${session.communityId}`, JSON.stringify(memArray));
      }
    });

    // Sync Tasks
    const tasksRef = ref(db, `communities/${session.communityId}/tasks`);
    const unsubTasks = onValue(tasksRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const tArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.createdAt - a.createdAt);
        setTasks(tArray);
        localStorage.setItem(`sb_sangha_tasks_${session.communityId}`, JSON.stringify(tArray));
      } else { setTasks([]); }
    });

    // Sync Assets
    const assetsRef = ref(db, `communities/${session.communityId}/assets`);
    const unsubAssets = onValue(assetsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const aArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a, b) => b.addedAt - a.addedAt);
        setAssets(aArray);
        localStorage.setItem(`sb_sangha_assets_${session.communityId}`, JSON.stringify(aArray));
      } else { setAssets([]); }
      setLoading(false);
    });

    const failsafe = setTimeout(() => setLoading(false), 1500);
    return () => { unsubMem(); unsubTasks(); unsubAssets(); clearTimeout(failsafe); };
  }, [session?.communityId, workspaceType]);

  const logAudit = async (actionType, description) => {
    if (!isOnline) return;
    try { await push(ref(db, `communities/${session.communityId}/audit_logs`), { managerName: session.userName, actionType, description, timestamp: Date.now() }); } catch (e) {}
  };

  // ✨ TASK CREATION ENGINE
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!isOnline) return showToast("You must be online to create tasks.", "error");
    if (!taskForm.title.trim()) return;

    setIsProcessing(true);
    try {
      const taskId = push(ref(db, `communities/${session.communityId}/tasks`)).key;
      const assignedMember = members.find(m => m.id === taskForm.assigneeId);
      
      const newTask = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        points: Number(taskForm.points),
        status: 'OPEN',
        assigneeId: taskForm.assigneeId || null,
        assigneeName: assignedMember ? assignedMember.name : null,
        createdBy: session.userName,
        createdAt: Date.now()
      };

      await set(ref(db, `communities/${session.communityId}/tasks/${taskId}`), newTask);
      logAudit('TASK_CREATED', `Created new task: ${newTask.title}`);
      pushToDataLayer('generate_lead', { content_type: 'Sangha_Task', value: newTask.points });

      showToast("Task officially added to the board!");
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', points: 10, assigneeId: '' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  // ✨ TASK WORKFLOW ENGINE
  const updateTaskStatus = async (taskId, newStatus, currentTask) => {
    if (!isOnline) return showToast("Offline mode.", "error");
    try {
      const updates = { [`communities/${session.communityId}/tasks/${taskId}/status`]: newStatus };
      
      // If Admin verifies, atomically add points to the user's profile
      if (newStatus === 'COMPLETED' && currentTask.assigneeId) {
        updates[`communities/${session.communityId}/members/${currentTask.assigneeId}/sevaPoints`] = increment(currentTask.points);
        logAudit('TASK_VERIFIED', `Awarded ${currentTask.points} points to ${currentTask.assigneeName} for task: ${currentTask.title}`);
        pushToDataLayer('unlock_achievement', { achievement_id: 'Task_Verified', item_id: taskId });
      }

      await update(ref(db), updates);
      showToast(`Task moved to ${newStatus}`);
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const claimTask = async (task) => {
    if (!isOnline) return showToast("Offline mode.", "error");
    try {
      const updates = {
        [`communities/${session.communityId}/tasks/${task.id}/assigneeId`]: session.uid,
        [`communities/${session.communityId}/tasks/${task.id}/assigneeName`]: session.userName,
        [`communities/${session.communityId}/tasks/${task.id}/status`]: 'IN_PROGRESS'
      };
      await update(ref(db), updates);
      showToast("You have claimed this Seva task!");
      pushToDataLayer('select_content', { content_type: 'Task_Claimed', item_id: task.id });
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  // ✨ ASSET TRACKER ENGINE
  const handleSaveAsset = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setIsProcessing(true);
    try {
      const assetId = push(ref(db, `communities/${session.communityId}/assets`)).key;
      const assignedMember = members.find(m => m.id === assetForm.borrowedBy);
      
      const newAsset = {
        itemName: assetForm.itemName.trim(),
        status: assetForm.status,
        borrowedBy: assetForm.status === 'BORROWED' ? assetForm.borrowedBy : null,
        borrowerName: assetForm.status === 'BORROWED' && assignedMember ? assignedMember.name : null,
        addedAt: Date.now()
      };

      await set(ref(db, `communities/${session.communityId}/assets/${assetId}`), newAsset);
      showToast("Asset added to inventory.");
      setShowAssetModal(false);
      setAssetForm({ itemName: '', status: 'AVAILABLE', borrowedBy: '' });
    } catch (e) { showToast(e.message, "error"); } finally { setIsProcessing(false); }
  };

  const returnAsset = async (asset) => {
    try {
      const updates = {
        [`communities/${session.communityId}/assets/${asset.id}/status`]: 'AVAILABLE',
        [`communities/${session.communityId}/assets/${asset.id}/borrowedBy`]: null,
        [`communities/${session.communityId}/assets/${asset.id}/borrowerName`]: null
      };
      await update(ref(db), updates);
      showToast(`${asset.itemName} marked as returned.`);
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  // Filter Tasks by status for the Kanban view
  const openTasks = tasks.filter(t => t.status === 'OPEN');
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS');
  const reviewTasks = tasks.filter(t => t.status === 'REVIEW');
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');

  // Sort Leaderboard
  const sortedMembers = [...members].sort((a, b) => (b.sevaPoints || 0) - (a.sevaPoints || 0));

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full w-full relative space-y-6 fade-in ring-1 ring-black/5">

      {!isOnline && (
        <div className="bg-red-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg animate-pulse">
          <WifiOff size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Offline Mode</span>
        </div>
      )}

      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>System Alert</p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>,
        document.body
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Flame className="text-sanatani-orange" size={26} /> Karyakarta Desk
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">
            Task delegation, gamification, and asset tracking.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex w-full sm:w-auto bg-gray-100 p-1.5 rounded-2xl shadow-inner border border-gray-200">
            <button onClick={() => setActiveTab('TASKS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${activeTab === 'TASKS' ? 'bg-white text-sanatani-orange shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><ClipboardList size={14}/> Tasks</button>
            <button onClick={() => setActiveTab('LEADERBOARD')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${activeTab === 'LEADERBOARD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><Trophy size={14}/> Podium</button>
            <button onClick={() => setActiveTab('ASSETS')} className={`flex-1 sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${activeTab === 'ASSETS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><Box size={14}/> Assets</button>
          </div>

          {isManagerOrAdmin && activeTab === 'TASKS' && (
            <button onClick={() => setShowTaskModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 shrink-0">
              <Plus size={16}/> New Task
            </button>
          )}
          {isManagerOrAdmin && activeTab === 'ASSETS' && (
            <button onClick={() => setShowAssetModal(true)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-5 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 shrink-0">
              <Plus size={16}/> Add Asset
            </button>
          )}
        </div>
      </div>

      {/* 📋 TAB 1: KANBAN TASK BOARD */}
      {activeTab === 'TASKS' && (
        <div className="flex-1 overflow-x-auto pb-6 scrollbar-hide flex gap-6 snap-x">
          
          {/* Column: Open Bounties */}
          <div className="min-w-[300px] w-[300px] flex-shrink-0 flex flex-col snap-center">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest flex items-center gap-2"><Trophy size={16} className="text-amber-500"/> Open Bounties</h3>
              <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-full">{openTasks.length}</span>
            </div>
            <div className="flex-1 space-y-3">
              {openTasks.map(task => (
                <div key={task.id} className="bg-white border border-amber-200 shadow-sm hover:shadow-md p-4 rounded-2xl transition-all relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">+{task.points} Pts</span>
                  </div>
                  <h4 className="text-sm font-black text-gray-900 mb-1">{task.title}</h4>
                  <p className="text-xs font-bold text-gray-500 leading-snug line-clamp-2 mb-4">{task.description}</p>
                  <button onClick={() => claimTask(task)} className="w-full bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-700 border border-amber-200 text-[10px] font-black py-2.5 rounded-lg uppercase tracking-widest transition-colors flex justify-center items-center gap-1.5">
                    <CheckSquare size={14}/> Claim Task
                  </button>
                </div>
              ))}
              {openTasks.length === 0 && <div className="text-center p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400 uppercase tracking-widest">No open tasks</div>}
            </div>
          </div>

          {/* Column: In Progress */}
          <div className="min-w-[300px] w-[300px] flex-shrink-0 flex flex-col snap-center">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest flex items-center gap-2"><PlayCircle size={16} className="text-blue-500"/> In Progress</h3>
              <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-full">{inProgressTasks.length}</span>
            </div>
            <div className="flex-1 space-y-3">
              {inProgressTasks.map(task => (
                <div key={task.id} className="bg-white border border-blue-200 shadow-sm p-4 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-400"></div>
                  <h4 className="text-sm font-black text-gray-900 mb-2">{task.title}</h4>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[8px] font-black shrink-0">{task.assigneeName?.charAt(0)}</div>
                    <span className="text-[10px] font-bold text-gray-600 truncate">{task.assigneeName}</span>
                  </div>
                  {(isManagerOrAdmin || session.uid === task.assigneeId) && (
                    <button onClick={() => updateTaskStatus(task.id, 'REVIEW', task)} className="w-full bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 text-[10px] font-black py-2.5 rounded-lg uppercase tracking-widest transition-colors flex justify-center items-center gap-1.5">
                      <Clock size={14}/> Request Review
                    </button>
                  )}
                </div>
              ))}
              {inProgressTasks.length === 0 && <div className="text-center p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400 uppercase tracking-widest">Nothing in progress</div>}
            </div>
          </div>

          {/* Column: Awaiting Verification */}
          <div className="min-w-[300px] w-[300px] flex-shrink-0 flex flex-col snap-center">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest flex items-center gap-2"><ShieldCheck size={16} className="text-purple-500"/> Admin Review</h3>
              <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-full">{reviewTasks.length}</span>
            </div>
            <div className="flex-1 space-y-3">
              {reviewTasks.map(task => (
                <div key={task.id} className="bg-white border border-purple-200 shadow-sm p-4 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-purple-400"></div>
                  <h4 className="text-sm font-black text-gray-900 mb-2">{task.title}</h4>
                  <div className="flex items-center gap-2 mb-4 bg-purple-50 p-2 rounded-lg border border-purple-100">
                    <span className="text-[9px] font-black text-purple-700 uppercase tracking-widest">Waiting for Admin to verify</span>
                  </div>
                  {isManagerOrAdmin && (
                    <div className="flex gap-2">
                       <button onClick={() => updateTaskStatus(task.id, 'IN_PROGRESS', task)} className="flex-[1] bg-gray-50 hover:bg-gray-200 text-gray-600 border border-gray-200 text-[10px] font-black py-2.5 rounded-lg uppercase tracking-widest transition-colors flex justify-center items-center"><X size={14}/></button>
                       <button onClick={() => updateTaskStatus(task.id, 'COMPLETED', task)} className="flex-[3] bg-green-50 hover:bg-green-600 hover:text-white text-green-700 border border-green-200 text-[10px] font-black py-2.5 rounded-lg uppercase tracking-widest transition-colors flex justify-center items-center gap-1.5 shadow-sm">
                         <CheckCircle2 size={14}/> Verify & Reward
                       </button>
                    </div>
                  )}
                </div>
              ))}
              {reviewTasks.length === 0 && <div className="text-center p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs font-bold text-gray-400 uppercase tracking-widest">Queue is clear</div>}
            </div>
          </div>

          {/* Column: Completed */}
          <div className="min-w-[300px] w-[300px] flex-shrink-0 flex flex-col snap-center">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest flex items-center gap-2"><CheckCircle2 size={16} className="text-green-500"/> Completed</h3>
              <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-full">{completedTasks.length}</span>
            </div>
            <div className="flex-1 space-y-3 opacity-70 hover:opacity-100 transition-opacity">
              {completedTasks.slice(0, 10).map(task => (
                <div key={task.id} className="bg-gray-50 border border-gray-200 p-4 rounded-2xl">
                  <h4 className="text-sm font-black text-gray-900 mb-1 line-through decoration-gray-400">{task.title}</h4>
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest flex items-center gap-1">
                    <CheckCircle2 size={10}/> Done by {task.assigneeName?.split(' ')[0]} (+{task.points})
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* 🏆 TAB 2: SEVA LEADERBOARD */}
      {activeTab === 'LEADERBOARD' && (
        <div className="flex-1 max-w-4xl mx-auto w-full">
           <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-3xl p-6 sm:p-10 shadow-xl text-white text-center mb-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-10"><Trophy size={150} /></div>
             <div className="relative z-10">
               <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">Community Seva Podium</h2>
               <p className="text-xs sm:text-sm font-bold text-orange-100 uppercase tracking-widest">Honoring our most dedicated volunteers.</p>
             </div>
           </div>

           <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden ring-1 ring-black/5">
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <div className="col-span-2 sm:col-span-1 text-center">Rank</div>
                <div className="col-span-7 sm:col-span-8">Devotee Name</div>
                <div className="col-span-3 text-right pr-4">Seva Points</div>
              </div>
              <div className="divide-y divide-gray-100">
                 {sortedMembers.map((member, idx) => {
                   const isFirst = idx === 0;
                   const isSecond = idx === 1;
                   const isThird = idx === 2;
                   const hasPoints = (member.sevaPoints || 0) > 0;

                   return (
                     <div key={member.id} className={`grid grid-cols-12 gap-4 p-4 items-center transition-colors ${session.uid === member.id ? 'bg-orange-50/50' : 'hover:bg-gray-50'}`}>
                        <div className="col-span-2 sm:col-span-1 flex justify-center">
                           {isFirst && hasPoints ? <Award size={24} className="text-yellow-500 fill-current drop-shadow-md"/> :
                            isSecond && hasPoints ? <Medal size={22} className="text-gray-400 fill-current drop-shadow-sm"/> :
                            isThird && hasPoints ? <Medal size={22} className="text-amber-700 fill-current drop-shadow-sm"/> :
                            <span className="text-sm font-black text-gray-400">{idx + 1}</span>}
                        </div>
                        <div className="col-span-7 sm:col-span-8">
                           <p className="text-sm font-black text-gray-900 flex items-center gap-2">
                             {member.name} {session.uid === member.id && <span className="bg-sanatani-orange text-white text-[8px] px-1.5 py-0.5 rounded uppercase tracking-widest">You</span>}
                           </p>
                           <p className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">{member.role}</p>
                        </div>
                        <div className="col-span-3 text-right pr-4">
                           <span className={`text-sm sm:text-base font-black ${isFirst && hasPoints ? 'text-yellow-600' : hasPoints ? 'text-green-600' : 'text-gray-400'}`}>
                             {member.sevaPoints || 0}
                           </span>
                        </div>
                     </div>
                   );
                 })}
              </div>
           </div>
        </div>
      )}

      {/* 📦 TAB 3: ASSET TRACKER */}
      {activeTab === 'ASSETS' && (
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
             {assets.map(asset => (
               <div key={asset.id} className={`p-5 rounded-2xl border transition-all ${asset.status === 'BORROWED' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 shadow-sm hover:border-green-300'}`}>
                  <div className="flex justify-between items-start mb-4">
                     <div className={`p-2 rounded-xl ${asset.status === 'BORROWED' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                       <Package size={20}/>
                     </div>
                     <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase tracking-widest ${asset.status === 'BORROWED' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                       {asset.status === 'BORROWED' ? 'Borrowed Out' : 'Available'}
                     </span>
                  </div>
                  <h4 className="text-lg font-black text-gray-900 mb-2 tracking-tight truncate">{asset.itemName}</h4>
                  
                  {asset.status === 'BORROWED' ? (
                    <div className="space-y-4 mt-auto">
                      <div className="bg-white/60 p-3 rounded-xl border border-red-100">
                        <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-0.5">Currently With</p>
                        <p className="text-xs font-bold text-red-900">{asset.borrowerName}</p>
                      </div>
                      {isManagerOrAdmin && (
                        <button onClick={() => returnAsset(asset)} className="w-full bg-white hover:bg-green-50 border border-gray-200 hover:border-green-300 text-gray-700 hover:text-green-700 text-[10px] font-black py-2.5 rounded-lg uppercase tracking-widest transition-all shadow-sm">
                          Mark as Returned
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-400">Safely stored in inventory.</p>
                    </div>
                  )}
               </div>
             ))}
             {assets.length === 0 && (
               <div className="col-span-full text-center p-16 bg-gray-50 border border-dashed border-gray-200 rounded-3xl">
                 <Box size={40} className="mx-auto text-gray-300 mb-4"/>
                 <p className="text-lg font-black text-gray-900 mb-1">Inventory Empty</p>
                 <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Admins can click "Add Asset" to start tracking physical items.</p>
               </div>
             )}
          </div>
        </div>
      )}

      {/* ✨ CREATE TASK MODAL */}
      {showTaskModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 border-t-4 border-sanatani-orange">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><ClipboardList className="text-sanatani-orange" size={20}/> New Task Bounty</h3>
               <button onClick={() => setShowTaskModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"><X size={16}/></button>
             </div>
             <form onSubmit={handleCreateTask} className="space-y-5">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Task Title *</label>
                 <input required type="text" value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none shadow-sm" placeholder="e.g. Set up the sound system" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Description (Optional)</label>
                 <textarea rows="2" value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none shadow-sm resize-none" placeholder="Details..."></textarea>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1.5">Reward (Seva Points) *</label>
                   <select value={taskForm.points} onChange={e => setTaskForm({...taskForm, points: e.target.value})} className="w-full p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-sm font-black outline-none shadow-sm cursor-pointer">
                     <option value={10}>10 Points (Minor)</option>
                     <option value="20">20 Points (Standard)</option>
                     <option value="50">50 Points (Major Effort)</option>
                     <option value="100">100 Points (Leadership)</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Assign To</label>
                   <select value={taskForm.assigneeId} onChange={e => setTaskForm({...taskForm, assigneeId: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:border-sanatani-orange outline-none shadow-sm cursor-pointer">
                     <option value="">Leave Open (Bounty)</option>
                     {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                   </select>
                 </div>
               </div>
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <><Plus size={16}/> Push to Board</>}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ CREATE ASSET MODAL */}
      {showAssetModal && isManagerOrAdmin && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-in zoom-in-95 ring-1 ring-white/20 border-t-4 border-gray-800">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Package className="text-gray-600" size={20}/> Log New Asset</h3>
               <button onClick={() => setShowAssetModal(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"><X size={16}/></button>
             </div>
             <form onSubmit={handleSaveAsset} className="space-y-5">
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Asset / Item Name *</label>
                 <input required type="text" value={assetForm.itemName} onChange={e => setAssetForm({...assetForm, itemName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:bg-white focus:border-sanatani-orange outline-none shadow-sm" placeholder="e.g. 50x Plastic Chairs" />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Current Status *</label>
                 <select value={assetForm.status} onChange={e => setAssetForm({...assetForm, status: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none shadow-sm cursor-pointer">
                   <option value="AVAILABLE">In Storage (Available)</option>
                   <option value="BORROWED">Currently Borrowed Out</option>
                 </select>
               </div>
               {assetForm.status === 'BORROWED' && (
                 <div className="animate-in fade-in">
                   <label className="block text-[10px] font-black text-red-500 uppercase tracking-widest mb-1.5">Borrowed By *</label>
                   <select required value={assetForm.borrowedBy} onChange={e => setAssetForm({...assetForm, borrowedBy: e.target.value})} className="w-full p-4 bg-red-50 border border-red-200 text-red-900 rounded-xl text-sm font-bold outline-none shadow-sm cursor-pointer">
                     <option value="">Select Member...</option>
                     {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                   </select>
                 </div>
               )}
               <button type="submit" disabled={isProcessing} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50">
                 {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <><Plus size={16}/> Add Inventory</>}
               </button>
             </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
