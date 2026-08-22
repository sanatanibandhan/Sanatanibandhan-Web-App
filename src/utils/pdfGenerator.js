import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode'; 

// ==========================================
// BRAND COLORS (Enterprise Palette)
// ==========================================
const SAFFRON = [234, 88, 12];  
const GREEN = [22, 163, 74];    
const BLUE = [37, 99, 235];     
const RED = [220, 38, 38];      
const GRAY = [107, 114, 128];   
const LIGHT_GRAY = [243, 244, 246]; 
const DARK_SLATE = [30, 41, 59];

// ==========================================
// UTILITY: FORMATTERS & SMART EXPORT
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

// ✨ DYNAMIC LOGO RESOLUTION LOGIC
// Checks if a custom workspace logo is saved in localStorage. If not, falls back to the CRM default.
const getWorkspaceLogo = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb_logo_')) {
        const customLogo = localStorage.getItem(key);
        if (customLogo) return customLogo;
      }
    }
  } catch (e) {
    console.error("Error reading custom logo from cache", e);
  }
  return '/icon-512x512.png'; // Default CRM Logo Fallback
};

// Smart Mobile Native Viewer & Share Engine
const smartPdfExport = async (doc, fileName) => {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile && navigator.share) {
    try {
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: fileName,
          files: [file]
        });
        return;
      }
    } catch (e) {
      console.error("Native share cancelled or failed, falling back to save:", e);
    }
  }

  doc.save(fileName);
};

// ✨ TRUE CLIENT-SIDE OFFLINE QR GENERATOR (Calculated on Device CPU)
const drawOfflineQR = async (doc, text, x, y, size) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(text, { 
      errorCorrectionLevel: 'H',
      margin: 0, 
      width: 300,
      color: {
        dark: '#0f172a', // Enterprise Slate
        light: '#ffffff'
      }
    });
    doc.addImage(qrDataUrl, 'PNG', x, y, size, size);
  } catch (e) {
    doc.setDrawColor(200, 200, 200);
    doc.rect(x, y, size, size);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("QR ERROR", x + size / 2, y + size / 2, { align: 'center' });
  }
};

// ==========================================
// ✨ CLOUD-TO-CACHE DYNAMIC SHLOKA ENGINE
// ==========================================
const getDynamicPdfShloka = () => {
  try {
    const cached = localStorage.getItem('sb_daily_shloka');
    if (cached) {
      const { data } = JSON.parse(cached);
      if (data && data.meaning && data.source) {
        let text = `"${data.meaning}"`;
        if (text.length > 80) text = text.substring(0, 77) + '..."';
        return `${text} - ${data.source}`;
      }
    }
  } catch (e) {
    console.error("Cache read error for PDF Shloka", e);
  }

  const VAULT = [
    { source: "Rig Veda", text: '"Walk together, let your minds be in harmony."' },
    { source: "Bhagavad Gita", text: '"You have a right to your duty, but not the fruits."' },
    { source: "Mundaka Upanishad", text: '"Truth alone triumphs; not falsehood."' },
    { source: "Maha Upanishad", text: '"For the noble-hearted, the world is one family."' },
    { source: "Bhagavad Gita", text: '"Elevate yourself through the power of your mind."' }
  ];

  const item = VAULT[new Date().getDate() % VAULT.length];
  return `${item.text} - ${item.source}`;
};

// ==========================================
// HELPER: ENTERPRISE FOOTER WITH DOC HASH
// ==========================================
const addSanataniFooter = (doc, docHash) => {
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;

  doc.setDrawColor(230, 230, 230);
  doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);

  // System Integrity Hash
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text(`DOC REF: ${docHash}`, 14, pageHeight - 10);

  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.text("Generated securely via Sanatani Bandhan Enterprise", pageWidth - 14, pageHeight - 10, { align: "right" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("© TrackIQ Academy. All rights reserved.", pageWidth / 2, pageHeight - 5, { align: "center" });
};

// ==========================================
// HELPER: HEADER (With Dynamic Logo Logic)
// ==========================================
const addSanataniHeader = (doc, orgName, reportTitle, location = 'Headquarters', phone = '', customShloka = getDynamicPdfShloka()) => {
  const pageWidth = doc.internal.pageSize.width;
  const logoSrc = getWorkspaceLogo();

  // Logo Attempt with Fallback Ring
  try {
    doc.addImage(logoSrc, 'PNG', 14, 12, 14, 14);
  } catch (error) {
    doc.setFillColor(...SAFFRON);
    doc.circle(21, 19, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.text("SB", 21, 21, { align: "center" });
  }

  // Workspace Name 
  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(16);
  doc.setFont("times", "bold");
  const formattedTitle = (orgName || "SANATANI WORKSPACE").toUpperCase();
  doc.text(formattedTitle, 32, 19, { maxWidth: 100 });

  // Location Details
  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let details = [];
  if (location) details.push(`Loc: ${location}`);
  if (phone) details.push(`Ph: ${phone}`);
  if (details.length > 0) {
    doc.text(details.join(' | '), 32, 24);
  }

  // Shloka
  doc.setTextColor(140, 140, 140);
  doc.setFontSize(7.5);
  doc.setFont("times", "italic");
  doc.text(customShloka, pageWidth - 14, 16, { align: "right", maxWidth: 85 });

  // Timestamp
  const dateStr = new Date().toLocaleString('en-GB');
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Generated: ${dateStr}`, pageWidth - 14, 24, { align: "right" });

  // Title Ribbon
  const ribbonColor = reportTitle.includes('EXPENSE') || reportTitle.includes('AUDIT') ? RED : reportTitle.includes('RECEIPT') || reportTitle.includes('DONATION') ? GREEN : SAFFRON;
  doc.setFillColor(...ribbonColor);
  doc.rect(14, 30, pageWidth - 28, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(reportTitle.toUpperCase(), pageWidth / 2, 36, { align: "center", letterSpacing: 2 });
};

const addThankYouMessage = (doc, communityName, finalY) => {
  const pageWidth = doc.internal.pageSize.width;
  doc.setTextColor(...SAFFRON);
  doc.setFontSize(11);
  doc.setFont("times", "bolditalic");
  doc.text(`Namaskar!`, pageWidth / 2, finalY + 12, { align: "center" });

  doc.setTextColor(...GRAY);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Thank you for your generous contribution to ${communityName || 'our community'}.\nYour selfless support ensures our prosperity and the preservation of our Dharma.`, pageWidth / 2, finalY + 18, { align: "center", maxWidth: pageWidth - 30 });

  doc.setFont("times", "bolditalic");
  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(10);
  doc.text(`"Dharmo Rakshati Rakshitah"`, pageWidth / 2, finalY + 28, { align: "center" });
};

// ==========================================
// 1. LOGIN CREDENTIALS WITH OFFLINE QR
// ==========================================
export const generateLoginCredentialsPdf = async (communityName, name, memberId, pin, generatedBy) => {
  const doc = new jsPDF({ format: 'a5' }); 
  const pageWidth = doc.internal.pageSize.width;
  const docHash = generateDocumentHash();

  addSanataniHeader(doc, communityName, "CONFIDENTIAL LOGIN CREDENTIALS");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Namaskar ${name},`, 14, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Welcome to ${communityName || 'the platform'}. Your secure profile`, 14, 55);
  doc.text("has been created. Please keep this document highly secure.", 14, 61);

  // ID Box
  doc.setFillColor(...BLUE);
  doc.rect(14, 70, 75, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("YOUR OFFICIAL ID", 18, 78);
  doc.setFontSize(14);
  doc.text(memberId, 18, 89);

  // PIN Box
  doc.setFillColor(...SAFFRON);
  doc.rect(14, 98, 75, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text("SECURE LOGIN PIN", 18, 106);
  doc.setFontSize(15);
  doc.text(pin, 18, 117);

  const loginPayload = JSON.stringify({ action: "autologin", id: memberId, pin: pin, workspace: communityName || "Default" });
  await drawOfflineQR(doc, loginPayload, 95, 70, 45);

  doc.setTextColor(...GRAY);
  doc.setFontSize(7);
  doc.text("Scan to Auto-Login", 117.5, 120, { align: "center" });

  doc.setTextColor(...RED);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("SECURITY WARNING: Admin staff will never ask for your PIN.", pageWidth / 2, 135, { align: "center" });

  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text(`Authorized By: ${generatedBy}`, 14, 145);

  addSanataniFooter(doc, docHash);

  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_');
  await smartPdfExport(doc, `${cleanName}-Login_Credentials-${getFormattedFileNameDate()}.pdf`);
};

// ==========================================
// 2. STRIPE-STYLE RECEIPT & VOUCHER
// ==========================================
export const generateReceiptPdf = async (...args) => {
  const doc = new jsPDF({ format: 'a5' }); 
  const pageWidth = doc.internal.pageSize.width;
  const docHash = generateDocumentHash();

  let communityName = "Sanatani Workspace";
  let item = {};
  let type = 'INCOME';

  if (args.length === 5 && typeof args[1] === 'number') {
    const [member, amount, note, transId, timestamp] = args;
    item = { id: transId, timestamp, name: member.name, note, amount, collector: "System" };
  } else {
    [communityName, item, type] = args;
  }

  const isIncome = type === 'INCOME';
  const targetName = isIncome ? (item.name || 'User') : (item.itemName || 'Expense');
  const fileName = `${targetName.replace(/\s+/g, '_')}-${isIncome ? 'Donation_Receipt' : 'Expense_Voucher'}-${getFormattedFileNameDate()}.pdf`;

  addSanataniHeader(doc, communityName, isIncome ? "OFFICIAL DONATION RECEIPT" : "OFFICIAL EXPENSE VOUCHER");

  doc.setFontSize(14);
  doc.setTextColor(...DARK_SLATE);
  doc.setFont("helvetica", "bold");
  doc.text(isIncome ? "RECEIPT" : "VOUCHER", pageWidth - 14, 48, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${new Date(item.timestamp).toLocaleDateString('en-GB')}`, pageWidth - 14, 53, { align: "right" });

  const cleanReceiptNo = generateReceiptNumber(item.id);
  doc.text(`No: ${cleanReceiptNo}`, pageWidth - 14, 57, { align: "right" });

  doc.setDrawColor(230, 230, 230);
  doc.line(14, 62, pageWidth - 14, 62);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text(isIncome ? "AMOUNT CONTRIBUTED" : "AMOUNT DISBURSED", 14, 71);

  doc.setFontSize(24);
  doc.setTextColor(...(isIncome ? GREEN : RED));
  doc.text(`BDT ${item.amount.toLocaleString()}`, 14, 82);

  doc.setFillColor(...(isIncome ? GREEN : RED));
  doc.roundedRect(14, 88, 22, 5.5, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text(isIncome ? "RECEIVED" : "CLEARED", 25, 92, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "bold");
  doc.text(isIncome ? "BILLED TO DEVOTEE" : "EVENT / UTSAV", pageWidth - 14, 71, { align: "right" });

  doc.setFontSize(11);
  doc.setTextColor(...DARK_SLATE);
  doc.text(isIncome ? item.name : (item.eventName || 'General Expense'), pageWidth - 14, 78, { align: "right" });

  doc.autoTable({
    startY: 100,
    head: [['Description', 'Amount']],
    body: [
      [isIncome ? (item.note || 'General Community Chanda') : (item.itemName || 'Service Cost'), `BDT ${item.amount.toLocaleString()}`]
    ],
    theme: 'plain', 
    headStyles: { textColor: [100, 100, 100], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { textColor: [50, 50, 50], fontSize: 9.5, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    didDrawCell: (data) => {
      if (data.row.section === 'head') {
        doc.setDrawColor(220, 220, 220);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    }
  });

  const finalY = doc.lastAutoTable.finalY || 120;

  if (isIncome) {
    addThankYouMessage(doc, communityName, finalY);
  } else {
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    const authName = item.collectedBy || item.collector || item.loggedBy || item.involvedPerson || 'System';
    doc.text(`Authorized By: ${authName}`, 14, finalY + 15);
  }

  addSanataniFooter(doc, docHash);
  await smartPdfExport(doc, fileName);
};

// ==========================================
// 3. MASTER TREASURY REPORT
// ==========================================
export const generateTreasuryReportPdf = async (displayList, activeTab, communityName, totalAmount, dateRange) => {
  const doc = new jsPDF();
  const docHash = generateDocumentHash();
  addSanataniHeader(doc, communityName, `MASTER ${activeTab} REPORT`);

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(14, 44, 182, 18, 2, 2, 'F');

  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  let dateText = "All Time Record";
  if (dateRange.start && dateRange.end) dateText = `${dateRange.start} to ${dateRange.end}`;
  else if (dateRange.start) dateText = `From ${dateRange.start}`;
  else if (dateRange.end) dateText = `Until ${dateRange.end}`;

  doc.text(`Audit Period: ${dateText}`, 20, 52);

  doc.setFontSize(12);
  doc.setTextColor(...(activeTab === 'INCOME' ? GREEN : RED));
  doc.text(`Net ${activeTab}: BDT ${totalAmount.toLocaleString()}`, 190, 55, { align: "right" });

  const tableColumn = activeTab === 'INCOME' ? ["Date", "Receipt No", "Donor Name", "Amount", "Auth"] : ["Date", "Event", "Item/Service", "Amount", "Auth"];
  const tableRows = [];

  displayList.forEach(group => {
    group.history.forEach(item => {
      const date = new Date(item.timestamp).toLocaleDateString();
      const auth = (item.collectedBy || item.collector || item.loggedBy || item.involvedPerson || 'System').split(' ')[0];
      const receiptNo = generateReceiptNumber(item.id);

      if (activeTab === 'INCOME') tableRows.push([date, receiptNo, item.name, `BDT ${item.amount}`, auth]);
      else tableRows.push([date, item.eventName, item.itemName, `BDT ${item.amount}`, auth]);
    });
  });

  doc.autoTable({
    startY: 68,
    head: [tableColumn],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: activeTab === 'INCOME' ? GREEN : RED, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { top: 68 }
  });

  addSanataniFooter(doc, docHash);
  const cleanComm = communityName ? communityName.replace(/[^a-zA-Z0-9]/g, '_') : "Workspace";
  await smartPdfExport(doc, `${cleanComm}-Treasury_${activeTab}-${getFormattedFileNameDate()}.pdf`);
};

// ==========================================
// 4. DONOR STATEMENT
// ==========================================
export const generateDonorStatementPdf = async (communityName, donorData) => {
  const doc = new jsPDF();
  const docHash = generateDocumentHash();
  addSanataniHeader(doc, communityName, "DONOR CONTRIBUTION STATEMENT");

  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Devotee Profile: ${donorData.name}`, 14, 48);

  const tableColumn = ["Date", "Receipt No", "Amount", "Note"];
  const tableRows = [];

  donorData.logs.forEach(log => {
    const date = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : 'Recent';
    const receiptNo = generateReceiptNumber(log.id);
    tableRows.push([date, receiptNo, `BDT ${log.amount}`, log.note || 'General Chanda']);
  });

  doc.autoTable({
    startY: 54,
    head: [tableColumn],
    body: tableRows,
    headStyles: { fillColor: SAFFRON, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 2: { textColor: GREEN, fontStyle: 'bold' } },
    bodyStyles: { fontSize: 8.5 },
    theme: 'striped',
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  const finalY = doc.lastAutoTable.finalY || 54;

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(doc.internal.pageSize.width - 80, finalY + 8, 66, 12, 1, 1, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text(`Lifetime Donated: BDT ${donorData.total.toLocaleString()}`, doc.internal.pageSize.width - 17, finalY + 16, { align: "right" });

  addThankYouMessage(doc, communityName, finalY + 28);
  addSanataniFooter(doc, docHash);

  const cleanDonor = donorData.name.replace(/[^a-zA-Z0-9]/g, '_');
  await smartPdfExport(doc, `${cleanDonor}-Contribution_Statement-${getFormattedFileNameDate()}.pdf`);
};

// ==========================================
// 5. UTSAV EXPENSE STATEMENT
// ==========================================
export const generateUtsavStatementPdf = async (communityName, eventName, expenseLogs, totalSpent) => {
  const doc = new jsPDF();
  const docHash = generateDocumentHash();
  addSanataniHeader(doc, communityName, "EVENT EXPENSE AUDIT");

  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Event / Utsav: ${eventName}`, 14, 48);

  const tableColumn = ["Date", "Item / Seva", "Cost", "Handled By"];
  const tableRows = [];

  expenseLogs.forEach(log => {
    const date = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : 'Recent';
    tableRows.push([date, log.title || log.itemName, `BDT ${log.amount}`, log.recordedBy || log.involvedPerson || 'System']);
  });

  doc.autoTable({
    startY: 54,
    head: [tableColumn],
    body: tableRows,
    headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 2: { textColor: RED, fontStyle: 'bold' } },
    bodyStyles: { fontSize: 8.5 },
    theme: 'striped',
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  const finalY = doc.lastAutoTable.finalY || 54;

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(doc.internal.pageSize.width - 80, finalY + 8, 66, 12, 1, 1, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text(`Total Event Expense: BDT ${totalSpent.toLocaleString()}`, doc.internal.pageSize.width - 17, finalY + 16, { align: "right" });

  addSanataniFooter(doc, docHash);
  const cleanEvent = eventName.replace(/[^a-zA-Z0-9]/g, '_');
  await smartPdfExport(doc, `${cleanEvent}-Event_Expense-${getFormattedFileNameDate()}.pdf`);
};

// ==========================================
// 6. EVENT MEETING & ATTENDANCE REPORT PDF
// ==========================================
export const generateMeetingReportPDF = async (ev, members, communityName, workspaceType = 'Workspace') => {
  const doc = new jsPDF();
  const docHash = generateDocumentHash();

  addSanataniHeader(doc, communityName, "OFFICIAL MEETING & ATTENDANCE REPORT", workspaceType);

  const totalEligible = members.length;
  const totalAttended = ev.attendance ? Object.values(ev.attendance).filter(s => s === 'PRESENT').length : 0;
  const attendanceRate = totalEligible > 0 ? Math.round((totalAttended / totalEligible) * 100) : 0;

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(14, 44, 182, 22, 2, 2, 'F');

  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Event: ${ev.title}`, 18, 52);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`Date: ${ev.dateStr} | Time: ${ev.timeStr} | Loc: ${ev.location || 'N/A'}`, 18, 60);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(attendanceRate > 50 ? GREEN : RED));
  doc.text(`${attendanceRate}%`, 184, 54, { align: "right" });
  doc.setFontSize(7);
  doc.text("ATTENDANCE YIELD", 184, 59, { align: "right" });

  let finalY = 74;

  if (ev.meetingMinutes) {
    doc.setFontSize(11);
    doc.setTextColor(...DARK_SLATE);
    doc.setFont("helvetica", "bold");
    doc.text("Meeting Minutes & Key Decisions:", 14, finalY);

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    const splitMinutes = doc.splitTextToSize(ev.meetingMinutes, doc.internal.pageSize.width - 28);
    doc.text(splitMinutes, 14, finalY + 6);
    finalY += 12 + (splitMinutes.length * 5);
  }

  const tableBody = members.map(m => {
    const status = ev.attendance?.[m.id] || 'UNMARKED';
    return [m.name, m.phone || m.id, status];
  });

  doc.autoTable({
    startY: finalY + 6,
    head: [['Devotee Name', 'Identity / Phone', 'Attendance Status']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 2: { fontStyle: 'bold' } },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 2) {
        if (data.cell.raw === 'PRESENT') data.cell.styles.textColor = GREEN; 
        if (data.cell.raw === 'ABSENT') data.cell.styles.textColor = RED; 
        if (data.cell.raw === 'UNMARKED') data.cell.styles.textColor = GRAY; 
      }
    }
  });

  addSanataniFooter(doc, docHash);
  await smartPdfExport(doc, `${ev.title.replace(/[^a-zA-Z0-9]/g, '_')}_Meeting_Report.pdf`);
};

// ==========================================
// 7. POLLS REPORT
// ==========================================
export const generatePollReportPdf = async (communityName, poll, members, includeVoterNames = true) => {
  const doc = new jsPDF();
  const docHash = generateDocumentHash();
  addSanataniHeader(doc, communityName, "PANCHAYAT POLL INSIGHT REPORT");

  const totalVotes = poll.votedUsers ? Object.keys(poll.votedUsers).length : 0;
  const options = Object.keys(poll.options || {}).map(k => ({ id: k, ...poll.options[k] }));

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(14, 44, 182, 18, 2, 2, 'F');

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_SLATE);
  doc.text(`Resolution: ${poll.title}`, 20, 52, { maxWidth: 140 });

  doc.setFontSize(12);
  doc.setTextColor(...BLUE);
  doc.text(`${totalVotes} Votes Cast`, 190, 54, { align: "right" });

  const tableRows = options.map(opt => {
    const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
    return [opt.text, opt.votes, `${percentage}%`];
  });

  tableRows.sort((a,b) => b[1] - a[1]);

  doc.autoTable({
    startY: 68,
    head: [["Voting Option", "Votes Received", "Consensus Yield"]],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 2: { fontStyle: 'bold', halign: 'right' }, 1: { halign: 'center' } },
  });

  let currentY = doc.lastAutoTable.finalY + 12;

  if (poll.adminNote) {
    doc.setFillColor(239, 246, 255); 
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(14, currentY, 182, 24, 2, 2, 'FD');

    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("OFFICIAL COMMITTEE DECISION:", 20, currentY + 8);

    doc.setTextColor(...DARK_SLATE);
    doc.setFont("helvetica", "normal");
    const splitNote = doc.splitTextToSize(poll.adminNote, 170);
    doc.text(splitNote, 20, currentY + 14);
    currentY += 36;
  }

  if (includeVoterNames && poll.votedUsers) {
    doc.setTextColor(...RED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Cryptographic Voter Ledger (Audit Trail):", 14, currentY);

    const auditRows = [];
    Object.entries(poll.votedUsers).forEach(([voterId, optId]) => {
      const member = members.find(m => m.id === voterId);
      const name = member ? member.name : 'Unknown User';
      const optText = poll.options[optId]?.text || optId;
      auditRows.push([name, voterId, optText]);
    });

    doc.autoTable({
      startY: currentY + 4,
      head: [["Devotee Name", "Secure ID", "Option Selected"]],
      body: auditRows,
      theme: 'grid',
      headStyles: { fillColor: GRAY, textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 }
    });
  }

  addSanataniFooter(doc, docHash);
  const cleanComm = communityName ? communityName.replace(/[^a-zA-Z0-9]/g, '_') : "Workspace";
  await smartPdfExport(doc, `${cleanComm}-Poll_Report-${getFormattedFileNameDate()}.pdf`);
};

// ==========================================
// 8. SECURITY AUDIT REPORT
// ==========================================
export const generateSecurityAuditPdf = async (communityName, logs) => {
  const doc = new jsPDF();
  const docHash = generateDocumentHash();
  addSanataniHeader(doc, communityName, "SECURITY & ACTIVITY AUDIT");

  const tableRows = logs.map(log => [
    new Date(log.timestamp).toLocaleString(),
    log.managerName || "System",
    log.actionType || "",
    log.description || ""
  ]);

  doc.autoTable({
    startY: 48,
    head: [["Date & Time", "Authorized User", "Action Triggered", "System Description"]],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: { 2: { fontStyle: 'bold' } },
    styles: { fontSize: 8, cellPadding: 3 }
  });

  addSanataniFooter(doc, docHash);
  const cleanComm = communityName ? communityName.replace(/[^a-zA-Z0-9]/g, '_') : "Workspace";
  await smartPdfExport(doc, `${cleanComm}-Security_Audit-${getFormattedFileNameDate()}.pdf`);
};

// ==========================================
// 9. ACTIVITY & FINANCIAL REPORT (Devotee Grid)
// ==========================================
export const generateUserActivitiesPDF = async (communityName, member, userTransactions, filterType = 'ALL', dateRange = { start: '', end: '' }) => {
  const doc = new jsPDF();
  const docHash = generateDocumentHash();
  const fileName = `${member.name.replace(/\s+/g, '_')}-Activity_Report-${getFormattedFileNameDate()}.pdf`;

  addSanataniHeader(doc, communityName, "ACTIVITY & FINANCIAL REPORT");

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(14, 44, 182, 18, 2, 2, 'F');

  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Devotee: ${member.name} (${member.id})`, 20, 52);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  let filterText = `Filter: ${filterType}`;
  if (dateRange.start || dateRange.end) filterText += ` | Date: ${dateRange.start || 'Start'} to ${dateRange.end || 'End'}`;
  doc.text(filterText, 20, 57);

  const tableData = userTransactions.map(log => {
    const receiptNo = generateReceiptNumber(log.id);
    return [
      new Date(log.timestamp).toLocaleString('en-GB'),
      receiptNo,
      log.note || 'General Donation',
      `BDT ${log.amount.toLocaleString()}`,
      log.collector?.split(' ')[0] || 'System'
    ];
  });

  doc.autoTable({
    startY: 68,
    head: [["Date & Time", "Receipt No", "Particulars", "Amount", "Auth"]],
    body: tableData,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 3.5 },
    headStyles: { fillColor: SAFFRON, textColor: 255, fontStyle: 'bold' } 
  });

  addSanataniFooter(doc, docHash);
  await smartPdfExport(doc, fileName);
};

// ==========================================
// 10. ✨ BULK EVENT TICKETS PDF (NEW FIX)
// ==========================================
export const generateBulkEventTicketsPDF = async (event, invitedMembers, communityName) => {
  const doc = new jsPDF({ format: 'a4' });
  const docHash = generateDocumentHash();
  addSanataniHeader(doc, communityName, `EVENT PASSES: ${event.title}`);

  doc.setTextColor(...DARK_SLATE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Event: ${event.title} (${event.dateStr || 'Date TBA'})`, 14, 48);
  doc.text(`Venue: ${event.location || 'Premises'}`, 14, 54);

  const tableData = invitedMembers.map(m => [
    m.id || 'PASS',
    m.name || 'Devotee',
    m.phone || 'N/A',
    m.category || 'MEMBER',
    m.checkedIn ? 'CHECKED IN' : 'ISSUED'
  ]);

  doc.autoTable({
    startY: 62,
    head: [["Pass ID", "Attendee Name", "Phone", "Category", "Status"]],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: SAFFRON, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 3.5 }
  });

  addSanataniFooter(doc, docHash);
  await smartPdfExport(doc, `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}_Tickets-${getFormattedFileNameDate()}.pdf`);
};
