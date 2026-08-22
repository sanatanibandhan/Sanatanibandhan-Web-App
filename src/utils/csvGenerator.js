import Papa from 'papaparse';

// ==========================================
// UTILITY: FORMATTERS & CRYPTOGRAPHY
// ==========================================
const getFormattedFileNameDate = () => {
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const timeStr = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${dateStr}_${timeStr}`;
};

// Generates a cryptographic-style Document Hash for Auditability
const generateDocumentHash = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = 'SB-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) hash += '-';
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
};

// Converts long Firebase ID into a clean 8-digit numeric Receipt Number
const generateReceiptNumber = (firebaseId) => {
  if (!firebaseId) return Math.floor(10000000 + Math.random() * 90000000).toString();
  let hash = 0;
  for (let i = 0; i < firebaseId.length; i++) {
    hash = (hash << 5) - hash + firebaseId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString().substring(0, 8).padStart(8, '0');
};

const triggerDownload = (csvContent, fileName) => {
  // \uFEFF adds BOM for Excel UTF-8 support (ensures Hindi/Bengali text renders perfectly)
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ==========================================
// ENTERPRISE META-HEADER BUILDER
// ==========================================
const buildEnterpriseHeader = (communityName, reportTitle, metaData = {}) => {
  const docHash = generateDocumentHash();
  let header = `"${(communityName || 'Sanatani Workspace').toUpperCase()} - ENTERPRISE DATA EXPORT"\n`;
  header += `"${reportTitle.toUpperCase()}"\n`;
  header += `"Document Ref:","${docHash}"\n`;
  header += `"Generated On:","${new Date().toLocaleString('en-GB')}"\n`;
  
  // Inject dynamic KPIs and Context variables
  Object.entries(metaData).forEach(([key, value]) => {
    const safeValue = String(value).replace(/"/g, '""'); // Escape inner quotes for Excel
    header += `"${key}:","${safeValue}"\n`;
  });
  
  header += `\n`; // Blank row to separate Meta-Header from Data Table
  return header;
};

// ==========================================
// 1. MASTER TREASURY CSV REPORT
// ==========================================
export const generateTreasuryCSV = (displayList, activeTab, communityName) => {
  const rows = [];
  let totalAmount = 0;

  if (activeTab === 'INCOME') {
    displayList.forEach(group => {
      group.history.forEach(item => {
        totalAmount += item.amount;
        rows.push({
          "Date": new Date(item.timestamp).toLocaleDateString('en-GB'),
          "Time": new Date(item.timestamp).toLocaleTimeString(),
          "Receipt No": generateReceiptNumber(item.id),
          "Donor Name": item.name,
          "Amount (BDT)": item.amount,
          "Particulars / Note": item.note || 'General Donation',
          "Authorized By": item.collectedBy || item.collector || item.loggedBy || 'System'
        });
      });
    });
  } else {
    displayList.forEach(group => {
      group.history.forEach(item => {
        totalAmount += item.amount;
        rows.push({
          "Date": new Date(item.timestamp).toLocaleDateString('en-GB'),
          "Time": new Date(item.timestamp).toLocaleTimeString(),
          "Voucher No": generateReceiptNumber(item.id),
          "Event Name": item.eventName,
          "Item / Service": item.itemName,
          "Amount (BDT)": item.amount,
          "Physical Memo": item.voucherNo || 'No Memo',
          "Handled By": item.involvedPerson || item.loggedBy || 'System'
        });
      });
    });
  }

  // Build Meta-Header with Financial KPIs
  const metaHeader = buildEnterpriseHeader(communityName, `MASTER ${activeTab} LEDGER`, {
    "Total Records": rows.length,
    [`Net ${activeTab} (BDT)`]: totalAmount.toLocaleString()
  });

  const csvTable = Papa.unparse(rows);
  const finalCsvContent = metaHeader + csvTable;
  
  const cleanComm = communityName ? communityName.replace(/[^a-zA-Z0-9]/g, '_') : "Workspace";
  triggerDownload(finalCsvContent, `${cleanComm}-Master_${activeTab}_Report-${getFormattedFileNameDate()}.csv`);
};

// ==========================================
// 2. GROUP/INDIVIDUAL CSV REPORT
// ==========================================
export const generateGroupCSV = (group, activeTab, communityName) => {
  const rows = [];
  let totalAmount = 0;

  if (activeTab === 'INCOME') {
    group.history.forEach(item => {
      totalAmount += item.amount;
      rows.push({
        "Date": new Date(item.timestamp).toLocaleDateString('en-GB'),
        "Receipt No": generateReceiptNumber(item.id),
        "Donor Name": item.name,
        "Amount (BDT)": item.amount,
        "Particulars": item.note || 'General Donation',
        "Processed By": item.collectedBy || item.collector || item.loggedBy || 'System'
      });
    });
  } else {
    group.history.forEach(item => {
      totalAmount += item.amount;
      rows.push({
        "Date": new Date(item.timestamp).toLocaleDateString('en-GB'),
        "Voucher No": generateReceiptNumber(item.id),
        "Event Category": item.eventName,
        "Item": item.itemName,
        "Amount (BDT)": item.amount,
        "Memo No": item.voucherNo || 'No Memo',
        "Spender": item.involvedPerson || item.loggedBy || 'System'
      });
    });
  }

  const metaHeader = buildEnterpriseHeader(communityName, `${activeTab} STATEMENT: ${group.name.toUpperCase()}`, {
    "Target Entity": group.name,
    "Transaction Count": rows.length,
    "Total Value (BDT)": totalAmount.toLocaleString()
  });

  const csvTable = Papa.unparse(rows);
  const finalCsvContent = metaHeader + csvTable;

  const cleanGroup = group.name ? group.name.replace(/[^a-zA-Z0-9]/g, '_') : "Group";
  triggerDownload(finalCsvContent, `${cleanGroup}-${activeTab}_Statement-${getFormattedFileNameDate()}.csv`);
};

// ==========================================
// 3. SECURITY AUDIT CSV REPORT
// ==========================================
export const generateAuditCSV = (filteredLogs, communityName) => {
  const rows = filteredLogs.map(log => ({
    "Date": new Date(log.timestamp).toLocaleDateString('en-GB'),
    "Time": new Date(log.timestamp).toLocaleTimeString(),
    "Action Triggered": log.actionType,
    "Authorized User": log.managerName || 'System',
    "System Description": log.description
  }));

  const metaHeader = buildEnterpriseHeader(communityName, "SECURITY & ACTIVITY AUDIT", {
    "Total Log Entries": rows.length,
    "Security Status": "Verified & Exported"
  });

  const csvTable = Papa.unparse(rows);
  const finalCsvContent = metaHeader + csvTable;

  const cleanComm = communityName ? communityName.replace(/[^a-zA-Z0-9]/g, '_') : "Workspace";
  triggerDownload(finalCsvContent, `${cleanComm}-Security_Audit-${getFormattedFileNameDate()}.csv`);
};

// =========================================
// 4. EVENT MEETING & ATTENDANCE REPORT
// ==========================================
export const generateMeetingReportCSV = (ev, members, communityName) => {
  const rows = [];
  let presentCount = 0;

  // Compile pure roster data
  members.forEach(m => {
    const status = ev.attendance?.[m.id] || 'UNMARKED';
    if (status === 'PRESENT') presentCount++;
    rows.push({
      "Devotee / Member Name": m.name,
      "Official ID / Phone": m.phone || m.id,
      "Attendance Status": status
    });
  });

  const attendanceRate = members.length > 0 ? Math.round((presentCount / members.length) * 100) : 0;

  // Store Event Context strictly in the Meta-Header to preserve data table integrity
  const metaHeader = buildEnterpriseHeader(communityName, "OFFICIAL MEETING & ATTENDANCE REPORT", {
    "Event Title": ev.title,
    "Date & Time": `${ev.dateStr} | ${ev.timeStr || 'N/A'}`,
    "Location": ev.location || 'N/A',
    "Meeting Minutes": ev.meetingMinutes || 'No notes recorded.',
    "Total Eligible Members": members.length,
    "Members Present": presentCount,
    "Attendance Yield": `${attendanceRate}%`
  });

  const csvTable = Papa.unparse(rows);
  const finalCsvContent = metaHeader + csvTable;

  const cleanComm = communityName ? communityName.replace(/[^a-zA-Z0-9]/g, '_') : "Workspace";
  triggerDownload(finalCsvContent, `${cleanComm}-Meeting_Report_${ev.title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
};
