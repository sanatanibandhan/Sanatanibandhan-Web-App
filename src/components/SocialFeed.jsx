import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, remove, update } from 'firebase/database';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';
import { 
  Image as ImageIcon, Send, Trash2, Heart, MessageCircle, 
  Share2, Camera, Loader2, X, AlertTriangle, CheckCircle2, 
  Clock, MapPin, MoreVertical, ShieldCheck, Sparkles, Flame
} from 'lucide-react';

export default function SocialFeed({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Post Creation States
  const [postText, setPostText] = useState('');
  const [postImage, setPostImage] = useState(null);
  const [postCategory, setPostCategory] = useState('DAILY_DARSHAN'); // DAILY_DARSHAN, ANNOUNCEMENT, SPIRITUAL

  const [toast, setToast] = useState(null);
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(session?.role);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!session?.communityId) return;
    pushToDataLayer('view_social_feed', { workspace_type: workspaceType });

    const feedRef = ref(db, `communities/${session.communityId}/social_feed`);
    const unsub = onValue(feedRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const postArray = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a,b) => b.timestamp - a.timestamp);
        setPosts(postArray);
      } else {
        setPosts([]);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [session?.communityId, workspaceType]);

  const handleImageCompression = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1080;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        setPostImage(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!postText.trim() && !postImage) return showToast("Post cannot be empty.", "error");

    setSubmitting(true);
    try {
      const newPost = {
        authorId: session.uid,
        authorName: session.userName,
        authorRole: session.role,
        text: postText.trim(),
        image: postImage,
        category: postCategory,
        timestamp: Date.now(),
        reactions: { default: 0 } // Stores 'Pranams'
      };

      await push(ref(db, `communities/${session.communityId}/social_feed`), newPost);
      showToast("Post published successfully!");
      setPostText('');
      setPostImage(null);
      pushToDataLayer('create_social_post', { category: postCategory });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePranamReact = async (postId, currentReactions) => {
    // Sanatani "Like" system - Users offer Pranam 🙏
    try {
      const updates = {};
      updates[`communities/${session.communityId}/social_feed/${postId}/reactions/default`] = (currentReactions || 0) + 1;
      await update(ref(db), updates);
    } catch (e) { console.error(e); }
  };

  const handleDeletePost = async (postId) => {
    if(!window.confirm("Delete this post?")) return;
    try {
      await remove(ref(db, `communities/${session.communityId}/social_feed/${postId}`));
      showToast("Post removed.");
    } catch (e) { showToast("Error deleting post.", "error"); }
  };

  if (loading) return <div className="flex justify-center p-20 text-sanatani-orange"><Loader2 size={40} className="animate-spin" /></div>;

  return (
    <div className="space-y-6 fade-in pb-12 relative w-full max-w-3xl mx-auto">
      
      {toast && createPortal(
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${toast.type === 'error' ? 'bg-red-900' : 'bg-gray-900'} text-white`}>
           <div className={`p-2 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
             {toast.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
           </div>
           <div>
             <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${toast.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{toast.type === 'error' ? 'Error' : 'Success'}</p>
             <p className="text-sm font-bold">{toast.message}</p>
           </div>
        </div>, document.body
      )}

      {/* ADMIN POST CREATOR */}
      {isAdmin && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 relative overflow-hidden">
          <div className="flex items-center gap-3 mb-4 border-b border-gray-100 pb-4">
            <div className="w-10 h-10 bg-orange-50 text-sanatani-orange rounded-full flex items-center justify-center shadow-inner"><Flame size={20}/></div>
            <div>
              <h3 className="text-lg font-black text-gray-900">Create Community Post</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Share Daily Darshan or Announcements</p>
            </div>
          </div>

          <form onSubmit={handleCreatePost} className="space-y-4">
            <textarea 
              rows="3" 
              value={postText}
              onChange={e => setPostText(e.target.value)}
              placeholder="What's happening in the community today? Share blessings..."
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none resize-none focus:bg-white focus:border-sanatani-orange transition-colors"
            />
            
            {postImage && (
              <div className="relative inline-block border-2 border-orange-200 rounded-xl overflow-hidden shadow-sm">
                <img src={postImage} alt="Upload Preview" className="h-32 object-cover" />
                <button type="button" onClick={() => setPostImage(null)} className="absolute top-2 right-2 bg-gray-900/70 text-white p-1.5 rounded-full hover:bg-red-500 transition-colors backdrop-blur-sm"><X size={14}/></button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-xl transition-colors flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-sm">
                  <Camera size={16}/> {postImage ? 'Change Photo' : 'Add Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageCompression} />
                </label>
                
                <select value={postCategory} onChange={e=>setPostCategory(e.target.value)} className="bg-gray-100 border border-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest p-3.5 rounded-xl outline-none cursor-pointer shadow-sm flex-1">
                  <option value="DAILY_DARSHAN">Daily Darshan</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="SPIRITUAL">Spiritual Quote</option>
                </select>
              </div>

              <button type="submit" disabled={submitting || (!postText && !postImage)} className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-black py-3.5 px-6 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2">
                {submitting ? <Loader2 size={16} className="animate-spin"/> : <><Send size={16}/> Publish Post</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* THE FEED */}
      <div className="space-y-6">
        {posts.length > 0 ? posts.map(post => (
          <div key={post.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            
            {/* Post Header */}
            <div className="p-5 flex justify-between items-center bg-white border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-50 to-red-50 border border-orange-100 rounded-full flex items-center justify-center text-sanatani-orange font-black text-lg shadow-inner">
                  {post.authorName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                    {post.authorName}
                    {(post.authorRole === 'ADMIN' || post.authorRole === 'SUPER_ADMIN') && <ShieldCheck size={14} className="text-blue-500"/>}
                  </h4>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                    <Clock size={10}/> {new Date(post.timestamp).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border shadow-sm ${post.category === 'DAILY_DARSHAN' ? 'bg-orange-50 text-orange-600 border-orange-200' : post.category === 'ANNOUNCEMENT' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                  {post.category.replace('_', ' ')}
                </span>
                {isAdmin && (
                  <button onClick={() => handleDeletePost(post.id)} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14}/></button>
                )}
              </div>
            </div>

            {/* Post Content */}
            <div className="p-5">
              {post.text && <p className="text-sm text-gray-800 font-medium leading-relaxed whitespace-pre-wrap mb-4">{post.text}</p>}
              {post.image && (
                <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50 flex justify-center">
                  <img src={post.image} alt="Post Attachment" className="max-w-full max-h-[500px] object-contain" />
                </div>
              )}
            </div>

            {/* Post Actions (The Sanatani 'Pranam' Reaction) */}
            <div className="px-5 py-3.5 bg-gray-50/50 border-t border-gray-100 flex items-center gap-6">
              <button 
                onClick={() => handlePranamReact(post.id, post.reactions?.default)}
                className="flex items-center gap-2 text-gray-500 hover:text-sanatani-orange transition-colors group"
              >
                <div className="bg-white p-2 rounded-full shadow-sm border border-gray-200 group-hover:border-orange-200 group-hover:bg-orange-50 transition-colors">
                  <Sparkles size={16} className="group-hover:fill-current"/>
                </div>
                <span className="text-xs font-black uppercase tracking-widest">{post.reactions?.default || 0} Pranam 🙏</span>
              </button>

              <button className="flex items-center gap-2 text-gray-500 hover:text-blue-600 transition-colors group">
                <div className="bg-white p-2 rounded-full shadow-sm border border-gray-200 group-hover:border-blue-200 group-hover:bg-blue-50 transition-colors">
                  <Share2 size={16}/>
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Share</span>
              </button>
            </div>
          </div>
        )) : (
          <div className="text-center p-20 bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm">
            <ImageIcon size={48} className="mx-auto mb-4 text-gray-300"/>
            <p className="text-xl font-black text-gray-900 mb-1">No Posts Yet</p>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">When the committee posts Daily Darshan or updates, they will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
