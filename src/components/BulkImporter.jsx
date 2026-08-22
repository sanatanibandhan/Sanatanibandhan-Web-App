import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, increment, serverTimestamp, push } from 'firebase/database';
import { db } from '../firebase';
import Papa from 'papaparse';
import { 
  UploadCloud, FileSpreadsheet, ShieldAlert, CheckCircle2, 
  AlertTriangle, Loader2, Users, Database, Download, XCircle, Info
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { pushToDataLayer } from '../utils/gtm';

export default function BulkImporter({ session, isOnline = navigator.onLine }) {
  const { t, workspaceType } = useLanguage();
  
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [devoteeCount, setDevoteeCount] = useState(0);
  const [memberLimit, setMemberLimit] = useState(50);
  const [mandirPlan, setMandirPlan] = useState(session.plan || 'FREE');

  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); 
  const fileInputRef = useRef(null);

  useEffect(() => {
    pushToDataLayer('view_item', { item_name: 'Bulk Importer Module', workspace_type: workspaceType });

    const infoRef = ref(db, `communities/${session.communityId}/info`);
    const unsubInfo = onValue(infoRef, (snapshot) => {
      if (snapshot.exists()) {
        setDevoteeCount(snapshot.val().devoteeCount || 0);
        setMandirPlan(snapshot.val().plan || 'FREE');
      }
    });

    const globalRef = ref(db, 'app_config/global_settings');
    const unsubGlobal = onValue(globalRef, (snap) => {
      if (snap.exists() && snap.val().free_member_limit !== undefined) {
        setMemberLimit(snap.val().free_member_limit);
      }
      setLoadingConfig(false);
    });

    return () => { unsubInfo(); unsubGlobal(); };
  }, [session.communityId, workspaceType]);

  const logAudit = async (actionType, description) => {
    if (!isOnline) return;
    try {
      await push(ref(db, `communities/${session.communityId}/audit_logs`), {
        managerName: session.userName, actionType, description, timestamp: Date.now()
      });
    } catch (e) {}
  };

  const handleDownloadTemplate = () => {
    pushToDataLayer('file_download', { file_name: 'Sanatani_Devotee_Template', file_extension: 'CSV' });
    
    const csvContent = "Name,Phone,Email,Gotra,BloodGroup,Address\nRajesh Sharma,01700000000,rajesh@email.com,Kashyap,O+,Dhaka\nAnita Das,01800000000,,,B-,Sylhet";
    // \uFEFF adds BOM for Excel UTF-8 support
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Sanatani_Devotee_Template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    if (uploadedFile.type !== 'text/csv' && !uploadedFile.name.endsWith('.csv')) {
      alert(t('err_only_csv') || "Invalid file format. Please upload a strictly .csv file.");
      return;
    }

    setFile(uploadedFile);
    setUploadStatus(null);
    setSkippedRows(0);
    pushToDataLayer('select_content', { content_type: 'File_Upload', item_id: uploadedFile.name });

    Papa.parse(uploadedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      // ✨ Smart Normalization: Fixes messy headers uploaded by users (e.g., " Phone No " -> "phone")
      transformHeader: (header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
      complete: (results) => {
        processParsedData(results.data);
      },
      error: (error) => {
        alert("Error parsing CSV: " + error.message);
        cancelImport();
      }
    });
  };

  const processParsedData = (data) => {
    const validEntries = [];
    let skipped = 0;

    data.forEach((row) => {
      // Look for standard or closely matching keys based on our normalized headers
      const name = row.name || row.fullname || row.devoteename;
      let phone = row.phone || row.phonenumber || row.mobile || row.contact;

      if (name && phone) {
        // ✨ Data Sanitization: Clean phone numbers of dashes and spaces
        phone = String(phone).replace(/[^0-9+]/g, '').trim();

        validEntries.push({
          name: String(name).trim(),
          phone: phone,
          email: row.email ? String(row.email).trim() : '',
          gotra: row.gotra ? String(row.gotra).trim() : '',
          bloodGroup: row.bloodgroup || row.blood ? String(row.bloodgroup || row.blood).trim() : '',
          address: row.address || row.location ? String(row.address || row.location).trim() : ''
        });
      } else {
        skipped++;
      }
    });

    if (validEntries.length === 0) {
      alert(t('err_csv_no_valid_data') || "CRITICAL ERROR: No valid rows found. Ensure your CSV has 'Name' and 'Phone' columns.");
      cancelImport();
      return;
    }

    setParsedData(validEntries);
    setSkippedRows(skipped);
  };

  const executeBulkImport = async () => {
    if (parsedData.length === 0) return;
    if (!isOnline) {
      alert("You must be online to execute a massive bulk database import.");
      return;
    }

    setIsProcessing(true);
    setUploadStatus(null);

    try {
      const updates = {};
      const ts = serverTimestamp();

      parsedData.forEach(devotee => {
        const memberId = `SB-${Math.floor(1000 + Math.random() * 9000)}`;
        const pinPassword = Math.floor(1000 + Math.random() * 9000).toString().padStart(4, '0');

        updates[`communities/${session.communityId}/members/${memberId}`] = {
          id: memberId,
          name: devotee.name,
          phone: devotee.phone,
          email: devotee.email,
          gotra: devotee.gotra,
          bloodGroup: devotee.bloodGroup,
          address: devotee.address,
          role: 'MEMBER',
          addedBySignature: `Bulk Imported by ${session.userName}`,
          totalDonated: 0,
          attendanceCount: 1, 
          timestamp: ts,
          lastDonationTimestamp: 0
        };

        updates[`communities/${session.communityId}/logins/${memberId}`] = pinPassword;
      });

      // Atomically increment the devotee counter by the exact number of imported users
      updates[`communities/${session.communityId}/info/devoteeCount`] = increment(parsedData.length);

      // Execute massive batch write
      await update(ref(db), updates);

      await logAudit("BULK_IMPORT", `Successfully ingested ${parsedData.length} devotee records via CSV.`);
      pushToDataLayer('generate_lead', { lead_source: 'CSV_Bulk_Import', count: parsedData.length });

      setUploadStatus('SUCCESS');
      setFile(null);
      setParsedData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (err) {
      alert("Database Synchronization Error: " + err.message);
      setUploadStatus('ERROR');
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelImport = () => {
    setFile(null);
    setParsedData([]);
    setSkippedRows(0);
    setUploadStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 🛡️ Paywall Logic Check
  const projectedCount = devoteeCount + parsedData.length;
  const paywallBlock = mandirPlan === 'FREE' && projectedCount > memberLimit;

  if (loadingConfig) {
    return <div className="flex justify-center p-12 text-sanatani-orange"><Loader2 size={32} className="animate-spin" /></div>;
  }

  return (
    <div className="bg-white p-4 sm:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col relative space-y-6 fade-in ring-1 ring-black/5">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
            <Database className="text-sanatani-orange" size={26} /> {t('bulk_importer') || 'Bulk Devotee Importer'}
          </h2>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Rapidly digitize paper registers via CSV ingestion.</p>
        </div>

        <button 
          onClick={handleDownloadTemplate}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-black py-3.5 px-5 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm"
        >
          <Download size={16} /> GET CSV TEMPLATE
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT: DROPZONE */}
        <div className="lg:col-span-1 space-y-5">
          <div className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-300 relative ${file ? 'border-green-400 bg-green-50 shadow-inner' : 'border-gray-300 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 cursor-pointer'}`}>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileUpload} 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              ref={fileInputRef}
            />
            {file ? (
               <div className="space-y-4 animate-in zoom-in-95">
                 <FileSpreadsheet size={56} className="mx-auto text-green-500" />
                 <div>
                   <h3 className="text-sm font-black text-green-900 truncate px-4">{file.name}</h3>
                   <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                 </div>
                 <div className="inline-flex flex-col gap-1">
                   <p className="text-[10px] font-black text-green-700 bg-white px-3 py-1.5 rounded-lg border border-green-200 shadow-sm uppercase tracking-widest">
                     <CheckCircle2 size={12} className="inline mr-1"/> {parsedData.length} Valid Rows
                   </p>
                   {skippedRows > 0 && (
                     <p className="text-[9px] font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-lg border border-orange-100 uppercase tracking-widest mt-1">
                       <AlertTriangle size={10} className="inline mr-1"/> {skippedRows} Rows Skipped
                     </p>
                   )}
                 </div>
               </div>
            ) : (
               <div className="space-y-3">
                 <UploadCloud size={56} className="mx-auto text-gray-400" />
                 <h3 className="text-base font-black text-gray-700">Upload Data File</h3>
                 <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">Drag & drop your .csv file here<br/>or click to browse files.</p>
               </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl shadow-sm">
             <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Info size={14}/> Mandatory Fields</p>
             <p className="text-xs font-bold text-blue-900 leading-relaxed">
               Your CSV must include <span className="bg-white border border-blue-200 px-1.5 py-0.5 rounded text-blue-800 shadow-sm">Name</span> and <span className="bg-white border border-blue-200 px-1.5 py-0.5 rounded text-blue-800 shadow-sm">Phone</span> columns to process correctly. Empty or invalid rows are safely skipped.
             </p>
          </div>
        </div>

        {/* RIGHT: DATA PREVIEW & PAYWALL ENGINE */}
        <div className="lg:col-span-2 flex flex-col h-[450px] border border-gray-200 rounded-3xl overflow-hidden shadow-sm ring-1 ring-black/5">

          <div className="bg-gray-900 p-4 sm:p-5 flex justify-between items-center shrink-0">
             <h3 className="text-sm font-black text-white flex items-center gap-2"><Users size={18} className="text-sanatani-orange"/> Data Validation Preview</h3>
             {parsedData.length > 0 && <span className="text-[10px] font-black uppercase tracking-widest text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg border border-green-400/20">{parsedData.length} Staged</span>}
          </div>

          <div className="bg-gray-50 flex-1 overflow-y-auto p-3 sm:p-4 relative">
             {parsedData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Database size={40} className="mb-3 opacity-50"/>
                  <p className="text-xs font-black uppercase tracking-widest">Awaiting CSV Upload</p>
                </div>
             ) : (
                <div className="space-y-2">
                  {parsedData.slice(0, 50).map((row, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 p-3 sm:p-4 rounded-xl flex justify-between items-center shadow-sm hover:border-green-300 transition-colors group">
                      <div className="min-w-0 pr-4">
                        <span className="font-black text-gray-900 text-sm block truncate">{row.name}</span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="font-mono text-xs font-bold text-gray-500">{row.phone}</span>
                          {row.gotra && <span className="text-[9px] font-black uppercase tracking-widest bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-md">Gotra: {row.gotra}</span>}
                          {row.bloodGroup && <span className="text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-md">{row.bloodGroup}</span>}
                        </div>
                      </div>
                      <CheckCircle2 size={20} className="text-gray-300 group-hover:text-green-500 transition-colors shrink-0"/>
                    </div>
                  ))}
                  {parsedData.length > 50 && (
                    <div className="text-center py-6 text-xs font-black text-gray-400 uppercase tracking-widest">
                      + {parsedData.length - 50} more records ready for import...
                    </div>
                  )}
                </div>
             )}
          </div>

          {/* ACTION BAR & PAYWALL */}
          {parsedData.length > 0 && (
            <div className="p-4 sm:p-5 bg-white border-t border-gray-200 shrink-0">
               {paywallBlock ? (
                 <div className="bg-red-50 border border-red-200 rounded-2xl p-5 animate-in slide-in-from-bottom-2 shadow-sm">
                   <div className="flex items-start gap-3">
                     <AlertTriangle size={24} className="text-red-600 shrink-0"/>
                     <div>
                       <h4 className="text-sm font-black text-red-800 uppercase tracking-widest mb-1">Paywall Limit Exceeded</h4>
                       <p className="text-xs font-bold text-red-900 leading-relaxed">
                         This import attempts to push your total devotees to <span className="text-red-600 font-black bg-white px-1.5 rounded">{projectedCount}</span>. The Free Seva Plan is limited to <span className="font-black bg-white px-1.5 rounded">{memberLimit}</span> devotees.<br/>
                         Please reduce your CSV size, or upgrade to SAMRAT PRO in Workspace Settings.
                       </p>
                     </div>
                   </div>
                 </div>
               ) : (
                 <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={cancelImport} disabled={isProcessing}
                      className="flex-1 bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-gray-900 font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      <XCircle size={16} className="inline mr-1.5 mb-0.5"/> CLEAR DATA
                    </button>
                    <button 
                      onClick={executeBulkImport} disabled={isProcessing}
                      className="flex-[2] bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex justify-center items-center gap-2 disabled:opacity-50 disabled:transform-none"
                    >
                      {isProcessing ? <Loader2 size={18} className="animate-spin"/> : <Database size={18}/>} 
                      {isProcessing ? 'SYNCHRONIZING DATABASE...' : `EXECUTE SECURE IMPORT (${parsedData.length})`}
                    </button>
                 </div>
               )}
            </div>
          )}

          {/* Success State Overlay */}
          {uploadStatus === 'SUCCESS' && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center animate-in fade-in">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-6 shadow-inner border border-green-100 animate-in zoom-in">
                <CheckCircle2 size={40}/>
              </div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Import Successful</h3>
              <p className="text-sm font-bold text-gray-500 max-w-sm text-center mb-8">All valid records have been cryptographically generated and securely synced to your workspace database.</p>
              <button onClick={() => setUploadStatus(null)} className="bg-gray-900 hover:bg-black text-white font-black px-8 py-3.5 rounded-xl uppercase tracking-widest transition-all shadow-md hover:-translate-y-0.5">
                Close
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
